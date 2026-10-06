import { realpath, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep, win32 } from 'node:path'

export type FileAccessMode = 'read' | 'write'

export function isWithinPath(
  base: string,
  target: string,
  pathFlavor: 'native' | 'win32' = 'native'
): boolean {
  const rel = pathFlavor === 'win32' ? win32.relative(base, target) : relative(base, target)
  const absolute = pathFlavor === 'win32' ? win32.isAbsolute(rel) : isAbsolute(rel)
  const separator = pathFlavor === 'win32' ? win32.sep : sep
  return rel === '' || (!absolute && rel !== '..' && !rel.startsWith(`..${separator}`))
}

export async function canonicalizePath(input: unknown, allowMissing = false): Promise<string> {
  if (typeof input !== 'string' || !input || !isAbsolute(input)) {
    throw new Error('无效的文件系统路径')
  }

  const requested = resolve(input)
  let current = requested
  const suffix: string[] = []

  while (true) {
    try {
      const existing = await realpath(current)
      return suffix.reduceRight((path, part) => join(path, part), existing)
    } catch (err) {
      if (!allowMissing || (err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      const parent = dirname(current)
      if (parent === current) throw err
      suffix.push(basename(current))
      current = parent
    }
  }
}

export class FileAuthorization {
  private sandboxDir = ''
  private readonly authorizedDirs = new Set<string>()
  private readonly authorizedFiles = new Set<string>()

  async initializeSandbox(path: string, managedRoot = dirname(path)): Promise<string> {
    const [canonicalSandbox, canonicalRoot] = await Promise.all([
      realpath(path),
      realpath(managedRoot)
    ])
    if (!isWithinPath(canonicalRoot, canonicalSandbox)) {
      throw new Error('应用工作区不能指向应用数据目录之外')
    }
    this.sandboxDir = canonicalSandbox
    return canonicalSandbox
  }

  getAuthorizedDirs(): string[] {
    return [...this.authorizedDirs]
  }

  getAuthorizedFiles(): string[] {
    return [...this.authorizedFiles]
  }

  async authorizeDirectory(path: unknown): Promise<string> {
    const canonical = await canonicalizePath(path)
    if (!(await stat(canonical)).isDirectory()) {
      throw new Error('所选路径不是目录')
    }
    this.authorizedDirs.add(canonical)
    return canonical
  }

  async authorizeFile(path: unknown): Promise<string> {
    const canonical = await canonicalizePath(path)
    if (!(await stat(canonical)).isFile()) {
      throw new Error('所选路径不是普通文件')
    }
    this.authorizedFiles.add(canonical)
    return canonical
  }

  async resolveAuthorizedPath(
    path: unknown,
    mode: FileAccessMode,
    allowMissing = false
  ): Promise<string> {
    const canonical = await canonicalizePath(path, allowMissing)
    if (!this.isAuthorizedCanonicalPath(canonical, mode)) {
      throw new Error('拒绝访问：该路径未经授权')
    }
    return canonical
  }

  isAuthorizedCanonicalPath(path: string, mode: FileAccessMode): boolean {
    const roots = [this.sandboxDir, ...this.authorizedDirs].filter(Boolean)
    if (roots.some((root) => isWithinPath(root, path))) return true
    return mode === 'read' && this.authorizedFiles.has(path)
  }
}
