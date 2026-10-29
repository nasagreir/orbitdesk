"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Copy, KeyRound, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SettingsPublic } from "@/lib/types";

export function ConnectionsPanel() {
  const [settings, setSettings] = useState<SettingsPublic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setSettings((await res.json()) as SettingsPublic);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load settings");
      }
    })();
  }, []);

  const envExample = `# Home Assistant
HOME_ASSISTANT_URL=http://homeassistant.local:8123
HOME_ASSISTANT_TOKEN=eyJhbGciOi...your-long-lived-token
STARLINK_ENTITY_PREFIX=sensor.starlink

# Grok (xAI)
GROK_API_KEY=xai-...
# optional aliases / overrides
# XAI_API_KEY=xai-...
# GROK_MODEL=grok-2-latest
# GROK_BASE_URL=https://api.x.ai/v1

# App
POLL_INTERVAL_SECONDS=30
# FORCE_DEMO_MODE=true`;

  async function copyEnv() {
    await navigator.clipboard.writeText(envExample);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-6 text-rose-100">
        {error}
      </div>
    );
  }

  if (!settings) {
    return <div className="h-64 animate-pulse rounded-2xl bg-white/5" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-cyan-300/80">
          Integrations
        </p>
        <h1 className="mt-1 font-heading text-3xl text-white">Connections</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400 sm:text-base">
          Wire Home Assistant for live Starlink entities and an xAI Grok API key
          for the ops assistant. Secrets stay server-side in environment
          variables — nothing is stored in the browser.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <IntegrationCard
          icon={<Link2 className="size-4" />}
          title="Home Assistant"
          configured={settings.homeAssistantConfigured}
          rows={[
            ["URL", settings.homeAssistantUrl || "not set"],
            ["Entity prefix", settings.entityPrefix],
            ["Poll interval", `${settings.pollIntervalSeconds}s`],
            [
              "Demo force",
              settings.demoModeForced ? "enabled" : "off",
            ],
          ]}
          help="Create a long-lived access token in HA profile settings. Install the Starlink integration so dish sensors appear as sensor.starlink_* entities."
        />
        <IntegrationCard
          icon={<KeyRound className="size-4" />}
          title="Grok / xAI"
          configured={settings.grokConfigured}
          rows={[
            ["API key", settings.grokConfigured ? "configured" : "missing"],
            ["Endpoint", "https://api.x.ai/v1"],
            ["Env vars", "GROK_API_KEY or XAI_API_KEY"],
          ]}
          help="The assistant posts fleet snapshots to Grok chat completions so replies stay grounded in your dish telemetry."
        />
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0c1622]/80 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg text-white">.env.local</h2>
            <p className="text-sm text-slate-400">
              Copy into the project root, restart the dev server, and refresh.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => void copyEnv()}
            className="border-white/15 bg-white/5 text-slate-100 hover:bg-white/10"
          >
            {copied ? (
              <CheckCircle2 className="size-4 text-emerald-400" />
            ) : (
              <Copy className="size-4" />
            )}
            {copied ? "Copied" : "Copy template"}
          </Button>
        </div>
        <pre className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-black/30 p-4 font-mono text-xs leading-relaxed text-slate-300">
          {envExample}
        </pre>
      </div>
    </div>
  );
}

function IntegrationCard({
  icon,
  title,
  configured,
  rows,
  help,
}: {
  icon: React.ReactNode;
  title: string;
  configured: boolean;
  rows: [string, string][];
  help: string;
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-[#0c1622]/80 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-cyan-300">
          <span className="flex size-8 items-center justify-center rounded-lg border border-cyan-400/30 bg-cyan-400/10">
            {icon}
          </span>
          <h2 className="font-heading text-lg text-white">{title}</h2>
        </div>
        <Badge
          variant="outline"
          className={
            configured
              ? "border-emerald-400/40 text-emerald-300"
              : "border-amber-300/40 text-amber-200"
          }
        >
          {configured ? "ready" : "needs setup"}
        </Badge>
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-3 border-b border-white/5 py-2 last:border-0"
          >
            <dt className="text-slate-500">{label}</dt>
            <dd className="truncate font-mono text-xs text-slate-200">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-sm text-slate-400">{help}</p>
    </article>
  );
}
