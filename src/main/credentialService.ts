import type { ApiKeyStatus } from '../shared/types'

interface CredentialServiceDependencies {
  platform: string
  isDbReady: () => boolean
  isEncryptionAvailable: () => boolean
  getStorageBackend: () => string
  encryptString: (value: string) => Buffer
  decryptString: (value: Buffer) => string
  getEncrypted: () => Buffer | null
  setEncrypted: (value: Buffer) => void
  deleteEncrypted: () => void
  takeLegacyApiKey: () => string | null
}

const LINUX_SECURE_BACKENDS = new Set(['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6'])

export function createCredentialService(deps: CredentialServiceDependencies) {
  let apiKey: string | null = null
  let persistent = false
  let warning = ''

  const canPersistSecurely = (): boolean => {
    if (!deps.isDbReady() || !deps.isEncryptionAvailable()) return false
    return deps.platform !== 'linux' || LINUX_SECURE_BACKENDS.has(deps.getStorageBackend())
  }

  const getStatus = (): ApiKeyStatus => ({ configured: !!apiKey, persistent, warning })

  const clear = (): ApiKeyStatus => {
    apiKey = null
    persistent = false
    warning = ''
    deps.deleteEncrypted()
    deps.takeLegacyApiKey()
    return getStatus()
  }

  return {
    initialize(): void {
      const legacyKey = deps.takeLegacyApiKey()
      const encrypted = deps.getEncrypted()

      if (encrypted && canPersistSecurely()) {
        try {
          apiKey = deps.decryptString(encrypted)
          persistent = true
        } catch {
          deps.deleteEncrypted()
          warning = '已保存的 API Key 无法安全解密，请重新录入。'
        }
      } else if (encrypted) {
        deps.deleteEncrypted()
        warning = '当前系统安全存储不可用，已清除持久化凭据，请重新录入。'
      }

      if (!legacyKey) return
      if (!canPersistSecurely()) {
        apiKey = null
        persistent = false
        warning = '系统安全存储不可用，旧版明文 API Key 已删除，请重新录入。'
        return
      }

      try {
        deps.setEncrypted(deps.encryptString(legacyKey))
        apiKey = legacyKey
        persistent = true
        warning = ''
      } catch {
        warning = '旧版 API Key 已删除且无法安全迁移，请重新录入。'
      }
    },
    getApiKey: (): string | null => apiKey,
    getStatus,
    set(value: unknown): ApiKeyStatus {
      if (typeof value !== 'string' || value.length > 4096) {
        throw new Error('API Key 格式无效')
      }
      const nextKey = value.trim()
      if (!nextKey) return clear()

      apiKey = nextKey
      persistent = false
      warning = ''
      deps.deleteEncrypted()

      if (!canPersistSecurely()) {
        warning = '系统安全存储不可用，API Key 仅在本次运行中有效。'
        return getStatus()
      }

      try {
        deps.setEncrypted(deps.encryptString(nextKey))
        persistent = true
      } catch {
        warning = 'API Key 安全保存失败，仅可在本次运行中使用。'
      }
      return getStatus()
    },
    clear
  }
}