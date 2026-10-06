import { open } from 'fs/promises'

export async function readFileBounded(path: string, maxBytes: number): Promise<Buffer> {
  const file = await open(path, 'r')
  try {
    const buffer = Buffer.allocUnsafe(maxBytes + 1)
    let bytesRead = 0
    while (bytesRead < buffer.length) {
      const result = await file.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead)
      if (result.bytesRead === 0) break
      bytesRead += result.bytesRead
    }
    if (bytesRead > maxBytes) throw new Error(`文件过大，超过 ${maxBytes} 字节限制`)
    return buffer.subarray(0, bytesRead)
  } finally {
    await file.close()
  }
}
