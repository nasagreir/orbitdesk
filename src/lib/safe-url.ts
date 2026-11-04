import { lookup } from "node:dns/promises";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google.com",
]);

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value << 8) + octet;
  }
  return value >>> 0;
}

/** Loopback, unspecified, and link-local (includes the cloud metadata address). */
export function isBlockedIp(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (lower === "::1" || lower === "0:0:0:0:0:0:0:1") return true;
  if (lower.startsWith("fe80:")) return true;

  const mapped = lower.startsWith("::ffff:") ? lower.slice("::ffff:".length) : lower;
  const v4 = ipv4ToInt(mapped);
  if (v4 == null) return false;

  const a = (v4 >>> 24) & 255;
  const b = (v4 >>> 16) & 255;
  if (a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

function isIpLiteral(hostname: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":");
}

/**
 * Accept http(s) Home Assistant URLs, including RFC1918 and IPv6 ULA.
 * Reject credentials, redirects targets we have not parsed, and link-local
 * or loopback addresses.
 */
export function normalizeHaUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Home Assistant URL is invalid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Home Assistant URL must use http or https");
  }
  if (url.username || url.password) {
    throw new Error("Home Assistant URL must not include credentials");
  }
  if (url.search || url.hash) {
    throw new Error("Home Assistant URL must not include a query or hash");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname || BLOCKED_HOSTS.has(hostname)) {
    throw new Error("That Home Assistant address is not allowed");
  }
  if (isIpLiteral(hostname) && isBlockedIp(hostname)) {
    throw new Error("That Home Assistant address is not allowed");
  }

  const path = url.pathname.replace(/\/$/, "");
  return `${url.origin}${path}`;
}

/** Resolve the host and refuse link-local or loopback answers. */
export async function assertHaUrlResolvesSafely(normalized: string): Promise<void> {
  const hostname = new URL(normalized).hostname.replace(/^\[|\]$/g, "");
  if (isIpLiteral(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new Error("That Home Assistant address is not allowed");
    }
    return;
  }
  if (BLOCKED_HOSTS.has(hostname.toLowerCase())) {
    throw new Error("That Home Assistant address is not allowed");
  }

  let records: { address: string }[];
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error(`Could not resolve ${hostname}`);
  }
  if (records.length === 0) {
    throw new Error(`Could not resolve ${hostname}`);
  }
  for (const record of records) {
    if (isBlockedIp(record.address)) {
      throw new Error("That Home Assistant address is not allowed");
    }
  }
}
