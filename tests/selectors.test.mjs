import assert from 'node:assert/strict'
import test from 'node:test'
import {
  selectActiveSession,
  selectSessionSummaries
} from '../src/renderer/src/store/selectors.ts'

test('updates to inactive sessions retain the active-session selector result', () => {
  const active = { id: 'active', messages: [] }
  const inactive = { id: 'inactive', messages: [] }
  const before = { activeId: 'active', sessions: [active, inactive] }
  const after = { activeId: 'active', sessions: [active, { ...inactive, title: 'changed' }] }

  assert.strictEqual(selectActiveSession(before), active)
  assert.strictEqual(selectActiveSession(after), active)
})

test('sidebar session summaries stay referentially stable during message streaming', () => {
  const message = { id: 'reply', content: 'a' }
  const session = {
    id: 'active',
    title: 'Conversation',
    updatedAt: 10,
    workspace: undefined,
    mode: 'agent',
    status: 'running',
    messages: [message]
  }
  const first = selectSessionSummaries({ sessions: [session] })
  const streamed = selectSessionSummaries({
    sessions: [{ ...session, messages: [{ ...message, content: 'a longer reply' }] }]
  })
  assert.strictEqual(streamed, first)

  const finished = selectSessionSummaries({
    sessions: [{ ...session, status: 'idle', messages: [message] }]
  })
  assert.notStrictEqual(finished, first)
})
