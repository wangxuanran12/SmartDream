import { useEffect, useState } from 'react'
import { Minus, Square, X, Copy } from 'lucide-react'
import { useT } from '../i18n'

/**
 * 跨平台标题栏：
 * - macOS：系统红绿灯靠左（hiddenInset），这里只留出左侧拖拽区和展示标题
 * - Windows/Linux：无系统标题栏，右侧自绘「最小化/最大化/关闭」按钮
 */
export default function TitleBar(): JSX.Element {
  const t = useT()
  const [platform, setPlatform] = useState<string>('')
  const [isMax, setIsMax] = useState(false)

  useEffect(() => {
    if (!window.electronAPI) return
    window.electronAPI.getAppInfo().then((info) => setPlatform(info.platform))
    window.electronAPI.windowIsMaximized().then(setIsMax)
    const off = window.electronAPI.onMaximizeChange(setIsMax)
    return off
  }, [])

  const isMac = platform === 'darwin'
  const api = window.electronAPI

  return (
    <div
      className={`titlebar-drag relative flex h-11 shrink-0 items-center border-b border-surface-border ${
        isMac ? 'pl-20' : 'pl-4'
      }`}
      style={{ backgroundColor: 'var(--panel)' }}
    >
      {/* Windows 自绘窗口控制按钮（靠右） */}
      {!isMac && api && (
        <div className="window-controls ml-auto flex h-full items-stretch">
          <button
            onClick={() => api.windowMinimize()}
            className="flex w-12 items-center justify-center text-text-secondary hover:bg-surface-hover"
            title={t('titlebarMinimize')}
          >
            <Minus size={16} />
          </button>
          <button
            onClick={() => api.windowMaximize()}
            className="flex w-12 items-center justify-center text-text-secondary hover:bg-surface-hover"
            title={isMax ? t('titlebarRestore') : t('titlebarMaximize')}
          >
            {isMax ? <Copy size={14} className="rotate-90" /> : <Square size={14} />}
          </button>
          <button
            onClick={() => api.windowClose()}
            className="flex w-12 items-center justify-center text-text-secondary hover:bg-[#e81123] hover:text-white"
            title={t('titlebarClose')}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
