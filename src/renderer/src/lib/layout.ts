export function pointerDelta(previousX: number, nextX: number): number {
  return nextX - previousX
}

export function resizeWidth(
  currentWidth: number,
  delta: number,
  direction: 1 | -1,
  minWidth: number,
  maxWidth: number
): number {
  return Math.max(minWidth, Math.min(maxWidth, currentWidth + delta * direction))
}
