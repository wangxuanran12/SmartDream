import assert from 'node:assert/strict'
import test from 'node:test'
import { createApiConfigService } from '../src/main/apiConfigService.ts'
import { normalizeApiBaseUrl } from '../src/main/apiConfig.ts'

const DEFAULT_API_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4'
const normalizeBaseUrl = (value) => normalizeApiBaseUrl(value, false)

test('keeps the active model endpoint unchanged when native confirmation is declined', async () => {
  const writes = []
  const service = createApiConfigService(DEFAULT_API_BASE_URL, {
    normalizeBaseUrl,
    persistBaseUrl: (value) => writes.push(value),
    confirmBaseUrlChange: async () => false
  })

  await assert.rejects(service.setBaseUrl('https://other.example/v1'), /未更改/)
  assert.equal(service.getBaseUrl(), DEFAULT_API_BASE_URL)
  assert.deepEqual(writes, [])
})

test('persists and switches to a validated endpoint only after confirmation', async () => {
  const writes = []
  const confirmations = []
  const service = createApiConfigService(DEFAULT_API_BASE_URL, {
    normalizeBaseUrl,
    persistBaseUrl: (value) => writes.push(value),
    confirmBaseUrlChange: async (current, next) => {
      confirmations.push([current, next])
      return true
    }
  })

  const next = await service.setBaseUrl(' https://other.example/v1/// ')
  assert.equal(next, 'https://other.example/v1')
  assert.equal(service.getBaseUrl(), next)
  assert.deepEqual(writes, [next])
  assert.deepEqual(confirmations, [[DEFAULT_API_BASE_URL, next]])
})

test('does not change the active endpoint if persistence fails', async () => {
  const service = createApiConfigService(DEFAULT_API_BASE_URL, {
    normalizeBaseUrl,
    persistBaseUrl: () => {
      throw new Error('disk full')
    },
    confirmBaseUrlChange: async () => true
  })

  await assert.rejects(service.setBaseUrl('https://other.example/v1'), /disk full/)
  assert.equal(service.getBaseUrl(), DEFAULT_API_BASE_URL)
})
