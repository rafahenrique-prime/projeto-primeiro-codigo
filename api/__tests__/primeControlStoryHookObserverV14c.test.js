import {describe,it,expect,vi,afterEach} from 'vitest'
import handler,{
  equalSecret,permitted,summarizeInbound,responseForObservation,OBSERVER_EVENT
} from '../prime-control-story-hook-observer-v14c.js'

const KEY='LAB_test_key_not_real'
const simulated={
  event:'onNewMessage',
  agentId:'3F8F4F4957CAD0DB118EE6F7BEE6FBA9',
  chatId:'PRIVATE_CHAT_SHOULD_NOT_LEAK',
  message:{
    role:'user',
    text:'Qual valor? private TEST',
    metadata:{
      storyId:'17913049392498618',
      storyMediaUrl:'https://gpt-files.com/private/story.jpg?token=DO_NOT_LOG',
      storyMediaType:'image/jpeg',
    },
  },
}
function mockRes(){
 return {headers:{},code:200,body:null,
  setHeader(k,v){this.headers[k]=v;return this},
  status(n){this.code=n;return this},
  json(x){this.body=x;return this},
 }
}
const realEnabled=process.env.PRIME_CONTROL_STORY_HOOK_OBSERVER_ENABLED
const realKey=process.env.PRIME_CONTROL_GPTMAKER_STORY_HOOK_KEY
afterEach(()=>{
 if(realEnabled===undefined)delete process.env.PRIME_CONTROL_STORY_HOOK_OBSERVER_ENABLED
 else process.env.PRIME_CONTROL_STORY_HOOK_OBSERVER_ENABLED=realEnabled
 if(realKey===undefined)delete process.env.PRIME_CONTROL_GPTMAKER_STORY_HOOK_KEY
 else process.env.PRIME_CONTROL_GPTMAKER_STORY_HOOK_KEY=realKey
 vi.restoreAllMocks()
})
describe('GPTMaker LAB Story webhook observer V1.4C: zero writes',()=>{
 it('accepts only correctly authorized dedicated secret',()=>{
  expect(equalSecret(KEY,KEY)).toBe(true)
  expect(equalSecret(KEY,KEY+'x')).toBe(false)
  expect(equalSecret('',KEY)).toBe(false)
  expect(permitted({headers:{},query:{}},{PRIME_CONTROL_GPTMAKER_STORY_HOOK_KEY:KEY})).toBe(false)
  expect(permitted({headers:{'x-prime-lab-hook-key':KEY}}, {PRIME_CONTROL_GPTMAKER_STORY_HOOK_KEY:KEY})).toBe(true)
  expect(permitted({headers:{},query:{lab_key:KEY}},{PRIME_CONTROL_GPTMAKER_STORY_HOOK_KEY:KEY})).toBe(true)
 })
 it('logs only fingerprints and indicators, never chat, message, URL or story ID',()=>{
  const record=summarizeInbound(simulated,KEY)
  expect(record.event).toBe(OBSERVER_EVENT)
  expect(record.story_metadata_present).toBe(true)
  expect(record.story_media_type).toBe('image/jpeg')
  expect(record.source_role).toBe('USER')
  expect(record.chat_fingerprint).toMatch(/^[0-9a-f]{24}$/)
  expect(record.story_fingerprint).toMatch(/^[0-9a-f]{24}$/)
  const rendered=JSON.stringify({...record,...responseForObservation(record)})
  for(const secret of ['17913049392498618','PRIVATE_CHAT_SHOULD_NOT_LEAK',
    'gpt-files.com','DO_NOT_LOG','Qual valor?','3F8F4F4957CAD0DB118EE6F7BEE6FBA9',KEY])
    expect(rendered).not.toContain(secret)
 })
 it('does not mistake an unrelated field for native Story metadata',()=>{
  const r=summarizeInbound({message:{role:'user',text:'TEST PRIME V14C',
    metadata:{storyId:'123'}},chatId:'private-chat'},KEY)
  expect(r.story_metadata_present).toBe(false)
  expect(r.story_fingerprint).toBeNull()
  expect(r.source_role).toBe('USER')
 })
 it('rejects unauthenticated request before processing any content',async()=>{
  process.env.PRIME_CONTROL_GPTMAKER_STORY_HOOK_KEY=KEY
  process.env.PRIME_CONTROL_STORY_HOOK_OBSERVER_ENABLED='true'
  const logger=vi.spyOn(console,'info').mockImplementation(()=>{})
  const res=mockRes()
  await handler({method:'POST',headers:{'content-type':'application/json'},query:{},body:simulated},res)
  expect(res.code).toBe(401)
  expect(logger).not.toHaveBeenCalled()
 })
 it('remains disabled unless explicitly enabled, even when token is valid',async()=>{
  process.env.PRIME_CONTROL_GPTMAKER_STORY_HOOK_KEY=KEY
  process.env.PRIME_CONTROL_STORY_HOOK_OBSERVER_ENABLED='false'
  const res=mockRes()
  await handler({method:'POST',headers:{'content-type':'application/json',
    'x-prime-lab-hook-key':KEY},body:simulated},res)
  expect(res.code).toBe(503)
 })
 it('when enabled ACKs immediately without fetch, reply, Vision, catalog or JEV',async()=>{
  process.env.PRIME_CONTROL_GPTMAKER_STORY_HOOK_KEY=KEY
  process.env.PRIME_CONTROL_STORY_HOOK_OBSERVER_ENABLED='true'
  const log=vi.spyOn(console,'info').mockImplementation(()=>{})
  const outgoing=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw Error('OUTBOUND_FORBIDDEN')})
  const res=mockRes()
  await handler({method:'POST',headers:{'content-type':'application/json',
    'x-prime-lab-hook-key':KEY},body:simulated},res)
  expect(res.code).toBe(200)
  expect(res.body).toMatchObject({ok:true,mode:'OBSERVE_ONLY',story_metadata_present:true})
  expect(res.body.correlation_id).toMatch(/^[0-9a-f-]{36}$/)
  expect(outgoing).not.toHaveBeenCalled()
  expect(log).toHaveBeenCalledTimes(1)
  const logged=JSON.stringify(log.mock.calls)
  expect(logged).not.toContain('gpt-files.com')
  expect(logged).not.toContain('PRIVATE_CHAT_SHOULD_NOT_LEAK')
  expect(logged).not.toContain('17913049392498618')
 })
})
