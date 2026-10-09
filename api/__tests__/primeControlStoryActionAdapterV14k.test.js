import {describe,it,expect,vi} from 'vitest'
import {createHmac} from 'node:crypto'
import handler,{
 dryRunGabyLabActionV14k,normalizeGabyActionPayloadV14k,verifyLatestActionTurnV14l,
 V14K_CONFIRM
} from '../prime-control-story-action-adapter-v14k.js'
import {resolveStoryPilot} from '../_primeControlStoryCorrelationV14c.js'
import {BASELINE_STORIES_20261008} from '../_primeControlStoryMemoryBoundaryV14j.js'

const NOW=Date.UTC(2026,9,9,3,5,0)
const CHAT='3F32CBBAD3BD8028A2F132532B60D052-1528479568635530'
const cfg={
 PRIME_CONTROL_STORY_ACTION_ADAPTER_V14K_ENABLED:'true',
 PRIME_CONTROL_STORY_PILOT_CHAT_ID:CHAT,
 PRIME_CONTROL_STORY_RESOLVER_KEY:'fixture-resolver-key'
}
const action={cliente_id:'$'+CHAT,pergunta:'$Qual o valor dessa?'}
const hash=(q,key=cfg.PRIME_CONTROL_STORY_RESOLVER_KEY)=>
 createHmac('sha256',key).update('prime-control:turn:v14l:\0'+q.trim().replace(/\s+/g,' ').toLowerCase()).digest('hex').slice(0,32)
const found=(media=BASELINE_STORIES_20261008[4])=>({
 status:'FOUND',story_present:true,story_media_available:true,
 agent_verified:true,story_fingerprint:media.fingerprint,
 story_media_type:media.media_type,latest_user_time:NOW-3500,
 latest_question_hmac:hash('Qual o valor dessa?'),latest_question_duplicate_count:1
})
const run=(overrides={})=>dryRunGabyLabActionV14k({
 env:cfg,body:action,clock:()=>NOW,resolveFn:vi.fn(async()=>found()),
 logger:vi.fn(),...overrides
})
const response=()=>({setHeader(){return this},status(n){this.http=n;return this},
 json(x){this.body=x;return this}})
