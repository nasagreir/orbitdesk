"use client";

import { useState } from "react";
import {
  Antenna,
  LoaderCircle,
  RotateCcw,
  ShieldAlert,
  Signal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { StarlinkAction, StarlinkDevice } from "@/lib/types";
import {
  formatMbps,
  formatMs,
  formatPct,
  formatRelative,
  formatUptime,
} from "@/lib/format";

const healthStyles = {
  online: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  degraded: "border-amber-300/40 bg-amber-300/10 text-amber-200",
  offline: "border-rose-400/40 bg-rose-400/10 text-rose-300",
  unknown: "border-slate-400/40 bg-slate-400/10 text-slate-300",
};

export function DeviceCard({
  device,
  selected,
  onSelect,
  onActionDone,
}: {
  device: StarlinkDevice;
  selected: boolean;
  onSelect: () => void;
  onActionDone: (message: string) => void;
}) {
  const [pending, setPending] = useState<StarlinkAction | null>(null);

  async function runAction(action: StarlinkAction) {
    setPending(action);
    try {
      const res = await fetch(`/api/devices/${device.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await res.json();
      onActionDone(body.message ?? body.error ?? `${action} finished`);
    } catch (error) {
      onActionDone(
        error instanceof Error ? error.message : `Failed to ${action}`,
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <article
      className={`rounded-2xl border p-4 transition ${
        selected
          ? "border-cyan-400/50 bg-[#0e1a28] shadow-[0_0_0_1px_rgba(34,211,238,0.2)]"
          : "border-white/10 bg-[#0c1622]/75 hover:border-white/20"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-heading text-lg text-white">{device.name}</h3>
            <Badge
              variant="outline"
              className={healthStyles[device.health]}
            >
              {device.health}
            </Badge>
          </div>
          <p className="mt-1 font-mono text-xs text-slate-500">
            {device.hardwareId}
          </p>
        </div>
        <Signal
          className={`size-5 ${
            device.health === "online"
              ? "text-cyan-300"
              : device.health === "degraded"
                ? "text-amber-300"
                : "text-slate-500"
          }`}
        />
      </button>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <Metric label="Downlink" value={formatMbps(device.downlinkMbps)} />
        <Metric label="Uplink" value={formatMbps(device.uplinkMbps)} />
        <Metric label="Latency" value={formatMs(device.latencyMs)} />
        <Metric label="Obstruction" value={formatPct(device.obstructionPct)} />
        <Metric label="Uptime" value={formatUptime(device.uptimeSeconds)} />
        <Metric
          label="Aim"
          value={`${device.azimuthDeg.toFixed(0)}° / ${device.elevationDeg.toFixed(0)}°`}
        />
      </dl>

      {device.alerts.length > 0 && (
        <ul className="mt-4 space-y-2">
          {device.alerts.map((alert) => (
            <li
              key={alert}
              className="flex items-start gap-2 rounded-xl border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-xs text-amber-100"
            >
              <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>{alert}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
        <Button
          size="sm"
          variant="outline"
          disabled={pending !== null || device.health === "offline"}
          onClick={() => void runAction("reboot")}
          className="border-white/15 bg-white/5 text-slate-100 hover:bg-white/10"
        >
          {pending === "reboot" ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <RotateCcw className="size-4" />
          )}
          Reboot
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending !== null}
          onClick={() => void runAction("stow")}
          className="border-white/15 bg-white/5 text-slate-100 hover:bg-white/10"
        >
          {pending === "stow" ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Antenna className="size-4" />
          )}
          Stow
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending !== null}
          onClick={() => void runAction("unstow")}
          className="border-white/15 bg-white/5 text-slate-100 hover:bg-white/10"
        >
          Unstow
        </Button>
        <span className="ml-auto text-[11px] text-slate-500">
          Updated {formatRelative(device.lastUpdated)}
        </span>
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-sm text-slate-100">{value}</dd>
    </div>
  );
}
