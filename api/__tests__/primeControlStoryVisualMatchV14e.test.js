import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import handler,{runRealStoryVisualMatchOnce,resetVisualMatchAttemptsForTests,
 safeCatalogImage,extractVansCandidate,parseVisualMatchOutput,
 VISUAL_MATCH_MODEL,MATCH_THRESHOLD} from '../prime-control-story-visual-match-v14e.js'
import {OBSERVED_STORY_FINGERPRINT,SHADOW_V11,SEARCH_TERMS} from '../prime-control-story-shadow-jev-v14d.js'
const env={
 PRIME_CONTROL_STORY_VISUAL_MATCH_ENABLED:'true',
 PRIME_CONTROL_STORY_VISUAL_MATCH_EXPECTED_FINGERPRINT:OBSERVED_STORY_FINGERPRINT,
 LAB_PRODUCT_UNIVERSE_API_SECRET:'only-test-model-key',
 PRIME_CONTROL_STORY_RESOLVER_KEY:'only-test-relay-key',
 PRIME_CONTROL_STORY_PILOT_CHAT_ID:'qa-fixture-chat',PORT:'10000'
}
const jpeg=Buffer.from([255,216,255,224,0,16,...Array(40).fill(7)])
const catalog=[{nome:'Tênis Vans Ultrarange Neo | Bege',marca:'VANS',
 categoria:'Tênis',imagem:'https://cdn.dooca.store/161486/products/vans-0022.jpeg?v=1747693394'}]
const loadMedia=vi.fn(async()=>({status:'MEDIA_VERIFIED',
 story_fingerprint:OBSERVED_STORY_FINGERPRINT,media_type:'image/jpeg',buffer:jpeg}))
const image=()=>new Response(Uint8Array.from(jpeg),{headers:{'content-type':'image/jpeg'}})
function fake(visualReply={choice:'C1',confidence:0.98,reason:'sola lateral combina'}){
 return vi.fn(async(url,opts)=>{
  if(url===SHADOW_V11){
   expect(JSON.parse(opts.body).pergunta).toBe(SEARCH_TERMS)
   return Response.json({sucesso:true,dados:{produtos:catalog}})
  }
  if(url.startsWith('https://cdn.dooca.store/'))return image()
  expect(url).toBe('http://127.0.0.1:10000/api/supplier-harness-ocr-proxy')
  const body=JSON.parse(opts.body)
  expect(body.model).toBe(VISUAL_MATCH_MODEL)
  expect(body.messages[0].content.filter(x=>x.type==='image_url')).toHaveLength(2)
  expect(body.messages[0].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/)
  return Response.json({choices:[{message:{content:JSON.stringify(visualReply)}}],
   usage:{prompt_tokens:1830,completion_tokens:48,cost:0.000221}})
 })
}
const old=process.env.PRIME_CONTROL_STORY_VISUAL_MATCH_ENABLED
beforeEach(()=>{resetVisualMatchAttemptsForTests();loadMedia.mockClear()})
afterEach(()=>{vi.restoreAllMocks();if(old===undefined)delete process.env.PRIME_CONTROL_STORY_VISUAL_MATCH_ENABLED
 else process.env.PRIME_CONTROL_STORY_VISUAL_MATCH_ENABLED=old})
function res(){return{statusCode:200,body:null,setHeader(){return this},status(x){this.statusCode=x;return this},
 json(x){this.body=x;return this}}}
