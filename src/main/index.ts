import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import type { Dirent } from 'node:fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { readdir, readFile, stat, writeFile, mkdir, statfs } from 'fs/promises'
import { mkdirSync } from 'node:fs'
import { basename, extname, join as pathJoin, resolve, isAbsolute, sep, dirname as dirnameOf } from 'path'
import { IPC, type FileNode, type WorkspaceInfo, type ChatStreamPayload } from '../shared/types'
import { initDb, closeDb, registerDbHandlers, getAllSessions, isDbReady } from './db'
import { runChatStream, abortChat } from './llm'
import { seedProjectDocs, PROJECT_DOCS_DIRNAME } from './spaceDocs'
import {
  clearApiKey,
  getApiKey,
  getApiKeyStatus,
  initializeApiCredential,
  setApiKey
} from './credentials'
import { normalizeApiBaseUrl } from './apiConfig'

// E2E/自动化测试：允许重定向应用数据目录（正常启动不设置该变量，无任何影响）
// 默认：存储/缓存统一放在应用安装目录下的 SmartDream/（与应用同名，dev 为项目根目录，打包后为可执行文件同级目录）
const dataDirOverride = process.env.WORKBUDDY_DATA_DIR
if (dataDirOverride) {
  app.setPath('userData', dataDirOverride)
} else {
  // 数据目录固定放安装目录下：macOS 从 .../SmartDream.app/Contents/MacOS/<exe> 回退四级到 .app 所在目录，Windows 取 exe 所在安装根目录
  const installDir = app.isPackaged
    ? process.platform === 'darwin'
      ? resolve(app.getPath('exe'), '..', '..', '..', '..')
      : dirnameOf(app.getPath('exe'))
    : app.getAppPath()
  app.setPath('userData', join(installDir, 'SmartDream'))
}

// ---- 文件类型 → 语言映射（供代码高亮用）----
const EXT_LANG: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.json': 'json',
  '.css': 'css',
  '.scss': 'scss',
  '.html': 'html',
  '.md': 'markdown',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.sh': 'bash',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.xml': 'xml',
  '.svg': 'svg',
  '.png': 'image',
  '.jpg': 'image',
  '.gif': 'image',
  '.vue': 'vue',
  '.sql': 'sql'
}

function langFromPath(p: string): string {
  return EXT_LANG[extname(p).toLowerCase()] ?? 'plaintext'
}

// 常见扩展名 → MIME 类型（图片预览用）
const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif'
}

// 忽略的目录/文件（文件树展示时过滤）
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'out', 'release', '.idea', '.vscode'])
const IGNORE_FILES = new Set(['.DS_Store', 'Thumbs.db'])

async function buildFileTree(dirPath: string, depth = 0): Promise<FileNode[]> {
  if (depth > 6) return [] // 防止深目录递归爆炸
  let entries
  try {
    entries = await readdir(dirPath, { withFileTypes: true })
  } catch {
    return []
  }

  const nodes: FileNode[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (entry.isDirectory() && IGNORE_DIRS.has(entry.name)) continue
    if (!entry.isDirectory() && IGNORE_FILES.has(entry.name)) continue

    const fullPath = pathJoin(dirPath, entry.name)
    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: fullPath,
        isDirectory: true,
        children: await buildFileTree(fullPath, depth + 1)
      })
    } else {
      // 文件大小（搜索弹窗「产物」结果展示用），stat 失败不阻塞列举
      let size: number | undefined
      try {
        size = (await stat(fullPath)).size
      } catch {
        // 保留 undefined
      }
      nodes.push({
        name: entry.name,
        path: fullPath,
        isDirectory: false,
        extension: extname(entry.name).slice(1).toLowerCase(),
        ...(size !== undefined ? { size } : {})
      })
    }
  }

  // 目录在前，文件在后，各自按字母排序
  return nodes.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

// ---- 文件访问授权模型（对齐 WorkBuddy：默认不开放，需用户显式授权）----
// 应用沙箱工作区：位于应用数据目录（打包部署位置）下，始终可写，
// 用于用户未授权本地目录时创建/保存新文件。
let sandboxDir = ''

// 已授权的工作空间目录集合（用户显式授权后加入，支持多个空间并存）。
// 只有这些目录及其子路径可被 readDirectory / readFile / writeFile 访问。
const authorizedDirs = new Set<string>()

// 已授权的单个文件集合（用户显式选择文件后加入，允许读取该文件本身）
const authorizedFiles = new Set<string>()

/** 规范化路径：统一分隔符、去掉尾部斜杠 */
function normalizePath(p: string): string {
  return resolve(p).replace(/[\\/]+$/, '')
}

