import { getAppConfig, getGrokConfig, getHomeAssistantConfig } from "@/lib/config";
import { getAllDevicePrefs } from "@/lib/device-prefs";
import { checkGrok } from "@/lib/grok";
import {
  ensureSeedHistory,
  recordHistorySnapshot,
} from "@/lib/history";
import {
  callStarlinkService,
  checkHomeAssistantTarget,
  fetchStarlinkDevicesFromTarget,
} from "@/lib/home-assistant";
import { buildMockDashboard, buildMockThroughput } from "@/lib/mock-data";
import { getStoredSite, listStoredSites, splitScopedDeviceId } from "@/lib/sites";
import type { StoredSite } from "@/lib/sites";
import type {
  DashboardPayload,
  SiteStatus,
  StarlinkAction,
  StarlinkDevice,
  ThroughputPoint,
  VpnStatus,
} from "@/lib/types";
import { readPeerStatus } from "@/lib/wireguard";

async function persistHistory(devices: StarlinkDevice[]) {
  try {
    await ensureSeedHistory(devices);
    await recordHistorySnapshot(devices);
  } catch {
    // History is best-effort — never block the live dashboard
  }
}

const DOWN_ALERT =
  /offline|unreachable|not connected|no connectivity|dish down|dish offline|link down/i;

/**
 * Travel and WAN failover: keep health telemetry accurate, but pause
 * alarming that the dish is down. Travel means it is packed. WAN failover
 * means it is the backup circuit and idle is expected.
 */
