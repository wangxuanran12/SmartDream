import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { migrateLegacyDataDirectory } from '../src/main/dataDirectory.ts'

test('migration copies missing data without overwriting or removing the legacy source', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'smartdream-data-migration-'))
  t.after(() => rm(root, { recursive: true, force: true }))

  const legacy = join(root, 'legacy')
  const current = join(root, 'current')
  await Promise.all([mkdir(legacy), mkdir(current)])
  await writeFile(join(legacy, 'workbuddy.db'), 'legacy database')
  await writeFile(join(current, 'workbuddy.db'), 'current database')
  await writeFile(join(legacy, 'settings.json'), 'legacy settings')

  const result = await migrateLegacyDataDirectory(legacy, current)
  assert.equal(result.copiedFiles, 1)
  assert.equal(result.conflicts.length, 1)
  assert.equal(await readFile(join(current, 'workbuddy.db'), 'utf8'), 'current database')
  assert.equal(await readFile(join(current, 'settings.json'), 'utf8'), 'legacy settings')
  assert.equal(await readFile(join(legacy, 'workbuddy.db'), 'utf8'), 'legacy database')
  assert.deepEqual((await readdir(legacy)).sort(), ['settings.json', 'workbuddy.db'])

  const repeat = await migrateLegacyDataDirectory(legacy, current)
  assert.equal(repeat.copiedFiles, 0)
  assert.deepEqual(repeat.conflicts, [])
})
