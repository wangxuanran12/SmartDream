/** 即时自定义深色 tooltip 按钮（F-43）：hover 时在图标侧旁浮现 tooltip，替代有延迟的原生 title */
export default function RailButton({
  label,
  onClick,
  placement = 'right',
  className = '',
  children
}: {
  label: string
  onClick: () => void
  /** tooltip 浮现侧：right=图标右侧（左侧栏用），left=图标左侧（窗口右缘面板用） */
  placement?: 'right' | 'left'
  className?: string
  children: JSX.Element
}): JSX.Element {
  const pos = placement === 'right' ? 'left-full ml-2' : 'right-full mr-2'
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`group relative rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary ${className}`}
    >
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute ${pos} top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md border border-white/10 bg-neutral-800 px-2 py-1 text-[12px] leading-4 text-white opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100`}
      >
        {label}
      </span>
    </button>
  )
}
