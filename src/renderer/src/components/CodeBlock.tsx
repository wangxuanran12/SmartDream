import { useEffect, useState } from 'react'
import { Check, Copy, FileText } from 'lucide-react'
import { codeToHtml } from 'shiki'
import { useT } from '../i18n'

const THEME_MAP = { dark: 'github-dark', light: 'github-light' } as const

/** 高亮彻底失败时的纯文本兜底（保证代码块永不留白） */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export default function CodeBlock({
  code,
  language,
  theme,
  plain
}: {
  code: string
  language: string
  theme: 'dark' | 'light'
  /** 流式输出中为 true：跳过 shiki 高亮直接渲染纯文本，流结束后自动恢复高亮 */
  plain?: boolean
}): JSX.Element {
  const [html, setHtml] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const t = useT()

  useEffect(() => {
    if (plain) {
      setHtml(`<pre style="margin:0;white-space:pre-wrap;">${escapeHtml(code)}</pre>`)
      return
    }
    let stale = false
    codeToHtml(code, {
      lang: language || 'text',
      theme: THEME_MAP[theme]
    })
      .then((h) => {
        if (!stale) setHtml(h)
      })
      .catch(() => {
        // 高亮失败时降级为纯文本；再失败则手动转义，绝不停留在空白
        codeToHtml(code, { lang: 'text', theme: THEME_MAP[theme] })
          .then((h) => {
            if (!stale) setHtml(h)
          })
          .catch(() => {
            if (!stale) {
              setHtml(`<pre style="margin:0;white-space:pre;">${escapeHtml(code)}</pre>`)
            }
          })
      })
    return () => {
      stale = true // 丢弃过期的高亮结果（流式期间 code 高频变化）
    }
  }, [code, language, theme, plain])

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="group my-2 overflow-hidden rounded-lg border border-surface-border">
      <div className="flex items-center justify-between border-b border-surface-border bg-surface-raised px-3 py-1.5">
        <div className="flex items-center gap-2 text-[12px] text-text-muted">
          <FileText size={13} />
          <span>{language || 'text'}</span>
        </div>
        <button
          onClick={copy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] text-text-muted hover:bg-surface-hover hover:text-text-primary"
        >
          {copied ? (
            <>
              <Check size={13} className="text-[var(--diff-add)]" />
              {t('codeCopied')}
            </>
          ) : (
            <>
              <Copy size={13} />
              {t('codeCopy')}
            </>
          )}
        </button>
      </div>
      <div
        className="code-block selectable overflow-x-auto p-3"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
