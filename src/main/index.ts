import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import type { Dirent } from 'node:fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { readdir, stat, mkdir, statfs } from 'fs/promises'
import { mkdirSync } from 'node:fs'
import { basename, extname, join as pathJoin, resolve, dirname as dirnameOf } from 'path'
import {
  IPC,
  type WorkspaceInfo,
  type ChatStreamPayload
} from '../shared/types'
import { MAX_CHAT_ATTACHMENT_BYTES, MAX_CHAT_ATTACHMENTS_TOTAL_BYTES } from '../shared/chatLimits'
import {
  initDb,
  closeDb,
  getAllSessions,
  getSettings,
  registerDbHandlers,
  upsertApiBaseUrl
} from './db'
import { runChatStream, abortChat } from './llm'
import { seedProjectDocs, PROJECT_DOCS_DIRNAME } from './spaceDocs'
import { FileAuthorization, canonicalizePath, isSamePath, isWithinPath } from './fileAuthorization'
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
import { createApiConfigService } from './apiConfigService'
import { normalizeApiBaseUrl } from './apiConfig'
import { DEFAULT_API_BASE_URL } from '../shared/modelDefaults'
import { migrateLegacyDataDirectory } from './dataDirectory'

// E2E/自动化测试：显式覆盖应用数据目录；设置后不执行旧目录迁移
const dataDirOverride =
  process.env.SMARTDREAM_DATA_DIR ?? process.env.WORKBUDDY_DATA_DIR
const allowLocalLlmHttp =
  is.dev &&
  (process.env.SMARTDREAM_ALLOW_LOCAL_LLM_HTTP === '1' ||
    process.env.WORKBUDDY_ALLOW_LOCAL_LLM_HTTP === '1')
const legacyInstallDir = app.isPackaged
  ? process.platform === 'darwin'
    ? resolve(app.getPath('exe'), '..', '..', '..', '..')
    : dirnameOf(app.getPath('exe'))
  : app.getAppPath()
