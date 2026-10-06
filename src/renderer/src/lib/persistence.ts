// 启动持久化恢复：从 SQLite 快照还原会话 / UI 设置 / 用户档案
// - db:load 失败或返回空（降级态）→ 维持 INITIAL_SESSIONS 默认内存态，不阻塞 UI
// - 空库首启 → 幂等写入示例任务种子
import type { DbSnapshot, MessagePayload, SessionPayload } from '@shared/types'
import type { Message, Role, Session, TaskMode, TaskStatus } from '../types'
import {
  INITIAL_SESSIONS,
  DEMO_SPACE_NAME,
  DEMO_SYNC_FILENAME,
  DEMO_SYNC_SCRIPT,
  DEMO_SCRIPT_DOC_FILENAME,
  DEMO_SCRIPT_DOC,
  PROJECT_DOCS_SPACE_NAME,
  buildDemoSpaceSession,
  buildProjectDocsSpaceSession
} from '../data/mockData'
import {
  useSessionStore,
  useUIStore,
  useUserStore,
  toSessionPayload,
  toMessagePayload,
  applyUiScale
} from '../store/useStore'
import type { PermissionMode, PreviewTab, AppLang, UiScale } from '../store/useStore'

function toMessage(p: MessagePayload): Message {
  let meta: Partial<Message> = {}
  try {
    meta = p.meta ? (JSON.parse(p.meta) as Partial<Message>) : {}
  } catch {
    meta = {}
  }
  return { id: p.id, role: p.role as Role, content: p.content, ...meta }
}

