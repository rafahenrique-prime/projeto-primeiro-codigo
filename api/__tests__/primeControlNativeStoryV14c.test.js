import {describe,it,expect,vi} from 'vitest'
import { authorized, CASE, simulateNativeStoryMetadata } from '../prime-control-native-story-lab-v14c.js'

describe('V1.4C native Story metadata simulation: no external calls',()=>{
  it('uses the real getStoryContext with five fixed offline GPTMaker responses',async()=>{
    const result=await simulateNativeStoryMetadata()
    expect(result.ok).toBe(true)
    expect(result.cases).toHaveLength(5)
    expect(result.simulated_fetches).toBe(5)
    expect(result.external_calls).toBe(0)
    expect(result.client_messages_sent).toBe(0)
    expect(result.image_analysis_calls).toBe(0)
    expect(result.catalog_calls).toBe(0)
    expect(result.jev_calls).toBe(0)
    expect(result.actual_instagram_delivery).toBe(false)
    expect(result.story_id_source).toBe('SIMULATED_METADATA')
    expect(result.trace_sha256).toMatch(/^[a-f0-9]{64}$/)
    const byName=Object.fromEntries(result.cases.map(x=>[x.scenario,x]))
    expect(byName.LATEST).toMatchObject({passed:true,story_status:'FOUND',source:'story_message',
      selected_story_is_current:true})
    expect(byName.CONTINUATION).toMatchObject({passed:true,source:'story_continuation'})
    expect(byName.EXPIRED).toMatchObject({passed:true,story_status:'NO_STORY_IN_LATEST_MESSAGE'})
    expect(byName.LONG_MESSAGE).toMatchObject({passed:true,story_status:'NO_STORY_IN_LATEST_MESSAGE'})
    expect(byName.NEW_IMAGE).toMatchObject({passed:true,source:'user_image',native_story_id_present:false})
    const text=JSON.stringify(result)
    expect(text).not.toContain('lab.invalid')
    expect(text).not.toContain('gpt-files.com')
    expect(text).not.toContain('LAB_FIXTURE_TOKEN')
    expect(text).not.toContain('Qual o valor?')
    expect(text).not.toContain('Tem 42?')
  })
  it('does not authorize arbitrary callers or wrong LAB channel',()=>{
    const env={PRIME_CONTROL_STORY_LAB_SHARED_KEY:'fixture'}
    expect(authorized({headers:{}},env)).toBe(false)
    expect(authorized({headers:{'x-prime-control-story-key':'fixture','x-prime-lab':'GABY-OFICIAL'}},env)).toBe(false)
    expect(authorized({headers:{'x-prime-control-story-key':'fixture','x-prime-lab':'GABY-LAB-COMERCIAL-V1'}},env)).toBe(true)
    expect(CASE).toBe('NATIVE_METADATA_VANS_V14C')
  })
  it('does not use the real global fetch to contact GPTMaker, Instagram or catalog',async()=>{
    const spy=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>{throw new Error('EXTERNAL_FETCH_ATTEMPT')})
    try{
      const res=await simulateNativeStoryMetadata()
      expect(res.ok).toBe(true)
      expect(spy).not.toHaveBeenCalled()
    }finally{spy.mockRestore()}
  })
})
