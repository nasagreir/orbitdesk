import { getHomeAssistantConfig } from "@/lib/config";
import type { StarlinkDevice, DeviceHealth } from "@/lib/types";

interface HaState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
}

function num(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function pickState(
  states: HaState[],
  candidates: string[],
): HaState | undefined {
  const byId = new Map(states.map((s) => [s.entity_id, s]));
  for (const id of candidates) {
    const hit = byId.get(id);
    if (hit && hit.state !== "unavailable" && hit.state !== "unknown") {
      return hit;
    }
  }
  // Fuzzy match on suffix
  for (const id of candidates) {
    const suffix = id.split(".").pop() ?? id;
    const fuzzy = states.find(
      (s) =>
        s.entity_id.endsWith(suffix) &&
        s.state !== "unavailable" &&
        s.state !== "unknown",
    );
    if (fuzzy) return fuzzy;
  }
  return undefined;
}

function healthFromStates(
  online?: HaState,
  obstructionPct?: number,
  latencyMs?: number,
): DeviceHealth {
  if (!online) return "unknown";
  const state = online.state.toLowerCase();
  if (["off", "offline", "unavailable", "unknown"].includes(state)) {
    return "offline";
  }
  if ((obstructionPct ?? 0) >= 10 || (latencyMs ?? 0) >= 80) {
    return "degraded";
  }
  return "online";
}

function groupStarlinkEntities(states: HaState[]): Map<string, HaState[]> {
  const groups = new Map<string, HaState[]>();
  for (const state of states) {
    const id = state.entity_id.toLowerCase();
    if (!id.includes("starlink")) continue;
    // sensor.starlink_cabin_downlink_throughput → cabin
    // sensor.starlink_downlink_throughput → default
    const withoutDomain = id.split(".").slice(1).join(".");
    const stripped = withoutDomain.replace(/^starlink_?/, "");
    const metricHints = [
      "downlink",
      "uplink",
      "ping",
      "latency",
      "uptime",
      "obstruction",
      "azimuth",
      "elevation",
      "altitude",
      "boot",
      "software",
      "hardware",
      "status",
      "connected",
      "roaming",
    ];
    let groupKey = "default";
    for (const hint of metricHints) {
      if (stripped === hint || stripped.startsWith(`${hint}_`)) {
        groupKey = "default";
        break;
      }
      if (stripped.includes(`_${hint}`)) {
        groupKey = stripped.slice(0, stripped.lastIndexOf(`_${hint}`));
        break;
      }
    }
    if (groupKey === "default" && stripped.includes("_")) {
      // e.g. cabin_downlink_throughput
      const parts = stripped.split("_");
      if (parts.length > 1 && !metricHints.includes(parts[0])) {
        groupKey = parts[0];
      }
    }
    const list = groups.get(groupKey) ?? [];
    list.push(state);
    groups.set(groupKey, list);
  }
  return groups;
}

function deviceFromGroup(
  groupKey: string,
  states: HaState[],
): StarlinkDevice {
  const prefix = groupKey === "default" ? "starlink" : `starlink_${groupKey}`;
  const downlink = pickState(states, [
    `sensor.${prefix}_downlink_throughput`,
    `sensor.${prefix}_download`,
  ]);
  const uplink = pickState(states, [
    `sensor.${prefix}_uplink_throughput`,
    `sensor.${prefix}_upload`,
  ]);
  const ping = pickState(states, [
    `sensor.${prefix}_ping`,
    `sensor.${prefix}_latency`,
    `sensor.${prefix}_ping_drop_rate`,
  ]);
  const uptime = pickState(states, [
    `sensor.${prefix}_uptime`,
    `sensor.${prefix}_boot_time`,
  ]);
  const obstruction = pickState(states, [
    `sensor.${prefix}_obstruction`,
    `sensor.${prefix}_obstruction_percentage`,
  ]);
  const azimuth = pickState(states, [`sensor.${prefix}_azimuth`]);
  const elevation = pickState(states, [`sensor.${prefix}_elevation`]);
  const software = pickState(states, [
    `sensor.${prefix}_software`,
    `sensor.${prefix}_software_version`,
  ]);
  const hardware = pickState(states, [
    `sensor.${prefix}_hardware`,
    `sensor.${prefix}_hardware_id`,
    `sensor.${prefix}_id`,
  ]);
  const status = pickState(states, [
    `binary_sensor.${prefix}_connected`,
    `sensor.${prefix}_status`,
    `binary_sensor.${prefix}_online`,
  ]);

  const obstructionPct = num(obstruction?.state);
  const latencyMs = num(ping?.state);
  const alerts: string[] = [];
  if (obstructionPct >= 10) {
    alerts.push(`Obstruction at ${obstructionPct.toFixed(1)}%`);
  }
  if (latencyMs >= 80) {
    alerts.push(`Latency elevated (${latencyMs.toFixed(0)} ms)`);
  }

  const displayName =
    groupKey === "default"
      ? "Starlink Dish"
      : `${groupKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} Dish`;

  return {
    id: groupKey,
    name: displayName,
    hardwareId: String(hardware?.state ?? hardware?.attributes.id ?? "unknown"),
    health: healthFromStates(status ?? downlink, obstructionPct, latencyMs),
    softwareVersion: String(software?.state ?? "unknown"),
    uptimeSeconds: num(uptime?.state),
    downlinkMbps: num(downlink?.state),
    uplinkMbps: num(uplink?.state),
    latencyMs,
    obstructionPct,
    azimuthDeg: num(azimuth?.state),
    elevationDeg: num(elevation?.state),
    lastUpdated:
      downlink?.last_updated ??
      status?.last_updated ??
      new Date().toISOString(),
    alerts,
    haEntityPrefix: `sensor.${prefix}`,
  };
}

export async function haFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const { url, token, configured } = getHomeAssistantConfig();
  if (!configured) {
    throw new Error("Home Assistant is not configured");
  }
  return fetch(`${url}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
}

export async function checkHomeAssistant(): Promise<{
  reachable: boolean;
  message: string;
  url?: string;
}> {
  const { url, configured } = getHomeAssistantConfig();
  if (!configured) {
    return {
      reachable: false,
      message: "HOME_ASSISTANT_URL / HOME_ASSISTANT_TOKEN not set",
    };
  }
  try {
    const res = await haFetch("/api/", { method: "GET" });
    if (!res.ok) {
      return {
        reachable: false,
        url,
        message: `Home Assistant responded ${res.status}`,
      };
    }
    return {
      reachable: true,
      url,
      message: "Connected to Home Assistant",
    };
  } catch (error) {
    return {
      reachable: false,
      url,
      message:
        error instanceof Error
          ? error.message
          : "Failed to reach Home Assistant",
    };
  }
}

export async function fetchStarlinkDevicesFromHa(): Promise<StarlinkDevice[]> {
  const res = await haFetch("/api/states");
  if (!res.ok) {
    throw new Error(`Failed to load HA states (${res.status})`);
  }
  const states = (await res.json()) as HaState[];
  const groups = groupStarlinkEntities(states);
  if (groups.size === 0) {
    throw new Error(
      "No Starlink entities found in Home Assistant. Install the Starlink integration and expose dish sensors.",
    );
  }
  return [...groups.entries()].map(([key, groupStates]) =>
    deviceFromGroup(key, groupStates),
  );
}

export async function callStarlinkService(
  action: "reboot" | "stow" | "unstow" | "roam_on" | "roam_off",
  deviceId: string,
): Promise<{ ok: boolean; message: string }> {
  if (action === "roam_on" || action === "roam_off") {
    const entityCandidates = [
      `switch.starlink_${deviceId}_roam`,
      `switch.starlink_mini_roam`,
      `switch.starlink_roam`,
      `switch.starlink_${deviceId}_roaming`,
    ];
    const turnOn = action === "roam_on";
    const service = turnOn ? "turn_on" : "turn_off";
    let lastError = "No matching roam switch entity found";
    for (const entityId of entityCandidates) {
      const res = await haFetch(`/api/services/switch/${service}`, {
        method: "POST",
        body: JSON.stringify({ entity_id: entityId }),
      });
      if (res.ok) {
        return {
          ok: true,
          message: `${turnOn ? "Enabled" : "Disabled"} roam via ${entityId}`,
        };
      }
      lastError = `HA ${res.status} for ${entityId}`;
    }
    return { ok: false, message: lastError };
  }

  const dishAction = action;
  const buttonMap: Record<"reboot" | "stow" | "unstow", string[]> = {
    reboot: [
      `button.starlink_${deviceId}_reboot`,
      `button.starlink_reboot`,
      `button.starlink_${deviceId}_restart`,
    ],
    stow: [`button.starlink_${deviceId}_stow`, `button.starlink_stow`],
    unstow: [
      `button.starlink_${deviceId}_unstow`,
      `button.starlink_unstow`,
    ],
  };

  const candidates =
    deviceId === "default"
      ? buttonMap[dishAction].filter((id) => !id.includes("_default_"))
      : buttonMap[dishAction];

  let lastError = "No matching button entity found";
  for (const entityId of candidates) {
    const res = await haFetch("/api/services/button/press", {
      method: "POST",
      body: JSON.stringify({ entity_id: entityId }),
    });
    if (res.ok) {
      return { ok: true, message: `Pressed ${entityId}` };
    }
    lastError = `HA ${res.status} for ${entityId}`;
  }

  const serviceFallback: Record<"reboot" | "stow" | "unstow", [string, string]> =
    {
      reboot: ["starlink", "reboot"],
      stow: ["starlink", "stow"],
      unstow: ["starlink", "unstow"],
    };
  const [domain, service] = serviceFallback[dishAction];
  const fallback = await haFetch(`/api/services/${domain}/${service}`, {
    method: "POST",
    body: JSON.stringify({ device_id: deviceId }),
  });
  if (fallback.ok) {
    return { ok: true, message: `Called ${domain}.${service}` };
  }

  return { ok: false, message: lastError };
}
