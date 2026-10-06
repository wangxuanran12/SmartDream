import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import type { Dirent } from 'node:fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { readdir, stat, writeFile, mkdir, statfs } from 'fs/promises'
import { mkdirSync } from 'node:fs'
import { basename, extname, join as pathJoin, resolve, dirname as dirnameOf } from 'path'
import {
  IPC,
  type WorkspaceInfo,
  type ChatStreamPayload
} from '../shared/types'
import { MAX_CHAT_ATTACHMENT_BYTES, MAX_CHAT_ATTACHMENTS_TOTAL_BYTES } from '../shared/chatLimits'
import { initDb, closeDb, registerDbHandlers } from './db'
import { runChatStream, abortChat } from './llm'
import { seedProjectDocs, PROJECT_DOCS_DIRNAME } from './spaceDocs'
import { FileAuthorization, canonicalizePath, isWithinPath } from './fileAuthorization'
import { buildFileTree } from './fileTree'
import { resolveChatAttachments } from './chatAttachments'
import { readFileBounded } from './fileIO'
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

function safeFileReadReason(err: unknown): string {
  const errorMessage = err instanceof Error ? err.message : ''
  const errorCode =
    typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string'
      ? err.code
      : undefined
  if (
    errorMessage &&
    /^(拒绝访问|目标不是|文件过大|无效的文件系统路径)/.test(errorMessage)
  ) {
    return errorMessage
  }
  if (errorCode === 'ENOENT') return '文件或目录不存在或已移动'
  if (errorCode === 'EACCES' || errorCode === 'EPERM') return '没有读取权限'
  if (errorCode === 'ELOOP') return '路径无法安全解析'
  return '系统读取失败'
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

const MAX_IPC_FILE_BYTES = 10 * 1024 * 1024

// ---- 文件访问授权模型（授权仅限本次运行；每次授权均由主进程系统对话框发起）----
let sandboxDir = ''
const fileAuthorization = new FileAuthorization()
let workspaceRoot = ''

/** 确保沙箱工作区目录存在 */
async function ensureSandboxDir(): Promise<void> {
  await mkdir(sandboxDir, { recursive: true })
}

/** 返回当前授权状态 */
function currentWorkspace(): WorkspaceInfo {
  return {
    sandboxDir,
    authorizedDirs: fileAuthorization.getAuthorizedDirs(),
    authorizedFiles: fileAuthorization.getAuthorizedFiles()
  }
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
      sandbox: true,
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
    try {
      const url = new URL(details.url)
      if (
        (url.protocol === 'http:' || url.protocol === 'https:') &&
        !url.username &&
        !url.password
      ) {
        void shell.openExternal(url.href).catch((err) => {
          console.warn('[SmartDream] 无法打开外部链接:', err)
        })
      }
    } catch {
      // Reject malformed and non-web URLs.
    }
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    const rendererUrl = is.dev ? process.env['ELECTRON_RENDERER_URL'] : undefined
    if (!rendererUrl) {
      event.preventDefault()
      return
    }
    try {
      if (new URL(targetUrl).origin !== new URL(rendererUrl).origin) event.preventDefault()
    } catch {
      event.preventDefault()
    }
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
    if (!sandboxDir) sandboxDir = join(app.getPath('userData'), 'workspace')
    if (!workspaceRoot) workspaceRoot = sandboxDir
    return {
      platform: process.platform,
      version: process.version,
      homeDir: app.getPath('home'),
      appVersion: app.getVersion(),
      // 存储/缓存根目录（安装目录下 SmartDream/）与默认空间存储路径（其下 workspace/）
      dataDir: app.getPath('userData'),
      workspaceRoot
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

  const choosePath = async (
    event: Electron.IpcMainInvokeEvent,
    properties: Array<'openDirectory' | 'openFile'>
  ): Promise<string | undefined> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = { properties }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? undefined : result.filePaths[0]
  }

  ipcMain.handle(IPC.selectAndAuthorizeDirectory, async (event) => {
    const selected = await choosePath(event, ['openDirectory'])
    return selected ? fileAuthorization.authorizeDirectory(selected) : undefined
  })

  ipcMain.handle(IPC.selectAndAuthorizeFile, async (event) => {
    const selected = await choosePath(event, ['openFile'])
    return selected ? fileAuthorization.authorizeFile(selected) : undefined
  })

  ipcMain.handle(IPC.selectWorkspaceRoot, async (event) => {
    const selected = await choosePath(event, ['openDirectory'])
    if (!selected) return undefined
    workspaceRoot = await fileAuthorization.authorizeDirectory(selected)
    return workspaceRoot
  })

  // 空间根目录只由主进程维护：默认是应用工作区，用户可通过系统目录选择器临时更改。
  ipcMain.handle(IPC.createSpace, async (_e, name: unknown) => {
    if (typeof name !== 'string') throw new Error('空间名称无效')
    const clean = name.trim()
    if (!clean) throw new Error('空间名称不能为空')
    if (clean.length > 60) throw new Error('空间名称过长（最多 60 个字符）')
    // 文件系统非法字符 + 控制字符 + 相对路径保留名
    if (/[\\/:*?"<>|]/.test(clean) || /[\u0000-\u001f]/.test(clean) || clean === '.' || clean === '..') {
      throw new Error('空间名称包含非法字符')
    }
    const root = await canonicalizePath(workspaceRoot)
    if (!fileAuthorization.isAuthorizedCanonicalPath(root, 'write')) {
      throw new Error('空间存储目录未经本次运行授权，请重新选择目录')
    }
    const dir = pathJoin(root, clean)
    await mkdir(dir, { recursive: true })
    const canonicalDir = await canonicalizePath(dir)
    if (!isWithinPath(root, canonicalDir)) {
      throw new Error('拒绝创建空间：目标目录超出空间存储目录')
    }
    // 仅内置「项目说明」空间播种功能/技术两份说明文档（文档位于空间根目录）；
    // 普通新建空间不生成该文件夹，项目说明只随对应项目的内置空间存在
    if (clean === PROJECT_DOCS_DIRNAME) {
      await seedProjectDocs(canonicalDir)
    }
    return canonicalDir
  })

  // 读取目录：仅允许已授权工作空间或沙箱工作区
  ipcMain.handle(IPC.readDirectory, async (_e, dirPath: unknown) => {
    const canonical = await fileAuthorization.resolveAuthorizedPath(dirPath, 'read')
    if (!(await stat(canonical)).isDirectory()) throw new Error('所选路径不是目录')
    return buildFileTree(canonical)
  })

  ipcMain.handle(IPC.readFile, async (_e, filePath: unknown) => {
    try {
      const canonical = await fileAuthorization.resolveAuthorizedPath(filePath, 'read')
      const info = await stat(canonical)
      if (!info.isFile()) throw new Error('目标不是普通文件')
      if (info.size > MAX_IPC_FILE_BYTES) throw new Error('文件过大，无法通过预览读取')
      const content = (await readFileBounded(canonical, MAX_IPC_FILE_BYTES)).toString('utf8')
      return {
        path: canonical,
        content,
        language: langFromPath(canonical)
      }
    } catch (err) {
      throw new Error(
        `无法读取文件: ${typeof filePath === 'string' ? basename(filePath) : '无效路径'} - ${safeFileReadReason(err)}`
      )
    }
  })

  // 读取文件为 data URL（用于图片等二进制预览），仅限已授权路径
  ipcMain.handle(IPC.readFileAsDataUrl, async (_e, filePath: unknown) => {
    try {
      const canonical = await fileAuthorization.resolveAuthorizedPath(filePath, 'read')
      const info = await stat(canonical)
      if (!info.isFile()) throw new Error('目标不是普通文件')
      if (info.size > MAX_IPC_FILE_BYTES) throw new Error('文件过大，无法通过预览读取')
      const buf = await readFileBounded(canonical, MAX_IPC_FILE_BYTES)
      const mime = MIME_BY_EXT[extname(canonical).toLowerCase()] ?? 'application/octet-stream'
      const dataUrl = `data:${mime};base64,${buf.toString('base64')}`
      return { path: canonical, dataUrl }
    } catch (err) {
      throw new Error(
        `无法读取文件: ${typeof filePath === 'string' ? basename(filePath) : '无效路径'} - ${safeFileReadReason(err)}`
      )
    }
  })

  // 写入文件：仅允许已授权工作空间或沙箱工作区
  ipcMain.handle(IPC.writeFile, async (_e, filePath: unknown, content: unknown) => {
    if (typeof content !== 'string') throw new Error('文件内容格式无效')
    if (Buffer.byteLength(content, 'utf8') > MAX_IPC_FILE_BYTES) {
      throw new Error('文件内容过大，无法写入')
    }
    try {
      const canonical = await fileAuthorization.resolveAuthorizedPath(filePath, 'write', true)
      await writeFile(canonical, content, 'utf-8')
      return { path: canonical, ok: true }
    } catch (err) {
      throw new Error(
        `无法写入文件: ${typeof filePath === 'string' ? basename(filePath) : '无效路径'} - ${(err as Error).message}`
      )
    }
  })

  // 创建新文件（空文件）：仅允许沙箱工作区或已授权工作空间
  ipcMain.handle(IPC.createFile, async (_e, filePath: unknown) => {
    const canonical = await fileAuthorization.resolveAuthorizedPath(filePath, 'write', true)
    try {
      // 确保父目录存在
      await mkdir(dirnameOf(canonical), { recursive: true })
      const verified = await fileAuthorization.resolveAuthorizedPath(canonical, 'write', true)
      // 文件不存在才创建，避免覆盖已有内容
      await writeFile(verified, '', { flag: 'wx' })
      return { path: verified, ok: true }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        const existing = await fileAuthorization.resolveAuthorizedPath(canonical, 'write')
        if (!(await stat(existing)).isFile()) throw new Error('目标不是普通文件')
        return { path: existing, ok: true }
      }
      throw new Error(`无法创建文件: ${basename(canonical)} - ${(err as Error).message}`)
    }
  })

  ipcMain.handle(IPC.openPath, async (_e, path: unknown) => {
    const canonical = await canonicalizePath(path)
    const dataDir = await canonicalizePath(app.getPath('userData'))
    if (
      !fileAuthorization.isAuthorizedCanonicalPath(canonical, 'read') &&
      !isWithinPath(dataDir, canonical)
    ) {
      throw new Error('拒绝打开：该路径未经授权')
    }
    // shell.openPath 以返回值报错（空串成功），转成 rejection 供渲染层捕获
    const err = await shell.openPath(canonical)
    if (err) throw new Error(`无法打开: ${err}`)
  })

  ipcMain.handle(IPC.showInFolder, async (_e, path: unknown) => {
    const canonical = await canonicalizePath(path)
    const dataDir = await canonicalizePath(app.getPath('userData'))
    if (
      !fileAuthorization.isAuthorizedCanonicalPath(canonical, 'read') &&
      !isWithinPath(dataDir, canonical)
    ) {
      throw new Error('拒绝显示：该路径未经授权')
    }
    shell.showItemInFolder(canonical)
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
  ipcMain.handle(IPC.chatSend, async (e, payload: ChatStreamPayload) => {
    if (
      !payload ||
      typeof payload.requestId !== 'string' ||
      !Array.isArray(payload.messages) ||
      !payload.messages.length ||
      payload.messages.some(
        (message) =>
          !message ||
          !['system', 'user', 'assistant'].includes(message.role) ||
          typeof message.content !== 'string'
      ) ||
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

    const attachments = await resolveChatAttachments(
      payload.messages,
      (path) => fileAuthorization.resolveAuthorizedPath(path, 'read'),
      langFromPath,
      {
        maxFileBytes: MAX_CHAT_ATTACHMENT_BYTES,
        maxTotalBytes: MAX_CHAT_ATTACHMENTS_TOTAL_BYTES
      },
      readFileBounded
    )
    if (!attachments.ok) return attachments.result

    const sender = e.sender
    return runChatStream({
      payload: { ...payload, baseUrl, messages: attachments.messages },
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

app.whenReady().then(async () => {
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
  await mkdir(sandboxDir, { recursive: true })
  sandboxDir = await fileAuthorization.initializeSandbox(sandboxDir, app.getPath('userData'))
  workspaceRoot = sandboxDir
  initDb()
  initializeApiCredential()
  registerDbHandlers()

  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  closeDb()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
