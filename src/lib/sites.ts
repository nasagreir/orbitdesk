import { promises as fs } from "node:fs";
import path from "node:path";
import { getDataDir } from "@/lib/auth/paths";
import { assertHaUrlResolvesSafely, normalizeHaUrl } from "@/lib/safe-url";
import type { RemoteSitePublic, SiteConfigPayload } from "@/lib/types";
import {
  generateWireGuardKeypair,
  newSiteId,
  renderInterfaceConf,
  renderRemotePeerSnippet,
  type WireGuardKeys,
} from "@/lib/wireguard";

const CIDR =
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\/(?:[0-9]|[12]\d|3[0-2])$|^(?:[0-9a-fA-F:]{2,})\/(?:[0-9]|[1-9]\d|1[01]\d|12[0-8])$/;

const WG_KEY = /^[A-Za-z0-9+/]{42,43}=$|^[A-Za-z0-9+/]{43,44}$/;

export interface StoredWireGuard {
  interfaceName: string;
  address: string;
  listenPort?: number;
  endpoint: string;
  peerPublicKey: string;
  allowedIps: string;
  persistentKeepalive: number;
  privateKey: string;
  publicKey: string;
}

export interface StoredSite {
  id: string;
  name: string;
  haUrl: string;
  haToken: string;
  entityPrefix: string;
  wireguard: StoredWireGuard;
  createdAt: string;
}

interface SitesFile {
  sites: StoredSite[];
}

export interface SiteDraft {
  name: string;
  haUrl: string;
  haToken: string;
  entityPrefix?: string;
  interfaceName?: string;
  address: string;
  listenPort?: number;
  endpoint: string;
  peerPublicKey: string;
  allowedIps: string;
  persistentKeepalive?: number;
}

function sitesPath() {
  return path.join(getDataDir(), "sites.json");
}

async function ensureDataDir() {
  await fs.mkdir(getDataDir(), { recursive: true });
}

async function readSitesFile(): Promise<SitesFile> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(sitesPath(), "utf8");
    const parsed = JSON.parse(raw) as SitesFile;
    return {
      sites: Array.isArray(parsed?.sites) ? parsed.sites : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { sites: [] };
    }
    throw error;
  }
}

async function writeSitesFile(data: SitesFile) {
  await ensureDataDir();
  const file = sitesPath();
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(tmp, file);
}

function assertCidr(value: string, label: string) {
  if (!CIDR.test(value.trim())) {
    throw new Error(`${label} must be an IP CIDR such as 10.77.0.1/24`);
  }
}

function assertAllowedIps(value: string) {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0 || parts.length > 16) {
    throw new Error("Allowed IPs needs 1 to 16 CIDRs, comma-separated");
  }
  for (const part of parts) {
    if (!CIDR.test(part)) {
      throw new Error(`Allowed IP ${part} is not a CIDR`);
    }
  }
  return parts.join(", ");
}

function assertEndpoint(value: string) {
  const trimmed = value.trim();
  const match = /^(.*):(\d{1,5})$/.exec(trimmed);
  if (!match) {
    throw new Error("Endpoint must look like vpn.example.com:51820");
  }
  const port = Number(match[2]);
  const host = match[1] ?? "";
  if (port < 1 || port > 65535 || !host || host.includes(" ")) {
    throw new Error("Endpoint must look like vpn.example.com:51820");
  }
  if (host.startsWith("[") && !host.endsWith("]")) {
    throw new Error("IPv6 endpoints belong in brackets, like [fd00::1]:51820");
  }
  return trimmed;
}

function assertPeerKey(value: string) {
  const trimmed = value.trim();
  if (!WG_KEY.test(trimmed)) {
    throw new Error("Peer public key should be the WireGuard base64 key");
  }
  return trimmed;
}

function assertInterfaceName(value: string | undefined) {
  const name = (value?.trim() || "wg-orbit").slice(0, 15);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,14}$/.test(name)) {
    throw new Error("Interface name must be 1–15 letters, numbers, _ or -");
  }
  return name;
}

