import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateLiteTargetedTransfer, runLiteTargetedShadow } from '../api/_primeAlertV24LiteTargetedProof.js'

const agentId='TEST_LAB_AGENT',channelId='TEST_LAB_CHANNEL',chatId='TEST_CHAT_2629'
const receivedAt='2026-10-11T02:48:44.700Z'
const event={agentId,channelId,chatId,channel:'INSTAGRAM',receivedAt}
const chat={id:chatId,agentId,channelId,type:'INSTAGRAM',humanTalk:true}
const interaction={agentId,chatId,channelType:'INSTAGRAM',status:'WAITING'}
const messages=[
 {role:'system',type:'NOTIFICATION',conversationNotificationType:'START_INTERACTION_AGENT',time:'2026-10-11T02:48:07.119Z'},
 {role:'user',type:'TEXT',time:'2026-10-11T02:48:08.088Z'},
 {role:'system',type:'NOTIFICATION',conversationNotificationType:'TRANSFER_QUEUE',time:'2026-10-11T02:48:41.368Z'},
 {role:'assistant',type:'TEXT',time:'2026-10-11T02:48:42.791Z'}]
const priorState={chatId,agentId,humanTalk:false,observedAt:'2026-10-11T02:33:00.000Z'}
const snap=(changes={})=>({event,chat,interaction,messages,priorState,v23IncidentPresent:false,...changes})
const opts={allowedLabAgentId:agentId,allowedLabChannelId:channelId}

test('2629 timestamp-shaped real-history replay verifies only in shadow mode',()=>{
 const r=evaluateLiteTargetedTransfer(snap(),opts)
 assert.equal(r.confirmed,true);assert.equal(r.transitionObserved,true)
 assert.equal(r.eligibleToCreateWatch,false)
 assert.equal(r.reason,'SHADOW_TRANSFER_PROVEN')
 assert.equal(r.freshnessMs,3332)
 assert.equal(JSON.stringify(r).includes(chatId),false)
})
test('humanTalk true alone never proves a transfer',()=>{
 assert.equal(evaluateLiteTargetedTransfer(snap({messages:messages.filter(m=>m.conversationNotificationType!=='TRANSFER_QUEUE')}),opts).reason,'FRESH_TRANSFER_QUEUE_NOT_FOUND')
})
test('humanTalk false is not transferred',()=>{
 assert.equal(evaluateLiteTargetedTransfer(snap({chat:{...chat,humanTalk:false}}),opts).reason,'NOT_WAITING_FOR_HUMAN')
})
test('a resolved interaction is not awaiting human',()=>{
 assert.equal(evaluateLiteTargetedTransfer(snap({interaction:{...interaction,status:'RESOLVED'}}),opts).confirmed,false)
})
test('old queue event cannot approve a new client message',()=>{
 const x=[messages[0],messages[2],{role:'user',type:'TEXT',time:'2026-10-11T02:48:43Z'}]
 assert.equal(evaluateLiteTargetedTransfer(snap({messages:x}),opts).reason,'FRESH_TRANSFER_QUEUE_NOT_FOUND')
})
test('old transfer queue beyond time window is blocked',()=>{
 const x=messages.map(m=>m.conversationNotificationType==='TRANSFER_QUEUE'?{...m,time:'2026-10-11T02:40:00.000Z'}:m)
 assert.equal(evaluateLiteTargetedTransfer(snap({messages:x}),opts).confirmed,false)
})
test('non matching agent, chat, channel or interactions fail closed',()=>{
 const bad=[
 snap({event:{...event,channelId:'OTHER_CHANNEL'}}),snap({chat:{...chat,id:'OTHER_CHAT'}}),
 snap({interaction:{...interaction,chatId:'OTHER_CHAT'}}),snap({event:{...event,agentId:'OTHER_AGENT'}}),
 snap({event:{...event,channel:'API'}})]
 for(const x of bad)assert.equal(evaluateLiteTargetedTransfer(x,opts).confirmed,false)
})
test('cannot pass unless V2.3 deduplication is explicitly false',()=>{
 for(const v of [true,undefined,null])
  assert.equal(evaluateLiteTargetedTransfer(snap({v23IncidentPresent:v}),opts).reason,'V23_DEDUPE_NOT_PROVEN')
})
test('missing baseline still detects history but cannot authorize alert',()=>{
 const r=evaluateLiteTargetedTransfer(snap({priorState:null}),opts)
 assert.equal(r.confirmed,true);assert.equal(r.transitionObserved,false)
 assert.equal(r.eligibleToCreateWatch,false)
})
test('missing source or oversized message lists fail closed',()=>{
 assert.equal(evaluateLiteTargetedTransfer(snap({event:{...event,receivedAt:'???'}}),opts).confirmed,false)
 assert.equal(evaluateLiteTargetedTransfer(snap({messages:Array(101).fill(messages[0])}),opts).confirmed,false)
})
const candidate={action:'reserved_candidate',reservation:{contextId:chatId,agentId,channel:'INSTAGRAM'}}
const defaultRead=()=>({
 readOneChat:async()=>chat,
 readRecentMessages:async()=>messages,
 readOneInteraction:async()=>interaction,
 v23IncidentExists:async()=>false})
