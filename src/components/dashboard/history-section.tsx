"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  Lightbulb,
  Loader2,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHistory } from "@/hooks/use-history";
import { useViewportLayout } from "@/hooks/use-viewport-layout";
import { formatMbps, formatMs, formatPct } from "@/lib/format";
import type {
  HistoryInsight,
  HistoryInsightPriority,
  HistoryRange,
} from "@/lib/types";

const RANGES: { id: HistoryRange; label: string }[] = [
  { id: "24h", label: "24h" },
  { id: "7d", label: "7 days" },
  { id: "14d", label: "14 days" },
];

const PRIORITY_STYLE: Record<
  HistoryInsightPriority,
  { label: string; className: string }
> = {
  high: {
    label: "High",
    className: "border-rose-400/30 bg-rose-400/10 text-rose-100",
  },
  medium: {
    label: "Medium",
    className: "border-amber-400/30 bg-amber-400/10 text-amber-100",
  },
  low: {
    label: "Low",
    className: "border-slate-400/25 bg-white/5 text-slate-300",
  },
};

export function HistorySection() {
  const [range, setRange] = useState<HistoryRange>("7d");
  const { data, insights, error, loading, insightsLoading, reload } =
    useHistory(range);
  const layout = useViewportLayout();
  const chartHeight =
    layout.duoInnerLandscape || layout.height < 640 ? "h-44" : "h-56";

  return (
    <section className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80 sm:text-sm">
            Trends
          </p>
          <h1 className="mt-1 font-heading text-2xl tracking-tight text-white sm:text-3xl md:text-4xl">
            History
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400 sm:text-base">
            Fleet throughput, latency, and obstruction over time — with Grok
            suggestions grounded in this window.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="inline-flex flex-1 rounded-lg border border-white/10 bg-white/5 p-1 sm:flex-none">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors sm:flex-none sm:px-3 ${
                  range === r.id
                    ? "bg-cyan-400/20 text-cyan-100"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => reload()}
            disabled={loading || insightsLoading}
            className="border-white/15 bg-white/5 text-slate-100 hover:bg-white/10"
          >
            Refresh
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <div className="adaptive-split">
          <div className="h-56 animate-pulse rounded-2xl bg-white/5 sm:h-72" />
          <div className="h-56 animate-pulse rounded-2xl bg-white/5 sm:h-72" />
        </div>
      ) : error && !data ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-5 text-rose-100">
          <p className="font-heading text-lg">Couldn’t load history</p>
          <p className="mt-1 text-sm opacity-80">{error}</p>
          <Button
            className="mt-3"
            variant="outline"
            onClick={() => reload()}
          >
            Retry
          </Button>
        </div>
      ) : data ? (
        <>
          <div className="adaptive-stats">
            <MiniStat
              label="Avg downlink"
              value={formatMbps(data.summary.avgDownlinkMbps)}
            />
            <MiniStat
              label="p95 latency"
              value={formatMs(data.summary.p95LatencyMs)}
            />
            <MiniStat
              label="Avg obstruction"
              value={formatPct(data.summary.avgObstructionPct)}
            />
            <MiniStat
              label="Uptime"
              value={`${data.summary.uptimePct.toFixed(1)}%`}
            />
          </div>

          <div className="adaptive-split duo-hinge-gutter">
            <div className="rounded-2xl border border-white/10 bg-[#0c1622]/80 p-3 sm:p-4 md:p-5">
              <div className="mb-3 flex items-center gap-2">
                <TrendingUp className="size-4 shrink-0 text-cyan-300" />
                <div className="min-w-0">
                  <h3 className="font-heading text-base text-white">
                    Throughput history
                  </h3>
                  <p className="text-xs text-slate-500">
                    Fleet average downlink / uplink
                  </p>
                </div>
              </div>
              <div className={`${chartHeight} adaptive-chart-height w-full`}>
                {data.series.length === 0 ? (
                  <EmptyChart message="No samples in this window yet." />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.series}>
                      <defs>
                        <linearGradient
                          id="histDown"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#22d3ee"
                            stopOpacity={0.35}
                          />
                          <stop
                            offset="100%"
                            stopColor="#22d3ee"
                            stopOpacity={0}
                          />
                        </linearGradient>
                        <linearGradient
                          id="histUp"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#34d399"
                            stopOpacity={0.28}
                          />
                          <stop
                            offset="100%"
                            stopColor="#34d399"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        stroke="rgba(148,163,184,0.12)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "#64748b", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        minTickGap={28}
                      />
                      <YAxis
                        tick={{ fill: "#64748b", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={36}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#0b1520",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 12,
                          color: "#e2e8f0",
                        }}
                        formatter={(value, name) => [
                          `${Number(value).toFixed(1)} Mbps`,
                          name === "downlinkMbps" ? "Downlink" : "Uplink",
                        ]}
                      />
                      <Area
                        type="monotone"
                        dataKey="downlinkMbps"
                        stroke="#22d3ee"
                        fill="url(#histDown)"
                        strokeWidth={2}
                      />
                      <Area
                        type="monotone"
                        dataKey="uplinkMbps"
                        stroke="#34d399"
                        fill="url(#histUp)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0c1622]/80 p-3 sm:p-4 md:p-5">
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="size-4 shrink-0 text-amber-300" />
                <div className="min-w-0">
                  <h3 className="font-heading text-base text-white">
                    Latency & obstruction
                  </h3>
                  <p className="text-xs text-slate-500">
                    Average latency (ms) and obstruction (%)
                  </p>
                </div>
              </div>
              <div className={`${chartHeight} adaptive-chart-height w-full`}>
                {data.series.length === 0 ? (
                  <EmptyChart message="No samples in this window yet." />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data.series}>
                      <CartesianGrid
                        stroke="rgba(148,163,184,0.12)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "#64748b", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        minTickGap={28}
                      />
                      <YAxis
                        yAxisId="lat"
                        tick={{ fill: "#64748b", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={36}
                      />
                      <YAxis
                        yAxisId="obs"
                        orientation="right"
                        tick={{ fill: "#64748b", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={32}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#0b1520",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 12,
                          color: "#e2e8f0",
                        }}
                      />
                      <Line
                        yAxisId="lat"
                        type="monotone"
                        dataKey="latencyMs"
                        name="Latency"
                        stroke="#fbbf24"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Area
                        yAxisId="obs"
                        type="monotone"
                        dataKey="obstructionPct"
                        name="Obstruction"
                        stroke="#f472b6"
                        fill="rgba(244,114,182,0.15)"
                        strokeWidth={2}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {data.devices.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0c1622]/80">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-medium">Dish</th>
                    <th className="px-4 py-3 font-medium">Avg down</th>
                    <th className="px-4 py-3 font-medium">Avg latency</th>
                    <th className="px-4 py-3 font-medium">Obstruction</th>
                    <th className="px-4 py-3 font-medium">Uptime</th>
                  </tr>
                </thead>
                <tbody>
                  {data.devices.map((d) => (
                    <tr
                      key={d.id}
                      className="border-b border-white/5 last:border-0"
                    >
                      <td className="px-4 py-3 font-medium text-slate-100">
                        {d.name}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {formatMbps(d.avgDownlinkMbps)}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {formatMs(d.avgLatencyMs)}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {formatPct(d.avgObstructionPct)}
                        <span className="ml-1 text-xs text-slate-500">
                          peak {formatPct(d.peakObstructionPct)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {d.uptimePct.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <InsightsPanel
            loading={insightsLoading}
            insights={insights?.insights ?? []}
            demo={insights?.demo ?? true}
            onRetry={() => reload()}
          />
        </>
      ) : null}
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0c1622]/75 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 font-heading text-xl text-white">{value}</p>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-slate-500">
      {message}
    </div>
  );
}

function InsightsPanel({
  loading,
  insights,
  demo,
  onRetry,
}: {
  loading: boolean;
  insights: HistoryInsight[];
  demo: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0c1622]/80 p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-violet-300" />
          <div>
            <h3 className="font-heading text-base text-white">
              Suggested improvements
            </h3>
            <p className="text-xs text-slate-500">
              {demo
                ? "Heuristic suggestions (add GROK_API_KEY for live Grok)"
                : "Generated by Grok from this history window"}
            </p>
          </div>
        </div>
        {loading && (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <Loader2 className="size-3.5 animate-spin" />
            Analyzing…
          </span>
        )}
      </div>

      {loading && insights.length === 0 ? (
        <div className="space-y-3">
          <div className="h-16 animate-pulse rounded-xl bg-white/5" />
          <div className="h-16 animate-pulse rounded-xl bg-white/5" />
        </div>
      ) : insights.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-slate-400">
          No suggestions yet.{" "}
          <button
            type="button"
            onClick={onRetry}
            className="text-cyan-300 underline-offset-2 hover:underline"
          >
            Retry
          </button>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {insights.map((insight) => {
            const style = PRIORITY_STYLE[insight.priority];
            return (
              <li
                key={insight.id}
                className="rounded-xl border border-white/10 bg-black/20 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <Lightbulb className="mt-0.5 size-4 shrink-0 text-cyan-300" />
                    <div>
                      <p className="font-medium text-slate-100">
                        {insight.title}
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-slate-400">
                        {insight.detail}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${style.className}`}
                  >
                    {style.label}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
