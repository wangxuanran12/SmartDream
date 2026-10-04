// 全局关键字搜索弹窗（F-47，对齐 WorkBuddy 搜索截图）
// 搜索范围：任务（标题 + 消息全文）、空间（按授权目录名）、产物（空间目录下文件名）
// 键盘：↑↓ 选择、Enter 打开、Ctrl/Cmd+Enter 切换类别、Esc 关闭；输入法组合中的回车不触发（见 handleKeyDown）
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Search,
  MessageSquare,
  Folder,
  FileCode2,
  FileText,
  FileImage,
  File as FileIcon
} from 'lucide-react'
import type { FileNode } from '@shared/types'
import { useSessionStore, useUIStore } from '../store/useStore'
import { useT } from '../i18n'
import type { I18nKey } from '../i18n'

/** 搜索类别页签 */
type SearchTab = 'all' | 'tasks' | 'spaces' | 'artifacts'
const TAB_ORDER: SearchTab[] = ['all', 'tasks', 'spaces', 'artifacts']

/** 「全部」页签下每个分组的最大展示行数（任务组超出出「查看全部」，其余截断） */
const SECTION_LIMIT = 3

/** 关键词高亮：大小写不敏感拆分，命中片段以主题色标出 */
function Highlight({ text, query }: { text: string; query: string }): JSX.Element {
  const q = query.trim().toLowerCase()
  if (!q) return <>{text}</>
  const lower = text.toLowerCase()
  const parts: JSX.Element[] = []
  let i = 0
  let k = lower.indexOf(q)
  let n = 0
  while (k >= 0) {
    if (k > i) parts.push(<span key={n++}>{text.slice(i, k)}</span>)
    parts.push(
      <span key={n++} className="text-accent">
        {text.slice(k, k + q.length)}
      </span>
    )
    i = k + q.length
    k = lower.indexOf(q, i)
  }
  parts.push(<span key={n++}>{text.slice(i)}</span>)
  return <>{parts}</>
}

