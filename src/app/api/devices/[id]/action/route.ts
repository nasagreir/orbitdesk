import { NextResponse } from "next/server";
import { z } from "zod";
import { runDeviceAction } from "@/lib/starlink-service";

const bodySchema = z.object({
  action: z.enum(["reboot", "stow", "unstow"]),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "action must be reboot, stow, or unstow" },
        { status: 400 },
      );
    }

    const result = await runDeviceAction(id, parsed.data.action);
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to run device action",
      },
      { status: 500 },
    );
  }
}
