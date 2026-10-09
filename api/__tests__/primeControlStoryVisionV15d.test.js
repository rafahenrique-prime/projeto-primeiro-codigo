import {describe,it,expect,afterEach} from 'vitest'
import handler,{archivedStoryVisionAuthorized} from '../prime-control-story-vision-v15d.js'
const secret='fixture-archived-story-qa-gate-secret-length-64-0123456789abcdef'
const previous={...process.env}
afterEach(()=>{for(const key of ['PRIME_CONTROL_STORY_V15D_ONE_SHOT_SECRET','PRIME_CONTROL_STORY_V15D_RUN_ENABLED','PRIME_CONTROL_STORY_ARCHIVE_SELECT_ENABLED']) {
 if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key]}})
const response=()=>({statusCode:200,body:null,setHeader(){return this},
 status(code){this.statusCode=code;return this},json(body){this.body=body;return this}})
describe('V1.5D private one-shot Vision gate (no provider calls)',()=>{
 it('requires dedicated key and pinned LAB header',async()=>{
  const env={PRIME_CONTROL_STORY_V15D_ONE_SHOT_SECRET:secret}
  expect(await archivedStoryVisionAuthorized({headers:{'x-prime-story-v15d-key':secret,'x-prime-lab':'GABY-LAB-COMERCIAL-V1'}},env)).toBe(true)
  expect(await archivedStoryVisionAuthorized({headers:{'x-prime-story-v15d-key':'wrong','x-prime-lab':'GABY-LAB-COMERCIAL-V1'}},env)).toBe(false)
  expect(await archivedStoryVisionAuthorized({headers:{'x-prime-story-v15d-key':secret,'x-prime-lab':'GABY-OFFICIAL'}},env)).toBe(false)
 })
 it('does not execute while disabled',async()=>{
  process.env.PRIME_CONTROL_STORY_V15D_ONE_SHOT_SECRET=secret
  delete process.env.PRIME_CONTROL_STORY_V15D_RUN_ENABLED
  const res=response()
  await handler({method:'POST',headers:{'x-prime-story-v15d-key':secret,'x-prime-lab':'GABY-LAB-COMERCIAL-V1'},body:{confirm:'ONE_SHOT_ARCHIVED_IMAGE_STORY_V15D'}},res)
  expect(res.statusCode).toBe(503)
  expect(res.body.status).toBe('QA_DISABLED')
 })
 it('refuses to run unless archive selector enabled',async()=>{
  process.env.PRIME_CONTROL_STORY_V15D_ONE_SHOT_SECRET=secret
  process.env.PRIME_CONTROL_STORY_V15D_RUN_ENABLED='true'
  delete process.env.PRIME_CONTROL_STORY_ARCHIVE_SELECT_ENABLED
  const res=response()
  await handler({method:'POST',headers:{'x-prime-story-v15d-key':secret,'x-prime-lab':'GABY-LAB-COMERCIAL-V1'},body:{confirm:'ONE_SHOT_ARCHIVED_IMAGE_STORY_V15D'}},res)
  expect(res.statusCode).toBe(503)
  expect(res.body.status).toBe('STORY_VISION_NOT_CONFIGURED')
 })
})
