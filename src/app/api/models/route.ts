import { NextResponse } from "next/server";
import { STARLINK_MODELS } from "@/lib/starlink-models";

export async function GET() {
  return NextResponse.json({ models: STARLINK_MODELS });
}