/** 命中上下文摘要：关键字前后各取一段，压缩空白并补省略号 */
function makeSnippet(content: string, query: string): string {
  const text = content.replace(/\s+/g, ' ').trim()
  const q = query.trim().toLowerCase()
  if (!q) return text.slice(0, 80) + (text.length > 80 ? '…' : '')
  const idx = text.toLowerCase().indexOf(q)
  if (idx < 0) return text.slice(0, 80) + (text.length > 80 ? '…' : '')
  const start = Math.max(0, idx - 30)
  const end = Math.min(text.length, idx + q.length + 70)
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`
}

/** 字节 → 可读大小（对齐截图「91.6 KB」样式） */
function fmtSize(bytes?: number): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

/** 按扩展名挑产物图标 */
function ArtifactIcon({ ext }: { ext?: string }): JSX.Element {
  const cls = 'shrink-0 text-text-muted'
  if (ext && ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext))
    return <FileImage size={16} className={cls} />
  if (ext && ['md', 'txt', 'pdf', 'doc', 'docx', 'xlsx', 'csv'].includes(ext))
    return <FileText size={16} className={cls} />
  if (ext) return <FileCode2 size={16} className={cls} />
  return <FileIcon size={16} className={cls} />
}

/** 递归展平文件树为文件列表（按路径去重） */
function flattenFiles(nodes: FileNode[], out: Map<string, FileNode>): void {
  for (const nd of nodes) {
    if (nd.isDirectory) flattenFiles(nd.children ?? [], out)
    else if (!out.has(nd.path)) out.set(nd.path, nd)
  }
}

/** 可键盘选择的条目（items 顺序与渲染行顺序一致） */
interface ResultItem {
  key: string
  act: () => void
}

export default function SearchModal(): JSX.Element {
  const t = useT()
  const { sessions, setActive } = useSessionStore()
  const { workspaceRoot, setSearchOpen } = useUIStore()

  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<SearchTab>('all')
  const [files, setFiles] = useState<FileNode[] | null>(null) // null = 扫描中
  const [selIdx, setSelIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])

  const close = (): void => setSearchOpen(false)

  // 打开时聚焦输入框
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // 打开时扫描空间目录（默认工作空间存储路径 + 各任务授权目录；未授权的自动跳过）
  useEffect(() => {
    let cancelled = false
    const api = window.electronAPI
    if (!api || typeof api.readDirectory !== 'function') {
      setFiles([])
      return
    }
    const dirs = new Set<string>()
    if (workspaceRoot) dirs.add(workspaceRoot)
    for (const s of sessions) if (s.workspace) dirs.add(s.workspace)
    void (async () => {
      const map = new Map<string, FileNode>()
      for (const dir of dirs) {
        try {
          flattenFiles(await api.readDirectory(dir), map)
        } catch {
          // 未授权 / 不可读的目录跳过
        }
      }
      if (!cancelled) setFiles([...map.values()])
    })()
    return () => {
      cancelled = true
    }
    // 仅在弹窗打开时扫描一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- 结果计算（大小写不敏感） ----
  const q = query.trim().toLowerCase()

  // 任务：标题或消息全文命中，按更新时间倒序（占位任务在发送第一条消息前不参与搜索）
  const taskHits = useMemo(() => {
    if (!q) return []
    return sessions
      .filter(
        (s) =>
          s.messages.length > 0 &&
          (s.title.toLowerCase().includes(q) ||
            s.messages.some((m) => m.content.toLowerCase().includes(q)))
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }, [sessions, q])

  // 最佳匹配：标题命中的最新任务优先，否则取第一条任务命中
  const best = useMemo(() => {
    if (!q) return undefined
    return taskHits.find((s) => s.title.toLowerCase().includes(q)) ?? taskHits[0]
  }, [taskHits, q])

  // 「全部」页签下任务分组去掉最佳匹配后的剩余命中
  const restTasks = useMemo(
    () => (best ? taskHits.filter((s) => s.id !== best.id) : taskHits),
    [taskHits, best]
  )

  // 空间：按授权目录 basename 匹配（来源 = 绑定了工作空间的任务）
  const spaceHits = useMemo(() => {
    if (!q) return []
    const map = new Map<string, { dir: string; name: string; updatedAt: number }>()
    for (const s of sessions) {
      if (!s.workspace) continue
      const name = s.workspace.split(/[\\/]/).filter(Boolean).pop() || s.workspace
      const cur = map.get(s.workspace)
      const updatedAt = Math.max(cur?.updatedAt ?? 0, s.updatedAt)
      map.set(s.workspace, { dir: s.workspace, name, updatedAt })
    }
    return [...map.values()]
      .filter((sp) => sp.name.toLowerCase().includes(q) || sp.dir.toLowerCase().includes(q))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }, [sessions, q])

  // 产物：空间目录下文件名命中
  const artifactHits = useMemo(() => {
    if (!q || !files) return []
    return files.filter((f) => f.name.toLowerCase().includes(q))
  }, [files, q])

  /** 任务行打开：激活该会话 */
  const openSession = (id: string): void => {
    setActive(id)
    close()
  }

  /** 空间行打开：激活该空间下最近更新的任务 */
  const openSpace = (dir: string): void => {
    const target = sessions
      .filter((s) => s.workspace === dir)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0]
    if (target) setActive(target.id)
    close()
  }

  /** 产物行打开：系统默认方式打开文件 */
  const openArtifact = (path: string): void => {
    const api = window.electronAPI
    if (api && typeof api.openPath === 'function') void api.openPath(path).catch(() => {})
    close()
  }

  /** 任务行摘要：优先取命中关键字的消息上下文，无命中时取首条消息开头 */
  const taskSnippet = (id: string): string => {
    const s = sessions.find((x) => x.id === id)
    const hit = s?.messages.find((m) => m.content.toLowerCase().includes(q))
    return makeSnippet(hit ? hit.content : (s?.messages[0]?.content ?? ''), query)
  }

  // 当前页签下可见的结果行（顺序与渲染行一致，供键盘 ↑↓ 选择）
  const items = useMemo<ResultItem[]>(() => {
    const list: ResultItem[] = []
    if (tab === 'all') {
      if (best) list.push({ key: `task-${best.id}`, act: () => openSession(best.id) })
      for (const s of restTasks.slice(0, SECTION_LIMIT))
        list.push({ key: `task-${s.id}`, act: () => openSession(s.id) })
      for (const sp of spaceHits.slice(0, SECTION_LIMIT))
        list.push({ key: `space-${sp.dir}`, act: () => openSpace(sp.dir) })
      for (const f of artifactHits.slice(0, SECTION_LIMIT))
        list.push({ key: `file-${f.path}`, act: () => openArtifact(f.path) })
    } else if (tab === 'tasks') {
      for (const s of taskHits) list.push({ key: `task-${s.id}`, act: () => openSession(s.id) })
    } else if (tab === 'spaces') {
      for (const sp of spaceHits) list.push({ key: `space-${sp.dir}`, act: () => openSpace(sp.dir) })
    } else {
      for (const f of artifactHits)
        list.push({ key: `file-${f.path}`, act: () => openArtifact(f.path) })
    }
    return list
    // action 闭包依赖当次渲染的 sessions 快照，随结果重渲染重建即可
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, best, restTasks, taskHits, spaceHits, artifactHits])

  // 查询 / 页签变化时重置选中项
  useEffect(() => {
    setSelIdx(0)
  }, [query, tab])

  // 选中项滚动到可见区域
  useEffect(() => {
    itemRefs.current[selIdx]?.scrollIntoView({ block: 'nearest' })
  }, [selIdx, items.length])

  const clampSel = (i: number): number => (items.length ? (i + items.length) % items.length : 0)

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    // 输入法组合中（首次回车确认候选词）不触发任何快捷键
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelIdx((i) => clampSel(i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelIdx((i) => clampSel(i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        // Ctrl/Cmd+Enter：切换到下一个类别页签
        setTab((cur) => TAB_ORDER[(TAB_ORDER.indexOf(cur) + 1) % TAB_ORDER.length])
      } else {
        items[selIdx]?.act()
      }
    }
  }

  const hasQuery = q.length > 0
  const anyHit = taskHits.length + spaceHits.length + artifactHits.length > 0

  /** 分组标题：count 为 0 不渲染；-1 仅显示标题不带计数；任务组可附「查看全部」入口 */
  const SectionHeader = ({
    label,
    count,
    onMore
  }: {
    label: I18nKey
    count: number
    onMore?: () => void
  }): JSX.Element | null => {
    if (count === 0) return null
    return (
      <div className="flex items-center gap-3 px-1 pb-1 pt-3">
        <span className="text-[12px] font-medium text-text-muted">
          {t(label)}
          {count > 0 && ` (${count})`}
        </span>
        {onMore && (
          <button
            onClick={onMore}
            className="text-[12px] text-text-muted transition-colors hover:text-accent"
          >
            {t('searchViewAll', String(count))}
          </button>
        )}
      </div>
    )
  }

  /** 结果行基础样式（键盘选中与 hover 同态） */
  const rowCls = (idx: number): string =>
    `flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors ${
      idx === selIdx ? 'bg-surface-hover' : 'hover:bg-surface-hover'
    }`

  /** 任务行（最佳匹配与任务分组共用结构） */
  const renderTaskRow = (id: string, idx: number): JSX.Element => (
    <div
      key={id}
      ref={(el) => {
        if (idx >= 0) itemRefs.current[idx] = el
      }}
      onMouseEnter={() => idx >= 0 && setSelIdx(idx)}
      onClick={() => openSession(id)}
      className={rowCls(idx)}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-hover">
        <MessageSquare size={15} className="text-text-muted" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] text-text-primary">
          <Highlight text={sessions.find((x) => x.id === id)?.title ?? ''} query={query} />
        </div>
        <div className="truncate text-[12px] text-text-muted">
          <Highlight text={taskSnippet(id)} query={query} />
        </div>
      </div>
    </div>
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[9vh]"
      onClick={close}
    >
      <div
        className="flex max-h-[74vh] w-[680px] max-w-[92vw] flex-col overflow-hidden rounded-2xl border border-surface-border bg-surface-raised shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* 搜索输入行 */}
        <div className="shrink-0 border-b border-surface-border p-3">
          <div className="flex items-center gap-2 rounded-xl bg-surface-hover px-3 py-2.5">
            <Search size={16} className="shrink-0 text-text-muted" />
            <input
              ref={inputRef}
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="min-w-0 flex-1 bg-transparent text-[14px] text-text-primary outline-none placeholder:text-text-muted"
            />
            {hasQuery && (
              <button
                onClick={() => {
                  setQuery('')
                  inputRef.current?.focus()
                }}
                className="shrink-0 rounded-md px-1.5 py-0.5 text-[12px] text-text-muted transition-colors hover:bg-surface-raised hover:text-text-primary"
              >
                {t('searchClear')}
              </button>
            )}
          </div>
        </div>

        {/* 类别页签 */}
        <div className="flex shrink-0 items-center gap-1 border-b border-surface-border px-3">
          {TAB_ORDER.map((key) => {
            const label: Record<SearchTab, I18nKey> = {
              all: 'searchTabAll',
              tasks: 'searchTabTasks',
              spaces: 'searchTabSpaces',
              artifacts: 'searchTabArtifacts'
            }
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`border-b-2 px-3 py-2 text-[13px] transition-colors ${
                  tab === key
                    ? 'border-accent text-text-primary'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                }`}
              >
                {t(label[key])}
              </button>
            )
          })}
        </div>

        {/* 结果区 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
          {!hasQuery ? (
            <div className="flex h-40 items-center justify-center text-[13px] text-text-muted">
              {t('searchEmptyHint')}
            </div>
          ) : !anyHit && files === null ? (
            <div className="flex h-40 items-center justify-center text-[13px] text-text-muted">
              {t('searchScanning')}
            </div>
          ) : !anyHit ? (
            <div className="flex h-40 items-center justify-center text-[13px] text-text-muted">
              {t('searchNoResults', query.trim())}
            </div>
          ) : (
            <>
              {/* 最佳匹配 + 任务（「全部」「任务」页签） */}
              {(tab === 'all' || tab === 'tasks') && (
                <>
                  {tab === 'all' && best && (
                    <>
                      <SectionHeader label="searchBestMatch" count={-1} />
                      {renderTaskRow(best.id, 0)}
                    </>
                  )}
                  <SectionHeader
                    label="searchSectionTasks"
                    count={tab === 'tasks' ? taskHits.length : restTasks.length}
                    onMore={
                      tab === 'all' && restTasks.length > SECTION_LIMIT ? () => setTab('tasks') : undefined
                    }
                  />
                  {(tab === 'tasks' ? taskHits : restTasks.slice(0, SECTION_LIMIT)).map((s) => {
                    const idx = items.findIndex((it) => it.key === `task-${s.id}`)
                    return renderTaskRow(s.id, idx)
                  })}
                </>
              )}

              {/* 空间（「全部」「空间」页签） */}
              {(tab === 'all' || tab === 'spaces') && (
                <>
                  <SectionHeader label="searchSectionSpaces" count={spaceHits.length} />
                  {(tab === 'spaces' ? spaceHits : spaceHits.slice(0, SECTION_LIMIT)).map((sp) => {
                    const idx = items.findIndex((it) => it.key === `space-${sp.dir}`)
                    return (
                      <div
                        key={sp.dir}
                        ref={(el) => {
                          if (idx >= 0) itemRefs.current[idx] = el
                        }}
                        onMouseEnter={() => idx >= 0 && setSelIdx(idx)}
                        onClick={() => openSpace(sp.dir)}
                        className={rowCls(idx)}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-hover">
                          <Folder size={15} className="text-text-muted" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] text-text-primary">
                            <Highlight text={sp.name} query={query} />
                          </div>
                          <div className="truncate text-[11px] text-text-muted" title={sp.dir}>
                            {sp.dir}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </>
              )}

              {/* 产物（「全部」「产物」页签） */}
              {(tab === 'all' || tab === 'artifacts') && (
                <>
                  <SectionHeader label="searchSectionArtifacts" count={artifactHits.length} />
                  {(tab === 'artifacts' ? artifactHits : artifactHits.slice(0, SECTION_LIMIT)).map(
                    (f) => {
                      const idx = items.findIndex((it) => it.key === `file-${f.path}`)
                      return (
                        <div
                          key={f.path}
                          ref={(el) => {
                            if (idx >= 0) itemRefs.current[idx] = el
                          }}
                          onMouseEnter={() => idx >= 0 && setSelIdx(idx)}
                          onClick={() => openArtifact(f.path)}
                          className={rowCls(idx)}
                          title={f.path}
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-hover">
                            <ArtifactIcon ext={f.extension} />
                          </span>
                          <div className="min-w-0 flex-1 truncate text-[13px] text-text-primary">
                            <Highlight text={f.name} query={query} />
                          </div>
                          <span className="shrink-0 text-[11px] text-text-muted">
                            {fmtSize(f.size)}
                          </span>
                        </div>
                      )
                    }
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* 底部快捷键提示行（对齐截图） */}
        <div className="flex shrink-0 items-center gap-4 border-t border-surface-border px-4 py-2 text-[11px] text-text-muted">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-surface-border px-1 font-sans">↑↓</kbd>
            {t('searchHintNav')}
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-surface-border px-1 font-sans">↵</kbd>
            {t('searchHintOpen')}
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-surface-border px-1 font-sans">^↵</kbd>
            {t('searchHintCategory')}
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-surface-border px-1 font-sans">ESC</kbd>
            {t('searchHintClose')}
          </span>
        </div>
      </div>
    </div>
  )
}
