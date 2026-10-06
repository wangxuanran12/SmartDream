import type { SettingsPatch } from '../shared/types'

const CREDENTIAL_SETTING_KEYS = new Set(['apiKey', 'apiKeyEncrypted'])

export function decodePublicSettings(
  rows: Array<{ key: string; value: string }>
): Record<string, string | number | boolean> {
  const settings: Record<string, string | number | boolean> = {}
  for (const row of rows) {
    if (CREDENTIAL_SETTING_KEYS.has(row.key)) continue
    try {
      const value: unknown = JSON.parse(row.value)
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        settings[row.key] = value
      }
    } catch {
      // Ignore malformed setting values.
    }
  }
  return settings
}

export function assertPublicSettingsPatch(patch: SettingsPatch): void {
  if (Object.keys(patch).some((key) => CREDENTIAL_SETTING_KEYS.has(key))) {
    throw new Error('API Key 必须通过凭据接口保存')
  }
}