const run=(c=candidate,adapters=defaultRead(),ext={})=>runLiteTargetedShadow(c,adapters,{...opts,mode:'LAB_SHADOW_ONLY',receivedAt,priorState,...ext})
test('not yet reserved = NO provider calls',async()=>{
 let calls=0;const a={readOneChat:async()=>{calls++;return chat}}
 assert.equal((await run({action:'probe_candidate',reservation:candidate.reservation},a)).reason,'LAB_RESERVED_CANDIDATE_REQUIRED')
 assert.equal(calls,0)
})
test('outside LAB shadow mode = NO provider calls',async()=>{
 let calls=0;const a={...defaultRead(),readOneChat:async()=>{calls++;return chat}}
 assert.equal((await run(candidate,a,{mode:'production'})).reason,'LAB_RESERVED_CANDIDATE_REQUIRED');assert.equal(calls,0)
})
test('one exact chat probe, 1 message query max=50, 1 interaction and 1 V2.3 check',async()=>{
 const calls={chat:0,messages:0,interaction:0,v23:0}
 const a={readOneChat:async id=>{assert.equal(id,chatId);calls.chat++;return chat},
 readRecentMessages:async(id,limit)=>{assert.equal(id,chatId);assert.equal(limit,50);calls.messages++;return messages},
 readOneInteraction:async id=>{assert.equal(id,chatId);calls.interaction++;return interaction},
 v23IncidentExists:async id=>{assert.equal(id,chatId);calls.v23++;return false}}
 let r=await run(candidate,a)
 assert.equal(r.confirmed,true);assert.equal(r.eligibleToCreateWatch,false)
 assert.deepEqual(calls,{chat:1,messages:1,interaction:1,v23:1})
})
test('bad chat scope short-circuits before any message reads',async()=>{
 let messagesCalled=0;let a={...defaultRead(),readOneChat:async()=>({...chat,channelId:'OTHER_CHANNEL'}),readRecentMessages:async()=>{messagesCalled++;return messages}}
 const r=await run(candidate,a)
 assert.equal(r.confirmed,false);assert.equal(messagesCalled,0)
})
test('missing adapters and provider errors fail closed',async()=>{
 assert.equal((await run(candidate,{})).reason,'REQUIRED_ADAPTER_UNAVAILABLE')
 assert.equal((await run(candidate,{...defaultRead(),readOneChat:async()=>{throw Error('secret network details')}})).reason,'TARGETED_READ_FAILED')
})
test('response never leaks message text or secrets',async()=>{
 const fakeMessages=messages.map(m=>({...m,content:'PRIVATE_MSG SECRET_PHONE +55 34 1234'}))
 let result=await run(candidate,{...defaultRead(),readRecentMessages:async()=>fakeMessages})
 assert.equal(result.confirmed,true)
 assert.equal(JSON.stringify(result).includes('PRIVATE_MSG'),false)
})
