import { memo, useEffect, useState } from 'react'
import { User, Bot, FileText, ListChecks, MessageCircleQuestion, Play, PencilLine } from 'lucide-react'
import type { Message } from '../types'
import Markdown from './Markdown'
import { genMessageId, useSessionStore, useUIStore } from '../store/useStore'
import { useT } from '../i18n'

/** 运行耗时：响应开始即实时展示，输出完成后定格 */
function RunTimer({ message }: { message: Message }): JSX.Element | null {
  const t = useT()
  const [, force] = useState(0)
  useEffect(() => {
    if (!message.streaming) return
    const t = setInterval(() => force((n) => n + 1), 200)
    return () => clearInterval(t)
  }, [message.streaming])

  if (message.startedAt == null) return null
  const ms = message.streaming
    ? Date.now() - message.startedAt
    : (message.durationMs ?? Date.now() - message.startedAt)
  return <span className="ml-2 font-normal text-text-muted">{t('msgRunTime', (ms / 1000).toFixed(1))}</span>
}

function MessageBubbleBase({ message }: { message: Message }): JSX.Element {
  const theme = useUIStore((s) => s.theme)
  const activeId = useSessionStore((s) => s.activeId)
  const updateSession = useSessionStore((s) => s.updateSession)
  const runAssistant = useSessionStore((s) => s.runAssistant)
  const t = useT()
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="animate-fade-in-up flex justify-end px-6 py-4">
        <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-accent px-4 py-3 text-[14px] text-white">
          {message.mode && message.mode !== 'agent' ? (
            <div className="mb-1.5">
              <ModeBadge mode={message.mode} />
            </div>
          ) : null}
          <div className="whitespace-pre-wrap selectable leading-6">{message.content}</div>
          {message.attachments?.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {message.attachments.map((f, i) => {
                // 文件附件展示文件名；Chip 附件为长文本原文，展示截断预览（完整内容见 title）
                const isLong = f.includes('\n') || f.length > 80
                const label = isLong
                  ? `${f.replace(/\s+/g, ' ').slice(0, 40)}…`
                  : (f.split('/').pop() ?? f)
                return (
                  <span
                    key={i}
                    title={f}
                    className="flex items-center gap-1 rounded bg-white/20 px-2 py-0.5 text-[11px]"
                  >
                    <FileText size={11} />
                    {label}
                  </span>
                )
              })}
            </div>
          ) : null}
        </div>
        <div className="ml-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent">
          <User size={15} />
        </div>
      </div>
    )
  }

  // Plan 方案的确认/调整操作
  const confirmPlan = (): void => {
    // 标记方案为已确认（本地 + 落库）
    useSessionStore.getState().confirmPlan(activeId, message.id)
    updateSession(activeId, { status: 'running' })
    useSessionStore.getState().addMessage(activeId, {
      id: genMessageId(),
      role: 'user',
      content: t('msgStartExecute'),
      mode: 'plan'
    })
    runAssistant(activeId, {})
  }

  return (
    <div className="animate-fade-in-up flex justify-start gap-3 px-6 py-4">
      <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-raised text-accent ring-1 ring-surface-border">
        <Bot size={15} />
      </div>
      <div className="max-w-[85%] min-w-0 flex-1">
        <div className="mb-1 flex items-center text-[12px] font-medium text-text-muted">
          {t('msgAssistantName')}
          <RunTimer message={message} />
        </div>
        <Markdown content={message.content} theme={theme} streaming={message.streaming} />
        {message.streaming && <span className="typing-cursor" />}
        {/* Plan 方案：待确认时展示操作按钮 */}
        {message.plan === 'proposed' && !message.streaming && (
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={confirmPlan}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] text-white transition-colors hover:bg-accent-hover"
            >
              <Play size={13} />
              {t('msgStartExecute')}
            </button>
            <span className="flex items-center gap-1 rounded-lg border border-surface-border px-3 py-1.5 text-[12px] text-text-muted">
              <PencilLine size={13} />
              {t('msgAdjustPlan')}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * 流式性能关键：memo 后仅流式中的那条消息随 chunk 重渲染，
 * 历史消息的 message 对象引用不变，不再整列重跑 Markdown 解析与 shiki 高亮。
 */
export default memo(MessageBubbleBase)

/** 用户消息携带的模式徽标（导出给会话标题等场景复用） */
export function ModeBadge({ mode }: { mode: Message['mode'] }): JSX.Element | null {
  const t = useT()
  if (!mode || mode === 'agent') return null
  const Icon = mode === 'plan' ? ListChecks : MessageCircleQuestion
  return (
    <span className="mr-2 inline-flex items-center gap-1 rounded bg-white/20 px-1.5 py-0.5 align-middle text-[10px]">
      <Icon size={10} />
      {t(mode === 'plan' ? 'cmdModePlan' : 'cmdModeAsk')}
    </span>
  )
}
