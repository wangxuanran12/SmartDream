export function resolveChatModel(
  sessionModel: string | null | undefined,
  configuredModel: string,
  defaultModel: string
): string {
  if (sessionModel === 'glm') return configuredModel || defaultModel
  return sessionModel || configuredModel || defaultModel
}
