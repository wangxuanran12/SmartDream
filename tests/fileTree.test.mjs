import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { buildFileTree, MAX_DIRECTORY_ENTRIES } from '../src/main/fileTree.ts'

async function createFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'smartdream-file-tree-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

test('file tree sorts entries and skips hidden, ignored and symbolic-link entries', async (t) => {
  const root = await createFixture(t)
  await Promise.all([
    mkdir(join(root, 'z-directory')),
    mkdir(join(root, 'node_modules')),
    writeFile(join(root, 'b.txt'), 'b'),
    writeFile(join(root, 'a.txt'), 'a'),
    writeFile(join(root, '.hidden'), 'hidden'),
    writeFile(join(root, 'node_modules', 'ignored.txt'), 'ignored')
  ])
  try {
    await symlink(join(root, 'a.txt'), join(root, 'linked.txt'))
  } catch (error) {
    if (process.platform !== 'win32' || !['EACCES', 'EPERM', 'ENOTSUP'].includes(error.code)) {
      throw error
    }
    t.skip('Windows symlink creation is unavailable for this user')
    return
  }

  const result = await buildFileTree(root)
  assert.deepEqual(result.entries.map((entry) => entry.name), ['z-directory', 'a.txt', 'b.txt'])
  assert.equal(result.entries[1].size, 1)
  assert.equal(result.truncated, false)
})

test('file tree reports when the item cap is reached', async (t) => {
  const root = await createFixture(t)
  await Promise.all(
    Array.from({ length: MAX_DIRECTORY_ENTRIES + 1 }, (_, index) =>
      writeFile(join(root, `file-${String(index).padStart(5, '0')}.txt`), '')
    )
  )

  const result = await buildFileTree(root)
  assert.equal(result.entries.length, MAX_DIRECTORY_ENTRIES)
  assert.equal(result.truncated, true)
})

test('file tree reports the depth cap and read errors', async (t) => {
  const root = await createFixture(t)
  let nested = root
  for (let i = 0; i < 8; i++) {
    nested = join(nested, `level-${i}`)
    await mkdir(nested)
  }

  const result = await buildFileTree(root)
  assert.equal(result.truncated, true)
  await assert.rejects(buildFileTree(join(root, 'missing')), /无法扫描目录/)
})
