import { getAppConfig, getGrokConfig, getHomeAssistantConfig } from "@/lib/config";
import { getAllDevicePrefs } from "@/lib/device-prefs";
import { checkGrok } from "@/lib/grok";
import {
  callStarlinkService,
  checkHomeAssistant,
  fetchStarlinkDevicesFromHa,
} from "@/lib/home-assistant";
import { buildMockDashboard, buildMockThroughput } from "@/lib/mock-data";
import type {
  DashboardPayload,
  StarlinkAction,
  StarlinkDevice,
  ThroughputPoint,
} from "@/lib/types";

const DOWN_ALERT =
  /offline|unreachable|not connected|no connectivity|dish down|dish offline|link down/i;

/**
 * Travel / roam mode: keep health telemetry accurate, but pause alarming
 * that the dish is down (expected while packed or in transit).
 */
export function applyTravelModeAlarms(
  device: StarlinkDevice,
): StarlinkDevice {
  const roamEnabled = Boolean(device.roamEnabled);
  let alerts = device.alerts.filter(
    (alert) => !alert.startsWith("Travel mode —"),
  );

  if (roamEnabled) {
    alerts = alerts.filter((alert) => !DOWN_ALERT.test(alert));
    return {
      ...device,
      roamEnabled: true,
      alerts,
      alarmsPaused: true,
    };
  }

  if (
    device.health === "offline" &&
    !alerts.some((alert) => DOWN_ALERT.test(alert))
  ) {
    alerts = [...alerts, "Dish offline / unreachable"];
  }

  return {
    ...device,
    roamEnabled: false,
    alerts,
    alarmsPaused: false,
  };
}

async function applyDevicePrefs(
  devices: StarlinkDevice[],
): Promise<StarlinkDevice[]> {
  const prefs = await getAllDevicePrefs();
  return devices.map((device) => {
    const p = prefs[device.id];
    const withPrefs = p
      ? {
          ...device,
          modelId: p.modelId ?? device.modelId,
          roamEnabled: p.roamEnabled ?? device.roamEnabled,
          roamNote: p.roamNote ?? device.roamNote,
        }
      : device;
    return applyTravelModeAlarms(withPrefs);
  });
}

function synthesizeThroughput(
  downlink: number,
  uplink: number,
): ThroughputPoint[] {
  const base = buildMockThroughput(4);
  return base.map((point, index) => {
    const wobble = 0.85 + ((index % 5) / 20);
    return {
      ...point,
      downlink: Math.max(0, downlink * wobble),
      uplink: Math.max(0, uplink * (0.9 + ((index % 3) / 30))),
    };
  });
}

export async function getDashboard(): Promise<DashboardPayload> {
  const { demoModeForced } = getAppConfig();
  const ha = getHomeAssistantConfig();
  const grok = getGrokConfig();
  const grokStatus = await checkGrok();

  if (demoModeForced || !ha.configured) {
    const demo = buildMockDashboard();
    demo.status.grok = {
      configured: grok.configured,
      reachable: grokStatus.reachable,
      message: grokStatus.message,
    };
    if (ha.configured) {
      demo.status.homeAssistant = {
        configured: true,
        reachable: false,
        url: ha.url,
        message: "FORCE_DEMO_MODE is enabled",
      };
    }
    demo.devices = await applyDevicePrefs(demo.devices);
    return demo;
  }

  const haCheck = await checkHomeAssistant();
  if (!haCheck.reachable) {
    const demo = buildMockDashboard();
    demo.status = {
      mode: "demo",
      homeAssistant: {
        configured: true,
        reachable: false,
        url: ha.url,
        message: haCheck.message,
      },
      grok: {
        configured: grok.configured,
        reachable: grokStatus.reachable,
        message: grokStatus.message,
      },
    };
    demo.devices = await applyDevicePrefs(demo.devices);
    return demo;
  }

  try {
    const devices = await applyDevicePrefs(await fetchStarlinkDevicesFromHa());
    const primary = devices.find((d) => d.health === "online") ?? devices[0];
    return {
      status: {
        mode: "live",
        homeAssistant: {
          configured: true,
          reachable: true,
          url: ha.url,
          message: haCheck.message,
        },
        grok: {
          configured: grok.configured,
          reachable: grokStatus.reachable,
          message: grokStatus.message,
        },
      },
      devices,
      throughput: synthesizeThroughput(
        primary?.downlinkMbps ?? 0,
        primary?.uplinkMbps ?? 0,
      ),
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    const demo = buildMockDashboard();
    demo.status = {
      mode: "demo",
      homeAssistant: {
        configured: true,
        reachable: true,
        url: ha.url,
        message:
          error instanceof Error
            ? error.message
            : "Failed to map Starlink entities",
      },
      grok: {
        configured: grok.configured,
        reachable: grokStatus.reachable,
        message: grokStatus.message,
      },
    };
    demo.devices = await applyDevicePrefs(demo.devices);
    return demo;
  }
}

export async function runDeviceAction(
  deviceId: string,
  action: StarlinkAction | "roam_on" | "roam_off",
): Promise<{ ok: boolean; message: string; demo?: boolean }> {
  const ha = getHomeAssistantConfig();
  const { demoModeForced } = getAppConfig();

  if (demoModeForced || !ha.configured) {
    return {
      ok: true,
      demo: true,
      message: `Demo: ${action} queued for ${deviceId}. Connect Home Assistant to execute for real.`,
    };
  }

  const haCheck = await checkHomeAssistant();
  if (!haCheck.reachable) {
    return { ok: false, message: haCheck.message };
  }

  return callStarlinkService(action, deviceId);
}
