/**
 * PRIME CONTROL V1.4I — pure LAB scenario router for GABY's native workflows.
 *
 * Contract-only; NOT connected to the active GPTMaker Buscar Produtos tool,
 * Instagram, webhook ingestion, Supabase, or message delivery. Context and
 * evidence are caller-supplied VERIFIED facts; never trust raw user claims.
 *
 * Preserve the existing native commercial search for proven non-Story messages.
 * Fail closed on uncertain, stale, cross-chat, or cross-Story evidence.
 */
import {
  NATIVE_STORY_PRINT_TRAINING,
  NATIVE_STORY_CONFIDENCE_TRAINING,
  ALLOWED_SCOPE,
} from './_primeControlStoryNativePolicyV14f.js'

export const ROUTING_VERSION='PRIME_CONTROL_V14I'
export const MAX_CONTEXT_AGE_MS=5*60*1000
export const MAX_EVIDENCE_AGE_MS=5*60*1000
const FP=/^[0-9a-f]{24}$/
const hasOwn=(o,k)=>Object.prototype.hasOwnProperty.call(o,k)
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
const validTime=t=>Number.isSafeInteger(t)&&t>0
const CODES=Object.freeze({
  KEEP_NATIVE_SEARCH:'KEEP_NATIVE_SEARCH',
  REQUEST_STORY_PRINT:'REQUEST_STORY_PRINT',
  ASK_ONE_DETAIL:'ASK_ONE_DETAIL',
  ANALYZE_UPLOADED_IMAGE:'ANALYZE_UPLOADED_IMAGE',
  VERIFIED_PRODUCT:'VERIFIED_PRODUCT',
  BLOCK:'BLOCK',
})

/**
 * A pure decision to be carried out only by a separately approved future
 * LAB integration. It NEVER performs any search, send, I/O or state mutation.
 */
