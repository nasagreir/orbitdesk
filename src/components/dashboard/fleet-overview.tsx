"use client";

import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeviceCard } from "@/components/dashboard/device-card";
import { GrokAssistant } from "@/components/dashboard/grok-assistant";
import { StatusBanner } from "@/components/dashboard/status-banner";
import { ThroughputChart } from "@/components/dashboard/throughput-chart";
import { useDashboard } from "@/hooks/use-dashboard";
import { formatMbps, formatMs } from "@/lib/format";

export function FleetOverview() {
  const { data, error, loading, refreshing, reload } = useDashboard(30);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);

  const devices = useMemo(() => data?.devices ?? [], [data?.devices]);
  const selected =
    devices.find((d) => d.id === selectedId) ?? devices[0] ?? null;

  const totals = useMemo(() => {
    const online = devices.filter((d) => d.health === "online").length;
    // Down/offline alerts are already stripped for travel-mode dishes server-side
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
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-40 animate-pulse rounded-2xl bg-white/5 lg:col-span-2" />
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-cyan-300/80">
            Starlink control plane
          </p>
          <h1 className="mt-1 font-heading text-3xl tracking-tight text-white sm:text-4xl">
            OrbitDesk
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400 sm:text-base">
            Monitor dishes, run Home Assistant actions, and ask Grok what to do
            next — all from one ops view.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void reload()}
          disabled={refreshing}
          className="border-white/15 bg-white/5 text-slate-100 hover:bg-white/10"
        >
          <RefreshCw
            className={`size-4 ${refreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      <StatusBanner status={data.status} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <ThroughputChart data={data.throughput} />
          <div className="grid gap-4">
            {devices.map((device) => (
              <DeviceCard
                key={`${device.id}-${device.modelId ?? "none"}-${device.roamEnabled ? "roam" : "home"}-${device.roamNote ?? ""}`}
                device={device}
                selected={selected?.id === device.id}
                onSelect={() => setSelectedId(device.id)}
                onActionDone={setActionNote}
                onDeviceUpdated={() => void reload()}
              />
            ))}
          </div>
        </div>

        <GrokAssistant
          devices={devices}
          grokConfigured={data.status.grok.configured}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0c1622]/75 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 font-heading text-2xl text-white">{value}</p>
    </div>
  );
}
