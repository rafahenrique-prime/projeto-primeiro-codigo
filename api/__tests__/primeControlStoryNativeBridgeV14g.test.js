import {describe,it,expect,vi,beforeEach} from 'vitest'
import handler,{probeStoryNativeBridgeOnce,resetStoryNativeBridgeAttemptsForTests,V14G_EVENT}
 from '../prime-control-story-native-bridge-v14g.js'
import {REAL_STORY_FINGERPRINT,NATIVE_STORY_PRINT_TRAINING} from '../_primeControlStoryNativePolicyV14f.js'
const env={
 PRIME_CONTROL_STORY_NATIVE_BRIDGE_ENABLED:'true',
 PRIME_CONTROL_STORY_NATIVE_BRIDGE_EXPECTED_FINGERPRINT:REAL_STORY_FINGERPRINT,
 PRIME_CONTROL_STORY_PILOT_CHAT_ID:'verified-qa-chat-only',
 PRIME_CONTROL_STORY_RESOLVER_KEY:'test-secret-do-not-log',
}
const found={status:'FOUND',story_present:true,agent_verified:true,
 story_media_available:true,story_fingerprint:REAL_STORY_FINGERPRINT,
 http_status:200}
const r=()=>({setHeader(){return this},status(x){this.statusCode=x;return this},
 json(x){this.body=x;return this}})
beforeEach(()=>resetStoryNativeBridgeAttemptsForTests())
describe('V1.4G real existing resolver -> V1.4F native policy preview',()=>{
 it('requires exact fingerprint and feature ON, zero network calls otherwise',async()=>{
  const resolveFn=vi.fn()
  const a=await probeStoryNativeBridgeOnce({env:{...env,PRIME_CONTROL_STORY_NATIVE_BRIDGE_ENABLED:'false'},
    resolveFn,logger:vi.fn()})
  expect(a.status).toBe('DISABLED')
  const b=await probeStoryNativeBridgeOnce({env:{...env,PRIME_CONTROL_STORY_NATIVE_BRIDGE_EXPECTED_FINGERPRINT:'wrong'},
    resolveFn,logger:vi.fn()})
  expect(b.status).toBe('EXPECTED_FINGERPRINT_MISMATCH')
  expect(resolveFn).not.toHaveBeenCalled()
 })
 it('reads only allowlisted QA GPTMaker chat through Vercel resolver, never responds to customers',async()=>{
  const resolveFn=vi.fn(async(input,opts)=>{
   expect(input.chatId).toBe('verified-qa-chat-only')
   expect(input.message.role).toBe('user')
   expect(opts.env).toBe(env)
   expect(opts.dedupe).toBe(false)
   return found
  })
  const logger=vi.fn()
  const out=await probeStoryNativeBridgeOnce({env,resolveFn,logger})
  expect(out.event).toBe(V14G_EVENT)
  expect(out.status).toBe('VERIFIED_NATIVE_POLICY_PREVIEW')
  expect(out.policy_route).toBe('GPTMAKER_NATIVE_REQUEST_STORY_PRINT')
  expect(out.native_training_id).toBe(NATIVE_STORY_PRINT_TRAINING)
  expect(out.policy_invocations).toBe(1)
  expect(out.resolver_reads).toBe(1)
  expect(out.actual_gptmaker_tool_updated).toBe(false)
  expect(out.actual_gptmaker_answer_tested).toBe(false)
  expect(out.messages_sent).toBe(0)
  expect(out.writes).toBe(0)
  expect(out.catalog_calls).toBe(0)
  expect(out.jev_calls).toBe(0)
  expect(out.vision_calls).toBe(0)
  expect(resolveFn).toHaveBeenCalledTimes(1)
  const log=JSON.stringify(logger.mock.calls)
  for(const sensitive of ['verified-qa-chat-only','test-secret-do-not-log','gpt-files.com',
   'Qual o valor?','storyMediaUrl'])expect(log).not.toContain(sensitive)
  const again=await probeStoryNativeBridgeOnce({env,resolveFn,logger})
  expect(again.status).toBe('ALREADY_ATTEMPTED')
  expect(resolveFn).toHaveBeenCalledTimes(1)
 })
 it('never applies a previous Story result to a different latest Story',async()=>{
  const f=vi.fn(async()=>({...found,story_fingerprint:'0123456789abcdef01234567'}))
  const result=await probeStoryNativeBridgeOnce({env,resolveFn:f,logger:vi.fn()})
  expect(result.status).toBe('NEW_STORY_NOT_IN_APPROVED_PROOF')
  expect(result.policy_invocations).toBe(0)
  expect(result.native_training_id).toBe(null)
 })
 it('fails closed when context is absent, different agent or resolver failed',async()=>{
  let out=await probeStoryNativeBridgeOnce({env,resolveFn:async()=>({status:'NO_VALID_STORY_ON_LATEST_USER'}),logger:vi.fn()})
  expect(out.status).toBe('STORY_NOT_FOUND')
  resetStoryNativeBridgeAttemptsForTests()
  out=await probeStoryNativeBridgeOnce({env,resolveFn:async()=>({...found,agent_verified:false}),logger:vi.fn()})
  expect(out.status).toBe('STORY_NOT_VERIFIED')
  resetStoryNativeBridgeAttemptsForTests()
  out=await probeStoryNativeBridgeOnce({env,resolveFn:async()=>{throw Error('secret must not leak')},logger:vi.fn()})
  expect(out.status).toBe('RESOLVER_FAILED')
 })
 it('does not promote product assertion even if policy function is altered',async()=>{
  const result=await probeStoryNativeBridgeOnce({env,resolveFn:async()=>found,
   policyFn:()=>({route:'GPTMAKER_NATIVE_REQUEST_STORY_PRINT',messages_sent:0,
     exact_product_assertion_allowed:true,price_allowed:true}),logger:vi.fn()})
  expect(result.status).toBe('POLICY_MISMATCH_BLOCKED')
 })
 it('handler requires LAB auth and enabled flag',async()=>{
  let res=r()
  await handler({method:'POST',headers:{},body:{}},res)
  expect(res.statusCode).toBe(401)
 })
})
