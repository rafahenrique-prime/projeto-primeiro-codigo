/**
 * PRIME CONTROL V1.4K — isolated GPTMaker Action-adapter DRY RUN.
 * It accepts the *actual* GABY LAB tool payload and resolves the CURRENT Story
 * through our existing, read-only Vercel/GPTMaker bridge. It does NOT invoke
 * the active writable Supabase commercial action or send customer replies.
 *
 * IMPORTANT: this route is not ready to replace Buscar Produtos. Non-Story
 * handoff and matching an action call to the exact user message need an
 * independently verified contract before any live switch.
 */
import {randomUUID} from 'node:crypto'
import {resolveStoryPilot} from './_primeControlStoryCorrelationV14c.js'
import {decideStoryMemoryBoundaryV14j} from './_primeControlStoryMemoryBoundaryV14j.js'
import {ALLOWED_SCOPE} from './_primeControlStoryNativePolicyV14f.js'
import {mediaProbeAuthorized} from './prime-control-story-media-probe-v14d.js'

export const V14K_EVENT='PRIME_CONTROL_STORY_ACTION_ADAPTER_DRY_RUN_V14K'
export const V14K_CONFIRM='VERIFY_GABY_LAB_ACTION_ADAPTER_DRY_RUN_V14K'
const FLAG='PRIME_CONTROL_STORY_ACTION_ADAPTER_V14K_ENABLED'
const PENDING='NEEDS_CURRENT_STORY_EVIDENCE'

