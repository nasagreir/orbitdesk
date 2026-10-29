import { NextResponse } from "next/server";
import { z } from "zod";
import { updateDevicePrefs } from "@/lib/device-prefs";
import { STARLINK_MODELS } from "@/lib/starlink-models";

const bodySchema = z.object({
  modelId: z
    .enum([
      "standard-gen3",
      "standard-gen2",
      "mini",
      "high-performance",
      "flat-high-performance",
    ])
    .optional(),
  roamEnabled: z.boolean().optional(),
  roamNote: z.string().max(80).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid prefs payload" }, { status: 400 });
    }
    if (
      parsed.data.modelId === undefined &&
      parsed.data.roamEnabled === undefined &&
      parsed.data.roamNote === undefined
    ) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const prefs = await updateDevicePrefs(id, parsed.data);
    const model = STARLINK_MODELS.find((m) => m.id === prefs.modelId) ?? null;
    return NextResponse.json({ ok: true, prefs, model });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update device prefs",
      },
      { status: 400 },
    );
  }
}
