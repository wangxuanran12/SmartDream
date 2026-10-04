// LLM 流式聊天转发：主进程 fetch OpenAI 兼容 /chat/completions（stream:true），
// 解析 SSE 逐 delta 回调 onChunk，由 index.ts 经 webContents.send 推给 renderer。
// 仅转发不落库（消息持久化由 renderer 在流结束后整条写入 SQLite）。
import type { ChatStreamPayload, ChatStreamResult } from '../shared/types'

/** 首包与 chunk 间空闲超时（毫秒） */
const FIRST_CHUNK_TIMEOUT = 30_000
const IDLE_TIMEOUT = 30_000

/** 活跃请求表：requestId → AbortController（chat:abort 按此定位） */
const inflight = new Map<string, AbortController>()

/** 中止指定请求（用户取消 / 切换会话 / 新发送覆盖旧流） */
export function abortChat(requestId: string): void {
  inflight.get(requestId)?.abort()
}

interface RunChatStreamArgs {
  payload: ChatStreamPayload
  onChunk: (delta: string) => void
}

/** 发起流式请求并消费 SSE 流，结束时 resolve 结果 */
export async function runChatStream({ payload, onChunk }: RunChatStreamArgs): Promise<ChatStreamResult> {
  const { requestId, messages, apiKey, baseUrl, model } = payload
  const controller = new AbortController()
  inflight.set(requestId, controller)

  // 两级超时：首包 30s；每收到一个 chunk 重置的 30s 空闲计时器
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  const armTimer = (ms: number, reason: string): void => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      timeoutReason = reason
      controller.abort()
    }, ms)
  }
  let timeoutReason = ''

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({ model, messages, stream: true }),
      signal: controller.signal
    })
    armTimer(FIRST_CHUNK_TIMEOUT, '首包超时')

    if (!res.ok || !res.body) {
      let detail = ''
      try {
        detail = (await res.text()).slice(0, 300)
      } catch {
        // 读错误体失败不阻塞归因
      }
      const hint = res.status === 401 ? 'API Key 无效或未授权' : `HTTP ${res.status}`
      return { ok: false, error: detail ? `${hint}：${detail}` : hint }
    }

    // 消费 SSE：Web ReadableStream + TextDecoder，按空行切事件，半包滞留 buffer
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let got = false

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      armTimer(IDLE_TIMEOUT, '响应超时（30s 无新内容）')
      buffer += decoder.decode(value, { stream: true })
      buffer = buffer.replace(/\r\n/g, '\n')

      // SSE 事件以空行分隔；最后一段可能是不完整事件，留在 buffer
      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''
      for (const event of events) {
        for (const line of event.split('\n')) {
          if (!line.startsWith('data:')) continue
          const data = line.slice(5).trim()
          if (!data) continue
          if (data === '[DONE]') {
            // 提前中止请求释放底层连接，避免流结束后 socket 悬挂到空闲超时
            controller.abort()
            return { ok: true }
          }
          try {
            const json = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string } }>
            }
            const delta = json.choices?.[0]?.delta?.content
            if (delta) {
              got = true
              onChunk(delta)
            }
          } catch {
            // 心跳/非 JSON 行忽略
          }
        }
      }
    }
    return { ok: got }
  } catch (err) {
    if (controller.signal.aborted) {
      return { ok: false, error: timeoutReason || '已中止', aborted: !timeoutReason }
    }
    return { ok: false, error: (err as Error).message }
  } finally {
    if (idleTimer) clearTimeout(idleTimer)
    inflight.delete(requestId)
  }
}
