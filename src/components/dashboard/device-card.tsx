"use client";

import Image from "next/image";
import { useState } from "react";
import {
  Antenna,
  LoaderCircle,
  MapPinned,
  RotateCcw,
  ShieldAlert,
  Signal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  STARLINK_MODELS,
  getStarlinkModel,
  type StarlinkModelId,
} from "@/lib/starlink-models";
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
  onDeviceUpdated,
}: {
  device: StarlinkDevice;
  selected: boolean;
  onSelect: () => void;
  onActionDone: (message: string) => void;
  onDeviceUpdated?: () => void;
}) {
  const [pending, setPending] = useState<StarlinkAction | "roam" | null>(null);
  const [savingModel, setSavingModel] = useState(false);
  const [roamNote, setRoamNote] = useState(device.roamNote ?? "");
  const model = getStarlinkModel(device.modelId);
  const canRoam = Boolean(model?.supportsRoam);

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

  async function savePrefs(patch: {
    modelId?: StarlinkModelId;
    roamEnabled?: boolean;
    roamNote?: string;
  }) {
    const res = await fetch(`/api/devices/${device.id}/prefs`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const body = await res.json();
    if (!res.ok) {
      throw new Error(body.error ?? "Failed to save");
    }
    return body;
  }

  async function onModelChange(modelId: string) {
    if (!modelId) return;
    setSavingModel(true);
    try {
      await savePrefs({ modelId: modelId as StarlinkModelId });
      onActionDone(
        `Assigned ${getStarlinkModel(modelId as StarlinkModelId)?.name ?? modelId}`,
      );
      onDeviceUpdated?.();
    } catch (error) {
      onActionDone(
        error instanceof Error ? error.message : "Model update failed",
      );
    } finally {
      setSavingModel(false);
    }
  }

  async function toggleRoam() {
    if (!canRoam) return;
    const next = !device.roamEnabled;
    setPending("roam");
    try {
      await savePrefs({
        roamEnabled: next,
        roamNote: next ? roamNote || device.roamNote : undefined,
      });
      // Best-effort HA switch when connected
      await fetch(`/api/devices/${device.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: next ? "roam_on" : "roam_off" }),
      }).catch(() => null);

      onActionDone(
        next
          ? `Roam enabled${roamNote ? ` — ${roamNote}` : ""}`
          : "Roam disabled — back to home service area",
      );
      onDeviceUpdated?.();
    } catch (error) {
      onActionDone(error instanceof Error ? error.message : "Roam update failed");
    } finally {
      setPending(null);
    }
  }

  async function saveRoamNote() {
    if (!canRoam) return;
    try {
      await savePrefs({ roamNote });
      onActionDone("Trip note saved");
      onDeviceUpdated?.();
    } catch (error) {
      onActionDone(error instanceof Error ? error.message : "Could not save note");
    }
  }

  return (
    <article
      className={`rounded-2xl border p-4 transition ${
        selected
          ? "border-cyan-400/50 bg-[color:var(--card)] shadow-[0_0_0_1px_rgba(34,211,238,0.2)]"
          : "border-white/10 bg-[color:var(--card)]/80 hover:border-white/20"
      }`}
    >
      <div className="flex gap-4">
        <button
          type="button"
          onClick={onSelect}
          className="relative size-24 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/30 sm:size-28"
          title={model?.name ?? "Assign a Starlink model"}
        >
          {model ? (
            <Image
              src={model.imageSrc}
              alt={model.name}
              fill
              className="object-contain p-1"
              sizes="112px"
              unoptimized
            />
          ) : (
            <span className="flex h-full items-center justify-center px-2 text-center text-[11px] text-slate-500">
              Choose model
            </span>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onSelect}
            className="flex w-full items-start justify-between gap-3 text-left"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-heading text-lg text-white">{device.name}</h3>
                <Badge
                  variant="outline"
                  className={healthStyles[device.health]}
                >
                  {device.health}
                </Badge>
                {model && (
                  <Badge
                    variant="outline"
                    className="border-cyan-400/30 text-cyan-200"
                  >
                    {model.shortName}
                  </Badge>
                )}
                {device.roamEnabled && canRoam && (
                  <Badge
                    variant="outline"
                    className="border-violet-400/40 bg-violet-400/10 text-violet-200"
                  >
                    <MapPinned className="mr-1 size-3" />
                    Roaming
                  </Badge>
                )}
              </div>
              <p className="mt-1 truncate font-mono text-xs text-slate-500">
                {device.hardwareId}
              </p>
            </div>
            <Signal
              className={`size-5 shrink-0 ${
                device.health === "online"
                  ? "text-cyan-300"
                  : device.health === "degraded"
                    ? "text-amber-300"
                    : "text-slate-500"
              }`}
            />
          </button>

          <div className="mt-3 space-y-2">
            <label
              htmlFor={`model-${device.id}`}
              className="block text-[11px] uppercase tracking-wide text-slate-500"
            >
              Hardware model
            </label>
            <select
              id={`model-${device.id}`}
              value={device.modelId ?? ""}
              disabled={savingModel}
              onChange={(e) => void onModelChange(e.target.value)}
              className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-2.5 text-sm text-slate-100 outline-none focus-visible:border-cyan-400/40"
            >
              <option value="" disabled>
                Assign Starlink model image…
              </option>
              {STARLINK_MODELS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                  {option.supportsRoam ? " · roam" : ""}
                </option>
              ))}
            </select>
            {model && (
              <p className="text-xs text-slate-500">{model.description}</p>
            )}
          </div>
        </div>
      </div>

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

      {canRoam && (
        <div className="mt-4 rounded-xl border border-violet-400/20 bg-violet-400/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-violet-100">Mini Roam</p>
              <p className="text-xs text-slate-400">
                Travel mode for Starlink Mini — use when you take it on the road
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={pending !== null}
              onClick={() => void toggleRoam()}
              className={
                device.roamEnabled
                  ? "border-violet-400/40 bg-violet-400/15 text-violet-100"
                  : "border-white/15 bg-white/5 text-slate-100 hover:bg-white/10"
              }
            >
              {pending === "roam" ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <MapPinned className="size-4" />
              )}
              {device.roamEnabled ? "End roam" : "Start roam"}
            </Button>
          </div>
          {device.roamEnabled && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Input
                value={roamNote}
                onChange={(e) => setRoamNote(e.target.value)}
                placeholder="Trip label (e.g. Cabin weekend, Gulf Coast)"
                className="border-white/10 bg-black/20 text-slate-100"
                maxLength={80}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => void saveRoamNote()}
                className="border-white/15 bg-white/5 text-slate-100 hover:bg-white/10"
              >
                Save note
              </Button>
            </div>
          )}
        </div>
      )}

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
