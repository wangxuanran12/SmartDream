import assert from 'node:assert/strict'
import test from 'node:test'
import { genMessageId } from '../src/shared/messageId.ts'

test('message IDs remain unique when several messages are created within one millisecond', () => {
  const originalNow = Date.now
  Date.now = () => 42
  try {
    const ids = Array.from({ length: 1_000 }, genMessageId)
    assert.equal(new Set(ids).size, ids.length)
    assert.ok(ids.every((id) => id.startsWith('msg_')))
  } finally {
    Date.now = originalNow
  }
})
