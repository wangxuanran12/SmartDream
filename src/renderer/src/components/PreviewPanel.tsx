import { useEffect, useState } from 'react'
import {
  FileCode2,
  Files,
  ExternalLink,
  MessageSquare,
  Zap,
  Loader2,
  FolderOpen,
  PanelRightClose
} from 'lucide-react'
import CodeBlock from './CodeBlock'
import FileTree from './FileTree'
import RailButton from './RailButton'
import { useSessionStore, useUIStore, type PreviewTab } from '../store/useStore'
import { MOCK_FILE_CONTENT, MODELS, MOCK_PROJECT_FILES } from '../data/mockData'
import type { FileContent, FileNode } from '@shared/types'
import { translate, useT } from '../i18n'

const TABS: { id: PreviewTab; label: string; icon: JSX.Element }[] = [
  { id: 'files', label: 'previewTabFiles', icon: <Files size={14} /> },
  { id: 'code', label: 'previewTabCode', icon: <FileCode2 size={14} /> }
]

export default function PreviewPanel(): JSX.Element {
  const t = useT()
  const {
    previewFile,
    setPreviewFile,
    sessions,
    activeId,
    authorizeSessionWorkspace,
    authorizeSessionFile
  } = useSessionStore()
  const activeSession = sessions.find((s) => s.id === activeId)
  const running = activeSession?.status === 'running'
  const model = MODELS.find((m) => m.id === activeSession?.model)
  const { previewTab, setPreviewTab, theme, setPreviewVisible } = useUIStore()
  const [fileContent, setFileContent] = useState<FileContent | null>(null)
  const [loading, setLoading] = useState(false)
  const [readError, setReadError] = useState<string | null>(null)
  const [fileTreeError, setFileTreeError] = useState<string | null>(null)
  const [directoryTruncated, setDirectoryTruncated] = useState(false)

  // 当前会话的授权状态（会话级，切换会话即切换文件）
  const workspaceDir = activeSession?.workspace ?? null
  const authorizedFile = activeSession?.authorizedFile ?? null

  // 文件树：默认不打开任何目录，需用户授权工作空间后才加载
  const [fileRoot, setFileRoot] = useState<FileNode | null>(null)
  // 授权中状态
  const [authorizing, setAuthorizing] = useState(false)
  const [authorizationRevision, setAuthorizationRevision] = useState(0)

  // 根据授权目录加载文件树
  useEffect(() => {
    if (!workspaceDir) {
      setFileRoot(null)
      setFileTreeError(null)
      setDirectoryTruncated(false)
      return
    }
    setFileRoot(null)
    setFileTreeError(null)
    setDirectoryTruncated(false)
    if (!window.electronAPI) {
      // 无 Electron（纯浏览器预览）时用 mock 文件树兜底
      setFileRoot(MOCK_PROJECT_FILES as unknown as FileNode)
      return
    }
    let active = true
    window.electronAPI
      .readDirectory(workspaceDir)
      .then(({ entries, truncated }) => {
        if (!active) return
        setDirectoryTruncated(truncated)
        setFileRoot({
          name: workspaceDir.split(/[\\/]/).pop() || workspaceDir,
          path: workspaceDir,
          isDirectory: true,
          children: entries
        })
      })
      .catch((error: unknown) => {
        if (!active) return
        console.error('[SmartDream] 文件树读取失败:', error)
        setFileTreeError(error instanceof Error ? error.message : String(error))
        setFileRoot(null)
      })
    return () => {
      active = false
    }
  }, [workspaceDir, authorizationRevision])

  // 授权单个文件时（未授权目录），文件树展示为「单文件树」，便于在「文件」Tab 中看到该文件
  useEffect(() => {
    if (workspaceDir || !authorizedFile) return
    if (!window.electronAPI) {
      const name = authorizedFile.split(/[\\/]/).pop() || authorizedFile
      const ext = name.includes('.') ? name.split('.').pop() : undefined
      setFileRoot({ name, path: authorizedFile, isDirectory: false, extension: ext })
      return
    }

    setFileRoot(null)
    setFileTreeError(null)
    setDirectoryTruncated(false)
    let active = true
    window.electronAPI
      .getWorkspace()
      .then(({ authorizedFiles }) => {
        if (!active || !authorizedFiles.includes(authorizedFile)) {
          if (active) {
            setFileRoot(null)
            setFileTreeError(
              translate(useUIStore.getState().lang, 'previewAuthorizationError')
            )
          }
          return
        }
        const name = authorizedFile.split(/[\\/]/).pop() || authorizedFile
        const ext = name.includes('.') ? name.split('.').pop() : undefined
        setFileRoot({ name, path: authorizedFile, isDirectory: false, extension: ext })
      })
      .catch((err) => {
        console.warn('[SmartDream] 查询文件授权状态失败:', err)
        if (active) {
          setFileRoot(null)
          setFileTreeError(
            translate(useUIStore.getState().lang, 'previewAuthorizationError')
          )
        }
      })
    return () => {
      active = false
    }
  }, [workspaceDir, authorizedFile, authorizationRevision])

  // 授权单个文件时，直接打开该文件代码
  useEffect(() => {
    if (authorizedFile) {
      setPreviewFile(authorizedFile)
      setPreviewTab('code')
    }
  }, [authorizedFile, setPreviewFile, setPreviewTab])

  // 切换会话时同步刷新右侧预览（跟随会话）：
  // - 新会话无任何授权 → 清空选中文件
  // - 新会话授权了工作空间 → 仅保留属于该空间的文件，跨空间的旧文件路径清空
  // - 新会话授权单文件 → 交给上方 authorizedFile 副作用处理
  useEffect(() => {
    if (!previewFile) return
    if (workspaceDir) {
      const norm = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '')
      if (!norm(previewFile).startsWith(`${norm(workspaceDir)}/`)) {
        setPreviewFile(null)
      }
      return
    }
    if (!authorizedFile) {
      setPreviewFile(null)
    }
  }, [activeId, workspaceDir, authorizedFile, previewFile, setPreviewFile])

  // 用户点击「选择文件夹」授权
  const handleAuthorizeFolder = async (): Promise<void> => {
    if (authorizing || !activeSession) return
    const sessionId = activeSession.id
    setAuthorizing(true)
    try {
      const directory = await authorizeSessionWorkspace(sessionId)
      if (!directory || useSessionStore.getState().activeId !== sessionId) return
      setPreviewFile(null)
      setPreviewTab('files')
      setAuthorizationRevision((revision) => revision + 1)
    } finally {
      setAuthorizing(false)
    }
  }

  // 用户点击「选择文件」授权
  const handleAuthorizeFile = async (): Promise<void> => {
    if (authorizing || !activeSession) return
    const sessionId = activeSession.id
    setAuthorizing(true)
    try {
      const file = await authorizeSessionFile(sessionId)
      if (!file || useSessionStore.getState().activeId !== sessionId) return
      setPreviewFile(file)
      setPreviewTab('code')
      setAuthorizationRevision((revision) => revision + 1)
    } finally {
      setAuthorizing(false)
    }
  }

  const authorizationActions = (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button
        onClick={handleAuthorizeFolder}
        disabled={authorizing || !activeSession}
        className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        <FolderOpen size={14} />
        {authorizing ? t('previewProcessing') : t('previewReauthorizeFolder')}
      </button>
      <button
        onClick={handleAuthorizeFile}
        disabled={authorizing || !activeSession}
        className="flex items-center gap-1.5 rounded-md border border-surface-border px-3 py-1.5 text-[13px] font-medium text-text-secondary transition-colors hover:border-accent hover:text-text-primary disabled:opacity-50"
      >
        <FileCode2 size={14} />
        {t('previewReauthorizeFile')}
      </button>
    </div>
  )

  // 读取文件内容：优先真实磁盘（Electron），否则 mock；依赖 activeId 保证切换任务时重新读取（刷新磁盘最新内容）
  useEffect(() => {
    if (!previewFile) {
      setFileContent(null)
      setReadError(null)
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    setReadError(null)
    const mockContent = MOCK_FILE_CONTENT[previewFile.replace(/^.*\/(src|utils)\//, 'src/')]
    if (window.electronAPI) {
      window.electronAPI
        .readFile(previewFile)
        .then((content) => {
          if (!active) return
          setFileContent(content)
          setReadError(null)
        })
        .catch((error: unknown) => {
          if (!active) return
          console.error('[SmartDream] 文件预览读取失败:', error)
          setFileContent(null)
          setReadError(error instanceof Error ? error.message : String(error))
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    } else {
      // mock 场景
      setTimeout(() => {
        if (!active) return
        setFileContent({
          path: previewFile,
          content: mockContent ?? t('previewMockContent'),
          language: previewFile.endsWith('.tsx') ? 'tsx' : 'ts'
        })
        setLoading(false)
      }, 120)
    }
    return () => {
      active = false
    }
  }, [previewFile, activeId, authorizationRevision])

  return (
    <div className="flex h-full min-w-0 flex-col border-l border-surface-border bg-surface-panel">
      {/* Tab 栏 */}
      <div className="flex items-center border-b border-surface-border px-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setPreviewTab(tab.id)}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] transition-colors ${
              previewTab === tab.id
                ? 'border-accent text-text-primary'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            {tab.icon}
            {t(tab.label)}
          </button>
        ))}
        <RailButton
          label={t('previewHidePanel')}
          placement="left"
          onClick={() => setPreviewVisible(false)}
          className="ml-auto mr-1"
        >
          <PanelRightClose size={15} />
        </RailButton>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto p-3">
        {previewTab === 'code' && (
          <div>
            {previewFile ? (
              loading ? (
                <div className="text-[13px] text-text-muted">{t('previewLoading')}</div>
              ) : (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[12px] text-text-muted">{previewFile.split('/').pop()}</span>
                    <button
                      onClick={() => window.electronAPI?.openPath(previewFile)}
                      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] text-text-muted hover:bg-surface-hover hover:text-text-primary"
                      title={t('previewOpenExternal')}
                    >
                      <ExternalLink size={13} />
                    </button>
                  </div>
                  {readError ? (
                    <div>
                      <div role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-[12px] text-red-300">
                        {t('previewReadError')}: {readError}
                      </div>
                      {authorizationActions}
                    </div>
                  ) : (
                    <CodeBlock
                      code={fileContent?.content ?? ''}
                      language={fileContent?.language ?? 'text'}
                      theme={theme}
                    />
                  )}
                </div>
              )
            ) : (
              <div className="flex h-40 flex-col items-center justify-center text-text-muted">
                <FileCode2 size={28} className="mb-2" />
                <div className="text-[13px]">{t('previewCodeEmpty')}</div>
              </div>
            )}
          </div>
        )}

        {previewTab === 'files' && (
          <div>
            {fileTreeError ? (
              <div>
                <div role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-[12px] text-red-300">
                  {t('previewTreeError')}: {fileTreeError}
                </div>
                {authorizationActions}
              </div>
            ) : fileRoot ? (
              <>
                {directoryTruncated && (
                  <div role="status" className="mb-2 rounded-md bg-amber-500/10 p-2 text-[11px] text-amber-300">
                    {t('previewTreeTruncated')}
                  </div>
                )}
                {fileRoot.isDirectory ? (
                <FileTree
                  root={fileRoot}
                  selectedPath={previewFile}
                  onSelect={(node) => {
                    if (!node.isDirectory) {
                      setPreviewFile(node.path)
                      // 选中文件后自动切到「文件内容」Tab 查看内容
                      setPreviewTab('code')
                    }
                  }}
                />
              ) : (
                // 单个授权文件：直接展示为可点击的文件条目
                <div className="py-1">
                  <div className="flex items-center gap-1.5 px-2 py-1 text-[12px] font-medium text-text-muted">
                    <span className="truncate">{t('previewAuthorizedFile')}</span>
                  </div>
                  <div
                    className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-[3px] text-[13px] leading-5 ${
                      previewFile === fileRoot.path
                        ? 'bg-surface-hover text-text-primary'
                        : 'text-text-secondary hover:bg-surface-hover'
                    }`}
                    onClick={() => {
                      setPreviewFile(fileRoot.path)
                      setPreviewTab('code')
                    }}
                  >
                    <FileCode2 size={15} className="shrink-0 text-[#3178c6]" />
                    <span className="truncate">{fileRoot.name}</span>
                  </div>
                </div>
                )}
              </>
            ) : (
              <div className="flex h-64 flex-col items-center justify-center text-center text-text-muted">
                <FolderOpen size={32} className="mb-3 text-text-secondary" />
                <div className="text-[14px] font-medium text-text-secondary">{t('previewAuthTitle')}</div>
                <div className="mt-1 max-w-[260px] text-[12px] leading-5">
                  {t('previewAuthDesc')}
                </div>
                {authorizationActions}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 面板底部状态栏（F-36）：消息数 / 执行状态 / 当前模型 */}
      <div className="flex h-6 shrink-0 items-center justify-between border-t border-surface-border px-4 text-[10px] text-text-muted">
        <span className="flex shrink-0 items-center gap-1">
          <MessageSquare size={10} />
          {t('previewMessageCount', String(activeSession?.messages.length ?? 0))}
        </span>
        <div className="flex shrink-0 items-center gap-3">
          <span className="flex items-center gap-1">
            {running ? <Loader2 size={10} className="animate-spin" /> : <Zap size={10} />}
            {running ? t('previewStatusRunning') : t('previewStatusReady')}
          </span>
          <span className="font-medium">{model?.name ?? t('previewNoModel')}</span>
        </div>
      </div>
    </div>
  )
}