/** 判断 target 是否位于 base 目录之内（含 base 本身） */
function isWithin(base: string, target: string): boolean {
  const b = normalizePath(base)
  const t = normalizePath(target)
  if (t === b) return true
  return t.startsWith(b + sep)
}

/** 判断路径是否允许访问（已授权工作空间、已授权文件或沙箱工作区） */
function isPathAllowed(target: string): boolean {
  for (const dir of authorizedDirs) {
    if (isWithin(dir, target)) return true
  }
  if (authorizedFiles.has(normalizePath(target))) return true
  if (sandboxDir && isWithin(sandboxDir, target)) return true
  return false
}

/** 确保沙箱工作区目录存在 */
async function ensureSandboxDir(): Promise<void> {
  await mkdir(sandboxDir, { recursive: true })
}

/** 返回当前授权状态 */
function currentWorkspace(): WorkspaceInfo {
  return { sandboxDir, authorizedDirs: [...authorizedDirs] }
}

function createWindow(): void {
  const isMac = process.platform === 'darwin'

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#0d1117',
    // 跨平台标题栏适配核心：
    // - macOS: hiddenInset → 保留原生红绿灯，内容区延伸到标题栏（靠左）
    // - Windows/Linux: hidden → 完全隐藏系统标题栏，由 renderer 自绘控制按钮（靠右）
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    trafficLightPosition: isMac ? { x: 16, y: 18 } : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  // Windows 下无系统标题栏，需要监听最大化状态变化并同步到 renderer
  if (!isMac) {
    const sendMaxState = (): void => {
      mainWindow.webContents.send(IPC.onMaximizeChange, mainWindow.isMaximized())
    }
    mainWindow.on('maximize', sendMaxState)
    mainWindow.on('unmaximize', sendMaxState)
  }

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ---- IPC handlers ----
function registerIpcHandlers(): void {
  ipcMain.handle(IPC.getAppInfo, () => {
    // 首次调用时初始化沙箱工作区（应用数据目录，打包部署位置）
    if (!sandboxDir) {
      sandboxDir = join(app.getPath('userData'), 'workspace')
    }
    return {
      platform: process.platform,
      version: process.version,
      homeDir: app.getPath('home'),
      appVersion: app.getVersion(),
      // 存储/缓存根目录（安装目录下 SmartDream/）与默认空间存储路径（其下 workspace/）
      dataDir: app.getPath('userData'),
      workspaceRoot: join(app.getPath('userData'), 'workspace')
    }
  })

  // 查询授权状态与沙箱目录
  ipcMain.handle(IPC.getWorkspace, async () => {
    if (!sandboxDir) sandboxDir = join(app.getPath('userData'), 'workspace')
    await ensureSandboxDir()
    return currentWorkspace()
  })

  // 应用存储信息（设置弹窗「存储」区）：缓存目录占用（递归统计）+ 所在磁盘容量
  ipcMain.handle(IPC.getStorageInfo, async () => {
    const cacheDir = app.getPath('userData')
    const dirSize = async (dir: string, depth = 0): Promise<number> => {
      let total = 0
      let entries: Dirent[] = []
      try {
        entries = await readdir(dir, { withFileTypes: true })
      } catch {
        return 0 // 目录不存在 / 无权限时按 0 计
      }
      for (const entry of entries) {
        const p = join(dir, entry.name)
        try {
          if (entry.isDirectory()) {
            // 限深 6 层，防止极端深层结构拖慢统计
            if (depth < 6) total += await dirSize(p, depth + 1)
          } else {
            total += (await stat(p)).size
          }
        } catch {
          // 单个文件统计失败不阻塞整体
        }
      }
      return total
    }
    const [cacheSizeBytes, fsStat] = await Promise.all([
      dirSize(cacheDir),
      statfs(cacheDir).catch(() => null)
    ])
    return {
      cacheDir,
      cacheSizeBytes,
      diskTotalBytes: fsStat ? fsStat.blocks * fsStat.bsize : 0,
      diskFreeBytes: fsStat ? fsStat.bavail * fsStat.bsize : 0
    }
  })

  // 授权本地目录为工作空间（用户显式同意）
  ipcMain.handle(IPC.authorizeWorkspace, async (_e, dirPath: string) => {
    if (!dirPath || !isAbsolute(dirPath)) {
      throw new Error('无效的目录路径')
    }
    let s
    try {
      s = await stat(dirPath)
    } catch {
      throw new Error(`目录不存在或无法访问: ${basename(dirPath)}`)
    }
    if (!s.isDirectory()) {
      throw new Error(`所选路径不是目录: ${basename(dirPath)}`)
    }
    authorizedDirs.add(normalizePath(dirPath))
    return currentWorkspace()
  })

  // 新建空间：在存储根目录（或渲染层传入的空间根目录）下创建同名文件夹，并自动授权该空间
  ipcMain.handle(IPC.createSpace, async (_e, name: string, parentDir?: string) => {
    const clean = String(name ?? '').trim()
    if (!clean) throw new Error('空间名称不能为空')
    if (clean.length > 60) throw new Error('空间名称过长（最多 60 个字符）')
    // 文件系统非法字符 + 控制字符 + 相对路径保留名
    if (/[\\/:*?"<>|]/.test(clean) || /[\u0000-\u001f]/.test(clean) || clean === '.' || clean === '..') {
      throw new Error('空间名称包含非法字符')
    }
    const root = parentDir && isAbsolute(parentDir) ? parentDir : app.getPath('userData')
    const dir = pathJoin(root, clean)
    await mkdir(dir, { recursive: true })
    // 仅内置「项目说明」空间播种功能/技术两份说明文档（文档位于空间根目录）；
    // 普通新建空间不生成该文件夹，项目说明只随对应项目的内置空间存在
    if (clean === PROJECT_DOCS_DIRNAME) {
      await seedProjectDocs(dir)
    }
    authorizedDirs.add(normalizePath(dir))
    return dir
  })

  // 读取目录：仅允许已授权工作空间或沙箱工作区
  ipcMain.handle(IPC.readDirectory, async (_e, dirPath: string) => {
    if (!dirPath || !isAbsolute(dirPath)) {
      throw new Error('无效的目录路径')
    }
    if (!isPathAllowed(dirPath)) {
      throw new Error('拒绝访问：该目录未经授权，请先通过目录选择器授权工作空间')
    }
    return buildFileTree(dirPath)
  })

  ipcMain.handle(IPC.readFile, async (_e, filePath: string) => {
    if (!filePath || !isAbsolute(filePath)) {
      throw new Error('无效的文件路径')
    }
    if (!isPathAllowed(filePath)) {
      throw new Error('拒绝访问：该文件未经授权')
    }
    try {
      const content = await readFile(filePath, 'utf-8')
      return {
        path: filePath,
        content,
        language: langFromPath(filePath)
      }
    } catch (err) {
      throw new Error(`无法读取文件: ${basename(filePath)} - ${(err as Error).message}`)
    }
  })

  // 读取文件为 data URL（用于图片等二进制预览），仅限已授权路径
  ipcMain.handle(IPC.readFileAsDataUrl, async (_e, filePath: string) => {
    if (!filePath || !isAbsolute(filePath)) {
      throw new Error('无效的文件路径')
    }
    if (!isPathAllowed(filePath)) {
      throw new Error('拒绝访问：该文件未经授权')
    }
    try {
      const buf = await readFile(filePath)
      const mime = MIME_BY_EXT[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
      const dataUrl = `data:${mime};base64,${buf.toString('base64')}`
      return { path: filePath, dataUrl }
    } catch (err) {
      throw new Error(`无法读取文件: ${basename(filePath)} - ${(err as Error).message}`)
    }
  })

  // 写入文件：仅允许已授权工作空间或沙箱工作区
  ipcMain.handle(IPC.writeFile, async (_e, filePath: string, content: string) => {
    if (!filePath || !isAbsolute(filePath)) {
      throw new Error('无效的文件路径')
    }
    if (!isPathAllowed(filePath)) {
      throw new Error('拒绝访问：目标路径未经授权')
    }
    try {
      await writeFile(filePath, content, 'utf-8')
      return { path: filePath, ok: true }
    } catch (err) {
      throw new Error(`无法写入文件: ${basename(filePath)} - ${(err as Error).message}`)
    }
  })

  // 创建新文件（空文件）：仅允许沙箱工作区或已授权工作空间
  ipcMain.handle(IPC.createFile, async (_e, filePath: string) => {
    if (!filePath || !isAbsolute(filePath)) {
      throw new Error('无效的文件路径')
    }
    if (!isPathAllowed(filePath)) {
      throw new Error('拒绝访问：仅可在沙箱工作区或已授权工作空间内创建文件')
    }
    try {
      // 确保父目录存在
      await mkdir(dirnameOf(filePath), { recursive: true })
      // 文件不存在才创建，避免覆盖已有内容
      await writeFile(filePath, '', { flag: 'wx' })
      return { path: filePath, ok: true }
    } catch (err) {
      // wx 模式下文件已存在会抛 EEXIST，视为成功（幂等）
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        return { path: filePath, ok: true }
      }
      throw new Error(`无法创建文件: ${basename(filePath)} - ${(err as Error).message}`)
    }
  })

  // 授权单个文件：用户显式选择文件后，允许读取该文件本身
  ipcMain.handle(IPC.authorizeFile, async (_e, filePath: string) => {
    if (!filePath || !isAbsolute(filePath)) {
      throw new Error('无效的文件路径')
    }
    let s
    try {
      s = await stat(filePath)
    } catch {
      throw new Error(`文件不存在或无法访问: ${basename(filePath)}`)
    }
    if (s.isDirectory()) {
      throw new Error(`所选路径是目录，请使用授权工作空间`)
    }
    authorizedFiles.add(normalizePath(filePath))
    return currentWorkspace()
  })

  // 打开系统目录选择器（仅目录），传入父窗口修复无响应
  ipcMain.handle(IPC.selectDirectory, async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const opts: Electron.OpenDialogOptions = {
      title: '选择文件夹',
      properties: ['openDirectory']
    }
    const r = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts)
    return r.filePaths[0]
  })

  // 打开系统文件选择器（仅文件），传入父窗口
  ipcMain.handle(IPC.selectFile, async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const opts: Electron.OpenDialogOptions = {
      title: '选择文件',
      properties: ['openFile']
    }
    const r = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts)
    return r.filePaths[0]
  })

  ipcMain.handle(IPC.openPath, async (_e, path: string) => {
    // shell.openPath 以返回值报错（空串成功），转成 rejection 供渲染层捕获
    const err = await shell.openPath(path)
    if (err) throw new Error(`无法打开: ${err}`)
  })

  ipcMain.handle(IPC.showInFolder, (_e, path: string) => {
    shell.showItemInFolder(path)
  })

  ipcMain.on(IPC.windowMinimize, (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize()
  })
  ipcMain.on(IPC.windowMaximize, (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on(IPC.windowClose, (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close()
  })
  ipcMain.handle(IPC.windowIsMaximized, (e) => {
    return BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false
  })

  // 流式聊天转发：LLM SSE 逐 delta 经 sender 推回 renderer；sender 销毁时中止请求
  ipcMain.handle(IPC.chatSend, (e, payload: ChatStreamPayload) => {
    if (
      !payload ||
      typeof payload.requestId !== 'string' ||
      !Array.isArray(payload.messages) ||
      typeof payload.model !== 'string' ||
      typeof payload.baseUrl !== 'string'
    ) {
      return { ok: false, error: '聊天请求参数无效' }
    }
    const apiKey = getApiKey()
    if (!apiKey) return { ok: false, error: '尚未配置 API Key' }
    let baseUrl: string
    try {
      baseUrl = normalizeApiBaseUrl(
        payload.baseUrl,
        is.dev && process.env.WORKBUDDY_ALLOW_LOCAL_LLM_HTTP === '1'
      )
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
    const sender = e.sender
    return runChatStream({
      payload: { ...payload, baseUrl },
      apiKey,
      onChunk: (delta) => {
        if (!sender.isDestroyed()) sender.send(IPC.chatOnChunk, payload.requestId, delta)
      }
    })
  })
  ipcMain.handle(IPC.chatAbort, (_e, requestId: string) => {
    abortChat(requestId)
  })

  ipcMain.handle(IPC.apiKeyStatus, () => getApiKeyStatus())
  ipcMain.handle(IPC.apiKeySet, (_e, value: unknown) => setApiKey(value))
  ipcMain.handle(IPC.apiKeyClear, () => clearApiKey())
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.demo.ai-agent')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 沙箱工作区 + SQLite（失败自动降级内存态）
  // 安装目录下的 SmartDream/ 为全新目录时需先创建，SQLite 不会自建缺失的父目录
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
  } catch {
    // 安装目录不可写（如 /Applications 无权限）时降级到系统默认应用数据目录，保证应用能启动
    app.setPath('userData', join(app.getPath('appData'), 'SmartDream'))
    mkdirSync(app.getPath('userData'), { recursive: true })
  }
  sandboxDir = join(app.getPath('userData'), 'workspace')
  mkdir(sandboxDir, { recursive: true }).catch(() => {})
  initDb()
  initializeApiCredential()
  registerDbHandlers()
  restoreAuthorizations()

  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

/** 启动时从持久化任务恢复主进程授权状态（工作空间全量恢复以支持多空间并存，授权文件全量恢复） */
function restoreAuthorizations(): void {
  if (!isDbReady()) return
  for (const s of getAllSessions()) {
    if (s.workspace) authorizedDirs.add(normalizePath(s.workspace))
    if (s.authorizedFile) authorizedFiles.add(s.authorizedFile)
  }
}

app.on('will-quit', () => {
  closeDb()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
