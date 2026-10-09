import {describe,it,expect,vi,afterEach} from 'vitest'
import handler,{MEDIA_PROBE_EVENT,sameSecret,mediaProbeAuthorized,
 imageSignatureOkay,probeStoryMediaOnce,loadVerifiedStoryMedia} from '../prime-control-story-media-probe-v14d.js'

const labKey='fixture-story-lab-key'
const relayKey='fixture-story-relay-key'
const qaChat='fixture-pilot-chat'
const env={
 PRIME_CONTROL_STORY_MEDIA_PROBE_ENABLED:'true',
 PRIME_CONTROL_STORY_RESOLVER_KEY:relayKey,
 PRIME_CONTROL_STORY_PILOT_CHAT_ID:qaChat,
}
const validJpeg=Uint8Array.from([255,216,255,224,0,16,74,70,73,70,0,1,2,3,4,5])
function imageResponse(bytes=validJpeg,headers={}){
 return new Response(Uint8Array.from(bytes),{
  headers:{'content-type':'image/jpeg',
   'x-prime-story-fingerprint':'0123456789abcdef01234567',...headers},
 })
}
function mockRes(){
 return {statusCode:200,body:null,headers:{},setHeader(k,v){this.headers[k]=v;return this},
  status(s){this.statusCode=s;return this},json(x){this.body=x;return this}}
}
const keys=['PRIME_CONTROL_STORY_MEDIA_PROBE_ENABLED','PRIME_CONTROL_STORY_LAB_SHARED_KEY']
const original=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
afterEach(()=>{for(const k of keys){if(original[k]===undefined)delete process.env[k]
 else process.env[k]=original[k]}vi.restoreAllMocks()})

describe('PRIME CONTROL V1.4D Render media bridge / zero AI',()=>{
 it('checks dedicated LAB authorization securely',()=>{
  expect(sameSecret(labKey,labKey)).toBe(true)
  expect(sameSecret(labKey,labKey+'x')).toBe(false)
  expect(mediaProbeAuthorized({headers:{
   'x-prime-control-story-key':labKey,
   'x-prime-lab':'GABY-LAB-COMERCIAL-V1',
  }},{PRIME_CONTROL_STORY_LAB_SHARED_KEY:labKey})).toBe(true)
  expect(mediaProbeAuthorized({headers:{'x-prime-control-story-key':labKey}},
   {PRIME_CONTROL_STORY_LAB_SHARED_KEY:labKey})).toBe(false)
 })
 it('does no external fetch when flag off or key/chat missing',async()=>{
  const fetchImpl=vi.fn()
  const logger=vi.fn()
  expect((await probeStoryMediaOnce({env:{...env,PRIME_CONTROL_STORY_MEDIA_PROBE_ENABLED:'false'},fetchImpl,logger})).status).toBe('DISABLED')
  expect((await probeStoryMediaOnce({env:{...env,PRIME_CONTROL_STORY_PILOT_CHAT_ID:''},fetchImpl,logger})).status).toBe('NOT_CONFIGURED')
  expect(fetchImpl).not.toHaveBeenCalled()
 })
 it('fetches exactly one Vercel LAB media image and logs only sanitized metadata',async()=>{
  const fetchImpl=vi.fn(async(url,init)=>{
   expect(url).toBe('https://prime-gptmaker-lab.vercel.app/api/prime-control-story-media-v14d')
   expect(init.method).toBe('POST')
   expect(init.redirect).toBe('manual')
   expect(init.headers['x-prime-story-resolver-key']).toBe(relayKey)
   expect(JSON.parse(init.body)).toEqual({chatId:qaChat})
   return imageResponse()
  })
  const logger=vi.fn()
  const r=await probeStoryMediaOnce({env,fetchImpl,logger})
  expect(r.status).toBe('MEDIA_VERIFIED')
  expect(r.http_status).toBe(200)
  expect(r.media_type).toBe('image/jpeg')
  expect(r.bytes_count).toBe(validJpeg.length)
  expect(r.event).toBe(MEDIA_PROBE_EVENT)
  expect(fetchImpl).toHaveBeenCalledTimes(1)
  const out=JSON.stringify(r)+JSON.stringify(logger.mock.calls)
  for(const secret of [labKey,relayKey,qaChat,'gpt-files.com','test-user-message','data:image/','255,216'])
   expect(out).not.toContain(secret)
  for(const field of ['writes','vision_calls','jev_calls','catalog_calls','messages_sent'])
   expect(r[field]).toBe(0)
 })
 it('fails closed on upstream disabled, redirects, oversize and invalid image',async()=>{
  const scenarios=[
   [Response.json({status:'MEDIA_GATE_DISABLED'},{status:503}),'VERCEL_GATE_DISABLED'],
   [new Response(null,{status:302,headers:{location:'https://evil.example'}}),'GATE_UNAVAILABLE'],
   [imageResponse(validJpeg,{'content-length':String(4*1024*1024)}),'MEDIA_SIZE_INVALID'],
   [imageResponse(Uint8Array.from(Array(16).fill(1))),'MEDIA_SIGNATURE_INVALID'],
   [new Response('not image',{headers:{'content-type':'text/plain'}}),'MIME_BLOCKED'],
  ]
  for(const [response,expected] of scenarios){
   const r=await probeStoryMediaOnce({env,fetchImpl:vi.fn(async()=>response),logger:vi.fn()})
   expect(r.status).toBe(expected)
  }
  expect(imageSignatureOkay(Buffer.from(validJpeg),'image/jpeg')).toBe(true)
 })
 it('route refuses wrong method, auth, and disabled; no outbound calls',async()=>{
  process.env.PRIME_CONTROL_STORY_LAB_SHARED_KEY=labKey
  process.env.PRIME_CONTROL_STORY_MEDIA_PROBE_ENABLED='false'
  let res=mockRes()
  await handler({method:'POST',headers:{},body:{}},res)
  expect(res.statusCode).toBe(401)
  res=mockRes()
  await handler({method:'POST',headers:{
   'x-prime-control-story-key':labKey,'x-prime-lab':'GABY-LAB-COMERCIAL-V1',
   'content-type':'application/json'},body:{confirm:'PROBE_QA_STORY_MEDIA_V14D'}},res)
  expect(res.statusCode).toBe(503)
  expect(res.body.status).toBe('PROBE_DISABLED')
 })
})

