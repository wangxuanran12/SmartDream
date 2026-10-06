// 共享类型定义：主进程、preload、renderer 三端共用
// 这是 IPC 契约的核心，保证跨进程类型安全

export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  extension?: string
  /** 文件大小（字节），仅文件节点提供；stat 失败时省略 */
  size?: number
  children?: FileNode[]
}

export interface FileContent {
  path: string
  content: string
  language: string
}

/** 应用沙箱工作区信息：始终可写，用于未授权本地目录时创建新文件 */
export interface WorkspaceInfo {
  /** 沙箱工作区绝对路径（应用数据目录下的 workspace/） */
  sandboxDir: string
  /** 当前已授权的工作空间目录集合（支持多个空间并存） */
  authorizedDirs: string[]
  /** 当前已授权读取的单个文件（仅本次运行有效） */
  authorizedFiles: string[]
}

export type Platform = 'darwin' | 'win32' | 'linux'

export interface AppInfo {
  platform: Platform
  version: string
  homeDir: string
  appVersion: string
  /** 存储/缓存根目录（应用安装目录下 SmartDream/，dev 为项目根目录下） */
  dataDir: string
  /** 默认空间存储路径（新建空间时在该目录下创建同名文件夹），默认为 dataDir 下的 workspace/ */
  workspaceRoot: string
}

/** 应用存储信息（设置弹窗「存储」区，app:get-storage 返回） */
export interface StorageInfo {
  /** 缓存根目录（应用数据目录，存放对话记录、运行缓存与临时文件） */
  cacheDir: string
  /** 缓存目录实际占用字节数（递归统计） */
  cacheSizeBytes: number
  /** 缓存所在磁盘总容量（字节） */
  diskTotalBytes: number
  /** 缓存所在磁盘剩余容量（字节） */
  diskFreeBytes: number
}

// IPC 通道名常量，避免字符串硬编码漂移
export const IPC = {
  getAppInfo: 'app:get-info',
  getStorageInfo: 'app:get-storage',
  readDirectory: 'fs:read-directory',
  readFile: 'fs:read-file',
  readFileAsDataUrl: 'fs:read-file-data-url',
  writeFile: 'fs:write-file',
  createFile: 'fs:create-file',
  getWorkspace: 'fs:get-workspace',
  selectAndAuthorizeDirectory: 'dialog:select-authorized-directory',
  selectAndAuthorizeFile: 'dialog:select-authorized-file',
  selectWorkspaceRoot: 'dialog:select-workspace-root',
  createSpace: 'space:create',
  openPath: 'shell:open-path',
  showInFolder: 'shell:show-in-folder',
  windowMinimize: 'window:minimize',
  windowMaximize: 'window:maximize',
  windowClose: 'window:close',
  windowIsMaximized: 'window:is-maximized',
  onMaximizeChange: 'window:on-maximize-change',
  dbLoad: 'db:load',
  dbSessionUpsert: 'db:session-upsert',
  dbSessionDelete: 'db:session-delete',
  dbMessageUpsert: 'db:message-upsert',
  dbMessagesReplace: 'db:messages-replace',
  dbSettingsUpsert: 'db:settings-upsert',
  dbUserUpsert: 'db:user-upsert',
  apiKeyStatus: 'credentials:status',
  apiKeySet: 'credentials:set',
  apiKeyClear: 'credentials:clear',
  chatSend: 'chat:send',
  chatOnChunk: 'chat:on-chunk',
  chatAbort: 'chat:abort'
} as const

/** 写文件结果 */
export interface WriteResult {
  path: string
  ok: boolean
}

// ---- 持久化（SQLite）载荷类型 ----

/** 任务持久化记录（messages 单独存储，见 MessagePayload） */
export interface SessionPayload {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  workspace?: string | null
  authorizedFile?: string | null
  mode?: string | null
  model?: string | null
  status?: string | null
}

/** 消息持久化记录（扩展字段统一序列化进 meta JSON） */
export interface MessagePayload {
  id: string
  taskId: string
  role: string
  content: string
  /** JSON 编码的扩展字段：attachments / mode / startedAt / durationMs / plan */
  meta?: string | null
  createdAt: number
}

/** 应用设置 KV 补丁（value 为标量，落库时 JSON 编码） */
export type SettingsPatch = Record<string, string | number | boolean | null>

/** 本地用户档案（单行表） */
export interface UserPayload {
  name: string
  plan: string
  createdAt?: number
}

// ---- 聊天流式转发（chat:send / chat:on-chunk / chat:abort）----

/** OpenAI 兼容的消息结构 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** renderer → main 的流式聊天请求载荷 */
export interface ChatStreamPayload {
  /** 请求唯一标识：chunk 推送按它路由，abort 按它定位 AbortController */
  requestId: string
  messages: ChatMessage[]
  /** OpenAI 兼容基础端点（如 https://open.bigmodel.cn/api/paas/v4，无尾斜杠） */
  baseUrl: string
  model: string
}

