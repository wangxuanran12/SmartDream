import { safeStorage } from 'electron'
import {
  deleteSecureCredential,
  getSecureCredential,
  isDbReady,
  setSecureCredential,
  takeLegacyApiKey
} from './db'
import { createCredentialService } from './credentialService'

const API_KEY_CREDENTIAL = 'llm-api-key'

const credentialService = createCredentialService({
  platform: process.platform,
  isDbReady,
  isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
  getStorageBackend: () => safeStorage.getSelectedStorageBackend(),
  encryptString: (value) => safeStorage.encryptString(value),
  decryptString: (value) => safeStorage.decryptString(value),
  getEncrypted: () => getSecureCredential(API_KEY_CREDENTIAL),
  setEncrypted: (value) => setSecureCredential(API_KEY_CREDENTIAL, value),
  deleteEncrypted: () => deleteSecureCredential(API_KEY_CREDENTIAL),
  takeLegacyApiKey
})

export const initializeApiCredential = credentialService.initialize
export const getApiKey = credentialService.getApiKey
export const getApiKeyStatus = credentialService.getStatus
export const setApiKey = credentialService.set
export const clearApiKey = credentialService.clear