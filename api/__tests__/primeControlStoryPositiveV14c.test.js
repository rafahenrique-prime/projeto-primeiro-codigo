import { describe,it,expect,vi } from 'vitest'
import { authorized,visionEvidence,labCandidates,positiveReplay,PHOTO } from '../prime-control-story-positive-lab-v14c.js'
const secret='test-secret'
const env={LAB_PRODUCT_UNIVERSE_API_SECRET:secret,PORT:'10000'}
const jpeg=Buffer.from([255,216,255,224,1,2,3,4,5,6,7,8,9,10,11,12,13])
const image=()=>new Response(jpeg,{headers:{'content-type':'image/jpeg'}})
const vision=(data)=>Response.json({choices:[{message:{content:JSON.stringify(data)}}]})
const match={category:'Tênis',brand:'New Balance',model:'9060',color:'Branco'}
describe('PRIME CONTROL positive LAB safety gates',()=>{
  it('rejects access without correct lab header',()=>{
    expect(authorized({headers:{}},{PRIME_CONTROL_STORY_LAB_SHARED_KEY:secret})).toBe(false)
    expect(authorized({headers:{'x-prime-control-story-key':secret,'x-prime-lab':'GABY-LAB-COMERCIAL-V1'}},{PRIME_CONTROL_STORY_LAB_SHARED_KEY:secret})).toBe(true)
  })
  it('does not invent candidates when Vision is uncertain',()=>{
    expect(visionEvidence('bad response')).toBeNull()
    expect(labCandidates({category:'Tênis',brand:'New Balance',model:'unknown'})).toEqual([])
    expect(labCandidates({category:'Tênis',brand:'Nike',model:'9060'})).toEqual([])
    expect(labCandidates({category:'Óculos',brand:'New Balance',model:'9060'})).toEqual([])
  })
  it('uses only public image and local Vision proxy; calls JEV once',async()=>{
    const calls=[]
    const f=vi.fn(async(url,req)=>{
      calls.push({url,method:req.method})
      if(url===PHOTO)return image()
      expect(url).toBe('http://127.0.0.1:10000/api/supplier-harness-ocr-proxy')
      return vision(match)
    })
    const jev=vi.fn(async(arg)=>{
      expect(arg.labModeOverride).toBe('guard')
      expect(arg.candidates).toHaveLength(2)
      return {status:'ok',action:'ALLOW_AUTO',reason:'JEV_STRONG_SINGLE_MATCH',selectedCandidateId:'C1',costUsd:0.00001}
    })
    const res=await positiveReplay({fetchImpl:f,jevFn:jev,env})
    expect(res.ok).toBe(true)
    expect(res.result.actual_instagram_story).toBe(false)
    expect(res.result.catalog.prices_checked).toBe(false)
    expect(res.result.catalog.stock_checked).toBe(false)
    expect(calls).toHaveLength(2)
    expect(jev).toHaveBeenCalledTimes(1)
  })
  it('blocks when model absent, and never calls JEV',async()=>{
    const f=vi.fn(async(url)=>url===PHOTO?image():vision({...match,model:'unknown'}))
    const jev=vi.fn()
    const res=await positiveReplay({fetchImpl:f,jevFn:jev,env})
    expect(res.ok).toBe(false)
    expect(res.result.jev.action).toBe('BLOCK_ASSERTION')
    expect(jev).not.toHaveBeenCalled()
  })
  it('fails closed on JEV outage',async()=>{
    const f=vi.fn(async(url)=>url===PHOTO?image():vision(match))
    const jev=vi.fn(async()=>({status:'unavailable',action:'BLOCK_ASSERTION',reason:'JEV_HTTP_503'}))
    const res=await positiveReplay({fetchImpl:f,jevFn:jev,env})
    expect(res.ok).toBe(false)
    expect(res.result.jev.action).toBe('BLOCK_ASSERTION')
  })
})
