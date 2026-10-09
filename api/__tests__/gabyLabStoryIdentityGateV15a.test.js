import {describe,it,expect} from 'vitest'
import {classifyUnverifiedStoryReferenceV15a,unverifiedStoryHoldResponseV15a} from '../../supabase/functions/gaby-lab-shadow-context-v1/story-identity-gate.ts'
describe('GABY LAB V1.5A: current Story must never inherit previously selected product',()=>{
 const six=[
  'Qual o valor dessa camiseta?',
  'Quanto custa o óculos da foto?',
  'Qual é o modelo desse tênis?',
  'Tem essa camiseta no tamanho M?',
  'Qual o valor dessa?',
  'Qual é o modelo dela?',
 ]
 it.each(six)('holds real Story pattern: %s',(q)=>{
  const state=classifyUnverifiedStoryReferenceV15a(q);
  expect(state.hold).toBe(true);
  const response=unverifiedStoryHoldResponseV15a(state.reason);
  expect(response.sucesso).toBe(true);
  expect(response.contexto.should_reuse_previous_product).toBe(false);
  expect(response.contexto.product_identification_status).toBe('NO_CURRENT_PRODUCT_ID');
  expect(response.dados.produtos).toHaveLength(0);
  expect(JSON.stringify(response)).not.toMatch(/Armani Exchange|129|249|Diesel 009/);
 });
 it.each(['Qual o valor?','Qual preço?','Tem 42?','Tem tamanho M?','Tem no pix?','Tem disponível?'])
 ('holds ambiguous ordinary followup rather than guessing %s',(q)=>{
  expect(classifyUnverifiedStoryReferenceV15a(q).hold).toBe(true);
 });
 it.each([
 'Nike Dunk Low Panda 42',
 'Quero ver camisetas pretas da Nike',
 'Air Jordan 4 Retro Black Cat',
 'Me mostre Adidas Samba tamanho 39',
 'Camiseta masculina Armani Exchange branca',
 'Quero um tênis Nike branco tamanho 40',
 ])('preserves explicit catalog text search: %s',(q)=>{
  expect(classifyUnverifiedStoryReferenceV15a(q)).toEqual({hold:false,reason:'TEXT_SEARCH_ALLOWED'});
 });
 it('never includes the previous commercial product in the hold response',()=>{
  const out=unverifiedStoryHoldResponseV15a('VISUAL_REFERENCE_WITHOUT_STORY_ID')
  expect(JSON.stringify(out)).not.toContain('selectedProduct:')
  expect(out.dados.produtos).toEqual([])
  expect(out.contexto.tem_produtos).toBe(false)
 });
});
