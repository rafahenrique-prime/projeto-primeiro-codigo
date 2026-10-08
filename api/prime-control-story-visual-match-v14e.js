/**
 * PRIME CONTROL V1.4E — single-image-pair Visual Match, QA LAB only.
 *
 * Uses the existing private GABY LAB Vercel Story media gate, the approved
 * Shadow V11 read-only product catalog, and the Render LAB OCR proxy.
 * A separate Visual Match call; does NOT re-run the V1.4D product extraction.
 * A model's self-reported confidence is never enough to assert an exact SKU.
 * No GABY replies, catalog mutations, JEV invocation or image persistence.
 */
import crypto from 'node:crypto'
import {loadVerifiedStoryMedia,mediaProbeAuthorized,imageSignatureOkay} from './prime-control-story-media-probe-v14d.js'
import {OBSERVED_STORY_FINGERPRINT,SHADOW_V11,SEARCH_TERMS} from './prime-control-story-shadow-jev-v14d.js'

export const VISUAL_MATCH_EVENT='PRIME_CONTROL_REAL_STORY_VISUAL_MATCH_V14E'
export const VISUAL_MATCH_MODEL='google/gemini-2.5-flash-lite'
export const MATCH_THRESHOLD=0.95
const catalogHosts=new Set(['cdn.dooca.store'])
const acceptableTypes=new Set(['image/jpeg','image/png','image/webp'])
const limitBytes=2*1024*1024
const attempted=new Set()
const clean=(v,n=150)=>typeof v==='string'?
 v.replace(/[\r\n\u0000-\u001f\u007f]/g,' ').trim().slice(0,n):null
export function resetVisualMatchAttemptsForTests(){attempted.clear()}

