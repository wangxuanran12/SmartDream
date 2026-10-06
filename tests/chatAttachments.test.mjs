import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { resolveChatAttachments } from '../src/main/chatAttachments.ts'
import { FileAuthorization } from '../src/main/fileAuthorization.ts'
import { readFileBounded } from '../src/main/fileIO.ts'
import { MAX_CHAT_ATTACHMENT_BYTES, MAX_CHAT_ATTACHMENTS_TOTAL_BYTES } from '../src/shared/chatLimits.ts'

async function createFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'smartdream-chat-attachments-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const workspace = join(root, 'workspace')
  await mkdir(workspace)
  const authorization = new FileAuthorization()
  await authorization.authorizeDirectory(workspace)
  return { root, workspace, authorization }
}

function resolve(messages, authorization) {
  return resolveChatAttachments(
    messages,
    (path) => authorization.resolveAuthorizedPath(path, 'read'),
    () => 'text',
    {
      maxFileBytes: MAX_CHAT_ATTACHMENT_BYTES,
      maxTotalBytes: MAX_CHAT_ATTACHMENTS_TOTAL_BYTES
    },
    readFileBounded
  )
}

test('includes authorized text contents without forwarding local paths', async (t) => {
  const fixture = await createFixture(t)
  const file = join(fixture.workspace, 'notes.txt')
  await writeFile(file, 'unique attachment marker')
  const result = await resolve(
    [{ role: 'user', content: 'Review this', fileAttachments: [{ name: 'notes.txt', path: file }] }],
    fixture.authorization
  )

  assert.equal(result.ok, true)
  assert.match(result.messages[0].content, /unique attachment marker/)
  assert.equal(JSON.stringify(result.messages).includes(file), false)
})

test('rejects unauthorized, unsupported and oversized attachments explicitly', async (t) => {
  const fixture = await createFixture(t)
  const unauthorized = join(fixture.root, 'secret.txt')
  const unsupported = join(fixture.workspace, 'image.png')
  const oversized = join(fixture.workspace, 'large.txt')
  await Promise.all([
    writeFile(unauthorized, 'secret'),
    writeFile(unsupported, 'not an image'),
    writeFile(oversized, 'x'.repeat(MAX_CHAT_ATTACHMENT_BYTES + 1))
  ])

  const unauthorizedResult = await resolve(
    [{ role: 'user', content: '', fileAttachments: [{ name: 'secret.txt', path: unauthorized }] }],
    fixture.authorization
  )
  const unsupportedResult = await resolve(
    [{ role: 'user', content: '', fileAttachments: [{ name: 'image.png', path: unsupported }] }],
    fixture.authorization
  )
  const oversizedResult = await resolve(
    [{ role: 'user', content: '', fileAttachments: [{ name: 'large.txt', path: oversized }] }],
    fixture.authorization
  )

  assert.equal(unauthorizedResult.ok, false)
  assert.equal(unauthorizedResult.result.failureType, 'attachment')
  assert.match(unsupportedResult.result.error, /不支持/)
  assert.match(oversizedResult.result.error, /1 MiB/)
})

test('enforces the total attachment size limit', async (t) => {
  const fixture = await createFixture(t)
  const attachments = []
  for (let index = 0; index < 5; index++) {
    const name = `file-${index}.txt`
    const path = join(fixture.workspace, name)
    await writeFile(path, 'x'.repeat(MAX_CHAT_ATTACHMENT_BYTES))
    attachments.push({ name, path })
  }

  const result = await resolve(
    [{ role: 'user', content: '', fileAttachments: attachments }],
    fixture.authorization
  )
  assert.equal(result.ok, false)
  assert.equal(result.result.error, '本次附件总大小超过 4 MiB 上限')
  assert.equal(result.result.failureType, 'attachment')
})
