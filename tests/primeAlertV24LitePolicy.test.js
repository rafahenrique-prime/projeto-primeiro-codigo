import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyLiteSignal, verifiedTransferEligible } from '../api/_primeAlertV24LitePolicy.js'

const base = {
  contextId: 'synthetic-chat-A',
  messageId: 'synthetic-message-1',
  role: 'tool',
  channel: 'WHATSAPP',
}
const opts = { nowMs: 100_000, officialAgentId: 'synthetic-official-agent' }

test('tool/assistant are candidate signals, not confirmed transfer', () => {
  const first = classifyLiteSignal(base, {}, opts)
  assert.equal(first.action, 'probe_candidate')
  assert.equal(first.reason, 'NON_USER_STATE_CHANGE_CANDIDATE')
  assert.equal(verifiedTransferEligible({ previousHumanTalk: false, currentHumanTalk: true }), false)
})

test('burst of non-user signals on same chat coalesces', () => {
  const first = classifyLiteSignal(base, {}, opts)
  const repeated = classifyLiteSignal({ ...base, role: 'assistant' },
    first.nextState, { ...opts, nowMs: 100_250 })
  assert.equal(repeated.reason, 'COALESCED_WITH_RECENT_SIGNAL')
})

test('probe can recur after cooldown', () => {
  const first = classifyLiteSignal(base, {}, opts)
  assert.equal(classifyLiteSignal(base, first.nextState,
    { ...opts, nowMs: 121_000 }).action, 'probe_candidate')
})

test('user and invalid role events never cause a probe', () => {
  assert.equal(classifyLiteSignal({ ...base, role: 'user' }, {}, opts).action, 'ignore')
  assert.equal(classifyLiteSignal({ ...base, role: 'customer' }, {}, opts).action, 'ignore')
})

test('wrong channel, missing chat, wrong official agent are blocked', () => {
  assert.equal(classifyLiteSignal({ ...base, channel: 'EMAIL' }, {}, opts).action, 'ignore')
  assert.equal(classifyLiteSignal({ ...base, contextId: '' }, {}, opts).action, 'ignore')
  assert.equal(classifyLiteSignal({ ...base, agentId: 'other-agent' }, {}, opts)
    .reason, 'AGENT_NOT_ALLOWED')
})

test('only TRANSFER_QUEUE explicit notifications qualify as candidates', () => {
  assert.equal(classifyLiteSignal({ ...base, notificationType: 'TRANSFER_QUEUE' }, {}, opts)
    .reason, 'EXPLICIT_TRANSFER_SIGNAL')
  assert.equal(classifyLiteSignal({ ...base, notificationType: 'START_INTERACTION_HUMAN' }, {}, opts)
    .action, 'ignore')
})

test('verified transition requires fresh queue, client message, no V2.3 incident', () => {
  const good = { previousHumanTalk: false, currentHumanTalk: true,
    freshTransferQueue: true, clientMessageId: 'synthetic-message',
    existingPendingIncident: false }
  assert.equal(verifiedTransferEligible(good), true)
  assert.equal(verifiedTransferEligible({ ...good, previousHumanTalk: true }), false)
  assert.equal(verifiedTransferEligible({ ...good, freshTransferQueue: false }), false)
  assert.equal(verifiedTransferEligible({ ...good, existingPendingIncident: true }), false)
})
