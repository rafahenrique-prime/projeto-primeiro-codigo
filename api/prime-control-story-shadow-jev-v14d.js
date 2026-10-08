/**
 * PRIME CONTROL V1.4D — REAL Story evidence -> Shadow V11 -> JEV Guard.
 * LAB-only, read-only, deterministic, at most ONE catalog request and ONE
 * JEV decision invocation per process. No media/Vision, DB writes, deliveries,
 * historical-product memory, photos, prices or stock claims.
 *
 * This gate reuses ONLY proven, sanitized 08/10 Vision evidence and the
 * already-homologated Shadow catalog tool and JEV guard. Not a live chat hook.
 */
import crypto from 'node:crypto'
import {mediaProbeAuthorized} from './prime-control-story-media-probe-v14d.js'
import {sanitizeCandidates} from './prime-control-vans-screenshot-lab-v14c.js'
import {decideStoryWithJev} from './_jevStoryDecision.js'

export const STORY_SHADOW_JEV_EVENT='PRIME_CONTROL_STORY_SHADOW_JEV_V14D'
export const OBSERVED_STORY_FINGERPRINT='e7724e511a7e661c68aadfd9'
export const SHADOW_V11='https://mbbgqasvssueirynnoyk.supabase.co/functions/v1/gaby-lab-shadow-catalog-v11'
export const SEARCH_TERMS='tênis Vans Ultrarange bege'
const EVIDENCE=Object.freeze({category:'sneakers',brand:'Vans',model:'Ultra Range',
 color:'bege e marrom',description:'Produto do Story real identificado visualmente como tênis Vans Ultra Range nas cores bege e marrom.'})
const used=new Set()
export function resetStoryShadowJevOnceForTests(){used.clear()}
const clean=v=>typeof v==='string'?v.replace(/[\r\n\u0000-\u001f\u007f]/g,' ').trim().slice(0,140):null
const possibleNumbers=v=>Number.isFinite(Number(v))?Number(v):null

