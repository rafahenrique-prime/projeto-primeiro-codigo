/**
 * PRIME CONTROL V1.4C - inbound GPTMaker webhook observer (LAB only).
 *
 * This is NOT a chat handler. It does NOT respond to Instagram or GPTMaker,
 * and does not call Vision, JEV, MCP, catalog, databases, or external services.
 * No raw payloads, URLs, chat IDs, story IDs, messages, or client identifiers
 * appear in logs or returned JSON. Disabled unless expressly enabled.
 */
import crypto from 'node:crypto'

export const OBSERVER_EVENT = 'PRIME_CONTROL_STORY_WEBHOOK_OBSERVED_V14C'
const CONTENT_TYPE = 'application/json'

const asObject = v => v && typeof v === 'object' && !Array.isArray(v) ? v : null
const text = v => typeof v === 'string' && v.trim() ? v.trim() : null
const hash = (value,key) => value
  ? crypto.createHmac('sha256',key).update(value).digest('hex').slice(0,24)
  : null

/** SHA-256 based comparison prevents leaking matching prefix or length. */
export function equalSecret(provided, expected) {
  const a=text(provided), b=text(expected)
  if(!a||!b||a.length>256||b.length>256)return false
  const ah=crypto.createHash('sha256').update(a).digest()
  const bh=crypto.createHash('sha256').update(b).digest()
  return crypto.timingSafeEqual(ah,bh)
}

export function permitted(req,env=process.env) {
  const expected=env.PRIME_CONTROL_GPTMAKER_STORY_HOOK_KEY
  // GPTMaker's agent-level webhook setting may allow only a URL, not headers.
  // Dedicated query key is a fallback; never log or return it.
  const provided=req?.headers?.['x-prime-lab-hook-key'] ?? req?.query?.lab_key
  return equalSecret(provided,expected)
}

export function summarizeInbound(body, key) {
  const root=asObject(body)||{}
  const data=asObject(root.data)||{}
  const message=asObject(root.message)||asObject(data.message)||{}
  const candidateMetadata=[
    asObject(message.metadata),
    asObject(data.metadata),
    asObject(root.metadata),
  ]
  const metadata=candidateMetadata.find(m=>text(m?.storyId)&&text(m?.storyMediaUrl))||{}
  const storyId=text(metadata.storyId)
  const mediaUrl=text(metadata.storyMediaUrl)
  const storyType=text(metadata.storyMediaType)
  const chatId=text(root.chatId)||text(root.chat_id)||
    text(root.contextId)||text(root.chat_id)||text(data.chatId)||
    text(data.contextId)||text(message.chatId)

  // Positive proof must include BOTH native metadata keys in the same object.
  const storyMeta=Boolean(storyId&&mediaUrl)
  const role=text(message.role)||text(root.role)||text(data.role)
  const eventType=text(root.event)||text(root.type)||text(data.event)
  const validRole=role?role==='user':null
  return {
    event: OBSERVER_EVENT,
    version:'1.4C-webhook-observer',
    mode:'LAB_OBSERVE_ONLY',
    story_metadata_present:storyMeta,
    story_media_type:storyMeta
      ? (storyType==='image/jpeg'?'image/jpeg':storyType==='image/png'?'image/png':
         storyType==='video/mp4'?'video/mp4':'OTHER_OR_MISSING')
      : null,
    source_role:validRole===true?'USER':validRole===false?'OTHER':'UNKNOWN',
    event_type_present:Boolean(eventType),
    chat_id_present:Boolean(chatId),
    chat_fingerprint:hash(chatId,key),
    story_fingerprint:storyMeta?hash(storyId,key):null,
    received_at:new Date().toISOString(),
    // No raw payload, text, URL, metadata, sender, contact or secrets.
  }
}

export function responseForObservation(observation) {
  return {
    ok:true,mode:'OBSERVE_ONLY',event:OBSERVER_EVENT,
    story_metadata_present:observation.story_metadata_present,
    correlation_id:crypto.randomUUID(),
    // no other content leaves the observer
  }
}

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store')
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'})
  if(!permitted(req))return res.status(401).json({ok:false,error:'LAB_HOOK_UNAUTHORIZED'})
  if(process.env.PRIME_CONTROL_STORY_HOOK_OBSERVER_ENABLED!=='true')
    return res.status(503).json({ok:false,error:'LAB_HOOK_DISABLED'})
  if(String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase()!==CONTENT_TYPE)
    return res.status(415).json({ok:false,error:'JSON_REQUIRED'})
  if(!asObject(req.body))return res.status(400).json({ok:false,error:'INVALID_PAYLOAD'})
  const record=summarizeInbound(req.body,process.env.PRIME_CONTROL_GPTMAKER_STORY_HOOK_KEY)
  console.info('[PrimeControlStoryObserver]',JSON.stringify(record))
  return res.status(200).json(responseForObservation(record))
}
