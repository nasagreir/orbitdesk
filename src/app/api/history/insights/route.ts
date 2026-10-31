import { NextResponse } from "next/server";
import { getHistoryPayload } from "@/lib/history";
import { suggestHistoryImprovements } from "@/lib/grok";
import { getDashboard } from "@/lib/starlink-service";
import type { HistoryInsightsPayload, HistoryRange } from "@/lib/types";

const RANGES: HistoryRange[] = ["24h", "7d", "14d"];

function parseRange(value: string | null): HistoryRange {
  if (value && RANGES.includes(value as HistoryRange)) {
    return value as HistoryRange;
  }
  return "7d";
}

export async function GET(request: Request) {
  try {
    await getDashboard();
    const { searchParams } = new URL(request.url);
    const range = parseRange(searchParams.get("range"));
    const history = await getHistoryPayload(range);
    const { insights, demo } = await suggestHistoryImprovements(history);

    const payload: HistoryInsightsPayload = {
      range,
      demo,
      insights,
      fetchedAt: new Date().toISOString(),
    };
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load history insights",
      },
      { status: 500 },
    );
  }
}
