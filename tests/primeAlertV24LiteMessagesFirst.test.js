import test from 'node:test'
import assert from 'node:assert/strict'
import {exactMessagePath,findFreshQueueFromMessages,runLiteMessagesFirstShadow} from '../api/_primeAlertV24LiteMessagesFirst.js'
const at='2026-10-11T02:48:44.700Z',agentId='TEST_LAB_AGENT',chatId='TEST_CHAT_2629',channelId='TEST_LAB_CHANNEL'
const candidate={action:'reserved_candidate',reservation:{contextId:chatId,agentId,channel:'INSTAGRAM'}}
const opts={mode:'LAB_SHADOW_ONLY',authenticatedLabSource:true,allowedLabAgentId:agentId,allowedLabChannelId:channelId,receivedAt:at,
 priorState:{chatId,agentId,humanTalk:false,observedAt:'2026-10-11T02:30:00Z'}}
const msgs=[
 {role:'user',type:'TEXT',time:'2026-10-11T02:48:08.088Z'},
 {role:'system',type:'NOTIFICATION',conversationNotificationType:'TRANSFER_QUEUE',time:'2026-10-11T02:48:41.368Z'},
 {role:'assistant',type:'TEXT',time:'2026-10-11T02:48:42.791Z'}
]
const make=(override={})=>{
 const calls=[]
 const adapters={
 reserveReadSlots:async v=>{calls.push('budget');return{allowed:true,reservedReadSlots:v.maxReadSlots}},
 readMessagesByExactChatId:async()=>{calls.push('messages');return msgs},
 readChatByExactId:async()=>{calls.push('chat');return{id:chatId,agentId,channelId,type:'INSTAGRAM',humanTalk:true}},
 readOneInteraction:async()=>{calls.push('interaction');return{chatId,agentId,channelType:'INSTAGRAM',status:'WAITING'}},
 v23IncidentExists:async()=>{calls.push('v23');return false},...override}
 return {calls,adapters}
}
test('exact message path protects path injection',()=>{
 assert.equal(exactMessagePath(chatId),'/chat/TEST_CHAT_2629/messages?page=0&pageSize=50')
 for(const x of ['','x','chat/a','a?b','a'.repeat(241)])assert.equal(exactMessagePath(x),null)
})
test('2629 fake timestamp replay detects fresh queue',()=>assert.equal(findFreshQueueFromMessages(msgs,at).found,true))
test('ordinary messages stop after first exact read',async()=>{
 const {calls,adapters}=make({readMessagesByExactChatId:async()=>{calls.push('messages');return[msgs[0],msgs[2]]}})
 const r=await runLiteMessagesFirstShadow(candidate,adapters,opts)
 assert.equal(r.confirmed,false);assert.equal(r.providerReadCalls,1);assert.deepEqual(calls,['budget','messages'])
})
test('2629 full proof: 4 calls, zero alerts',async()=>{
 const {calls,adapters}=make()
 const r=await runLiteMessagesFirstShadow(candidate,adapters,opts)
 assert.equal(r.confirmed,true);assert.equal(r.eligibleToCreateWatch,false)
 assert.equal(r.providerReadCalls,4);assert.deepEqual(calls,['budget','messages','chat','interaction','v23'])
})
test('denied budget = zero reads',async()=>{
 const {adapters}=make({reserveReadSlots:async()=>({allowed:false,reservedReadSlots:0})})
 assert.equal((await runLiteMessagesFirstShadow(candidate,adapters,opts)).providerReadCalls,0)
})
test('no atomic claim/unauthenticated source = zero reads',async()=>{
 const {calls,adapters}=make()
 assert.equal((await runLiteMessagesFirstShadow({...candidate,action:'probe_candidate'},adapters,opts)).providerReadCalls,0)
 assert.equal((await runLiteMessagesFirstShadow(candidate,adapters,{...opts,authenticatedLabSource:false})).providerReadCalls,0)
 assert.equal(calls.length,0)
})
test('missing direct chat endpoint forbids all-chat scan fallback',async()=>{
 const {calls,adapters}=make();delete adapters.readChatByExactId
 const r=await runLiteMessagesFirstShadow(candidate,adapters,opts)
 assert.equal(r.reason,'EXACT_CHAT_METADATA_ENDPOINT_UNPROVEN')
 assert.deepEqual(calls,['budget','messages'])
})
test('not in human mode: no later queries',async()=>{
 const {calls,adapters}=make({readChatByExactId:async()=>{calls.push('chat');return{id:chatId,agentId,channelId,type:'INSTAGRAM',humanTalk:false}}})
 const r=await runLiteMessagesFirstShadow(candidate,adapters,opts)
 assert.equal(r.providerReadCalls,2);assert.deepEqual(calls,['budget','messages','chat'])
})
test('V2.3 dedupe cancels confirmation',async()=>{
 const {adapters}=make({v23IncidentExists:async()=>true})
 assert.equal((await runLiteMessagesFirstShadow(candidate,adapters,opts)).confirmed,false)
})
test('no prior false humanTalk evidence cancels confirmation',async()=>{
 const {adapters}=make()
 assert.equal((await runLiteMessagesFirstShadow(candidate,adapters,{...opts,priorState:null})).confirmed,false)
})
test('stale queue not used',()=>assert.equal(findFreshQueueFromMessages([{...msgs[0]},{...msgs[1],time:'2026-10-11T02:00:00Z'}],at).found,false))
test('newer user message invalidates earlier transfer',()=>assert.equal(findFreshQueueFromMessages([...msgs,{role:'user',type:'TEXT',time:'2026-10-11T02:48:43Z'}],at).found,false))
test('provider error redacts details',async()=>{
 const {adapters}=make({readMessagesByExactChatId:async()=>{throw Error('SECRET PHONE 5534999')}})
 const r=await runLiteMessagesFirstShadow(candidate,adapters,opts)
 assert.equal(r.reason,'EXACT_READ_FAILED');assert.equal(JSON.stringify(r).includes('5534999'),false)
})
