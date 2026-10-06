import assert from 'node:assert/strict'
import test from 'node:test'
import { initializeOnce } from '../src/renderer/src/lib/initializeOnce.ts'

test('concurrent and later initialization calls share one promise', async () => {
  let calls = 0
  let resolveInitialization
  const initialize = initializeOnce(
    () =>
      new Promise((resolve) => {
        calls++
        resolveInitialization = resolve
      })
  )

  const first = initialize()
  const second = initialize()
  assert.strictEqual(first, second)
  await Promise.resolve()
  assert.equal(calls, 1)
  resolveInitialization('ready')
  assert.equal(await first, 'ready')
  assert.strictEqual(initialize(), first)
})
