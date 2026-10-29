export function getHomeAssistantConfig() {
  const url = (process.env.HOME_ASSISTANT_URL ?? "").replace(/\/$/, "");
  const token = process.env.HOME_ASSISTANT_TOKEN ?? "";
  const entityPrefix =
    process.env.STARLINK_ENTITY_PREFIX ?? "sensor.starlink";
  return {
    url,
    token,
    entityPrefix,
    configured: Boolean(url && token),
  };
}

export function getGrokConfig() {
  const apiKey =
    process.env.GROK_API_KEY ?? process.env.XAI_API_KEY ?? "";
  const model = process.env.GROK_MODEL ?? "grok-2-latest";
  const baseUrl =
    process.env.GROK_BASE_URL ?? "https://api.x.ai/v1";
  return {
    apiKey,
    model,
    baseUrl: baseUrl.replace(/\/$/, ""),
    configured: Boolean(apiKey),
  };
}

export function getAppConfig() {
  const demoModeForced =
    process.env.FORCE_DEMO_MODE === "1" ||
    process.env.FORCE_DEMO_MODE === "true";
  const pollIntervalSeconds = Number(
    process.env.POLL_INTERVAL_SECONDS ?? "30",
  );
  return {
    demoModeForced,
    pollIntervalSeconds: Number.isFinite(pollIntervalSeconds)
      ? Math.max(5, pollIntervalSeconds)
      : 30,
  };
}