export function routeStoryScenarioV14i(input={},nowMs=Date.now()){
 const base={
   version:ROUTING_VERSION,mode:'LAB_POLICY_SIMULATION_ONLY',route:CODES.BLOCK,
   reason:'INVALID_CONTEXT',native_training_id:null,
   intended_handler:'NONE',
   product_assertion_allowed:false,price_allowed:false,
   pix_allowed:false,stock_allowed:false,
   active_commercial_tool_invoked:false,commercial_tool_unchanged:true,
   gaby_official_unchanged:true,sends_messages:false,writes:false,
   resolver_calls:0,gemini_calls:0,jev_calls:0,catalog_calls:0,
 }
 const out=(route,reason,other={})=>({...base,route,reason,...other})
 if(!obj(input)||input.scope!==ALLOWED_SCOPE)return out(CODES.BLOCK,'OUTSIDE_GABY_LAB_SCOPE')
 const ctx=input.context,ev=input.evidence,history=input.history
 if(!obj(ctx)||ctx.source!=='GPTMAKER_MESSAGES_READ_ONLY'||
    ctx.agent_verified!==true||ctx.chat_allowlisted!==true)
   return out(CODES.BLOCK,'UNVERIFIED_IDENTITY_OR_SOURCE')
 if(!validTime(nowMs)||!validTime(ctx.latest_user_time_ms)||
    ctx.latest_user_time_ms>nowMs+3000||
    nowMs-ctx.latest_user_time_ms>MAX_CONTEXT_AGE_MS)
   return out(CODES.BLOCK,'LATEST_MESSAGE_STALE_OR_INVALID')
 if(!obj(history))return out(CODES.BLOCK,'HISTORY_UNVERIFIED')
 if(ctx.status==='NO_VALID_STORY_ON_LATEST_USER'){
   if(ctx.media_kind!=='NONE'||ctx.story_fingerprint!=null||
      history.last_product_unconfirmed===true||
      history.pending_image_analysis===true)
     return out(CODES.BLOCK,'NOT_STORY_CONTEXT_AMBIGUOUS')
   return out(CODES.KEEP_NATIVE_SEARCH,'PROVEN_REGULAR_CHAT',{
     intended_handler:'PRESERVE_GPTMAKER_NATIVE_BUSCAR_PRODUTOS_UNCHANGED',
   })
 }
 const story=ctx.status==='FOUND'&&ctx.media_kind==='INSTAGRAM_STORY'
 const image=ctx.status==='USER_IMAGE_FOUND'&&ctx.media_kind==='USER_UPLOADED_IMAGE'
 if(!story&&!image)return out(CODES.BLOCK,'NO_TRUSTED_CURRENT_MEDIA_CONTEXT')
 if(story&&(!FP.test(ctx.story_fingerprint||'')||ctx.story_present!==true||
   ctx.story_media_available!==true))
   return out(CODES.BLOCK,'STORY_NOT_VERIFIED')
 if(image&&(ctx.image_verified!==true||typeof ctx.image_evidence_key!=='string'||
   !FP.test(ctx.image_evidence_key)))
   return out(CODES.BLOCK,'IMAGE_NOT_VERIFIED')
 const mediaKey=story?ctx.story_fingerprint:ctx.image_evidence_key
 if(!obj(ev)||ev.media_key!==mediaKey||
    ev.context_source!=='VERIFIED_LAB_PIPELINE'||
    !validTime(ev.observed_at_ms)||
    ev.observed_at_ms>nowMs+3000||
    ev.observed_at_ms<ctx.latest_user_time_ms-3000||
    nowMs-ev.observed_at_ms>MAX_EVIDENCE_AGE_MS)
   return out(CODES.BLOCK,'MISSING_OR_STALE_CURRENT_MEDIA_EVIDENCE')
 // Untrusted score or a Shadow candidate is NOT a proof of the exact SKU.
 const catalog=obj(ev.catalog)?ev.catalog:{}
 const visual=obj(ev.visual)?ev.visual:{}
 const jev=obj(ev.jev)?ev.jev:{}
 const skuConfirmed=catalog.status==='READ_ONLY_OK'&&
   catalog.exact_sku_verified===true&&
   typeof catalog.verified_sku_token==='string'&&
   catalog.verified_sku_token.length>=8&&
   catalog.media_key===mediaKey&&
   jev.status==='ok'&&jev.action==='ALLOW_AUTO'&&
   visual.status==='STRONG_VISUAL_MATCH'&&
   visual.choice==='C1'&&Number.isFinite(visual.confidence)&&
   visual.confidence>=0.95&&visual.media_key===mediaKey
 if(skuConfirmed){
   return out(CODES.VERIFIED_PRODUCT,'ALL_INDEPENDENT_IDENTITY_GATES_PASSED',{
     native_training_id:NATIVE_STORY_CONFIDENCE_TRAINING,
     intended_handler:'GPTMAKER_NATIVE_CONFIRMED_PRODUCT_AFTER_QA_APPROVAL',
     product_assertion_allowed:true,
     price_allowed:catalog.price_verified===true,
     stock_allowed:catalog.physical_stock_verified===true,
   })
 }
 if(image){
   if(ev.vision_status==='NOT_ANALYZED')
     return out(CODES.ANALYZE_UPLOADED_IMAGE,'CUSTOMER_ALREADY_PROVIDED_IMAGE',{
       intended_handler:'PENDING_SEPARATE_APPROVED_LAB_IMAGE_ANALYSIS',
     })
   return out(CODES.ASK_ONE_DETAIL,'IMAGE_PRESENT_BUT_SKU_UNCONFIRMED',{
     native_training_id:NATIVE_STORY_CONFIDENCE_TRAINING,
     intended_handler:'GPTMAKER_NATIVE_CLARIFY_ONCE_AFTER_QA_APPROVAL',
   })
 }
 if(history.print_requested_for_media_key===mediaKey||
    history.customer_already_supplied_print===true)
   return out(CODES.ASK_ONE_DETAIL,'PRINT_ALREADY_REQUESTED_OR_SUPPLIED',{
     native_training_id:NATIVE_STORY_CONFIDENCE_TRAINING,
     intended_handler:'GPTMAKER_NATIVE_CLARIFY_ONCE_AFTER_QA_APPROVAL',
   })
 return out(CODES.REQUEST_STORY_PRINT,
   jev.action==='BLOCK_ASSERTION'?'JEV_VETO_EXACT_MODEL':'STORY_MODEL_UNCONFIRMED',{
   native_training_id:NATIVE_STORY_PRINT_TRAINING,
   intended_handler:'GPTMAKER_NATIVE_REQUEST_PRINT_ONCE_AFTER_QA_APPROVAL',
 })
}

const NOW=Date.UTC(2026,9,8,22,46,0)
const MSG=NOW-15000
const KEY='0123456789abcdef01234567'
const IMG='abcdef0123456789abcdef01'
const context={
  source:'GPTMAKER_MESSAGES_READ_ONLY',agent_verified:true,chat_allowlisted:true,
  status:'FOUND',media_kind:'INSTAGRAM_STORY',story_present:true,
  story_media_available:true,story_fingerprint:KEY,latest_user_time_ms:MSG,
}
const baseEvidence={
  media_key:KEY,context_source:'VERIFIED_LAB_PIPELINE',
  observed_at_ms:NOW-9000,vision_status:'ANALYZED',
  catalog:{status:'READ_ONLY_OK',exact_sku_verified:false},
  visual:{status:'VISUAL_UNCERTAIN',choice:'C1',confidence:0.90,media_key:KEY},
  jev:{status:'ok',action:'BLOCK_ASSERTION'},
}
const f=(name,contextOverride={},evidenceOverride={},historyOverride={},expected='REQUEST_STORY_PRINT')=>({
 name,expected,input:{
  scope:ALLOWED_SCOPE,context:{...context,...contextOverride},
  evidence:{...baseEvidence,...evidenceOverride},
  history:{print_requested_for_media_key:null,customer_already_supplied_print:false,...historyOverride},
 }})
