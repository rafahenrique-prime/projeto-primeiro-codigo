/**
 * PRIME CONTROL V1.4C — lab-only synthetic Instagram Story metadata gate.
 * Calls the REAL getStoryContext code with an injected in-memory GPTMaker fetch.
 * No Instagram, GPTMaker, image, OCR, catalog, JEV, customer, DB or network calls.
 */
import crypto from 'node:crypto'
import { getStoryContext } from './_storyContext.js'
import { buildStoryHandoffTrace } from './_storyHandoffTrace.js'

export const CASE='NATIVE_METADATA_VANS_V14C'
const BASE=1_700_000_000_000
const ST='LAB_VANS_STORY_SYNTHETIC_B'
const URL='https://lab.invalid/fixture/vans-only-never-fetched.jpg'

export function authorized(req,env=process.env){
 const key=String(env.PRIME_CONTROL_STORY_LAB_SHARED_KEY||'').trim()
 return Boolean(key && req?.headers?.['x-prime-control-story-key']===key &&
   req?.headers?.['x-prime-lab']==='GABY-LAB-COMERCIAL-V1')
}
function exampleMessages(which){
 const old={role:'user',time:BASE,text:'Quanto custa o Nike?',metadata:{
   storyId:'LAB_OLD_STORY_IGNORE',storyMediaUrl:'https://lab.invalid/old-never-fetched.jpg',
   storyMediaType:'image'}}
 const current={role:'user',time:BASE+60_000,text:'Qual o valor?',metadata:{
   storyId:ST,storyMediaUrl:URL,storyMediaType:'image'}}
 if(which==='LATEST')return [old,{role:'assistant',time:BASE+20000,text:'Outro produto'},current]
 if(which==='CONTINUATION')return [old,current,
   {role:'user',time:BASE+180_000,text:'tem 42?',metadata:null}]
 if(which==='EXPIRED')return [old,current,
   {role:'user',time:BASE+60_000+5*60_000+1,text:'Tem 42?',metadata:null}]
 if(which==='NEW_IMAGE')return [old,current,
   {role:'user',time:BASE+120_000,text:'',type:'IMAGE',imageUrl:'https://gpt-files.com/lab-vans-reupload-never-fetched.jpg',metadata:{}}]
 if(which==='LONG_MESSAGE')return [old,current,
   {role:'user',time:BASE+120_000,text:'Agora quero ver outro produto completamente diferente',metadata:null}]
 throw Error('INVALID_SCENARIO')
}

export async function simulateNativeStoryMetadata({
 fetchImpl=null, token='LAB_FIXTURE_TOKEN', cases=['LATEST','CONTINUATION','EXPIRED','NEW_IMAGE','LONG_MESSAGE'],
}={}){
 const run_id=crypto.randomUUID()
 const results=[]
 let gptMakerFetches=0,externalCalls=0
 for(const name of cases){
   const fakeFetch=fetchImpl|| (async (url,options)=>{
     // The simulated GPTMaker GET is the ONLY allowed fake request.
     gptMakerFetches++
     if(url!==`https://api.gptmaker.ai/v2/chat/lab-vans-metadata-${name}/messages` ||
       options?.headers?.Authorization!==`Bearer ${token}`)throw Error('UNEXPECTED_FETCH')
     return {ok:true,json:async()=>exampleMessages(name)}
   })
   // Injected fetch never uses network in the runtime probe.
   const context=await getStoryContext(`lab-vans-metadata-${name}`,{token,fetchImpl:fakeFetch})
   let pass=false
   if(name==='LATEST')pass=context.status==='FOUND'&&context.storyId===ST
     &&context.source==='story_message'&&context.currentUserText==='Qual o valor?'
   if(name==='CONTINUATION')pass=context.status==='FOUND'&&context.storyId===ST
     &&context.source==='story_continuation'&&context.currentUserText==='tem 42?'
   if(name==='EXPIRED'||name==='LONG_MESSAGE')pass=context.status==='NO_STORY_IN_LATEST_MESSAGE'
   if(name==='NEW_IMAGE')pass=context.status==='FOUND'&&context.storyId===null&&context.source==='user_image'
   results.push({scenario:name,passed:pass,story_status:context.status,
     source:context.source||null,selected_story_is_current:context.storyId===ST,
     native_story_id_present:typeof context.storyId==='string'&&context.storyId===ST})
 }
 const all_passed=results.every(x=>x.passed)
 const payload={
   stage:'SYNTHETIC_STORY_METADATA_ONLY',run_id,scope:'LAB_ONLY',
   story_id_source:'SIMULATED_METADATA',
   actual_instagram_delivery:false,vision_executed:false,
   catalog_queried:false,jev_executed:false,mcp_called:false,
   results,
 }
 const trace=buildStoryHandoffTrace({
   correlationId:run_id,storyId:ST,storyContextStatus:'LAB_SIMULATED_METADATA',
   visionStatus:'not_attempted',catalogStageReached:false,
   searchContextUsed:'none',fallbackUsed:false,
   candidateCount:0,jevMode:'off',jevStatus:'not_attempted',
   jevAction:'BLOCK_ASSERTION',jevReason:'SYNTHETIC_METADATA_ONLY',
   responsePayload:payload,requestStartedAtMs:Date.now(),
 })
 // No raw media URL, token, chat ID, user text or customer data in return/logs.
 console.info('[PrimeControlNativeStoryLab]',JSON.stringify({
   event:'PRIME_CONTROL_NATIVE_STORY_METADATA_V14C',
   run_id,ok:all_passed,cases:results.map(x=>({scenario:x.scenario,pass:x.passed,status:x.story_status,source:x.source})),
   simulated_fetches:gptMakerFetches,external_calls:externalCalls,
   trace_sha256:trace.payload_sha256,
   actual_instagram_delivery:false,
 }))
 return {ok:all_passed,run_id,scenario:CASE,cases:results,
   simulated_fetches:gptMakerFetches,external_calls:externalCalls,
   image_analysis_calls:0,catalog_calls:0,jev_calls:0,client_messages_sent:0,
   actual_instagram_delivery:false,
   story_id_source:'SIMULATED_METADATA',
   trace_sha256:trace.payload_sha256}
}

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store')
 if(req.method!=='POST')return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'})
 if(!authorized(req))return res.status(401).json({ok:false,error:'LAB_AUTH_REQUIRED'})
 if(process.env.PRIME_CONTROL_NATIVE_STORY_SIM_ENABLED!=='true')
   return res.status(503).json({ok:false,error:'LAB_NATIVE_SIM_DISABLED'})
 if(req.body?.case!==CASE||req.body?.confirm!=='RUN_NATIVE_METADATA_SIM_V14C')
   return res.status(400).json({ok:false,error:'INVALID_CASE'})
 const result=await simulateNativeStoryMetadata()
 return res.status(result.ok?200:422).json(result)
}
