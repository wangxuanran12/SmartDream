import type {
  ChatMessage,
  ModelChatStreamPayload,
  ChatStreamResult
} from '../shared/types'

const FIRST_CHUNK_TIMEOUT = 30_000
const IDLE_TIMEOUT = 30_000
const inflight = new Map<string, AbortController>()

export function abortChat(requestId: string): void {
  inflight.get(requestId)?.abort()
}

interface RunChatStreamArgs {
  payload: ModelChatStreamPayload
  apiKey: string
  onChunk: (delta: string) => void
  timeoutMs?: number
}

function consumeEvent(event: string, onChunk: (delta: string) => void): {
  done: boolean
  error?: string
} {
  const data = event
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''))
    .join('\n')
  if (!data) return { done: false }
  if (data.trim() === '[DONE]') return { done: true }

  let json: { choices?: Array<{ delta?: { content?: string } }> }
  try {
    json = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> }
  } catch {
    return { done: false, error: '响应流包含无效的 SSE 数据' }
  }
  const delta = json.choices?.[0]?.delta?.content
  if (typeof delta === 'string' && delta) onChunk(delta)
  return { done: false }
}

function normalizeLineEndings(buffer: string, final = false): string {
  const normalized = buffer.replace(/\r\n/g, '\n')
  return final ? normalized.replace(/\r/g, '\n') : normalized.replace(/\r(?!$)/g, '\n')
}

export async function runChatStream({
  payload,
  apiKey,
  onChunk,
  timeoutMs
}: RunChatStreamArgs): Promise<ChatStreamResult> {
  const { requestId, messages, baseUrl, model } = payload
  if (inflight.has(requestId)) return { ok: false, error: '请求 ID 已在使用' }

  const controller = new AbortController()
  inflight.set(requestId, controller)
  let timer: ReturnType<typeof setTimeout> | null = null
  let timeoutReason = ''
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined

  const armTimer = (ms: number, reason: string): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timeoutReason = reason
      controller.abort()
    }, ms)
  }

  try {
    armTimer(
      timeoutMs ?? FIRST_CHUNK_TIMEOUT,
      '首包超时（连接或等待首段响应超过 30 秒）'
    )
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: messages.map(({ role, content }): ChatMessage => ({ role, content })),
        stream: true
      }),
      signal: controller.signal
    })

    if (!res.ok || !res.body) {
      if (res.ok && !res.body) return { ok: false, error: '模型响应缺少响应体' }
      let detail = ''
      try {
        detail = (await res.text()).slice(0, 300)
      } catch (error) {
        if (controller.signal.aborted) {
          return {
            ok: false,
            error: timeoutReason || '已中止',
            aborted: !timeoutReason
          }
        }
        console.warn('[SmartDream] 读取模型错误响应失败:', error)
      }
      const hint = res.status === 401 ? 'API Key 无效或未授权' : `HTTP ${res.status}`
      return { ok: false, error: detail ? `${hint}：${detail}` : hint }
    }

    reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let gotContent = false

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value?.length) continue
      armTimer(timeoutMs ?? IDLE_TIMEOUT, '响应超时（30 秒无新流数据）')
      buffer += decoder.decode(value, { stream: true })
      buffer = normalizeLineEndings(buffer)

      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''
      for (const event of events) {
        const result = consumeEvent(event, (delta) => {
          gotContent = true
          onChunk(delta)
        })
        if (result.error) return { ok: false, error: result.error }
        if (result.done) return { ok: true }
      }
    }

    buffer += decoder.decode()
    buffer = normalizeLineEndings(buffer, true)
    if (buffer.trim()) {
      return { ok: false, error: '响应流在 SSE 事件结束前关闭' }
    }
    return {
      ok: false,
      error: gotContent ? '响应流意外结束（缺少 [DONE]）' : '响应流意外结束（未收到 [DONE]）'
    }
  } catch (err) {
    if (controller.signal.aborted) {
      return { ok: false, error: timeoutReason || '已中止', aborted: !timeoutReason }
    }
    return { ok: false, error: (err as Error).message }
  } finally {
    if (timer) clearTimeout(timer)
    if (reader) {
      void reader.cancel().catch((error: unknown) => {
        console.warn('[SmartDream] 关闭模型响应流失败:', error)
      })
    }
    if (inflight.get(requestId) === controller) inflight.delete(requestId)
  }
}
