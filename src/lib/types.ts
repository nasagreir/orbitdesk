import type { StarlinkModelId } from "@/lib/starlink-models";

export type ConnectionMode = "live" | "demo";

export type DeviceHealth = "online" | "degraded" | "offline" | "unknown";

export type StarlinkAction = "reboot" | "stow" | "unstow";

export interface StarlinkDevice {
  id: string;
  name: string;
  hardwareId: string;
  health: DeviceHealth;
  softwareVersion: string;
  uptimeSeconds: number;
  downlinkMbps: number;
  uplinkMbps: number;
  latencyMs: number;
  obstructionPct: number;
  azimuthDeg: number;
  elevationDeg: number;
  lastUpdated: string;
  alerts: string[];
  haEntityPrefix?: string;
  /** Assigned hardware model for visual tracking */
  modelId?: StarlinkModelId;
  /** Mini roam / travel mode */
  roamEnabled?: boolean;
  roamNote?: string;
  /** Dish is the backup WAN, not the primary circuit */
  wanFailover?: boolean;
  wanFailoverNote?: string;
  /** True when travel or WAN failover has paused offline/down alarming */
  alarmsPaused?: boolean;
  /** Fleet site this dish belongs to. Local dishes use "local". */
  siteId?: string;
  siteName?: string;
  /** True when the dish is reached through a WireGuard remote site */
  viaVpn?: boolean;
}

export interface ThroughputPoint {
  time: string;
  downlink: number;
  uplink: number;
}

export interface SiteStatus {
  id: string;
  name: string;
  reachable: boolean;
  message: string;
  viaVpn: boolean;
  deviceCount: number;
}

export interface VpnStatus {
  configuredSites: number;
  reachableSites: number;
  message: string;
}

export interface IntegrationStatus {
  homeAssistant: {
    configured: boolean;
    reachable: boolean;
    url?: string;
    message: string;
  };
  grok: {
    configured: boolean;
    reachable: boolean;
    message: string;
  };
  mode: ConnectionMode;
  /** Present when the fleet includes more than the local Home Assistant */
  sites?: SiteStatus[];
  vpn?: VpnStatus;
}

export interface WireGuardPublic {
  interfaceName: string;
  address: string;
  listenPort?: number;
  endpoint: string;
  peerPublicKey: string;
  allowedIps: string;
  persistentKeepalive: number;
  publicKey: string;
  hasPrivateKey: boolean;
}

export interface RemoteSitePublic {
  id: string;
  name: string;
  haUrl: string;
  hasToken: boolean;
  entityPrefix: string;
  wireguard: WireGuardPublic;
  createdAt: string;
}

export interface SiteProbeResult {
  siteId: string;
  haReachable: boolean;
  haMessage: string;
  deviceCount: number;
  tunnel: {
    available: boolean;
    up: boolean;
    latestHandshake: string | null;
    message: string;
  };
}

export interface SiteConfigPayload {
  interfaceConf: string;
  remotePeerSnippet: string;
  warning: string;
}

export interface DashboardPayload {
  status: IntegrationStatus;
  devices: StarlinkDevice[];
  throughput: ThroughputPoint[];
  fetchedAt: string;
}

export interface GrokMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface SettingsPublic {
  homeAssistantUrl: string;
  homeAssistantConfigured: boolean;
  grokConfigured: boolean;
  entityPrefix: string;
  pollIntervalSeconds: number;
  demoModeForced: boolean;
}

export type HistoryRange = "24h" | "7d" | "14d";

export interface HistoryDeviceSample {
  name: string;
  health: DeviceHealth;
  downlinkMbps: number;
  uplinkMbps: number;
  latencyMs: number;
  obstructionPct: number;
  alertCount: number;
}

export interface HistoryPoint {
  at: string;
  deviceCount: number;
  onlineCount: number;
  avgDownlinkMbps: number;
  avgUplinkMbps: number;
  avgLatencyMs: number;
  avgObstructionPct: number;
  alertCount: number;
  degradedCount: number;
  offlineCount: number;
  byDevice: Record<string, HistoryDeviceSample>;
}

export interface HistorySummary {
  sampleCount: number;
  avgDownlinkMbps: number;
  peakDownlinkMbps: number;
  bestDownlinkMbps: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  avgObstructionPct: number;
  peakObstructionPct: number;
  totalAlertSamples: number;
  uptimePct: number;
  worstDayLabel: string | null;
}

export interface HistorySeriesPoint {
  label: string;
  at: string;
  downlinkMbps: number;
  uplinkMbps: number;
  latencyMs: number;
  obstructionPct: number;
  alertCount: number;
  onlinePct: number;
}

export interface HistoryDeviceStats {
  id: string;
  name: string;
  avgDownlinkMbps: number;
  avgLatencyMs: number;
  avgObstructionPct: number;
  peakObstructionPct: number;
  uptimePct: number;
  alertSamples: number;
}

export interface HistoryPayload {
  range: HistoryRange;
  fetchedAt: string;
  summary: HistorySummary;
  series: HistorySeriesPoint[];
  devices: HistoryDeviceStats[];
}

export type HistoryInsightPriority = "high" | "medium" | "low";

export interface HistoryInsight {
  id: string;
  title: string;
  detail: string;
  priority: HistoryInsightPriority;
  deviceId?: string;
  metric?: string;
}

export interface HistoryInsightsPayload {
  range: HistoryRange;
  demo: boolean;
  insights: HistoryInsight[];
  fetchedAt: string;
}