describe('V1.4E private visual image-pair gate',()=>{
 it('rejects external/non-HTTPS catalog image hosts and ambiguous candidates',()=>{
  for(const u of ['http://cdn.dooca.store/p.jpg','https://evil.invalid/p',
   'https://cdn.dooca.store.evil.invalid/p.jpg','https://x@cdn.dooca.store/p.jpg',
   'https://cdn.dooca.store:8443/p.jpg','https://cdn.dooca.store/p.jpg#f'])
   expect(safeCatalogImage(u)).toBe(false)
  expect(safeCatalogImage(catalog[0].imagem)).toBe(true)
  expect(extractVansCandidate([...catalog,...catalog])).toBe(null)
  expect(extractVansCandidate([{...catalog[0],marca:'NIKE'}])).toBe(null)
 })
 it('validates model output and threshold',()=>{
  expect(parseVisualMatchOutput('{"choice":"C1","confidence":0.95}').confidence).toBe(MATCH_THRESHOLD)
  expect(parseVisualMatchOutput('{"choice":"C9","confidence":0.99}')).toBe(null)
  expect(parseVisualMatchOutput('{"choice":"C1","confidence":1.8}')).toBe(null)
 })
 it('no external request if disabled/mismatched fingerprint',async()=>{
  const f=vi.fn()
  expect((await runRealStoryVisualMatchOnce({env:{...env,PRIME_CONTROL_STORY_VISUAL_MATCH_ENABLED:'false'},fetchImpl:f,loadMedia,logger:vi.fn()})).status).toBe('DISABLED')
  expect((await runRealStoryVisualMatchOnce({env:{...env,PRIME_CONTROL_STORY_VISUAL_MATCH_EXPECTED_FINGERPRINT:'wrong'},fetchImpl:f,loadMedia,logger:vi.fn()})).status).toBe('STORY_FINGERPRINT_MISMATCH')
  expect(f).not.toHaveBeenCalled();expect(loadMedia).not.toHaveBeenCalled()
 })
 it('fetches Shadow, CDN and Story at most once and compares exactly one pair, no JEV',async()=>{
  const fetchImpl=fake(),logger=vi.fn()
  const r=await runRealStoryVisualMatchOnce({env,fetchImpl,loadMedia,logger})
  expect(r.status).toBe('STRONG_VISUAL_CANDIDATE_REVIEW_REQUIRED')
  expect(r.choice).toBe('C1');expect(r.confidence).toBe(0.98)
  expect(r.catalog_image_calls).toBe(1);expect(r.media_calls).toBe(1)
  expect(r.shadow_calls).toBe(1);expect(r.comparison_calls).toBe(1)
  expect(r.old_vision_repeated).toBe(false);expect(r.jev_calls).toBe(0)
  expect(r.messages_sent).toBe(0);expect(r.writes).toBe(0)
  expect(r.exact_sku_verified).toBe(false);expect(r.decision).toBe('BLOCK_ASSERTION')
  const again=await runRealStoryVisualMatchOnce({env,fetchImpl,loadMedia,logger})
  expect(again.status).toBe('ALREADY_ATTEMPTED')
  expect(fetchImpl).toHaveBeenCalledTimes(3);expect(loadMedia).toHaveBeenCalledTimes(1)
  const output=JSON.stringify(logger.mock.calls)
  for(const secret of ['only-test-model-key','only-test-relay-key','qa-fixture-chat','data:image','cd n.dooca.store'])
   expect(output).not.toContain(secret)
 })
 it('does not force match on visual uncertainty or NONE',async()=>{
  let r=await runRealStoryVisualMatchOnce({env,fetchImpl:fake({choice:'C1',confidence:0.72}),loadMedia,logger:vi.fn()})
  expect(r.status).toBe('VISUAL_UNCERTAIN')
  resetVisualMatchAttemptsForTests()
  r=await runRealStoryVisualMatchOnce({env,fetchImpl:fake({choice:'NONE',confidence:0.95}),loadMedia,logger:vi.fn()})
  expect(r.status).toBe('NO_VISUAL_MATCH')
  expect(r.exact_sku_verified).toBe(false)
 })
 it('fails closed before any media or paid calls for invalid/unavailable candidate',async()=>{
  const f=vi.fn(async()=>Response.json({sucesso:true,dados:{produtos:[{...catalog[0],imagem:'https://evil.invalid/x'}]}}))
  const r=await runRealStoryVisualMatchOnce({env,fetchImpl:f,loadMedia,logger:vi.fn()})
  expect(r.status).toBe('CANDIDATE_IMAGE_NOT_UNIQUE_OR_MISSING')
  expect(f).toHaveBeenCalledTimes(1)
  expect(loadMedia).not.toHaveBeenCalled()
 })
 it('does not call paid model if Story fingerprint changed',async()=>{
  const f=fake(),m=vi.fn(async()=>({status:'MEDIA_VERIFIED',media_type:'image/jpeg',
   story_fingerprint:'0123456789abcdef01234567',buffer:jpeg}))
  const r=await runRealStoryVisualMatchOnce({env,fetchImpl:f,loadMedia:m,logger:vi.fn()})
  expect(r.status).toBe('STORY_MEDIA_NOT_VERIFIED')
  expect(f).toHaveBeenCalledTimes(2)
 })
 it('route requires LAB auth and default-off feature',async()=>{
  process.env.PRIME_CONTROL_STORY_VISUAL_MATCH_ENABLED='false'
  let r=res()
  await handler({method:'POST',headers:{},body:{}},r)
  expect(r.statusCode).toBe(401)
  const oldKey=process.env.PRIME_CONTROL_STORY_LAB_SHARED_KEY
  try{
   process.env.PRIME_CONTROL_STORY_LAB_SHARED_KEY='fixture-lab-key'
   r=res()
   await handler({method:'POST',headers:{
    'x-prime-control-story-key':'fixture-lab-key','x-prime-lab':'GABY-LAB-COMERCIAL-V1',
    'content-type':'application/json'},body:{confirm:'ONE_SHOT_VISUAL_MATCH_REAL_STORY_V14E'}},r)
   expect(r.statusCode).toBe(503)
  }finally{if(oldKey===undefined)delete process.env.PRIME_CONTROL_STORY_LAB_SHARED_KEY
   else process.env.PRIME_CONTROL_STORY_LAB_SHARED_KEY=oldKey}
 })
})