export async function runStoryShadowJevOnce({
 env=process.env,fetchImpl=fetch,jevFn=decideStoryWithJev,logger=console.info,
}={}){
 const run_id=crypto.randomUUID()
 let catalog_calls=0,jev_invocations=0
 const report=(status,details={})=>{
  const result={
   event:STORY_SHADOW_JEV_EVENT,run_id,status,mode:'LAB_READ_ONLY',
   story_fingerprint:OBSERVED_STORY_FINGERPRINT,source:'PREVIOUS_REAL_VISION_V14D',
   vision_calls:0,media_downloads:0,
   catalog_calls,jev_invocations,messages_sent:0,writes:0,
   catalog_status:details.catalog_status??null,catalog_http_status:details.catalog_http_status??null,
   query:details.query??null,candidate_count:details.candidate_count??0,
   candidate_names:details.candidate_names??[],
   jev_status:details.jev_status??'NOT_ATTEMPTED',
   jev_action:details.jev_action??'BLOCK_ASSERTION',
   jev_reason:details.jev_reason??null,jev_confidence:details.jev_confidence??null,
   jev_selected_candidate:details.jev_selected_candidate??null,
   jev_cost_usd:details.jev_cost_usd??null,
   commercial_price_verified:false,physical_stock_verified:false,
   outbound_recommendation:'DO_NOT_SEND_ANY_REPLY',
  }
  logger('[PrimeControlStoryShadowJevV14D]',JSON.stringify(result))
  return result
 }
 if(env.PRIME_CONTROL_STORY_SHADOW_JEV_ENABLED!=='true')return report('DISABLED')
 if(env.PRIME_CONTROL_STORY_SHADOW_JEV_EXPECTED_FINGERPRINT!==OBSERVED_STORY_FINGERPRINT)
  return report('STORY_FINGERPRINT_MISMATCH')
 if(used.has(OBSERVED_STORY_FINGERPRINT))return report('ALREADY_ATTEMPTED')
 used.add(OBSERVED_STORY_FINGERPRINT)
 let response,body
 try{
  catalog_calls=1
  response=await fetchImpl(SHADOW_V11,{
   method:'POST',redirect:'manual',cache:'no-store',
   signal:AbortSignal.timeout(10000),
   headers:{'content-type':'application/json','x-prime-lab':'GABY-LAB-COMERCIAL-V1'},
   body:JSON.stringify({pergunta:SEARCH_TERMS}),
  })
  if(!response.ok)return report('SHADOW_HTTP_ERROR',{
   catalog_status:'SHADOW_UNAVAILABLE',catalog_http_status:response.status,query:SEARCH_TERMS})
  body=await response.json().catch(()=>null)
 }catch{
  return report('SHADOW_NETWORK_ERROR',{catalog_status:'SHADOW_UNAVAILABLE',query:SEARCH_TERMS})
 }
 if(body?.sucesso!==true||!Array.isArray(body?.dados?.produtos))
  return report('SHADOW_INVALID_RESPONSE',{catalog_status:'INVALID_RESPONSE',
   catalog_http_status:response.status,query:SEARCH_TERMS})
 // All candidates are taken from real Shadow evidence, never invented.
 // Require model-family match; a "Vans" brand hit by itself is not sufficient.
 const seen=new Set()
 const list=sanitizeCandidates(body.dados.produtos,EVIDENCE)
  .filter(p=>/ultra\s*range/i.test(p.nome||''))
  .filter(p=>{const key=String(p.nome||'').toLowerCase();if(seen.has(key))return false;seen.add(key);return true})
  .slice(0,5)
 const names=list.map(x=>clean(x.nome)).filter(Boolean)
 const common={catalog_status:'READ_ONLY_OK',catalog_http_status:response.status,
  query:SEARCH_TERMS,candidate_count:list.length,candidate_names:names}
 if(!list.length)return report('SHADOW_NO_VERIFIED_FAMILY_MATCH',common)
 let decision
 try{
  jev_invocations=1
  decision=await jevFn({
   question:'Qual o valor?',
   visionQuery:SEARCH_TERMS,
   visionEvidence:{nome:EVIDENCE.description,tipo:EVIDENCE.category,
    marca:EVIDENCE.brand,cor:EVIDENCE.color},
   candidates:list,storyContextStatus:'FOUND_REAL_GABY_LAB_STORY',
   visionStatus:'VISION_PARSED_PREVIOUS_REAL_RUN',labModeOverride:'guard',
  })
 }catch{
  return report('JEV_EXCEPTION',{...common,jev_status:'unavailable',
   jev_reason:'JEV_EXCEPTION'})
 }
 const action=['ALLOW_AUTO','ASK_CLARIFY','BLOCK_ASSERTION'].includes(decision?.action)
  ?decision.action:'BLOCK_ASSERTION'
 // Internal JEV allow never equates to verified SKU/price/stock or permission to message.
 return report('SHADOW_JEV_RECORDED',{
  ...common,jev_status:clean(decision?.status)||'unavailable',
  jev_action:action,jev_reason:clean(decision?.reason)||'UNKNOWN',
  jev_confidence:possibleNumbers(decision?.confidence),
  jev_selected_candidate:clean(decision?.selectedCandidateId),
  jev_cost_usd:typeof decision?.costUsd==='number'&&Number.isFinite(decision.costUsd)
   ?decision.costUsd:null,
 })
}

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store')
 if(req.method!=='POST')return res.status(405).json({ok:false,status:'METHOD_NOT_ALLOWED'})
 if(!mediaProbeAuthorized(req))return res.status(401).json({ok:false,status:'LAB_AUTH_REQUIRED'})
 if(process.env.PRIME_CONTROL_STORY_SHADOW_JEV_ENABLED!=='true')
  return res.status(503).json({ok:false,status:'SHADOW_JEV_DISABLED'})
 if(String(req.headers['content-type']||'').split(';')[0].toLowerCase().trim()!=='application/json')
  return res.status(415).json({ok:false,status:'JSON_REQUIRED'})
 if(req.body?.confirm!=='ONE_SHOT_REAL_QA_SHADOW_JEV_V14D')
  return res.status(400).json({ok:false,status:'CONFIRM_REQUIRED'})
 const result=await runStoryShadowJevOnce()
 return res.status(result.status==='SHADOW_JEV_RECORDED'||result.status==='SHADOW_NO_VERIFIED_FAMILY_MATCH'?200:422)
  .json({ok:result.status==='SHADOW_JEV_RECORDED',...result})
}
