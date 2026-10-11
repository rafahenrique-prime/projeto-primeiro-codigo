import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyLiteSignal, verifiedTransferEligible } from '../api/_primeAlertV24LitePolicy.js'
import { gateLiteSignal, liteChatDigest } from '../api/_primeAlertV24LiteLease.js'

const base = { contextId:'fake-chat',messageId:'fake-msg',channel:'WHATSAPP',role:'tool',
  agentId:'fake-official',conversationNotificationType:'TRANSFER_QUEUE' }
const opts = { trustedSource:true, officialAgentId:'fake-official', hmacSecret:'h'.repeat(48) }

test('untrusted events are dropped', () =>
  assert.equal(classifyLiteSignal(base, {}).reason, 'UNTRUSTED_SOURCE'))
test('missing official agent identity fails closed', () =>
  assert.equal(classifyLiteSignal(base,{trustedSource:true}).reason,'OFFICIAL_AGENT_NOT_CONFIGURED'))
test('unknown source-agent fails closed', () =>
  assert.equal(classifyLiteSignal({...base,agentId:'someone-else'},opts).reason,'AGENT_NOT_ALLOWED'))
test('user event never triggers a fast handoff', () =>
  assert.equal(classifyLiteSignal({...base,role:'user'},opts).action,'ignore'))
test('wrong notification type is not a transfer', () =>
  assert.equal(classifyLiteSignal({...base,conversationNotificationType:'START_INTERACTION_HUMAN'},opts).action,'ignore'))
test('role alone cannot initiate a read in conservative mode', () =>
  assert.equal(classifyLiteSignal({...base,conversationNotificationType:undefined},opts).reason,'EXPLICIT_TRANSFER_SIGNAL_MISSING'))
test('LAB shadow may classify a missing-type non-user event, but not prove transfer', () => {
  const candidate=classifyLiteSignal({...base,conversationNotificationType:undefined},{...opts,mode:'lab_shadow'})
  assert.equal(candidate.action,'probe_candidate')
  assert.equal(verifiedTransferEligible({previousHumanTalk:false,currentHumanTalk:true}),false)
})
test('explicit TRANSFER_QUEUE becomes only a candidate, no alert', () =>
  assert.equal(classifyLiteSignal(base,opts).action,'probe_candidate'))
test('invalid channel is rejected',()=>
  assert.equal(classifyLiteSignal({...base,channel:'EMAIL'},opts).action,'ignore'))
test('HMAC is deterministic and separated by agent/channel/chat', () => {
  const identity={contextId:'fake-chat',agentId:'fake-official',channel:'WHATSAPP'}
  const first=liteChatDigest(identity,opts.hmacSecret)
  assert.match(first,/^[a-f0-9]{64}$/)
  assert.equal(first,liteChatDigest(identity,opts.hmacSecret))
  assert.notEqual(first,liteChatDigest({...identity,contextId:'fake-other'},opts.hmacSecret))
  assert.notEqual(first,liteChatDigest({...identity,channel:'INSTAGRAM'},opts.hmacSecret))
})
test('without DB adapter, no candidate is authorized', async () =>
  assert.equal((await gateLiteSignal(base,opts)).reason,'ATOMIC_RESERVATION_NOT_CONFIGURED'))
test('when DB RPC fails, gate fails closed', async () =>
  assert.equal((await gateLiteSignal(base,opts,async()=>{throw Error('db offline')})).reason,'RESERVATION_UNAVAILABLE'))
test('DB rejects an exhausted daily quota', async () =>
  assert.equal((await gateLiteSignal(base,opts,async()=>({accepted:false,reason:'DAILY_CAP'}))).reason,'DAILY_CAP'))
test('simulated parallel requests need single atomic claim', async () => {
  let claimed=false, allowed=0
  const dbClaim=async()=> { if(claimed)return {accepted:false,reason:'DUPLICATE_OR_COOLDOWN'};
    claimed=true; allowed++;return {accepted:true} }
  const out=await Promise.all(Array.from({length:60},()=>gateLiteSignal(base,opts,dbClaim)))
  assert.equal(out.filter(x=>x.action==='reserved_candidate').length,1)
  assert.equal(allowed,1)
})
test('verified fast alert requires fresh queue, transition and no V2.3 incident', () => {
  const valid={previousHumanTalk:false,currentHumanTalk:true,freshTransferQueue:true,
    clientMessageId:'synthetic-user-msg',existingPendingIncident:false}
  assert.equal(verifiedTransferEligible(valid),true)
  for(const wrong of [{previousHumanTalk:true},{currentHumanTalk:false},{freshTransferQueue:false},
    {clientMessageId:null},{existingPendingIncident:true},{existingPendingIncident:undefined}])
    assert.equal(verifiedTransferEligible({...valid,...wrong}),false)
})
