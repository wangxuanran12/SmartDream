import assert from 'node:assert/strict'
import test from 'node:test'
import { pointerDelta, resizeWidth } from '../src/renderer/src/lib/layout.ts'

test('pointer movement reports incremental deltas, not repeated drag totals', () => {
  const start = 100
  const first = 120
  const second = 130
  assert.equal(pointerDelta(start, first), 20)
  assert.equal(pointerDelta(first, second), 10)
  assert.equal(pointerDelta(start, second), 30)
  assert.equal(pointerDelta(second, first), -10)
  assert.equal(pointerDelta(first, start), -20)
})

test('panel resize applies direction and clamps each update to its bounds', () => {
  assert.equal(resizeWidth(260, 20, 1, 180, 420), 280)
  assert.equal(resizeWidth(280, -20, 1, 180, 420), 260)
  assert.equal(resizeWidth(420, 20, 1, 180, 420), 420)
  assert.equal(resizeWidth(420, 20, -1, 280, 700), 400)
  assert.equal(resizeWidth(280, 20, -1, 280, 700), 280)
})