const legacyDataDir = join(legacyInstallDir, 'SmartDream')
if (dataDirOverride) {
  app.setPath('userData', dataDirOverride)
} else {
  app.setPath('userData', join(app.getPath('appData'), 'SmartDream'))
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
    /^(拒绝访问|目标不是|文件过大|无效的文件系统路径|任务信息无效)/.test(errorMessage)
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
let apiConfigService: ReturnType<typeof createApiConfigService> | null = null

function createTrustedApiConfig(initialBaseUrl: string): ReturnType<typeof createApiConfigService> {
  return createApiConfigService(initialBaseUrl, {
    normalizeBaseUrl: (value) => normalizeApiBaseUrl(value, allowLocalLlmHttp),
    persistBaseUrl: upsertApiBaseUrl,
    confirmBaseUrlChange: async (_current, next) => {
      const options: Electron.MessageBoxOptions = {
        type: 'warning',
        title: '确认更换模型服务',
        message: '后续模型请求中的 API Key 将发送到以下服务：',
        detail: next,
        buttons: ['确认更换', '取消'],
        defaultId: 1,
        cancelId: 1,
        noLink: true
      }
      const win = BrowserWindow.getFocusedWindow()
      const confirmation = win
        ? await dialog.showMessageBox(win, options)
        : await dialog.showMessageBox(options)
      return confirmation.response === 0
    }
  })
}

/** 确保沙箱工作区目录存在 */
async function ensureSandboxDir(): Promise<void> {
  await mkdir(sandboxDir, { recursive: true })
}

/** 返回当前授权状态 */
function currentWorkspace(scopeId?: string): WorkspaceInfo {
  return {
    sandboxDir,
    authorizedDirs: fileAuthorization.getAuthorizedDirs(scopeId),
    authorizedFiles: fileAuthorization.getAuthorizedFiles(scopeId)
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
  ipcMain.handle(IPC.getWorkspace, async (_event, scopeId?: unknown) => {
    if (scopeId !== undefined && (typeof scopeId !== 'string' || !scopeId)) {
      throw new Error('任务信息无效')
    }
    if (!sandboxDir) sandboxDir = join(app.getPath('userData'), 'workspace')
    await ensureSandboxDir()
    return currentWorkspace(scopeId)
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

  ipcMain.handle(IPC.openDataDirectory, async () => {
    const dataDir = await canonicalizePath(app.getPath('userData'))
    const err = await shell.openPath(dataDir)
    if (err) throw new Error(`无法打开应用数据目录: ${err}`)
  })

  const choosePath = async (
    event: Electron.IpcMainInvokeEvent,
    properties: Array<'openDirectory' | 'openFile'>,
    defaultPath?: string
  ): Promise<string | undefined> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      properties,
      ...(defaultPath ? { defaultPath } : {})
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? undefined : result.filePaths[0]
  }

  ipcMain.handle(IPC.selectAndAuthorizeDirectory, async (event, sessionId: unknown) => {
    if (typeof sessionId !== 'string' || !sessionId) throw new Error('任务信息无效')
    const selected = await choosePath(event, ['openDirectory'])
    if (!selected) return undefined
    const canonical = await canonicalizePath(selected)
    return fileAuthorization.authorizeDirectory(canonical, canonical)
  })

  ipcMain.handle(IPC.selectAndAuthorizeFile, async (event, sessionId: unknown) => {
    if (typeof sessionId !== 'string' || !sessionId) throw new Error('任务信息无效')
    const selected = await choosePath(event, ['openFile'])
    return selected ? fileAuthorization.authorizeFile(selected, sessionId) : undefined
  })

  ipcMain.handle(
    IPC.reauthorizeDirectory,
    async (event, sessionId: unknown, expectedPath: unknown) => {
      if (typeof sessionId !== 'string' || !sessionId) {
        throw new Error('重新授权失败：任务信息无效')
      }
      const expected = await canonicalizePath(expectedPath)
      const session = getAllSessions().find((entry) => entry.id === sessionId)
      if (!session?.workspace || !isSamePath(session.workspace, expected)) {
        throw new Error('重新授权失败：该任务没有此文件夹的历史记录')
      }
      const selected = await choosePath(event, ['openDirectory'], expected)
      if (!selected) return undefined
      const canonicalSelected = await canonicalizePath(selected)
      if (!isSamePath(canonicalSelected, expected)) {
        throw new Error('重新授权失败：必须选择原文件夹，不能替换为其他文件夹')
      }
      return fileAuthorization.authorizeDirectory(canonicalSelected, expected)
    }
  )

  ipcMain.handle(
    IPC.reauthorizeFile,
    async (event, sessionId: unknown, expectedPath: unknown) => {
      if (typeof sessionId !== 'string' || !sessionId) {
        throw new Error('重新授权失败：任务信息无效')
      }
      const expected = await canonicalizePath(expectedPath)
      const session = getAllSessions().find((entry) => entry.id === sessionId)
      if (!session?.authorizedFile || !isSamePath(session.authorizedFile, expected)) {
        throw new Error('重新授权失败：该任务没有此文件的历史记录')
      }
      const selected = await choosePath(event, ['openFile'], expected)
      if (!selected) return undefined
      const canonicalSelected = await canonicalizePath(selected)
      if (!isSamePath(canonicalSelected, expected)) {
        throw new Error('重新授权失败：必须选择原文件，不能替换为其他文件')
      }
      return fileAuthorization.authorizeFile(canonicalSelected, sessionId)
    }
  )

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

  // 读取目录：仅允许沙箱、全局管理根目录或指定空间范围内已授权的目录。
  ipcMain.handle(IPC.readDirectory, async (_e, dirPath: unknown, scopeId?: unknown) => {
    if (scopeId !== undefined && (typeof scopeId !== 'string' || !scopeId)) {
      throw new Error('任务信息无效')
    }
    const canonical = await fileAuthorization.resolveAuthorizedPath(
      dirPath,
      'read',
      false,
      scopeId
    )
    if (!(await stat(canonical)).isDirectory()) throw new Error('所选路径不是目录')
    return buildFileTree(canonical)
  })

  ipcMain.handle(IPC.readFile, async (_e, filePath: unknown, scopeId?: unknown) => {
    try {
      if (scopeId !== undefined && (typeof scopeId !== 'string' || !scopeId)) {
        throw new Error('任务信息无效')
      }
      const canonical = await fileAuthorization.resolveAuthorizedPath(
        filePath,
        'read',
        false,
        scopeId
      )
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
  ipcMain.handle(IPC.readFileAsDataUrl, async (_e, filePath: unknown, scopeId?: unknown) => {
    try {
      if (scopeId !== undefined && (typeof scopeId !== 'string' || !scopeId)) {
        throw new Error('任务信息无效')
      }
      const canonical = await fileAuthorization.resolveAuthorizedPath(
        filePath,
        'read',
        false,
        scopeId
      )
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

  ipcMain.handle(IPC.openPath, async (_e, path: unknown, sessionId?: unknown) => {
    if (sessionId !== undefined && (typeof sessionId !== 'string' || !sessionId)) {
      throw new Error('任务信息无效')
    }
    const canonical = await canonicalizePath(path)
    if (!fileAuthorization.isAuthorizedCanonicalPath(canonical, 'read', sessionId)) {
      throw new Error('拒绝打开：该路径未经授权')
    }
    // shell.openPath 以返回值报错（空串成功），转成 rejection 供渲染层捕获
    const err = await shell.openPath(canonical)
    if (err) throw new Error(`无法打开: ${err}`)
  })

  ipcMain.handle(IPC.showInFolder, async (_e, path: unknown, sessionId?: unknown) => {
    if (sessionId !== undefined && (typeof sessionId !== 'string' || !sessionId)) {
      throw new Error('任务信息无效')
    }
    const canonical = await canonicalizePath(path)
    if (!fileAuthorization.isAuthorizedCanonicalPath(canonical, 'read', sessionId)) {
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
      typeof payload.sessionId !== 'string' ||
      !payload.sessionId ||
      typeof payload.authorizationScope !== 'string' ||
      !payload.authorizationScope ||
      !Array.isArray(payload.messages) ||
      !payload.messages.length ||
      payload.messages.some(
        (message) =>
          !message ||
          !['system', 'user', 'assistant'].includes(message.role) ||
          typeof message.content !== 'string'
      ) ||
      typeof payload.model !== 'string'
    ) {
      return { ok: false, error: '聊天请求参数无效' }
    }
    const apiKey = getApiKey()
    if (!apiKey) return { ok: false, error: '尚未配置 API Key' }
    if (!apiConfigService) return { ok: false, error: '模型服务配置尚未就绪' }

    const attachments = await resolveChatAttachments(
      payload.messages,
      (path) =>
        fileAuthorization.resolveAuthorizedPath(path, 'read', false, payload.authorizationScope),
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
      payload: {
        ...payload,
        baseUrl: apiConfigService.getBaseUrl(),
        messages: attachments.messages
      },
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
  ipcMain.handle(IPC.apiBaseUrlSet, async (_event, value: unknown) => {
    if (!apiConfigService) throw new Error('模型服务配置尚未就绪')
    return apiConfigService.setBaseUrl(value)
  })
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.demo.ai-agent')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 将旧版安装目录数据非破坏性复制到用户级目录；旧目录始终保留。
  if (!dataDirOverride) {
    try {
      const migration = await migrateLegacyDataDirectory(legacyDataDir, app.getPath('userData'))
      if (migration.copiedFiles > 0) {
        console.info(`[SmartDream] 已从旧数据目录复制 ${migration.copiedFiles} 个文件；旧目录保留。`)
      }
      if (migration.conflicts.length > 0) {
        await dialog.showMessageBox({
          type: 'warning',
          title: 'SmartDream 数据迁移',
          message: '部分旧数据与新目录中的文件冲突，未覆盖现有文件。',
          detail: `已复制 ${migration.copiedFiles} 个文件。\n旧数据仍保留在：${legacyDataDir}\n旧版数据库可能包含明文 API Key；确认新目录的数据和密钥状态后，可手动删除旧目录。\n冲突项：${migration.conflicts.length}`
        })
      } else if (migration.copiedFiles > 0) {
        await dialog.showMessageBox({
          type: 'info',
          title: 'SmartDream 数据迁移完成',
          message: `已复制 ${migration.copiedFiles} 个文件到当前用户数据目录。`,
          detail: `旧数据副本仍保留在：${legacyDataDir}\n旧版数据库可能包含明文 API Key；确认新目录的数据和密钥状态后，可手动删除旧目录。`
        })
      }
    } catch (error) {
      console.error('[SmartDream] 旧版数据迁移失败:', error)
      await dialog.showMessageBox({
        type: 'error',
        title: 'SmartDream 无法迁移旧数据',
        message: '应用未启动，以避免使用空白数据目录覆盖或掩盖旧数据。',
        detail: `旧数据：${legacyDataDir}\n目标目录：${app.getPath('userData')}\n${String(error)}`
      })
      app.quit()
      return
    }
  }

  // 沙箱工作区 + SQLite（失败自动降级内存态）
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
  } catch (error) {
    console.error('[SmartDream] 无法创建应用数据目录:', error)
    await dialog.showMessageBox({
      type: 'error',
      title: 'SmartDream 无法启动',
      message: '无法访问当前用户的应用数据目录。',
      detail: `${app.getPath('userData')}\n${String(error)}`
    })
    app.quit()
    return
  }
  sandboxDir = join(app.getPath('userData'), 'workspace')
  await mkdir(sandboxDir, { recursive: true })
  sandboxDir = await fileAuthorization.initializeSandbox(sandboxDir, app.getPath('userData'))
  workspaceRoot = sandboxDir
  const dbReady = initDb()
  initializeApiCredential()
  const configuredBaseUrl = getSettings().apiBaseUrl
  try {
    apiConfigService = createTrustedApiConfig(
      typeof configuredBaseUrl === 'string' && configuredBaseUrl
        ? configuredBaseUrl
        : DEFAULT_API_BASE_URL
    )
  } catch (error) {
    console.error('[SmartDream] 已保存的模型服务地址无效，恢复默认地址:', error)
    await dialog.showMessageBox({
      type: 'warning',
      title: '模型服务地址无效',
      message: '已恢复到默认模型服务地址。',
      detail: String(error)
    })
    apiConfigService = createTrustedApiConfig(DEFAULT_API_BASE_URL)
    if (dbReady) {
      try {
        upsertApiBaseUrl(DEFAULT_API_BASE_URL)
      } catch (persistError) {
        console.error('[SmartDream] 无法保存默认模型服务地址:', persistError)
        await dialog.showMessageBox({
          type: 'error',
          title: '模型服务配置未保存',
          message: '已在本次运行中恢复默认模型服务，但无法保存到本地数据库。',
          detail: String(persistError)
        })
      }
    }
  }
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
