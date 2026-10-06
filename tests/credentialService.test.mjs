import assert from 'node:assert/strict'
import test from 'node:test'
import { createCredentialService } from '../src/main/credentialService.ts'

function createFixture({ secure = true, backend = 'gnome_libsecret', legacy = null } = {}) {
  let stored = null
  let legacyKey = legacy
  const deps = {
    platform: 'linux',
    isDbReady: () => true,
    isEncryptionAvailable: () => secure,
    getStorageBackend: () => backend,
    encryptString: (value) => Buffer.from(`encrypted:${value}`),
    decryptString: (value) => Buffer.from(value).toString().replace(/^encrypted:/, ''),
    getEncrypted: () => stored,
    setEncrypted: (value) => { stored = value },
    deleteEncrypted: () => { stored = null },
    takeLegacyApiKey: () => {
      const value = legacyKey
      legacyKey = null
      return value
    }
  }
  return {
    deps,
    service: createCredentialService(deps),
    get stored() { return stored },
    get legacyKey() { return legacyKey }
  }
}

test('migrates legacy plaintext into encrypted storage and removes it', () => {
  const fixture = createFixture({ legacy: 'test-secret' })
  fixture.service.initialize()

  assert.equal(fixture.legacyKey, null)
  assert.notEqual(fixture.stored.toString(), 'test-secret')
  assert.equal(fixture.service.getApiKey(), 'test-secret')
  assert.deepEqual(fixture.service.getStatus(), {
    configured: true,
    persistent: true,
    warning: ''
  })
})

test('discards legacy plaintext when secure storage is unavailable', () => {
  const fixture = createFixture({ secure: false, legacy: 'old-secret' })
  fixture.service.initialize()

  assert.equal(fixture.legacyKey, null)
  assert.equal(fixture.stored, null)
  assert.equal(fixture.service.getApiKey(), null)
  assert.equal(fixture.service.getStatus().configured, false)
  assert.match(fixture.service.getStatus().warning, /重新录入/)
})

test('keeps a newly entered key in memory when the Linux backend is basic_text', () => {
  const fixture = createFixture({ backend: 'basic_text' })
  const status = fixture.service.set('session-secret')

  assert.equal(fixture.stored, null)
  assert.equal(fixture.service.getApiKey(), 'session-secret')
  assert.equal(status.persistent, false)
  assert.match(status.warning, /仅在本次运行/)
})

test('clears both encrypted and legacy credentials', () => {
  const fixture = createFixture({ legacy: 'old-secret' })
  fixture.service.set('new-secret')
  fixture.service.clear()

  assert.equal(fixture.stored, null)
  assert.equal(fixture.legacyKey, null)
  assert.equal(fixture.service.getApiKey(), null)
  assert.equal(fixture.service.getStatus().configured, false)
})

test('rejects non-string or oversized credentials', () => {
  const fixture = createFixture()
  assert.throws(() => fixture.service.set(42), /格式无效/)
  assert.throws(() => fixture.service.set('x'.repeat(4097)), /格式无效/)
})