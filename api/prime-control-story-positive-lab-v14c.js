// PRIME CONTROL V1.4C: positive LAB fixture, never a live Instagram Story.
import crypto from 'node:crypto'
import { decideStoryWithJev } from './_jevStoryDecision.js'
import { buildStoryHandoffTrace, emitStoryHandoffTrace } from './_storyHandoffTrace.js'

export const CASE = 'NB9060_BRANCO_LAB'
export const PHOTO = 'https://cdn.dooca.store/161486/products/9060-branco02_450x600.jpeg?v=1738420894'
export const FIXTURE = Object.freeze([
  { nome: 'New Balance 9060 Branco', marca: 'New Balance', categoria: 'Tênis', score: 88 },
  { nome: 'Nike Dunk Branco', marca: 'Nike', categoria: 'Tênis', score: 12 },
])

export function authorized(req, env=process.env) {
  const want=String(env.PRIME_CONTROL_STORY_LAB_SHARED_KEY||'')
  return Boolean(want && req?.headers?.['x-prime-control-story-key']===want &&
    req?.headers?.['x-prime-lab']==='GABY-LAB-COMERCIAL-V1')
}

export function visionEvidence(raw) {
  if(typeof raw!=='string'||raw.length>3000)return null
  try{
    const v=JSON.parse(raw.trim().replace(/^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$/g,''))
    if(!v||typeof v!=='object'||Array.isArray(v))return null
    const brand=String(v.brand||'').trim().slice(0,70)
    const model=String(v.model||'').trim().slice(0,70)
    const color=String(v.color||'').trim().slice(0,70)
    const category=String(v.category||'').trim().slice(0,70)
    if(!category||!brand||!model)return null
    return {brand,model,color,category}
  }catch{return null}
}
const simplify=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
export function labCandidates(evidence) {
  if(!evidence)return []
  if(!/tenis|sneaker/.test(simplify(evidence.category)))return []
  if(!/new balance/.test(simplify(evidence.brand)))return []
  if(!/\b9060\b/.test(simplify(evidence.model)))return []
  return FIXTURE.map(x=>({...x}))
}

