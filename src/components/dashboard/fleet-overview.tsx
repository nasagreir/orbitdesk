"use client";

import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeviceCard } from "@/components/dashboard/device-card";
import { GrokAssistant } from "@/components/dashboard/grok-assistant";
import { StatusBanner } from "@/components/dashboard/status-banner";
import { ThroughputChart } from "@/components/dashboard/throughput-chart";
import { useDashboard } from "@/hooks/use-dashboard";
import { useViewportLayout } from "@/hooks/use-viewport-layout";
import { formatMbps, formatMs } from "@/lib/format";
import { cn } from "@/lib/utils";

export function FleetOverview() {
  const { data, error, loading, refreshing, reload } = useDashboard(30);
  const layout = useViewportLayout();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);

  const devices = useMemo(() => data?.devices ?? [], [data?.devices]);
  const selected =
    devices.find((d) => d.id === selectedId) ?? devices[0] ?? null;

  const totals = useMemo(() => {
    const online = devices.filter((d) => d.health === "online").length;
    const alerts = devices.reduce((sum, d) => sum + d.alerts.length, 0);
    const down = devices.reduce((sum, d) => sum + d.downlinkMbps, 0);
    const withLatency = devices.filter((d) => d.latencyMs > 0);
    const avgLatency =
      withLatency.reduce((s, d) => s + d.latencyMs, 0) /
      Math.max(1, withLatency.length);
    return { online, alerts, down, avgLatency };
  }, [devices]);

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
        <div className="adaptive-split">
          <div className="h-40 animate-pulse rounded-2xl bg-white/5" />
          <div className="h-40 animate-pulse rounded-2xl bg-white/5" />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-6 text-rose-100">
        <p className="font-heading text-lg">Couldn’t load the fleet</p>
        <p className="mt-1 text-sm opacity-80">{error}</p>
        <Button
          className="mt-4"
          variant="outline"
          onClick={() => void reload()}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const compact =
    layout.mode === "mobile" ||
    layout.duoInnerLandscape ||
    layout.height < 640;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80 sm:text-sm">
            Starlink control plane
          </p>
          <h1 className="mt-1 font-heading text-2xl tracking-tight text-white sm:text-3xl md:text-4xl">
            OrbitDesk
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400 sm:text-base">
            {layout.mode === "duo-inner"
              ? "Split across the Duo inner display — dishes on one side, Grok on the other."
              : "Monitor dishes, run Home Assistant actions, and ask Grok what to do next."}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void reload()}
          disabled={refreshing}
          className="w-full border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 sm:w-auto"
        >
          <RefreshCw
            className={`size-4 ${refreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      <StatusBanner status={data.status} />

      <div className="adaptive-stats">
        <Stat label="Dishes online" value={`${totals.online}/${devices.length}`} />
        <Stat label="Fleet downlink" value={formatMbps(totals.down)} />
        <Stat label="Avg latency" value={formatMs(totals.avgLatency)} />
        <Stat label="Open alerts" value={String(totals.alerts)} />
      </div>

      {actionNote && (
        <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-50">
          {actionNote}
        </div>
      )}

      <div
        className={cn(
          "adaptive-split duo-hinge-gutter",
          layout.foldedSplit && "min-h-0",
        )}
      >
        <div className="min-w-0 space-y-4">
          <ThroughputChart data={data.throughput} compact={compact} />
          <div className="grid gap-3 sm:gap-4">
            {devices.map((device) => (
              <DeviceCard
                key={`${device.id}-${device.modelId ?? "none"}-${device.roamEnabled ? "roam" : "home"}-${device.wanFailover ? "failover" : "primary"}-${device.roamNote ?? ""}-${device.wanFailoverNote ?? ""}`}
                device={device}
                selected={selected?.id === device.id}
                onSelect={() => setSelectedId(device.id)}
                onActionDone={setActionNote}
                onDeviceUpdated={() => void reload()}
                compact={layout.mode === "mobile"}
              />
            ))}
          </div>
        </div>

        <div
          className={cn(
            "min-w-0",
            (layout.mode === "duo-inner" || layout.foldedSplit) &&
              "sticky top-2 self-start",
          )}
        >
          <GrokAssistant
            devices={devices}
            grokConfigured={data.status.grok.configured}
            compact={compact}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0c1622]/75 px-3 py-2.5 sm:px-4 sm:py-3">
      <p className="text-[10px] uppercase tracking-wide text-slate-500 sm:text-[11px]">
        {label}
      </p>
      <p className="mt-1 font-heading text-xl text-white sm:text-2xl">{value}</p>
    </div>
  );
}
