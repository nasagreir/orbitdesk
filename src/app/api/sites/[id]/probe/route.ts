import { connection, NextResponse } from "next/server";
import {
  checkHomeAssistantTarget,
  fetchStarlinkDevicesFromTarget,
} from "@/lib/home-assistant";
import { getStoredSite } from "@/lib/sites";
import type { SiteProbeResult } from "@/lib/types";
import { readPeerStatus } from "@/lib/wireguard";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await connection();
  const { id } = await context.params;
  if (!/^site_[a-f0-9]{12}$/.test(id)) {
    return NextResponse.json({ error: "Unknown site" }, { status: 404 });
  }
  const site = await getStoredSite(id);
  if (!site) return NextResponse.json({ error: "Unknown site" }, { status: 404 });

  const target = { url: site.haUrl, token: site.haToken };
  const [tunnel, check] = await Promise.all([
    readPeerStatus(site.wireguard.interfaceName, site.wireguard.peerPublicKey),
    checkHomeAssistantTarget(target, true),
  ]);

  let deviceCount = 0;
  let haMessage = check.message;
  if (check.reachable) {
    try {
      const devices = await fetchStarlinkDevicesFromTarget(target, true);
      deviceCount = devices.length;
      haMessage =
        deviceCount === 0
          ? "Connected, no Starlink entities at this site"
          : `Connected, ${deviceCount} dish${deviceCount === 1 ? "" : "es"}`;
    } catch (error) {
      haMessage = error instanceof Error ? error.message : "Failed to read dishes";
    }
  }

  const payload: SiteProbeResult = {
    siteId: site.id,
    haReachable: check.reachable && !haMessage.startsWith("Failed"),
    haMessage,
    deviceCount,
    tunnel,
  };
  return NextResponse.json(payload);
}