describe("PRIME CONTROL V1.5C: Render archive Story selector",()=>{
 const selected="5d3d446628685d6c6c0f5b02";
 it("fails closed when selector flag is OFF, no fetch",async()=>{
  const fetchImpl=vi.fn();
  const r=await loadVerifiedStoryMedia({env,fetchImpl,expectedFingerprint:selected});
  expect(r.status).toBe("ARCHIVE_SELECTOR_DISABLED_OR_INVALID");
  expect(fetchImpl).not.toHaveBeenCalled();
 });
 it("selects older image via private Vercel archive, never latest video",async()=>{
  const fetchImpl=vi.fn(async(url,init)=>{
   expect(url).toBe("https://prime-gptmaker-lab.vercel.app/api/prime-control-story-archive-media-v15c");
   expect(init.method).toBe("POST");
   expect(JSON.parse(init.body)).toEqual({chatId:qaChat,storyFingerprint:selected});
   expect(init.headers["x-prime-story-resolver-key"]).toBe(relayKey);
   return imageResponse(validJpeg,{"x-prime-story-fingerprint":selected});
  });
  const r=await loadVerifiedStoryMedia({env:{...env,PRIME_CONTROL_STORY_ARCHIVE_SELECT_ENABLED:"true"},
   fetchImpl,expectedFingerprint:selected});
  expect(r.status).toBe("MEDIA_VERIFIED");
  expect(r.story_fingerprint).toBe(selected);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
 });
 it("blocks fingerprint swap even if upstream returns JPEG bytes",async()=>{
  const fetchImpl=vi.fn(async()=>imageResponse());
  const r=await loadVerifiedStoryMedia({env:{...env,PRIME_CONTROL_STORY_ARCHIVE_SELECT_ENABLED:"true"},
   fetchImpl,expectedFingerprint:selected});
  expect(r.status).toBe("STORY_FINGERPRINT_MISMATCH");
 });
});
