import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import handler,{runStoryVisionOnce,resetStoryVisionAttemptsForTests,STORY_VISION_MODEL} from '../prime-control-story-real-vision-v14d.js'
const fp='e7724e511a7e661c68aadfd9'
const goodEnv={
 PRIME_CONTROL_STORY_REAL_VISION_ENABLED:'true',
 PRIME_CONTROL_STORY_VISION_EXPECTED_FINGERPRINT:fp,
 PRIME_CONTROL_STORY_RESOLVER_KEY:'relay-secret-fixture',
 PRIME_CONTROL_STORY_PILOT_CHAT_ID:'qa-chat-fixture',
 LAB_PRODUCT_UNIVERSE_API_SECRET:'vision-secret-fixture',
 PORT:'10000',
}
const buffer=Buffer.from([255,216,255,...Array(30).fill(7)])
const loadMedia=vi.fn(async()=>({status:'MEDIA_VERIFIED',story_fingerprint:fp,
 media_type:'image/jpeg',buffer}))
function mockRes(){return {statusCode:200,body:null,
 setHeader(){return this},status(x){this.statusCode=x;return this},
 json(x){this.body=x;return this}}}
const old=process.env.PRIME_CONTROL_STORY_REAL_VISION_ENABLED
beforeEach(()=>{resetStoryVisionAttemptsForTests();loadMedia.mockClear()})
afterEach(()=>{if(old===undefined)delete process.env.PRIME_CONTROL_STORY_REAL_VISION_ENABLED
 else process.env.PRIME_CONTROL_STORY_REAL_VISION_ENABLED=old})

describe('V1.4D real Story Vision, one paid call maximum',()=>{
 it('blocks when feature is disabled or lacks expected story fingerprint',async()=>{
  const fake=vi.fn()
  expect((await runStoryVisionOnce({env:{...goodEnv,PRIME_CONTROL_STORY_REAL_VISION_ENABLED:'false'},fetchImpl:fake,loadMedia,logger:vi.fn()})).status).toBe('DISABLED')
  expect((await runStoryVisionOnce({env:{...goodEnv,PRIME_CONTROL_STORY_VISION_EXPECTED_FINGERPRINT:'invalid'},fetchImpl:fake,loadMedia,logger:vi.fn()})).status).toBe('EXPECTED_FINGERPRINT_MISSING')
  expect(fake).not.toHaveBeenCalled()
  expect(loadMedia).not.toHaveBeenCalled()
 })
 it('blocks wrong Story fingerprint BEFORE any paid Vision call',async()=>{
  const fake=vi.fn()
  const m=vi.fn(async()=>({...await loadMedia(),story_fingerprint:'0123456789abcdef01234567'}))
  const x=await runStoryVisionOnce({env:goodEnv,fetchImpl:fake,loadMedia:m,logger:vi.fn()})
  expect(x.status).toBe('STORY_FINGERPRINT_MISMATCH')
  expect(x.provider_calls).toBe(0)
  expect(fake).not.toHaveBeenCalled()
 })
 it('uses existing OCR proxy exactly once, reports sanitized result and usage',async()=>{
  const fetchImpl=vi.fn(async(url,request)=>{
   expect(url).toBe('http://127.0.0.1:10000/api/supplier-harness-ocr-proxy')
   expect(request.headers['x-prime-lab-secret']).toBe('vision-secret-fixture')
   const b=JSON.parse(request.body)
   expect(b.model).toBe(STORY_VISION_MODEL)
   expect(b.max_tokens).toBeLessThanOrEqual(220)
   expect(b.messages[0].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/)
   return Response.json({choices:[{message:{content:JSON.stringify({
    category:'Tênis',brand:'Vans',model:'Ultrarange',color:'bege',
    description:'Tênis com sola alta'
   })}}],usage:{prompt_tokens:100,completion_tokens:50,cost:0.00008}})
  })
  const logger=vi.fn()
  const x=await runStoryVisionOnce({env:goodEnv,fetchImpl,loadMedia,logger})
  expect(x.status).toBe('VISION_PARSED')
  expect(x.identified).toBe(true)
  expect(x.brand).toBe('Vans')
  expect(x.cost_usd).toBe(0.00008)
  expect(x.provider_calls).toBe(1)
  expect(fetchImpl).toHaveBeenCalledTimes(1)
  expect((await runStoryVisionOnce({env:goodEnv,fetchImpl,loadMedia,logger})).status).toBe('ALREADY_ATTEMPTED')
  expect(fetchImpl).toHaveBeenCalledTimes(1)
  const output=JSON.stringify(logger.mock.calls)
  for(const forbidden of ['relay-secret-fixture','vision-secret-fixture','qa-chat-fixture','data:image','sola alta'])
   expect(output).not.toContain(forbidden)
  for(const zero of ['catalog_calls','jev_calls','messages_sent','writes'])expect(x[zero]).toBe(0)
 })
 it('does not retry after provider timeout or other failure',async()=>{
  const fake=vi.fn(async()=>{throw Error('network secret fake')})
  const logger=vi.fn()
  expect((await runStoryVisionOnce({env:goodEnv,fetchImpl:fake,loadMedia,logger})).status).toBe('VISION_TIMEOUT_OR_NETWORK')
  expect((await runStoryVisionOnce({env:goodEnv,fetchImpl:fake,loadMedia,logger})).status).toBe('ALREADY_ATTEMPTED')
  expect(fake).toHaveBeenCalledTimes(1)
  expect(JSON.stringify(logger.mock.calls)).not.toContain('network secret fake')
 })
 it('rejects malformed image/disabled media gate without paid Vision',async()=>{
  const fake=vi.fn()
  const broken=vi.fn(async()=>({status:'VERCEL_GATE_DISABLED'}))
  const out=await runStoryVisionOnce({env:goodEnv,fetchImpl:fake,loadMedia:broken,logger:vi.fn()})
  expect(out.status).toBe('VERCEL_GATE_DISABLED')
  expect(fake).not.toHaveBeenCalled()
 })
 it('handler is disabled by default and needs LAB authorization',async()=>{
  process.env.PRIME_CONTROL_STORY_REAL_VISION_ENABLED='false'
  let res=mockRes()
  await handler({method:'POST',headers:{},body:{}},res)
  expect(res.statusCode).toBe(401)
  res=mockRes()
  const original=process.env.PRIME_CONTROL_STORY_LAB_SHARED_KEY
  try{
   process.env.PRIME_CONTROL_STORY_LAB_SHARED_KEY='fixture-key'
   await handler({method:'POST',headers:{
    'x-prime-control-story-key':'fixture-key','x-prime-lab':'GABY-LAB-COMERCIAL-V1',
    'content-type':'application/json'},body:{confirm:'ONE_SHOT_REAL_QA_STORY_VISION_V14D'}},res)
   expect(res.statusCode).toBe(503)
   expect(res.body.status).toBe('VISION_DISABLED')
  }finally{if(original===undefined)delete process.env.PRIME_CONTROL_STORY_LAB_SHARED_KEY
    else process.env.PRIME_CONTROL_STORY_LAB_SHARED_KEY=original}
 })
})