/** 流结束/失败时 chat:send 的 resolve 结果 */
export interface ChatStreamResult {
  ok: boolean
  /** 失败原因摘要（ok=false 时存在；用户主动中止时 aborted=true） */
  error?: string
  aborted?: boolean
}

/** db:load 返回的完整快照：任务 + 各任务消息 + 设置 + 用户档案 */
export interface DbSnapshot {
  sessions: SessionPayload[]
  messages: MessagePayload[]
  settings: Record<string, string | number | boolean>
  user: UserPayload | null
}

export interface ApiKeyStatus {
  configured: boolean
  persistent: boolean
  warning: string
}

// preload 通过 contextBridge 暴露的 API 形状
export interface ElectronAPI {
  getAppInfo: () => Promise<AppInfo>
  /** 查询应用存储信息（缓存目录 + 占用 + 磁盘容量），设置弹窗「存储」区使用 */
  getStorageInfo: () => Promise<StorageInfo>
  readDirectory: (dirPath: string) => Promise<FileNode[]>
  readFile: (filePath: string) => Promise<FileContent>
  /** 读取文件为 data URL（用于图片等二进制预览），仅限已授权路径 */
  readFileAsDataUrl: (filePath: string) => Promise<{ path: string; dataUrl: string }>
  /** 写入文件内容（仅限已授权工作空间或沙箱工作区内） */
  writeFile: (filePath: string, content: string) => Promise<WriteResult>
  /** 在沙箱工作区或授权工作空间内创建新文件（不存在则创建空文件） */
  createFile: (filePath: string) => Promise<WriteResult>
  /** 查询当前工作空间授权状态与沙箱目录 */
  getWorkspace: () => Promise<WorkspaceInfo>
  /** 通过系统目录选择器选择并授权工作空间，不能由 renderer 指定任意路径 */
  selectAndAuthorizeDirectory: () => Promise<string | undefined>
  /** 通过系统文件选择器选择并授权单文件，只允许读取该文件 */
  selectAndAuthorizeFile: () => Promise<string | undefined>
  /** 通过系统目录选择器设置本次运行的默认空间根目录 */
  selectWorkspaceRoot: () => Promise<string | undefined>
  /** 在主进程管理的空间根目录中创建空间，不接受 renderer 提供的路径 */
  createSpace: (name: string) => Promise<string>
  openPath: (path: string) => Promise<void>
  showInFolder: (path: string) => Promise<void>
  windowMinimize: () => void
  windowMaximize: () => void
  windowClose: () => void
  windowIsMaximized: () => Promise<boolean>
  onMaximizeChange: (cb: (isMax: boolean) => void) => () => void
  /** 设置渲染进程缩放系数（浏览器级缩放，F-44 字体大小档位用；等价 Ctrl+/-） */
  setZoomFactor: (factor: number) => void
  // ---- 持久化（SQLite，主进程单写者；DB 不可用时调用方静默降级） ----
  /** 启动加载全量快照（任务 + 消息 + 设置 + 用户档案） */
  dbLoad: () => Promise<DbSnapshot>
  /** 新增或更新任务（不含消息） */
  dbSessionUpsert: (session: SessionPayload) => Promise<void>
  /** 删除任务及其全部消息（FK CASCADE） */
  dbSessionDelete: (id: string) => Promise<void>
  /** 写入单条消息（流式消息应在流结束后调用） */
  dbMessageUpsert: (msg: MessagePayload) => Promise<void>
  /** 整体替换某任务的全部消息（/clear 等场景） */
  dbMessagesReplace: (taskId: string, messages: MessagePayload[]) => Promise<void>
  /** 合并写入应用设置 KV */
  dbSettingsUpsert: (patch: SettingsPatch) => Promise<void>
  /** 写入本地用户档案（单行覆盖） */
  dbUserUpsert: (user: UserPayload) => Promise<void>
  /** 查询 API Key 是否配置及是否已安全持久化，不返回凭据内容 */
  getApiKeyStatus: () => Promise<ApiKeyStatus>
  /** 保存 API Key；凭据内容不会返回 renderer */
  setApiKey: (value: string) => Promise<ApiKeyStatus>
  /** 清除已保存 API Key */
  clearApiKey: () => Promise<ApiKeyStatus>
  /**
   * 获取拖拽文件在磁盘上的绝对路径（webUtils.getPathForFile）。
   * Electron 32+ 已移除 DOM File.path 属性，拖拽附件必须走此方法；
   * 入参为 DOM File 对象，此处以最小结构声明避免在 shared 层依赖 DOM lib。
   */
  getPathForFile: (file: { name: string }) => string
  // ---- 聊天流式转发（主进程 fetch → SSE → on-chunk 推送） ----
  /**
   * 发起流式聊天：preload 内先订阅 chunk 事件再 invoke，chunk 经 onChunk 回调
   * 逐段送达，流结束/失败时 result settle。cancel() 中止请求（切换会话/新发送时终止旧流）。
   */
  chatStream: (
    payload: ChatStreamPayload,
    onChunk: (delta: string) => void
  ) => {
    result: Promise<ChatStreamResult>
    cancel: () => void
  }
}
