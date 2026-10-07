// 设置弹窗（F-44，对齐 WorkBuddy 设置截图）：左侧导航 + 右侧内容页
// 真实生效：通用 → 语言（中/英，持久化）、字体大小（根节点 zoom，持久化）、存储（真实缓存目录/磁盘占用）、默认工作空间路径
// 其余控件仅实现界面样式（本地状态，不持久化）；其他导航页为占位
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Settings,
  User,
  PieChart,
  Palette,
  Keyboard,
  Wand2,
  Lightbulb,
  Cat,
  Cpu,
  UserCog,
  Database,
  AppWindow,
  ShieldCheck,
  Info,
  CircleHelp,
  ChevronDown,
  Check,
  Folder,
  ArrowUpRight,
  Sparkles
} from 'lucide-react'
import type { StorageInfo } from '@shared/types'
import { getUiZoom, useUIStore } from '../store/useStore'
import type { AppLang, UiScale } from '../store/useStore'
import { useT } from '../i18n'
import type { I18nKey } from '../i18n'

type IconType = typeof Settings

/** 左侧导航定义：分组标签（label 为空时为分组标题） */
const NAV_GROUPS: { titleKey?: 'groupFeatures' | 'groupDataSecurity'; items: { key: string; icon: IconType }[] }[] = [
  {
    items: [
      { key: 'general', icon: Settings },
      { key: 'profile', icon: User },
      { key: 'planCredits', icon: PieChart },
      { key: 'appearance', icon: Palette },
      { key: 'shortcuts', icon: Keyboard }
    ]
  },
  {
    titleKey: 'groupFeatures',
    items: [
      { key: 'personalization', icon: Wand2 },
      { key: 'memory', icon: Lightbulb },
      { key: 'agents', icon: Cat },
      { key: 'models', icon: Cpu },
      { key: 'assistantSettings', icon: UserCog }
    ]
  },
  {
    titleKey: 'groupDataSecurity',
    items: [
      { key: 'dataManagement', icon: Database },
      { key: 'appManagement', icon: AppWindow },
      { key: 'securityCenter', icon: ShieldCheck }
    ]
  },
  {
    items: [
      { key: 'about', icon: Info },
      { key: 'getHelp', icon: CircleHelp }
    ]
  }
]

