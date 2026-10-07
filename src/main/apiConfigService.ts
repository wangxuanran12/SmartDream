export interface ApiConfigServiceDependencies {
  normalizeBaseUrl: (value: unknown) => string
  persistBaseUrl: (baseUrl: string) => void
  confirmBaseUrlChange: (current: string, next: string) => Promise<boolean>
}

export function createApiConfigService(
  initialBaseUrl: string,
  dependencies: ApiConfigServiceDependencies
): {
  getBaseUrl: () => string
  setBaseUrl: (value: unknown) => Promise<string>
} {
  let baseUrl = dependencies.normalizeBaseUrl(initialBaseUrl)

  return {
    getBaseUrl: () => baseUrl,
    async setBaseUrl(value) {
      const next = dependencies.normalizeBaseUrl(value)
      if (next === baseUrl) return baseUrl
      if (!(await dependencies.confirmBaseUrlChange(baseUrl, next))) {
        throw new Error('模型服务地址未更改')
      }
      dependencies.persistBaseUrl(next)
      baseUrl = next
      return baseUrl
    }
  }
}
