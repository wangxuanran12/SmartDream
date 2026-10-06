import type { Session } from '../types'

export type SessionSummary = Pick<
  Session,
  'id' | 'title' | 'updatedAt' | 'workspace' | 'mode' | 'status'
> & { hasMessages: boolean }

let previousSessions: Session[] | undefined
let previousSummaries: SessionSummary[] = []

export function selectActiveSession(state: {
  sessions: Session[]
  activeId: string
}): Session | undefined {
  return state.sessions.find((session) => session.id === state.activeId)
}

export function selectSessionSummaries(state: { sessions: Session[] }): SessionSummary[] {
  if (state.sessions === previousSessions) return previousSummaries

  const next = state.sessions.map((session) => ({
    id: session.id,
    title: session.title,
    updatedAt: session.updatedAt,
    workspace: session.workspace,
    mode: session.mode,
    status: session.status,
    hasMessages: session.messages.length > 0
  }))
  const unchanged =
    next.length === previousSummaries.length &&
    next.every((summary, index) => {
      const previous = previousSummaries[index]
      return (
        summary.id === previous.id &&
        summary.title === previous.title &&
        summary.updatedAt === previous.updatedAt &&
        summary.workspace === previous.workspace &&
        summary.mode === previous.mode &&
        summary.status === previous.status &&
        summary.hasMessages === previous.hasMessages
      )
    })

  previousSessions = state.sessions
  if (!unchanged) previousSummaries = next
  return previousSummaries
}