export function toPublicSite(site: StoredSite): RemoteSitePublic {
  return {
    id: site.id,
    name: site.name,
    haUrl: site.haUrl,
    hasToken: Boolean(site.haToken),
    entityPrefix: site.entityPrefix,
    createdAt: site.createdAt,
    wireguard: {
      interfaceName: site.wireguard.interfaceName,
      address: site.wireguard.address,
      listenPort: site.wireguard.listenPort,
      endpoint: site.wireguard.endpoint,
      peerPublicKey: site.wireguard.peerPublicKey,
      allowedIps: site.wireguard.allowedIps,
      persistentKeepalive: site.wireguard.persistentKeepalive,
      publicKey: site.wireguard.publicKey,
      hasPrivateKey: Boolean(site.wireguard.privateKey),
    },
  };
}

export function siteConfig(site: StoredSite): SiteConfigPayload {
  return {
    interfaceConf: renderInterfaceConf(site.wireguard),
    remotePeerSnippet: renderRemotePeerSnippet(
      site.wireguard.publicKey,
      site.wireguard.address,
    ),
    warning:
      "The interface config contains this host's WireGuard private key. Keep it on the machine that owns the tunnel.",
  };
}

export async function listStoredSites(): Promise<StoredSite[]> {
  const data = await readSitesFile();
  return [...data.sites].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getStoredSite(id: string): Promise<StoredSite | null> {
  const data = await readSitesFile();
  return data.sites.find((site) => site.id === id) ?? null;
}

export async function createStoredSite(
  draft: SiteDraft,
  keys: WireGuardKeys = generateWireGuardKeypair(),
): Promise<StoredSite> {
  const name = draft.name.trim();
  if (name.length < 1 || name.length > 60) {
    throw new Error("Site name must be 1–60 characters");
  }
  const haUrl = normalizeHaUrl(draft.haUrl);
  const haToken = draft.haToken.trim();
  if (haToken.length < 8 || haToken.length > 2000) {
    throw new Error("Home Assistant token is missing");
  }
  const entityPrefix = (draft.entityPrefix ?? "").trim();
  if (entityPrefix.length > 80) {
    throw new Error("Entity prefix is too long");
  }

  assertCidr(draft.address, "Tunnel address");
  const allowedIps = assertAllowedIps(draft.allowedIps);
  const endpoint = assertEndpoint(draft.endpoint);
  const peerPublicKey = assertPeerKey(draft.peerPublicKey);
  const interfaceName = assertInterfaceName(draft.interfaceName);
  const listenPort = draft.listenPort;
  if (
    listenPort !== undefined &&
    (!Number.isInteger(listenPort) || listenPort < 1 || listenPort > 65535)
  ) {
    throw new Error("Listen port must be between 1 and 65535");
  }
  const persistentKeepalive = draft.persistentKeepalive ?? 25;
  if (
    !Number.isInteger(persistentKeepalive) ||
    persistentKeepalive < 0 ||
    persistentKeepalive > 65535
  ) {
    throw new Error("Persistent keepalive must be between 0 and 65535");
  }

  const site: StoredSite = {
    id: newSiteId(),
    name,
    haUrl,
    haToken,
    entityPrefix,
    createdAt: new Date().toISOString(),
    wireguard: {
      interfaceName,
      address: draft.address.trim(),
      listenPort,
      endpoint,
      peerPublicKey,
      allowedIps,
      persistentKeepalive,
      privateKey: keys.privateKey,
      publicKey: keys.publicKey,
    },
  };

  const data = await readSitesFile();
  data.sites.push(site);
  await writeSitesFile(data);
  return site;
}

export async function deleteStoredSite(id: string): Promise<boolean> {
  const data = await readSitesFile();
  const next = data.sites.filter((site) => site.id !== id);
  if (next.length === data.sites.length) return false;
  await writeSitesFile({ sites: next });
  return true;
}

export async function prepareSiteFetch(site: StoredSite): Promise<void> {
  await assertHaUrlResolvesSafely(site.haUrl);
}

export function splitScopedDeviceId(id: string): {
  siteId: string | null;
  deviceId: string;
} {
  const index = id.indexOf(":");
  if (index <= 0) return { siteId: null, deviceId: id };
  return { siteId: id.slice(0, index), deviceId: id.slice(index + 1) };
}