export async function positiveReplay({fetchImpl=fetch,jevFn=decideStoryWithJev,env=process.env}={}) {
  const run=crypto.randomUUID(),start=Date.now()
  let photo, mime
  try{
    const r=await fetchImpl(PHOTO,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(7000)})
    mime=String(r.headers.get('content-type')||'').split(';')[0].toLowerCase()
    if(!r.ok||!['image/jpeg','image/png','image/webp'].includes(mime)||Number(r.headers.get('content-length')||0)>700000)
      return {ok:false,stage:'MEDIA_GATE',status:'MEDIA_UNAVAILABLE',run_id:run}
    photo=Buffer.from(await r.arrayBuffer())
    const signatureOk= mime==='image/jpeg'
      ? photo[0]===255&&photo[1]===216&&photo[2]===255
      : mime==='image/png'
        ? photo.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
        : photo.toString('ascii',0,4)==='RIFF'&&photo.toString('ascii',8,12)==='WEBP'
    if(photo.length<16||photo.length>700000||!signatureOk)
      return {ok:false,stage:'MEDIA_GATE',status:'MEDIA_INVALID',run_id:run}
  }catch{return {ok:false,stage:'MEDIA_GATE',status:'MEDIA_NETWORK_ERROR',run_id:run}}

  const key=String(env.LAB_PRODUCT_UNIVERSE_API_SECRET||'')
  if(!key)return {ok:false,stage:'VISION_GATE',status:'VISION_PROXY_UNAVAILABLE',run_id:run}

  let evidence=null,visionHttp=null
  try{
    const r=await fetchImpl(`http://127.0.0.1:${Number(env.PORT||10000)}/api/supplier-harness-ocr-proxy`,{
      method:'POST',
      headers:{'content-type':'application/json','x-prime-lab-secret':key},
      body:JSON.stringify({
        model:'google/gemini-2.5-flash-lite',max_tokens:180,temperature:0,
        messages:[{role:'user',content:[
          {type:'text',text:'Observe apenas o calçado nesta imagem e responda SOMENTE um objeto JSON com category, brand, model e color. Se não for possível confirmar marca/modelo visualmente, escreva unknown. Não estime preço, estoque ou tamanho.'},
          {type:'image_url',image_url:{url:`data:${mime};base64,${photo.toString('base64')}`}},
        ]}],
      }),
      signal:AbortSignal.timeout(14000),
    })
    visionHttp=r.status
    if(r.ok){const body=await r.json();evidence=visionEvidence(body?.choices?.[0]?.message?.content)}
  }catch{}

  const candidates=labCandidates(evidence)
  let jev={status:'not_attempted',action:'BLOCK_ASSERTION',reason:'NO_VISION_MATCH'}
  if(candidates.length){
    try{
      jev=await jevFn({
        question:'Qual o valor desse tenis do Story?',
        visionQuery:[evidence.brand,evidence.model,evidence.color].join(' '),
        candidates,storyContextStatus:'LAB_FIXTURE',visionStatus:'success',
        labModeOverride:'guard',
      })
    }catch{jev={status:'unavailable',action:'BLOCK_ASSERTION',reason:'JEV_EXCEPTION'}}
  }
  const action=jev.status==='ok'&&jev.action==='ALLOW_AUTO'?'ALLOW_AUTO': 'BLOCK_ASSERTION'
  const payload={
    version:'prime-control.story-positive-lab.v1.4c',run_id:run,
    scope:'LAB_ONLY',scenario:CASE,actual_instagram_story:false,
    photo_sha256:crypto.createHash('sha256').update(photo).digest('hex'),
    vision:{status:evidence?'SUCCESS':'UNCERTAIN',provider_http_status:visionHttp,
      brand:evidence?.brand||null,model:evidence?.model||null,color:evidence?.color||null},
    catalog:{source:'FIXTURE_ONLY',candidates:candidates.length,prices_checked:false,stock_checked:false},
    jev:{status:jev.status,executed:jev.status!=='not_attempted'&&jev.reason!=='OPENROUTER_NOT_CONFIGURED',
      action,reason:jev.reason||null,selected_candidate:action==='ALLOW_AUTO'?jev.selectedCandidateId:null,
      cost_usd:jev.costUsd??null},
    safe_reply:action==='ALLOW_AUTO'
      ? 'Há um candidato de laboratório. Não confirmar preço nem estoque sem consulta comercial.'
      : 'Peça confirmação do modelo; não informe preço ou estoque.',
    duration_ms:Date.now()-start,
  }
  const trace=buildStoryHandoffTrace({
    correlationId:run,storyId:'LAB_FIXTURE_NO_INSTAGRAM_STORY',
    storyContextStatus:'LAB_FIXTURE',visionStatus:evidence?'success':'unavailable',
    catalogStageReached:true,searchContextUsed:'lab_fixture_positive',candidateCount:candidates.length,
    fallbackUsed:action!=='ALLOW_AUTO',jevMode:'guard',jevStatus:jev.status,
    jevAction:action,jevReason:jev.reason,responsePayload:payload,requestStartedAtMs:start,
  })
  emitStoryHandoffTrace(trace)
  console.info('[PrimeControlPositiveV14C]',JSON.stringify({
    event:'PRIME_CONTROL_POSITIVE_LAB',run_id:run,vision_status:payload.vision.status,
    candidates_count:candidates.length,jev_status:jev.status,jev_action:action,
    actual_instagram_story:false,trace_sha256:trace.payload_sha256,
  }))
  const ok=Boolean(evidence&&candidates.length&&jev.status==='ok')
  return {ok,status:ok?'LAB_POSITIVE_OK':'LAB_POSITIVE_PARTIAL',
    stage:ok?'TOOL_RESPONSE_READY':'GATE_STOP',run_id:run,trace_sha256:trace.payload_sha256,result:payload}
}

export default async function handler(req,res) {
  res.setHeader('cache-control','no-store')
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'})
  if(!authorized(req))return res.status(401).json({ok:false,error:'LAB_AUTH_REQUIRED'})
  if(process.env.PRIME_CONTROL_STORY_LAB_POSITIVE_ENABLED!=='true')
    return res.status(503).json({ok:false,error:'LAB_POSITIVE_DISABLED'})
  if(req.body?.case!==CASE||req.body?.confirm!=='RUN_POSITIVE_STORY_LAB_V14C')
    return res.status(400).json({ok:false,error:'INVALID_LAB_CASE'})
  const result=await positiveReplay()
  return res.status(result.ok?200:422).json(result)
}
