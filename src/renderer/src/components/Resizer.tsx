import { useRef, useState, useEffect } from 'react'
import { pointerDelta } from '../lib/layout'

/**
 * 可拖拽分割条：调整左右面板宽度。
 * 通过监听全局 mousemove 实时更新宽度。
 */
export default function Resizer({ onResize }: { onResize: (delta: number) => void }): JSX.Element {
  const [dragging, setDragging] = useState(false)
  const lastX = useRef(0)
  const onResizeRef = useRef(onResize)
  const draggingRef = useRef(dragging)
  onResizeRef.current = onResize
  draggingRef.current = dragging

  useEffect(() => {
    const onMouseMove = (e: MouseEvent): void => {
      if (!draggingRef.current) return
      const delta = pointerDelta(lastX.current, e.clientX)
      lastX.current = e.clientX
      if (delta !== 0) onResizeRef.current(delta)
    }
    const onMouseUp = (): void => {
      draggingRef.current = false
      setDragging(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const onMouseDown = (e: React.MouseEvent): void => {
    setDragging(true)
    draggingRef.current = true
    lastX.current = e.clientX
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  return (
    <div
      onMouseDown={onMouseDown}
      className={`group relative w-1 shrink-0 cursor-col-resize transition-colors ${
        dragging ? 'bg-accent' : 'bg-surface-border hover:bg-accent'
      }`}
    />
  )
}
