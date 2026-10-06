import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import { runChatStream } from '../src/main/llm.ts'

test('sends the API Key only in the Authorization header', async () => {
  let authorization = ''
  let requestBody = ''
  const server = createServer((request, response) => {
    authorization = request.headers.authorization ?? ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => { requestBody += chunk })
    request.on('end', () => {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      response.end('data: [DONE]\n\n')
    })
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const secret = 'test-api-key-do-not-persist'

  try {
    const result = await runChatStream({
      payload: {
        requestId: 'credential-test',
        messages: [{ role: 'user', content: 'hello' }],
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        model: 'test-model'
      },
      apiKey: secret,
      onChunk: () => {}
    })

    assert.deepEqual(result, { ok: true })
    assert.equal(authorization, `Bearer ${secret}`)
    assert.equal(requestBody.includes(secret), false)
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve(undefined)))
    )
  }
})