import {describe,it,expect,vi,afterEach} from 'vitest'
import handler,{
  equalSecret,permitted,labAgentMatches,summarizeInbound,responseForObservation,OBSERVER_EVENT
} from '../prime-control-story-hook-observer-v14c.js'
import {auditIdentityFieldPresenceV16b,scopeStoryEventV16b,resolveStoryPilotV16b,clearStoryIdentityV16bCacheForTests} from '../_primeControlStoryIdentityV16b.js'

const KEY='LAB_test_key_not_real'
const simulated={
  event:'onNewMessage',
  agentId:'3F8F4F4957CAD0DB118EE6F7BEE6FBA9',
  chatId:'PRIVATE_CHAT_SHOULD_NOT_LEAK',
  channelId:'3F32CBBAD3BD8028A2F132532B60D052',
  userName:'@raffahenriquee',
  userId:'QA_USER_ID_NOT_REAL',
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
const corrKeys=['PRIME_CONTROL_STORY_CORRELATION_ENABLED','PRIME_CONTROL_STORY_PILOT_CHAT_ID','PRIME_CONTROL_STORY_RESOLVER_KEY']
const originalCorr=Object.fromEntries(corrKeys.map(k=>[k,process.env[k]]))
afterEach(()=>{
 if(realEnabled===undefined)delete process.env.PRIME_CONTROL_STORY_HOOK_OBSERVER_ENABLED
 else process.env.PRIME_CONTROL_STORY_HOOK_OBSERVER_ENABLED=realEnabled
 if(realKey===undefined)delete process.env.PRIME_CONTROL_GPTMAKER_STORY_HOOK_KEY
 else process.env.PRIME_CONTROL_GPTMAKER_STORY_HOOK_KEY=realKey
 for(const k of corrKeys) {
  if(originalCorr[k]===undefined)delete process.env[k]
  else process.env[k]=originalCorr[k]
 }
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
 it('rejects explicitly mismatched agent ID',async()=>{
  process.env.PRIME_CONTROL_GPTMAKER_STORY_HOOK_KEY=KEY
  process.env.PRIME_CONTROL_STORY_HOOK_OBSERVER_ENABLED='true'
  expect(labAgentMatches(simulated)).toBe(true)
  expect(labAgentMatches({message:{role:'user'}})).toBe(false)
  expect(labAgentMatches({...simulated,agentId:'WRONG_AGENT'})).toBe(false)
  expect(labAgentMatches({...simulated,data:{agentId:'OTHER_AGENT'}})).toBe(false)
  const res=mockRes()
  const logger=vi.spyOn(console,'info').mockImplementation(()=>{})
  await handler({method:'POST',query:{},headers:{'content-type':'application/json','x-prime-lab-hook-key':KEY},
    body:{...simulated,agentId:'WRONG_AGENT'}},res)
  expect(res.code).toBe(200)
  expect(res.body).toMatchObject({ok:true,status:'SCOPE_REJECTED'})
  expect(logger).toHaveBeenCalledTimes(1)
  expect(JSON.stringify(logger.mock.calls)).not.toContain('WRONG_AGENT')
 })
 it('does not mistake an unrelated field for native Story metadata',()=>{
  const r=summarizeInbound({message:{role:'user',text:'TEST PRIME V14C',
    metadata:{storyId:'123'}},chatId:'private-chat'},KEY)
  expect(r.story_metadata_present).toBe(false)
  expect(r.story_fingerprint).toBeNull()
  expect(r.source_role).toBe('USER')
 })

 it('reports only sanitized field presence for the exact pilot USER event',()=>{
  const body={
   ...simulated,chatId:'PRIVATE_CHAT_SHOULD_NOT_LEAK',
   contactId:'CONTACT_ID_SHOULD_NOT_LEAK',recipient:'RECIPIENT_SHOULD_NOT_LEAK',
   message:{...simulated.message,id:'EVENT_MESSAGE_ID_SHOULD_NOT_LEAK',time:Date.now()},
  }
  const audit=auditIdentityFieldPresenceV16b(body,{env:{
   PRIME_CONTROL_STORY_PILOT_CHAT_ID:'PRIVATE_CHAT_SHOULD_NOT_LEAK',
   PRIME_CONTROL_STORY_RESOLVER_KEY:KEY,
  }})
  expect(audit).toMatchObject({
   role_user:true,agent_matches_pilot:true,chat_matches_pilot:true,
   direct_sender_username_present:true,direct_sender_user_id_present:true,
   contact_id_present:true,recipient_present:true,channel_matches_pilot:true,
   event_message_id_present:true,event_message_id_consistent:true,
   event_timestamp_present:true,story_metadata_same_object:true,
  })
  expect(audit.event_id_hmac).toMatch(/^[0-9a-f]{64}$/)
  expect(audit.contact_id_hmac).toMatch(/^[0-9a-f]{64}$/)
  expect(audit.recipient_hmac).toMatch(/^[0-9a-f]{64}$/)
  const rendered=JSON.stringify(audit)
  for(const secret of ['PRIVATE_CHAT_SHOULD_NOT_LEAK','CONTACT_ID_SHOULD_NOT_LEAK',
   'RECIPIENT_SHOULD_NOT_LEAK','EVENT_MESSAGE_ID_SHOULD_NOT_LEAK','gpt-files.com',
   'DO_NOT_LOG','Qual valor?'])expect(rendered).not.toContain(secret)
 })
 it('does not audit a different agent or chat even when identifiers are present',()=>{
  const body={...simulated,message:{...simulated.message,role:'user'}}
  const env={PRIME_CONTROL_STORY_PILOT_CHAT_ID:'PRIVATE_CHAT_SHOULD_NOT_LEAK'}
  expect(auditIdentityFieldPresenceV16b({...body,agentId:'OTHER_AGENT'},{env})).toBeNull()
  expect(auditIdentityFieldPresenceV16b({...body,chatId:'OTHER_CHAT'},{env})).toBeNull()
 })
 it('rejects unauthenticated request before processing any content
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
 it('correlation pilot awaits exactly one protected read before HTTP 200 ACK',async()=>{
  process.env.PRIME_CONTROL_GPTMAKER_STORY_HOOK_KEY=KEY
  process.env.PRIME_CONTROL_STORY_HOOK_OBSERVER_ENABLED='true'
  process.env.PRIME_CONTROL_STORY_CORRELATION_ENABLED='true'
  process.env.PRIME_CONTROL_STORY_PILOT_CHAT_ID='PRIVATE_CHAT_SHOULD_NOT_LEAK'
  process.env.PRIME_CONTROL_STORY_RESOLVER_KEY='synthetic-relay-secret'
  const log=vi.spyOn(console,'info').mockImplementation(()=>{})
  const outgoing=vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>{
   const proof=JSON.parse(init.body).proof
   return Response.json({
    status:'EVENT_MESSAGE_MATCH_STORY',story_present:true,agent_verified:true,
    sender_match:true,channel_verified:true,id_equality:true,match_count:1,
    event_id_hmac:proof.event_id_hmac,matched_id_hmac:proof.event_id_hmac,
    story_fingerprint:'b'.repeat(24),ok:true,
   })
  })
  const res=mockRes()
  const body={...simulated,message:{...simulated.message,id:'QA_EVENT_101',time:Date.now()}}
  await handler({method:'POST',query:{},headers:{
   'content-type':'application/json','x-prime-lab-hook-key':KEY
  },body},res)
  expect(res.code).toBe(200)
  expect(outgoing).toHaveBeenCalledTimes(1)
  expect(log.mock.calls.some(c=>String(c[1]).includes('PRIME_CONTROL_STORY_EVENT_ID_PROOF_V16B'))).toBe(true)
  const serialized=JSON.stringify(log.mock.calls)+JSON.stringify(res.body)
  for(const v of ['synthetic-relay-secret','gpt-files.com','PRIVATE_CHAT_SHOULD_NOT_LEAK'])
   expect(serialized).not.toContain(v)
 })

 it('audits safe field presence before sender failure and never calls the resolver',async()=>{
  process.env.PRIME_CONTROL_GPTMAKER_STORY_HOOK_KEY=KEY
  process.env.PRIME_CONTROL_STORY_HOOK_OBSERVER_ENABLED='true'
  process.env.PRIME_CONTROL_STORY_CORRELATION_ENABLED='true'
  process.env.PRIME_CONTROL_STORY_PILOT_CHAT_ID='PRIVATE_CHAT_SHOULD_NOT_LEAK'
  process.env.PRIME_CONTROL_STORY_RESOLVER_KEY='synthetic-relay-secret'
  const log=vi.spyOn(console,'info').mockImplementation(()=>{})
  const outgoing=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw Error('OUTBOUND_FORBIDDEN')})
  const body={
   ...simulated,chatId:'PRIVATE_CHAT_SHOULD_NOT_LEAK',
   userName:undefined,userId:undefined,
   contactId:'CONTACT_ID_SHOULD_NOT_LEAK',recipient:'RECIPIENT_SHOULD_NOT_LEAK',
   message:{...simulated.message,id:'EVENT_MESSAGE_ID_SHOULD_NOT_LEAK',time:Date.now()},
  }
  const res=mockRes()
  await handler({method:'POST',headers:{'content-type':'application/json',
   'x-prime-lab-hook-key':KEY},body},res)
  expect(res.code).toBe(200)
  expect(outgoing).not.toHaveBeenCalled()
  const auditCall=log.mock.calls.find(c=>c[0]==='[PrimeControlStoryFieldAuditV16B]')
  expect(auditCall).toBeDefined()
  const audit=JSON.parse(auditCall[1])
  expect(audit).toMatchObject({
   sender_name_candidate_matches_qa:false,direct_sender_username_present:false,
   direct_sender_user_id_present:false,contact_id_present:true,recipient_present:true,
   event_message_id_present:true,event_message_id_consistent:true,
   channel_matches_pilot:true,story_metadata_same_object:true,
  })
  const correlation=log.mock.calls.find(c=>c[0]==='[PrimeControlStoryCorrelation]')
  expect(JSON.parse(correlation[1]).status).toBe('SENDER_IDENTITY_MISSING')
  const serialized=JSON.stringify(log.mock.calls)+JSON.stringify(res.body)
  for(const secret of ['PRIVATE_CHAT_SHOULD_NOT_LEAK','CONTACT_ID_SHOULD_NOT_LEAK',
   'RECIPIENT_SHOULD_NOT_LEAK','EVENT_MESSAGE_ID_SHOULD_NOT_LEAK',
   'gpt-files.com','DO_NOT_LOG','Qual valor?','synthetic-relay-secret'])
   expect(serialized).not.toContain(secret)
 })
 it('when enabled ACKs immediately without fetch, reply, Vision, catalog or JEV
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

describe('V1.6B exact event identity scope: synthetic only',()=>{
 const env={
  PRIME_CONTROL_STORY_PILOT_CHAT_ID:'PILOT_CHAT_FOR_TEST',
  PRIME_CONTROL_STORY_RESOLVER_KEY:KEY
 };
 const event=(overrides={})=>({
  event:'onNewMessage',agentId:'3F8F4F4957CAD0DB118EE6F7BEE6FBA9',
  chatId:'PILOT_CHAT_FOR_TEST',channelId:'3F32CBBAD3BD8028A2F132532B60D052',
  userName:'@raffahenriquee',userId:'QA_USER_ID_NOT_REAL',
  message:{id:'QA_EVENT_ID_NOT_REAL',role:'user',time:Date.now()},
  ...overrides
 });
 it('requires exact lab agent, pilot chat, linked Instagram, QA handle and stable sender ID',()=>{
  const good=scopeStoryEventV16b(event(),{env});
  expect(good.status).toBe('SCOPED');
  expect(good.allowed).toBe(true);
  expect(good.event_id_hmac).toMatch(/^[a-f0-9]{64}$/);
  expect(good.sender_id_hmac).toMatch(/^[a-f0-9]{64}$/);
  expect(scopeStoryEventV16b(event({agentId:'3F78AF104664B0D1CB84D23672FCADC5'}),{env}).status).toBe('WRONG_OR_DIVERGENT_AGENT');
  expect(scopeStoryEventV16b(event({agentId:undefined}),{env}).status).toBe('AGENT_ID_MISSING');
  expect(scopeStoryEventV16b(event({chatId:'OTHER_CHAT'}),{env}).status).toBe('CHAT_OUT_OF_SCOPE');
  expect(scopeStoryEventV16b(event({channelId:'OTHER_CHANNEL'}),{env}).status).toBe('CHANNEL_OUT_OF_SCOPE');
  expect(scopeStoryEventV16b(event({channelId:undefined}),{env}).status).toBe('CHANNEL_ID_MISSING');
  expect(scopeStoryEventV16b(event({userName:'@other'}),{env}).status).toBe('SENDER_OUT_OF_SCOPE');
  expect(scopeStoryEventV16b(event({userId:undefined}),{env}).status).toBe('SENDER_IDENTITY_MISSING');
 });
 it('fails closed on missing or divergent event ID, missing time and expired events',()=>{
  expect(scopeStoryEventV16b(event({message:{role:'user',time:Date.now()}}),{env}).status).toBe('EVENT_ID_MISSING');
  expect(scopeStoryEventV16b(event({message:{id:'A',messageId:'B',role:'user',time:Date.now()}}),{env}).status).toBe('EVENT_ID_DIVERGENT');
  expect(scopeStoryEventV16b(event({message:{id:'A',role:'user'}}),{env}).status).toBe('EVENT_TIME_MISSING');
  const now=Date.now();
  expect(scopeStoryEventV16b(event({message:{id:'A',role:'user',time:now-16*60*1000}}),{env,clock:()=>now}).status).toBe('EVENT_EXPIRED');
 });
 it('suppresses a duplicate in this instance and relays only HMAC identity proof',async()=>{
  clearStoryIdentityV16bCacheForTests();
  const logger=vi.fn();
  const outgoing=vi.fn(async(_url,init)=>{
   const sent=JSON.parse(init.body);
   expect(sent.chatId).toBe('PILOT_CHAT_FOR_TEST');
   expect(sent.proof.event_id_hmac).toMatch(/^[a-f0-9]{64}$/);
   expect(JSON.stringify(sent)).not.toContain('QA_EVENT_ID_NOT_REAL');
   expect(JSON.stringify(sent)).not.toContain('QA_USER_ID_NOT_REAL');
   return Response.json({status:'EVENT_MESSAGE_MATCH_STORY',story_present:true,
    id_equality:true,match_count:1,sender_match:true,channel_verified:true,
    agent_verified:true,event_id_hmac:sent.proof.event_id_hmac,
    matched_id_hmac:sent.proof.event_id_hmac,story_fingerprint:'b'.repeat(24)});
  });
  const e=event();
  const first=await resolveStoryPilotV16b(e,{env,fetchImpl:outgoing,logger});
  const second=await resolveStoryPilotV16b(e,{env,fetchImpl:outgoing,logger});
  expect(first.status).toBe('EVENT_MESSAGE_MATCH_STORY');
  expect(first.id_equality).toBe(true);
  expect(second.status).toBe('DUPLICATE_SUPPRESSED');
  expect(outgoing).toHaveBeenCalledTimes(1);
  const logs=JSON.stringify(logger.mock.calls);
  for(const raw of ['QA_EVENT_ID_NOT_REAL','QA_USER_ID_NOT_REAL','@raffahenriquee',
   'PRIVATE_CHAT_SHOULD_NOT_LEAK','synthetic-relay-secret'])expect(logs).not.toContain(raw);
 });
});
