import { connection, NextResponse } from "next/server";
import { z } from "zod";
import { createStoredSite, listStoredSites, siteConfig, toPublicSite } from "@/lib/sites";

const createSchema = z.object({
  name: z.string(),
  haUrl: z.string(),
  haToken: z.string(),
  entityPrefix: z.string().optional(),
  interfaceName: z.string().optional(),
  address: z.string(),
  listenPort: z.number().int().optional(),
  endpoint: z.string(),
  peerPublicKey: z.string(),
  allowedIps: z.string(),
  persistentKeepalive: z.number().int().optional(),
});

export async function GET() {
  await connection();
  const sites = await listStoredSites();
  return NextResponse.json({ sites: sites.map(toPublicSite) });
}

export async function POST(request: Request) {
  await connection();
  try {
    const json = await request.json();
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Site needs a name, Home Assistant URL and token, and WireGuard peer details" },
        { status: 400 },
      );
    }
    const site = await createStoredSite(parsed.data);
    const config = siteConfig(site);
    return NextResponse.json(
      {
        site: toPublicSite(site),
        interfaceConf: config.interfaceConf,
        remotePeerSnippet: config.remotePeerSnippet,
        warning: config.warning,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save site" },
      { status: 400 },
    );
  }
}
