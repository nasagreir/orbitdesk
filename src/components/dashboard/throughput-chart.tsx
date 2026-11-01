"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ThroughputPoint } from "@/lib/types";

export function ThroughputChart({
  data,
  compact = false,
}: {
  data: ThroughputPoint[];
  compact?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0c1622]/80 p-3 sm:p-4 md:p-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2 sm:mb-4 sm:gap-3">
        <div>
          <h2 className="font-heading text-base text-white sm:text-lg">
            Throughput
          </h2>
          <p className="text-xs text-slate-400 sm:text-sm">
            Downlink / uplink over the last few hours
          </p>
        </div>
        <div className="flex gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5 text-cyan-300">
            <span className="size-2 rounded-full bg-cyan-400" /> Downlink
          </span>
          <span className="inline-flex items-center gap-1.5 text-emerald-300">
            <span className="size-2 rounded-full bg-emerald-400" /> Uplink
          </span>
        </div>
      </div>

      <div
        className={`adaptive-chart-height w-full ${compact ? "h-44 sm:h-52" : "h-56 sm:h-64"}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="downFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="upFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fill: "#64748b", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={40}
              tickFormatter={(v) => `${v}`}
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
                name === "downlink" ? "Downlink" : "Uplink",
              ]}
            />
            <Area
              type="monotone"
              dataKey="downlink"
              stroke="#22d3ee"
              fill="url(#downFill)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="uplink"
              stroke="#34d399"
              fill="url(#upFill)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
