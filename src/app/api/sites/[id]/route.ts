import { connection, NextResponse } from "next/server";
import { deleteStoredSite, getStoredSite, toPublicSite } from "@/lib/sites";

function validId(id: string) {
  return /^site_[a-f0-9]{12}$/.test(id);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await connection();
  const { id } = await context.params;
  if (!validId(id)) {
    return NextResponse.json({ error: "Unknown site" }, { status: 404 });
  }
  const site = await getStoredSite(id);
  if (!site) return NextResponse.json({ error: "Unknown site" }, { status: 404 });
  return NextResponse.json({ site: toPublicSite(site) });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await connection();
  const { id } = await context.params;
  if (!validId(id)) {
    return NextResponse.json({ error: "Unknown site" }, { status: 404 });
  }
  const removed = await deleteStoredSite(id);
  if (!removed) return NextResponse.json({ error: "Unknown site" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
