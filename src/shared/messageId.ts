export function genMessageId(): string {
  return `msg_${globalThis.crypto.randomUUID()}`
}
