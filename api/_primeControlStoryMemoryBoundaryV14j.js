/**
 * PRIME CONTROL V1.4J — GABY LAB Story x commercial-memory boundary.
 *
 * Pure policy, NO I/O and NO writes. Builds on V1.4I rather than a second bot.
 * This is a QA harness, NOT wired to the active GPTMaker Buscar Produtos tool
 * or Supabase gaby-lab-shadow-context-v1. A verified Story reply MUST NOT
 * automatically inherit a 15-minute commercial selected_product.
 */
import {routeStoryScenarioV14i,MAX_CONTEXT_AGE_MS} from './_primeControlStoryScenarioRouterV14i.js'
import {ALLOWED_SCOPE} from './_primeControlStoryNativePolicyV14f.js'

const FP=/^[a-f0-9]{24}$/
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
const fresh=(ts,now)=>Number.isSafeInteger(ts)&&ts>0&&ts<=now+3000&&now-ts<=MAX_CONTEXT_AGE_MS
export const BOUNDARY_VERSION='PRIME_CONTROL_V14J'
export const BASELINE_STORIES_20261008=Object.freeze([
 {test:'ST01',media_type:'image/jpeg',fingerprint:'92501b2adacb3dd7ae77ffd2'},
 {test:'ST02',media_type:'image/jpeg',fingerprint:'498b8f47c09bbd16a596ceef'},
 {test:'ST03',media_type:'image/jpeg',fingerprint:'ed9662532f4de7dbb5f7fc72'},
 {test:'ST04',media_type:'image/jpeg',fingerprint:'9e65b845a6a6cc5f023068bd'},
 {test:'ST05',media_type:'image/jpeg',fingerprint:'5d3d446628685d6c6c0f5b02'},
 {test:'ST06_VIDEO',media_type:'video/mp4',fingerprint:'c47e189e645ae90b9dc12e5d'},
])
/**
 * Inputs MUST be server-verified. Never let the customer provide the trusted
 * source, agent validation, chat allowlist, or fingerprint evidence.
 *
 * commercialMemory.selected_product is a CANDIDATE unless the independent
 * media/SKU evidence gate passes for the current Story.
 */
