import { connection, NextResponse } from "next/server";
import {
  getAppConfig,
  getGrokConfig,
  getHomeAssistantConfig,
} from "@/lib/config";
import type { SettingsPublic } from "@/lib/types";

export async function GET() {
  await connection();
  const ha = getHomeAssistantConfig();
  const grok = getGrokConfig();
  const app = getAppConfig();

  const payload: SettingsPublic = {
    homeAssistantUrl: ha.url,
    homeAssistantConfigured: ha.configured,
    grokConfigured: grok.configured,
    entityPrefix: ha.entityPrefix,
    pollIntervalSeconds: app.pollIntervalSeconds,
    demoModeForced: app.demoModeForced,
  };

  return NextResponse.json(payload);
}
