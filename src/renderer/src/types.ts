// renderer 侧的领域类型：会话、消息、文件树、diff

export type Role = 'user' | 'assistant' | 'system'

/** 工作模式：默认 Agent 执行 / Plan 先出方案 / Ask 仅问答（对齐 WorkBuddy） */
export type TaskMode = 'agent' | 'plan' | 'ask'

/** 任务执行状态：多任务并行时侧边栏实时展示 */
export type TaskStatus = 'idle' | 'running'

/** Plan 方案的确认状态 */
export type PlanStatus = 'proposed' | 'confirmed'

export interface Message {
  id: string
  role: Role
  content: string
  /** 附件/上下文文件（可选） */
  attachments?: string[]
  /** 文本粘贴 Chip 的原文，作为请求上下文使用 */
  textAttachments?: string[]
  /** 文件附件的显示名与本地路径；主进程授权读取后才会并入请求 */
  fileAttachments?: Array<{ name: string; path: string }>
  /** 发送该消息时的工作模式 */
  mode?: TaskMode
  /** 是否是流式输出中 */
  streaming?: boolean
  /** 助手消息开始响应的时间戳（用于运行耗时统计） */
  startedAt?: number
  /** 本轮回复最终耗时（ms），流式结束后定格 */
  durationMs?: number
  /** Plan 模式产出的方案状态 */
  plan?: PlanStatus
}

export interface Session {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: Message[]
  /** 当前会话授权的工作空间目录（用户通过目录选择器指定） */
  workspace?: string
  /** 当前会话授权的单个文件路径（用户显式选择文件后加入） */
  authorizedFile?: string
  /** 工作模式，默认 agent */
  mode?: TaskMode
  /** 当前使用的模型 id */
  model?: string
  /** 任务执行状态 */
  status?: TaskStatus
}

/** 输入框附件：文件卡片 / 超长粘贴压缩的 Chip */
export interface Attachment {
  id: string
  kind: 'file' | 'chip'
  name: string
  /** 文件类型附件的路径 */
  path?: string
  /** chip 类型附件的原文（悬停预览 / 点击展开） */
  preview?: string
  charCount?: number
}

export interface DiffLine {
  type: 'context' | 'add' | 'del'
  oldLine?: number
  newLine?: number
  content: string
}

export interface DiffResult {
  lines: DiffLine[]
  additions: number
  deletions: number
}

export interface SlashCommand {
  id: string
  trigger: string
  label: string
  description: string
  icon: string
}
