const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

export function normalizeApiBaseUrl(value: unknown, allowLocalHttp: boolean): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('API 基础端点不能为空')
  }

  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error('API 基础端点格式无效')
  }

  if (url.username || url.password) {
    throw new Error('API 基础端点不能包含用户名或密码')
  }

  if (url.protocol !== 'https:') {
    const isAllowedLocalHttp =
      allowLocalHttp && url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname.toLowerCase())
    if (!isAllowedLocalHttp) {
      throw new Error('远程 API 必须使用 HTTPS；本地 HTTP 仅可在显式启用调试时使用')
    }
  }

  return url.toString().replace(/\/+$/, '')
}