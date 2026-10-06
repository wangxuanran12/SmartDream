import type { DiffLine, DiffResult } from '../types'

export const MAX_DIFF_LINES = 2_000
export const MAX_DIFF_CELLS = 1_000_000

function splitLines(text: string): string[] {
  if (!text) return []
  const lines = text.split(/\r\n|\n|\r/)
  if (/\r\n$|\n$|\r$/.test(text)) lines.pop()
  return lines
}

/**
 * 基于 LCS（最长公共子序列）的逐行 diff 算法。
 * 输出 add / del / context 三类行，用于渲染 Codex 风格的内联 diff。
 */
export function diffLines(oldText: string, newText: string): DiffResult {
  const oldLines = splitLines(oldText)
  const newLines = splitLines(newText)
  const newlineChanged =
    /(?:\r\n|\n|\r)$/.test(oldText) !== /(?:\r\n|\n|\r)$/.test(newText)

  if (
    oldLines.length + newLines.length > MAX_DIFF_LINES ||
    oldLines.length * newLines.length > MAX_DIFF_CELLS
  ) {
    return { lines: [], additions: 0, deletions: 0, newlineChanged, truncated: true }
  }

  // LCS 动态规划表
  const m = oldLines.length
  const n = newLines.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
  }

  const lines: DiffLine[] = []
  let additions = 0
  let deletions = 0
  let i = 0
  let j = 0

  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      lines.push({ type: 'context', oldLine: i + 1, newLine: j + 1, content: oldLines[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push({ type: 'del', oldLine: i + 1, content: oldLines[i] })
      deletions++
      i++
    } else {
      lines.push({ type: 'add', newLine: j + 1, content: newLines[j] })
      additions++
      j++
    }
  }
  while (i < m) {
    lines.push({ type: 'del', oldLine: i + 1, content: oldLines[i] })
    deletions++
    i++
  }
  while (j < n) {
    lines.push({ type: 'add', newLine: j + 1, content: newLines[j] })
    additions++
    j++
  }

  return { lines, additions, deletions, newlineChanged, truncated: false }
}
