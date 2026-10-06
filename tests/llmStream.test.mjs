import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import { runChatStream } from '../src/main/llm.ts'

async function startServer(handler) {
  const server = createServer(handler)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  return { server, baseUrl: `http://127.0.0.1:${address.port}/v1` }
}

async function closeServer(server) {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve(undefined)))
  )
}

test('preserves the selected model, decodes split UTF-8 chunks, and requires [DONE]', async () => {
  let requestBody = ''
  const { server, baseUrl } = await startServer((request, response) => {
    request.setEncoding('utf8')
    request.on('data', (chunk) => { requestBody += chunk })
    request.on('end', () => {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      const event = Buffer.from(': keepalive\r\n\r\ndata: {"choices":[\r\ndata: {"delta":{"content":"你好"}}]}\r\n\r\ndata: [DONE]\r\n\r\n')
      const lineBreak = event.indexOf(Buffer.from('data: {"choices":')) + Buffer.byteLength('data: {"choices":') + 1
      const splitUtf8 = event.indexOf(Buffer.from('你')) + 1
      response.write(event.subarray(0, lineBreak))
      response.write(event.subarray(lineBreak, splitUtf8))
      response.end(event.subarray(splitUtf8))
    })
  })
  const chunks = []

  try {
    const result = await runChatStream({
      payload: {
        requestId: 'selected-model-test',
        messages: [{
          role: 'user',
          content: 'review',
          fileAttachments: [{ name: 'secret.txt', path: '/private/secret.txt' }]
        }],
        baseUrl,
        model: 'selected-model'
      },
      apiKey: 'test-key',
      onChunk: (chunk) => chunks.push(chunk)
    })

    assert.deepEqual(result, { ok: true })
    assert.deepEqual(chunks, ['你好'])
    const body = JSON.parse(requestBody)
    assert.equal(body.model, 'selected-model')
    assert.equal(body.messages[0].content, 'review')
    assert.equal(JSON.stringify(body).includes('/private/secret.txt'), false)
  } finally {
    await closeServer(server)
  }
})

test('reports a truncated final SSE event and EOF without [DONE] as failures', async () => {
  const { server, baseUrl } = await startServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    response.end('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n')
  })

  try {
    const result = await runChatStream({
      payload: {
        requestId: 'eof-test',
        messages: [{ role: 'user', content: 'hello' }],
        baseUrl,
        model: 'test-model'
      },
      apiKey: 'test-key',
      onChunk: () => {}
    })
    assert.equal(result.ok, false)
    assert.match(result.error, /缺少 \[DONE\]/)
  } finally {
    await closeServer(server)
  }

  const partial = await startServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    response.end('data: {"choices":[{"delta":{"content":"unfinished"}}]}')
  })
  try {
    const result = await runChatStream({
      payload: {
        requestId: 'partial-event-test',
        messages: [{ role: 'user', content: 'hello' }],
        baseUrl: partial.baseUrl,
        model: 'test-model'
      },
      apiKey: 'test-key',
      onChunk: () => {}
    })
    assert.equal(result.ok, false)
    assert.match(result.error, /事件结束前关闭/)
  } finally {
    await closeServer(partial.server)
  }
})

test('returns HTTP authentication errors with the response detail', async () => {
  const { server, baseUrl } = await startServer((_request, response) => {
    response.writeHead(401, { 'Content-Type': 'application/json' })
    response.end('{"error":"invalid key"}')
  })

  try {
    const result = await runChatStream({
      payload: {
        requestId: 'http-error-test',
        messages: [{ role: 'user', content: 'hello' }],
        baseUrl,
        model: 'test-model'
      },
      apiKey: 'test-key',
      onChunk: () => {}
    })
    assert.equal(result.ok, false)
    assert.match(result.error, /API Key 无效或未授权/)
    assert.match(result.error, /invalid key/)
  } finally {
    await closeServer(server)
  }
})

test('user cancellation while waiting for response headers settles cleanly', async () => {
  const { abortChat, runChatStream } = await import('../src/main/llm.ts')
  const { server, baseUrl } = await startServer(() => {})

  try {
    const pending = runChatStream({
      payload: {
        requestId: 'header-cancel-test',
        messages: [{ role: 'user', content: 'hello' }],
        baseUrl,
        model: 'test-model'
      },
      apiKey: 'test-key',
      onChunk: () => {}
    })

    test('times out when the server never sends response headers', async () => {
      const originalFetch = globalThis.fetch
      globalThis.fetch = (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('The operation was aborted', 'AbortError')),
            { once: true }
          )
        })

      try {
        const result = await runChatStream({
          payload: {
            requestId: 'header-timeout-test',
            messages: [{ role: 'user', content: 'hello' }],
            baseUrl: 'https://api.example.test/v1',
            model: 'test-model'
          },
          apiKey: 'test-key',
          onChunk: () => {},
          timeoutMs: 10
        })
        assert.equal(result.ok, false)
        assert.match(result.error, /首包超时/)
        assert.equal(result.aborted, false)
      } finally {
        globalThis.fetch = originalFetch
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    abortChat('header-cancel-test')
    assert.deepEqual(await pending, { ok: false, error: '已中止', aborted: true })
  } finally {
    server.closeAllConnections()
    await closeServer(server)
  }
})
