import {describe,it,expect,vi} from 'vitest'
import {allowed,parseEvidence,searchTerms,sanitizeCandidates,decodeFixture,runVansStoryLab} from '../prime-control-vans-screenshot-lab-v14c.js'

const key='lab-test-secret'
const fixture=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(2700,42)]).toString('base64')
const env={PORT:'10000',LAB_PRODUCT_UNIVERSE_API_SECRET:'vision-fixture',
  PRIME_CONTROL_STORY_LAB_SHARED_KEY:key,PRIME_CONTROL_VANS_STORY_IMAGE_B64:fixture}
const visionEvidence={category:'Tênis',brand:'Vans',model:'UltraRange',color:'bege e marrom',description:'Tênis com logo Vans, mescla bege e marrom'}
const shadow={sucesso:true,dados:{produtos:[
  {nome:'Tênis Vans Ultrarange Neo | Bege',marca:'VANS',categoria:'Tênis'},
  {nome:'Tênis Vans Ultrarange Neo | Preto',marca:'VANS',categoria:'Tênis'}
]}}
describe('Vans screenshot LAB only',()=>{
it('auth is restricted to dedicated lab secret',()=>{
 expect(allowed({headers:{}},env)).toBe(false)
 expect(allowed({headers:{'x-prime-control-story-key':key,'x-prime-lab':'GABY-LAB-COMERCIAL-V1'}},env)).toBe(true)
 expect(allowed({headers:{'x-prime-control-story-key':key,'x-prime-lab':'GABY-OFICIAL'}},env)).toBe(false)
})
it('follows Vision without forcing Neo model',()=>{
 expect(searchTerms(visionEvidence)).toBe('tênis Vans Ultrarange bege')
 expect(searchTerms({...visionEvidence,brand:'unknown'})).toBeNull()
 expect(searchTerms({...visionEvidence,category:'Camiseta'})).toBeNull()
 expect(parseEvidence('unknown')).toBeNull()
})
it('requires validated binary fixture, never public image URL',()=>{
 expect(decodeFixture({})).toBeNull()
 expect(decodeFixture({...env,PRIME_CONTROL_VANS_STORY_IMAGE_B64:'bogus'})).toBeNull()
 expect(decodeFixture(env)?.bytes.length).toBeGreaterThan(2500)
})
it('runs Vision then read-only Shadow then JEV once; no customer price',async()=>{
 const urls=[]
 const f=vi.fn(async(url,req)=>{
   urls.push(String(url))
   if(String(url).includes('supplier-harness-ocr-proxy')){
     expect(req.body).toContain('data:image/jpeg;base64,')
     return Response.json({choices:[{message:{content:JSON.stringify(visionEvidence)}}]})
   }
   expect(String(url)).toContain('gaby-lab-shadow-catalog-v11')
   expect(req.headers['x-prime-lab']).toBe('GABY-LAB-COMERCIAL-V1')
   expect(JSON.parse(req.body).pergunta).toBe('tênis Vans Ultrarange bege')
   return Response.json(shadow)
 })
 const jev=vi.fn(async x=>{
  expect(x.labModeOverride).toBe('guard')
  expect(x.candidates).toHaveLength(2)
  return {status:'ok',action:'BLOCK_ASSERTION',reason:'JEV_BLOCK_ASSERTION',costUsd:0.00004}
 })
 const res=await runVansStoryLab({env,fetchImpl:f,jevFn:jev})
 expect(res.ok).toBe(true)
 expect(res.result.catalog.source).toBe('GABY_LAB_SHADOW_CATALOG_V11_READ_ONLY')
 expect(res.result.jev.action).toBe('BLOCK_ASSERTION')
 expect(res.result.actual_instagram_story).toBe(false)
 expect(res.result.catalog.live_prices_checked).toBe(false)
 expect(jev).toHaveBeenCalledTimes(1)
 expect(urls).toHaveLength(2)
})
it('does not call Shadow or JEV for uncertain image',async()=>{
 const f=vi.fn(async()=>Response.json({choices:[{message:{content:'{"category":"Tênis","brand":"unknown","model":"unknown","color":"bege","description":"Tênis"}'}}]}))
 const jev=vi.fn()
 const res=await runVansStoryLab({env,fetchImpl:f,jevFn:jev})
 expect(res.ok).toBe(false)
 expect(res.result.catalog.candidates).toBe(0)
 expect(f).toHaveBeenCalledTimes(1)
 expect(jev).not.toHaveBeenCalled()
})
it('rejects manipulated product label in catalogue candidate list',()=>{
 expect(sanitizeCandidates([{nome:'Tênis Nike Air',marca:'NIKE',categoria:'Tênis'}],visionEvidence)).toHaveLength(0)
})
})
