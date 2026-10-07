import type { SettingsPatch } from '../shared/types'

const PRIVATE_SETTING_KEYS = new Set(['apiKey', 'apiKeyEncrypted'])
const RESTRICTED_SETTING_KEYS = new Set([...PRIVATE_SETTING_KEYS, 'apiBaseUrl'])

export function decodePublicSettings(
  rows: Array<{ key: string; value: string }>
): Record<string, string | number | boolean> {
  const settings: Record<string, string | number | boolean> = {}
  for (const row of rows) {
    if (PRIVATE_SETTING_KEYS.has(row.key)) continue
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
  if (Object.keys(patch).some((key) => RESTRICTED_SETTING_KEYS.has(key))) {
    throw new Error('API Key 和模型服务地址必须通过专用配置接口保存')
  }
}