import {
  ST05_CANDIDATES,ST05_FINGERPRINT,ST05_VISUAL_MODEL,ST05_MATCH_THRESHOLD,
  parseSt05VisualOutput,resetSt05VisualAttemptsForTests,runSt05VisualMatchOnce,
  safeSt05CatalogImage,validSt05CandidateManifest,
} from '../prime-control-story-visual-match-st05-v16a.js'
import st05Handler from '../prime-control-story-visual-match-st05-v16a.js'

const st05Env={
  PRIME_CONTROL_ST05_VISUAL_MATCH_ENABLED:'true',
  PRIME_CONTROL_ST05_VISUAL_MATCH_EXPECTED_FINGERPRINT:ST05_FINGERPRINT,
  PRIME_CONTROL_STORY_VISION_EXPECTED_FINGERPRINT:ST05_FINGERPRINT,
  PRIME_CONTROL_STORY_ARCHIVE_SELECT_ENABLED:'true',
  LAB_PRODUCT_UNIVERSE_API_SECRET:'only-test-model-key',
  PRIME_CONTROL_STORY_RESOLVER_KEY:'only-test-relay-key',
  PRIME_CONTROL_STORY_PILOT_CHAT_ID:'qa-fixture-chat',
  PORT:'10000',
}
const st05Jpeg=Buffer.from([255,216,255,224,0,16,...Array(64).fill(9)])
const st05LoadMedia=vi.fn(async({expectedFingerprint})=>({
  status:'MEDIA_VERIFIED',story_fingerprint:expectedFingerprint,media_type:'image/jpeg',buffer:st05Jpeg,
}))
function st05Fetch(choice='C2',confidence=0.98){
  return vi.fn(async(url,opts)=>{
    if(url.startsWith('https://cdn.dooca.store/'))
      return new Response(Uint8Array.from(st05Jpeg),{headers:{'content-type':'image/jpeg'}})
    expect(url).toBe('http://127.0.0.1:10000/api/supplier-harness-ocr-proxy')
    const body=JSON.parse(opts.body)
    expect(body.model).toBe(ST05_VISUAL_MODEL)
    expect(body.messages[0].content.filter(x=>x.type==='image_url')).toHaveLength(8)
    return Response.json({choices:[{message:{content:JSON.stringify({
      choice,confidence,reason:'lavagem e costuras laterais semelhantes',
    })}}],usage:{prompt_tokens:4400,completion_tokens:78,cost:0.00041}})
  })
}
describe('V1.6A ST05 read-only visual candidate comparison',()=>{
  beforeEach(()=>{resetSt05VisualAttemptsForTests();st05LoadMedia.mockClear()})
  it('pins exactly the seven Diesel candidates returned by the Shadow snapshot',()=>{
    expect(ST05_CANDIDATES).toHaveLength(7)
    expect(validSt05CandidateManifest()).toBe(true)
    expect(new Set(ST05_CANDIDATES.map(x=>x.id)).size).toBe(7)
    expect(ST05_CANDIDATES.every(x=>x.brand==='Diesel'&&x.category==='Calças Jeans')).toBe(true)
    expect(ST05_CANDIDATES[3].name).toContain('Azul Clara Destroyed')
  })
  it('restricts image sources and model choices to verified candidates',()=>{
    expect(safeSt05CatalogImage(ST05_CANDIDATES[0].image)).toBe(true)
    expect(safeSt05CatalogImage('https://evil.invalid/image.jpg')).toBe(false)
    expect(safeSt05CatalogImage('https://cdn.dooca.store.evil.invalid/161486/products/x.jpg')).toBe(false)
    expect(parseSt05VisualOutput('{"choice":"C2","confidence":0.98}',ST05_CANDIDATES).candidate.id).toBe(ST05_CANDIDATES[1].id)
    expect(parseSt05VisualOutput('{"choice":"C9","confidence":0.99}')).toBe(null)
    expect(parseSt05VisualOutput('{"choice":"C1","confidence":1.2}')).toBe(null)
  })
  it('does not call media, product images or the model while disabled or fingerprint-mismatched',async()=>{
    const fetchImpl=vi.fn()
    const disabled=await runSt05VisualMatchOnce({env:{...st05Env,PRIME_CONTROL_ST05_VISUAL_MATCH_ENABLED:'false'},fetchImpl,loadMedia:st05LoadMedia,logger:vi.fn()})
    expect(disabled.status).toBe('DISABLED')
    const mismatch=await runSt05VisualMatchOnce({env:{...st05Env,PRIME_CONTROL_ST05_VISUAL_MATCH_EXPECTED_FINGERPRINT:'wrong'},fetchImpl,loadMedia:st05LoadMedia,logger:vi.fn()})
    expect(mismatch.status).toBe('STORY_FINGERPRINT_MISMATCH')
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(st05LoadMedia).not.toHaveBeenCalled()
  })
  it('rejects an incomplete manifest before media or paid model calls',async()=>{
    const fetchImpl=vi.fn()
    const r=await runSt05VisualMatchOnce({env:st05Env,candidates:ST05_CANDIDATES.slice(0,6),fetchImpl,loadMedia:st05LoadMedia,logger:vi.fn()})
    expect(r.status).toBe('CANDIDATE_MANIFEST_INVALID')
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(st05LoadMedia).not.toHaveBeenCalled()
  })
  it('makes one archived Story read, verifies seven catalog images and one model call, then remains non-assertive',async()=>{
    const fetchImpl=st05Fetch('C2',0.98),logger=vi.fn()
    const r=await runSt05VisualMatchOnce({env:st05Env,fetchImpl,loadMedia:st05LoadMedia,logger})
    expect(r.status).toBe('STRONG_VISUAL_CANDIDATE_REVIEW_REQUIRED')
    expect(r.choice).toBe('C2')
    expect(r.candidate_name).toBe('Calça Jeans Diesel 02')
    expect(r.candidate_bagy_product_id).toBe(8673120)
    expect(r.candidate_ids).toHaveLength(7)
    expect(r.media_calls).toBe(1)
    expect(r.catalog_image_calls).toBe(7)
    expect(r.verified_candidate_images).toBe(7)
    expect(r.comparison_calls).toBe(1)
    expect(r.old_story_vision_repeated).toBe(false)
    expect(r.jev_calls).toBe(0)
    expect(r.messages_sent).toBe(0)
    expect(r.writes).toBe(0)
    expect(r.exact_sku_verified).toBe(false)
    expect(r.commercial_price_verified).toBe(false)
    expect(r.physical_stock_verified).toBe(false)
    const again=await runSt05VisualMatchOnce({env:st05Env,fetchImpl,loadMedia:st05LoadMedia,logger})
    expect(again.status).toBe('ALREADY_ATTEMPTED')
    expect(st05LoadMedia).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledTimes(8)
    const output=JSON.stringify(logger.mock.calls)
    for(const secret of ['only-test-model-key','only-test-relay-key','qa-fixture-chat','data:image','cdn.dooca.store'])
      expect(output).not.toContain(secret)
  })
  it('fails closed if the archived Story fingerprint is different',async()=>{
    const fetchImpl=st05Fetch(),loadMedia=vi.fn(async()=>({...await st05LoadMedia({expectedFingerprint:ST05_FINGERPRINT}),story_fingerprint:'000000000000000000000000'}))
    const r=await runSt05VisualMatchOnce({env:st05Env,fetchImpl,loadMedia,logger:vi.fn()})
    expect(r.status).toBe('STORY_MEDIA_NOT_VERIFIED')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('requires the shared LAB key and one-shot confirmation on the HTTP route',async()=>{
    const r=res()
    await st05Handler({method:'POST',headers:{},body:{}},r)
    expect(r.statusCode).toBe(401)
    const oldKey=process.env.PRIME_CONTROL_STORY_LAB_SHARED_KEY
    const oldEnabled=process.env.PRIME_CONTROL_ST05_VISUAL_MATCH_ENABLED
    try{
      process.env.PRIME_CONTROL_STORY_LAB_SHARED_KEY='fixture-lab-key'
      process.env.PRIME_CONTROL_ST05_VISUAL_MATCH_ENABLED='false'
      const disabled=res()
      await st05Handler({method:'POST',headers:{
        'x-prime-control-story-key':'fixture-lab-key','x-prime-lab':'GABY-LAB-COMERCIAL-V1',
        'content-type':'application/json',
      },body:{confirm:'ONE_SHOT_VISUAL_MATCH_ST05_V16A'}},disabled)
      expect(disabled.statusCode).toBe(503)
    }finally{
      if(oldKey===undefined)delete process.env.PRIME_CONTROL_STORY_LAB_SHARED_KEY
      else process.env.PRIME_CONTROL_STORY_LAB_SHARED_KEY=oldKey
      if(oldEnabled===undefined)delete process.env.PRIME_CONTROL_ST05_VISUAL_MATCH_ENABLED
      else process.env.PRIME_CONTROL_ST05_VISUAL_MATCH_ENABLED=oldEnabled
    }
  })
})
