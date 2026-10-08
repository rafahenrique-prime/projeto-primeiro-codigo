/**
 * V1.4C LAB inbound-to-GPTMaker correlation. Strictly read-only.
 * Uses a dedicated Vercel LAB resolver to keep GPTMaker API credentials off Render.
 * No images fetched and no customer responses. One allowlisted pilot chat only.
 */
import { createHmac, randomUUID } from 'node:crypto'

const RELAY='https://prime-gptmaker-lab.vercel.app/api/prime-control-story-resolve-v14c'
const EVENT='PRIME_CONTROL_STORY_CONTEXT_RESOLVED_V14C'
const TTL_MS=90_000
const recent=new Map()
const maxRemember=100
const clean=v=>typeof v==='string'?v.trim():''
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{}
export function extractInboundChatId(body) {
 const root=obj(body),data=obj(root.data),message=obj(root.message||data.message)
 return clean(root.chatId)||clean(root.chat_id)||clean(root.contextId)||
  clean(data.chatId)||clean(data.contextId)||clean(message.chatId)
}
export function isUserInbound(body) {
 const root=obj(body),data=obj(root.data),message=obj(root.message||data.message)
 return (clean(message.role)||clean(root.role)||clean(data.role)).toLowerCase()==='user'
}
function eventLog(result,logger=console.info){
 const safe={
   event:EVENT,run_id:result.run_id,
   status:result.status,story_present:result.story_present===true,
   media_available:result.story_media_available===true,
   source:result.source||null,agent_verified:result.agent_verified===true,
   story_fingerprint:result.story_fingerprint||null,
   chat_fingerprint:result.chat_fingerprint||null,
   deduplicated:result.deduplicated===true,
   http_status:result.http_status??null
 }
 logger('[PrimeControlStoryCorrelation]',JSON.stringify(safe))
}
export async function resolveStoryPilot(
 body,{env=process.env,fetchImpl=fetch,clock=Date.now,logger=console.info,dedupe=true}={}
){
 const run_id=randomUUID()
 const chatId=extractInboundChatId(body), pilot=clean(env.PRIME_CONTROL_STORY_PILOT_CHAT_ID)
 const secret=clean(env.PRIME_CONTROL_STORY_RESOLVER_KEY)
 const fail=(status,other={})=>({run_id,status,story_present:false,...other})
 if(!isUserInbound(body))return fail('NOT_USER_EVENT')
 if(!secret||!pilot)return fail('NOT_CONFIGURED')
 if(!chatId||chatId!==pilot)return fail('CHAT_OUT_OF_SCOPE')
 const fingerprint=createHmac('sha256',secret).update(chatId).digest('hex').slice(0,24)
 const now=clock()
 for(const [k,t] of recent) if(now-t>TTL_MS)recent.delete(k)
 if(dedupe&&recent.has(fingerprint)) {
   const result=fail('DUPLICATE_SUPPRESSED',{deduplicated:true,chat_fingerprint:fingerprint})
   eventLog(result,logger)
   return result
 }
 if(dedupe){
   recent.set(fingerprint,now)
   while(recent.size>maxRemember)recent.delete(recent.keys().next().value)
 }
 try{
   const resp=await fetchImpl(RELAY,{
     method:'POST',headers:{'content-type':'application/json','x-prime-story-resolver-key':secret},
     body:JSON.stringify({chatId}),
     cache:'no-store',signal:AbortSignal.timeout(7000),
   })
   const data=await resp.json().catch(()=>null)
   const status=clean(data?.status)||'INVALID_RESPONSE'
   const allowed=new Set(['FOUND','NO_VALID_STORY_ON_LATEST_USER','AGENT_NOT_PROVEN',
     'NO_USER_MESSAGES','INVALID_MESSAGES','GPTMAKER_UNAVAILABLE','GPTMAKER_NETWORK_ERROR'])
   const ok=resp.ok&&allowed.has(status)
   const result={
     run_id,status:ok?status:'RELAY_UNAVAILABLE',
     story_present:ok&&status==='FOUND'&&data?.story_present===true,
     agent_verified:ok&&data?.agent_verified===true,
     story_media_available:ok&&data?.story_media_available===true,
     story_fingerprint:ok&&typeof data?.story_fingerprint==='string'
       &&/^[a-f0-9]{24}$/.test(data.story_fingerprint)?data.story_fingerprint:null,
     chat_fingerprint:fingerprint,source:'GPTMAKER_MESSAGES_READ_ONLY',
     http_status:resp.status,deduplicated:false,
   }
   eventLog(result,logger)
   return result
 }catch{
   const result=fail('RELAY_NETWORK_ERROR',{chat_fingerprint:fingerprint})
   eventLog(result,logger)
   return result
 }
}
export function clearPilotCorrelationCacheForTests(){recent.clear()}
