import { describe,it,expect,vi } from 'vitest'
import {
  authorized,LAB_STORY_CASE,LAB_STORY_MEDIA,
  buildLabReplayPayload,executeLabStoryReplay
} from '../prime-control-story-lab-v14c.js'

const secret='fixture-secret';
function image() {
  return new Response(new Uint8Array([137,80,78,71,13,10,26,10]),{
    status:200,headers:{'content-type':'image/png'}
  })
}
function ocr() {
  return Response.json({ choices:[{message:{content:'Uma marca em um fundo.'}}] },{status:200})
}
describe('PRIME CONTROL V1.4C (LAB only)',()=>{
  it('bloqueia acesso sem credencial ou canal LAB',()=>{
    expect(authorized({headers:{}},{PRIME_CONTROL_STORY_LAB_SHARED_KEY:secret})).toBe(false)
    expect(authorized({headers:{'x-prime-control-story-key':secret,'x-prime-lab':'GABY-LAB-COMERCIAL-V1'}},{PRIME_CONTROL_STORY_LAB_SHARED_KEY:secret})).toBe(true)
    expect(authorized({headers:{'x-prime-control-story-key':secret,'x-prime-lab':'GABY-OFICIAL'}},{PRIME_CONTROL_STORY_LAB_SHARED_KEY:secret})).toBe(false)
  })
  it('chama apenas fixture em GitHub e proxy interno, sem Supabase e sem GPTMaker',async()=>{
    const urls=[]
    const fetchImpl=vi.fn(async(url,init={})=>{
      urls.push(String(url))
      if (url===LAB_STORY_MEDIA) return image()
      expect(url).toBe('http://127.0.0.1:10000/api/supplier-harness-ocr-proxy')
      const data=JSON.parse(init.body)
      expect(data.model).toBe('google/gemini-2.5-flash-lite')
      expect(data.messages[0].content[1].image_url.url).toMatch(/^data:image\/png;base64,/)
      return ocr()
    })
    const out=await executeLabStoryReplay({fetchImpl,env:{LAB_PRODUCT_UNIVERSE_API_SECRET:secret,PORT:'10000'}})
    expect(out.ok).toBe(true)
    expect(out.result.catalog).toEqual({source:'EMPTY_LAB_FIXTURE',queried:true,candidates:0})
    expect(out.result.jev.executed).toBe(false)
    expect(out.result.jev.decision).toBe('BLOCK_ASSERTION')
    expect(out.result.actual_instagram_story).toBe(false)
    expect(out.trace_sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(urls).toHaveLength(2)
  })
  it('não declara Vision bem-sucedida quando provedor falha',async()=>{
    const fetchImpl=vi.fn(async url => url===LAB_STORY_MEDIA?image():new Response('{}',{status:502}))
    const out=await executeLabStoryReplay({fetchImpl,env:{PRIME_CONTROL_STORY_LAB_SHARED_KEY:secret}})
    expect(out.ok).toBe(false)
    expect(out.stage).toBe('VISION_FAILED')
    expect(out.result.vision.status).toBe('ERROR')
    expect(out.result.jev.decision).toBe('BLOCK_ASSERTION')
  })
  it('nunca inventa preço, estoque ou correspondência de Story real',()=>{
    const out=buildLabReplayPayload({correlationId:'lab',visionOk:true,imageSha256:'123',statusCode:200,latencyMs:10})
    expect(out.catalog.candidates).toBe(0)
    expect(out.actual_instagram_story).toBe(false)
    expect(out.safe_customer_answer).toMatch(/não informe preço ou estoque/)
    expect(out.jev.executed).toBe(false)
  })
})
