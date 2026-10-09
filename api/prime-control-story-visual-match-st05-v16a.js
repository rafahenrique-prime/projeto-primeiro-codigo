/**
 * PRIME CONTROL V1.6A — one-shot ST05 Story-to-catalog visual comparison.
 * Render LAB only; read-only catalog image snapshot, private archived media,
 * one multimodal model call, and no messages, JEV, writes, price or stock claims.
 */
import crypto from 'node:crypto'
import {imageSignatureOkay, loadVerifiedStoryMedia, mediaProbeAuthorized} from './prime-control-story-media-probe-v14d.js'

export const ST05_FINGERPRINT='5d3d446628685d6c6c0f5b02'
export const ST05_VISUAL_EVENT='PRIME_CONTROL_ST05_VISUAL_MATCH_V16A'
export const ST05_VISUAL_MODEL='google/gemini-2.5-flash-lite'
export const ST05_MATCH_THRESHOLD=0.95
export const ST05_CANDIDATES=Object.freeze([
  Object.freeze({id:'6799c3c9-e31a-4fe7-b354-a64042de36b5',bagyProductId:7581704,name:'Calça Jeans Diesel 009',brand:'Diesel',category:'Calças Jeans',image:'https://cdn.dooca.store/161486/products/photo-2024-10-25-09-29-20.jpg?v=1731549518',sourceCapturedAt:'2026-08-19T02:33:21.883735Z',lastSeenAt:'2026-08-21T23:21:44.435Z'}),
  Object.freeze({id:'19a26fb7-7877-44d4-b29c-c5d387628f95',bagyProductId:8673120,name:'Calça Jeans Diesel 02',brand:'Diesel',category:'Calças Jeans',image:'https://cdn.dooca.store/161486/products/disel-032132.jpeg?v=1748021583',sourceCapturedAt:'2026-08-19T02:33:18.810560Z',lastSeenAt:'2026-08-21T23:21:43.895Z'}),
  Object.freeze({id:'5731bba5-2a87-4ac0-a317-1f88beb7185c',bagyProductId:8673130,name:'Calça Jeans Diesel 03',brand:'Diesel',category:'Calças Jeans',image:'https://cdn.dooca.store/161486/products/diesel011.jpeg?v=1748021620',sourceCapturedAt:'2026-08-19T02:33:17.666277Z',lastSeenAt:'2026-08-21T23:21:43.726Z'}),
  Object.freeze({id:'cb50667a-7981-4e62-8125-bf6e02bfc9a7',bagyProductId:10586482,name:'Calça Jeans Diesel Azul Clara Destroyed Masculina',brand:'Diesel',category:'Calças Jeans',image:'https://cdn.dooca.store/161486/products/calcajeans-uherx.jpg?v=1789850118',sourceCapturedAt:'2026-09-26T19:59:29.509965Z',lastSeenAt:null}),
  Object.freeze({id:'5c5bbd7d-1d10-433d-870f-7c80f7375ff3',bagyProductId:8673090,name:'Calça Jeans Diesel Clara',brand:'Diesel',category:'Calças Jeans',image:'https://cdn.dooca.store/161486/products/diesel-03-01-032.jpeg?v=1748021502',sourceCapturedAt:'2026-08-19T02:33:20.923075Z',lastSeenAt:'2026-08-21T23:21:44.258Z'}),
  Object.freeze({id:'b815662a-d05a-4d9c-ab19-b57aac0551e5',bagyProductId:8673172,name:'Calça Jeans Diesel Jeans',brand:'Diesel',category:'Calças Jeans',image:'https://cdn.dooca.store/161486/products/5zivcnx-2d973b80942410197f17478537009040-1024-1024.jpeg?v=1748021852',sourceCapturedAt:'2026-08-19T02:33:13.096149Z',lastSeenAt:'2026-08-21T23:21:42.848Z'}),
  Object.freeze({id:'a4deb17a-15be-47f1-adbc-8dc43631534d',bagyProductId:7595356,name:'Calça Jeans Masculina Diesel Preta',brand:'Diesel',category:'Calças Jeans',image:'https://cdn.dooca.store/161486/products/img-7643.jpg?v=1731888051',sourceCapturedAt:'2026-08-19T02:38:43.093134Z',lastSeenAt:'2026-08-21T23:22:43.533Z'}),
])
const ACCEPTED_TYPES=new Set(['image/jpeg','image/png','image/webp'])
const MAX_CANDIDATE_BYTES=1100*1024
const MAX_CANDIDATE_SET_BYTES=5600*1024
const MAX_PROXY_JSON_BYTES=11*1024*1024
const attempted=new Set()
const clean=(v,n=180)=>typeof v==='string'?v.replace(/[\r\n\u0000-\u001f\u007f]/g,' ').trim().slice(0,n):null

