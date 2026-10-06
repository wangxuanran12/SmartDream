import { stat } from 'fs/promises'
import { basename, extname } from 'path'
import type { ChatMessage, ChatStreamResult } from '../shared/types'

const TEXT_EXTENSIONS = new Set([
  '.c', '.cc', '.cpp', '.css', '.csv', '.go', '.h', '.html', '.java', '.js', '.jsx',
  '.json', '.md', '.mjs', '.py', '.rs', '.sh', '.sql', '.svg', '.toml', '.ts', '.tsx',
  '.txt', '.xml', '.yaml', '.yml'
])

type AttachmentResolution =
  | { ok: true; messages: ChatMessage[] }
  | { ok: false; result: ChatStreamResult }

function failure(error: string): AttachmentResolution {
  return { ok: false, result: { ok: false, error, failureType: 'attachment' } }
}

export async function resolveChatAttachments(
  inputMessages: ChatMessage[],
  resolveAuthorizedPath: (path: string) => Promise<string>,
  languageFromPath: (path: string) => string,
  limits: { maxFileBytes: number; maxTotalBytes: number },
  readBounded: (path: string, maxBytes: number) => Promise<Buffer>
): Promise<AttachmentResolution> {
  const messages = inputMessages.map(({ role, content }) => ({ role, content }))
  const latestUserIndex = inputMessages.reduce(
    (latest, message, index) => (message.role === 'user' ? index : latest),
    -1
  )
  if (latestUserIndex < 0) return { ok: true, messages }

  const attachments = inputMessages[latestUserIndex].fileAttachments ?? []
  let totalBytes = 0
  for (const attachment of attachments) {
    if (
      !attachment ||
      typeof attachment.path !== 'string' ||
      typeof attachment.name !== 'string'
    ) {
      return failure('附件信息无效，文件未发送')
    }

    let canonical: string
    try {
      canonical = await resolveAuthorizedPath(attachment.path)
    } catch {
      return failure(
        `附件“${basename(attachment.name)}”未发送：文件未授权、已移动或无法读取`
      )
    }

    const name = basename(canonical)
    if (!TEXT_EXTENSIONS.has(extname(canonical).toLowerCase())) {
      return failure(`不支持读取“${name}”的文件类型`)
    }

    try {
      const info = await stat(canonical)
      if (!info.isFile()) return failure(`附件“${name}”不是普通文件`)
      if (info.size > limits.maxFileBytes) {
        return failure(`附件“${name}”超过单文件 1 MiB 上限`)
      }
      totalBytes += info.size
      if (totalBytes > limits.maxTotalBytes) {
        return failure('本次附件总大小超过 4 MiB 上限')
      }

      const content = await readBounded(canonical, limits.maxFileBytes)
      totalBytes += content.byteLength - info.size
      if (totalBytes > limits.maxTotalBytes) {
        return failure('本次附件总大小超过 4 MiB 上限')
      }

      const escapedContent = content.toString('utf8').replace(/```/g, '`\\`\\`')
      messages[latestUserIndex].content +=
        `\n\n[文件附件：${name}]\n\`\`\`${languageFromPath(canonical)}\n` +
        `${escapedContent}\n\`\`\``
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('文件过大')) {
        return failure(`附件“${name}”超过单文件 1 MiB 上限`)
      }
      return failure(`附件“${name}”未发送：读取失败`)
    }
  }
  return { ok: true, messages }
}
