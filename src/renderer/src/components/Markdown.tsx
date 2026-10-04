import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import CodeBlock from './CodeBlock'
import DiffView from './DiffView'
import { MOCK_FILE_CONTENT } from '../data/mockData'

interface MarkdownProps {
  content: string
  theme: 'dark' | 'light'
  /** 流式输出中：代码块降级为纯文本，流结束再一次性高亮（避免 shiki 随 chunk 反复重跑） */
  streaming?: boolean
}

/**
 * 渲染 assistant 消息的 Markdown 内容。
 * 特殊处理：遇到 `diff` 语言代码块时，渲染成内联 diff 视图（Codex 风格）。
 */
export default function Markdown({ content, theme, streaming }: MarkdownProps): JSX.Element {
  const components = useMemo(
    () => ({
      code(props: any): JSX.Element {
        const { className, children } = props
        const match = /language-(\w+)/.exec(className || '')
        const lang = match ? match[1] : ''
        const code = String(children).replace(/\n$/, '')

        // 内联代码
        if (!className) {
          return (
            <code className="rounded bg-surface-hover px-1.5 py-0.5 font-mono text-[12.5px] text-accent">
              {children}
            </code>
          )
        }

        // diff 语言块 → 渲染内联 diff
        if (lang === 'diff' || lang === 'diff-tsx' || lang === 'diff-ts') {
          const oldText = MOCK_FILE_CONTENT['src/components/Counter.tsx'] ?? ''
          const newText = MOCK_FILE_CONTENT['src/components/Counter.fixed.tsx'] ?? oldText
          return <DiffView oldText={oldText} newText={newText} filename="Counter.tsx" />
        }

        return <CodeBlock code={code} language={lang} theme={theme} plain={streaming} />
      },
      a(props: any): JSX.Element {
        return (
          <a className="text-accent underline hover:text-accent-hover" target="_blank" {...props} />
        )
      },
      table(props: any): JSX.Element {
        return (
          <div className="my-2 overflow-x-auto">
            <table className="border-collapse border border-surface-border text-[13px]" {...props} />
          </div>
        )
      },
      th(props: any): JSX.Element {
        return (
          <th
            className="border border-surface-border bg-surface-raised px-3 py-1.5 text-left font-semibold"
            {...props}
          />
        )
      },
      td(props: any): JSX.Element {
        return <td className="border border-surface-border px-3 py-1.5" {...props} />
      }
    }),
    [theme, streaming]
  )

  return (
    <div className="selectable text-[14px] leading-6 text-text-primary">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
