/**
 * PRIME CONTROL V1.4C — Vans Story screenshot replay, LAB-only.
 * Cropped user's screenshot supplied TEMPORARILY via protected Render env var.
 * No public image URI; no image bytes, prompt or customer data in logs.
 * Read-only catalogue query uses gaby-lab-shadow-catalog-v11 (audited GET DB only).
 * Not a webhook event or a real Instagram Story ID.
 */
import crypto from 'node:crypto'
import { decideStoryWithJev } from './_jevStoryDecision.js'
import { buildStoryHandoffTrace, emitStoryHandoffTrace } from './_storyHandoffTrace.js'

export const VANS_CASE='VANS_STORY_SCREENSHOT_CROP_V14C'
const SHADOW='https://mbbgqasvssueirynnoyk.supabase.co/functions/v1/gaby-lab-shadow-catalog-v11'
const VISUAL_MODEL='google/gemini-2.5-flash-lite'

function norm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()}
function take(v,n=140){return typeof v==='string'?v.slice(0,n).trim():''}
export function allowed(req,env=process.env){
  const key=String(env.PRIME_CONTROL_STORY_LAB_SHARED_KEY||'').trim()
  return Boolean(key&&req?.headers?.['x-prime-control-story-key']===key
    &&req?.headers?.['x-prime-lab']==='GABY-LAB-COMERCIAL-V1')
}
export function decodeFixture(env=process.env){
  const raw=String(env.PRIME_CONTROL_VANS_STORY_IMAGE_B64||'').trim()
  if(!raw||raw.length>375_000||!new RegExp('^[A-Za-z0-9+/]+={0,2}$').test(raw))return null
  const bytes=Buffer.from(raw,'base64')
  if(bytes.length<2500||bytes.length>280_000||bytes[0]!==0xff||bytes[1]!==0xd8||bytes[2]!==0xff)return null
  return {bytes,mime:'image/jpeg',sha:crypto.createHash('sha256').update(bytes).digest('hex')}
}
export function parseEvidence(text){
  if(typeof text!=='string'||text.length>5000)return null
  const first=text.indexOf('{'),last=text.lastIndexOf('}')
  if(first<0||last<first)return null
  try{
    const x=JSON.parse(text.slice(first,last+1))
    const category=take(x.category,60),brand=take(x.brand,70),model=take(x.model,90)
    const color=take(x.color,80),description=take(x.description,200)
    if(!category||!description)return null
    return {category,brand,model,color,description}
  }catch{return null}
}
export function searchTerms(evidence){
  if(!evidence)return null
  const cat=norm(evidence.category), brand=norm(evidence.brand)
  if(!(/tenis|sneaker|calcado/.test(cat)&&/vans/.test(brand)))return null
  // Do not add "Neo" unless Vision explicitly recognized it.
  const model=norm(evidence.model)
  const color=norm(evidence.color)
  const words=['tênis','Vans']
  if(/ultra\s*range/.test(model))words.push('Ultrarange')
  if(/\bneo\b/.test(model))words.push('Neo')
  if(/bege|marrom|creme|off white|cream|tan/.test(color))words.push('bege')
  return words.join(' ')
}
export function sanitizeCandidates(raw,evidence){
  const arr=Array.isArray(raw)?raw:[]
  const items=arr.filter(x=>x&&typeof x==='object'&&/vans/i.test(String(x.marca||x.nome||'')))
    .slice(0,5).map(x=>{
      const title=take(x.nome,180),model=norm(evidence?.model),color=norm(evidence?.color)
      let score=35
      if(/ultra\s*range/.test(model)&&/ultra\s*range/.test(norm(title)))score+=25
      if(/\bneo\b/.test(model)&&/\bneo\b/.test(norm(title)))score+=15
      if(/bege|marrom|creme|off white|cream|tan/.test(color)&&/bege|marrom|creme/.test(norm(title)))score+=10
      return {nome:title,marca:take(x.marca,80),categoria:take(x.categoria,70),score}
    })
  return items
}
export async function runVansStoryLab({env=process.env,fetchImpl=fetch,jevFn=decideStoryWithJev,startedAt=Date.now()}={}){
  const run_id=crypto.randomUUID()
  const fixture=decodeFixture(env)
  if(!fixture)return {ok:false,status:'IMAGE_NOT_CONFIGURED',stage:'MEDIA_GATE',run_id}
  const visionSecret=String(env.LAB_PRODUCT_UNIVERSE_API_SECRET||'').trim()
  if(!visionSecret)return {ok:false,status:'VISION_PROXY_NOT_CONFIGURED',stage:'VISION_GATE',run_id}
  let vision=null,vision_http=null,vision_error=null
  try{
    const r=await fetchImpl(`http://127.0.0.1:${Number(env.PORT||10000)}/api/supplier-harness-ocr-proxy`,{
      method:'POST',signal:AbortSignal.timeout(16000),
      headers:{'content-type':'application/json','x-prime-lab-secret':visionSecret},
      body:JSON.stringify({model:VISUAL_MODEL,max_tokens:230,temperature:0,
        messages:[{role:'user',content:[
          {type:'text',text:'Analise SOMENTE o tênis visível nesta imagem de teste. Responda apenas um objeto JSON com category, brand, model, color, description. Escreva unknown quando modelo ou marca não forem confirmáveis visualmente. Ignore textos de interface do Instagram. Nunca invente preço ou estoque.'},
          {type:'image_url',image_url:{url:`data:image/jpeg;base64,${fixture.bytes.toString('base64')}`}},
        ]}]}),
    })
    vision_http=r.status
    if(r.ok){const body=await r.json().catch(()=>null);vision=parseEvidence(body?.choices?.[0]?.message?.content)}
  }catch(e){vision_error=e?.name==='TimeoutError'?'TIMEOUT':'NETWORK'}
  const query=searchTerms(vision)
  let catalog_status='NOT_QUERIED',candidates=[],catalog_http=null
  if(query){
    try{
      const r=await fetchImpl(SHADOW,{
        method:'POST',signal:AbortSignal.timeout(9000),
        headers:{'content-type':'application/json','x-prime-lab':'GABY-LAB-COMERCIAL-V1'},
        body:JSON.stringify({pergunta:query})
      })
      catalog_http=r.status
      const body=await r.json().catch(()=>null)
      if(r.ok&&body?.sucesso===true){
        candidates=sanitizeCandidates(body?.dados?.produtos,vision)
        catalog_status='READ_ONLY_OK'
      }else catalog_status='SHADOW_ERROR'
    }catch{catalog_status='SHADOW_NETWORK_ERROR'}
  }
  let jev={status:'not_attempted',action:'BLOCK_ASSERTION',reason:'NO_VERIFIED_CANDIDATES'}
  if(candidates.length){
    try{
      jev=await jevFn({
        question:'Qual o valor desse tênis do Story?',
        visionQuery:query,visionEvidence:{
          nome:vision.description,tipo:vision.category,marca:vision.brand,cor:vision.color
        },
        candidates,storyContextStatus:'SCREENSHOT_CROP_LAB_NO_STORY_ID',
        visionStatus:'success',labModeOverride:'guard',
      })
    }catch{jev={status:'unavailable',action:'BLOCK_ASSERTION',reason:'JEV_EXCEPTION'}}
  }
  const safe_action=jev.status==='ok'&&jev.action==='ALLOW_AUTO'?'ALLOW_AUTO':
    jev.status==='ok'&&jev.action==='ASK_CLARIFY'?'ASK_CLARIFY':'BLOCK_ASSERTION'
  const payload={
    version:'prime-control.v1.4c.vans-screenshot',
    run_id,scope:'LAB_ONLY',scenario:VANS_CASE,
    source:'USER_SCREENSHOT_CROP_PRIVATE_ENV',actual_instagram_story:false,
    native_instagram_story_id:null,image_sha256:fixture.sha,
    vision:{model:VISUAL_MODEL,status:vision?'SUCCESS':'UNAVAILABLE_OR_UNCERTAIN',
      provider_http_status:vision_http,error_class:vision_error,
      category:vision?.category||null,brand:vision?.brand||null,
      identified_model:vision?.model||null,color:vision?.color||null},
    catalog:{status:catalog_status,source:'GABY_LAB_SHADOW_CATALOG_V11_READ_ONLY',
      http_status:catalog_http,search_query:query,candidates:candidates.length,
      candidate_names:candidates.map(x=>x.nome),live_prices_checked:false,
      physical_stock_checked:false},
    jev:{status:jev.status,action:safe_action,reason:jev.reason||null,
      executed:candidates.length>0&&jev.status!=='disabled'&&jev.reason!=='OPENROUTER_NOT_CONFIGURED',
      confidence:jev.confidence??null,selectedCandidateId:jev.selectedCandidateId??null,
      cost_usd:jev.costUsd??null},
    safe_customer_answer:safe_action==='ALLOW_AUTO'
      ? 'Candidato de catálogo encontrado, mas preço atual e estoque físico requerem confirmação.'
      : 'Preciso confirmar qual é o modelo antes de informar preço ou estoque.',
    duration_ms:Date.now()-startedAt,
  }
  const trace=buildStoryHandoffTrace({
    correlationId:run_id,storyId:'SCREENSHOT_CROP_LAB_NO_STORY_ID',storyContextStatus:'SCREENSHOT_CROP_LAB',
    visionStatus:vision?'success':'unavailable',catalogStageReached:catalog_status==='READ_ONLY_OK',
    searchContextUsed:'shadow_v11_read_only',fallbackUsed:safe_action!=='ALLOW_AUTO',
    candidateCount:candidates.length,jevMode:'guard',jevStatus:jev.status,
    jevAction:safe_action,jevReason:jev.reason,responsePayload:payload,
    requestStartedAtMs:startedAt,
  })
  emitStoryHandoffTrace(trace)
  const ok=Boolean(vision&&catalog_status==='READ_ONLY_OK'&&candidates.length&&jev.status==='ok')
  console.info('[PrimeControlVansStoryV14C]',JSON.stringify({
    event:'PRIME_CONTROL_VANS_SCREENSHOT_LAB_V14C',
    run_id,image_sha256:fixture.sha,vision_status:payload.vision.status,
    catalog_status,candidates_count:candidates.length,
    jev_status:jev.status,jev_action:safe_action,
    payload_sha256:trace.payload_sha256,actual_instagram_story:false,ok,
  }))
  return {ok,status:ok?'LAB_VANS_TRACE_OK':'LAB_VANS_TRACE_PARTIAL',
    stage:ok?'TOOL_RESPONSE_READY':'GATE_STOP',run_id,trace_sha256:trace.payload_sha256,result:payload}
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store')
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'})
  if(!allowed(req))return res.status(401).json({ok:false,error:'LAB_AUTH_REQUIRED'})
  if(process.env.PRIME_CONTROL_VANS_STORY_ENABLED!=='true')
    return res.status(503).json({ok:false,error:'VANS_LAB_DISABLED'})
  if(req.body?.case!==VANS_CASE||req.body?.confirm!=='RUN_VANS_SCREENSHOT_LAB_V14C')
    return res.status(400).json({ok:false,error:'INVALID_CASE'})
  const outcome=await runVansStoryLab()
  return res.status(outcome.ok?200:422).json(outcome)
}
