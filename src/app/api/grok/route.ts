import { NextResponse } from "next/server";
import { z } from "zod";
import { chatWithGrok, demoGrokReply } from "@/lib/grok";
import { getGrokConfig } from "@/lib/config";
import { getDashboard } from "@/lib/starlink-service";

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(40),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid chat payload" }, { status: 400 });
    }

    const dashboard = await getDashboard();
    const lastUser = [...parsed.data.messages]
      .reverse()
      .find((m) => m.role === "user");

    const { configured } = getGrokConfig();
    if (!configured) {
      return NextResponse.json({
        demo: true,
        content: demoGrokReply(
          lastUser?.content ?? "",
          dashboard.devices,
        ),
      });
    }

    const content = await chatWithGrok(parsed.data.messages, dashboard.devices);
    return NextResponse.json({ demo: false, content });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Grok request failed",
      },
      { status: 502 },
    );
  }
}