/** 字节 → GB 文案（与截图一致保留 2 位小数；总量未知时显示 —） */
function fmtGB(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—'
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

/** 下拉选择（截图中的胶囊下拉）：功能项传入 onChange 即真实生效，占位项仅本地状态 */
function DropSelect({
  value,
  options,
  onChange
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const current = options.find((o) => o.value === value)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 min-w-[150px] items-center justify-between gap-3 rounded-lg border border-surface-border bg-surface-raised px-3 text-[13px] text-text-primary transition-colors hover:bg-surface-hover"
      >
        <span className="truncate">{current?.label ?? value}</span>
        <ChevronDown size={14} className="shrink-0 text-text-muted" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 min-w-[180px] overflow-hidden rounded-lg border border-surface-border bg-surface-raised py-1 shadow-xl">
            {options.map((o) => (
              <button
                key={o.value}
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] transition-colors hover:bg-surface-hover ${
                  o.value === value ? 'text-text-primary' : 'text-text-secondary'
                }`}
              >
                {o.label}
                {o.value === value && <Check size={13} className="text-accent" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** 开关（截图中的绿色圆角 switch，占位项仅本地状态） */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <button
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      className={`h-[22px] w-10 shrink-0 rounded-full p-0.5 transition-colors ${
        checked ? 'bg-emerald-500' : 'bg-surface-border'
      }`}
    >
      <span
        className={`block h-[18px] w-[18px] rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[18px]' : ''
        }`}
      />
    </button>
  )
}

/** 设置行：标题 + 描述（左）与控件（右） */
function Row({
  title,
  desc,
  detail,
  children
}: {
  title: string
  desc?: string
  detail?: string
  children: ReactNode
}): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-10 px-6 py-5">
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium text-text-primary">{title}</div>
        {desc && <div className="mt-1 text-[12.5px] leading-5 text-text-secondary">{desc}</div>}
        {detail && <div className="mt-2 text-[12.5px] leading-5 text-text-muted">{detail}</div>}
      </div>
      <div className="flex shrink-0 items-center pt-0.5">{children}</div>
    </div>
  )
}

/** 分区标题（常规 / 权限 / 存储 / 通知 / 隐私） */
function SectionTitle({ label }: { label: string }): JSX.Element {
  return <div className="px-1 pb-2 pt-6 text-[13px] text-text-muted first:pt-1">{label}</div>
}

/** 内容卡片（圆角 + 边框 + 行分隔线） */
function Card({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="divide-y divide-surface-border overflow-hidden rounded-2xl border border-surface-border bg-surface-panel">
      {children}
    </div>
  )
}

/** 字体大小滑杆（小 / 默认 / 大 三档，映射根节点 zoom） */
function ScaleSlider(): JSX.Element {
  const t = useT()
  const uiScale = useUIStore((s) => s.uiScale)
  const setUiScale = useUIStore((s) => s.setUiScale)
  const values: UiScale[] = ['small', 'default', 'large']
  return (
    <div className="w-[320px]">
      <input
        type="range"
        min={0}
        max={2}
        step={1}
        value={values.indexOf(uiScale)}
        onChange={(e) => setUiScale(values[Number(e.target.value)])}
        className="w-full accent-accent"
        aria-label={t('fontSize')}
      />
      <div className="mt-1 flex items-center justify-between text-[12px] text-text-muted">
        <span>{t('scaleSmall')}</span>
        <span>{t('scaleDefault')}</span>
        <span>{t('scaleLarge')}</span>
      </div>
    </div>
  )
}

/** 模型服务（真实生效）：API Key / 基础端点 / 模型 ID，变更即持久化；Key 为空时回复走动态 mock 兜底 */
function ModelServiceSection(): JSX.Element {
  const t = useT()
  const apiKeyConfigured = useUIStore((s) => s.apiKeyConfigured)
  const apiKeyPersistent = useUIStore((s) => s.apiKeyPersistent)
  const apiKeyWarning = useUIStore((s) => s.apiKeyWarning)
  const apiBaseUrl = useUIStore((s) => s.apiBaseUrl)
  const apiModel = useUIStore((s) => s.apiModel)
  const setApiConfig = useUIStore((s) => s.setApiConfig)
  const setApiKeyStatus = useUIStore((s) => s.setApiKeyStatus)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [baseUrlDraft, setBaseUrlDraft] = useState(apiBaseUrl)
  const [keyActionError, setKeyActionError] = useState('')
  const [baseUrlError, setBaseUrlError] = useState('')
  const [baseUrlPending, setBaseUrlPending] = useState(false)
  const [keyActionPending, setKeyActionPending] = useState(false)
  const [showKey, setShowKey] = useState(false)
  useEffect(() => setBaseUrlDraft(apiBaseUrl), [apiBaseUrl])
  const inputCls =
    'h-9 w-[320px] rounded-lg border border-surface-border bg-surface-raised px-3 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-accent'
  const saveApiKey = async (): Promise<void> => {
    const api = window.electronAPI
    if (!api || !apiKeyInput.trim()) return
    setKeyActionPending(true)
    setKeyActionError('')
    try {
      const status = await api.setApiKey(apiKeyInput)
      setApiKeyStatus(status)
      setApiKeyInput('')
    } catch (err) {
      setKeyActionError((err as Error).message || t('apiKeySaveFailed'))
    } finally {
      setKeyActionPending(false)
    }
  }
  const clearSavedApiKey = async (): Promise<void> => {
    const api = window.electronAPI
    if (!api) return
    setKeyActionPending(true)
    setKeyActionError('')
    try {
      setApiKeyStatus(await api.clearApiKey())
      setApiKeyInput('')
    } catch (err) {
      setKeyActionError((err as Error).message || t('apiKeySaveFailed'))
    } finally {
      setKeyActionPending(false)
    }
  }
  const commitBaseUrl = async (): Promise<void> => {
    const next = baseUrlDraft.trim().replace(/\/+$/, '')
    if (!next || next === apiBaseUrl || baseUrlPending) return
    setBaseUrlPending(true)
    setBaseUrlError('')
    try {
      await setApiConfig({ apiBaseUrl: next })
    } catch (error) {
      setBaseUrlDraft(apiBaseUrl)
      setBaseUrlError(error instanceof Error ? error.message : String(error))
    } finally {
      setBaseUrlPending(false)
    }
  }
  return (
    <Card>
      <Row title={t('modelApiKey')} desc={t('modelApiKeyDesc')}>
        <div className="flex w-[320px] flex-col gap-2">
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKeyInput}
              placeholder={t('apiKeyPlaceholder')}
              onChange={(e) => setApiKeyInput(e.target.value)}
              className={`${inputCls} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[12px] text-text-muted transition-colors hover:text-text-primary"
            >
              {showKey ? t('hideKey') : t('showKey')}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!apiKeyInput.trim() || keyActionPending}
              onClick={() => void saveApiKey()}
              className="rounded-md bg-accent px-3 py-1.5 text-[12px] text-white disabled:opacity-50"
            >
              {t('saveApiKey')}
            </button>
            <button
              type="button"
              disabled={!apiKeyConfigured || keyActionPending}
              onClick={() => void clearSavedApiKey()}
              className="rounded-md border border-surface-border px-3 py-1.5 text-[12px] text-text-secondary disabled:opacity-50"
            >
              {t('clearApiKey')}
            </button>
            <span className="text-[11px] text-text-muted">
              {apiKeyWarning ||
                (apiKeyConfigured
                  ? t(apiKeyPersistent ? 'apiKeyStatusSaved' : 'apiKeyStatusSession')
                  : t('apiKeyStatusMissing'))}
            </span>
          </div>
          {keyActionError && <div className="text-[11px] text-red-400">{keyActionError}</div>}
        </div>
      </Row>
      <Row title={t('modelBaseUrl')} desc={t('modelBaseUrlDesc')}>
        <input
          type="text"
          value={baseUrlDraft}
          onChange={(e) => setBaseUrlDraft(e.target.value)}
          onBlur={commitBaseUrl}
          className={inputCls}
        />
      </Row>
      <Row title={t('modelApiModel')} desc={t('modelApiModelDesc')}>
        <input
          type="text"
          value={apiModel}
          onChange={(e) => void setApiConfig({ apiModel: e.target.value })}
          className={inputCls}
        />
      </Row>
      {baseUrlError && <div role="alert" className="text-[11px] text-red-400">{baseUrlError}</div>}
    </Card>
  )
}

/** 存储（真实数据）：系统缓存目录卡片 + 默认工作空间路径卡片 */
function StorageSection(): JSX.Element {
  const t = useT()
  const workspaceRoot = useUIStore((s) => s.workspaceRoot)
  const setWorkspaceRoot = useUIStore((s) => s.setWorkspaceRoot)
  const [info, setInfo] = useState<StorageInfo | null>(null)
  const [storageError, setStorageError] = useState('')

  const load = (): void => {
    // 防御：preload 未更新（旧构建无 getStorageInfo）时静默跳过，避免整树崩溃白屏
    const api = window.electronAPI
    if (!api || typeof api.getStorageInfo !== 'function') return
    api
      .getStorageInfo()
      .then((storageInfo) => {
        setInfo(storageInfo)
        setStorageError('')
      })
      .catch((error: unknown) => {
        console.error('[SmartDream] 读取存储信息失败:', error)
        setStorageError(error instanceof Error ? error.message : String(error))
      })
  }
  useEffect(() => {
    load()
  }, [])

  const total = info?.diskTotalBytes ?? 0
  const free = info?.diskFreeBytes ?? 0
  const used = total > 0 ? total - free : 0
  const cache = info?.cacheSizeBytes ?? 0
  const pct = (n: number): string =>
    total > 0 ? `${Math.min(100, Math.max(0, (n / total) * 100))}%` : '0%'

  // 更改默认工作空间路径：系统目录选择器 → 持久化
  const changeRoot = async (): Promise<void> => {
    const api = window.electronAPI
    if (!api || typeof api.selectWorkspaceRoot !== 'function') return
    try {
      const dir = await api.selectWorkspaceRoot()
      if (dir) setWorkspaceRoot(dir)
    } catch (err) {
      console.warn('[SmartDream] 设置默认工作空间失败:', err)
    }
  }

  return (
    <>
      <Card>
        <div className="px-6 py-5">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="text-[14px] font-medium text-text-primary">{t('cacheDirTitle')}</div>
              <div className="mt-1 truncate text-[12.5px] text-text-secondary">
                {info ? `${info.cacheDir} · ${t('cacheDirDesc')}` : t('loading')}
              </div>
            </div>
            <button
              onClick={() => {
                const api = window.electronAPI
                if (info && api) {
                  void api.openDataDirectory().catch((error: unknown) => {
                    console.error('[SmartDream] 打开应用数据目录失败:', error)
                    setStorageError(error instanceof Error ? error.message : String(error))
                  })
                }
              }}
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              <Folder size={14} />
              {t('openDirectory')}
            </button>
          </div>
          {storageError && <div role="alert" className="mt-2 text-[11px] text-red-400">{storageError}</div>}
          {/* 占用条：系统缓存 / 磁盘已用 / 磁盘可用 */}
          <div className="mt-4 flex h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
            <div className="h-full bg-neutral-600" style={{ width: pct(cache) }} />
            <div className="h-full bg-neutral-400" style={{ width: pct(used - cache) }} />
            <div className="h-full bg-neutral-200" style={{ width: pct(free) }} />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-4 text-[12px] text-text-secondary">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-neutral-600" />
                {t('legendCache')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-neutral-400" />
                {t('legendUsed')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-neutral-200" />
                {t('legendFree')}
              </span>
            </div>
            <span className="text-[12px] text-text-secondary">
              {t('usedOfTotal', fmtGB(used), fmtGB(total))}
            </span>
          </div>
        </div>
      </Card>
      <Card>
        <div className="px-6 py-5">
          <div className="text-[14px] font-medium text-text-primary">{t('defaultWorkspaceRoot')}</div>
          <div className="mt-1 text-[12.5px] leading-5 text-text-secondary">
            {t('defaultWorkspaceRootDesc')}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div
              className={`min-w-0 flex-1 truncate rounded-lg bg-surface-hover px-3 py-2 text-[13px] ${
                workspaceRoot ? 'text-text-secondary' : 'text-text-muted'
              }`}
            >
              {workspaceRoot || t('notSet')}
            </div>
            <button
              onClick={() => void changeRoot()}
              className="h-9 shrink-0 rounded-lg border border-surface-border px-4 text-[13px] text-text-primary transition-colors hover:bg-surface-hover"
            >
              {t('change')}
            </button>
          </div>
        </div>
      </Card>
    </>
  )
}

/** 「通用」内容页（唯一实现页） */
function GeneralPage(): JSX.Element {
  const t = useT()
  const lang = useUIStore((s) => s.lang)
  const setLang = useUIStore((s) => s.setLang)
  // 仅样式：本地状态，不持久化
  const [linkOpening, setLinkOpening] = useState('onDemand')
  const [lockRun, setLockRun] = useState('off')
  const [proxy, setProxy] = useState('direct')
  const [launchAtLogin, setLaunchAtLogin] = useState(false)
  const [autoInstall, setAutoInstall] = useState(false)
  const [skillAutoUpdate, setSkillAutoUpdate] = useState(true)
  const [kitAutoUpdate, setKitAutoUpdate] = useState(true)
  const [clientNotifications, setClientNotifications] = useState(true)
  const [helpImprove, setHelpImprove] = useState(false)

  return (
    <div>
      <SectionTitle label={t('sectionGeneral')} />
      <Card>
        <Row title={t('language')}>
          <DropSelect
            value={lang}
            options={[
              { value: 'zh', label: '简体中文' },
              { value: 'en', label: 'English' }
            ]}
            onChange={(v) => setLang(v as AppLang)}
          />
        </Row>
        <Row title={t('linkOpening')} desc={t('linkOpeningDesc')} detail={t('linkOpeningDetail')}>
          <DropSelect
            value={linkOpening}
            options={[
              { value: 'onDemand', label: t('linkOnDemand') },
              { value: 'external', label: t('linkAlwaysExternal') }
            ]}
            onChange={setLinkOpening}
          />
        </Row>
        <Row title={t('fontSize')}>
          <ScaleSlider />
        </Row>
      </Card>

      <SectionTitle label={t('sectionModel')} />
      <ModelServiceSection />

      <SectionTitle label={t('sectionPermissions')} />
      <Card>
        <Row title={t('allowLockRun')} desc={t('allowLockRunDesc')}>
          <DropSelect
            value={lockRun}
            options={[
              { value: 'off', label: t('lockRunOff') },
              { value: 'on', label: t('lockRunOn') }
            ]}
            onChange={setLockRun}
          />
        </Row>
        <Row title={t('launchAtLogin')} desc={t('launchAtLoginDesc')}>
          <Toggle checked={launchAtLogin} onChange={setLaunchAtLogin} />
        </Row>
        <Row title={t('networkProxy')} desc={t('networkProxyDesc')}>
          <DropSelect value={proxy} options={[{ value: 'direct', label: t('proxyDirect') }]} onChange={setProxy} />
        </Row>
        <Row title={t('autoInstallSkills')} desc={t('autoInstallSkillsDesc')}>
          <Toggle checked={autoInstall} onChange={setAutoInstall} />
        </Row>
        <Row title={t('skillAutoUpdate')} desc={t('skillAutoUpdateDesc')}>
          <Toggle checked={skillAutoUpdate} onChange={setSkillAutoUpdate} />
        </Row>
      </Card>

      <Card>
        <Row title={t('kitAutoUpdate')} desc={t('kitAutoUpdateDesc')}>
          <Toggle checked={kitAutoUpdate} onChange={setKitAutoUpdate} />
        </Row>
      </Card>

      <SectionTitle label={t('sectionStorage')} />
      <StorageSection />

      <SectionTitle label={t('sectionNotifications')} />
      <Card>
        <Row
          title={t('desktopNotifications')}
          desc={t('desktopNotificationsDesc')}
        >
          <button className="flex items-center gap-1 rounded-lg border border-surface-border px-3 py-1.5 text-[13px] text-text-primary transition-colors hover:bg-surface-hover">
            {t('authorize')}
            <ArrowUpRight size={13} />
          </button>
        </Row>
        <Row title={t('clientNotifications')} desc={t('clientNotificationsDesc')}>
          <Toggle checked={clientNotifications} onChange={setClientNotifications} />
        </Row>
        <Row title={t('notificationSound')} desc={t('notificationSoundDesc')}>
          <DropSelect value="none" options={[{ value: 'none', label: t('soundNone') }]} onChange={() => {}} />
        </Row>
      </Card>

      <SectionTitle label={t('sectionPrivacy')} />
      <Card>
        <Row title={t('helpImprove')} desc={t('helpImproveDesc')}>
          <Toggle checked={helpImprove} onChange={setHelpImprove} />
        </Row>
      </Card>
    </div>
  )
}

export default function SettingsModal(): JSX.Element {
  const t = useT()
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen)
  const uiScale = useUIStore((s) => s.uiScale)
  const [active, setActive] = useState('general')

  // Esc 关闭弹窗
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setSettingsOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setSettingsOpen])

  // 根节点 zoom 会整体缩放页面，这里对弹窗固定宽高做反向抵消，
  // 保证切档时弹窗外框始终为恒定的 1080×860 实际像素（内部内容仍随字体大小缩放）
  const zoom = getUiZoom(uiScale)

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-6"
      onClick={() => setSettingsOpen(false)}
    >
      <div
        className="flex h-full max-w-full overflow-hidden rounded-2xl border border-surface-border bg-surface-raised shadow-2xl"
        style={{ width: 1080 / zoom, maxHeight: 860 / zoom }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 左侧导航 */}
        <div className="w-[224px] shrink-0 overflow-y-auto border-r border-surface-border bg-surface-panel px-3 py-4">
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi} className={gi > 0 ? 'mt-4' : ''}>
              {group.titleKey && (
                <div className="px-3 pb-1 pt-1 text-[11px] text-text-muted">{t(group.titleKey)}</div>
              )}
              {group.items.map(({ key, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActive(key)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors ${
                    active === key
                      ? 'bg-surface-hover font-medium text-text-primary'
                      : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                  }`}
                >
                  <Icon size={15} className={active === key ? 'text-text-primary' : 'text-text-muted'} />
                  {t(`nav${key.charAt(0).toUpperCase()}${key.slice(1)}` as I18nKey)}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* 右侧内容 */}
        <div className="min-w-0 flex-1 overflow-y-auto px-8 py-6">
          {active === 'general' ? (
            <GeneralPage />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-text-muted">
              <Sparkles size={28} />
              <div className="text-[13px]">{t('placeholderText')}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
