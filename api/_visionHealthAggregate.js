/**
 * api/_visionHealthAggregate.js — funções PURAS (sem I/O) que transformam
 * linhas já buscadas de public.vision_usage_events no contrato estável do
 * painel Visão IA (api/system-tools.js?tool=vision-health).
 *
 * Isolado de propósito: nenhuma função aqui toca fetch/Supabase/OpenRouter —
 * só recebe arrays de linhas + o estado de saúde do provider já resolvido
 * e devolve o JSON final. Isso permite testar toda a lógica de agregação
 * (fuso horário, p95, buckets, alertas, status) sem mockar rede nenhuma.
 *
 * CONTRATO V1 — campos e nomes aqui são a fonte de verdade do que o
 * Mirror do Base44 vai consumir. Qualquer mudança de nome/campo depois de
 * congelado precisa de aviso explícito (ver relatório do Passo 3).
 */

const FAILURE_BUCKETS = [
  'download_error',
  'unsupported_media_type',
  'ffmpeg_error',
  'vision_error',
  'timeout',
  'provider_error',
]

// América/São_Paulo não observa horário de verão desde 2019 (Decreto
// 10.166/2019) — offset fixo -03:00 o ano inteiro. Se isso mudar no futuro,
// ajustar aqui (e só aqui) em vez de recalcular em vários pontos do código.
const SAO_PAULO_OFFSET = '-03:00'

function saoPauloDateParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (type) => parts.find((p) => p.type === type).value
  return { year: get('year'), month: get('month'), day: get('day') }
}

/** Início do dia corrente em America/Sao_Paulo, como instante UTC. */
export function computeTodayStartUtc(now = new Date()) {
  const { year, month, day } = saoPauloDateParts(now)
  return new Date(`${year}-${month}-${day}T00:00:00${SAO_PAULO_OFFSET}`)
}

/** Início do mês corrente em America/Sao_Paulo, como instante UTC. */
export function computeMonthStartUtc(now = new Date()) {
  const { year, month } = saoPauloDateParts(now)
  return new Date(`${year}-${month}-01T00:00:00${SAO_PAULO_OFFSET}`)
}

function percentile95(sortedLatencies) {
  const n = sortedLatencies.length
  if (n === 0) return 0
  // Nearest-rank: índice = ceil(0.95 * n) - 1, sempre dentro dos limites.
  const idx = Math.min(n - 1, Math.max(0, Math.ceil(0.95 * n) - 1))
  return sortedLatencies[idx]
}

function round2(n) {
  return Math.round(n * 100) / 100
}

/** Agregado usado tanto em "today" (completo) quanto em "month" (subset). */
export function aggregateEvents(rows) {
  const calls = rows.length
  const success = rows.filter((r) => r.success).length
  const failures = calls - success
  const successRate = calls > 0 ? round2((success / calls) * 100) : 0

  const latencies = rows
    .map((r) => r.latency_ms)
    .filter((v) => typeof v === 'number')
    .sort((a, b) => a - b)
  const avgLatencyMs = latencies.length > 0
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : 0
  const p95LatencyMs = percentile95(latencies)

  const sumTokens = (field) => rows.reduce((acc, r) => acc + (typeof r[field] === 'number' ? r[field] : 0), 0)
  const costUsd = rows.reduce((acc, r) => acc + (typeof r.cost_usd === 'number' ? r.cost_usd : 0), 0)

  return {
    calls,
    success,
    failures,
    success_rate: successRate,
    avg_latency_ms: avgLatencyMs,
    p95_latency_ms: p95LatencyMs,
    input_tokens: sumTokens('input_tokens'),
    output_tokens: sumTokens('output_tokens'),
    total_tokens: sumTokens('total_tokens'),
    cost_usd: costUsd,
  }
}

/** Versão reduzida do agregado — usada em "month" (contrato não pede latência/tokens de input/output). */
export function aggregateMonth(rows) {
  const full = aggregateEvents(rows)
  return {
    calls: full.calls,
    success: full.success,
    failures: full.failures,
    success_rate: full.success_rate,
    total_tokens: full.total_tokens,
    cost_usd: full.cost_usd,
  }
}

// lifetime.cost_usd — soma só cost_usd não-nulo de TODOS os eventos já
// registrados (sem filtro de data), mesma semântica null-safe já usada em
// aggregateEvents/aggregateMonth: nunca inventa custo pra evento
// cost_source='unavailable' (cost_usd null ali é ignorado na soma, não
// tratado como 0 "custo real"). Tabela vazia → 0, nunca null/erro.
export function aggregateLifetime(rows) {
  const costUsd = rows.reduce((acc, r) => acc + (typeof r.cost_usd === 'number' ? r.cost_usd : 0), 0)
  return { cost_usd: costUsd }
}

