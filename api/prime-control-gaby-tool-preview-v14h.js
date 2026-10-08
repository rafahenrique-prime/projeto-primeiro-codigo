/** V1.4H: read-only GPTMaker Buscar Produtos SHAPE preview, not the active tool. */
import {randomUUID} from 'node:crypto'
import {mediaProbeAuthorized} from './prime-control-story-media-probe-v14d.js'
import {probeStoryNativeBridgeOnce} from './prime-control-story-native-bridge-v14g.js'
import {REAL_STORY_FINGERPRINT,NATIVE_STORY_PRINT_TRAINING} from './_primeControlStoryNativePolicyV14f.js'

export const CONFIRM='ONE_SHOT_GABY_LAB_TOOL_PREVIEW_V14H'
const used=new Set()
export function clearToolPreviewForTests(){used.clear()}
export function nativeToolShape(proof){
 if(proof?.status!=='VERIFIED_NATIVE_POLICY_PREVIEW'||
    proof?.policy_route!=='GPTMAKER_NATIVE_REQUEST_STORY_PRINT'||
    proof?.native_training_id!==NATIVE_STORY_PRINT_TRAINING||
    proof?.messages_sent!==0||proof?.writes!==0)return null
 return {
  sucesso:true,
  contexto:{source:'prime_control_lab_preview_v14h',story_context_status:'FOUND',
   preview_only:true,tem_produtos:false,produtos_encontrados:0,
   decision_layer:{scope:'story',action:'BLOCK_ASSERTION',
    reason:'JEV_BLOCKS_MODEL_ASSERTION',native_training_id:NATIVE_STORY_PRINT_TRAINING}},
  dados:{resumo_disponibilidade:'Modelo do Story nao confirmado',
   produtos:[],totalVariacoes:0,variacoesRestantes:0,
   informacao_adicional:'Story confirmado no LAB, modelo exato nao confirmado. Priorize o treinamento nativo Story — modelo não confirmado — pedir print. Nao afirme produto, preco, Pix ou estoque. Nao diga que a identificacao foi concluida.'},
 }
}
export async function runToolPreview({
 env=process.env,question='Qual o valor?',clientId,
 proofFn=probeStoryNativeBridgeOnce,logger=console.info
}={}){
 const run_id=randomUUID()
 let resolver_reads=0
 const report=(status,body=null)=>{
  const output={event:'PRIME_CONTROL_GABY_TOOL_PREVIEW_V14H',run_id,status,scope:'LAB_QA_ONLY',
   resolver_reads,preview_compatible:body!==null,
   native_training_id:body?.contexto?.decision_layer?.native_training_id??null,
   products_count:body?.dados?.produtos?.length??0,
   actual_gptmaker_action_modified:false,actual_gptmaker_reply_tested:false,
   paid_ai_calls:0,commercial_tool_calls:0,messages_sent:0,writes:0}
  logger('[PrimeControlGabyToolPreviewV14H]',JSON.stringify(output))
  return {...output,tool_preview:body}
 }
 if(env.PRIME_CONTROL_GABY_TOOL_PREVIEW_ENABLED!=='true')return report('DISABLED')
 if(env.PRIME_CONTROL_GABY_TOOL_PREVIEW_EXPECTED_FINGERPRINT!==REAL_STORY_FINGERPRINT)
  return report('FINGERPRINT_MISMATCH')
 const pilot=String(env.PRIME_CONTROL_STORY_PILOT_CHAT_ID||'').trim()
 if(!pilot||!String(env.PRIME_CONTROL_STORY_RESOLVER_KEY||'').trim())
  return report('PILOT_CONFIG_MISSING')
 if(clientId!==pilot)return report('CLIENT_NOT_ALLOWLISTED')
 if(question!=='Qual o valor?')return report('QUESTION_NOT_ALLOWLISTED')
 if(used.has(REAL_STORY_FINGERPRINT))return report('ALREADY_ATTEMPTED')
 used.add(REAL_STORY_FINGERPRINT)
 let proof
 try{
  // Reuse the EXISTING V1.4G resolver/policy, not a second bridge.
  proof=await proofFn({env:{...env,
   PRIME_CONTROL_STORY_NATIVE_BRIDGE_ENABLED:'true',
   PRIME_CONTROL_STORY_NATIVE_BRIDGE_EXPECTED_FINGERPRINT:REAL_STORY_FINGERPRINT},logger:()=>{}})
  resolver_reads=proof?.resolver_reads??0
 }catch{return report('READ_ONLY_PROOF_FAILED')}
 const compatible=nativeToolShape(proof)
 if(!compatible)return report('POLICY_NOT_VERIFIED')
 return report('QA_TOOL_RESPONSE_SHAPE_VERIFIED',compatible)
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store')
 if(req.method!=='POST')return res.status(405).json({ok:false,status:'METHOD_NOT_ALLOWED'})
 if(!mediaProbeAuthorized(req))return res.status(401).json({ok:false,status:'LAB_AUTH_REQUIRED'})
 if(process.env.PRIME_CONTROL_GABY_TOOL_PREVIEW_ENABLED!=='true')
  return res.status(503).json({ok:false,status:'PREVIEW_DISABLED'})
 if(String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/json')
  return res.status(415).json({ok:false,status:'JSON_REQUIRED'})
 if(req.body?.confirm!==CONFIRM)return res.status(400).json({ok:false,status:'CONFIRM_REQUIRED'})
 const result=await runToolPreview({clientId:req.body.cliente_id,question:req.body.pergunta})
 return res.status(result.status==='QA_TOOL_RESPONSE_SHAPE_VERIFIED'?200:422)
  .json({ok:result.status==='QA_TOOL_RESPONSE_SHAPE_VERIFIED',...result})
}
