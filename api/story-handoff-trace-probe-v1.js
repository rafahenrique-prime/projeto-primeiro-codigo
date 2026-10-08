/**
 * LAB-only protected probe for V1.4B.
 * Does not read GPTMaker, customer data, Story media, catalog, Supabase, or JEV.
 * It only proves the sanitized handoff tracer can emit in the Render runtime.
 */
import {
  buildStoryHandoffTrace,
  emitStoryHandoffTrace,
} from './_storyHandoffTrace.js'

function header(req, name) {
  const direct = req.headers?.[name]
  if (Array.isArray(direct)) return direct[0] || ''
  return String(direct || '')
}

function authorized(req) {
  const expected = String(process.env.LAB_PRODUCT_UNIVERSE_API_SECRET || '').trim()
  if (!expected) return false
  return (
    header(req, 'x-prime-lab') === 'GABY-LAB-COMERCIAL-V1' &&
    header(req, 'x-prime-lab-secret') === expected
  )
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' })
  }

  if (!authorized(req)) {
    return res.status(401).json({ ok: false, error: 'LAB_AUTH_REQUIRED' })
  }

  if (req.body?.confirm !== 'STORY_HANDOFF_TRACE_PROBE_LAB') {
    return res.status(400).json({ ok: false, error: 'CONFIRMATION_REQUIRED' })
  }

  const responsePayload = {
    contexto: {
      decision_layer: {
        scope: 'story',
        action: 'BLOCK_ASSERTION',
        reason: 'LAB_PROBE',
      },
    },
    dados: {
      produtos: [],
    },
  }

  const trace = buildStoryHandoffTrace({
    correlationId: '00000000-0000-4000-8000-00000000014b',
    storyId: 'LAB_STORY_TRACE_PROBE',
    storyContextStatus: 'LAB_PROBE',
    visionStatus: 'success',
    catalogStageReached: true,
    searchContextUsed: 'story',
    fallbackUsed: false,
    candidateCount: 0,
    jevMode: 'guard',
    jevStatus: 'local_guard',
    jevAction: 'BLOCK_ASSERTION',
    jevReason: 'LAB_PROBE',
    responsePayload,
    requestStartedAtMs: Date.now(),
  })

  const emitted = emitStoryHandoffTrace(trace)

  return res.status(200).json({
    ok: true,
    emitted,
    trace,
  })
}
