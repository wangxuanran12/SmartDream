import { useEffect, useRef, useState } from 'react'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import Conversation from './components/Conversation'
import PreviewPanel from './components/PreviewPanel'
import Resizer from './components/Resizer'
import Login from './components/Login'
import SettingsModal from './components/SettingsModal'
import SearchModal from './components/SearchModal'
import { FilePlus2, PanelRight } from 'lucide-react'
import { useUIStore, genAttachmentId } from './store/useStore'
import { useT } from './i18n'
import { hydrate } from './lib/persistence'
import RailButton from './components/RailButton'

/** 拖拽文件上限（对齐 WorkBuddy：最多 50 个） */
const MAX_DROP_FILES = 50

export default function App(): JSX.Element {
  const {
    sidebarWidth,
    previewWidth,
    setSidebarWidth,
    setPreviewWidth,
    addPendingAttachments,
    previewVisible,
    setPreviewVisible,
    sidebarCollapsed
  } = useUIStore()
  const t = useT()

  // 登录态（F-42）：未登录时展示全屏登录页
  const loggedIn = useUIStore((s) => s.loggedIn)
  // 设置弹窗（F-44）
  const settingsOpen = useUIStore((s) => s.settingsOpen)
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen)
  // 全局搜索弹窗（F-47）
  const searchOpen = useUIStore((s) => s.searchOpen)

  // 全局拖拽：页面任意位置松开即可添加文件
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)

  // 启动时从 SQLite 恢复任务 / 设置 / 用户档案
  useEffect(() => {
    void hydrate()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        dragDepth.current = 0
        setDragging(false)
      }
      // ⌘, / Ctrl+, 打开设置弹窗（F-44）
      if (e.key === ',' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setSettingsOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setSettingsOpen])

  const hasFiles = (e: React.DragEvent): boolean =>
    Array.from(e.dataTransfer.types).includes('Files')

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (!files.length) return
    // Electron 32+ 已移除 File.path，优先走 preload 的 webUtils.getPathForFile
    const api = window.electronAPI
    const canGetPath = !!api && typeof api.getPathForFile === 'function'
    addPendingAttachments(
      files.slice(0, MAX_DROP_FILES).map((f) => ({
        id: genAttachmentId(),
        kind: 'file' as const,
        name: f.name,
        path: canGetPath
          ? api!.getPathForFile(f) || f.name
          : (f as File & { path?: string }).path || f.name
      }))
    )
  }

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden bg-surface-bg text-text-primary"
      onDragEnter={(e) => {
        e.preventDefault()
        if (!hasFiles(e)) return
        dragDepth.current += 1
        setDragging(true)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault()
        dragDepth.current -= 1
        if (dragDepth.current <= 0) setDragging(false)
      }}
      onDrop={handleDrop}
    >
      <TitleBar />

      {loggedIn ? (
        <div className="flex min-h-0 flex-1">
          {/* 左侧边栏 */}
          <Sidebar />

          {/* 侧边栏拖拽条（折叠时隐藏） */}
          {!sidebarCollapsed && (
            <Resizer
              onResize={(d) => setSidebarWidth(Math.max(180, Math.min(420, sidebarWidth + d)))}
            />
          )}

          {/* 中间对话区 */}
          <Conversation />

          {/* 右侧预览面板：默认隐藏，点击右侧边缘按钮展开 */}
          {previewVisible ? (
            <>
              <Resizer
                onResize={(d) => setPreviewWidth(Math.max(280, Math.min(700, previewWidth - d)))}
              />
              <div style={{ width: previewWidth }} className="min-w-0">
                <PreviewPanel />
              </div>
            </>
          ) : (
            <div className="flex w-8 shrink-0 flex-col items-center border-l border-surface-border bg-surface-panel">
              <RailButton
                label={t('appExpandPreview')}
                placement="left"
                onClick={() => setPreviewVisible(true)}
                className="mt-3"
              >
                <PanelRight size={16} />
              </RailButton>
            </div>
          )}
        </div>
      ) : (
        <Login />
      )}

      {/* 设置弹窗（F-44）：登录后可用 */}
      {loggedIn && settingsOpen && <SettingsModal />}

      {/* 全局搜索弹窗（F-47）：登录后可用 */}
      {loggedIn && searchOpen && <SearchModal />}

      {/* 拖拽提示层 */}
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-accent bg-surface-raised/95 px-12 py-10 text-accent shadow-2xl">
            <FilePlus2 size={36} />
            <div className="text-[15px] font-medium text-text-primary">{t('appDropTitle')}</div>
            <div className="text-[12px] text-text-muted">{t('appDropHint')}</div>
          </div>
        </div>
      )}
    </div>
  )
}
