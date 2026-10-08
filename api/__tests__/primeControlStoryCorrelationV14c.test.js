import {describe,it,expect,vi,beforeEach} from 'vitest'
import {extractInboundChatId,extractInboundEventIdentity,isUserInbound,resolveStoryPilot,
 clearPilotCorrelationCacheForTests} from '../_primeControlStoryCorrelationV14c.js'

const pilot="only-lab-pilot-chat"
const env={PRIME_CONTROL_STORY_PILOT_CHAT_ID:pilot,PRIME_CONTROL_STORY_RESOLVER_KEY:'unit-key-do-not-share'}
const request={chatId:pilot,message:{role:'user',id:'qa-message-001',text:'Qual o valor?'}}

beforeEach(()=>clearPilotCorrelationCacheForTests())
describe('V1.4C read-only chat → Story correlation safety',()=>{
 it('extracts safe chat ID from supported GPTMaker inbound shapes',()=>{
  expect(extractInboundChatId(request)).toBe(pilot)
  expect(extractInboundChatId({data:{contextId:pilot,message:{role:'user'}}})).toBe(pilot)
  expect(isUserInbound(request)).toBe(true)
  expect(isUserInbound({message:{role:'assistant'}})).toBe(false)
 })
 it('never queries for assistant events, other chats or missing secret',async()=>{
  const f=vi.fn()
  const opts={env,fetchImpl:f,logger:vi.fn()}
  expect((await resolveStoryPilot({chatId:pilot,message:{role:'assistant'}},opts)).status).toBe('NOT_USER_EVENT')
  expect((await resolveStoryPilot({chatId:'official-chat',message:{role:'user'}},opts)).status).toBe('CHAT_OUT_OF_SCOPE')
  expect((await resolveStoryPilot(request,{...opts,env:{...env,PRIME_CONTROL_STORY_RESOLVER_KEY:''}})).status).toBe('NOT_CONFIGURED')
  expect(f).not.toHaveBeenCalled()
 })
 it('proves Story presence from relay and never returns raw URL, Story ID or text',async()=>{
  const fetchImpl=vi.fn(async(_url,opts)=>{
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body).chatId).toBe(pilot)
    return Response.json({status:'FOUND',story_present:true,agent_verified:true,
      story_media_available:true,story_fingerprint:'0123456789abcdef01234567'})
  })
  const logger=vi.fn()
  const result=await resolveStoryPilot(request,{env,fetchImpl,logger})
  expect(result.story_present).toBe(true)
  expect(result.agent_verified).toBe(true)
  expect(result.story_fingerprint).toHaveLength(24)
  expect(fetchImpl).toHaveBeenCalledTimes(1)
  const serialized=JSON.stringify(result)+JSON.stringify(logger.mock.calls)
  for(const bad of [pilot,'Qual o valor?','gpt-files.com','actual-story-id','unit-key-do-not-share'])
    expect(serialized).not.toContain(bad)
 })
 it('suppresses repeated user events within 90 seconds',async()=>{
  let tick=100000
  const fetchImpl=vi.fn(async()=>Response.json({status:'FOUND',story_present:true,agent_verified:true}))
  const cfg={env,fetchImpl,logger:vi.fn(),clock:()=>tick}
  expect((await resolveStoryPilot(request,cfg)).status).toBe('FOUND')
  expect((await resolveStoryPilot(request,cfg)).status).toBe('DUPLICATE_SUPPRESSED')
  expect(fetchImpl).toHaveBeenCalledTimes(1)
  tick+=90001
  expect((await resolveStoryPilot(request,cfg)).status).toBe('FOUND')
  expect(fetchImpl).toHaveBeenCalledTimes(2)
 })
 it('does not suppress a distinct user message in the same chat within 90 seconds',async()=>{
  const fetchImpl=vi.fn(async()=>Response.json({status:'FOUND',story_present:true,agent_verified:true}))
  const cfg={env,fetchImpl,logger:vi.fn(),clock:()=>100000}
  const second={...request,message:{...request.message,id:'qa-message-002'}}
  expect(extractInboundEventIdentity(request)).toBe('message:qa-message-001')
  expect((await resolveStoryPilot(request,cfg)).status).toBe('FOUND')
  expect((await resolveStoryPilot(second,cfg)).status).toBe('FOUND')
  expect((await resolveStoryPilot(second,cfg)).status).toBe('DUPLICATE_SUPPRESSED')
  expect(fetchImpl).toHaveBeenCalledTimes(2)
 })
 it('does not dedupe by chat when GPTMaker omits stable message identity',async()=>{
  const noId={chatId:pilot,message:{role:'user',text:'Qual o valor?'}}
  const fetchImpl=vi.fn(async()=>Response.json({status:'FOUND',story_present:true}))
  const cfg={env,fetchImpl,logger:vi.fn(),clock:()=>100000}
  expect(extractInboundEventIdentity(noId)).toBeNull()
  expect((await resolveStoryPilot(noId,cfg)).status).toBe('FOUND')
  expect((await resolveStoryPilot(noId,cfg)).status).toBe('FOUND')
  expect(fetchImpl).toHaveBeenCalledTimes(2)
 })
 it('allows a retry of an identified message after a relay failure',async()=>{
  const fetchImpl=vi.fn().mockRejectedValueOnce(Error('offline'))
   .mockResolvedValueOnce(Response.json({status:'FOUND',story_present:true}))
  const cfg={env,fetchImpl,logger:vi.fn()}
  expect((await resolveStoryPilot(request,cfg)).status).toBe('RELAY_NETWORK_ERROR')
  expect((await resolveStoryPilot(request,cfg)).status).toBe('FOUND')
  expect(fetchImpl).toHaveBeenCalledTimes(2)
 })
 it('fails closed on unknown response, relay error or network failure',async()=>{
  const logger=vi.fn()
  expect((await resolveStoryPilot(request,{env,dedupe:false,logger,
    fetchImpl:async()=>Response.json({status:'UNKNOWN',story_present:true})})).story_present).toBe(false)
  expect((await resolveStoryPilot(request,{env,dedupe:false,logger,
    fetchImpl:async()=>{throw Error('secret hidden')}})).status).toBe('RELAY_NETWORK_ERROR')
  expect(JSON.stringify(logger.mock.calls)).not.toContain('secret hidden')
 })
})
