/**
 * PRIME CONTROL V1.4D — private media bridge smoke (Render LAB only).
 * The Vercel LAB agent-verified media gate owns GPTMaker/media credentials.
 * We only verify image bytes in memory, with two kill switches and one
 * allowlisted QA chat. NO Vision, JEV, catalog, DB writes, image storage,
 * GPTMaker/Instagram outbound response, or media in logs/response.
 */
import {createHash, timingSafeEqual} from 'node:crypto'

export const MEDIA_PROBE_EVENT='PRIME_CONTROL_STORY_MEDIA_PROBE_V14D'
const MEDIA_GATE='https://prime-gptmaker-lab.vercel.app/api/prime-control-story-media-v14d'
const MAX_BYTES=3*1024*1024
const ACCEPTED=new Set(['image/jpeg','image/png','image/webp'])
const text=v=>typeof v==='string'?v.trim():''
const isObject=v=>v!=null&&typeof v==='object'&&!Array.isArray(v)

export function sameSecret(left,right){
 const a=text(left),b=text(right)
 if(!a||!b||a.length>256||b.length>256)return false
 return timingSafeEqual(
  createHash('sha256').update(a).digest(),
  createHash('sha256').update(b).digest(),
 )
}

export function mediaProbeAuthorized(req,env=process.env){
 return sameSecret(req?.headers?.['x-prime-control-story-key'],
  env.PRIME_CONTROL_STORY_LAB_SHARED_KEY)&&
  req?.headers?.['x-prime-lab']==='GABY-LAB-COMERCIAL-V1'
}

export function imageSignatureOkay(bytes,mime){
 if(mime==='image/jpeg')return bytes.length>=3&&
  bytes[0]===255&&bytes[1]===216&&bytes[2]===255
 if(mime==='image/png')return bytes.length>=8&&
  [137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b)
 if(mime==='image/webp')return bytes.length>=12&&
  bytes.subarray(0,4).toString('ascii')==='RIFF'&&
  bytes.subarray(8,12).toString('ascii')==='WEBP'
 return false
}

async function boundedBinaryResponse(resp){
 const n=Number(resp.headers.get('content-length')||0)
 if(!Number.isFinite(n)||n<0||n>MAX_BYTES||!resp.body)return null
 let count=0
 const chunks=[]
 const reader=resp.body.getReader()
 try{
  for(;;){
   const {done,value}=await reader.read()
   if(done)break
   count+=value.byteLength
   if(count>MAX_BYTES)return null
   chunks.push(Buffer.from(value))
  }
  return count>=12?Buffer.concat(chunks,count):null
 }finally{await reader.cancel().catch(()=>{})}
}

/** Run only when both LAB gates are explicitly enabled. */
export async function probeStoryMediaOnce({
 env=process.env,fetchImpl=fetch,logger=console.info,
}={}){
 const run_id=cryptoRandomUUID()
 const report=(status,other={})=>{
  const result={event:MEDIA_PROBE_EVENT,run_id,status,mode:'LAB_READ_ONLY',
   http_status:other.http_status??null,media_type:other.media_type??null,
   bytes_count:other.bytes_count??null,
   story_fingerprint:other.story_fingerprint??null,
   vision_calls:0,jev_calls:0,catalog_calls:0,messages_sent:0,writes:0}
  logger('[PrimeControlStoryMediaProbe]',JSON.stringify(result))
  return result
 }
 if(env.PRIME_CONTROL_STORY_MEDIA_PROBE_ENABLED!=='true')
  return report('DISABLED')
 const secret=text(env.PRIME_CONTROL_STORY_RESOLVER_KEY)
 const pilot=text(env.PRIME_CONTROL_STORY_PILOT_CHAT_ID)
 if(!secret||!pilot||pilot.length>180)return report('NOT_CONFIGURED')
 try{
  const r=await fetchImpl(MEDIA_GATE,{
   method:'POST',
   headers:{'content-type':'application/json','x-prime-story-resolver-key':secret},
   body:JSON.stringify({chatId:pilot}),
   redirect:'manual',
   cache:'no-store',
   signal:AbortSignal.timeout(12500),
  })
  if(!r.ok){
   let failure='GATE_UNAVAILABLE'
   // Only ever copy an explicit allowlisted status enum.
   const b=await r.json().catch(()=>null)
   if(r.status===503&&b?.status==='MEDIA_GATE_DISABLED')failure='VERCEL_GATE_DISABLED'
   if(r.status===422&&b?.status==='VIDEO_NOT_ENABLED')failure='VIDEO_NOT_ENABLED'
   if(r.status===422&&b?.status==='MEDIA_UNAVAILABLE')failure='MEDIA_UNAVAILABLE'
   if(r.status===422&&b?.status==='UNSUPPORTED_MEDIA_TYPE')failure='UNSUPPORTED_MEDIA_TYPE'
   if(r.status===422&&b?.status==='NO_VALID_STORY_ON_LATEST_USER')failure='NO_STORY_ON_LATEST_USER'
   return report(failure,{http_status:r.status})
  }
  const mime=text(r.headers.get('content-type')).split(';')[0].toLowerCase()
  if(!ACCEPTED.has(mime))return report('MIME_BLOCKED',{http_status:r.status})
  const raw=await boundedBinaryResponse(r)
  if(!raw)return report('MEDIA_SIZE_INVALID',{http_status:r.status})
  if(!imageSignatureOkay(raw,mime))return report('MEDIA_SIGNATURE_INVALID',{http_status:r.status})
  const f=text(r.headers.get('x-prime-story-fingerprint'))
  const fp=/^[0-9a-f]{24}$/.test(f)?f:null
  return report('MEDIA_VERIFIED',{http_status:r.status,
   media_type:mime,bytes_count:raw.length,story_fingerprint:fp})
 }catch{
  return report('RELAY_NETWORK_OR_TIMEOUT')
 }
}

// No global cache, no media persistence, and never return image bytes.
function cryptoRandomUUID(){return crypto.randomUUID()}
import crypto from 'node:crypto'

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store')
 if(req.method!=='POST')return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'})
 if(!mediaProbeAuthorized(req))return res.status(401).json({ok:false,error:'LAB_AUTH_REQUIRED'})
 if(process.env.PRIME_CONTROL_STORY_MEDIA_PROBE_ENABLED!=='true')
  return res.status(503).json({ok:false,status:'PROBE_DISABLED'})
 if(String(req.headers['content-type']||'').split(';')[0].toLowerCase().trim()!=='application/json')
  return res.status(415).json({ok:false,error:'JSON_REQUIRED'})
 if(!isObject(req.body)||req.body.confirm!=='PROBE_QA_STORY_MEDIA_V14D')
  return res.status(400).json({ok:false,error:'CONFIRM_REQUIRED'})
 const result=await probeStoryMediaOnce()
 return res.status(result.status==='MEDIA_VERIFIED'?200:422).json({
  ok:result.status==='MEDIA_VERIFIED',...result,
 })
}
