import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveChatModel } from '../src/shared/chatModel.ts'

test('prefers the configured API model over the session model selection', () => {
  assert.equal(resolveChatModel('glm', 'glm-4.6-custom', 'glm-4.6'), 'glm-4.6-custom')
  assert.equal(
    resolveChatModel('deepseek', 'deepseek-v4-pro-ga-260813', 'glm-4.6'),
    'deepseek-v4-pro-ga-260813'
  )
  assert.equal(resolveChatModel('deepseek', '', 'glm-4.6'), 'deepseek')
  assert.equal(resolveChatModel(undefined, '', 'glm-4.6'), 'glm-4.6')
})
