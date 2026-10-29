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
}

export interface ThroughputPoint {
  time: string;
  downlink: number;
  uplink: number;
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
