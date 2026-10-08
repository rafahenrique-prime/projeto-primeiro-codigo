import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {runScenarioMatrixV14i,routeStoryScenarioV14i,
 ROUTER_SCENARIOS_V14I,MAX_CONTEXT_AGE_MS} from '../_primeControlStoryScenarioRouterV14i.js'
import handler,{ROUTER_CONFIRM_V14I} from '../prime-control-story-routing-preview-v14i.js'
import {NATIVE_STORY_PRINT_TRAINING,NATIVE_STORY_CONFIDENCE_TRAINING}
 from '../_primeControlStoryNativePolicyV14f.js'

const NOW=Date.UTC(2026,9,8,22,46,0)
const from=(name)=>structuredClone(ROUTER_SCENARIOS_V14I.find(s=>s.name===name).input)
const res=()=>({setHeader(){return this},status(n){this.http=n;return this},
 json(obj){this.payload=obj;return this}})
beforeEach(()=>vi.stubEnv('PRIME_CONTROL_STORY_ROUTING_V14I_ENABLED','false'))
afterEach(()=>vi.unstubAllEnvs())

describe('V1.4I Gaby LAB Story/native commercial scenario router',()=>{
 it('proves all synthetic scenarios without any tool, catalog, AI or GPTMaker reply',()=>{
  const r=runScenarioMatrixV14i()
  expect(r.all_pass).toBe(true)
  expect(r.total).toBeGreaterThanOrEqual(14)
  expect(r.passed).toBe(r.total)
  expect(r.real_story_fetched).toBe(false)
  expect(r.actual_gptmaker_messages).toBe(0)
  expect(r.paid_ai_calls).toBe(0)
  expect(r.db_writes).toBe(0)
 })
 it('regular chat preserves the existing native commercial search without invoking it',()=>{
  const a=routeStoryScenarioV14i(from('NORMAL_CHAT_KEEP_NATIVE'),NOW)
  expect(a.route).toBe('KEEP_NATIVE_SEARCH')
  expect(a.native_training_id).toBeNull()
  expect(a.intended_handler).toBe('PRESERVE_GPTMAKER_NATIVE_BUSCAR_PRODUTOS_UNCHANGED')
  expect(a.active_commercial_tool_invoked).toBe(false)
 })
 it('a historic or different Story cannot reuse the Vans evidence',()=>{
  for(const scenario of ['NEW_STORY_MUST_NOT_REUSE_PRIOR_VANS',
   'OLD_CONTEXT_MUST_NOT_REPLAY','STORY_UNVERIFIED_WITH_NO_EVIDENCE']){
   expect(routeStoryScenarioV14i(from(scenario),NOW).route).toBe('BLOCK')
  }
  const a=from('STORY_MODEL_UNCERTAIN_JEV_VETO')
  a.evidence.observed_at_ms=NOW-(MAX_CONTEXT_AGE_MS+1000)
  expect(routeStoryScenarioV14i(a,NOW).route).toBe('BLOCK')
 })
 it('JEV veto always wins over even a 99% visual estimate',()=>{
  let a=routeStoryScenarioV14i(from('STORY_VISUAL_STRONG_BUT_JEV_VETO'),NOW)
  expect(a.route).toBe('REQUEST_STORY_PRINT')
  expect(a.native_training_id).toBe(NATIVE_STORY_PRINT_TRAINING)
  expect(a.price_allowed).toBe(false)
  expect(a.product_assertion_allowed).toBe(false)
 })
 it('do not prompt for the print twice',()=>{
  let a=routeStoryScenarioV14i(from('STORY_PRINT_ALREADY_REQUESTED'),NOW)
  expect(a.route).toBe('ASK_ONE_DETAIL')
  expect(a.native_training_id).toBe(NATIVE_STORY_CONFIDENCE_TRAINING)
  let b=from('STORY_MODEL_UNCERTAIN_JEV_VETO')
  b.history.customer_already_supplied_print=true
  expect(routeStoryScenarioV14i(b,NOW).route).toBe('ASK_ONE_DETAIL')
 })
 it('reuploaded screenshot must be analyzed before a question; never ask the same print again',()=>{
  const x=routeStoryScenarioV14i(from('IMAGE_ALREADY_PROVIDED_NEEDS_ANALYSIS'),NOW)
  expect(x.route).toBe('ANALYZE_UPLOADED_IMAGE')
  expect(x.gemini_calls).toBe(0)
  const y=routeStoryScenarioV14i(from('IMAGE_ALREADY_PROVIDED_UNCERTAIN'),NOW)
  expect(y.route).toBe('ASK_ONE_DETAIL')
  expect(y.native_training_id).toBe(NATIVE_STORY_CONFIDENCE_TRAINING)
 })
 it('confirmed exact SKU requires aligned vision, catalog and JEV; price and stock are separate',()=>{
  const x=routeStoryScenarioV14i(from('STORY_MODEL_VISUAL_MATCH_AND_SKU_VERIFIED'),NOW)
  expect(x.route).toBe('VERIFIED_PRODUCT')
  expect(x.product_assertion_allowed).toBe(true)
  expect(x.price_allowed).toBe(false)
  expect(x.stock_allowed).toBe(false)
  expect(x.pix_allowed).toBe(false)
  for(const change of [
   a=>{a.evidence.catalog.exact_sku_verified=false},
   a=>{a.evidence.visual.media_key='ffffffffffffffffffffffff'},
   a=>{a.evidence.jev.action='BLOCK_ASSERTION'},
   a=>{a.evidence.visual.confidence=.90},
   a=>{a.evidence.catalog.media_key='000000000000000000000000'},
  ]){
   const input=from('STORY_MODEL_VISUAL_MATCH_AND_SKU_VERIFIED')
   change(input)
   expect(routeStoryScenarioV14i(input,NOW).product_assertion_allowed).toBe(false)
  }
 })
 it('ordinary chat cannot pass with stale or undecidable context',()=>{
  for(const scenario of ['RESOLVER_FAILURE_NOT_ORDINARY_CHAT',
   'NORMAL_CHAT_WITH_PENDING_STORY_NOT_AUTO_SEARCH','OFF_SCOPE_AGENT_DENIED']){
   expect(routeStoryScenarioV14i(from(scenario),NOW).route).toBe('BLOCK')
  }
 })
 it('rejects unknown agent, forged source, future timestamps, unknown story media and absent history',()=>{
  const initial=from('STORY_MODEL_UNCERTAIN_JEV_VETO')
  const changes=[
   a=>{a.scope='GABY_OFICIAL'},
   a=>{a.context.source='USER_SUPPLIED'},
   a=>{a.context.chat_allowlisted=false},
   a=>{a.context.latest_user_time_ms=NOW+60_000},
   a=>{a.context.media_kind='UNKNOWN'},
   a=>{a.history=null},
   a=>{a.evidence.context_source='RAW_USER_MESSAGE'},
  ]
  for(const change of changes){
   const a=structuredClone(initial)
   change(a)
   expect(routeStoryScenarioV14i(a,NOW).route).toBe('BLOCK')
  }
 })
 it('all routes are suggestions with no live writes or outbound delivery',()=>{
  for(const caseData of ROUTER_SCENARIOS_V14I){
   const d=routeStoryScenarioV14i(caseData.input,NOW)
   expect(d.active_commercial_tool_invoked).toBe(false)
   expect(d.commercial_tool_unchanged).toBe(true)
   expect(d.sends_messages).toBe(false)
   expect(d.writes).toBe(false)
   expect(d.catalog_calls).toBe(0)
   expect(d.gemini_calls).toBe(0)
   expect(d.jev_calls).toBe(0)
   expect(d.pix_allowed).toBe(false)
  }
 })
 it('route is secure by default, rejects unauthenticated and invalid HTTP method',()=>{
  let response=res()
  handler({method:'GET',headers:{},body:{}},response)
  expect(response.http).toBe(405)
  response=res()
  handler({method:'POST',headers:{},body:{confirm:ROUTER_CONFIRM_V14I}},response)
  expect(response.http).toBe(401)
 })
})
