import { connection, NextResponse } from "next/server";
import { getStoredSite, siteConfig } from "@/lib/sites";

export async function GET(
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
  return NextResponse.json(siteConfig(site));
}