export function applyTravelModeAlarms(
  device: StarlinkDevice,
): StarlinkDevice {
  const roamEnabled = Boolean(device.roamEnabled);
  const wanFailover = Boolean(device.wanFailover);
  let alerts = device.alerts.filter(
    (alert) =>
      !alert.startsWith("Travel mode —") &&
      !alert.startsWith("WAN failover —"),
  );

  if (roamEnabled || wanFailover) {
    alerts = alerts.filter((alert) => !DOWN_ALERT.test(alert));
    return {
      ...device,
      roamEnabled,
      wanFailover,
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
    wanFailover: false,
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
          wanFailover: p.wanFailover ?? device.wanFailover,
          wanFailoverNote: p.wanFailoverNote ?? device.wanFailoverNote,
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

function filterByEntityPrefix(
  devices: StarlinkDevice[],
  prefix: string,
): StarlinkDevice[] {
  const normalized = prefix.trim();
  if (!normalized) return devices;
  return devices.filter((device) =>
    (device.haEntityPrefix ?? "").startsWith(normalized),
  );
}

function tagLocal(devices: StarlinkDevice[]): StarlinkDevice[] {
  return devices.map((device) => ({
    ...device,
    siteId: "local",
    siteName: "This site",
    viaVpn: false,
  }));
}

function tagRemote(site: StoredSite, devices: StarlinkDevice[]): StarlinkDevice[] {
  return devices.map((device) => ({
    ...device,
    id: `${site.id}:${device.id}`,
    siteId: site.id,
    siteName: site.name,
    viaVpn: true,
  }));
}

function vpnSummary(sites: SiteStatus[]): VpnStatus {
  const remote = sites.filter((site) => site.viaVpn);
  const reachable = remote.filter((site) => site.reachable).length;
  const message =
    remote.length === 0
      ? "No remote sites saved"
      : reachable === remote.length
        ? `${reachable} remote site${reachable === 1 ? "" : "s"} reachable`
        : `${reachable} of ${remote.length} remote sites reachable`;
  return {
    configuredSites: remote.length,
    reachableSites: reachable,
    message,
  };
}

interface PolledSite {
  ok: boolean;
  devices: StarlinkDevice[];
  status: SiteStatus;
}

async function pollLocal(): Promise<
  PolledSite & {
    homeAssistant: DashboardPayload["status"]["homeAssistant"];
  }
> {
  const ha = getHomeAssistantConfig();
  if (!ha.configured) {
    return {
      ok: false,
      devices: [],
      homeAssistant: {
        configured: false,
        reachable: false,
        message:
          "Demo mode — set HOME_ASSISTANT_URL and HOME_ASSISTANT_TOKEN to go live",
      },
      status: {
        id: "local",
        name: "This site",
        reachable: false,
        message: "Home Assistant is not configured on this host",
        viaVpn: false,
        deviceCount: 0,
      },
    };
  }

  const target = { url: ha.url, token: ha.token };
  const check = await checkHomeAssistantTarget(target, false);
  if (!check.reachable) {
    return {
      ok: false,
      devices: [],
      homeAssistant: {
        configured: true,
        reachable: false,
        url: ha.url,
        message: check.message,
      },
      status: {
        id: "local",
        name: "This site",
        reachable: false,
        message: check.message,
        viaVpn: false,
        deviceCount: 0,
      },
    };
  }

  try {
    const devices = tagLocal(await fetchStarlinkDevicesFromTarget(target, false));
    const message =
      devices.length === 0
        ? "Connected, no Starlink entities on this host"
        : check.message;
    return {
      ok: true,
      devices,
      homeAssistant: {
        configured: true,
        reachable: true,
        url: ha.url,
        message,
      },
      status: {
        id: "local",
        name: "This site",
        reachable: true,
        message,
        viaVpn: false,
        deviceCount: devices.length,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to map Starlink entities";
    return {
      ok: false,
      devices: [],
      homeAssistant: {
        configured: true,
        reachable: true,
        url: ha.url,
        message,
      },
      status: {
        id: "local",
        name: "This site",
        reachable: false,
        message,
        viaVpn: false,
        deviceCount: 0,
      },
    };
  }
}

async function pollRemote(site: StoredSite): Promise<PolledSite> {
  const target = { url: site.haUrl, token: site.haToken };
  const [tunnel, check] = await Promise.all([
    readPeerStatus(site.wireguard.interfaceName, site.wireguard.peerPublicKey),
    checkHomeAssistantTarget(target, true),
  ]);
  if (!check.reachable) {
    const message = tunnel.available
      ? `${check.message}. ${tunnel.message}`
      : check.message;
    return {
      ok: false,
      devices: [],
      status: {
        id: site.id,
        name: site.name,
        reachable: false,
        message,
        viaVpn: true,
        deviceCount: 0,
      },
    };
  }

  try {
    const devices = tagRemote(
      site,
      filterByEntityPrefix(
        await fetchStarlinkDevicesFromTarget(target, true),
        site.entityPrefix,
      ),
    );
    const haMessage =
      devices.length === 0
        ? "Connected, no Starlink entities at this site"
        : "Connected to Home Assistant";
    return {
      ok: true,
      devices,
      status: {
        id: site.id,
        name: site.name,
        reachable: true,
        message: `${haMessage}. ${tunnel.message}`,
        viaVpn: true,
        deviceCount: devices.length,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to map Starlink entities";
    return {
      ok: false,
      devices: [],
      status: {
        id: site.id,
        name: site.name,
        reachable: false,
        message,
        viaVpn: true,
        deviceCount: 0,
      },
    };
  }
}

async function demoFallback(
  homeAssistant: DashboardPayload["status"]["homeAssistant"],
  grok: DashboardPayload["status"]["grok"],
  sites: SiteStatus[] | undefined,
): Promise<DashboardPayload> {
  const demo = buildMockDashboard();
  demo.status.homeAssistant = homeAssistant;
  demo.status.grok = grok;
  const savedRemote = (sites ?? []).some((site) => site.viaVpn);
  if (savedRemote && sites) {
    demo.devices = demo.devices.filter((device) => !device.viaVpn);
    demo.status.sites = sites;
    demo.status.vpn = vpnSummary(sites);
    demo.status.homeAssistant = {
      ...homeAssistant,
      message: `${homeAssistant.message}. No live site answered, so demo dishes are shown.`,
    };
  }
  demo.devices = await applyDevicePrefs(demo.devices);
  await persistHistory(demo.devices);
  return demo;
}

export async function getDashboard(): Promise<DashboardPayload> {
  const { demoModeForced } = getAppConfig();
  const grok = getGrokConfig();
  const grokStatus = await checkGrok();
  const grokBlock = {
    configured: grok.configured,
    reachable: grokStatus.reachable,
    message: grokStatus.message,
  };

  if (demoModeForced) {
    const ha = getHomeAssistantConfig();
    return demoFallback(
      {
        configured: ha.configured,
        reachable: false,
        url: ha.configured ? ha.url : undefined,
        message: ha.configured
          ? "FORCE_DEMO_MODE is enabled"
          : "Demo mode — set HOME_ASSISTANT_URL and HOME_ASSISTANT_TOKEN to go live",
      },
      grokBlock,
      undefined,
    );
  }

  const saved = await listStoredSites();
  const [local, ...remotes] = await Promise.all([
    pollLocal(),
    ...saved.map((site) => pollRemote(site)),
  ]);

  const siteStatuses = [local.status, ...remotes.map((remote) => remote.status)];
  const liveDevices = [
    ...local.devices,
    ...remotes.flatMap((remote) => remote.devices),
  ];
  const anyLive = local.ok || remotes.some((remote) => remote.ok);

  if (!anyLive) {
    return demoFallback(local.homeAssistant, grokBlock, siteStatuses);
  }

  const devices = await applyDevicePrefs(liveDevices);
  const primary = devices.find((device) => device.health === "online") ?? devices[0];
  await persistHistory(devices);
  return {
    status: {
      mode: "live",
      homeAssistant: local.homeAssistant,
      grok: grokBlock,
      sites: siteStatuses,
      vpn: vpnSummary(siteStatuses),
    },
    devices,
    throughput: synthesizeThroughput(
      primary?.downlinkMbps ?? 0,
      primary?.uplinkMbps ?? 0,
    ),
    fetchedAt: new Date().toISOString(),
  };
}

export async function runDeviceAction(
  scopedId: string,
  action: StarlinkAction | "roam_on" | "roam_off",
): Promise<{ ok: boolean; message: string; demo?: boolean }> {
  const { demoModeForced } = getAppConfig();
  const { siteId, deviceId } = splitScopedDeviceId(scopedId);

  if (siteId) {
    if (demoModeForced) {
      return {
        ok: true,
        demo: true,
        message: `Demo: ${action} queued for ${scopedId}. Turn off FORCE_DEMO_MODE to run it at the remote site.`,
      };
    }
    const site = await getStoredSite(siteId);
    if (!site) {
      return {
        ok: true,
        demo: true,
        message: `Demo: ${action} queued for ${scopedId}. Save the site under Connections to execute for real.`,
      };
    }
    const check = await checkHomeAssistantTarget(
      { url: site.haUrl, token: site.haToken },
      true,
    );
    if (!check.reachable) return { ok: false, message: check.message };
    return callStarlinkService(action, deviceId, {
      url: site.haUrl,
      token: site.haToken,
    });
  }

  const ha = getHomeAssistantConfig();
  if (demoModeForced || !ha.configured) {
    return {
      ok: true,
      demo: true,
      message: `Demo: ${action} queued for ${scopedId}. Connect Home Assistant to execute for real.`,
    };
  }

  const haCheck = await checkHomeAssistantTarget(
    { url: ha.url, token: ha.token },
    false,
  );
  if (!haCheck.reachable) {
    return { ok: false, message: haCheck.message };
  }

  return callStarlinkService(action, deviceId);
}
