/** PRIME CONTROL V1.5D — authenticated single-run archived Story Vision QA.
 * Commercial GABY LAB ONLY; no messages, catalog writes, client identifiers,
 * images, media URLs, or credential material in logs or responses.
 * Reuses runStoryVisionOnce() strict fingerprint and media image guards.
 */
import {sameSecret} from './prime-control-story-media-probe-v14d.js'
import {runStoryVisionOnce} from './prime-control-story-real-vision-v14d.js'

export const STORY_ARCHIVE_VISION_EVENT='PRIME_CONTROL_V15D_ARCHIVE_STORY_VISION'
export async function archivedStoryVisionAuthorized(req,env=process.env){
 const expected=String(env.PRIME_CONTROL_STORY_V15D_ONE_SHOT_SECRET||'')
 const provided=String(req?.headers?.['x-prime-story-v15d-key']||'')
 return expected.length>=40&&sameSecret(provided,expected) &&
  req?.headers?.['x-prime-lab']==='GABY-LAB-COMERCIAL-V1'
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store')
 res.setHeader('X-Content-Type-Options','nosniff')
 if(req.method!=='POST')return res.status(405).json({ok:false,status:'METHOD_NOT_ALLOWED'})
 if(!(await archivedStoryVisionAuthorized(req)))return res.status(401).json({ok:false,status:'QA_AUTH_REQUIRED'})
 if(process.env.PRIME_CONTROL_STORY_V15D_RUN_ENABLED!=='true')
  return res.status(503).json({ok:false,status:'QA_DISABLED'})
 if(process.env.PRIME_CONTROL_STORY_ARCHIVE_SELECT_ENABLED!=='true'||
    process.env.PRIME_CONTROL_STORY_REAL_VISION_ENABLED!=='true')
  return res.status(503).json({ok:false,status:'STORY_VISION_NOT_CONFIGURED'})
 if(String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/json')
  return res.status(415).json({ok:false,status:'JSON_REQUIRED'})
 if(req.body?.confirm!=='ONE_SHOT_ARCHIVED_IMAGE_STORY_V15D')
  return res.status(400).json({ok:false,status:'CONFIRM_REQUIRED'})
 const result=await runStoryVisionOnce()
 console.info('[PrimeControlV15D]',JSON.stringify({event:STORY_ARCHIVE_VISION_EVENT,
  status:result.status,provider_calls:result.provider_calls||0,run_id:result.run_id}))
 return res.status(result.status==='VISION_PARSED'?200:422)
  .json({ok:result.status==='VISION_PARSED',...result,event:STORY_ARCHIVE_VISION_EVENT})
}