export function decideStoryMemoryBoundaryV14j({
 scope,latest,commercialMemory=null,history={},evidence=null,nowMs=Date.now(),
}={}){
 const base={
  version:BOUNDARY_VERSION,mode:'LAB_PURE_PREVIEW_ONLY',
  action:'BLOCK_UNVERIFIED_CONTEXT',reason:'INVALID_INPUT',
  old_selected_product_may_be_used:false,
  clear_database_memory:false,commercial_action_called:false,
  new_context_key_required:false,
  native_training_id:null,
  customer_reply_sent:false,writes:0,vision_calls:0,jev_calls:0,catalog_calls:0,
 }
 const output=(action,reason,extra={})=>({...base,action,reason,...extra})
 if(scope!==ALLOWED_SCOPE)return output('BLOCK_OUT_OF_SCOPE','NOT_GABY_LAB')
 if(!obj(latest)||latest.source!=='GPTMAKER_MESSAGES_READ_ONLY'||
  latest.agent_verified!==true||latest.chat_allowlisted!==true||
  !fresh(latest.message_time_ms,nowMs))
  return output('BLOCK_UNVERIFIED_CONTEXT','MESSAGE_OR_AGENT_UNVERIFIED')
 const noStory=latest.kind==='NO_STORY'&&
  latest.story_fingerprint==null&&latest.media_type==null&&
  latest.story_status==='NO_VALID_STORY_ON_LATEST_USER'&&
  history.pending_story!==true
 if(noStory){
  return output('PRESERVE_NATIVE_SEARCH','VERIFIED_ORDINARY_CHAT',{
   old_selected_product_may_be_used:true,
  })
 }
 if(latest.kind!=='STORY_REPLY'||latest.story_status!=='FOUND'||
  !FP.test(latest.story_fingerprint||'')||
  !['image/jpeg','video/mp4'].includes(latest.media_type)||
  latest.media_available!==true){
  return output('BLOCK_UNVERIFIED_CONTEXT','STORY_NOT_VERIFIED')
 }
 const memory=obj(commercialMemory)?commercialMemory:null
 const oldProduct=typeof memory?.selected_product==='string'&&
  memory.selected_product.trim().length>0
 // Even if the Story is THE SAME as before, the previous commercial
 // selected_product is not a verified product ID on its own.
 const sameStory=memory?.verified_story_fingerprint===latest.story_fingerprint
 const visualLinked=obj(evidence)&&
  evidence.media_key===latest.story_fingerprint&&
  evidence.context_source==='VERIFIED_LAB_PIPELINE'&&
  Number.isSafeInteger(evidence.observed_at_ms)
 if(!visualLinked){
  return output('HOLD_FOR_CURRENT_STORY_EVIDENCE',
   oldProduct?(sameStory?'CACHED_PRODUCT_NEEDS_SKU_PROOF':'PREVIOUS_PRODUCT_NOT_BOUND_TO_STORY'):
    'CURRENT_STORY_REQUIRES_MEDIA_PROOF',{
     new_context_key_required:!sameStory,
   })
 }
 // V1.4I is the single native-first decision policy. Do NOT repeat its
 // JEV / visual match / catalog verification logic here.
 const native=routeStoryScenarioV14i({
  scope,
  context:{
   source:'GPTMAKER_MESSAGES_READ_ONLY',agent_verified:true,
   chat_allowlisted:true,status:'FOUND',media_kind:'INSTAGRAM_STORY',
   story_present:true,story_media_available:true,
   story_fingerprint:latest.story_fingerprint,
   latest_user_time_ms:latest.message_time_ms,
  },
  evidence,
  history:obj(history)?history:{},
 },nowMs)
 if(native.route==='BLOCK'){
  return output('BLOCK_UNVERIFIED_CONTEXT',native.reason,{
   new_context_key_required:!sameStory,
  })
 }
 if(native.route==='VERIFIED_PRODUCT'&&native.product_assertion_allowed===true){
  // A verified result belongs to the CURRENT media, not to the old
  // selected_product. Price, stock and Pix are separate commercial gates.
  return output('USE_CURRENT_STORY_VERIFIED_PRODUCT','NEW_MEDIA_IDENTITY_VERIFIED',{
   new_context_key_required:!sameStory,
   native_training_id:native.native_training_id,
   current_media_identity_verified:true,
   verified_price_allowed:native.price_allowed===true,
   verified_stock_allowed:native.stock_allowed===true,
   pix_allowed:false,
  })
 }
 return output('NATIVE_STORY_FALLBACK','STORY_SKU_NOT_CONFIRMED',{
  new_context_key_required:!sameStory,
  native_training_id:native.native_training_id,
  native_route:native.route,
 })
}

/** Recorded real fingerprints; controlled replay with synthetic context only. */
export function simulateSixStoryMemoryBoundariesV14j(){
 const now=Date.UTC(2026,9,9,2,35,0)
 const old={selected_product:'Camiseta Armani Exchange Branca',last_requested_size:'M'}
 const cases=BASELINE_STORIES_20261008.map((s,i)=>{
  const answer=decideStoryMemoryBoundaryV14j({
   scope:ALLOWED_SCOPE,nowMs:now,
   latest:{source:'GPTMAKER_MESSAGES_READ_ONLY',agent_verified:true,
    chat_allowlisted:true,kind:'STORY_REPLY',story_status:'FOUND',
    story_fingerprint:s.fingerprint,media_type:s.media_type,
    media_available:true,message_time_ms:now-1000-i*100},
   commercialMemory:old,
  })
  return {test:s.test,media_type:s.media_type,action:answer.action,
   passed:answer.action==='HOLD_FOR_CURRENT_STORY_EVIDENCE'&&
    answer.old_selected_product_may_be_used===false&&
    answer.writes===0&&answer.customer_reply_sent===false}
 })
 return {version:BOUNDARY_VERSION,scenario_count:cases.length,
  passed:cases.filter(x=>x.passed).length,all_pass:cases.every(x=>x.passed),
  cases,real_messages_replayed:false,media_downloads:0,
  client_messages_sent:0,db_writes:0,ai_calls:0}
}