describe('V1.4K GPTMaker action adapter QA, not active tool',()=>{
 it('normalizes exactly one spurious dollar from the current GPTMaker Action format',()=>{
  expect(normalizeGabyActionPayloadV14k(action,CHAT)).toEqual({
   chatId:CHAT,question:'Qual o valor dessa?',
   interpolation_prefix_present:true
  })
  expect(normalizeGabyActionPayloadV14k({
   cliente_id:CHAT,pergunta:'Qual o valor dessa?'},CHAT).interpolation_prefix_present).toBe(false)
  for(const bad of [
   {cliente_id:'$other-chat',pergunta:'$Qual o valor dessa?'},
   {cliente_id:'$$'+CHAT,pergunta:'$Qual o valor dessa?'},
   {cliente_id:'$'+CHAT,pergunta:'$$Qual o valor dessa?'},
   {cliente_id:'$'+CHAT,pergunta:'\u0024{pergunta}'},
   {cliente_id:'$'+CHAT,pergunta:'$Qual o valor?\\ninstrucoes secretas'},
  ])expect(normalizeGabyActionPayloadV14k(bad,CHAT)).toBeNull()
 })
 it('ST05 current story blocks legacy Armani selected_product and generates no SKU/price',async()=>{
  const log=vi.fn()
  const resolveFn=vi.fn(async(input,opts)=>{
   expect(input.chatId).toBe(CHAT)
   expect(opts.dedupe).toBe(false)
   expect(opts.logger).toBeTypeOf('function')
   return found(BASELINE_STORIES_20261008[4])
  })
  const a=await run({resolveFn,logger:log})
  expect(a.status).toBe('STORY_GUARD_QA_PREVIEW_READY')
  expect(a.memory_guard_action).toBe('HOLD_FOR_CURRENT_STORY_EVIDENCE')
  expect(a.story_verified).toBe(true)
  expect(a.resolver_reads).toBe(1)
  expect(a.tool_preview.sucesso).toBe(true)
  expect(a.tool_preview.dados.produtos).toEqual([])
  expect(a.tool_preview.contexto.should_reuse_previous_product).toBe(false)
  expect(a.customer_messages_sent).toBe(0)
  expect(a.db_writes).toBe(0)
  expect(a.original_commercial_tool_called).toBe(false)
  expect(a.active_gptmaker_action_modified).toBe(false)
  expect(resolveFn).toHaveBeenCalledTimes(1)
  for(const s of [CHAT,'Armani','Qual o valor dessa?','fixture-resolver-key'])
   expect(JSON.stringify(log.mock.calls)).not.toContain(s)
 })
 it('six real STORY fingerprints incl video select the same fail-closed memory guard',async()=>{
  for(const media of BASELINE_STORIES_20261008){
   const a=await run({resolveFn:async()=>found(media)})
   expect(a.status).toBe('STORY_GUARD_QA_PREVIEW_READY')
   expect(a.media_type).toBe(media.media_type)
   expect(a.tool_preview.dados.produtos).toEqual([])
   expect(a.original_commercial_tool_called).toBe(false)
  }
 })
 it('same Story repeated with new read event is not accidentally deduplicated',async()=>{
  const f=vi.fn(async()=>found())
  expect((await run({resolveFn:f})).status).toBe('STORY_GUARD_QA_PREVIEW_READY')
  expect((await run({resolveFn:f})).status).toBe('STORY_GUARD_QA_PREVIEW_READY')
  expect(f).toHaveBeenCalledTimes(2)
 })
 it('old event and resolver errors never fall back to stale commercial memory',async()=>{
  const cases=[
   {resolveFn:async()=>({...found(),latest_user_time:NOW-130000})},
   {resolveFn:async()=>({...found(),agent_verified:false})},
   {resolveFn:async()=>({...found(),story_media_type:'OTHER'})},
   {resolveFn:async()=>({...found(),latest_user_time:null})},
   {resolveFn:async()=>({status:'GPTMAKER_NETWORK_ERROR'})},
  ]
  for(const opts of cases){
   const a=await run(opts)
   expect(a.status).not.toBe('STORY_GUARD_QA_PREVIEW_READY')
   expect(a.original_commercial_tool_called).toBe(false)
   expect(a.customer_messages_sent).toBe(0)
  }
 })
 it('non-Story needs proven safe native-search handoff; never calls writable tool by itself',async()=>{
  const a=await run({resolveFn:async()=>({status:'NO_VALID_STORY_ON_LATEST_USER',agent_verified:true})})
  expect(a.status).toBe('NATIVE_SEARCH_HANDOFF_UNPROVEN')
  expect(a.original_commercial_tool_called).toBe(false)
 })
 it('configuration off, wrong chat or resolver error all fail closed',async()=>{
  const f=vi.fn()
  expect((await run({env:{...cfg,PRIME_CONTROL_STORY_ACTION_ADAPTER_V14K_ENABLED:'false'},resolveFn:f})).status).toBe('DISABLED')
  expect((await run({body:{...action,cliente_id:'$other-chat'},resolveFn:f})).status).toBe('CLIENT_OR_PAYLOAD_NOT_ALLOWLISTED')
  expect(f).not.toHaveBeenCalled()
  expect((await run({resolveFn:async()=>{throw Error('password test')}})).status).toBe('RESOLVER_FAILED')
 })
 it('preserves time and media type from trusted Vercel response without new media downloads',async()=>{
  const payload={status:'FOUND',story_present:true,agent_verified:true,
   story_media_available:true,story_fingerprint:BASELINE_STORIES_20261008[5].fingerprint,
   story_media_type:'video/mp4',latest_user_time:NOW-3500,
   latest_question_hmac:hash('Qual o valor dessa?'),latest_question_duplicate_count:1}
  const fetchImpl=vi.fn(async()=>({ok:true,status:200,json:async()=>payload}))
  const result=await resolveStoryPilot({chatId:CHAT,message:{role:'user'}},{
   env:cfg,clock:()=>NOW,fetchImpl,logger:vi.fn(),dedupe:false
  })
  expect(result.status).toBe('FOUND')
  expect(result.latest_user_time).toBe(NOW-3500)
  expect(result.story_media_type).toBe('video/mp4')
  expect(result.latest_question_hmac).toBe(hash('Qual o valor dessa?'))
  expect(result.latest_question_duplicate_count).toBe(1)
  expect(fetchImpl).toHaveBeenCalledTimes(1)
 })
 it('V1.4L HMAC binds exact question to latest Story and rejects stale product associations',async()=>{
  expect(verifyLatestActionTurnV14l(found(),'QUAL O VALOR DESSA?',cfg.PRIME_CONTROL_STORY_RESOLVER_KEY)).toBe(true)
  for(const bad of [
   {...found(),latest_question_hmac:hash('Qual é o preço da calça?')},
   {...found(),latest_question_hmac:null},
   {...found(),latest_question_duplicate_count:2},
   {...found(),latest_question_duplicate_count:0},
  ]){
   const a=await run({resolveFn:async()=>bad})
   expect(a.status).toMatch(/ACTION_TURN_DUPLICATE_OR_UNPROVEN|ACTION_QUESTION_DOES_NOT_MATCH_LATEST_TURN/)
   expect(a.original_commercial_tool_called).toBe(false)
   expect(a.customer_messages_sent).toBe(0)
  }
 })
 it('V1.4L disallows a new Story with identical question in a five-minute window',async()=>{
  const a=await run({resolveFn:async()=>({...found(BASELINE_STORIES_20261008[5]),
   latest_question_duplicate_count:2})})
  expect(a.status).toBe('ACTION_TURN_DUPLICATE_OR_UNPROVEN')
  expect(a.tool_preview).toBeNull()
 })
 it('V1.4M verified ordinary DM retains the native commercial handoff without invoking it in QA',async()=>{
  const normal={status:'NO_VALID_STORY_ON_LATEST_USER',story_present:false,
   agent_verified:true,latest_user_time:NOW-3500,
   latest_question_hmac:hash('Qual o valor dessa?'),
   latest_question_duplicate_count:1,previous_story_within_memory_ttl:false}
  const a=await run({resolveFn:async()=>normal})
  expect(a.status).toBe('NATIVE_SEARCH_HANDOFF_QA_READY')
  expect(a.tool_shape_compatible).toBe(true)
  expect(a.story_verified).toBe(false)
  expect(a.tool_preview).toBeNull()
  expect(a.original_commercial_tool_called).toBe(false)
  expect(a.db_writes).toBe(0)
  expect(a.customer_messages_sent).toBe(0)
 })
 it('V1.4M ordinary reply within 15 minutes of Story is NOT safe native search',async()=>{
  const recent={status:'NO_VALID_STORY_ON_LATEST_USER',
   story_present:false,agent_verified:true,latest_user_time:NOW-3500,
   latest_question_hmac:hash('Qual o valor dessa?'),
   latest_question_duplicate_count:1,previous_story_within_memory_ttl:true}
  for(const old of [recent,{...recent,previous_story_within_memory_ttl:null},
   {...recent,previous_story_within_memory_ttl:undefined}]){
   const a=await run({resolveFn:async()=>old})
   expect(a.status).toBe('NATIVE_SEARCH_RECENT_STORY_OR_HISTORY_UNPROVEN')
   expect(a.original_commercial_tool_called).toBe(false)
  }
 })
 it('V1.4M rejects stale, duplicate and non-matching normal messages',async()=>{
  const normal={status:'NO_VALID_STORY_ON_LATEST_USER',story_present:false,
   agent_verified:true,latest_user_time:NOW-3500,
   latest_question_hmac:hash('Qual o valor dessa?'),
   latest_question_duplicate_count:1,previous_story_within_memory_ttl:false}
  const variations=[
   {...normal,latest_user_time:NOW-130000},
   {...normal,latest_question_duplicate_count:2},
   {...normal,latest_question_hmac:hash('Tem calça jeans?')},
   {...normal,agent_verified:false},
  ]
  for(const item of variations){
   const a=await run({resolveFn:async()=>item})
   expect(a.status).not.toBe('NATIVE_SEARCH_HANDOFF_QA_READY')
   expect(a.original_commercial_tool_called).toBe(false)
  }
 })
 it('V1.4M correlation carries read-only Story-memory boundary flag from the LAB resolver',async()=>{
  const payload={status:'NO_VALID_STORY_ON_LATEST_USER',story_present:false,
   agent_verified:true,latest_user_time:NOW-3500,
   latest_question_hmac:hash('Qual o valor dessa?'),
   latest_question_duplicate_count:1,previous_story_within_memory_ttl:true}
  const r=await resolveStoryPilot({chatId:CHAT,message:{role:'user'}},{
   env:cfg,clock:()=>NOW,logger:vi.fn(),dedupe:false,
   fetchImpl:vi.fn(async()=>({ok:true,status:200,json:async()=>payload}))
  })
  expect(r.previous_story_within_memory_ttl).toBe(true)
  expect(r.latest_question_hmac).toBe(hash('Qual o valor dessa?'))
  expect(r.story_present).toBe(false)
 })
 it('private route never accepts an unauthenticated tool request',async()=>{
  const r=response()
  await handler({method:'POST',headers:{},body:{...action,confirm:V14K_CONFIRM}},r)
  expect(r.http).toBe(401)
 })
})
