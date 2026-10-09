import {describe,it,expect} from 'vitest'
import {decideStoryMemoryBoundaryV14j,simulateSixStoryMemoryBoundariesV14j,
 BASELINE_STORIES_20261008} from '../_primeControlStoryMemoryBoundaryV14j.js'
import {ALLOWED_SCOPE,NATIVE_STORY_PRINT_TRAINING}
 from '../_primeControlStoryNativePolicyV14f.js'
const NOW=Date.UTC(2026,9,9,2,35,0)
const media=BASELINE_STORIES_20261008
const base={
 scope:ALLOWED_SCOPE,nowMs:NOW,
 latest:{
  source:'GPTMAKER_MESSAGES_READ_ONLY',agent_verified:true,
  chat_allowlisted:true,kind:'STORY_REPLY',story_status:'FOUND',
  story_fingerprint:media[4].fingerprint,media_type:'image/jpeg',
  media_available:true,message_time_ms:NOW-3000,
 },
 commercialMemory:{selected_product:'Camiseta Armani Exchange Branca',
  last_requested_size:'M'},
 history:{print_requested_for_media_key:null,customer_already_supplied_print:false},
}
const q=(extra={})=>decideStoryMemoryBoundaryV14j({...structuredClone(base),...extra})
const currentEvidence={
 media_key:media[4].fingerprint,
 context_source:'VERIFIED_LAB_PIPELINE',observed_at_ms:NOW-2000,
 catalog:{status:'READ_ONLY_OK',exact_sku_verified:false},
 visual:{status:'VISUAL_UNCERTAIN',choice:'C1',confidence:.90,
  media_key:media[4].fingerprint},
 jev:{status:'ok',action:'BLOCK_ASSERTION'}
}
describe('V1.4J — GABY LAB current Story vs stale selected_product',()=>{
 it('all six REAL fingerprints exercise the same memory boundary, with zero I/O',()=>{
  const x=simulateSixStoryMemoryBoundariesV14j()
  expect(x.all_pass).toBe(true)
  expect(x.scenario_count).toBe(6)
  expect(x.passed).toBe(6)
  expect(x.client_messages_sent).toBe(0)
  expect(x.db_writes).toBe(0)
  expect(x.real_messages_replayed).toBe(false)
  expect(x.ai_calls).toBe(0)
 })
 it('ST05 never answers jeans followup from ST04/Armani context',()=>{
  const x=q()
  expect(x.action).toBe('HOLD_FOR_CURRENT_STORY_EVIDENCE')
  expect(x.reason).toBe('PREVIOUS_PRODUCT_NOT_BOUND_TO_STORY')
  expect(x.old_selected_product_may_be_used).toBe(false)
  expect(x.new_context_key_required).toBe(true)
  expect(x.clear_database_memory).toBe(false)
  expect(x.commercial_action_called).toBe(false)
 })
 it('VIDEO media changes identity and does not inherit the last shirt',()=>{
  const x=q({latest:{...base.latest,
   story_fingerprint:media[5].fingerprint,media_type:'video/mp4'}})
  expect(x.action).toBe('HOLD_FOR_CURRENT_STORY_EVIDENCE')
  expect(x.old_selected_product_may_be_used).toBe(false)
 })
 it('same Story, new REPLY message is NOT deduplicated by fingerprint',()=>{
  const prev={selected_product:'Camiseta Armani Exchange Branca',
   verified_story_fingerprint:base.latest.story_fingerprint}
  const first=q({commercialMemory:prev})
  const next=q({commercialMemory:prev,latest:{...base.latest,message_time_ms:NOW-1000}})
  expect(first.action).toBe('HOLD_FOR_CURRENT_STORY_EVIDENCE')
  expect(next.action).toBe('HOLD_FOR_CURRENT_STORY_EVIDENCE')
  expect(first.new_context_key_required).toBe(false)
  expect(next.old_selected_product_may_be_used).toBe(false)
 })
 it('native Story fallback is selected with current-media evidence and JEV veto',()=>{
  const x=q({evidence:currentEvidence})
  expect(x.action).toBe('NATIVE_STORY_FALLBACK')
  expect(x.native_route).toBe('REQUEST_STORY_PRINT')
  expect(x.native_training_id).toBe(NATIVE_STORY_PRINT_TRAINING)
  expect(x.old_selected_product_may_be_used).toBe(false)
 })
 it('stale image evidence and wrong-media evidence fail closed',()=>{
  for(const evidence of [
   {...currentEvidence,media_key:media[3].fingerprint},
   {...currentEvidence,observed_at_ms:NOW-400000},
  ]){
   const x=q({evidence})
   expect(['HOLD_FOR_CURRENT_STORY_EVIDENCE','BLOCK_UNVERIFIED_CONTEXT'])
    .toContain(x.action)
   expect(x.old_selected_product_may_be_used).toBe(false)
  }
 })
 it('proven ordinary chat preserves normal GPTMaker commercial search',()=>{
  const x=q({latest:{
   source:'GPTMAKER_MESSAGES_READ_ONLY',agent_verified:true,chat_allowlisted:true,
   kind:'NO_STORY',story_status:'NO_VALID_STORY_ON_LATEST_USER',
   story_fingerprint:null,media_type:null,message_time_ms:NOW-2000}})
  expect(x.action).toBe('PRESERVE_NATIVE_SEARCH')
  expect(x.old_selected_product_may_be_used).toBe(true)
  expect(x.commercial_action_called).toBe(false)
 })
 it('pending Story is never misclassified as ordinary chat',()=>{
  const x=q({latest:{
   source:'GPTMAKER_MESSAGES_READ_ONLY',agent_verified:true,chat_allowlisted:true,
   kind:'NO_STORY',story_status:'NO_VALID_STORY_ON_LATEST_USER',
   story_fingerprint:null,media_type:null,message_time_ms:NOW-2000},
    history:{pending_story:true}})
  expect(x.action).toBe('BLOCK_UNVERIFIED_CONTEXT')
 })
 it('incorrect agent, expired context or untrusted source fail closed',()=>{
  for(const input of [
   {scope:'GABY_OFFICIAL'},
   {latest:{...base.latest,agent_verified:false}},
   {latest:{...base.latest,source:'RAW_USER_STRING'}},
   {latest:{...base.latest,message_time_ms:NOW-900000}},
   {latest:{...base.latest,media_available:false}},
  ]){
   const x=q(input)
   expect(x.action).not.toBe('PRESERVE_NATIVE_SEARCH')
   expect(x.old_selected_product_may_be_used).toBe(false)
   expect(x.writes).toBe(0)
  }
 })
 it('catalog top candidate alone never qualifies to reuse old product',()=>{
  const x=q({evidence:{...currentEvidence,
   catalog:{status:'READ_ONLY_OK',exact_sku_verified:false,
    verified_sku_token:'candidate-01',media_key:media[4].fingerprint},
   jev:{status:'ok',action:'ALLOW_AUTO'},
   visual:{...currentEvidence.visual,status:'STRONG_VISUAL_MATCH',confidence:.99}}})
  expect(x.action).toBe('NATIVE_STORY_FALLBACK')
  expect(x.old_selected_product_may_be_used).toBe(false)
 })
})
