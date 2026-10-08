import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import handler,{
 runStoryShadowJevOnce,resetStoryShadowJevOnceForTests,
 OBSERVED_STORY_FINGERPRINT,SHADOW_V11,SEARCH_TERMS
} from '../prime-control-story-shadow-jev-v14d.js'
const env={
 PRIME_CONTROL_STORY_SHADOW_JEV_ENABLED:'true',
 PRIME_CONTROL_STORY_SHADOW_JEV_EXPECTED_FINGERPRINT:OBSERVED_STORY_FINGERPRINT,
}
const items=[
 {nome:'Vans Ultra Range Neo 2.0 Bege',marca:'Vans',categoria:'Tênis'},
 {nome:'Vans Old Skool Preto',marca:'Vans',categoria:'Tênis'},
 {nome:'Nike Dunk Bege',marca:'Nike',categoria:'Tênis'},
]
function mockRes(){return {statusCode:200,body:null,setHeader(){return this},
 status(c){this.statusCode=c;return this},json(x){this.body=x;return this}}}
function fReturning(products=items){return vi.fn(async()=>Response.json({sucesso:true,dados:{produtos:products}}))}
beforeEach(()=>resetStoryShadowJevOnceForTests())
const saved=process.env.PRIME_CONTROL_STORY_SHADOW_JEV_ENABLED
afterEach(()=>{if(saved===undefined)delete process.env.PRIME_CONTROL_STORY_SHADOW_JEV_ENABLED
else process.env.PRIME_CONTROL_STORY_SHADOW_JEV_ENABLED=saved})

describe('LAB Story read-only Shadow/JEV V1.4D',()=>{
 it('never calls paid model or catalog when disabled or fingerprint mismatch',async()=>{
  const f=vi.fn(),jev=vi.fn()
  expect((await runStoryShadowJevOnce({env:{...env,PRIME_CONTROL_STORY_SHADOW_JEV_ENABLED:'false'},fetchImpl:f,jevFn:jev,logger:vi.fn()})).status).toBe('DISABLED')
  expect((await runStoryShadowJevOnce({env:{...env,PRIME_CONTROL_STORY_SHADOW_JEV_EXPECTED_FINGERPRINT:'wrong'},fetchImpl:f,jevFn:jev,logger:vi.fn()})).status).toBe('STORY_FINGERPRINT_MISMATCH')
  expect(f).not.toHaveBeenCalled();expect(jev).not.toHaveBeenCalled()
 })
 it('calls only Shadow read-only once and only JEV guard once, excluding non family matches',async()=>{
  const fetchImpl=fReturning()
  const jevFn=vi.fn(async()=>({status:'ok',action:'ASK_CLARIFY',reason:'JEV_AMBIGUOUS_OR_LOW_CONFIDENCE',confidence:0.72,selectedCandidateId:null,costUsd:0.00003}))
  const logger=vi.fn()
  const r=await runStoryShadowJevOnce({env,fetchImpl,jevFn,logger})
  expect(r.status).toBe('SHADOW_JEV_RECORDED')
  expect(r.candidate_count).toBe(1)
  expect(r.candidate_names).toEqual(['Vans Ultra Range Neo 2.0 Bege'])
  expect(r.jev_action).toBe('ASK_CLARIFY')
  expect(r.jev_cost_usd).toBe(0.00003)
  expect(fetchImpl).toHaveBeenCalledTimes(1)
  expect(fetchImpl.mock.calls[0][0]).toBe(SHADOW_V11)
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({pergunta:SEARCH_TERMS})
  expect(jevFn).toHaveBeenCalledTimes(1)
  expect(jevFn.mock.calls[0][0].labModeOverride).toBe('guard')
  expect(jevFn.mock.calls[0][0].candidates).toHaveLength(1)
  for(const k of ['vision_calls','media_downloads','messages_sent','writes'])
   expect(r[k]).toBe(0)
  expect(r.commercial_price_verified).toBe(false)
  expect(r.physical_stock_verified).toBe(false)
  expect((await runStoryShadowJevOnce({env,fetchImpl,jevFn,logger})).status).toBe('ALREADY_ATTEMPTED')
  expect(fetchImpl).toHaveBeenCalledTimes(1)
  expect(jevFn).toHaveBeenCalledTimes(1)
 })
 it('never calls JEV for no match, invalid result, network failure',async()=>{
  const jevFn=vi.fn()
  const noMatch=await runStoryShadowJevOnce({env,fetchImpl:fReturning([{nome:'Vans Old Skool',marca:'Vans'}]),jevFn,logger:vi.fn()})
  expect(noMatch.status).toBe('SHADOW_NO_VERIFIED_FAMILY_MATCH')
  resetStoryShadowJevOnceForTests()
  const invalid=await runStoryShadowJevOnce({env,fetchImpl:vi.fn(async()=>Response.json({sucesso:false})),jevFn,logger:vi.fn()})
  expect(invalid.status).toBe('SHADOW_INVALID_RESPONSE')
  resetStoryShadowJevOnceForTests()
  const bad=await runStoryShadowJevOnce({env,fetchImpl:vi.fn(async()=>{throw Error('token 123')}),jevFn,logger:vi.fn()})
  expect(bad.status).toBe('SHADOW_NETWORK_ERROR')
  expect(jevFn).not.toHaveBeenCalled()
 })
 it('a strong JEV ALLOW does not assert price, stock, or send message',async()=>{
  const r=await runStoryShadowJevOnce({env,fetchImpl:fReturning(),logger:vi.fn(),
   jevFn:vi.fn(async()=>({status:'ok',action:'ALLOW_AUTO',reason:'JEV_STRONG_SINGLE_MATCH',confidence:0.99,selectedCandidateId:'C1'}))})
  expect(r.jev_action).toBe('ALLOW_AUTO')
  expect(r.outbound_recommendation).toBe('DO_NOT_SEND_ANY_REPLY')
  expect(r.commercial_price_verified).toBe(false)
  expect(r.physical_stock_verified).toBe(false)
 })
 it('route disabled by default and requires same protected LAB header',async()=>{
  process.env.PRIME_CONTROL_STORY_SHADOW_JEV_ENABLED='false'
  let res=mockRes()
  await handler({method:'POST',headers:{},body:{}},res)
  expect(res.statusCode).toBe(401)
  const prior=process.env.PRIME_CONTROL_STORY_LAB_SHARED_KEY
  try{
   process.env.PRIME_CONTROL_STORY_LAB_SHARED_KEY='only-lab-secret'
   res=mockRes()
   await handler({method:'POST',headers:{
    'x-prime-control-story-key':'only-lab-secret','x-prime-lab':'GABY-LAB-COMERCIAL-V1',
    'content-type':'application/json'},body:{confirm:'ONE_SHOT_REAL_QA_SHADOW_JEV_V14D'}},res)
   expect(res.statusCode).toBe(503)
  }finally{if(prior===undefined)delete process.env.PRIME_CONTROL_STORY_LAB_SHARED_KEY
   else process.env.PRIME_CONTROL_STORY_LAB_SHARED_KEY=prior}
 })
})
