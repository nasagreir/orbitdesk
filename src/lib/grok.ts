import { getGrokConfig } from "@/lib/config";
import type { GrokMessage, StarlinkDevice } from "@/lib/types";

export async function checkGrok(): Promise<{
  reachable: boolean;
  message: string;
}> {
  const { configured } = getGrokConfig();
  if (!configured) {
    return {
      reachable: false,
      message: "GROK_API_KEY / XAI_API_KEY not set",
    };
  }
  return {
    reachable: true,
    message: "Grok API key configured",
  };
}

export function buildStarlinkSystemPrompt(devices: StarlinkDevice[]): string {
  const snapshot = devices.map((d) => ({
    name: d.name,
    health: d.health,
    downlinkMbps: d.downlinkMbps,
    uplinkMbps: d.uplinkMbps,
    latencyMs: d.latencyMs,
    obstructionPct: d.obstructionPct,
    uptimeSeconds: d.uptimeSeconds,
    alerts: d.alerts,
  }));

  return [
    "You are Grok embedded in a Starlink operations dashboard.",
    "Help the operator interpret dish telemetry, Home Assistant entities, and recovery steps.",
    "Be concise, practical, and specific to the live snapshot when available.",
    "Prefer actionable advice (clear obstructions, reboot via HA, check power/roaming) over generic networking tips.",
    "Current dish snapshot (JSON):",
    JSON.stringify(snapshot, null, 2),
  ].join("\n");
}

export async function chatWithGrok(
  messages: GrokMessage[],
  devices: StarlinkDevice[],
): Promise<string> {
  const { apiKey, model, baseUrl, configured } = getGrokConfig();
  if (!configured) {
    throw new Error("Grok API key is not configured");
  }

  const payload = {
    model,
    messages: [
      { role: "system", content: buildStarlinkSystemPrompt(devices) },
      ...messages.filter((m) => m.role !== "system"),
    ],
    temperature: 0.5,
    stream: false,
  };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Grok API error ${res.status}: ${detail.slice(0, 280)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("Grok returned an empty response");
  }
  return content;
}

export function demoGrokReply(
  prompt: string,
  devices: StarlinkDevice[],
): string {
  const degraded = devices.filter((d) => d.health !== "online");
  const worst = [...devices].sort(
    (a, b) => b.obstructionPct - a.obstructionPct,
  )[0];

  if (/reboot|restart/i.test(prompt)) {
    return [
      "Demo reply (add GROK_API_KEY for live Grok):",
      "Reboot the degraded dish from the Actions panel — that calls Home Assistant `button.press` on the Starlink reboot entity.",
      degraded.length
        ? `Candidates: ${degraded.map((d) => d.name).join(", ")}.`
        : "All dishes look online right now.",
    ].join(" ");
  }

  if (/obstruct|tree|signal/i.test(prompt) && worst) {
    return [
      "Demo reply (add GROK_API_KEY for live Grok):",
      `${worst.name} is at ${worst.obstructionPct.toFixed(1)}% obstruction.`,
      worst.obstructionPct >= 10
        ? "Clear foliage along the dish boresight or nudge azimuth a few degrees, then re-check latency."
        : "Obstruction looks healthy — check rain fade or local Wi‑Fi congestion next.",
    ].join(" ");
  }

  return [
    "Demo reply (add GROK_API_KEY for live Grok):",
    `Tracking ${devices.length} dish(es).`,
    degraded.length
      ? `${degraded.length} need attention: ${degraded.map((d) => `${d.name} (${d.health})`).join("; ")}.`
      : "Fleet is healthy.",
    "Ask about reboot steps, obstruction, or latency and I’ll use the live telemetry once Grok is connected.",
  ].join(" ");
}
