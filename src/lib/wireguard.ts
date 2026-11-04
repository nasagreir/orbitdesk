import { execFile } from "node:child_process";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface WireGuardKeys {
  privateKey: string;
  publicKey: string;
}

export interface WireGuardPeerStatus {
  available: boolean;
  up: boolean;
  latestHandshake: string | null;
  message: string;
}

/** 32-byte X25519 keys, standard base64, matching `wg genkey` / `wg pubkey`. */
export function generateWireGuardKeypair(): WireGuardKeys {
  const { publicKey, privateKey } = generateKeyPairSync("x25519");
  const privDer = privateKey.export({ format: "der", type: "pkcs8" });
  const pubDer = publicKey.export({ format: "der", type: "spki" });
  return {
    privateKey: Buffer.from(privDer).subarray(-32).toString("base64"),
    publicKey: Buffer.from(pubDer).subarray(-32).toString("base64"),
  };
}

export function newSiteId(): string {
  return `site_${randomBytes(6).toString("hex")}`;
}

export function renderInterfaceConf(input: {
  privateKey: string;
  address: string;
  listenPort?: number;
  peerPublicKey: string;
  endpoint: string;
  allowedIps: string;
  persistentKeepalive: number;
}): string {
  const lines = [
    "[Interface]",
    `PrivateKey = ${input.privateKey}`,
    `Address = ${input.address}`,
  ];
  if (input.listenPort) {
    lines.push(`ListenPort = ${input.listenPort}`);
  }
  lines.push(
    "",
    "[Peer]",
    `PublicKey = ${input.peerPublicKey}`,
    `Endpoint = ${input.endpoint}`,
    `AllowedIPs = ${input.allowedIps}`,
    `PersistentKeepalive = ${input.persistentKeepalive}`,
    "",
  );
  return lines.join("\n");
}

export function renderRemotePeerSnippet(ourPublicKey: string, ourAddress: string): string {
  const host = ourAddress.split("/")[0] ?? ourAddress;
  return [
    "# On the remote site, allow this OrbitDesk host",
    "[Peer]",
    `PublicKey = ${ourPublicKey}`,
    `AllowedIPs = ${host}/32`,
    "PersistentKeepalive = 25",
    "",
  ].join("\n");
}

function handshakeLabel(epochSeconds: number): string | null {
  if (!epochSeconds) return null;
  const age = Math.max(0, Math.floor(Date.now() / 1000) - epochSeconds);
  if (age < 90) return `${age}s ago`;
  if (age < 3600) return `${Math.floor(age / 60)}m ago`;
  if (age < 86400) return `${Math.floor(age / 3600)}h ago`;
  return `${Math.floor(age / 86400)}d ago`;
}

interface DumpPeer {
  iface: string;
  publicKey: string;
  latestHandshake: number;
}

/**
 * `wg show all dump` — interface lines have 5 fields, peer lines have 9.
 * The private key column is ignored and never returned.
 */
function parseDump(stdout: string): DumpPeer[] {
  const peers: DumpPeer[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    const fields = line.split("\t");
    if (fields.length < 9) continue;
    const handshake = Number(fields[5]);
    peers.push({
      iface: fields[0] ?? "",
      publicKey: fields[1] ?? "",
      latestHandshake: Number.isFinite(handshake) ? handshake : 0,
    });
  }
  return peers;
}

export async function readPeerStatus(
  interfaceName: string,
  peerPublicKey: string,
): Promise<WireGuardPeerStatus> {
  let stdout = "";
  try {
    const result = await execFileAsync("wg", ["show", "all", "dump"], {
      timeout: 2000,
      maxBuffer: 1024 * 1024,
    });
    stdout = result.stdout;
  } catch {
    return {
      available: false,
      up: false,
      latestHandshake: null,
      message:
        "wg is not available in this container. The tunnel can run on the Proxmox host; OrbitDesk still polls Home Assistant over the route.",
    };
  }

  const peers = parseDump(stdout);
  const match =
    peers.find((peer) => peer.publicKey === peerPublicKey) ??
    peers.find((peer) => peer.iface === interfaceName);

  if (!match || !match.latestHandshake) {
    return {
      available: true,
      up: false,
      latestHandshake: null,
      message: `No handshake on ${interfaceName}. Bring the tunnel up on the host that owns it.`,
    };
  }

  const age = Math.floor(Date.now() / 1000) - match.latestHandshake;
  const label = handshakeLabel(match.latestHandshake);
  const up = age >= 0 && age < 180;
  return {
    available: true,
    up,
    latestHandshake: label,
    message: up
      ? `Handshake ${label}`
      : `Last handshake ${label} on ${match.iface}`,
  };
}
