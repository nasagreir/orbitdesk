"use client";

import { Badge } from "@/components/ui/badge";
import type { IntegrationStatus } from "@/lib/types";
import { AlertTriangle, CheckCircle2, CircleDashed } from "lucide-react";

export function StatusBanner({ status }: { status: IntegrationStatus }) {
  const live = status.mode === "live";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0c1622]/80 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        {live ? (
          <CheckCircle2 className="mt-0.5 size-5 text-emerald-400" />
        ) : (
          <CircleDashed className="mt-0.5 size-5 text-amber-300" />
        )}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-heading text-base text-white">
              {live ? "Live Home Assistant feed" : "Demo telemetry"}
            </p>
            <Badge
              variant="outline"
              className={
                live
                  ? "border-emerald-400/40 text-emerald-300"
                  : "border-amber-300/40 text-amber-200"
              }
            >
              {live ? "LIVE" : "DEMO"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            {status.homeAssistant.message}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Pill
          ok={status.homeAssistant.reachable}
          label="Home Assistant"
          detail={
            status.homeAssistant.configured
              ? status.homeAssistant.reachable
                ? "connected"
                : "unreachable"
              : "not configured"
          }
        />
        <Pill
          ok={status.grok.configured}
          label="Grok"
          detail={status.grok.configured ? "API key set" : "needs key"}
        />
      </div>
    </div>
  );
}

function Pill({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 ${
        ok
          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
          : "border-white/10 bg-white/5 text-slate-300"
      }`}
    >
      {ok ? (
        <CheckCircle2 className="size-3.5" />
      ) : (
        <AlertTriangle className="size-3.5 text-amber-300" />
      )}
      <span className="font-medium">{label}</span>
      <span className="text-slate-400">· {detail}</span>
    </span>
  );
}
