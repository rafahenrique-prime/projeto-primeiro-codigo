import {createHmac} from 'node:crypto'

const PILOT_AGENT_ID='3F8F4F4957CAD0DB118EE6F7BEE6FBA9'
const PILOT_CHANNEL_ID='3F32CBBAD3BD8028A2F132532B60D052'
const PILOT_SENDER='raffahenriquee'
const RELAY='https://prime-gptmaker-lab.vercel.app/api/prime-control-story-resolve-v14c'
const MAX_EVENT_AGE_MS=15*60*1000
const MAX_FUTURE_SKEW_MS=2*60*1000
const DEDUPE_TTL_MS=90_000
const recent=new Map()
const MESSAGE_DOMAIN='prime-control:v16b:message-id:\0'
const SENDER_NAME_DOMAIN='prime-control:v16b:sender-name:\0'
const SENDER_ID_DOMAIN='prime-control:v16b:sender-id:\0'
const CHANNEL_DOMAIN='prime-control:v16b:channel-id:\0'

const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{}
const clean=v=>typeof v==='string'?v.trim():''
const at=(root,path)=>{
 let v=root
 for(const part of path.split('.'))v=obj(v)[part]
 return v
}
const uniqueValues=values=>[...new Set(values.map(v=>typeof v==='number'&&Number.isSafeInteger(v)?String(v):clean(v)).filter(Boolean))]
const getValues=(body,paths)=>{
 const root=obj(body),data=obj(root.data),message=obj(root.message||data.message)
 const bases=[root,data,message]
 return uniqueValues(paths.flatMap(path=>bases.map(base=>at(base,path))))
}
const hmac=(value,key,domain)=>value&&key?createHmac('sha256',key).update(domain+value).digest('hex'):null
const normalizeHandle=value=>{
 const s=clean(value).replace(/^@/,'').toLowerCase()
 return /^[a-z0-9._]{1,30}$/.test(s)?s:''
}
const parseTime=value=>{
 if(typeof value==='number'&&Number.isFinite(value)){
  const n=Math.trunc(value)
  return n>0&&n<1e12?n*1000:n
 }
 if(typeof value==='string'&&value.trim()){
  if(/^\d+$/.test(value.trim()))return parseTime(Number(value.trim()))
  const n=Date.parse(value)
  return Number.isFinite(n)?n:null
 }
 return null
}
function getAgent(body){
 return getValues(body,['agentId','agent_id','assistantId','assistant_id'])
}
function getChat(body){
 return getValues(body,['chatId','chat_id','contextId'])[0]||''
}
function getMessageId(body){
 const root=obj(body),data=obj(root.data),message=obj(root.message||data.message)
 const ids=uniqueValues([message.id,message.messageId,message.message_id,
  data.messageId,data.message_id,root.messageId,root.message_id])
 return ids.length===1&&ids[0].length<=200?{status:'OK',value:ids[0]}:
  {status:ids.length?'EVENT_ID_DIVERGENT':'EVENT_ID_MISSING'}
}
function getSenderName(body){
 const values=getValues(body,['userName','user_name','username','user.username','user.userName',
  'from.username','from.userName','sender.username','sender.userName',
  'contact.username','contact.userName'])
 const normalized=[...new Set(values.map(normalizeHandle).filter(Boolean))]
 return normalized.length===1?{status:'OK',value:normalized[0]}:
  {status:normalized.length?'SENDER_IDENTITY_DIVERGENT':'SENDER_IDENTITY_MISSING'}
}
function getSenderId(body){
 const values=getValues(body,['userId','user_id','user.id','from.userId','from.id',
  'sender.userId','sender.id','contact.userId','contact.id'])
 return values.length===1&&values[0].length<=200?{status:'OK',value:values[0]}:
  {status:values.length?'SENDER_IDENTITY_DIVERGENT':'SENDER_IDENTITY_MISSING'}
}
function getChannelId(body){
 const values=getValues(body,['channelId','channel_id','channel.id'])
 return values.length===1?{status:'OK',value:values[0]}:
  {status:values.length?'CHANNEL_ID_DIVERGENT':'CHANNEL_ID_MISSING'}
}
function getEventTime(body){
 const values=getValues(body,['time','timestamp','messageTime','message_time','createdAt','created_at'])
 const times=[...new Set(values.map(parseTime).filter(v=>Number.isSafeInteger(v)))]
 return times.length===1?{status:'OK',value:times[0]}:
  {status:times.length?'EVENT_TIME_DIVERGENT':'EVENT_TIME_MISSING'}
}
function getRole(body){
 const root=obj(body),data=obj(root.data),message=obj(root.message||data.message)
 return (clean(message.role)||clean(root.role)||clean(data.role)).toLowerCase()
}
export function scopeStoryEventV16b(body,{env=process.env,clock=Date.now}={}){
 const fail=status=>({status,allowed:false})
 if(getRole(body)!=='user')return fail('NOT_USER_EVENT')
 const agents=getAgent(body)
 if(agents.length!==1||agents[0]!==PILOT_AGENT_ID)return fail(agents.length?'WRONG_OR_DIVERGENT_AGENT':'AGENT_ID_MISSING')
 const pilot=clean(env.PRIME_CONTROL_STORY_PILOT_CHAT_ID)
 const chatId=getChat(body)
 if(!pilot||!chatId)return fail('CHAT_ID_MISSING')
 if(chatId!==pilot)return fail('CHAT_OUT_OF_SCOPE')
 const senderName=getSenderName(body)
 if(senderName.status!=='OK')return fail(senderName.status)
 if(senderName.value!==PILOT_SENDER)return fail('SENDER_OUT_OF_SCOPE')
 const senderId=getSenderId(body)
 if(senderId.status!=='OK')return fail(senderId.status)
 const channel=getChannelId(body)
 if(channel.status==='CHANNEL_ID_DIVERGENT')return fail(channel.status)
 if(channel.status==='OK'&&channel.value!==PILOT_CHANNEL_ID)return fail('CHANNEL_OUT_OF_SCOPE')
 const message=getMessageId(body)
 if(message.status!=='OK')return fail(message.status)
 const time=getEventTime(body)
 if(time.status!=='OK')return fail(time.status)
 const age=clock()-time.value
 if(age>MAX_EVENT_AGE_MS)return fail('EVENT_EXPIRED')
 if(age< -MAX_FUTURE_SKEW_MS)return fail('EVENT_TIME_FUTURE')
 const key=clean(env.PRIME_CONTROL_STORY_RESOLVER_KEY)
 if(!key)return fail('NOT_CONFIGURED')
 return {
  status:'SCOPED',allowed:true,chatId,
  event_id_hmac:hmac(message.value,key,MESSAGE_DOMAIN),
  sender_name_hmac:hmac(senderName.value,key,SENDER_NAME_DOMAIN),
  sender_id_hmac:hmac(senderId.value,key,SENDER_ID_DOMAIN),
  channel_id_hmac:channel.status==='OK'?hmac(channel.value,key,CHANNEL_DOMAIN):null,
  channel_id_present:channel.status==='OK',
  event_age_ms:age,
 }
}
function safeLog(result,logger){
 logger('[PrimeControlStoryCorrelationV16B]',JSON.stringify({
  event:'PRIME_CONTROL_STORY_EVENT_ID_PROOF_V16B',status:result.status,
  event_id_hmac:result.event_id_hmac||null,
  matched_id_hmac:result.matched_id_hmac||null,
  id_equality:result.id_equality===true,match_count:result.match_count??null,
  sender_match:result.sender_match===true,channel_verified:result.channel_verified===true,
  agent_verified:result.agent_verified===true,story_present:result.story_present===true,
  deduplicated:result.deduplicated===true,event_age_ms:result.event_age_ms??null,
  trace_id:result.trace_id||null,http_status:result.http_status??null,
 }))
}
export async function resolveStoryPilotV16b(body,{
 env=process.env,fetchImpl=fetch,clock=Date.now,logger=console.info,traceId=null,dedupe=true
}={}){
 const scoped=scopeStoryEventV16b(body,{env,clock})
 const trace_id=typeof traceId==='string'&&/^[a-f0-9-]{36}$/.test(traceId)?traceId:null
 if(!scoped.allowed){
  const result={status:scoped.status,trace_id,story_present:false}
  safeLog(result,logger);return result
 }
 const secret=clean(env.PRIME_CONTROL_STORY_RESOLVER_KEY)
 const eventKey=hmac(scoped.chatId+'\0'+scoped.event_id_hmac,secret,'prime-control:v16b:dedupe:\0')
 const now=clock()
 for(const [key,when] of recent)if(now-when>DEDUPE_TTL_MS)recent.delete(key)
 if(dedupe&&eventKey&&recent.has(eventKey)){
  const result={status:'DUPLICATE_SUPPRESSED',trace_id,story_present:false,
   event_id_hmac:scoped.event_id_hmac,deduplicated:true,event_age_ms:scoped.event_age_ms}
  safeLog(result,logger);return result
 }
 if(dedupe&&eventKey)recent.set(eventKey,now)
 try{
  const response=await fetchImpl(RELAY,{
   method:'POST',headers:{'content-type':'application/json','x-prime-story-resolver-key':secret},
   body:JSON.stringify({chatId:scoped.chatId,proof:{
    event_id_hmac:scoped.event_id_hmac,sender_name_hmac:scoped.sender_name_hmac,
    sender_id_hmac:scoped.sender_id_hmac,channel_id_hmac:scoped.channel_id_hmac,
    event_time_ms:now-scoped.event_age_ms,
   }}),cache:'no-store',signal:AbortSignal.timeout(9000)
  })
  const data=await response.json().catch(()=>null)
  const returnedEvent=typeof data?.event_id_hmac==='string'&&/^[a-f0-9]{64}$/.test(data.event_id_hmac)?data.event_id_hmac:null
  const returnedMatch=typeof data?.matched_id_hmac==='string'&&/^[a-f0-9]{64}$/.test(data.matched_id_hmac)?data.matched_id_hmac:null
  const matchCount=Number.isSafeInteger(data?.match_count)&&data.match_count>=0&&data.match_count<=1000?data.match_count:null
  const idEquality=data?.id_equality===true&&returnedEvent===scoped.event_id_hmac&&
   returnedMatch===scoped.event_id_hmac&&matchCount===1
  const bindingVerified=response.ok&&data?.ok===true&&idEquality&&
   data?.sender_match===true&&data?.channel_verified===true&&data?.agent_verified===true
  const result={
   status:!idEquality?'EVIDENCE_CONFLICT':
    typeof data?.status==='string'&&/^[A-Z0-9_]{1,64}$/.test(data.status)?data.status:'INVALID_RESPONSE',
   story_present:bindingVerified&&data?.story_present===true,
   id_equality:idEquality,match_count:matchCount,
   event_id_hmac:returnedEvent||scoped.event_id_hmac,
   matched_id_hmac:returnedMatch,
   sender_match:data?.sender_match===true,channel_verified:data?.channel_verified===true,
   agent_verified:data?.agent_verified===true,
   story_fingerprint:bindingVerified&&typeof data?.story_fingerprint==='string'&&/^[a-f0-9]{24}$/.test(data.story_fingerprint)?data.story_fingerprint:null,
   question_hmac:bindingVerified&&typeof data?.question_hmac==='string'&&/^[a-f0-9]{32}$/.test(data.question_hmac)?data.question_hmac:null,
   question_duplicate_count:bindingVerified&&Number.isSafeInteger(data?.question_duplicate_count)&&data.question_duplicate_count>=0&&data.question_duplicate_count<=1000?data.question_duplicate_count:null,
   matched_message_time_ms:bindingVerified&&Number.isSafeInteger(data?.matched_message_time_ms)?data.matched_message_time_ms:null,
   event_age_ms:scoped.event_age_ms,trace_id,http_status:response.status,deduplicated:false,
  }
  safeLog(result,logger)
  return result
 }catch{
  if(eventKey)recent.delete(eventKey)
  const result={status:'RELAY_NETWORK_ERROR',story_present:false,
   event_id_hmac:scoped.event_id_hmac,event_age_ms:scoped.event_age_ms,trace_id}
  safeLog(result,logger);return result
 }
}
export function clearStoryIdentityV16bCacheForTests(){recent.clear()}
