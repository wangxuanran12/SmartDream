import { useEffect, useMemo, useState } from 'react'
import {
  Plus,
  Trash2,
  PanelLeftClose,
  PanelLeft,
  Sun,
  Moon,
  Search,
  ChevronDown,
  CirclePlus,
  Bot,
  Network,
  Puzzle,
  AlarmClock,
  Library,
  LayoutGrid,
  Bell,
  Settings,
  Folder,
  Compass,
  Copy,
  Check,
  Store,
  UserPlus,
  CalendarCheck,
  Lightbulb,
  Palette,
  CircleHelp,
  CircleArrowUp,
  LogOut,
  ChevronRight
} from 'lucide-react'
import { useSessionStore, useUIStore, useUserStore, isValidSpaceName } from '../store/useStore'
import type { Session } from '../types'
import { useT } from '../i18n'
import type { I18nKey } from '../i18n'
import type { ReactNode } from 'react'
import RailButton from './RailButton'

/** 相对时间（对齐 WorkBuddy）：刚刚 / n分钟前 / n小时前 / n天前 */
function relTime(ts: number, t: (key: I18nKey, ...args: string[]) => string): string {
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return t('relJustNow')
  if (minutes < 60) return t('relMinutesAgo', String(minutes))
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('relHoursAgo', String(hours))
  return t('relDaysAgo', String(Math.floor(hours / 24)))
}

/** 主导航占位项（对齐 WorkBuddy，Demo 阶段仅样式无跳转） */
const NAV_ITEMS: { icon: typeof Bot; label: I18nKey }[] = [
  { icon: Bot, label: 'sidebarNavAssistant' },
  { icon: Network, label: 'sidebarNavProjects' },
  { icon: Puzzle, label: 'sidebarNavExperts' },
  { icon: AlarmClock, label: 'sidebarNavScheduled' },
  { icon: Library, label: 'sidebarNavLibrary' },
  { icon: LayoutGrid, label: 'sidebarNavMore' }
]

