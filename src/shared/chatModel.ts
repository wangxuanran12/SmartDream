export function resolveChatModel(
  sessionModel: string | null | undefined,
  configuredModel: string,
  defaultModel: string
): string {
  return configuredModel || sessionModel || defaultModel
}
