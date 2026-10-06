import { useRef, useState, useEffect, useCallback } from 'react'
import {
  Plus,
  X,
  FileText,
  TextQuote,
  FolderOpen,
  FolderPlus,
  FileCode2,
  Check,
  ListChecks,
  MessageCircleQuestion,
  Zap,
  ShieldCheck,
  ChevronDown,
  Mic,
  ArrowUp
} from 'lucide-react'
import { SLASH_COMMANDS, MODELS } from '../data/mockData'
import { useSessionStore, useUIStore, genAttachmentId, isValidSpaceName } from '../store/useStore'
import { useT } from '../i18n'
import type { I18nKey } from '../i18n'
import type { Message, TaskMode, Attachment } from '../types'

/** 超过该长度的粘贴文本自动压缩为 Chip（对齐 WorkBuddy：3000 字符） */
const PASTE_CHIP_THRESHOLD = 3000

/** 卡内工具行弹出菜单类型：+ 菜单 / 权限 / 模型（互斥） */
type ToolMenu = 'plus' | 'permission' | 'model' | null

// 按稳定 id 映射到 i18n 键：mockData 中的 UI 字段在渲染处经 t() 翻译（词典键由 i18n.ts 统一收录）
const CMD_LABEL: Record<string, I18nKey> = {
  file: 'cmdFileLabel',
  dir: 'cmdDirLabel',
  search: 'cmdSearchLabel',
  clear: 'cmdClearLabel',
  explain: 'cmdExplainLabel',
  test: 'cmdTestLabel'
}
const CMD_DESC: Record<string, I18nKey> = {
  file: 'cmdFileDesc',
  dir: 'cmdDirDesc',
  search: 'cmdSearchDesc',
  clear: 'cmdClearDesc',
  explain: 'cmdExplainDesc',
  test: 'cmdTestDesc'
}
const MODE_LABEL: Record<string, I18nKey> = { agent: 'cmdModeAgent', plan: 'cmdModePlan', ask: 'cmdModeAsk' }
const MODE_HINT: Record<string, I18nKey> = {
  agent: 'cmdModeAgentHint',
  plan: 'cmdModePlanHint',
  ask: 'cmdModeAskHint'
}
// 模型名中的纯品牌词（MiniMax / Kimi / DeepSeek）保留原文，仅映射含中文的条目
const MODEL_NAME: Record<string, I18nKey> = { glm: 'cmdModelZhipuName', hunyuan: 'cmdModelHunyuanName' }
const MODEL_DESC: Record<string, I18nKey> = {
  minimax: 'cmdModelMinimaxDesc',
  glm: 'cmdModelGlmDesc',
  kimi: 'cmdModelKimiDesc',
  deepseek: 'cmdModelDeepseekDesc',
  hunyuan: 'cmdModelHunyuanDesc'
}

