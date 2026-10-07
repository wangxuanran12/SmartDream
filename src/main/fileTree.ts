import { opendir, stat } from 'fs/promises'
import type { Dirent } from 'node:fs'
import { basename, extname, join } from 'path'
import type { DirectoryReadResult, FileNode } from '../shared/types'

export const MAX_DIRECTORY_ENTRIES = 5000
const MAX_DIRECTORY_ENTRIES_INSPECTED = 10_000

const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'out', 'release', '.idea', '.vscode'])
const IGNORE_FILES = new Set(['.DS_Store', 'Thumbs.db'])

interface DirectoryScan {
  count: number
  inspected: number
  truncated: boolean
}

async function scanDirectory(
  dirPath: string,
  scan: DirectoryScan,
  depth: number
): Promise<FileNode[]> {
  if (depth > 6) {
    scan.truncated = true
    return []
  }

  const entries: Dirent[] = []
  try {
    const directory = await opendir(dirPath)
    for await (const entry of directory) {
      scan.inspected++
      if (scan.inspected > MAX_DIRECTORY_ENTRIES_INSPECTED) {
        scan.truncated = true
        break
      }
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue
      if (!entry.isDirectory() && !entry.isFile()) continue
      if (entry.isDirectory() && IGNORE_DIRS.has(entry.name)) continue
      if (!entry.isDirectory() && IGNORE_FILES.has(entry.name)) continue
      if (scan.count + entries.length >= MAX_DIRECTORY_ENTRIES) {
        scan.truncated = true
        break
      }
      entries.push(entry)
    }
  } catch (err) {
    const code =
      typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string'
        ? err.code
        : undefined
    const reason =
      code === 'ENOENT'
        ? '目录不存在或已移动'
        : code === 'EACCES' || code === 'EPERM'
          ? '没有读取权限'
          : '系统读取失败'
    throw new Error(`无法扫描目录: ${basename(dirPath)} - ${reason}`)
  }

  entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  const nodes: FileNode[] = []
  for (const entry of entries) {
    if (scan.count >= MAX_DIRECTORY_ENTRIES) {
      scan.truncated = true
      break
    }
    scan.count++

    const fullPath = join(dirPath, entry.name)
    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: fullPath,
        isDirectory: true,
        children: await scanDirectory(fullPath, scan, depth + 1)
      })
      if (scan.truncated) break
      continue
    }

    let size: number | undefined
    try {
      size = (await stat(fullPath)).size
    } catch {
      // Keep the entry visible when its size cannot be read.
    }
    nodes.push({
      name: entry.name,
      path: fullPath,
      isDirectory: false,
      extension: extname(entry.name).slice(1).toLowerCase(),
      ...(size !== undefined ? { size } : {})
    })
  }
  return nodes
}

export async function buildFileTree(dirPath: string): Promise<DirectoryReadResult> {
  const scan: DirectoryScan = { count: 0, inspected: 0, truncated: false }
  const entries = await scanDirectory(dirPath, scan, 0)
  return { entries, truncated: scan.truncated }
}