export function normalizeGabyActionPayloadV14k(body,pilot){
 if(!body||typeof body!=='object'||Array.isArray(body))return null
 const rawId=body.cliente_id
 const rawQuestion=body.pergunta
 if(typeof rawId!=='string'||typeof rawQuestion!=='string')return null
 // Current GPTMaker interpolation prepends exactly ONE literal dollar to
 // both fields; never strip interior chars or arbitrary prefixes.
 if(rawId.startsWith('$$')||rawQuestion.startsWith('$$'))return null
 const chatId=rawId.startsWith('$')?rawId.slice(1):rawId
 const question=rawQuestion.startsWith('$')?rawQuestion.slice(1):rawQuestion
 if(chatId!==pilot||chatId.length<16||chatId.length>180)return null
 if(question.length<2||question.length>300||question.startsWith('$'))return null
 if(/[\r\n\0]/.test(question)||/\$\{/.test(question)||question.includes('{')||question.includes('}')||question.includes('\\'))return null
 return {chatId,question,interpolation_prefix_present:rawId.startsWith('$')||rawQuestion.startsWith('$')}
}

function shapeForUnsafeStory(){
 return {
  sucesso:true,
  contexto:{
   source:'prime_control_v14k_qa_preview',
   preview_only:true,
   story_context_status:'FOUND',
   product_identification_status:'CURRENT_STORY_NOT_IDENTIFIED',
   tem_produtos:false,produtos_encontrados:0,
   native_route:'GPTMAKER_NATIVE_REQUEST_STORY_PRINT',
   should_reuse_previous_product:false,
  },
  dados:{
   resumo_disponibilidade:'Não foi confirmado o produto exato do Story atual.',
   produtos:[],totalVariacoes:0,variacoesRestantes:0,
   informacao_adicional:'PRÉVIA TÉCNICA DE LAB. Não apresente modelo, preço, link, tamanho ou estoque do produto anterior. O Story atual foi reconhecido, mas falta comprovar o produto por esta mídia. Use a orientação nativa de pedir print somente se ele ainda não foi pedido ou enviado; caso contrário, pergunte um detalhe útil. Nunca diga que realizou uma verificação visual que não aconteceu.',
  },
 }
}
export async function dryRunGabyLabActionV14k({
 env=process.env,body={},clock=Date.now,resolveFn=resolveStoryPilot,
 logger=console.info
}={}){
 const pilot=String(env.PRIME_CONTROL_STORY_PILOT_CHAT_ID||'').trim()
 const accepted=normalizeGabyActionPayloadV14k(body,pilot)
 const run_id=randomUUID()
 let resolver_reads=0
 const out=(status,more={})=>{
  const result={
   event:V14K_EVENT,run_id,status,scope:'GABY_LAB_QA_ONE_CHAT',
   resolver_reads,
   interpolation_prefix_present:accepted?.interpolation_prefix_present===true,
   story_verified:more.story_verified===true,
   media_type:more.media_type??null,
   memory_guard_action:more.memory_guard_action??null,
   tool_shape_compatible:more.tool_shape_compatible===true,
   active_gptmaker_action_modified:false,
   original_commercial_tool_called:false,
   actual_gptmaker_reply_tested:false,paid_ai_calls:0,db_writes:0,
   customer_messages_sent:0,
  }
  logger('[PrimeControlStoryActionAdapterV14K]',JSON.stringify(result))
  return {...result,tool_preview:more.tool_preview||null}
 }
 if(env[FLAG]!=='true')return out('DISABLED')
 if(!pilot||!String(env.PRIME_CONTROL_STORY_RESOLVER_KEY||'').trim())
  return out('NOT_CONFIGURED')
 if(!accepted)return out('CLIENT_OR_PAYLOAD_NOT_ALLOWLISTED')
 let resolved
 try{
  resolver_reads=1
  resolved=await resolveFn(
   {chatId:accepted.chatId,message:{role:'user'}},
   {env,clock,logger:()=>{},dedupe:false}
  )
 }catch{return out('RESOLVER_FAILED')}
 if(resolved?.status==='NO_VALID_STORY_ON_LATEST_USER'){
  // Do NOT route to real commercial tool yet; it writes selected_product.
  // The Vercel resolver does not currently carry a timestamp on NO_STORY.
  return out('NATIVE_SEARCH_HANDOFF_UNPROVEN')
 }
 if(resolved?.status!=='FOUND'||resolved.story_present!==true||
   resolved.story_media_available!==true||resolved.agent_verified!==true||
   !Number.isSafeInteger(resolved.latest_user_time)||
   !['image/jpeg','video/mp4'].includes(resolved.story_media_type)){
  return out('STORY_IDENTITY_OR_FRESHNESS_NOT_PROVEN')
 }
 const now=clock()
 if(resolved.latest_user_time>now+3000||now-resolved.latest_user_time>120000)
  return out('STORY_MESSAGE_NOT_FRESH')
 const guard=decideStoryMemoryBoundaryV14j({
  scope:ALLOWED_SCOPE,nowMs:now,
  latest:{
   source:'GPTMAKER_MESSAGES_READ_ONLY',agent_verified:true,
   chat_allowlisted:true,kind:'STORY_REPLY',story_status:'FOUND',
   story_fingerprint:resolved.story_fingerprint,
   media_type:resolved.story_media_type,media_available:true,
   message_time_ms:resolved.latest_user_time
  },
  // We intentionally do NOT read/modify the existing commercial memory.
  commercialMemory:{selected_product:'PREVIOUS_PRODUCT_UNTRUSTED'},
  history:{},evidence:null
 })
 if(guard.action!=='HOLD_FOR_CURRENT_STORY_EVIDENCE'||
   guard.old_selected_product_may_be_used!==false||guard.writes!==0)
  return out('MEMORY_GUARD_REJECTED')
 return out('STORY_GUARD_QA_PREVIEW_READY',{
  story_verified:true,media_type:resolved.story_media_type,
  memory_guard_action:guard.action,tool_shape_compatible:true,
  tool_preview:shapeForUnsafeStory()
 })
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store')
 if(req.method!=='POST')return res.status(405).json({ok:false,status:'METHOD_NOT_ALLOWED'})
 if(!mediaProbeAuthorized(req))return res.status(401).json({ok:false,status:'LAB_AUTH_REQUIRED'})
 if(process.env[FLAG]!=='true')return res.status(503).json({ok:false,status:'DRY_RUN_DISABLED'})
 if(String(req.headers?.['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/json')
  return res.status(415).json({ok:false,status:'JSON_REQUIRED'})
 if(req.body?.confirm!==V14K_CONFIRM)return res.status(400).json({ok:false,status:'CONFIRM_REQUIRED'})
 const result=await dryRunGabyLabActionV14k({body:req.body})
 return res.status(result.status==='STORY_GUARD_QA_PREVIEW_READY'?200:422)
  .json({ok:result.status==='STORY_GUARD_QA_PREVIEW_READY',...result})
}