export function aggregateMedia(rows) {
  return {
    images: rows.filter((r) => r.media_type === 'image').length,
    videos: rows.filter((r) => r.media_type === 'video').length,
    unknown: rows.filter((r) => r.media_type === 'unknown').length,
    ffmpeg_used: rows.filter((r) => r.ffmpeg_used === true).length,
    ffmpeg_failures: rows.filter((r) => r.error_code === 'ffmpeg_error').length,
  }
}

export function aggregateFailures(rows) {
  const buckets = Object.fromEntries(FAILURE_BUCKETS.map((k) => [k, 0]))
  buckets.other = 0
  for (const r of rows) {
    if (r.success) continue
    const code = r.error_code
    if (code && FAILURE_BUCKETS.includes(code)) {
      buckets[code] += 1
    } else {
      buckets.other += 1
    }
  }
  return buckets
}

export function shapeRecent(rows) {
  return rows.slice(0, 20).map((r) => ({
    created_at: r.created_at,
    source: r.source,
    media_type: r.media_type,
    ffmpeg_used: r.ffmpeg_used,
    model: r.model,
    success: r.success,
    latency_ms: r.latency_ms,
    total_tokens: r.total_tokens ?? null,
    cost_usd: r.cost_usd ?? null,
    cost_source: r.cost_source,
    error_code: r.error_code ?? null,
  }))
}

/**
 * Alertas — determinísticos, calculados só a partir dos dados já agregados.
 * Ordem de avaliação não importa pro resultado final (array acumula todos
 * os que se aplicarem), mas a ordem de status (buildStatus) tem precedência
 * fixa documentada ali.
 */
export function buildAlerts({ today, media, recent, providerHealth, hasAnyData }) {
  const alerts = []

  if (!hasAnyData) {
    alerts.push({ level: 'info', code: 'no_data', message: 'Ainda não há telemetria registrada para a camada de visão.' })
    return alerts
  }

  if (providerHealth.status === 'down' || providerHealth.model_available === false) {
    alerts.push({ level: 'critical', code: 'provider_unavailable', message: 'Provider ou modelo de visão indisponível.' })
  }

  if (today.calls >= 5 && today.success_rate < 95) {
    alerts.push({ level: 'warning', code: 'low_success_rate', message: `Taxa de sucesso hoje em ${today.success_rate}% (abaixo de 95%, com ${today.calls} chamadas).` })
  }

  const ultimasTres = recent.slice(0, 3)
  if (ultimasTres.length === 3 && ultimasTres.every((r) => r.success === false)) {
    alerts.push({ level: 'warning', code: 'consecutive_failures', message: 'As últimas 3 chamadas de visão falharam em sequência.' })
  }

  if (media.ffmpeg_failures > 0) {
    alerts.push({ level: 'warning', code: 'ffmpeg_error', message: `${media.ffmpeg_failures} falha(s) de FFmpeg hoje.` })
  }

  return alerts
}

/**
 * Status geral — precedência fixa (a primeira condição que bater decide o
 * status; as demais são ignoradas mesmo que também sejam verdadeiras):
 * 1. no_data  — nenhuma telemetria registrada ainda (recent vazio)
 * 2. down     — provider_health.status === 'down'
 * 3. degraded — qualquer alerta 'critical'/'warning', OU success_rate de
 *               hoje abaixo de 95% com pelo menos 5 chamadas
 * 4. healthy  — nenhuma das condições acima
 */
export function buildStatus({ hasAnyData, providerHealth, alerts, today }) {
  if (!hasAnyData) return 'no_data'
  if (providerHealth.status === 'down') return 'down'
  const temAlertaRelevante = alerts.some((a) => a.level === 'critical' || a.level === 'warning')
  const successRateBaixo = today.calls >= 5 && today.success_rate < 95
  if (temAlertaRelevante || successRateBaixo) return 'degraded'
  return 'healthy'
}

/**
 * Monta o contrato final — única função que a rota vision-health precisa
 * chamar depois de já ter buscado todayRows/monthRows/recentRows e resolvido
 * providerHealth.
 */
export function buildVisionHealthContract({ todayRows, monthRows, recentRows, lifetimeRows = [], providerHealth, model, checkedAt }) {
  const today = aggregateEvents(todayRows)
  const month = aggregateMonth(monthRows)
  const lifetime = aggregateLifetime(lifetimeRows)
  const media = aggregateMedia(todayRows)
  const failures = aggregateFailures(todayRows)
  const recent = shapeRecent(recentRows)
  const hasAnyData = recentRows.length > 0

  const alerts = buildAlerts({ today, media, recent, providerHealth, hasAnyData })
  const status = buildStatus({ hasAnyData, providerHealth, alerts, today })

  return {
    status,
    provider: 'openrouter',
    model,
    checked_at: checkedAt,
    today,
    month,
    lifetime,
    media,
    failures,
    provider_health: providerHealth,
    recent,
    alerts,
  }
}
