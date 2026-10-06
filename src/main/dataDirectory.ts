import { constants } from 'node:fs'
import { randomUUID } from 'node:crypto'
import {
  copyFile,
  link,
  lstat,
  mkdir,
  readFile,
  readlink,
  readdir,
  symlink,
  unlink,
  writeFile
} from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

export interface DataMigrationResult {
  copiedFiles: number
  conflicts: string[]
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function copyMissing(source: string, destination: string, result: DataMigrationResult): Promise<void> {
  const entries = await readdir(source, { withFileTypes: true })
  for (const entry of entries) {
    const sourcePath = join(source, entry.name)
    const destinationPath = join(destination, entry.name)

    if (await exists(destinationPath)) {
      const destinationStat = await lstat(destinationPath)
      if (entry.isDirectory() && destinationStat.isDirectory() && !destinationStat.isSymbolicLink()) {
        await copyMissing(sourcePath, destinationPath, result)
      } else {
        result.conflicts.push(destinationPath)
      }
      continue
    }

    if (entry.isDirectory()) {
      await mkdir(destinationPath)
      await copyMissing(sourcePath, destinationPath, result)
    } else if (entry.isSymbolicLink()) {
      await symlink(await readlink(sourcePath), destinationPath)
    } else if (entry.isFile()) {
      await mkdir(dirname(destinationPath), { recursive: true })
      const temporaryPath = join(dirname(destinationPath), `.migration-${randomUUID()}`)
      try {
        await copyFile(sourcePath, temporaryPath, constants.COPYFILE_EXCL)
        await link(temporaryPath, destinationPath)
        result.copiedFiles++
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
          result.conflicts.push(destinationPath)
        } else {
          throw error
        }
      } finally {
        await unlink(temporaryPath).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error
        })
      }
    } else {
      result.conflicts.push(sourcePath)
    }
  }
}

export async function migrateLegacyDataDirectory(
  legacyDirectory: string,
  currentDirectory: string
): Promise<DataMigrationResult> {
  const source = resolve(legacyDirectory)
  const destination = resolve(currentDirectory)
  const result: DataMigrationResult = { copiedFiles: 0, conflicts: [] }
  if (source === destination || !(await exists(source))) return result

  const sourceStat = await lstat(source)
  if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) {
    throw new Error('旧版应用数据路径不是普通目录')
  }
  await mkdir(destination, { recursive: true })
  const marker = join(destination, '.legacy-data-migration-v1')
  if (await exists(marker)) {
    const previousSource = await readFile(marker, 'utf8')
    if (previousSource === source) return result
  }
  await copyMissing(source, destination, result)
  await writeFile(marker, source, { flag: 'w' })
  return result
}
