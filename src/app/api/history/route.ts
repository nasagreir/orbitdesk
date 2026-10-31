import { NextResponse } from "next/server";
import { getHistoryPayload } from "@/lib/history";
import { getDashboard } from "@/lib/starlink-service";
import type { HistoryRange } from "@/lib/types";

const RANGES: HistoryRange[] = ["24h", "7d", "14d"];

function parseRange(value: string | null): HistoryRange {
  if (value && RANGES.includes(value as HistoryRange)) {
    return value as HistoryRange;
  }
  return "7d";
}

export async function GET(request: Request) {
  try {
    // Ensure seed/snapshot exists before reading
    await getDashboard();
    const { searchParams } = new URL(request.url);
    const range = parseRange(searchParams.get("range"));
    const payload = await getHistoryPayload(range);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load history",
      },
      { status: 500 },
    );
  }
}
