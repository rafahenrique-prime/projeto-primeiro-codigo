/**
 * V1.4B — Story -> GPTMaker handoff trace.
 *
 * LAB-first e fail-open. Não altera o contrato JSON comercial; apenas emite
 * uma linha estruturada no log quando explicitamente habilitado.
 *
 * Proibido aqui: pergunta do cliente, chat_id, cliente_id, telefone,
 * storyMediaUrl, prompt, texto da Vision, nome/marca/preço do produto ou
 * qualquer outro conteúdo comercial/PII.
 */
import crypto from 'node:crypto'

const VALID_MODES = new Set(['off', 'log'])

function cleanEnum(value, fallback = null, max = 100) {
  if (value == null) return fallback
  const out = String(value).trim().slice(0, max)
  return out || fallback
}

function intOrNull(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : null
}

export function getStoryHandoffTraceMode() {
  const raw = String(process.env.PRIME_STORY_HANDOFF_TRACE_MODE || '')
    .trim()
    .toLowerCase()

  // "shadow" é aceito como alias operacional de "log" para facilitar rollback
  // e manter o vocabulário usado nas outras camadas do Story.
  const normalized = raw === 'shadow' ? 'log' : raw
  return VALID_MODES.has(normalized) ? normalized : 'off'
}

export function sha256Payload(payload) {
  try {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(payload ?? null))
      .digest('hex')
  } catch {
    return null
  }
}

export function buildStoryHandoffTrace({
  correlationId,
  storyId,
  storyContextStatus,
  visionStatus,
  catalogStageReached,
  searchContextUsed,
  fallbackUsed,
  candidateCount,
  jevMode,
  jevStatus,
  jevAction,
  jevReason,
  responsePayload,
  requestStartedAtMs,
}) {
  const payloadProducts = Array.isArray(responsePayload?.dados?.produtos)
    ? responsePayload.dados.produtos.length
    : 0

  const decisionLayerAction =
    responsePayload?.contexto?.decision_layer?.action || null

  const started = Number(requestStartedAtMs)
  const latencyMs = Number.isFinite(started)
    ? Math.max(0, Date.now() - started)
    : null

  return {
    event: 'STORY_GPTMAKER_HANDOFF_TRACE_V1',
    version: '1.4B',
    stage: 'TOOL_RESPONSE_READY',
    destination: 'GPTMAKER',
    correlation_id: cleanEnum(correlationId, null, 64),
    story_id: cleanEnum(storyId, null, 128),
    story_context_status: cleanEnum(storyContextStatus, 'UNKNOWN'),
    vision_status: cleanEnum(visionStatus, 'UNKNOWN'),
    catalog_stage_reached: catalogStageReached === true,
    search_context_used: cleanEnum(searchContextUsed, 'UNKNOWN'),
    fallback_used: fallbackUsed === true,
    candidate_count: intOrNull(candidateCount),
    jev_mode: cleanEnum(jevMode, 'UNKNOWN'),
    jev_status: cleanEnum(jevStatus, 'UNKNOWN'),
    jev_action: cleanEnum(jevAction, 'UNKNOWN'),
    jev_reason: cleanEnum(jevReason, 'UNKNOWN', 160),
    payload_prepared: true,
    payload_product_count: payloadProducts,
    decision_layer_action: cleanEnum(decisionLayerAction, null),
    http_status: 200,
    payload_sha256: sha256Payload(responsePayload),
    latency_ms: latencyMs,
    emitted_at: new Date().toISOString(),
  }
}

export function emitStoryHandoffTrace(traceEvent) {
  if (getStoryHandoffTraceMode() === 'off') return false

  try {
    console.log('[StoryHandoffTrace]', JSON.stringify(traceEvent))
    return true
  } catch {
    // Fail-open: tracing nunca pode quebrar atendimento.
    return false
  }
}
