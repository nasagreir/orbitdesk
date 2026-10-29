import { NextResponse } from "next/server";
import { getDashboard } from "@/lib/starlink-service";

export async function GET() {
  try {
    const payload = await getDashboard();
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load dashboard",
      },
      { status: 500 },
    );
  }
}
