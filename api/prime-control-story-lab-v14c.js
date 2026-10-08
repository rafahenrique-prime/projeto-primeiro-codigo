/**
 * PRIME CONTROL V1.4C, etapa 1: replay visual controlado, somente LAB.
 * Não chama webhook comercial, GPTMaker, Supabase nem catálogo oficial.
 * Um único fixture de mídia pública pertence ao próprio repositório PRIME.
 * Catálogo vazio intencionalmente: valida fallback seguro, não venda.
 *
 * NENHUM dado de cliente, prompt privado, imagem ou payload de OCR é logado.
 * Não confundir este replay com Story real recebido via Instagram.
 */
import crypto from 'node:crypto'
import { buildStoryHandoffTrace, emitStoryHandoffTrace } from './_storyHandoffTrace.js'

export const LAB_STORY_CASE = 'PRIME_LOGO_NEGATIVE'
export const LAB_STORY_MEDIA =
  'https://raw.githubusercontent.com/rafahenrique-prime/projeto-primeiro-codigo/render-lab/catalogo-publico/logo-prime-dark.png'
const MAX_IMAGE_BYTES = 400_000
const MODEL = 'google/gemini-2.5-flash-lite'
const TIMEOUT_MS = 12_000

export function authorized(req, env = process.env) {
  // The V1.4C bridge has its own key; the supplier gate secret must not
  // grant access here. Only the dedicated GABY LAB MCP holds this key.
  const expected = String(env.PRIME_CONTROL_STORY_LAB_SHARED_KEY || '').trim()
  const actual = String(req?.headers?.['x-prime-control-story-key'] || '').trim()
  return Boolean(expected && actual && actual === expected
    && req?.headers?.['x-prime-lab'] === 'GABY-LAB-COMERCIAL-V1')
}

export function buildLabReplayPayload({ correlationId, visionOk, imageSha256, statusCode, latencyMs }) {
  const result = {
    run_id: correlationId,
    version: 'prime-control.story-lab.v1.4c',
    scope: 'LAB_ONLY',
    scenario: LAB_STORY_CASE,
    story_source: 'CONTROLLED_REPOSITORY_FIXTURE',
    actual_instagram_story: false,
    image_sha256: imageSha256 || null,
    vision: {
      executed: true,
      model: MODEL,
      status: visionOk ? 'SUCCESS' : 'ERROR',
      provider_http_status: statusCode ?? null,
    },
    catalog: { source: 'EMPTY_LAB_FIXTURE', queried: true, candidates: 0 },
    jev: {
      executed: false,
      decision: 'BLOCK_ASSERTION',
      reason: 'NO_CANDIDATES_DETERMINISTIC_GUARD',
    },
    prepared_for_gptmaker: true,
    safe_customer_answer:
      'Neste teste não existe um produto confirmado no catálogo LAB; não informe preço ou estoque.',
    timing: { latency_ms: latencyMs },
  }
  return result
}

async function fetchFixture(fetchImpl) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const r = await fetchImpl(LAB_STORY_MEDIA, { redirect: 'manual', signal: controller.signal })
    if (!r.ok || r.status >= 300) return null
    const type = String(r.headers.get('content-type') || '').split(';')[0].trim()
    if (type !== 'image/png') return null
    const len = Number(r.headers.get('content-length') || 0)
    if (len > MAX_IMAGE_BYTES) return null
    const data = Buffer.from(await r.arrayBuffer())
    if (data.length < 1 || data.length > MAX_IMAGE_BYTES) return null
    return { bytes: data, type, sha256: crypto.createHash('sha256').update(data).digest('hex') }
  } catch { return null }
  finally { clearTimeout(timeout) }
}

export async function executeLabStoryReplay({
  fetchImpl = fetch,
  env = process.env,
  startedAt = Date.now(),
} = {}) {
  const correlationId = crypto.randomUUID()
  const media = await fetchFixture(fetchImpl)
  if (!media) {
    return { ok:false, stage:'MEDIA_FETCH', error:'FIXTURE_UNAVAILABLE', correlation_id:correlationId }
  }
  const secret = String(env.LAB_PRODUCT_UNIVERSE_API_SECRET || '').trim()
  if (!secret) return { ok:false, stage:'OCR_CONFIG', error:'OCR_PROXY_UNAVAILABLE', correlation_id:correlationId }
  const port = Number(env.PORT || 10000)
  const proxyUrl = `http://127.0.0.1:${port}/api/supplier-harness-ocr-proxy`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let statusCode = null, visionOk = false
  try {
    const r = await fetchImpl(proxyUrl, {
      method:'POST',
      headers:{ 'content-type':'application/json', 'x-prime-lab-secret':secret },
      body:JSON.stringify({
        model:MODEL, max_tokens:240, temperature:0.1,
        messages:[{role:'user',content:[
          {type:'text', text:'Analise a imagem apenas como teste visual. Descreva o objeto visto sem inventar marca, modelo, preço ou estoque. Seja breve.'},
          {type:'image_url',image_url:{url:`data:image/png;base64,${media.bytes.toString('base64')}`}},
        ]}],
      }),
      signal:controller.signal,
    })
    statusCode = r.status
    if (r.ok) {
      const json = await r.json()
      visionOk = Boolean(String(json?.choices?.[0]?.message?.content || '').trim())
    }
  } catch {
    visionOk = false
  } finally { clearTimeout(timeout) }

  const payload = buildLabReplayPayload({
    correlationId, visionOk, imageSha256:media.sha256,
    statusCode,latencyMs:Date.now()-startedAt,
  })
  const trace = buildStoryHandoffTrace({
    correlationId, storyId:'LAB_FIXTURE_NO_INSTAGRAM_STORY',
    storyContextStatus:'LAB_FIXTURE',
    visionStatus:visionOk?'success':'provider_error',
    catalogStageReached:true,searchContextUsed:'lab_fixture',
    fallbackUsed:false,candidateCount:0,
    jevMode:'off', jevStatus:'not_attempted',
    jevAction:'BLOCK_ASSERTION', jevReason:'NO_CANDIDATES_DETERMINISTIC_GUARD',
    responsePayload:payload,requestStartedAtMs:startedAt,
  })
  emitStoryHandoffTrace(trace)
  console.log('[PrimeControlStoryV14C]',JSON.stringify({
    event:'PRIME_CONTROL_STORY_LAB_V14C',
    run_id:correlationId,media_sha256:media.sha256,
    vision_status:payload.vision.status,
    catalog_source:payload.catalog.source,
    jev_executed:false, safe_guard:'BLOCK_ASSERTION',
    actual_instagram_story:false,
    payload_sha256:trace.payload_sha256,
  }))
  return {
    ok:visionOk,
    stage:visionOk?'TOOL_RESPONSE_READY':'VISION_FAILED',
    correlation_id:correlationId,
    trace_sha256:trace.payload_sha256,
    result:payload,
  }
}

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store')
  if (req.method !== 'POST') return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'})
  if (!authorized(req)) return res.status(401).json({ok:false,error:'LAB_AUTH_REQUIRED'})
  if (String(process.env.PRIME_CONTROL_STORY_LAB_V14C_ENABLED || '').toLowerCase() !== 'true')
    return res.status(503).json({ok:false,error:'LAB_V14C_DISABLED'})
  if (req.body?.case !== LAB_STORY_CASE || req.body?.confirm !== 'RUN_STORY_LAB_V14C')
    return res.status(400).json({ok:false,error:'INVALID_LAB_CASE'})
  const result = await executeLabStoryReplay()
  return res.status(result.ok ? 200 : 503).json(result)
}
