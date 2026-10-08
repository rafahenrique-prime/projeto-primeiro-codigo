/**
 * PRIME CONTROL V1.4G — LAB-only proof of Story context handoff to native policy.
 *
 * The webhook observer's verified Story metadata is obtained via the ALREADY
 * HOMOLOGATED Vercel LAB read-only resolver (GPTMaker messages GET). The result
 * feeds ONLY an in-memory policy preview from V1.4F.
 *
 * This is NOT the live GPTMaker "Buscar Produtos" tool, nor a customer reply
 * endpoint. No catalog, image, JEV, Gemini, Supabase, prompt changes or writes.
 */
import crypto from 'node:crypto'
import {resolveStoryPilot} from './_primeControlStoryCorrelationV14c.js'
import {mediaProbeAuthorized} from './prime-control-story-media-probe-v14d.js'
import {routeToNativeStoryTraining,REAL_STORY_FINGERPRINT,ALLOWED_SCOPE} from './_primeControlStoryNativePolicyV14f.js'

export const V14G_EVENT='PRIME_CONTROL_STORY_NATIVE_BRIDGE_V14G'
const attempts=new Set()
const clean=v=>typeof v==='string'?v.replace(/[\r\n\u0000-\u001f\u007f]/g,' ').trim().slice(0,110):null
export function resetStoryNativeBridgeAttemptsForTests(){attempts.clear()}

export async function probeStoryNativeBridgeOnce({
 env=process.env,fetchImpl=fetch,resolveFn=resolveStoryPilot,
 policyFn=routeToNativeStoryTraining,logger=console.info,
}={}){
 const run_id=crypto.randomUUID()
 let resolver_reads=0
 const emit=(status,detail={})=>{
  const result={
   event:V14G_EVENT,run_id,status,scope:'LAB_ONLY',source:'LIVE_GPTMAKER_HISTORY_VERCEL_RESOLVER',
   resolver_reads,gptmaker_messages_get:resolver_reads,
   policy_invocations:detail.policy_invocations??0,
   correlation_status:detail.correlation_status??null,
   story_present:detail.story_present===true,
   agent_verified:detail.agent_verified===true,
   fingerprint_matches_prior_proof:detail.fingerprint_matches_prior_proof===true,
   policy_route:detail.policy_route??'BLOCK',
   native_training_id:detail.native_training_id??null,
   policy_reason:detail.policy_reason??null,
   policy_preview_only:true,
   actual_gptmaker_tool_updated:false,actual_gptmaker_answer_tested:false,
   messages_sent:0,vision_calls:0,jev_calls:0,catalog_calls:0,
   media_downloads:0,shadow_reads:0,writes:0,
   disclosure:'NO_STORY_ID_URL_TEXT_OR_AGENT_PROMPT',
  }
  logger('[PrimeControlStoryNativeBridgeV14G]',JSON.stringify(result))
  return result
 }
 if(env.PRIME_CONTROL_STORY_NATIVE_BRIDGE_ENABLED!=='true')return emit('DISABLED')
 if(env.PRIME_CONTROL_STORY_NATIVE_BRIDGE_EXPECTED_FINGERPRINT!==REAL_STORY_FINGERPRINT)
  return emit('EXPECTED_FINGERPRINT_MISMATCH')
 const chatId=String(env.PRIME_CONTROL_STORY_PILOT_CHAT_ID||'').trim()
 if(!chatId||!String(env.PRIME_CONTROL_STORY_RESOLVER_KEY||'').trim())
  return emit('PILOT_NOT_CONFIGURED')
 if(attempts.has(REAL_STORY_FINGERPRINT))return emit('ALREADY_ATTEMPTED')
 attempts.add(REAL_STORY_FINGERPRINT)
 let observation
 try{
  resolver_reads=1
  // The generated trigger is NOT an incoming webhook; it merely requests
  // a read of the latest user message in the one allowlisted QA chat.
  observation=await resolveFn({chatId,message:{role:'user'}},
   {env,fetchImpl,dedupe:false,logger:()=>{}})
 }catch{return emit('RESOLVER_FAILED')}
 const common={
  correlation_status:clean(observation?.status),
  story_present:observation?.story_present===true,
  agent_verified:observation?.agent_verified===true,
  fingerprint_matches_prior_proof:observation?.story_fingerprint===REAL_STORY_FINGERPRINT,
 }
 if(observation?.status!=='FOUND')return emit('STORY_NOT_FOUND',common)
 if(observation?.story_present!==true||observation?.agent_verified!==true||
  observation?.story_media_available!==true)
  return emit('STORY_NOT_VERIFIED',common)
 if(observation?.story_fingerprint!==REAL_STORY_FINGERPRINT)
  return emit('NEW_STORY_NOT_IN_APPROVED_PROOF',common)

 // V1.4E source evidence is historical, kept distinct from live context
 // correlation. Never convert a Shadow candidate into a verified SKU.
 const policy=policyFn({
  scope:ALLOWED_SCOPE,context_status:'FOUND',
  story_fingerprint:REAL_STORY_FINGERPRINT,
  media_source:'INSTAGRAM_STORY',
  catalog:{status:'READ_ONLY_OK',candidates:1,exact_sku_verified:false},
  visual:{status:'VISUAL_UNCERTAIN',choice:'C1',confidence:0.90},
  jev:{status:'ok',action:'BLOCK_ASSERTION',confidence:0.06},
 })
 const outcome={
  ...common,policy_invocations:1,policy_route:clean(policy?.route),
  native_training_id:clean(policy?.training_id),
  policy_reason:clean(policy?.reason),
 }
 if(policy?.route!=='GPTMAKER_NATIVE_REQUEST_STORY_PRINT'||
  policy?.exact_product_assertion_allowed!==false||
  policy?.price_allowed!==false||
  policy?.messages_sent!==0)
  return emit('POLICY_MISMATCH_BLOCKED',outcome)
 return emit('VERIFIED_NATIVE_POLICY_PREVIEW',outcome)
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store')
 if(req.method!=='POST')return res.status(405).json({ok:false,status:'METHOD_NOT_ALLOWED'})
 if(!mediaProbeAuthorized(req))return res.status(401).json({ok:false,status:'LAB_AUTH_REQUIRED'})
 if(process.env.PRIME_CONTROL_STORY_NATIVE_BRIDGE_ENABLED!=='true')
  return res.status(503).json({ok:false,status:'NATIVE_BRIDGE_DISABLED'})
 if(String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/json')
  return res.status(415).json({ok:false,status:'JSON_REQUIRED'})
 if(req.body?.confirm!=='READ_REAL_STORY_CONTEXT_NATIVE_POLICY_PREVIEW_V14G')
  return res.status(400).json({ok:false,status:'CONFIRM_REQUIRED'})
 const out=await probeStoryNativeBridgeOnce()
 return res.status(out.status==='VERIFIED_NATIVE_POLICY_PREVIEW'?200:422)
  .json({ok:out.status==='VERIFIED_NATIVE_POLICY_PREVIEW',...out})
}
