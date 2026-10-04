import { useUIStore } from '../store/useStore'
import { useT } from '../i18n'
import mascotUrl from '../assets/mascot-gradient.svg'

/**
 * 登录页（F-42）：未登录时全屏展示，点击「登录」进入主界面。
 * 结构对齐参考截图：居中吉祥物 + 标语 + 黑色胶囊登录按钮，底部隐私政策 / 服务条款。
 * 吉祥物为本地 SVG 资源（mascot-gradient.svg 渐变星星精灵），离线可用，不依赖生图接口。
 */
export default function Login(): JSX.Element {
  const t = useT()
  const setLoggedIn = useUIStore((s) => s.setLoggedIn)

  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center bg-surface-bg">
      <img
        src={mascotUrl}
        alt={t('loginMascotAlt')}
        draggable={false}
        className="h-44 w-44 select-none object-contain"
      />
      <h1 className="mt-6 text-[32px] font-bold tracking-wide text-text-primary">
        {t('loginTagline')}
      </h1>
      <button
        onClick={() => setLoggedIn(true)}
        className="mt-10 h-12 w-[300px] rounded-full bg-neutral-900 text-[15px] font-medium text-white transition-colors hover:bg-neutral-800"
      >
        {t('loginButton')}
      </button>

      {/* 底部法律条款入口（Demo 占位） */}
      <div className="absolute bottom-6 flex items-center gap-10 text-[13px] text-text-muted">
        <button className="transition-colors hover:text-text-secondary">{t('loginPrivacy')}</button>
        <button className="transition-colors hover:text-text-secondary">{t('loginTerms')}</button>
      </div>
    </div>
  )
}