/** 会话条目：标题截断 + 相对时间 + 模式徽标 + 悬停删除 */
function SessionRow({
  session: s,
  active,
  indent,
  onSelect,
  onDelete
}: {
  session: Session
  active: boolean
  indent?: boolean
  onSelect: () => void
  onDelete: () => void
}): JSX.Element {
  const t = useT()
  return (
    <div
      onClick={onSelect}
      className={`group flex cursor-pointer items-center gap-2 rounded-md py-1.5 pr-1.5 text-[13px] ${
        indent ? 'ml-3 pl-2' : 'px-2'
      } ${active ? 'bg-surface-hover text-text-primary' : 'text-text-secondary hover:bg-surface-hover'}`}
    >
      {s.status === 'running' ? (
        <span
          className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[var(--diff-add)]"
          title={t('sidebarRunning')}
        />
      ) : (
        <span className="h-2 w-2 shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate" title={s.title}>
        {s.title}
      </span>
      {s.mode === 'plan' && (
        <span className="shrink-0 rounded bg-accent/15 px-1 py-0.5 text-[10px] text-accent">
          Plan
        </span>
      )}
      {s.mode === 'ask' && (
        <span className="shrink-0 rounded bg-surface-border px-1 py-0.5 text-[10px] text-text-secondary">
          Ask
        </span>
      )}
      <span className="shrink-0 text-[11px] text-text-muted">{relTime(s.updatedAt, t)}</span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="hidden shrink-0 rounded p-0.5 text-text-muted hover:text-[var(--diff-del)] group-hover:block"
        title={t('sidebarDeleteTask')}
      >
        <Trash2 size={13} />
      </button>
    </div>
  )
}

/** 可折叠分组头：名称 + 计数 + 箭头；action 为右侧附加操作（如「新建空间」按钮） */
function SectionHeader({
  label,
  count,
  open,
  onToggle,
  action
}: {
  label: string
  count: number
  open: boolean
  onToggle: () => void
  action?: ReactNode
}): JSX.Element {
  return (
    <div className="flex items-center">
      <button
        onClick={onToggle}
        className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
      >
        {label}
        <span className="text-text-muted">({count})</span>
        <ChevronDown
          size={12}
          className={`ml-0.5 text-text-muted transition-transform ${open ? '' : '-rotate-90'}`}
        />
      </button>
      {action}
    </div>
  )
}

/** 用户菜单条目（F-41）：图标 + 标签 + 右侧自定义内容 */
function UserMenuItem({
  icon: Icon,
  label,
  trailing,
  onClick
}: {
  icon: typeof Bot
  label: string
  trailing?: JSX.Element
  onClick?: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
    >
      <Icon size={16} className="shrink-0 text-text-muted" />
      <span className="flex-1 truncate text-left">{label}</span>
      {trailing}
    </button>
  )
}

export default function Sidebar(): JSX.Element {
  const { sessions, activeId, createSession, deleteSession, setActive, createSpace } =
    useSessionStore()
  const {
    sidebarCollapsed,
    toggleSidebar,
    theme,
    toggleTheme,
    sidebarWidth,
    setLoggedIn,
    setSettingsOpen,
    setSearchOpen,
    setPreviewTab,
    setPreviewVisible
  } = useUIStore()
  const { name: userName, plan: userPlan } = useUserStore()
  const t = useT()

  // 应用版本（品牌区展示，来自主进程 app:get-info）
  const [appVersion, setAppVersion] = useState('')
  // 分组折叠状态（仅 UI 态，不持久化）
  const [tasksOpen, setTasksOpen] = useState(true)
  const [spacesOpen, setSpacesOpen] = useState(true)
  const [closedFolders, setClosedFolders] = useState<Record<string, boolean>>({})
  // 用户菜单弹窗（F-41）与用户名复制反馈
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  // 新建空间：内联命名输入（空间名 = 存储目录下新建文件夹名）
  const [creatingSpace, setCreatingSpace] = useState(false)
  const [spaceName, setSpaceName] = useState('')

  // 提交新建空间：创建同名文件夹 + 新建任务绑定该空间（失败时保留输入便于重试）
  const submitNewSpace = async (): Promise<void> => {
    const name = spaceName.trim()
    if (!isValidSpaceName(name)) return
    const dir = await createSpace(name)
    if (dir) {
      setCreatingSpace(false)
      setSpaceName('')
    }
  }

  const copyUserName = (): void => {
    navigator.clipboard
      .writeText(userName || '')
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {})
  }

  // Esc 关闭用户菜单
  useEffect(() => {
    if (!userMenuOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setUserMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [userMenuOpen])

  useEffect(() => {
    window.electronAPI
      ?.getAppInfo()
      .then((info) => setAppVersion(info.appVersion))
      .catch(() => {})
  }, [])

  // 新建任务：仅创建会话，初始不绑定工作空间（可后续通过 + 菜单设置）
  const handleCreateSession = (): void => {
    createSession()
  }

  // 空间内新建任务：绑定该空间目录（已有占位任务时复用；目录已随会话授权恢复，无需再次弹窗授权）
  const handleCreateSessionInSpace = (dir: string): void => {
    createSession({ workspace: dir })
  }

  // 点击空间：默认打开该空间的文件模块 —— 激活空间内绑定任务（当前任务已属于该空间则保持不变），
  // 右侧预览面板切到「文件」页签并展开
  const handleOpenSpace = (spaceSessions: Session[]): void => {
    const target =
      spaceSessions.find((s) => s.id === activeId) ??
      spaceSessions.find((s) => s.messages.length > 0) ??
      spaceSessions[0]
    if (target && target.id !== activeId) setActive(target.id)
    setPreviewTab('files')
    setPreviewVisible(true)
  }

  // 任务分组：未绑定工作空间的会话（占位任务在发送第一条消息前不显示），按更新时间倒序
  const looseSessions = useMemo(
    () =>
      sessions
        .filter((s) => !s.workspace && s.messages.length > 0)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [sessions]
  )

  // 空间分组：按授权工作空间目录分组，组内按更新时间倒序，组间按最近更新倒序
  // （占位任务参与分组但不渲染，保证仅含占位任务的新空间仍显示为目录）
  const spaceGroups = useMemo(() => {
    const map = new Map<string, Session[]>()
    for (const s of sessions) {
      if (!s.workspace) continue
      const list = map.get(s.workspace) ?? []
      list.push(s)
      map.set(s.workspace, list)
    }
    return [...map.entries()]
      .map(([dir, list]) => ({
        dir,
        name: dir.split(/[\\/]/).filter(Boolean).pop() || dir,
        sessions: list.sort((a, b) => b.updatedAt - a.updatedAt)
      }))
      .sort((a, b) => b.sessions[0].updatedAt - a.sessions[0].updatedAt)
  }, [sessions])

  if (sidebarCollapsed) {
    return (
      <div
        className="flex h-full flex-col items-center border-r border-surface-border py-3"
        style={{ width: 44, backgroundColor: 'var(--panel)' }}
      >
        <RailButton label={t('sidebarExpandSidebar')} onClick={toggleSidebar}>
          <PanelLeft size={16} />
        </RailButton>
        <RailButton label={t('sidebarNewTask')} onClick={handleCreateSession} className="mt-3">
          <Plus size={16} />
        </RailButton>
      </div>
    )
  }

  return (
    <div
      className="flex h-full shrink-0 flex-col border-r border-surface-border"
      style={{ width: sidebarWidth, backgroundColor: 'var(--panel)' }}
    >
      {/* 顶部工具行（F-37）：折叠切换 + 搜索/筛选，悬浮提示复用 F-43 即时自定义 tooltip */}
      <div className="flex items-center justify-between px-2 pb-1 pt-2">
        <RailButton label={t('sidebarCollapseSidebar')} onClick={toggleSidebar}>
          <PanelLeftClose size={16} />
        </RailButton>
        <div className="flex items-center">
          <RailButton label={t('sidebarSearch')} onClick={() => setSearchOpen(true)}>
            <Search size={15} />
          </RailButton>
        </div>
      </div>

      {/* 品牌区（F-37）：应用名 + 版本 + 发现应用（占位） */}
      <div className="flex items-center justify-between px-3 pb-2 pt-1">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold leading-5 text-text-primary">SmartDream</div>
          <div className="text-[10px] leading-4 text-text-muted">{appVersion || '—'}</div>
        </div>
        <button
          className="flex shrink-0 items-center gap-1 rounded-full border border-surface-border px-2 py-1 text-[11px] text-text-secondary transition-colors hover:border-accent hover:text-text-primary"
          title={t('sidebarDiscoverAppsTitle')}
        >
          <Compass size={12} />
          {t('sidebarDiscoverApps')}
          <ChevronDown size={11} className="text-text-muted" />
        </button>
      </div>

      {/* 主导航（F-37）：新建任务可用，其余为占位入口 */}
      <div className="px-2">
        <button
          onClick={handleCreateSession}
          className="flex w-full items-center gap-2.5 rounded-md px-2 py-[7px] text-[13px] text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
        >
          <CirclePlus size={16} className="shrink-0" />
          {t('sidebarNewTask')}
        </button>
        {NAV_ITEMS.map(({ icon: Icon, label }) => (
          <button
            key={label}
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-[7px] text-[13px] text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            <Icon size={16} className="shrink-0 text-text-muted" />
            {t(label)}
          </button>
        ))}
      </div>

      {/* 任务 / 空间分组列表（F-38） */}
      <div className="mt-1 flex-1 overflow-y-auto px-2 pb-2">
        <SectionHeader
          label={t('sidebarTasks')}
          count={looseSessions.length}
          open={tasksOpen}
          onToggle={() => setTasksOpen((v) => !v)}
        />
        {tasksOpen &&
          looseSessions.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              active={activeId === s.id}
              onSelect={() => setActive(s.id)}
              onDelete={() => deleteSession(s.id)}
            />
          ))}

        <div className="mt-2">
          <SectionHeader
            label={t('sidebarSpaces')}
            count={spaceGroups.length}
            open={spacesOpen}
            onToggle={() => setSpacesOpen((v) => !v)}
            action={
              <button
                onClick={() => {
                  setSpacesOpen(true)
                  setCreatingSpace(true)
                }}
                className="mr-1 rounded p-1 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
                title={t('sidebarNewSpaceTitle')}
              >
                <Plus size={13} />
              </button>
            }
          />
          {spacesOpen && creatingSpace && (
            <div className="ml-2 mr-1 mt-0.5 flex items-center gap-1.5 rounded-md bg-surface-hover px-2 py-1.5">
              <Folder size={14} className="shrink-0 text-text-muted" />
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
                onBlur={() => {
                  setCreatingSpace(false)
                  setSpaceName('')
                }}
                placeholder={t('sidebarSpaceNamePlaceholder')}
                title={t('sidebarSpaceNameInvalid')}
                className="min-w-0 flex-1 bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-muted"
              />
            </div>
          )}
          {spacesOpen &&
            spaceGroups.map((g) => {
              const closed = closedFolders[g.dir]
              const visible = g.sessions.filter((s) => s.messages.length > 0)
              return (
                <div key={g.dir}>
                  <div
                    onClick={() => handleOpenSpace(g.sessions)}
                    className="group flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                    title={g.dir}
                  >
                    <Folder size={14} className="shrink-0 text-text-muted" />
                    <span className="min-w-0 flex-1 truncate text-left">{g.name}</span>
                    {/* 空间内新建任务：hover 行时出现，tooltip 参考工作台样式 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleCreateSessionInSpace(g.dir)
                      }}
                      className="group/btn relative hidden shrink-0 rounded-full border border-surface-border bg-surface-raised p-0.5 text-text-secondary transition-colors hover:border-text-muted hover:text-text-primary group-hover:flex"
                      aria-label={t('sidebarNewTask')}
                    >
                      <Plus size={12} />
                      <span
                        role="tooltip"
                        className="pointer-events-none absolute right-0 top-full z-30 mt-1 whitespace-nowrap rounded-md border border-white/10 bg-neutral-800 px-2 py-1 text-[12px] leading-4 text-white opacity-0 shadow-md transition-opacity duration-150 group-hover/btn:opacity-100"
                      >
                        {t('sidebarNewTask')}
                      </span>
                    </button>
                    {/* 折叠 / 展开空间：点击箭头切换，不触发行的「打开文件模块」 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setClosedFolders((m) => ({ ...m, [g.dir]: !closed }))
                      }}
                      className="shrink-0 cursor-pointer text-text-muted transition-transform hover:text-text-primary"
                      aria-label={closed ? 'expand' : 'collapse'}
                    >
                      <ChevronDown
                        size={12}
                        className={`transition-transform ${closed ? '-rotate-90' : ''}`}
                      />
                    </button>
                  </div>
                  {!closed &&
                    visible.map((s) => (
                      <SessionRow
                        key={s.id}
                        session={s}
                        active={activeId === s.id}
                        indent
                        onSelect={() => setActive(s.id)}
                        onDelete={() => deleteSession(s.id)}
                      />
                    ))}
                </div>
              )
            })}
        </div>
      </div>

      {/* 底部用户信息行（F-35/F-39）+ 用户菜单弹窗（F-41） */}
      <div className="relative shrink-0 border-t border-surface-border">
        {userMenuOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setUserMenuOpen(false)} />
            <div className="absolute bottom-full left-2 z-40 mb-2 w-[calc(100%-16px)] overflow-hidden rounded-2xl border border-surface-border bg-surface-raised shadow-xl">
              {/* 头部：用户名 + 复制 */}
              <div className="flex items-center gap-2 px-4 pb-2.5 pt-3.5">
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-text-primary">
                  {userName}
                </span>
                <button
                  onClick={copyUserName}
                  className="shrink-0 rounded p-1 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
                  title={t('sidebarCopyUsername')}
                >
                  {copied ? (
                    <Check size={14} className="text-[var(--diff-add)]" />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
              </div>
              <div className="border-t border-surface-border" />
              {/* 套餐与权益（Demo 占位） */}
              <div className="px-2 py-2">
                <UserMenuItem
                  icon={Store}
                  label={t('sidebarDreamStation')}
                  trailing={<ChevronRight size={12} className="text-text-muted" />}
                />
                <UserMenuItem
                  icon={UserPlus}
                  label={t('sidebarInvite')}
                  trailing={
                    <>
                      <span className="text-[11px] text-text-muted">{t('sidebarInviteReward')}</span>
                      <ChevronRight size={12} className="text-text-muted" />
                    </>
                  }
                />
                <UserMenuItem
                  icon={CalendarCheck}
                  label={t('sidebarGrowthPlan')}
                  trailing={
                    <>
                      <span className="text-[11px] text-text-muted">{t('sidebarGrowthReward')}</span>
                      <ChevronRight size={12} className="text-text-muted" />
                    </>
                  }
                />
              </div>
              <div className="border-t border-surface-border" />
              {/* 通用设置（Demo 占位） */}
              <div className="px-2 py-2">
                <UserMenuItem
                  icon={Settings}
                  label={t('sidebarSettings')}
                  trailing={<span className="text-[11px] text-text-muted">⌘,</span>}
                  onClick={() => {
                    setUserMenuOpen(false)
                    setSettingsOpen(true)
                  }}
                />
                <UserMenuItem icon={Lightbulb} label={t('sidebarMemory')} />
                <UserMenuItem
                  icon={Palette}
                  label={t('sidebarAppearance')}
                  trailing={
                    <>
                      <span className="text-[11px] text-text-muted">{t('sidebarAppearanceNew')}</span>
                      <ChevronRight size={12} className="text-text-muted" />
                    </>
                  }
                />
                <UserMenuItem icon={CircleHelp} label={t('sidebarHelpFeedback')} />
                <UserMenuItem icon={CircleArrowUp} label={t('sidebarCheckUpdates')} />
              </div>
              <div className="border-t border-surface-border" />
              <div className="px-2 py-2">
                <UserMenuItem icon={LogOut} label={t('sidebarLogOut')} onClick={() => setLoggedIn(false)} />
              </div>
            </div>
          </>
        )}
        <div
          className="flex cursor-pointer items-center gap-2 px-3 py-2"
          onClick={() => setUserMenuOpen((v) => !v)}
          title={t('sidebarUserMenu')}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-semibold text-white">
            {(userName || 'U').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-medium text-text-primary">{userName}</div>
            <div className="text-[10px] text-text-muted">{userPlan}</div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setUserMenuOpen(false)
            }}
            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
            title={t('sidebarNotifications')}
          >
            <Bell size={15} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              toggleTheme()
            }}
            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
            title={t('sidebarToggleTheme')}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </div>
    </div>
  )
}
