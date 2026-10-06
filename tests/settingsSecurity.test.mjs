import assert from 'node:assert/strict'
import test from 'node:test'
import { assertPublicSettingsPatch, decodePublicSettings } from '../src/main/settingsSecurity.ts'

test('never returns credential fields in public settings snapshots', () => {
  const settings = decodePublicSettings([
    { key: 'theme', value: '"dark"' },
    { key: 'apiKey', value: '"legacy-secret"' },
    { key: 'apiKeyEncrypted', value: '"encrypted-value"' }
  ])

  assert.deepEqual(settings, { theme: 'dark' })
  assert.equal(JSON.stringify(settings).includes('legacy-secret'), false)
})

test('rejects credential fields from normal settings writes', () => {
  assert.throws(() => assertPublicSettingsPatch({ apiKey: 'secret' }), /凭据接口/)
  assert.throws(() => assertPublicSettingsPatch({ apiKeyEncrypted: 'ciphertext' }), /凭据接口/)
  assert.doesNotThrow(() => assertPublicSettingsPatch({ theme: 'dark' }))
})