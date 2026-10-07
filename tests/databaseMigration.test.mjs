import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { migrateLegacyDatabaseFile } from '../src/main/databaseMigration.ts'

test('copies legacy SQLite contents to the SmartDream database without removing the source', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'smartdream-db-migration-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const quotedDirectory = join(root, "user's data")
  await mkdir(quotedDirectory)
  const legacyPath = join(quotedDirectory, 'workbuddy.db')
  const currentPath = join(quotedDirectory, 'smartdream.db')
  const legacy = new DatabaseSync(legacyPath)
  legacy.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
  legacy.prepare('INSERT INTO settings VALUES (?, ?)').run('theme', 'dark')
  legacy.close()

  assert.equal(migrateLegacyDatabaseFile(currentPath, legacyPath), true)
  assert.equal(migrateLegacyDatabaseFile(currentPath, legacyPath), false)

  const migrated = new DatabaseSync(currentPath, { readOnly: true })
  try {
    const row = migrated.prepare('SELECT key, value FROM settings').get()
    assert.equal(row.key, 'theme')
    assert.equal(row.value, 'dark')
  } finally {
    migrated.close()
  }
  await access(legacyPath)
})
