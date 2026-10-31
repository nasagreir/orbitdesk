import { promises as fs } from "node:fs";
import path from "node:path";
import { getDataDir } from "@/lib/auth/paths";
import type {
  HistoryInsight,
  HistoryPayload,
  HistoryPoint,
  HistoryRange,
  HistorySummary,
  StarlinkDevice,
} from "@/lib/types";

const MAX_POINTS = 2_500;
const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const SNAPSHOT_MIN_GAP_MS = 4 * 60 * 1000;

function historyFilePath() {
  return path.join(getDataDir(), "history.json");
}

interface HistoryFile {
  points: HistoryPoint[];
}

async function ensureDataDir() {
  await fs.mkdir(getDataDir(), { recursive: true });
}

async function readHistoryFile(): Promise<HistoryFile> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(historyFilePath(), "utf8");
    const parsed = JSON.parse(raw) as HistoryFile;
    return { points: Array.isArray(parsed.points) ? parsed.points : [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { points: [] };
    }
    throw error;
  }
}

async function writeHistoryFile(data: HistoryFile) {
  await ensureDataDir();
  const file = historyFilePath();
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data)}\n`, { mode: 0o600 });
  await fs.rename(tmp, file);
}

function rangeMs(range: HistoryRange): number {
  if (range === "24h") return 24 * 60 * 60 * 1000;
  if (range === "7d") return 7 * 24 * 60 * 60 * 1000;
  return 14 * 24 * 60 * 60 * 1000;
}

function bucketKey(iso: string, range: HistoryRange): string {
  const d = new Date(iso);
  if (range === "24h") {
    d.setMinutes(0, 0, 0);
    return d.toISOString();
  }
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function formatBucketLabel(iso: string, range: HistoryRange): string {
  const d = new Date(iso);
  if (range === "24h") {
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

/** Append a fleet snapshot if enough time has passed since the last point. */
export async function recordHistorySnapshot(
  devices: StarlinkDevice[],
): Promise<void> {
  if (devices.length === 0) return;

  const file = await readHistoryFile();
  const now = Date.now();
  const last = file.points.at(-1);
  if (last && now - new Date(last.at).getTime() < SNAPSHOT_MIN_GAP_MS) {
    return;
  }

  const active = devices.filter((d) => !d.alarmsPaused);
  const online = devices.filter((d) => d.health === "online").length;
  const withLatency = active.filter((d) => d.latencyMs > 0);
  const withDown = active.filter((d) => d.downlinkMbps > 0);

  const point: HistoryPoint = {
    at: new Date(now).toISOString(),
    deviceCount: devices.length,
    onlineCount: online,
    avgDownlinkMbps: avg(withDown.map((d) => d.downlinkMbps)),
    avgUplinkMbps: avg(
      active.filter((d) => d.uplinkMbps > 0).map((d) => d.uplinkMbps),
    ),
    avgLatencyMs: avg(withLatency.map((d) => d.latencyMs)),
    avgObstructionPct: avg(active.map((d) => d.obstructionPct)),
    alertCount: active.reduce((sum, d) => sum + d.alerts.length, 0),
    degradedCount: active.filter((d) => d.health === "degraded").length,
    offlineCount: active.filter((d) => d.health === "offline").length,
    byDevice: Object.fromEntries(
      devices.map((d) => [
        d.id,
        {
          name: d.name,
          health: d.health,
          downlinkMbps: d.downlinkMbps,
          uplinkMbps: d.uplinkMbps,
          latencyMs: d.latencyMs,
          obstructionPct: d.obstructionPct,
          alertCount: d.alarmsPaused ? 0 : d.alerts.length,
        },
      ]),
    ),
  };

  const cutoff = now - RETENTION_MS;
  const next = [...file.points, point]
    .filter((p) => new Date(p.at).getTime() >= cutoff)
    .slice(-MAX_POINTS);

  await writeHistoryFile({ points: next });
}

/** Seed plausible demo history when the store is empty. */
export async function ensureSeedHistory(
  devices: StarlinkDevice[],
): Promise<void> {
  const file = await readHistoryFile();
  if (file.points.length > 0) return;

  const now = Date.now();
  const points: HistoryPoint[] = [];
  // One point every 30 minutes for 7 days
  for (let i = 7 * 48; i >= 0; i -= 1) {
    const at = new Date(now - i * 30 * 60 * 1000);
    const hour = at.getHours();
    const dayWave = Math.sin(i / 18) * 0.2;
    const nightDip = hour >= 1 && hour <= 5 ? 0.82 : 1;
    const rainDay = i % 97 < 8;

    const byDevice: HistoryPoint["byDevice"] = {};
    let sumDown = 0;
    let sumUp = 0;
    let sumLat = 0;
    let sumObs = 0;
    let alerts = 0;
    let degraded = 0;
    let offline = 0;
    let online = 0;

    for (const device of devices) {
      const baseDown =
        device.id === "dish-shop"
          ? 55
          : device.id === "dish-rv"
            ? 90
            : 170;
      const roamOffline =
        device.id === "dish-rv" && device.roamEnabled && i % 40 < 6;
      const obstruction =
        device.id === "dish-shop"
          ? Math.max(2, 9 + Math.sin(i / 11) * 5 + (rainDay ? 6 : 0))
          : Math.max(0.4, 2 + Math.sin(i / 15) * 1.2);
      const latency = roamOffline
        ? 0
        : Math.max(
            18,
            (device.id === "dish-shop" ? 55 : 28) +
              Math.sin(i / 9) * 12 +
              (rainDay ? 25 : 0) +
              obstruction * 1.4,
          );
      const downlink = roamOffline
        ? 0
        : Math.max(
            8,
            baseDown * nightDip * (1 + dayWave) -
              obstruction * 2.5 -
              (rainDay ? 20 : 0),
          );
      const uplink = roamOffline ? 0 : Math.max(2, downlink * 0.12);
      const health = roamOffline
        ? "offline"
        : obstruction >= 10 || latency >= 80
          ? "degraded"
          : "online";
      const alertCount =
        health === "offline" && device.roamEnabled
          ? 0
          : health === "degraded"
            ? obstruction >= 10
              ? 2
              : 1
            : 0;

      byDevice[device.id] = {
        name: device.name,
        health,
        downlinkMbps: Number(downlink.toFixed(1)),
        uplinkMbps: Number(uplink.toFixed(1)),
        latencyMs: Number(latency.toFixed(0)),
        obstructionPct: Number(obstruction.toFixed(1)),
        alertCount,
      };

      if (health === "online") online += 1;
      if (health === "degraded") degraded += 1;
      if (health === "offline" && !device.roamEnabled) offline += 1;
      if (!roamOffline) {
        sumDown += downlink;
        sumUp += uplink;
        sumLat += latency;
        sumObs += obstruction;
      }
      alerts += alertCount;
    }

    const activeN = Math.max(1, devices.length - (byDevice["dish-rv"]?.health === "offline" && devices.find((d) => d.id === "dish-rv")?.roamEnabled ? 1 : 0));

    points.push({
      at: at.toISOString(),
      deviceCount: devices.length,
      onlineCount: online,
      avgDownlinkMbps: Number((sumDown / activeN).toFixed(1)),
      avgUplinkMbps: Number((sumUp / activeN).toFixed(1)),
      avgLatencyMs: Number((sumLat / activeN).toFixed(0)),
      avgObstructionPct: Number((sumObs / activeN).toFixed(1)),
      alertCount: alerts,
      degradedCount: degraded,
      offlineCount: offline,
      byDevice,
    });
  }

  await writeHistoryFile({ points });
}

function summarize(points: HistoryPoint[]): HistorySummary {
  if (points.length === 0) {
    return {
      sampleCount: 0,
      avgDownlinkMbps: 0,
      peakDownlinkMbps: 0,
      avgLatencyMs: 0,
      p95LatencyMs: 0,
      avgObstructionPct: 0,
      peakObstructionPct: 0,
      totalAlertSamples: 0,
      uptimePct: 0,
      worstDayLabel: null,
      bestDownlinkMbps: 0,
    };
  }

  const downs = points.map((p) => p.avgDownlinkMbps);
  const lats = points.map((p) => p.avgLatencyMs).filter((v) => v > 0);
  const obs = points.map((p) => p.avgObstructionPct);
  const onlineRatios = points.map((p) =>
    p.deviceCount > 0 ? p.onlineCount / p.deviceCount : 0,
  );

  let worst = points[0];
  for (const p of points) {
    const score =
      p.avgObstructionPct * 2 + p.avgLatencyMs / 10 + p.alertCount * 5;
    const worstScore =
      worst.avgObstructionPct * 2 +
      worst.avgLatencyMs / 10 +
      worst.alertCount * 5;
    if (score > worstScore) worst = p;
  }

  return {
    sampleCount: points.length,
    avgDownlinkMbps: Number(avg(downs).toFixed(1)),
    peakDownlinkMbps: Number(Math.max(...downs).toFixed(1)),
    bestDownlinkMbps: Number(Math.max(...downs).toFixed(1)),
    avgLatencyMs: Number(avg(lats).toFixed(0)),
    p95LatencyMs: Number(percentile(lats, 95).toFixed(0)),
    avgObstructionPct: Number(avg(obs).toFixed(1)),
    peakObstructionPct: Number(Math.max(...obs).toFixed(1)),
    totalAlertSamples: points.reduce((s, p) => s + p.alertCount, 0),
    uptimePct: Number((avg(onlineRatios) * 100).toFixed(1)),
    worstDayLabel: formatBucketLabel(worst.at, "7d"),
  };
}

function aggregateSeries(
  points: HistoryPoint[],
  range: HistoryRange,
): HistoryPayload["series"] {
  const buckets = new Map<string, HistoryPoint[]>();
  for (const point of points) {
    const key = bucketKey(point.at, range);
    const list = buckets.get(key) ?? [];
    list.push(point);
    buckets.set(key, list);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, group]) => ({
      label: formatBucketLabel(key, range),
      at: key,
      downlinkMbps: Number(avg(group.map((g) => g.avgDownlinkMbps)).toFixed(1)),
      uplinkMbps: Number(avg(group.map((g) => g.avgUplinkMbps)).toFixed(1)),
      latencyMs: Number(avg(group.map((g) => g.avgLatencyMs)).toFixed(0)),
      obstructionPct: Number(
        avg(group.map((g) => g.avgObstructionPct)).toFixed(1),
      ),
      alertCount: Number(avg(group.map((g) => g.alertCount)).toFixed(1)),
      onlinePct: Number(
        (
          avg(
            group.map((g) =>
              g.deviceCount > 0 ? (g.onlineCount / g.deviceCount) * 100 : 0,
            ),
          )
        ).toFixed(0),
      ),
    }));
}

function deviceBreakdown(
  points: HistoryPoint[],
): HistoryPayload["devices"] {
  const ids = new Set<string>();
  for (const p of points) {
    for (const id of Object.keys(p.byDevice)) ids.add(id);
  }

  return [...ids].map((id) => {
    const samples = points
      .map((p) => p.byDevice[id])
      .filter(Boolean);
    const name = samples[0]?.name ?? id;
    const downs = samples.map((s) => s.downlinkMbps);
    const lats = samples.map((s) => s.latencyMs).filter((v) => v > 0);
    const obs = samples.map((s) => s.obstructionPct);
    const online = samples.filter((s) => s.health === "online").length;
    return {
      id,
      name,
      avgDownlinkMbps: Number(avg(downs).toFixed(1)),
      avgLatencyMs: Number(avg(lats).toFixed(0)),
      avgObstructionPct: Number(avg(obs).toFixed(1)),
      peakObstructionPct: Number((Math.max(0, ...obs)).toFixed(1)),
      uptimePct: Number(
        ((samples.length ? online / samples.length : 0) * 100).toFixed(1),
      ),
      alertSamples: samples.reduce((s, x) => s + x.alertCount, 0),
    };
  });
}

export async function getHistoryPayload(
  range: HistoryRange = "7d",
): Promise<HistoryPayload> {
  const file = await readHistoryFile();
  const cutoff = Date.now() - rangeMs(range);
  const points = file.points.filter(
    (p) => new Date(p.at).getTime() >= cutoff,
  );

  return {
    range,
    fetchedAt: new Date().toISOString(),
    summary: summarize(points),
    series: aggregateSeries(points, range),
    devices: deviceBreakdown(points),
  };
}

export function buildDemoInsights(history: HistoryPayload): HistoryInsight[] {
  const insights: HistoryInsight[] = [];
  const shop = history.devices.find((d) =>
    /shop/i.test(d.name),
  );
  const worstObs = [...history.devices].sort(
    (a, b) => b.avgObstructionPct - a.avgObstructionPct,
  )[0];

  if (worstObs && worstObs.avgObstructionPct >= 8) {
    insights.push({
      id: "clear-obstruction",
      title: `Clear sightline for ${worstObs.name}`,
      detail: `Average obstruction ran ${worstObs.avgObstructionPct.toFixed(1)}% (peak ${worstObs.peakObstructionPct.toFixed(1)}%) over this window. Trim trees or raise the mount along the SE boresight, then re-check latency.`,
      priority: "high",
      deviceId: worstObs.id,
      metric: "obstruction",
    });
  }

  if (history.summary.p95LatencyMs >= 70) {
    insights.push({
      id: "latency-tail",
      title: "Cut the latency tail",
      detail: `p95 latency hit ${history.summary.p95LatencyMs} ms. Prefer Ethernet/mesh backhaul near the worst dish and avoid Wi‑Fi congestion during evening peaks.`,
      priority: "medium",
      metric: "latency",
    });
  }

  if (shop && shop.avgDownlinkMbps < history.summary.avgDownlinkMbps * 0.55) {
    insights.push({
      id: "shop-throughput",
      title: `${shop.name} underperforms the fleet`,
      detail: `Shop averaged ${shop.avgDownlinkMbps} Mbps vs fleet ${history.summary.avgDownlinkMbps} Mbps. After clearing obstruction, reboot once via HA and compare the next 24h series.`,
      priority: "medium",
      deviceId: shop.id,
      metric: "throughput",
    });
  }

  if (history.summary.uptimePct < 95) {
    insights.push({
      id: "uptime",
      title: "Improve fleet uptime",
      detail: `Online ratio was ${history.summary.uptimePct}% this window. Review power and travel-mode dishes that left the network unexpectedly outside roam windows.`,
      priority: "low",
      metric: "uptime",
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: "healthy",
      title: "Fleet history looks steady",
      detail:
        "No major regressions in obstruction, latency, or throughput. Keep polling HA and revisit after weather or mount changes.",
      priority: "low",
      metric: "general",
    });
  }

  return insights.slice(0, 4);
}
