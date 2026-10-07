import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'

export function migrateLegacyDatabaseFile(currentPath: string, legacyPath: string): boolean {
  if (existsSync(currentPath) || !existsSync(legacyPath)) return false

  const legacy = new DatabaseSync(legacyPath)
  try {
    const escapedPath = currentPath.replace(/'/g, "''")
    legacy.exec(`VACUUM INTO '${escapedPath}'`)
    return true
  } finally {
    legacy.close()
  }
}
