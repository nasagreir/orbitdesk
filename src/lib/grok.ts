import { getGrokConfig } from "@/lib/config";
import { buildDemoInsights } from "@/lib/history";
import type {
  GrokMessage,
  HistoryInsight,
  HistoryPayload,
  StarlinkDevice,
} from "@/lib/types";

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
    roamEnabled: Boolean(d.roamEnabled),
    alarmsPaused: Boolean(d.alarmsPaused),
  }));

  return [
    "You are Grok embedded in a Starlink operations dashboard.",
    "Help the operator interpret dish telemetry, Home Assistant entities, and recovery steps.",
    "Be concise, practical, and specific to the live snapshot when available.",
    "Prefer actionable advice (clear obstructions, reboot via HA, check power/roaming) over generic networking tips.",
    "If alarmsPaused or roamEnabled is true, the dish is in travel/roam mode — do not treat offline as an incident and do not recommend reboot for being down.",
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
  const degraded = devices.filter(
    (d) => d.health !== "online" && !d.alarmsPaused,
  );
  const traveling = devices.filter((d) => d.alarmsPaused);
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
      traveling.length
        ? `Skipping travel-mode units (alarms paused): ${traveling.map((d) => d.name).join(", ")}.`
        : "",
    ]
      .filter(Boolean)
      .join(" ");
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
    traveling.length
      ? `${traveling.length} in travel mode with down-alarms paused.`
      : "",
    "Ask about reboot steps, obstruction, or latency and I’ll use the live telemetry once Grok is connected.",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildHistoryInsightsPrompt(history: HistoryPayload): string {
  const compact = {
    range: history.range,
    summary: history.summary,
    seriesTail: history.series.slice(-12),
    devices: history.devices,
  };

  return [
    "You are Grok embedded in OrbitDesk, a Starlink ops dashboard.",
    "Given fleet historical telemetry, return 2–4 concrete improvement suggestions.",
    "Focus on obstruction clearing, mount/aim, power, roam/travel context, Ethernet vs Wi‑Fi, and when to reboot via Home Assistant.",
    "Do not invent dishes that are not in the payload. Prefer the worst metrics first.",
    "Respond with ONLY a JSON array (no markdown fences) of objects with keys:",
    'id (string slug), title (short), detail (1–2 sentences), priority ("high"|"medium"|"low"),',
    "deviceId (optional dish id from payload), metric (optional: obstruction|latency|throughput|uptime|general).",
    "History payload:",
    JSON.stringify(compact),
  ].join("\n");
}

function parseInsightArray(raw: string): HistoryInsight[] | null {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start < 0 || end <= start) return null;

  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    if (!Array.isArray(parsed)) return null;

    const insights: HistoryInsight[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const title = typeof row.title === "string" ? row.title.trim() : "";
      const detail = typeof row.detail === "string" ? row.detail.trim() : "";
      if (!title || !detail) continue;
      const priority =
        row.priority === "high" || row.priority === "medium" || row.priority === "low"
          ? row.priority
          : "medium";
      insights.push({
        id:
          typeof row.id === "string" && row.id.trim()
            ? row.id.trim()
            : `insight-${insights.length + 1}`,
        title,
        detail,
        priority,
        deviceId:
          typeof row.deviceId === "string" ? row.deviceId : undefined,
        metric: typeof row.metric === "string" ? row.metric : undefined,
      });
    }
    return insights.length > 0 ? insights.slice(0, 4) : null;
  } catch {
    return null;
  }
}

/** Ask Grok for improvement suggestions from history; falls back to heuristics. */
export async function suggestHistoryImprovements(
  history: HistoryPayload,
): Promise<{ insights: HistoryInsight[]; demo: boolean }> {
  const { apiKey, model, baseUrl, configured } = getGrokConfig();

  if (!configured) {
    return { insights: buildDemoInsights(history), demo: true };
  }

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: buildHistoryInsightsPrompt(history) },
          {
            role: "user",
            content:
              "Analyze this historical window and return the JSON improvement array now.",
          },
        ],
        temperature: 0.35,
        stream: false,
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`Grok API error ${res.status}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim() ?? "";
    const parsed = parseInsightArray(content);
    if (parsed) {
      return { insights: parsed, demo: false };
    }
    return { insights: buildDemoInsights(history), demo: true };
  } catch {
    return { insights: buildDemoInsights(history), demo: true };
  }
}