export function safeCatalogImage(raw){
 if(typeof raw!=='string'||raw.length>2048)return false
 try{
  const u=new URL(raw)
  return u.protocol==='https:'&&catalogHosts.has(u.hostname)&&
   (u.port===''||u.port==='443')&&!u.username&&!u.password&&!u.hash
 }catch{return false}
}
export function extractVansCandidate(raw){
 if(!Array.isArray(raw))return null
 const candidates=raw.filter(p=>p&&typeof p==='object'&&
  /vans/i.test(String(p.marca||''))&&/vans/i.test(String(p.nome||''))&&
  /ultra\s*range/i.test(String(p.nome||''))&&
  /bege/i.test(String(p.nome||''))&&safeCatalogImage(p.imagem))
 if(candidates.length!==1)return null
 const c=candidates[0]
 return {name:clean(c.nome,160),brand:clean(c.marca,65),url:c.imagem}
}
async function getBoundedPhoto(response,max=limitBytes){
 const length=Number(response.headers.get('content-length')||0)
 if(!Number.isFinite(length)||length<0||length>max||!response.body)return null
 const reader=response.body.getReader(),chunks=[]
 let n=0
 try{
  for(;;){
   const {done,value}=await reader.read()
   if(done)break
   n+=value.byteLength
   if(n>max)return null
   chunks.push(Buffer.from(value))
  }
  return n>=12?Buffer.concat(chunks,n):null
 }finally{await reader.cancel().catch(()=>{})}
}
export function parseVisualMatchOutput(text){
 if(typeof text!=='string'||text.length>6000)return null
 const raw=text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'')
 const start=raw.indexOf('{'),end=raw.lastIndexOf('}')
 if(start<0||end<start)return null
 try{
  const x=JSON.parse(raw.slice(start,end+1))
  const choice=String(x.choice||'').toUpperCase()
  const confidence=Number(x.confidence)
  if(!['C1','NONE'].includes(choice)||!Number.isFinite(confidence)||confidence<0||confidence>1)return null
  return {choice,confidence,reason:clean(x.reason,180)}
 }catch{return null}
}
export async function runRealStoryVisualMatchOnce({
 env=process.env,fetchImpl=fetch,loadMedia=loadVerifiedStoryMedia,logger=console.info,
}={}){
 const run_id=crypto.randomUUID()
 let shadow_calls=0,media_calls=0,catalog_image_calls=0,comparison_calls=0
 const report=(status,data={})=>{
  const result={
   event:VISUAL_MATCH_EVENT,run_id,status,mode:'LAB_READ_ONLY',
   story_fingerprint:OBSERVED_STORY_FINGERPRINT,
   shadow_calls,media_calls,catalog_image_calls,comparison_calls,
   old_vision_repeated:false,jev_calls:0,messages_sent:0,writes:0,
   catalog_status:data.catalog_status??null,visual_status:data.visual_status??null,
   candidate_name:data.candidate_name??null,
   candidate_photo_verified:data.candidate_photo_verified===true,
   choice:data.choice??'NONE',confidence:data.confidence??null,
   threshold:MATCH_THRESHOLD,model:VISUAL_MATCH_MODEL,
   reason:data.reason??null,
   input_tokens:data.input_tokens??null,output_tokens:data.output_tokens??null,
   cost_usd:data.cost_usd??null,exact_sku_verified:false,
   commercial_price_verified:false,physical_stock_verified:false,
   decision:'BLOCK_ASSERTION',next_action:'REVIEW_VISUAL_EVIDENCE_IN_LAB',
  }
  logger('[PrimeControlStoryVisualMatchV14E]',JSON.stringify(result))
  return result
 }
 if(env.PRIME_CONTROL_STORY_VISUAL_MATCH_ENABLED!=='true')return report('DISABLED')
 if(env.PRIME_CONTROL_STORY_VISUAL_MATCH_EXPECTED_FINGERPRINT!==OBSERVED_STORY_FINGERPRINT)
  return report('STORY_FINGERPRINT_MISMATCH')
 const proxyKey=String(env.LAB_PRODUCT_UNIVERSE_API_SECRET||'').trim()
 if(!proxyKey||!String(env.PRIME_CONTROL_STORY_RESOLVER_KEY||'').trim()||
  !String(env.PRIME_CONTROL_STORY_PILOT_CHAT_ID||'').trim())return report('CONFIG_MISSING')
 if(attempted.has(OBSERVED_STORY_FINGERPRINT))return report('ALREADY_ATTEMPTED')
 attempted.add(OBSERVED_STORY_FINGERPRINT)
 let candidate
 try{
  shadow_calls=1
  const res=await fetchImpl(SHADOW_V11,{
   method:'POST',redirect:'manual',cache:'no-store',
   headers:{'content-type':'application/json','x-prime-lab':'GABY-LAB-COMERCIAL-V1'},
   body:JSON.stringify({pergunta:SEARCH_TERMS}),signal:AbortSignal.timeout(10000),
  })
  if(!res.ok)return report('SHADOW_UNAVAILABLE',{catalog_status:'HTTP_ERROR'})
  const data=await res.json().catch(()=>null)
  if(data?.sucesso!==true||!Array.isArray(data?.dados?.produtos))
   return report('SHADOW_INVALID_RESPONSE',{catalog_status:'INVALID_RESPONSE'})
  candidate=extractVansCandidate(data.dados.produtos)
  if(!candidate)return report('CANDIDATE_IMAGE_NOT_UNIQUE_OR_MISSING',{catalog_status:'READ_ONLY_OK'})
 }catch{return report('SHADOW_NETWORK_ERROR')}
 let productImage=null,productMime=null
 try{
  catalog_image_calls=1
  const res=await fetchImpl(candidate.url,{method:'GET',redirect:'manual',
   cache:'no-store',signal:AbortSignal.timeout(6500)})
  if(!res.ok)return report('CANDIDATE_IMAGE_HTTP_ERROR',{catalog_status:'READ_ONLY_OK',
   candidate_name:candidate.name})
  productMime=String(res.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()
  if(!acceptableTypes.has(productMime))return report('CANDIDATE_IMAGE_TYPE_REJECTED',
   {catalog_status:'READ_ONLY_OK',candidate_name:candidate.name})
  productImage=await getBoundedPhoto(res)
  if(!productImage||!imageSignatureOkay(productImage,productMime))
   return report('CANDIDATE_IMAGE_INVALID',{catalog_status:'READ_ONLY_OK',
    candidate_name:candidate.name})
 }catch{return report('CANDIDATE_IMAGE_NETWORK_ERROR',{catalog_status:'READ_ONLY_OK',
  candidate_name:candidate.name})}
 let story
 try{
  media_calls=1
  story=await loadMedia({env,fetchImpl})
 }catch{return report('STORY_MEDIA_GATE_ERROR',{catalog_status:'READ_ONLY_OK',
  candidate_name:candidate.name,candidate_photo_verified:true})}
 if(story?.status!=='MEDIA_VERIFIED'||story.story_fingerprint!==OBSERVED_STORY_FINGERPRINT||
  !story.buffer||!acceptableTypes.has(story.media_type)||
  story.buffer.length>3*1024*1024||story.buffer.length<12||
  !imageSignatureOkay(story.buffer,story.media_type))
  return report('STORY_MEDIA_NOT_VERIFIED',{catalog_status:'READ_ONLY_OK',
   candidate_name:candidate.name,candidate_photo_verified:true})
 const port=Number(env.PORT||10000)
 if(!Number.isInteger(port)||port<1||port>65535)
  return report('LOCAL_PROXY_CONFIG_INVALID',{catalog_status:'READ_ONLY_OK',
   candidate_name:candidate.name,candidate_photo_verified:true})
 const prompt=[
  'Você é um comparador visual de tênis. A imagem 1 é o Story REAL do Instagram QA.',
  'A imagem 2 é a foto do único candidato retornado no catálogo Shadow PRIME.',
  'Compare materialmente solado, entressola, biqueira, painel lateral, amarração, padrão do logo, costuras e combinação de cores.',
  'Ignore textos, nomes do produto, legendas, fundo, iluminação e ângulo. A etiqueta UltraRange Neo nunca é prova de identidade.',
  'Mesmo sendo Vans UltraRange em ambas as imagens, podem ser modelos ou versões diferentes.',
  'Escolha C1 SOMENTE se houver correspondência visual forte do MESMO modelo físico.',
  'Se houver diferença importante, dúvida, foto insuficiente ou ambiguidade, escolha NONE.',
  'Responda SOMENTE JSON: {"choice":"C1|NONE","confidence":0.0,"reason":"diferenças/similaridades visíveis"}.',
  'O valor confidence é estimativa de semelhança visual, não disponibilidade, preço ou verificação de SKU.',
 ].join(' ')
 let http=null
 try{
  comparison_calls=1
  const r=await fetchImpl(`http://127.0.0.1:${port}/api/supplier-harness-ocr-proxy`,{
   method:'POST',redirect:'manual',signal:AbortSignal.timeout(19000),
   headers:{'content-type':'application/json','x-prime-lab-secret':proxyKey},
   body:JSON.stringify({model:VISUAL_MATCH_MODEL,max_tokens:230,temperature:0.1,
    messages:[{role:'user',content:[
     {type:'text',text:prompt},
     {type:'image_url',image_url:{url:`data:${story.media_type};base64,${story.buffer.toString('base64')}`}},
     {type:'image_url',image_url:{url:`data:${productMime};base64,${productImage.toString('base64')}`}},
    ]}]}),
  })
  http=r.status
  if(!r.ok)return report('VISUAL_PROXY_HTTP_ERROR',{catalog_status:'READ_ONLY_OK',
   candidate_name:candidate.name,candidate_photo_verified:true})
  const body=await r.json().catch(()=>null)
  const parsed=parseVisualMatchOutput(body?.choices?.[0]?.message?.content)
  const usage=body?.usage||{}
  const extra={
   catalog_status:'READ_ONLY_OK',candidate_name:candidate.name,
   candidate_photo_verified:true,choice:parsed?.choice||'NONE',
   confidence:parsed?.confidence??null,reason:parsed?.reason??null,
   visual_status:parsed?'PARSED':'INVALID_RESPONSE',
   input_tokens:Number.isFinite(usage.prompt_tokens)?usage.prompt_tokens:null,
   output_tokens:Number.isFinite(usage.completion_tokens)?usage.completion_tokens:null,
   cost_usd:Number.isFinite(usage.cost)?usage.cost:null,
  }
  if(!parsed)return report('VISUAL_INVALID_RESPONSE',extra)
  if(parsed.choice==='C1'&&parsed.confidence>=MATCH_THRESHOLD)
   return report('STRONG_VISUAL_CANDIDATE_REVIEW_REQUIRED',extra)
  return report(parsed.choice==='NONE'?'NO_VISUAL_MATCH':'VISUAL_UNCERTAIN',extra)
 }catch{
  return report('VISUAL_NETWORK_OR_TIMEOUT',{catalog_status:'READ_ONLY_OK',
   candidate_name:candidate.name,candidate_photo_verified:true})
 }
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store')
 if(req.method!=='POST')return res.status(405).json({ok:false,status:'METHOD_NOT_ALLOWED'})
 if(!mediaProbeAuthorized(req))return res.status(401).json({ok:false,status:'LAB_AUTH_REQUIRED'})
 if(process.env.PRIME_CONTROL_STORY_VISUAL_MATCH_ENABLED!=='true')
  return res.status(503).json({ok:false,status:'VISUAL_MATCH_DISABLED'})
 if(String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/json')
  return res.status(415).json({ok:false,status:'JSON_REQUIRED'})
 if(req.body?.confirm!=='ONE_SHOT_VISUAL_MATCH_REAL_STORY_V14E')
  return res.status(400).json({ok:false,status:'CONFIRM_REQUIRED'})
 const r=await runRealStoryVisualMatchOnce()
 return res.status(['STRONG_VISUAL_CANDIDATE_REVIEW_REQUIRED','NO_VISUAL_MATCH','VISUAL_UNCERTAIN'].includes(r.status)?200:422)
  .json({ok:r.status==='STRONG_VISUAL_CANDIDATE_REVIEW_REQUIRED',...r})
}
