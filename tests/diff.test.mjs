import assert from 'node:assert/strict'
import test from 'node:test'
import { diffLines, MAX_DIFF_CELLS, MAX_DIFF_LINES } from '../src/renderer/src/lib/diff.ts'

test('empty files produce no phantom line changes', () => {
  assert.deepEqual(diffLines('', ''), {
    lines: [],
    additions: 0,
    deletions: 0,
    newlineChanged: false,
    truncated: false
  })
  assert.deepEqual(diffLines('', 'new line').lines, [
    { type: 'add', newLine: 1, content: 'new line' }
  ])
})

test('identical text and trailing newline state are represented accurately', () => {
  const identical = diffLines('one\r\ntwo\r\n', 'one\ntwo\n')
  assert.deepEqual(identical.lines.map((line) => line.type), ['context', 'context'])
  assert.equal(identical.newlineChanged, false)
  assert.equal(identical.additions, 0)
  assert.equal(identical.deletions, 0)

  const changed = diffLines('one\n', 'one')
  assert.deepEqual(changed.lines.map((line) => line.type), ['context'])
  assert.equal(changed.newlineChanged, true)
})

test('large diffs are stopped before allocating the LCS matrix', () => {
  const tooManyLines = 'x\n'.repeat(MAX_DIFF_LINES + 1)
  assert.equal(diffLines(tooManyLines, '').truncated, true)

  const matrixTooLarge = `${'x\n'.repeat(Math.ceil(Math.sqrt(MAX_DIFF_CELLS)))}x`
  assert.equal(diffLines(matrixTooLarge, matrixTooLarge).truncated, true)
})
