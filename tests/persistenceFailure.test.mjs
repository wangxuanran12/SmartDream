import assert from 'node:assert/strict'
import test from 'node:test'
import { reportPersistenceFailure } from '../src/renderer/src/lib/reportPersistenceFailure.ts'

test('persistence failures are delivered to the visible-error handler', async () => {
  const failure = new Error('disk full')
  let reported
  reportPersistenceFailure(Promise.reject(failure), (error) => {
    reported = error
  })

  await new Promise((resolve) => setImmediate(resolve))
  assert.strictEqual(reported, failure)
})
