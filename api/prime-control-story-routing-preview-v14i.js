/**
 * V1.4I guarded scenario-matrix endpoint, NOT a GPTMaker tool or webhook.
 * Simulates synthetic media/context cases in-process. No I/O and no replies.
 */
import {mediaProbeAuthorized} from './prime-control-story-media-probe-v14d.js'
import {runScenarioMatrixV14i} from './_primeControlStoryScenarioRouterV14i.js'

export const ROUTER_CONFIRM_V14I='RUN_SYNTHETIC_STORY_ROUTING_MATRIX_V14I'
const FLAG='PRIME_CONTROL_STORY_ROUTING_V14I_ENABLED'
export default function handler(req,res){
 res.setHeader('Cache-Control','no-store')
 if(req.method!=='POST')return res.status(405).json({ok:false,status:'METHOD_NOT_ALLOWED'})
 if(!mediaProbeAuthorized(req))return res.status(401).json({ok:false,status:'LAB_AUTH_REQUIRED'})
 if(process.env[FLAG]!=='true')return res.status(503).json({ok:false,status:'ROUTER_PREVIEW_DISABLED'})
 if(String(req.headers?.['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/json')
  return res.status(415).json({ok:false,status:'JSON_REQUIRED'})
 if(req.body?.confirm!==ROUTER_CONFIRM_V14I||
  Object.keys(req.body||{}).length!==1)
  return res.status(400).json({ok:false,status:'SCENARIO_CONFIRM_REQUIRED'})
 const matrix=runScenarioMatrixV14i()
 console.info('[PrimeControlStoryRouterV14I]',JSON.stringify({
  event:'PRIME_CONTROL_STORY_ROUTING_MATRIX_V14I',
  status:matrix.all_pass?'SCENARIOS_PASS':'SCENARIOS_FAIL',
  passed:matrix.passed,total:matrix.total,
  routes:matrix.scenarios.map(x=>({scenario:x.scenario,route:x.route,passed:x.passed})),
  real_story_fetched:false,
  database_writes:0,messages_sent:0,gptmaker_action_modified:false,
  paid_ai_calls:0,
 }))
 return res.status(matrix.all_pass?200:422).json({
  ok:matrix.all_pass,status:matrix.all_pass?'SCENARIOS_PASS':'SCENARIOS_FAIL',
  ...matrix,gptmaker_action_modified:false,instagram_messages_sent:0,
 })
}