export function resetSt05VisualAttemptsForTests(){attempted.clear()}
export function safeSt05CatalogImage(raw){
  if(typeof raw!=='string'||raw.length>2048)return false
  try{
    const u=new URL(raw)
    return u.protocol==='https:'&&u.hostname==='cdn.dooca.store'&&
      (u.port===''||u.port==='443')&&!u.username&&!u.password&&!u.hash&&
      u.pathname.startsWith('/161486/products/')
  }catch{return false}
}
export function validSt05CandidateManifest(candidates=ST05_CANDIDATES){
  if(!Array.isArray(candidates)||candidates.length!==7)return false
  const ids=new Set()
  return candidates.every(c=>{
    if(!c||typeof c!=='object'||typeof c.id!=='string'||ids.has(c.id))return false
    ids.add(c.id)
    return Number.isInteger(c.bagyProductId)&&/diesel/i.test(c.brand||'')&&
      /cal[cç]a/i.test(c.name||'')&&/jeans/i.test(c.name||'')&&
      safeSt05CatalogImage(c.image)
  })
}
export function parseSt05VisualOutput(text,candidates=ST05_CANDIDATES){
  if(typeof text!=='string'||text.length>6000)return null
  const fence=String.fromCharCode(96).repeat(3)
  const raw=text.trim().replace(new RegExp('^'+fence+'(?:json)?\\s*','i'),'')
    .replace(new RegExp('\\s*'+fence+'$'),'')
  const start=raw.indexOf('{'),end=raw.lastIndexOf('}')
  if(start<0||end<start)return null
  try{
    const x=JSON.parse(raw.slice(start,end+1))
    const choice=String(x.choice||'').toUpperCase()
    const confidence=x.confidence
    if((choice!=='NONE'&&!/^C[1-7]$/.test(choice))||
      typeof confidence!=='number'||!Number.isFinite(confidence)||confidence<0||confidence>1)
      return null
    const index=choice==='NONE'?-1:Number(choice.slice(1))-1
    if(index>=candidates.length)return null
    return {choice,confidence,reason:clean(x.reason),candidate:index<0?null:candidates[index]}
  }catch{return null}
}
async function readBoundedImage(response,maxBytes=MAX_CANDIDATE_BYTES){
  if(!response?.body)return null
  const header=response.headers.get('content-length')
  if(header!==null){
    const length=Number(header)
    if(!Number.isFinite(length)||length<0||length>maxBytes)return null
  }
  const reader=response.body.getReader(),chunks=[]
  let bytes=0
  try{
    for(;;){
      const {done,value}=await reader.read()
      if(done)break
      bytes+=value.byteLength
      if(bytes>maxBytes)return null
      chunks.push(Buffer.from(value))
    }
    return bytes>=12?Buffer.concat(chunks,bytes):null
  }finally{await reader.cancel().catch(()=>{})}
}
export async function runSt05VisualMatchOnce({
  env=process.env,fetchImpl=fetch,loadMedia=loadVerifiedStoryMedia,
  logger=console.info,candidates=ST05_CANDIDATES,
}={}){
  const run_id=crypto.randomUUID()
  let media_calls=0,catalog_image_calls=0,comparison_calls=0,verified_candidate_images=0
  const report=(status,data={})=>{
    const result={
      event:ST05_VISUAL_EVENT,run_id,status,mode:'LAB_READ_ONLY',
      story_fingerprint:ST05_FINGERPRINT,catalog_snapshot_date:'2026-10-09',
      candidate_source:'SUPABASE_PUBLIC_SHADOW_PRODUCTS_READ_ONLY',
      candidate_count:Array.isArray(candidates)?candidates.length:0,
      candidate_ids:Array.isArray(candidates)?candidates.map(c=>c?.id).filter(Boolean):[],
      candidate_names:Array.isArray(candidates)?candidates.map(c=>clean(c?.name,120)).filter(Boolean):[],
      candidate_source_captured_at:Array.isArray(candidates)?candidates.map(c=>c?.sourceCapturedAt??null):[],
      candidate_last_seen_at:Array.isArray(candidates)?candidates.map(c=>c?.lastSeenAt??null):[],
      media_calls,catalog_image_calls,verified_candidate_images,comparison_calls,
      old_story_vision_repeated:false,jev_calls:0,messages_sent:0,writes:0,catalog_writes:0,
      choice:data.choice??'NONE',confidence:data.confidence??null,reason:data.reason??null,
      candidate_id:data.candidate?.id??null,candidate_bagy_product_id:data.candidate?.bagyProductId??null,
      candidate_name:data.candidate?.name??null,candidate_photo_verified:data.candidate_photo_verified===true,
      threshold:ST05_MATCH_THRESHOLD,model:ST05_VISUAL_MODEL,
      input_tokens:data.input_tokens??null,output_tokens:data.output_tokens??null,cost_usd:data.cost_usd??null,
      exact_sku_verified:false,commercial_price_verified:false,physical_stock_verified:false,
      decision:'BLOCK_ASSERTION',next_action:'HUMAN_CATALOG_REVIEW',
    }
    logger('[PrimeControlST05VisualMatchV16A]',JSON.stringify(result))
    return result
  }
  if(env.PRIME_CONTROL_ST05_VISUAL_MATCH_ENABLED!=='true')return report('DISABLED')
  if(env.PRIME_CONTROL_ST05_VISUAL_MATCH_EXPECTED_FINGERPRINT!==ST05_FINGERPRINT||
     env.PRIME_CONTROL_STORY_VISION_EXPECTED_FINGERPRINT!==ST05_FINGERPRINT)
    return report('STORY_FINGERPRINT_MISMATCH')
  if(env.PRIME_CONTROL_STORY_ARCHIVE_SELECT_ENABLED!=='true')
    return report('ARCHIVE_SELECTOR_DISABLED')
  if(!String(env.LAB_PRODUCT_UNIVERSE_API_SECRET||'').trim()||
     !String(env.PRIME_CONTROL_STORY_RESOLVER_KEY||'').trim()||
     !String(env.PRIME_CONTROL_STORY_PILOT_CHAT_ID||'').trim())
    return report('CONFIG_MISSING')
  if(!validSt05CandidateManifest(candidates))return report('CANDIDATE_MANIFEST_INVALID')
  if(attempted.has(ST05_FINGERPRINT))return report('ALREADY_ATTEMPTED')
  attempted.add(ST05_FINGERPRINT)

  let story
  try{
    media_calls=1
    story=await loadMedia({env,fetchImpl,expectedFingerprint:ST05_FINGERPRINT})
  }catch{return report('STORY_MEDIA_GATE_ERROR')}
  if(story?.status!=='MEDIA_VERIFIED'||story.story_fingerprint!==ST05_FINGERPRINT||
     !story.buffer||!ACCEPTED_TYPES.has(story.media_type)||
     story.buffer.length<12||story.buffer.length>3*1024*1024||
     !imageSignatureOkay(story.buffer,story.media_type))
    return report(story?.status==='MEDIA_VERIFIED'?'STORY_MEDIA_NOT_VERIFIED':(story?.status||'STORY_MEDIA_NOT_VERIFIED'))

  const photoBuffers=[]
  let totalBytes=0
  for(const candidate of candidates){
    try{
      catalog_image_calls++
      const response=await fetchImpl(candidate.image,{method:'GET',redirect:'manual',cache:'no-store',
        signal:AbortSignal.timeout(6500)})
      if(!response.ok)return report('CANDIDATE_IMAGE_HTTP_ERROR',{candidate_photo_verified:false})
      const mime=String(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()
      if(!ACCEPTED_TYPES.has(mime))return report('CANDIDATE_IMAGE_TYPE_REJECTED')
      const buffer=await readBoundedImage(response)
      if(!buffer||!imageSignatureOkay(buffer,mime))return report('CANDIDATE_IMAGE_INVALID')
      totalBytes+=buffer.length
      if(totalBytes>MAX_CANDIDATE_SET_BYTES)return report('CANDIDATE_SET_IMAGE_BUDGET_EXCEEDED')
      photoBuffers.push({buffer,mime})
      verified_candidate_images++
    }catch{return report('CANDIDATE_IMAGE_NETWORK_ERROR')}
  }

  const port=Number(env.PORT||10000)
  if(!Number.isInteger(port)||port<1||port>65535)return report('LOCAL_PROXY_CONFIG_INVALID')
  const sequence=candidates.map((_,i)=>'C'+(i+1)).join(', ')
  const prompt=[
    'Compare a single real Instagram Story image against seven catalog product photos.',
    'The first image is Story ST05. The next seven images correspond in order to '+sequence+'.',
    'Compare the jeans themselves: denim wash and shade, distressing, seams, pockets, waistband, button, silhouette and visible construction details.',
    'Ignore captions, logos as text, overlays, background, lighting and camera angle. The product names are intentionally withheld.',
    'Select one C-number only when the same physical jeans design is strongly supported by multiple visible details; matching only brand or blue color is insufficient.',
    'If details are unclear, images differ, or no exact visual candidate is supported, choose NONE.',
    'Do not infer exact model, SKU, price, stock, authenticity or availability.',
    'Return only JSON: {"choice":"C1|C2|C3|C4|C5|C6|C7|NONE","confidence":0.0,"reason":"short visible similarities/differences"}.',
    'Confidence is a visual similarity estimate and never verifies an exact SKU.',
  ].join(' ')
  const content=[{type:'text',text:prompt},
    {type:'image_url',image_url:{url:'data:'+story.media_type+';base64,'+story.buffer.toString('base64')}}]
  for(const photo of photoBuffers)
    content.push({type:'image_url',image_url:{url:'data:'+photo.mime+';base64,'+photo.buffer.toString('base64')}})
  const requestBody=JSON.stringify({model:ST05_VISUAL_MODEL,max_tokens:300,temperature:0.1,
    messages:[{role:'user',content}]})
  if(Buffer.byteLength(requestBody,'utf8')>MAX_PROXY_JSON_BYTES)return report('REQUEST_BODY_LIMIT_EXCEEDED')
  try{
    comparison_calls=1
    const response=await fetchImpl('http://127.0.0.1:'+port+'/api/supplier-harness-ocr-proxy',{
      method:'POST',redirect:'manual',signal:AbortSignal.timeout(19000),
      headers:{'content-type':'application/json','x-prime-lab-secret':String(env.LAB_PRODUCT_UNIVERSE_API_SECRET).trim()},
      body:requestBody,
    })
    if(!response.ok)return report('VISUAL_PROXY_HTTP_ERROR')
    const body=await response.json().catch(()=>null)
    const parsed=parseSt05VisualOutput(body?.choices?.[0]?.message?.content,candidates)
    const usage=body?.usage||{}
    const extra={
      choice:parsed?.choice||'NONE',confidence:parsed?.confidence??null,reason:parsed?.reason??null,
      candidate:parsed?.candidate??null,candidate_photo_verified:Boolean(parsed?.candidate),
      input_tokens:Number.isFinite(usage.prompt_tokens)?usage.prompt_tokens:null,
      output_tokens:Number.isFinite(usage.completion_tokens)?usage.completion_tokens:null,
      cost_usd:typeof usage.cost==='number'&&Number.isFinite(usage.cost)?usage.cost:null,
    }
    if(!parsed)return report('VISUAL_INVALID_RESPONSE',extra)
    if(parsed.choice==='NONE')return report('NO_VISUAL_MATCH',extra)
    if(parsed.confidence>=ST05_MATCH_THRESHOLD)return report('STRONG_VISUAL_CANDIDATE_REVIEW_REQUIRED',extra)
    return report('VISUAL_UNCERTAIN',extra)
  }catch{return report('VISUAL_NETWORK_OR_TIMEOUT')}
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store')
  res.setHeader('X-Content-Type-Options','nosniff')
  if(req.method!=='POST')return res.status(405).json({ok:false,status:'METHOD_NOT_ALLOWED'})
  if(!mediaProbeAuthorized(req))return res.status(401).json({ok:false,status:'LAB_AUTH_REQUIRED'})
  if(process.env.PRIME_CONTROL_ST05_VISUAL_MATCH_ENABLED!=='true')
    return res.status(503).json({ok:false,status:'VISUAL_MATCH_DISABLED'})
  if(String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/json')
    return res.status(415).json({ok:false,status:'JSON_REQUIRED'})
  if(req.body?.confirm!=='ONE_SHOT_VISUAL_MATCH_ST05_V16A')
    return res.status(400).json({ok:false,status:'CONFIRM_REQUIRED'})
  const r=await runSt05VisualMatchOnce()
  return res.status(['STRONG_VISUAL_CANDIDATE_REVIEW_REQUIRED','NO_VISUAL_MATCH','VISUAL_UNCERTAIN'].includes(r.status)?200:422)
    .json({ok:r.status==='STRONG_VISUAL_CANDIDATE_REVIEW_REQUIRED',...r})
}
