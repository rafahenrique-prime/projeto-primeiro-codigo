/**
 * PRIME CONTROL V1.4D — real QA Story Gemini recognition, exactly one
 * attempt per image fingerprint per Render process. Default OFF.
 * Reuses Vercel LAB's private media gate and existing Render LAB OCR proxy.
 * No catalog lookups, JEV, replies, persistent data, or media in logs.
 */
import crypto from 'node:crypto'
import {loadVerifiedStoryMedia,mediaProbeAuthorized} from './prime-control-story-media-probe-v14d.js'
import {parseEvidence} from './prime-control-vans-screenshot-lab-v14c.js'

export const STORY_VISION_EVENT='PRIME_CONTROL_STORY_REAL_VISION_V14D'
export const STORY_VISION_MODEL='google/gemini-2.5-flash-lite'
const consumed=new Set()
const MIME_TO_DATA={ 'image/jpeg':'image/jpeg','image/png':'image/png','image/webp':'image/webp' }
const clean=(x,max=70)=>typeof x==='string'?
 x.replace(/[\r\n\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):null
const recognized=x=>x&&!/^(unknown|nao identificado|não identificado|indefinido|uncertain)$/i.test(x)
export function resetStoryVisionAttemptsForTests(){consumed.clear()}

/**
 * No image bytes, media URLs, model prompts, conversation text or secrets
 * ever leave this runtime in logging or HTTP response.
 */
export async function runStoryVisionOnce({
 env=process.env,fetchImpl=fetch,logger=console.info,loadMedia=loadVerifiedStoryMedia,
}={}){
 const run_id=crypto.randomUUID()
 let calls=0
 const report=(status,extra={})=>{
  const result={event:STORY_VISION_EVENT,run_id,status,
   mode:'LAB_ONLY',story_fingerprint:extra.story_fingerprint??null,
   media_type:extra.media_type??null,
   media_bytes:extra.media_bytes??null,
   vision_http_status:extra.vision_http_status??null,
   provider_calls:calls,
   input_tokens:extra.input_tokens??null,output_tokens:extra.output_tokens??null,
   cost_usd:extra.cost_usd??null,identified:extra.identified===true,
   category:extra.category??null,brand:extra.brand??null,
   model:extra.model??null,color:extra.color??null,
   catalog_calls:0,jev_calls:0,messages_sent:0,writes:0}
  logger('[PrimeControlStoryRealVisionV14D]',JSON.stringify(result))
  return result
 }
 if(env.PRIME_CONTROL_STORY_REAL_VISION_ENABLED!=='true')return report('DISABLED')
 const expected=String(env.PRIME_CONTROL_STORY_VISION_EXPECTED_FINGERPRINT||'').trim()
 if(!/^[a-f0-9]{24}$/.test(expected))return report('EXPECTED_FINGERPRINT_MISSING')
 const proxySecret=String(env.LAB_PRODUCT_UNIVERSE_API_SECRET||'').trim()
 if(!proxySecret||!String(env.PRIME_CONTROL_STORY_RESOLVER_KEY||'').trim()||
    !String(env.PRIME_CONTROL_STORY_PILOT_CHAT_ID||'').trim())
  return report('CONFIG_MISSING')
 if(consumed.has(expected))return report('ALREADY_ATTEMPTED')
 // Consume before making external calls; no retry on failure or timeout.
 consumed.add(expected)
 let media
 try{media=await loadMedia({env,fetchImpl,
  expectedFingerprint:env.PRIME_CONTROL_STORY_ARCHIVE_SELECT_ENABLED==='true'?expected:null})}
 catch{return report('MEDIA_GATE_UNAVAILABLE')}
 if(media?.status!=='MEDIA_VERIFIED'||!media?.buffer)
  return report(media?.status==='VERCEL_GATE_DISABLED'?'VERCEL_GATE_DISABLED':'MEDIA_GATE_UNAVAILABLE')
 if(media.story_fingerprint!==expected)return report('STORY_FINGERPRINT_MISMATCH')
 if(!MIME_TO_DATA[media.media_type])return report('MEDIA_UNSUPPORTED')
 if(media.buffer.length<12||media.buffer.length>3*1024*1024)
  return report('MEDIA_SIZE_INVALID')
 const port=Number(env.PORT||10000)
 if(!Number.isInteger(port)||port<1||port>65535)return report('LOCAL_PROXY_CONFIG_INVALID')
 const image=media.buffer.toString('base64')
 const prompt='Analise SOMENTE o produto principal visível na imagem real do Story de teste. '+
  'Responda somente JSON com category,brand,model,color,description. '+
  'Se a marca ou modelo não estiver visualmente comprovado, escreva unknown. '+
  'Ignore textos de interface, nomes de usuário e comentários. Não invente preço nem estoque.'
 let http=null
 try{
  calls=1
  const response=await fetchImpl(`http://127.0.0.1:${port}/api/supplier-harness-ocr-proxy`,{
   method:'POST',redirect:'manual',signal:AbortSignal.timeout(16500),
   headers:{'content-type':'application/json','x-prime-lab-secret':proxySecret},
   body:JSON.stringify({model:STORY_VISION_MODEL,max_tokens:220,temperature:0,
    messages:[{role:'user',content:[
     {type:'text',text:prompt},
     {type:'image_url',image_url:{url:`data:${media.media_type};base64,${image}`}},
    ]}]}),
  })
  http=response.status
  if(!response.ok)return report('VISION_PROXY_ERROR',{vision_http_status:http,
   story_fingerprint:expected,media_type:media.media_type,media_bytes:media.buffer.length})
  const body=await response.json().catch(()=>null)
  const parsed=parseEvidence(body?.choices?.[0]?.message?.content)
  const category=clean(parsed?.category,60),brand=clean(parsed?.brand,60)
  const model=clean(parsed?.model,70),color=clean(parsed?.color,60)
  const identified=Boolean(recognized(category)&&(recognized(brand)||recognized(model)))
  const usage=body?.usage||{}
  return report(parsed?'VISION_PARSED':'VISION_UNCERTAIN',{
   vision_http_status:http,story_fingerprint:expected,
   media_type:media.media_type,media_bytes:media.buffer.length,
   identified,category,brand,model,color,
   input_tokens:Number.isFinite(usage.prompt_tokens)?usage.prompt_tokens:null,
   output_tokens:Number.isFinite(usage.completion_tokens)?usage.completion_tokens:null,
   cost_usd:typeof usage.cost==='number'&&Number.isFinite(usage.cost)?usage.cost:null,
  })
 }catch{return report('VISION_TIMEOUT_OR_NETWORK',{vision_http_status:http,
  story_fingerprint:expected,media_type:media.media_type,
  media_bytes:media.buffer.length})}
}

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store')
 if(req.method!=='POST')return res.status(405).json({ok:false,status:'METHOD_NOT_ALLOWED'})
 if(!mediaProbeAuthorized(req))return res.status(401).json({ok:false,status:'LAB_AUTH_REQUIRED'})
 if(process.env.PRIME_CONTROL_STORY_REAL_VISION_ENABLED!=='true')
  return res.status(503).json({ok:false,status:'VISION_DISABLED'})
 if(String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/json')
  return res.status(415).json({ok:false,status:'JSON_REQUIRED'})
 if(req.body?.confirm!=='ONE_SHOT_REAL_QA_STORY_VISION_V14D')
  return res.status(400).json({ok:false,status:'CONFIRM_REQUIRED'})
 const r=await runStoryVisionOnce()
 return res.status(r.status==='VISION_PARSED'?200:422).json({ok:r.status==='VISION_PARSED',...r})
}
