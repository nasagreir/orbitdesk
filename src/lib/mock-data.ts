import type {
  DashboardPayload,
  StarlinkDevice,
  ThroughputPoint,
} from "@/lib/types";

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

export const MOCK_DEVICES: StarlinkDevice[] = [
  {
    id: "dish-cabin",
    name: "Cabin Dish",
    hardwareId: "ut01000000-00000000-000a1b2c",
    health: "online",
    softwareVersion: "2025.08.15.mr69420",
    uptimeSeconds: 86_400 * 12 + 3_600 * 4,
    downlinkMbps: 184.2,
    uplinkMbps: 22.6,
    latencyMs: 31,
    obstructionPct: 1.8,
    azimuthDeg: 142.4,
    elevationDeg: 68.1,
    lastUpdated: new Date().toISOString(),
    alerts: [],
    haEntityPrefix: "sensor.starlink_cabin",
    modelId: "standard-gen3",
    siteId: "local",
    siteName: "This site",
    viaVpn: false,
  },
  {
    id: "dish-shop",
    name: "Shop Dish",
    hardwareId: "ut01000000-00000000-000d4e5f",
    health: "degraded",
    softwareVersion: "2025.08.15.mr69420",
    uptimeSeconds: 86_400 * 2 + 3_600 * 9,
    downlinkMbps: 41.5,
    uplinkMbps: 8.1,
    latencyMs: 78,
    obstructionPct: 12.4,
    azimuthDeg: 118.9,
    elevationDeg: 54.2,
    lastUpdated: hoursAgo(0.05),
    alerts: [
      "Obstruction above 10% — clear tree line to the SE",
      "Latency elevated vs cabin dish",
    ],
    haEntityPrefix: "sensor.starlink_shop",
    modelId: "standard-gen2",
    siteId: "local",
    siteName: "This site",
    viaVpn: false,
  },
  {
    id: "dish-rv",
    name: "RV Mini",
    hardwareId: "ut02000000-00000000-000f6a7b",
    health: "offline",
    softwareVersion: "2025.06.02.mr65110",
    uptimeSeconds: 86_400 * 1 + 3_600 * 3,
    downlinkMbps: 0,
    uplinkMbps: 0,
    latencyMs: 0,
    obstructionPct: 0,
    azimuthDeg: 201.0,
    elevationDeg: 61.5,
    lastUpdated: hoursAgo(2),
    // Offline while traveling — applyTravelModeAlarms pauses down alerts
    alerts: ["Dish offline / unreachable"],
    haEntityPrefix: "sensor.starlink_rv",
    modelId: "mini",
    roamEnabled: true,
    roamNote: "Gulf Coast trip",
    siteId: "local",
    siteName: "This site",
    viaVpn: false,
  },
  {
    id: "north-barn:dish-barn",
    name: "Barn Dish",
    hardwareId: "ut03000000-00000000-000c8d9e",
    health: "online",
    softwareVersion: "2025.09.01.mr70110",
    uptimeSeconds: 86_400 * 41 + 3_600 * 6,
    downlinkMbps: 126.4,
    uplinkMbps: 14.8,
    latencyMs: 38,
    obstructionPct: 2.1,
    azimuthDeg: 176.2,
    elevationDeg: 63.4,
    lastUpdated: new Date().toISOString(),
    alerts: [],
    haEntityPrefix: "sensor.starlink_barn",
    modelId: "high-performance",
    siteId: "north-barn",
    siteName: "North barn",
    viaVpn: true,
  },
];

export function buildMockThroughput(hours = 6): ThroughputPoint[] {
  const points: ThroughputPoint[] = [];
  const now = Date.now();
  for (let i = hours * 12; i >= 0; i -= 1) {
    const t = new Date(now - i * 5 * 60 * 1000);
    const wave = Math.sin(i / 7) * 0.35 + Math.cos(i / 13) * 0.2;
    points.push({
      time: t.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      }),
      downlink: Math.max(12, 150 + wave * 80 + (i % 5) * 3),
      uplink: Math.max(3, 18 + wave * 8 + (i % 3)),
    });
  }
  return points;
}

export function buildMockDashboard(): DashboardPayload {
  return {
    status: {
      mode: "demo",
      homeAssistant: {
        configured: false,
        reachable: false,
        message:
          "Demo mode — set HOME_ASSISTANT_URL and HOME_ASSISTANT_TOKEN to go live",
      },
      grok: {
        configured: false,
        reachable: false,
        message: "Demo mode — set GROK_API_KEY (xAI) to enable the assistant",
      },
      sites: [
        {
          id: "local",
          name: "This site",
          reachable: true,
          message: "Demo dishes on this OrbitDesk host",
          viaVpn: false,
          deviceCount: 3,
        },
        {
          id: "north-barn",
          name: "North barn",
          reachable: true,
          message: "Demo WireGuard path — handshake 12s ago",
          viaVpn: true,
          deviceCount: 1,
        },
        {
          id: "lake-camp",
          name: "Lake camp",
          reachable: false,
          message: "Site unreachable over VPN",
          viaVpn: true,
          deviceCount: 0,
        },
      ],
      vpn: {
        configuredSites: 2,
        reachableSites: 1,
        message: "1 of 2 remote sites reachable",
      },
    },
    devices: MOCK_DEVICES,
    throughput: buildMockThroughput(),
    fetchedAt: new Date().toISOString(),
  };
}
