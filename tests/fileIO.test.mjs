import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { readFileBounded } from '../src/main/fileIO.ts'

test('bounded file reads accept files at the limit and reject larger files', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'smartdream-file-io-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const limit = 16
  const atLimit = join(root, 'at-limit.txt')
  const overLimit = join(root, 'over-limit.txt')
  await Promise.all([
    writeFile(atLimit, 'x'.repeat(limit)),
    writeFile(overLimit, 'x'.repeat(limit + 1))
  ])

  assert.equal((await readFileBounded(atLimit, limit)).byteLength, limit)
  await assert.rejects(readFileBounded(overLimit, limit), /文件过大/)
})
