import { useEffect, useRef } from 'react'
import MessageBubble from './MessageBubble'
import CommandBar from './CommandBar'
import { useSessionStore } from '../store/useStore'
import { selectActiveSession } from '../store/selectors'
import { Sparkles } from 'lucide-react'
import { useT } from '../i18n'

export default function Conversation(): JSX.Element {
  const t = useT()
  const session = useSessionStore(selectActiveSession)
  const bottomRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底部：流式输出中用即时滚动（高频触发下 smooth 会反复重启造成抖动），其余场景平滑滚动
  const lastMsg = session?.messages[session.messages.length - 1]
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: lastMsg?.streaming ? 'auto' : 'smooth' })
  }, [session?.messages.length, lastMsg?.content])

  if (!session) {
    return (
      <div className="flex h-full min-w-0 flex-1 flex-col items-center justify-center text-text-muted">
        <Sparkles size={32} className="mb-3" />
        <div className="text-[15px]">{t('convEmptyState')}</div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-surface-bg">
      {/* 消息区 */}
      <div className="flex-1 overflow-y-auto">
        {session.messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-text-muted">
            <Sparkles size={36} className="mb-4 text-accent" />
            <div className="text-[16px] font-medium text-text-secondary">{t('convGreeting')}</div>
            <div className="mt-1 text-[13px]">{t('convGreetingSub')}</div>
          </div>
        ) : (
          session.messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* 底部输入 */}
      <CommandBar sessionId={session.id} />
    </div>
  )
}
