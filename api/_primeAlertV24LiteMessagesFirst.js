/**
 * PRIME ALERTA V2.4 LITE V5 - OFFLINE, LAB SHADOW ONLY.
 * No network, database, scheduling or Telegram. All adapters are injected.
 * Never fallback to list-workspaces/chats to find one conversation.
 */
import { evaluateLiteTargetedTransfer } from './_primeAlertV24LiteTargetedProof.js'
const ID=/^[a-zA-Z0-9_-]{6,240}$/
const MAX_READS=4
const failed=(reason,reads=0)=>({mode:'LAB_SHADOW_ONLY',confirmed:false,
 eligibleToCreateWatch:false,reason,providerReadCalls:reads})
const millis=x=>typeof x==='number'&&x>1e12?x:typeof x==='string'&&/^\d{13}$/.test(x)
 ?Number(x):typeof x==='string'?Date.parse(x):NaN

export function exactMessagePath(chatId) {
 return typeof chatId==='string'&&ID.test(chatId)
  ? '/chat/'+encodeURIComponent(chatId)+'/messages?page=0&pageSize=50' : null
}

export function findFreshQueueFromMessages(messages,receivedAt) {
 const now=millis(receivedAt)
 if(!Array.isArray(messages)||messages.length>50||!Number.isFinite(now))
  return {found:false,reason:'INVALID_MESSAGE_WINDOW'}
 let user=-Infinity,queue=-Infinity
 for(const m of messages){
  const t=millis(m?.time)
  if(!Number.isFinite(t)||t>now+5000)continue
  if(m?.role==='user'&&m?.type==='TEXT'&&t>user)user=t
  if(m?.role==='system'&&m?.type==='NOTIFICATION'&&
   m?.conversationNotificationType==='TRANSFER_QUEUE'&&t>queue)queue=t
 }
 if(!Number.isFinite(user)||!Number.isFinite(queue)||queue<user||
  queue>now+5000||now-queue>120000||now-user>300000)
  return {found:false,reason:'FRESH_QUEUE_NOT_FOUND'}
 return {found:true,reason:'FRESH_QUEUE_PRESENT'}
}

/**
 * The injected durable, atomic budget MUST reserve 4 read slots for each
 * already-claimed candidate BEFORE any reads. Adapter contracts must enforce
 * one exact HTTP request per read and never internally scan pages of chats.
 * These properties are not yet verified by a real database/provider test.
 */
export async function runLiteMessagesFirstShadow(candidate,adapters={},opts={}) {
 if(opts.mode!=='LAB_SHADOW_ONLY'||opts.authenticatedLabSource!==true)
  return failed('LAB_SCOPE_REQUIRED')
 const id=candidate?.reservation
 if(candidate?.action!=='reserved_candidate'||!ID.test(id?.contextId||'')||
  id?.agentId!==opts.allowedLabAgentId||id?.channel!=='INSTAGRAM'||
  !ID.test(opts.allowedLabChannelId||''))
  return failed('ATOMIC_CHAT_CLAIM_REQUIRED')
 if(!Number.isFinite(millis(opts.receivedAt)))return failed('INVALID_RECEIVED_AT')
 if(typeof adapters.reserveReadSlots!=='function'||
  typeof adapters.readMessagesByExactChatId!=='function')
  return failed('BUDGET_OR_EXACT_MESSAGES_ADAPTER_MISSING')
 let grant
 try {grant=await adapters.reserveReadSlots({maxReadSlots:MAX_READS})}
 catch{return failed('BUDGET_STORE_UNAVAILABLE')}
 if(grant?.allowed!==true||grant?.reservedReadSlots!==MAX_READS)
  return failed('DAILY_BUDGET_DENIED')
 let reads=0
 const call=async(name,...args)=>{if(reads>=MAX_READS)throw Error('READ_LIMIT')
  reads++;return await adapters[name](...args)}
 try{
  const messages=await call('readMessagesByExactChatId',id.contextId,50)
  const queue=findFreshQueueFromMessages(messages,opts.receivedAt)
  if(!queue.found)return failed(queue.reason,reads)
  if(typeof adapters.readChatByExactId!=='function')
   return failed('EXACT_CHAT_METADATA_ENDPOINT_UNPROVEN',reads)
  const chat=await call('readChatByExactId',id.contextId)
  if(chat?.id!==id.contextId||chat?.agentId!==opts.allowedLabAgentId||
   chat?.channelId!==opts.allowedLabChannelId||chat?.type!=='INSTAGRAM'||
   chat?.humanTalk!==true)
   return failed('CHAT_NOT_IN_HUMAN_MODE_OR_OUT_OF_SCOPE',reads)
  if(typeof adapters.readOneInteraction!=='function'||
   typeof adapters.v23IncidentExists!=='function')
   return failed('REQUIRED_EXACT_ADAPTER_MISSING',reads)
  const interaction=await call('readOneInteraction',id.contextId)
  const v23=await call('v23IncidentExists',id.contextId)
  const proof=evaluateLiteTargetedTransfer({
    event:{chatId:id.contextId,agentId:id.agentId,
     channelId:opts.allowedLabChannelId,channel:'INSTAGRAM',receivedAt:opts.receivedAt},
    chat,interaction,messages,priorState:opts.priorState,v23IncidentPresent:v23
   },{allowedLabAgentId:opts.allowedLabAgentId,allowedLabChannelId:opts.allowedLabChannelId})
  const confirmed=proof.confirmed===true&&proof.transitionObserved===true
  return {mode:'LAB_SHADOW_ONLY',confirmed,eligibleToCreateWatch:false,
    reason:confirmed?'SHADOW_TRANSFER_VERIFIED':'TRANSITION_OR_INCIDENT_NOT_PROVEN',
    providerReadCalls:reads}
 }catch{return failed('EXACT_READ_FAILED',reads)}
}