/** Synthetic fixtures only. Real Vans historical evidence is NEVER replayed as fresh. */
export const ROUTER_SCENARIOS_V14I=Object.freeze([
 f('STORY_MODEL_UNCERTAIN_JEV_VETO'),
 f('STORY_VISUAL_STRONG_BUT_JEV_VETO',{},{
   visual:{...baseEvidence.visual,status:'STRONG_VISUAL_MATCH',confidence:0.99},
 },{},'REQUEST_STORY_PRINT'),
 f('STORY_PRINT_ALREADY_REQUESTED',{}, {},{
   print_requested_for_media_key:KEY,
 },'ASK_ONE_DETAIL'),
 f('STORY_MODEL_VISUAL_MATCH_AND_SKU_VERIFIED',{},{
   visual:{status:'STRONG_VISUAL_MATCH',choice:'C1',confidence:0.97,media_key:KEY},
   jev:{status:'ok',action:'ALLOW_AUTO'},
   catalog:{status:'READ_ONLY_OK',exact_sku_verified:true,
     verified_sku_token:'sku-verified-QA',media_key:KEY,
     price_verified:false,physical_stock_verified:false},
 },{},'VERIFIED_PRODUCT'),
 f('NORMAL_CHAT_KEEP_NATIVE',{
   status:'NO_VALID_STORY_ON_LATEST_USER',media_kind:'NONE',
   story_present:false,story_media_available:false,story_fingerprint:null,
 },{}, {},'KEEP_NATIVE_SEARCH'),
 f('IMAGE_ALREADY_PROVIDED_NEEDS_ANALYSIS',{
   status:'USER_IMAGE_FOUND',media_kind:'USER_UPLOADED_IMAGE',
   story_present:false,story_media_available:false,story_fingerprint:null,
   image_verified:true,image_evidence_key:IMG,
 },{media_key:IMG,vision_status:'NOT_ANALYZED'},
 {},'ANALYZE_UPLOADED_IMAGE'),
 f('IMAGE_ALREADY_PROVIDED_UNCERTAIN',{
   status:'USER_IMAGE_FOUND',media_kind:'USER_UPLOADED_IMAGE',
   story_present:false,story_media_available:false,story_fingerprint:null,
   image_verified:true,image_evidence_key:IMG,
 },{media_key:IMG,vision_status:'ANALYZED'},
 {},'ASK_ONE_DETAIL'),
 f('NEW_STORY_MUST_NOT_REUSE_PRIOR_VANS',{
   story_fingerprint:'ffffffffffffffffffffffff',
 },{}, {},'BLOCK'),
 f('OLD_CONTEXT_MUST_NOT_REPLAY',{
   latest_user_time_ms:MSG-600000,
 },{}, {},'BLOCK'),
 f('RESOLVER_FAILURE_NOT_ORDINARY_CHAT',{
   status:'GPTMAKER_UNAVAILABLE',
 },{}, {},'BLOCK'),
 f('OFF_SCOPE_AGENT_DENIED',{agent_verified:false},{},{},'BLOCK'),
 f('CATALOG_TOP_CANDIDATE_IS_NOT_CONFIRMED',{},{
   catalog:{status:'READ_ONLY_OK',exact_sku_verified:false,
     verified_sku_token:'candidate-01',media_key:KEY},
   jev:{status:'ok',action:'ALLOW_AUTO'},
   visual:{status:'STRONG_VISUAL_MATCH',choice:'C1',confidence:0.99,media_key:KEY},
 },{},'REQUEST_STORY_PRINT'),
 f('STORY_UNVERIFIED_WITH_NO_EVIDENCE',{},{
   media_key:'ffffffffffffffffffffffff',
 },{},'BLOCK'),
 f('NORMAL_CHAT_WITH_PENDING_STORY_NOT_AUTO_SEARCH',{
   status:'NO_VALID_STORY_ON_LATEST_USER',media_kind:'NONE',
   story_present:false,story_media_available:false,story_fingerprint:null,
 },{}, {last_product_unconfirmed:true},'BLOCK'),
])
export function runScenarioMatrixV14i(){
 const scenarios=ROUTER_SCENARIOS_V14I.map(c=>{
   const decision=routeStoryScenarioV14i(c.input,NOW)
   const passed=decision.route===c.expected&&
     decision.sends_messages===false&&decision.writes===false&&
     decision.catalog_calls===0&&decision.gemini_calls===0&&
     decision.jev_calls===0&&decision.active_commercial_tool_invoked===false&&
     decision.pix_allowed===false
   return {scenario:c.name,route:decision.route,reason:decision.reason,
     passed,training_id:decision.native_training_id}
 })
 return {version:ROUTING_VERSION,mode:'SYNTHETIC_PURE_MATRIX',
  passed:scenarios.filter(x=>x.passed).length,total:scenarios.length,
  all_pass:scenarios.every(x=>x.passed),scenarios,
  actual_gptmaker_messages:0,actual_tool_changes:0,
  real_story_fetched:false,paid_ai_calls:0,db_writes:0}
}
