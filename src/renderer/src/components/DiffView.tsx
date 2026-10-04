import { useMemo } from 'react'
import { diffLines } from '../lib/diff'
import type { DiffResult } from '../types'

/**
 * Codex 风格内联 diff 视图：红删绿增，行号并排显示。
 */
export default function DiffView({
  oldText,
  newText,
  filename
}: {
  oldText: string
  newText: string
  filename?: string
}): JSX.Element {
  const diff: DiffResult = useMemo(() => diffLines(oldText, newText), [oldText, newText])

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-surface-border">
      {/* 头部：文件名 + 统计 */}
      <div className="flex items-center justify-between border-b border-surface-border bg-surface-raised px-3 py-1.5 text-[12px]">
        <span className="font-medium text-text-secondary">{filename ?? 'diff'}</span>
        <span className="flex items-center gap-3">
          <span className="text-[var(--diff-add)]">+{diff.additions}</span>
          <span className="text-[var(--diff-del)]">-{diff.deletions}</span>
        </span>
      </div>

      {/* diff 内容 */}
      <div className="code-block selectable overflow-x-auto py-1 text-[12.5px] leading-6">
        {diff.lines.map((line, idx) => {
          if (line.type === 'add') {
            return (
              <div
                key={idx}
                className="flex bg-[var(--diff-add-bg)]"
                style={{ minWidth: 'max-content' }}
              >
                <span className="w-10 shrink-0 select-none border-r border-surface-border bg-[rgba(63,185,80,0.25)] text-right pr-2 text-text-muted">
                  {line.newLine}
                </span>
                <span className="w-4 shrink-0 select-none text-center text-[var(--diff-add)]">+</span>
                <span className="whitespace-pre px-2 text-text-primary">{line.content}</span>
              </div>
            )
          }
          if (line.type === 'del') {
            return (
              <div
                key={idx}
                className="flex bg-[var(--diff-del-bg)]"
                style={{ minWidth: 'max-content' }}
              >
                <span className="w-10 shrink-0 select-none border-r border-surface-border bg-[rgba(248,81,73,0.25)] text-right pr-2 text-text-muted">
                  {line.oldLine}
                </span>
                <span className="w-4 shrink-0 select-none text-center text-[var(--diff-del)]">-</span>
                <span className="whitespace-pre px-2 text-text-primary">{line.content}</span>
              </div>
            )
          }
          return (
            <div key={idx} className="flex" style={{ minWidth: 'max-content' }}>
              <span className="w-10 shrink-0 select-none border-r border-surface-border text-right pr-2 text-text-muted">
                {line.oldLine}
              </span>
              <span className="w-4 shrink-0" />
              <span className="whitespace-pre px-2 text-text-secondary">{line.content}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
