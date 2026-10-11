import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyLiteSignal, verifiedTransferEligible } from '../api/_primeAlertV24LitePolicy.js'

const event = { contextId: 'synthetic-chat', messageId: 'synthetic-message',
  agentId: 'synthetic-agent', role: 'system', channel: 'WHATSAPP',
  conversationNotificationType: 'TRANSFER_QUEUE' }
const opts = { trustedSource: true, officialAgentId: 'synthetic-agent' }

test('policy rejects unauthenticated source', () => {
  assert.equal(classifyLiteSignal(event).reason, 'UNTRUSTED_SOURCE')
})
test('policy accepts an authenticated explicit transfer only as candidate', () => {
  const c = classifyLiteSignal(event, opts)
  assert.equal(c.action, 'probe_candidate')
  assert.equal(c.reason, 'EXPLICIT_TRANSFER_SIGNAL')
})
test('policy rejects unidentified notifications in conservative mode', () => {
  const c = classifyLiteSignal({ ...event, conversationNotificationType: undefined }, opts)
  assert.equal(c.action, 'ignore')
  assert.equal(c.reason, 'EXPLICIT_TRANSFER_SIGNAL_MISSING')
})
test('policy LAB shadow never proves a transfer', () => {
  const c = classifyLiteSignal({ ...event, conversationNotificationType: undefined },
    { ...opts, mode: 'lab_shadow' })
  assert.equal(c.action, 'probe_candidate')
  assert.equal(verifiedTransferEligible({ previousHumanTalk: false, currentHumanTalk: true }), false)
})
test('policy rejects user role and unrelated notifications', () => {
  assert.equal(classifyLiteSignal({ ...event, role: 'user' }, opts).action, 'ignore')
  assert.equal(classifyLiteSignal({ ...event, conversationNotificationType: 'START_INTERACTION_HUMAN' }, opts).action, 'ignore')
})
test('policy final transfer confirmation requires absence of V2.3 incident', () => {
  const good = { previousHumanTalk: false, currentHumanTalk: true,
    freshTransferQueue: true, clientMessageId: 'synthetic-user',
    existingPendingIncident: false }
  assert.equal(verifiedTransferEligible(good), true)
  assert.equal(verifiedTransferEligible({ ...good, existingPendingIncident: true }), false)
  assert.equal(verifiedTransferEligible({ ...good, freshTransferQueue: false }), false)
})
