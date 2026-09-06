/**
 * api/_visionTelemetry.js — telemetria técnica fail-open da camada de visão
 * compartilhada (api/_visaoProduto.js). Nunca lança exceção, nunca bloqueia
 * o atendimento: a gravação roda em segundo plano via waitUntil (mesmo
 * mecanismo já em produção em api/_primeBridgeWebhook.js), com fallback
 * fire-and-forget caso waitUntil não esteja disponível no runtime atual.
 * Qualquer falha (Supabase indisponível, timeout, rede) vira só um
 * console.warn sanitizado — nunca propaga erro pro chamador.
 *
 * NUNCA recebe/grava chat_id, storyMediaUrl, base64, pergunta/resposta do
 * cliente, nem o texto identificado do produto — só metadados operacionais
 * (ver public.vision_usage_events, supabase/migrations/030).
 *
 * Etapa 0B (Story Vision Trace, supabase/migrations/032): aceita também
 * correlationId (gerado por request em api/webhook.js) e storyId (resolvido
 * por api/_storyContext.js) — ambos opcionais, nunca PII, só pra permitir
 * correlacionar um evento técnico com a execução real que o originou.
 */

import { waitUntil } from '@vercel/functions'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY

const GENERATION_COST_TIMEOUT_MS = 3000
const INSERT_TIMEOUT_MS = 3000

// Custo real via endpoint oficial de generation da OpenRouter — best-effort,
// nunca no caminho crítico (só chamado depois que a resposta comercial já
// foi decidida, dentro da task agendada por waitUntil).
async function fetchGenerationCost(generationId) {
  if (!generationId || !OPENROUTER_API_KEY) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), GENERATION_COST_TIMEOUT_MS)
  try {
    const res = await fetch(`https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(generationId)}`, {
      headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}` },
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) return null

    const data = await res.json()
    const cost = data?.data?.total_cost
    return typeof cost === 'number' ? cost : null
  } catch {
    clearTimeout(timeout)
    return null
  }
}

async function insertVisionUsageEvent(row) {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    console.warn('[VisionTelemetry] Supabase não configurado — evento descartado')
    return
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), INSERT_TIMEOUT_MS)
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/vision_usage_events`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SECRET_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) {
      console.warn(`[VisionTelemetry] Falha ao gravar evento: HTTP ${res.status}`)
    }
  } catch (err) {
    clearTimeout(timeout)
    console.warn('[VisionTelemetry] Falha ao gravar evento:', err?.name === 'AbortError' ? 'timeout' : 'erro de rede')
  }
}

/**
 * Ponto único de gravação — o chamador (identificarProdutoPorImagem) invoca
 * isto no máximo 1x por execução, sempre no exit point que efetivamente foi
 * alcançado (nunca em loop/retry — hoje só existe uma tentativa de modelo).
 *
 * Nunca aguardado pelo caminho comercial: a Promise interna roda via
 * waitUntil (ou fire-and-forget se waitUntil não estiver disponível) e a
 * função retorna imediatamente — quem chama não precisa (nem deve) dar
 * await nela.
 */
export function recordVisionUsageEvent(event) {
  const task = (async () => {
    let costUsd = null
    let costSource = 'unavailable'

    // Estratégia de custo, em ordem (confirmado empiricamente em 2026-08-31,
    // chamada real de teste via /api/system-tools?tool=ocr-openrouter):
    // 1. usage.cost já vem na resposta PRINCIPAL do OpenRouter hoje, sem
    //    precisar de nenhum campo extra no request — é só ler o que o
    //    chamador (_visaoProduto.js) já recebeu e repassou aqui. Cobre a
    //    maioria dos casos, sem 2ª chamada de rede.
    // 2. Se não vier (mudança futura de comportamento da OpenRouter, ou
    //    resposta parcial), tenta o endpoint oficial /generation?id= como
    //    fallback best-effort.
    // 3. Sem tabela de preço por token confiável neste ponto do projeto —
    //    nunca inventar estimativa sem base técnica (OCR_PAID_ALLOWLIST não
    //    carrega pricing). cost_source fica 'unavailable' se os dois falharem.
    if (event.success && typeof event.costFromMainResponse === 'number') {
      costUsd = event.costFromMainResponse
      costSource = 'real'
    } else if (event.success && event.generationId) {
      const real = await fetchGenerationCost(event.generationId)
      if (typeof real === 'number') {
        costUsd = real
        costSource = 'real'
      }
    }

    await insertVisionUsageEvent({
      source: event.source,
      media_type: event.mediaType,
      ffmpeg_used: event.ffmpegUsed,
      ffmpeg_ms: event.ffmpegMs ?? null,
      model: event.model,
      provider: event.provider,
      success: event.success,
      latency_ms: event.latencyMs,
      input_tokens: event.inputTokens ?? null,
      output_tokens: event.outputTokens ?? null,
      total_tokens: event.totalTokens ?? null,
      cost_usd: costUsd,
      cost_source: costSource,
      error_code: event.errorCode ?? null,
      correlation_id: event.correlationId ?? null,
      story_id: event.storyId ?? null,
    })
  })().catch((err) => {
    console.warn('[VisionTelemetry] Erro inesperado na telemetria:', err?.message)
  })

  try {
    waitUntil(task)
  } catch {
    // Só seria exercido fora do runtime da Vercel — em Production/Preview
    // reais, waitUntil está sempre disponível (mesmo pacote já usado em
    // api/_primeBridgeWebhook.js). A Promise já está rodando
    // (fire-and-forget); nenhuma ação adicional é necessária.
  }
}