function toSession(p: SessionPayload, messages: Message[]): Session {
  return {
    id: p.id,
    title: p.title,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    messages,
    workspace: p.workspace ?? undefined,
    authorizedFile: p.authorizedFile ?? undefined,
    mode: (p.mode as TaskMode | null) ?? undefined,
    model: p.model ?? undefined,
    status: (p.status as TaskStatus | null) ?? undefined
  }
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? Math.round(v) : NaN
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

/** 恢复 UI 设置（仅在值合法时覆盖默认值） */
function applySettings(s: DbSnapshot['settings']): void {
  const patch: Partial<ReturnType<typeof useUIStore.getState>> = {}

  if (s.theme === 'light' || s.theme === 'dark') {
    patch.theme = s.theme
    document.documentElement.classList.toggle('light', s.theme === 'light')
  }
  if (typeof s.sidebarCollapsed === 'boolean') patch.sidebarCollapsed = s.sidebarCollapsed
  if (typeof s.loggedIn === 'boolean') patch.loggedIn = s.loggedIn
  if (s.lang === 'zh' || s.lang === 'en') patch.lang = s.lang as AppLang
  if (s.uiScale === 'small' || s.uiScale === 'default' || s.uiScale === 'large') {
    patch.uiScale = s.uiScale as UiScale
  }
  if (typeof s.workspaceRoot === 'string') patch.workspaceRoot = s.workspaceRoot
  // 模型服务配置：非空字符串才覆盖默认值
  if (typeof s.apiBaseUrl === 'string' && s.apiBaseUrl) patch.apiBaseUrl = s.apiBaseUrl
  if (typeof s.apiModel === 'string' && s.apiModel) patch.apiModel = s.apiModel
  if (typeof s.previewVisible === 'boolean') patch.previewVisible = s.previewVisible
  if (s.previewTab === 'code' || s.previewTab === 'files') {
    patch.previewTab = s.previewTab as PreviewTab
  }
  if (s.permissionMode === 'default' || s.permissionMode === 'full') {
    patch.permissionMode = s.permissionMode as PermissionMode
  }
  patch.sidebarWidth = clampInt(s.sidebarWidth, 180, 420, 260)
  patch.previewWidth = clampInt(s.previewWidth, 280, 700, 420)

  useUIStore.setState(patch)
  // 字体大小档位恢复后立即生效
  applyUiScale(useUIStore.getState().uiScale)
}

/** 空库首启：把示例任务作为种子写入（幂等，仅空库触发一次） */
async function seedInitialSessions(api: NonNullable<Window['electronAPI']>): Promise<void> {
  const sessions = [...INITIAL_SESSIONS]

  // 内置示例空间：在默认空间存储路径下创建（幂等），任务绑定各自目录
  try {
    const info = await api.getAppInfo()
    const wsRoot = typeof info?.workspaceRoot === 'string' ? info.workspaceRoot : ''
    if (wsRoot && typeof api.createSpace === 'function') {
      const demoDir = await api.createSpace(DEMO_SPACE_NAME, wsRoot)
      if (typeof api.writeFile === 'function') {
        await api.writeFile(`${demoDir}/${DEMO_SYNC_FILENAME}`, DEMO_SYNC_SCRIPT)
        // 空间内置脚本说明：描述 fileSync.js 的功能 / 使用 / 配置
        await api.writeFile(`${demoDir}/${DEMO_SCRIPT_DOC_FILENAME}`, DEMO_SCRIPT_DOC)
      }
      sessions.push(buildDemoSpaceSession(demoDir))
      // 内置「项目说明」空间：space:create 自动播种功能/技术两份说明文档（空间同名时文档位于空间根目录）
      const projDir = await api.createSpace(PROJECT_DOCS_SPACE_NAME, wsRoot)
      sessions.push(buildProjectDocsSpaceSession(projDir))
      // 标记内置空间已初始化：此后删除不复活（与 testDemo 行为一致）
      await api.dbSettingsUpsert({ projectSpaceSeeded: true })
    }
  } catch {
    // 示例空间创建失败不阻塞种子写入
  }

  for (const s of sessions) {
    try {
      await api.dbSessionUpsert(toSessionPayload(s))
      await api.dbMessagesReplace(s.id, s.messages.map((m) => toMessagePayload(s.id, m)))
    } catch {
      // 种子写入失败不阻塞启动
    }
  }
  useSessionStore.setState({
    sessions,
    activeId: sessions[0].id
  })
}

/** 路径规范化：统一分隔符为 / 并去尾部分隔符（Windows 反斜杠与拼接正斜杠的比较基线） */
function normPath(p: string): string {
  return p.replace(/[\\/]+$/, '').replace(/\\/g, '/')
}

/**
 * 内置「项目说明」空间兜底：老库（非空库不走播种）升级后也能看到该空间。
 * 幂等规则：projectSpaceSeeded 标记已写入则完全跳过（用户删除不复活，与 testDemo 行为一致）；
 * 未标记且无绑定会话时创建空间（主进程自动播种文档）并补一个绑定任务，不抢占激活任务。
 */
async function ensureProjectDocsSpace(api: NonNullable<Window['electronAPI']>): Promise<void> {
  try {
    if (typeof api.createSpace !== 'function') return
    let root = useUIStore.getState().workspaceRoot
    if (!root) {
      const info = await api.getAppInfo()
      root = typeof info?.workspaceRoot === 'string' ? info.workspaceRoot : ''
    }
    if (!root) return
    const target = `${normPath(root)}/${PROJECT_DOCS_SPACE_NAME}`
    const bound = useSessionStore.getState().sessions.some(
      (s) => s.workspace && normPath(s.workspace) === target
    )
    if (bound) {
      await api.dbSettingsUpsert({ projectSpaceSeeded: true })
      return
    }
    const dir = await api.createSpace(PROJECT_DOCS_SPACE_NAME, root)
    const s = buildProjectDocsSpaceSession(dir)
    useSessionStore.setState((st) => ({ sessions: [s, ...st.sessions] }))
    await api.dbSessionUpsert(toSessionPayload(s)).catch(() => {})
    await api.dbSettingsUpsert({ projectSpaceSeeded: true }).catch(() => {})
  } catch (err) {
    console.warn('[SmartDream] 初始化「项目说明」空间失败:', err)
  }
}

/**
 * 应用启动时调用一次：加载 SQLite 快照并还原状态。
 * 无 Electron 环境（纯浏览器）或加载失败时直接返回，UI 使用默认内存态。
 */
export async function hydrate(): Promise<void> {
  const api = window.electronAPI
  if (!api) return

  try {
    useUIStore.getState().setApiKeyStatus(await api.getApiKeyStatus())
  } catch {
    // Keep the default unconfigured state if the credential IPC is unavailable.
  }

  let snap: DbSnapshot | null
  try {
    snap = await api.dbLoad()
  } catch {
    return
  }
  if (!snap) return // DB 降级态（主进程 initDb 失败）

  if (snap.sessions.length === 0) {
    await seedInitialSessions(api)
  } else {
    // 消息按 task 分组（已按 created_at 排序返回）
    const byTask = new Map<string, Message[]>()
    for (const p of snap.messages) {
      const list = byTask.get(p.taskId) ?? []
      list.push(toMessage(p))
      byTask.set(p.taskId, list)
    }
    const sessions = snap.sessions.map((p) => toSession(p, byTask.get(p.id) ?? []))

    // 恢复上次激活任务；不存在则回落到第一个
    const savedActive = typeof snap.settings.activeTaskId === 'string' ? snap.settings.activeTaskId : ''
    const activeId = sessions.some((x) => x.id === savedActive) ? savedActive : sessions[0]?.id ?? ''
    useSessionStore.setState({ sessions, activeId })
  }

  applySettings(snap.settings)
  if (snap.user) useUserStore.setState({ name: snap.user.name, plan: snap.user.plan })

  // 默认工作储存路径：从未持久化过该设置时，回落为主进程提供的默认值（安装目录下 data/workspace/）
  if (typeof snap.settings.workspaceRoot !== 'string') {
    api
      .getAppInfo()
      .then((info) => {
        // 防御：旧 preload 构建无 workspaceRoot 字段时不覆盖
        if (typeof info.workspaceRoot === 'string') {
          useUIStore.setState({ workspaceRoot: info.workspaceRoot })
        }
      })
      .catch(() => {})
  }

  // 首启播种刚管理过 projectSpaceSeeded 标记（且播种流程已建「项目说明」空间）：
  // snap.settings 是启动时的旧快照（首启必无标记），此时不能再跑兜底，否则 Windows 上
  // 路径分隔符差异导致 bound 检测失效，重复补建同名任务
  const seededNow = snap.sessions.length === 0
  if (!snap.settings.projectSpaceSeeded && !seededNow) {
    await ensureProjectDocsSpace(api)
  }
}
