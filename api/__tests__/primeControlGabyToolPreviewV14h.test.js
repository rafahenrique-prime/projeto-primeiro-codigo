import {describe,it,expect,vi,beforeEach} from 'vitest'
import handler,{runToolPreview,nativeToolShape,clearToolPreviewForTests,CONFIRM}
 from '../prime-control-gaby-tool-preview-v14h.js'
import {REAL_STORY_FINGERPRINT,NATIVE_STORY_PRINT_TRAINING} from '../_primeControlStoryNativePolicyV14f.js'
const env={
 PRIME_CONTROL_GABY_TOOL_PREVIEW_ENABLED:'true',
 PRIME_CONTROL_GABY_TOOL_PREVIEW_EXPECTED_FINGERPRINT:REAL_STORY_FINGERPRINT,
 PRIME_CONTROL_STORY_PILOT_CHAT_ID:'qa-chat-context-id',
 PRIME_CONTROL_STORY_RESOLVER_KEY:'qa-secret-not-output',
}
const proof={
 status:'VERIFIED_NATIVE_POLICY_PREVIEW',
 policy_route:'GPTMAKER_NATIVE_REQUEST_STORY_PRINT',
 native_training_id:NATIVE_STORY_PRINT_TRAINING,
 messages_sent:0,writes:0,resolver_reads:1,
}
const p=(opts={})=>runToolPreview({
 env,clientId:env.PRIME_CONTROL_STORY_PILOT_CHAT_ID,
 question:'Qual o valor?',proofFn:vi.fn(async()=>proof),logger:vi.fn(),...opts
})
const response=()=>({setHeader(){return this},status(n){this.statusCode=n;return this},
 json(x){this.body=x;return this}})
beforeEach(()=>clearToolPreviewForTests())
describe('PRIME CONTROL V1.4H one-shot GABY LAB tool-compatible preview',()=>{
 it('does not duplicate the GPTMaker native training or send/quote any price or model',async()=>{
  const proofFn=vi.fn(async args=>{
   expect(args.env.PRIME_CONTROL_STORY_NATIVE_BRIDGE_ENABLED).toBe('true')
   expect(args.env.PRIME_CONTROL_STORY_NATIVE_BRIDGE_EXPECTED_FINGERPRINT).toBe(REAL_STORY_FINGERPRINT)
   return proof
  })
  const log=vi.fn()
  const x=await p({proofFn,logger:log})
  expect(x.status).toBe('QA_TOOL_RESPONSE_SHAPE_VERIFIED')
  expect(x.resolver_reads).toBe(1)
  expect(x.native_training_id).toBe(NATIVE_STORY_PRINT_TRAINING)
  expect(x.tool_preview.sucesso).toBe(true)
  expect(x.tool_preview.dados.produtos).toEqual([])
  expect(x.tool_preview.contexto.decision_layer.action).toBe('BLOCK_ASSERTION')
  expect(x.tool_preview.dados.totalVariacoes).toBe(0)
  expect(x.tool_preview.dados.variacoesRestantes).toBe(0)
  expect(x.tool_preview.contexto.tem_produtos).toBe(false)
  expect(x.messages_sent).toBe(0)
  expect(x.writes).toBe(0)
  expect(x.commercial_tool_calls).toBe(0)
  expect(x.paid_ai_calls).toBe(0)
  expect(x.actual_gptmaker_action_modified).toBe(false)
  expect(proofFn).toHaveBeenCalledTimes(1)
  const logs=JSON.stringify(log.mock.calls)
  for(const forbidden of ['qa-chat-context-id','qa-secret-not-output',
    'informacao_adicional','Qual o valor?','gpt-files.com'])
    expect(logs).not.toContain(forbidden)
 })
 it('fails closed before resolver when feature is off, client wrong or text not approved',async()=>{
  const proofFn=vi.fn()
  expect((await p({env:{...env,PRIME_CONTROL_GABY_TOOL_PREVIEW_ENABLED:'false'},proofFn})).status).toBe('DISABLED')
  expect((await p({env:{...env,PRIME_CONTROL_GABY_TOOL_PREVIEW_EXPECTED_FINGERPRINT:'other'},proofFn})).status).toBe('FINGERPRINT_MISMATCH')
  expect((await p({clientId:'other-client',proofFn})).status).toBe('CLIENT_NOT_ALLOWLISTED')
  expect((await p({question:'Qual o valor? ' ,proofFn})).status).toBe('QUESTION_NOT_ALLOWLISTED')
  expect(proofFn).not.toHaveBeenCalled()
 })
 it('a different Story cannot reuse the prior proof or claim exact SKU',async()=>{
  const x=await p({proofFn:async()=>({...proof,status:'NEW_STORY_NOT_IN_APPROVED_PROOF'})})
  expect(x.status).toBe('POLICY_NOT_VERIFIED')
  expect(x.tool_preview).toBe(null)
 })
 it('rejects maliciously altered prior proof',()=>{
  expect(nativeToolShape({...proof,messages_sent:1})).toBe(null)
  expect(nativeToolShape({...proof,writes:1})).toBe(null)
  expect(nativeToolShape({...proof,policy_route:'GPTMAKER_NATIVE_CONFIRMED_CATALOG'})).toBe(null)
  expect(nativeToolShape({...proof,native_training_id:'forged-id'})).toBe(null)
 })
 it('resolver errors do not trigger writable commercial fallback',async()=>{
  const x=await p({proofFn:async()=>{throw Error('test sensitive info')}})
  expect(x.status).toBe('READ_ONLY_PROOF_FAILED')
  expect(x.commercial_tool_calls).toBe(0)
  expect(x.writes).toBe(0)
 })
 it('caps read-only proof at 1 attempt per process',async()=>{
  const f=vi.fn(async()=>proof)
  await p({proofFn:f})
  const x=await p({proofFn:f})
  expect(x.status).toBe('ALREADY_ATTEMPTED')
  expect(f).toHaveBeenCalledTimes(1)
 })
 it('private API rejects unauthenticated and remains off by default',async()=>{
  const r=response()
  await handler({method:'POST',headers:{},body:{confirm:CONFIRM}},r)
  expect(r.statusCode).toBe(401)
 })
})
