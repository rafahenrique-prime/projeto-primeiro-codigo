import {describe,it,expect} from 'vitest'
import {routeToNativeStoryTraining,simulateNativeFallbackScenarios,
 NATIVE_STORY_PRINT_TRAINING,NATIVE_STORY_CONFIDENCE_TRAINING,
 REAL_STORY_FINGERPRINT,ALLOWED_SCOPE}
 from '../_primeControlStoryNativePolicyV14f.js'
const common={
 scope:ALLOWED_SCOPE,context_status:'FOUND',story_fingerprint:REAL_STORY_FINGERPRINT,
 media_source:'INSTAGRAM_STORY',
 catalog:{status:'READ_ONLY_OK',exact_sku_verified:false,candidates:1},
 visual:{status:'VISUAL_UNCERTAIN',choice:'C1',confidence:0.90},
 jev:{status:'ok',action:'BLOCK_ASSERTION',confidence:0.06},
}
describe('PRIME CONTROL V1.4F native-first reply policy, LAB pure tests',()=>{
 it('the 08 Oct Vans evidence triggers the EXISTING GPTMaker Story print training, no price or automatic sending',()=>{
  const x=routeToNativeStoryTraining(common)
  expect(x.route).toBe('GPTMAKER_NATIVE_REQUEST_STORY_PRINT')
  expect(x.training_id).toBe(NATIVE_STORY_PRINT_TRAINING)
  expect(x.reason).toBe('JEV_BLOCKS_MODEL_ASSERTION')
  expect(x.price_allowed).toBe(false)
  expect(x.exact_product_assertion_allowed).toBe(false)
  expect(x.messages_sent).toBe(0)
  expect(x.external_calls).toBe(0)
 })
 it('the JEV veto is stronger than a 0.99 visual score and a candidate label',()=>{
  const x=routeToNativeStoryTraining({
   ...common,visual:{status:'STRONG_VISUAL_MATCH',choice:'C1',confidence:0.99},
   catalog:{status:'READ_ONLY_OK',exact_sku_verified:false,candidates:1},
  })
  expect(x.route).toBe('GPTMAKER_NATIVE_REQUEST_STORY_PRINT')
 })
 it('existing screenshot must not be requested a second time',()=>{
  const x=routeToNativeStoryTraining({...common,media_source:'USER_UPLOADED_IMAGE'})
  expect(x.route).toBe('GPTMAKER_NATIVE_SINGLE_DETAIL')
  expect(x.training_id).toBe(NATIVE_STORY_CONFIDENCE_TRAINING)
 })
 it('confirmed SKU plus JEV and visual agreement still never invents price, Pix or stock',()=>{
  const x=routeToNativeStoryTraining({
   ...common, catalog:{status:'READ_ONLY_OK',exact_sku_verified:true,
    price_verified:false,physical_stock_verified:false},
   visual:{status:'STRONG_VISUAL_MATCH',choice:'C1',confidence:0.97},
   jev:{status:'ok',action:'ALLOW_AUTO',confidence:0.99},
  })
  expect(x.route).toBe('GPTMAKER_NATIVE_CONFIRMED_CATALOG')
  expect(x.exact_product_assertion_allowed).toBe(true)
  expect(x.price_allowed).toBe(false)
  expect(x.pix_allowed).toBe(false)
  expect(x.stock_allowed).toBe(false)
  expect(x.messages_sent).toBe(0)
 })
 it('90% visual by itself never becomes native HIGH',()=>{
  const x=routeToNativeStoryTraining({...common,jev:{status:'ok',action:'ALLOW_AUTO'}})
  expect(x.route).toBe('GPTMAKER_NATIVE_REQUEST_STORY_PRINT')
  expect(x.price_allowed).toBe(false)
 })
 it('no Story context uses standard GPTMaker native handling instead of inventing a Story',()=>{
  const x=routeToNativeStoryTraining({...common,context_status:'NO_STORY_IN_LATEST_MESSAGE'})
  expect(x.route).toBe('GPTMAKER_NATIVE_DEFAULT')
  expect(x.training_id).toBeNull()
 })
 it('refuses official production, wrong chat and unrelated Story fingerprints',()=>{
  expect(routeToNativeStoryTraining({...common,scope:'GABY_OFICIAL'}).route).toBe('BLOCK')
  expect(routeToNativeStoryTraining({...common,scope:'OTHER_AGENT'}).route).toBe('BLOCK')
  expect(routeToNativeStoryTraining({...common,story_fingerprint:'000000000000000000000000'}).route).toBe('BLOCK')
  expect(routeToNativeStoryTraining({...common,story_fingerprint:'invalid'}).route).toBe('BLOCK')
 })
 it('simulates four cases with zero IO, zero writes and zero customer messages',()=>{
  const r=simulateNativeFallbackScenarios()
  expect(r.ok).toBe(true)
  expect(r.scenarios).toHaveLength(4)
  expect(r.scenarios.every(z=>z.passed)).toBe(true)
  expect(r.messages_sent).toBe(0)
  expect(r.external_calls).toBe(0)
  expect(r.training_modified).toBe(false)
  expect(r.gaby_official_modified).toBe(false)
  expect(r.actual_gptmaker_response_tested).toBe(false)
 })
})