export default function CommandBar({ sessionId }: { sessionId: string }): JSX.Element {
  const [input, setInput] = useState('')
  const [showCommands, setShowCommands] = useState(false)
  const [activeCmd, setActiveCmd] = useState(0)
  const [toolMenu, setToolMenu] = useState<ToolMenu>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const t = useT()

  const session = useSessionStore((s) => s.sessions.find((x) => x.id === sessionId))
  const { updateSession, runAssistant, authorizeSessionWorkspace, authorizeSessionFile, createSpace } =
    useSessionStore()
  const mode: TaskMode = session?.mode ?? 'agent'
  const modelId = session?.model ?? 'glm'
  const workspaceDir = session?.workspace ?? null
  const {
    pendingAttachments,
    addPendingAttachments,
    removePendingAttachment,
    clearPendingAttachments,
    permissionMode,
    togglePermissionMode,
    setPreviewVisible
  } = useUIStore()

  // 检测斜杠命令
  const commandQuery = input.startsWith('/') ? input.slice(1).toLowerCase() : ''
  const filteredCommands = commandQuery
    ? SLASH_COMMANDS.filter((c) => c.trigger.toLowerCase().includes(commandQuery))
    : []

  useEffect(() => {
    setShowCommands(commandQuery !== '' && filteredCommands.length > 0)
    // 过滤结果变化时选中项必须复位，避免 Enter 时 filteredCommands[activeCmd] 越界崩溃
    setActiveCmd(0)
  }, [commandQuery, filteredCommands.length])

  // + 菜单每次打开时重置内联新建空间命名
  const [creatingSpace, setCreatingSpace] = useState(false)
  const [spaceName, setSpaceName] = useState('')
  useEffect(() => {
    if (toolMenu === 'plus') {
      setCreatingSpace(false)
      setSpaceName('')
    }
  }, [toolMenu])

  // 提交新建空间：默认工作空间路径下创建同名文件夹并绑定当前会话（失败时保留菜单与输入）
  const submitNewSpace = async (): Promise<void> => {
    const name = spaceName.trim()
    if (!isValidSpaceName(name) || !sessionId) return
    const dir = await createSpace(name, { bindSessionId: sessionId })
    if (dir) {
      setToolMenu(null)
      setCreatingSpace(false)
      setSpaceName('')
      setPreviewVisible(true)
    }
  }

  // 自动调整输入框高度
  const autoResize = useCallback((): void => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [])

  // 附件 Chip 点击展开：接收原文回填输入框（AttachmentCard 经 window 事件派发）
  useEffect(() => {
    const onExpand = (e: Event): void => {
      const text = (e as CustomEvent<string>).detail
      if (typeof text !== 'string' || !text) return
      setInput((prev) => (prev ? `${prev}\n${text}` : text))
      textareaRef.current?.focus()
      requestAnimationFrame(autoResize)
    }
    window.addEventListener('expand-paste-chip', onExpand)
    return () => window.removeEventListener('expand-paste-chip', onExpand)
  }, [autoResize])

  const handleSend = (): void => {
    const text = input.trim()
    if (!text || session?.status === 'running') return
    if (text === '/clear') {
      useSessionStore.getState().clearMessages(sessionId)
      setInput('')
      clearPendingAttachments()
      setShowCommands(false)
      autoResize()
      return
    }
    const attachments = pendingAttachments.map((a) =>
      a.kind === 'file' ? a.name : (a.preview ?? a.name)
    )
    const fileAttachments = pendingAttachments
      .filter((a) => a.kind === 'file')
      .map((a) => ({ name: a.name, path: a.path ?? '' }))
    const textAttachments = pendingAttachments
      .filter((a) => a.kind === 'chip')
      .map((a) => a.preview ?? a.name)
    const userMsg: Message = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: text,
      attachments: attachments.length ? attachments : undefined,
      fileAttachments: fileAttachments.length ? fileAttachments : undefined,
      textAttachments: textAttachments.length ? textAttachments : undefined,
      mode
    }
    useSessionStore.getState().addMessage(sessionId, userMsg)
    setInput('')
    clearPendingAttachments()
    setShowCommands(false)
    autoResize()

    // 回复由 useStore.runAssistant 统一生成：有 API Key 走真实流式接口，否则动态 mock
    runAssistant(sessionId, { plan: mode === 'plan' })
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    // 输入法组合期间（如中文输入法下确认英文候选），不处理任何按键，
    // 第一次回车交给输入法确认内容，第二次回车才发送
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (showCommands && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveCmd((i) => (i + 1) % filteredCommands.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveCmd((i) => (i - 1 + filteredCommands.length) % filteredCommands.length)
        return
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault()
        setInput(filteredCommands[activeCmd].trigger + ' ')
        setShowCommands(false)
        return
      }
      if (e.key === 'Escape') {
        setShowCommands(false)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // 超长粘贴自动压缩为 Chip：不进入输入框，保持输入区域简洁
  const handlePaste = (e: React.ClipboardEvent): void => {
    const text = e.clipboardData.getData('text')
    if (text && text.length > PASTE_CHIP_THRESHOLD) {
      e.preventDefault()
      addPendingAttachments([
        {
          id: genAttachmentId(),
          kind: 'chip',
          name: t('cmdPastedChipName', new Date().toLocaleTimeString()),
          preview: text,
          charCount: text.length
        }
      ])
    }
  }

  const model = MODELS.find((m) => m.id === modelId)

  return (
    <div className="relative border-t border-surface-border bg-surface-panel px-4 pb-3 pt-2">
      {/* 斜杠命令菜单 */}
      {showCommands && filteredCommands.length > 0 && (
        <div className="absolute bottom-full left-4 mb-2 w-72 overflow-hidden rounded-lg border border-surface-border bg-surface-raised shadow-xl">
          <div className="border-b border-surface-border px-3 py-1.5 text-[11px] text-text-muted">
            {t('cmdMenuCommands')}
          </div>
          {filteredCommands.map((c, i) => (
            <div
              key={c.id}
              onClick={() => {
                setInput(c.trigger + ' ')
                setShowCommands(false)
              }}
              onMouseEnter={() => setActiveCmd(i)}
              className={`command-item flex cursor-pointer items-center gap-2 border-l-2 border-transparent px-3 py-2 ${
                i === activeCmd ? 'active' : ''
              }`}
            >
              <span className="text-[15px]">{c.icon}</span>
              <div className="flex-1">
                <div className="text-[13px] text-text-primary">
                  {CMD_LABEL[c.id] ? t(CMD_LABEL[c.id]) : c.label}
                </div>
                <div className="text-[11px] text-text-muted">
                  {CMD_DESC[c.id] ? t(CMD_DESC[c.id]) : c.description}
                </div>
              </div>
              <span className="text-[11px] text-text-muted">{c.trigger}</span>
            </div>
          ))}
        </div>
      )}

      {/* + 菜单：工作模式 / 工作空间（权限与模型已内联到工具行） */}
      {toolMenu === 'plus' && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setToolMenu(null)} />
          <div className="absolute bottom-full left-4 z-40 mb-2 w-80 overflow-hidden rounded-lg border border-surface-border bg-surface-raised shadow-xl">
            {/* 工作模式 */}
            <div className="border-b border-surface-border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              {t('cmdSectionMode')}
            </div>
            {(['agent', 'plan', 'ask'] as const).map((m) => {
              const Icon = m === 'plan' ? ListChecks : m === 'ask' ? MessageCircleQuestion : Zap
              return (
                <div
                  key={m}
                  onClick={() => updateSession(sessionId, { mode: m })}
                  className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-surface-hover ${
                    m === mode ? 'text-text-primary' : 'text-text-secondary'
                  }`}
                >
                  <Icon size={15} className={m === mode ? 'text-accent' : 'text-text-muted'} />
                  <div className="flex-1">
                    <div className="text-[13px]">{t(MODE_LABEL[m])}</div>
                    <div className="text-[11px] text-text-muted">{t(MODE_HINT[m])}</div>
                  </div>
                  {m === mode && <Check size={14} className="text-accent" />}
                </div>
              )
            })}

            {/* 工作空间：已绑定空间的会话整组隐藏（文件夹/文件/新建空间均不再提供） */}
            {!workspaceDir && (
              <>
                <div className="border-y border-surface-border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                  {t('cmdSectionWorkspace')}
                </div>
                {/* 授权文件夹：弹窗选择目录，用户确认后才可访问（绑定当前会话） */}
                <div
                  onClick={() => {
                    authorizeSessionWorkspace(sessionId)
                      .then((result) => {
                        if (result) setPreviewVisible(true)
                      })
                      .catch(() => {})
                    setToolMenu(null)
                  }}
                  className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-text-secondary hover:bg-surface-hover"
                >
                  <FolderOpen size={15} className="text-text-muted" />
                  <div className="flex-1 overflow-hidden">
                    <div className="text-[13px]">{t('cmdSelectFolder')}</div>
                    <div className="truncate text-[11px] text-text-muted">{t('cmdFolderHint')}</div>
                  </div>
                </div>
                {/* 授权文件：弹窗选择单个文件，用户确认后才可访问（绑定当前会话） */}
                <div
                  onClick={() => {
                    authorizeSessionFile(sessionId)
                      .then((result) => {
                        if (result) setPreviewVisible(true)
                      })
                      .catch(() => {})
                    setToolMenu(null)
                  }}
                  className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-text-secondary hover:bg-surface-hover"
                >
                  <FileCode2 size={15} className="text-text-muted" />
                  <div className="flex-1 overflow-hidden">
                    <div className="text-[13px]">{t('cmdSelectFile')}</div>
                    <div className="truncate text-[11px] text-text-muted">
                      {t('cmdFileHint')}
                    </div>
                  </div>
                </div>
                {/* 新建空间：存储目录下创建同名文件夹并绑定当前任务 */}
                {creatingSpace ? (
                  <div className="flex items-center gap-2 px-3 py-2">
                    <FolderPlus size={15} className="shrink-0 text-text-muted" />
                    <input
                      autoFocus
                      value={spaceName}
                      onChange={(e) => setSpaceName(e.target.value)}
                      onKeyDown={(e) => {
                        // 输入法组合中（首次回车确认候选词）不触发提交
                        if (e.nativeEvent.isComposing || e.keyCode === 229) return
                        if (e.key === 'Enter') {
                          void submitNewSpace()
                        } else if (e.key === 'Escape') {
                          setCreatingSpace(false)
                          setSpaceName('')
                        }
                      }}
                      placeholder={t('cmdSpaceNamePlaceholder')}
                      title={t('sidebarSpaceNameInvalid')}
                      className="min-w-0 flex-1 rounded-md bg-surface-hover px-2 py-1 text-[13px] text-text-primary outline-none placeholder:text-text-muted"
                    />
                  </div>
                ) : (
                  <div
                    onClick={() => setCreatingSpace(true)}
                    className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-text-secondary hover:bg-surface-hover"
                  >
                    <FolderPlus size={15} className="text-text-muted" />
                    <div className="flex-1 overflow-hidden">
                      <div className="text-[13px]">{t('cmdNewSpace')}</div>
                      <div className="truncate text-[11px] text-text-muted">{t('cmdNewSpaceHint')}</div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* 权限弹出菜单（F-40：从 + 菜单内联迁出） */}
      {toolMenu === 'permission' && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setToolMenu(null)} />
          <div className="absolute bottom-full left-4 z-40 mb-1 w-64 overflow-hidden rounded-lg border border-surface-border bg-surface-raised shadow-xl">
            <div
              onClick={() => {
                if (permissionMode !== 'default') togglePermissionMode()
                setToolMenu(null)
              }}
              className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-surface-hover ${
                permissionMode === 'default' ? 'text-text-primary' : 'text-text-secondary'
              }`}
            >
              <ShieldCheck size={15} className="text-text-muted" />
              <div className="flex-1">
                <div className="text-[13px]">{t('cmdPermDefault')}</div>
                <div className="text-[11px] text-text-muted">{t('cmdPermDefaultDesc')}</div>
              </div>
              {permissionMode === 'default' && <Check size={14} className="text-accent" />}
            </div>
            <div
              onClick={() => {
                if (permissionMode !== 'full') togglePermissionMode()
                setToolMenu(null)
              }}
              className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-surface-hover ${
                permissionMode === 'full' ? 'text-text-primary' : 'text-text-secondary'
              }`}
            >
              <ShieldCheck size={15} className="text-[var(--diff-add)]" />
              <div className="flex-1">
                <div className="text-[13px]">{t('cmdPermFull')}</div>
                <div className="text-[11px] text-text-muted">
                  {t('cmdPermFullDesc')}
                </div>
              </div>
              {permissionMode === 'full' && <Check size={14} className="text-accent" />}
            </div>
          </div>
        </>
      )}

      {/* 模型弹出菜单（F-40：从 + 菜单内联迁出） */}
      {toolMenu === 'model' && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setToolMenu(null)} />
          <div className="absolute bottom-full right-4 z-40 mb-1 w-72 overflow-hidden rounded-lg border border-surface-border bg-surface-raised shadow-xl">
            <div className="border-b border-surface-border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              {t('cmdSwitchModel')}
            </div>
            {MODELS.map((m) => (
              <div
                key={m.id}
                onClick={() => {
                  updateSession(sessionId, { model: m.id })
                  setToolMenu(null)
                }}
                className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-surface-hover ${
                  m.id === modelId ? 'text-text-primary' : 'text-text-secondary'
                }`}
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-accent/60" />
                <div className="flex-1">
                  <div className="text-[13px]">{MODEL_NAME[m.id] ? t(MODEL_NAME[m.id]) : m.name}</div>
                  <div className="text-[11px] text-text-muted">
                    {MODEL_DESC[m.id] ? t(MODEL_DESC[m.id]) : m.desc}
                  </div>
                </div>
                {m.id === modelId && <Check size={14} className="text-accent" />}
              </div>
            ))}
          </div>
        </>
      )}

      {/* 附件区：拖拽文件卡片 + 长文本 Chip */}
      {pendingAttachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {pendingAttachments.map((a) => (
            <AttachmentCard key={a.id} attachment={a} onRemove={() => removePendingAttachment(a.id)} />
          ))}
        </div>
      )}

      {/* 非默认模式的模式标识 */}
      {mode !== 'agent' && (
        <div className="mb-2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-[11px] text-accent">
            {mode === 'plan' ? <ListChecks size={12} /> : <MessageCircleQuestion size={12} />}
            {t(MODE_LABEL[mode])}
            <button
              onClick={() => updateSession(sessionId, { mode: 'agent' })}
              className="ml-0.5 rounded p-0.5 hover:bg-accent/20"
              title={t('cmdExitMode')}
            >
              <X size={11} />
            </button>
          </span>
        </div>
      )}

      {/* 输入卡片（F-40）：输入区在上、工具行在下 */}
      <div className="flex min-h-[96px] flex-col rounded-2xl border border-surface-border bg-surface-raised px-3 pb-1.5 pt-2.5 focus-within:border-accent">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            autoResize()
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          rows={2}
          placeholder={
            mode === 'plan'
              ? t('cmdPlaceholderPlan')
              : mode === 'ask'
                ? t('cmdPlaceholderAsk')
                : t('cmdPlaceholderAgent')
          }
          className="selectable max-h-[160px] flex-1 resize-none bg-transparent text-[14px] leading-6 text-text-primary outline-none placeholder:text-text-muted"
        />
        <div className="mt-1 flex items-center gap-0.5">
          {/* + 菜单：工作模式 / 工作空间 */}
          <button
            onClick={() => setToolMenu((v) => (v === 'plus' ? null : 'plus'))}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            title={t('cmdWorkspaceMode')}
          >
            <Plus size={17} />
          </button>

          {/* 权限下拉：默认权限 / 完全访问权限 */}
          <button
            onClick={() => setToolMenu((v) => (v === 'permission' ? null : 'permission'))}
            className="flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-[12px] text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            title={t('cmdPermSettings')}
          >
            <ShieldCheck
              size={14}
              className={permissionMode === 'full' ? 'text-[var(--diff-add)]' : 'text-text-muted'}
            />
            {permissionMode === 'full' ? t('cmdPermFull') : t('cmdPermDefault')}
            <ChevronDown size={12} className="text-text-muted" />
          </button>

          <div className="min-w-2 flex-1" />

          {/* 模型内联选择器 */}
          <button
            onClick={() => setToolMenu((v) => (v === 'model' ? null : 'model'))}
            className="flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-[12px] text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            title={t('cmdSwitchModel')}
          >
            <span className="h-2 w-2 rounded-full bg-accent/60" />
            {model ? (MODEL_NAME[model.id] ? t(MODEL_NAME[model.id]) : model.name) : t('cmdSelectModel')}
            <ChevronDown size={12} className="text-text-muted" />
          </button>

          {/* 麦克风（占位） */}
          <button
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            title={t('cmdMicPlaceholder')}
          >
            <Mic size={15} />
          </button>

          {/* 圆形发送按钮 */}
          <button
            onClick={handleSend}
            disabled={!input.trim() || session?.status === 'running'}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
            title={t('cmdSend')}
          >
            <ArrowUp size={16} />
          </button>
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-center text-[11px] text-text-muted">
        {t('cmdDisclaimer')}
      </div>
    </div>
  )
}

