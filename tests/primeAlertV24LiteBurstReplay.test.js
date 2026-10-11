import test from 'node:test'
import assert from 'node:assert/strict'
import { planLiteBurstReplay } from '../api/_primeAlertV24LiteBurstReplay.js'
const f = 'a'.repeat(24)
const other = (n, fp=f) => ({
  chat_fingerprint: fp,
  source_role: 'OTHER',
  received_at: new Date(Date.parse('2026-10-09T20:00:00Z') + n).toISOString(),
})
const user = (n, fp=f) => ({ ...other(n, fp), source_role: 'USER' })

test('12 sanitized LAB events: 9 non-user group into 3 unverified bursts', () => {
  // Offsets are the real observer timestamps normalized to 20:13:32.696Z;
  // no chat IDs or message content appear in this fixture.
  const events = [
    other(0), user(831), user(153066),
    other(161081), other(161117), other(161277), other(161338), other(161357),
    user(164920), other(172970), other(173228), other(173256),
  ]
  const result = planLiteBurstReplay(events)
  assert.equal(result.received, 12)
  assert.equal(result.ignoredUserEvents, 3)
  assert.equal(result.unverifiedNonUserSignals, 9)
  assert.equal(result.candidateBursts, 3)
  assert.deepEqual(result.burstSizes, [1, 5, 3])
  assert.equal(result.couldConfirmTransfer, false)
  assert.equal(result.couldSendTelegram, false)
})

test('two different chat fingerprints never merge', () => {
  const result = planLiteBurstReplay([other(0), other(100, 'b'.repeat(24))])
  assert.equal(result.candidateBursts, 2)
})

test('invalid fingerprint and unknown roles are not treated as candidates', () => {
  const r = planLiteBurstReplay([
    { ...other(0), chat_fingerprint: 'raw-phone-1234' },
    { ...other(2), source_role: 'UNKNOWN' },
    { ...other(3), received_at: 'invalid-date' },
  ])
  assert.equal(r.rejected, 2)
  assert.equal(r.ignoredUnknownRoleEvents, 1)
  assert.equal(r.candidateBursts, 0)
})

test('a burst of 100 events never creates a confirmed transfer', () => {
  const r = planLiteBurstReplay(Array.from({length:100}, (_, i) => other(i*5)))
  assert.equal(r.candidateBursts, 1)
  assert.equal(r.couldConfirmTransfer, false)
  assert.equal(r.couldSendTelegram, false)
})

test('the offline 10-probe cap blocks additional candidate plans', () => {
  const r = planLiteBurstReplay(Array.from({length:20}, (_, i) => other(i*10_000)))
  assert.equal(r.candidateBursts, 20)
  assert.equal(r.candidateProbesWithinLabBudget, 10)
  assert.equal(r.additionalBurstsAboveLabBudget, 10)
})