/** 附件卡片：文件 / 长文本 Chip（悬停预览原文，点击 Chip 展开回输入框编辑） */
function AttachmentCard({
  attachment: a,
  onRemove
}: {
  attachment: Attachment
  onRemove: () => void
}): JSX.Element {
  const t = useT()

  const expandChip = (): void => {
    if (a.kind !== 'chip' || !a.preview) return
    // 展开原文到输入框：通过自定义事件交给 CommandBar 的 textarea（demo 简化实现）
    window.dispatchEvent(new CustomEvent('expand-paste-chip', { detail: a.preview }))
    onRemove()
  }

  return (
    <div
      onClick={expandChip}
      title={a.kind === 'chip' ? t('cmdChipExpand') : a.path || a.name}
      className="group flex max-w-[280px] cursor-default items-center gap-1.5 rounded-lg border border-surface-border bg-surface-raised px-2.5 py-1.5 text-[12px] text-text-secondary"
    >
      {a.kind === 'file' ? (
        <FileText size={13} className="shrink-0 text-accent" />
      ) : (
        <TextQuote size={13} className="shrink-0 text-accent" />
      )}
      <span className="truncate">
        {a.kind === 'file' ? a.name : t('cmdChipCharCount', a.name, String(a.charCount))}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        className="shrink-0 rounded p-0.5 text-text-muted hover:text-text-primary"
        title={t('cmdRemove')}
      >
        <X size={12} />
      </button>
    </div>
  )
}
