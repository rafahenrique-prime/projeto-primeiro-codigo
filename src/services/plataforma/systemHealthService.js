// Inteligência Operacional → Sistema: checagens técnicas reais (sem IA).
import { checkUserTokenStatus } from '../gptmaker'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY
const GPTMAKER_TOKEN = import.meta.env.VITE_GPTMAKER_TOKEN
const GPTMAKER_WS = import.meta.env.VITE_GPTMAKER_WORKSPACE
const WEBHOOK_ENDPOINT = 'https://ignite-webhook.vercel.app/api/gptmaker-credits'

const sbHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

async function timed(fn) {
  const start = performance.now()
  try {
    const detail = await fn()
    return { ok: true, detail, latencyMs: Math.round(performance.now() - start) }
  } catch (e) {
    return { ok: false, detail: e.message, latencyMs: Math.round(performance.now() - start) }
  }
}

async function checkSupabase() {
  return timed(async () => {
    if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('VITE_SUPABASE_URL/VITE_SUPABASE_KEY não configurados')
    const res = await fetch(`${SUPABASE_URL}/rest/v1/products?select=id&limit=1`, { headers: sbHeaders })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return 'Conectado — tabela products acessível'
  })
}

// Tipos de canal retornados pela API do GPT Maker por categoria — WhatsApp aparece
// como gateway (Z_API, WHATSAPP_CLOUD etc.), não como "WHATSAPP" literal.
const CHANNEL_TYPES = {
  WHATSAPP: ['Z_API', 'WHATSAPP', 'WHATSAPP_CLOUD', 'TWILIO'],
  INSTAGRAM: ['INSTAGRAM'],
}

async function checkGPTMakerChannel(category, label) {
  return timed(async () => {
    if (!GPTMAKER_TOKEN || !GPTMAKER_WS) throw new Error('Credenciais GPT Maker não configuradas')
    const tokenStatus = checkUserTokenStatus()
    const res = await fetch(`https://api.gptmaker.ai/v2/workspace/${GPTMAKER_WS}/channels`, {
      headers: { Authorization: `Bearer ${GPTMAKER_TOKEN}`, 'Content-Type': 'application/json' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} ao listar canais`)
    const data = await res.json()
    const channels = data.data || []
    const types = CHANNEL_TYPES[category] || [category]
    const found = channels.filter(c => types.includes((c.type || c.channelType || '').toUpperCase()))
    if (found.length === 0) return `Nenhum canal ${label} encontrado no workspace`
    const connected = found.filter(c => c.status === 'CONNECTED' || c.connected === true)
    if (tokenStatus.message) return `${connected.length}/${found.length} canal(is) ${label} conectado(s) · ${tokenStatus.message}`
    return `${connected.length}/${found.length} canal(is) ${label} conectado(s)`
  })
}

async function checkGroq() {
  return timed(async () => {
    if (!GROQ_API_KEY) throw new Error('VITE_GROQ_API_KEY não configurada')
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return `API key válida — ${data.data?.length ?? 0} modelos disponíveis`
  })
}

async function checkWebhook() {
  return timed(async () => {
    const res = await fetch(WEBHOOK_ENDPOINT)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return 'ignite-webhook (Vercel) respondendo'
  })
}

function statusFrom(result, warnIfSlow = 4000) {
  if (!result.ok) return 'error'
  if (result.latencyMs > warnIfSlow) return 'warn'
  return 'ok'
}

// Roda todas as checagens em paralelo e persiste no histórico.
export async function runSystemHealthCheck() {
  const runId = String(Date.now())

  const [supabase, whatsapp, instagram, groq, webhook] = await Promise.all([
    checkSupabase(),
    checkGPTMakerChannel('WHATSAPP', 'WhatsApp'),
    checkGPTMakerChannel('INSTAGRAM', 'Instagram'),
    checkGroq(),
    checkWebhook(),
  ])

  const checks = [
    { check_id: 'supabase', label: 'Supabase', ...supabase },
    { check_id: 'whatsapp', label: 'WhatsApp (GPT Maker)', ...whatsapp },
    { check_id: 'instagram', label: 'Instagram (GPT Maker)', ...instagram },
    { check_id: 'groq', label: 'Groq (LLM)', ...groq },
    { check_id: 'webhook', label: 'Webhooks (Vercel)', ...webhook },
    { check_id: 'filas', label: 'Filas', ok: true, detail: 'Não aplicável — projeto não usa fila/queue', latencyMs: 0, na: true },
  ]

  const rows = checks.map(c => ({
    run_id: runId,
    check_id: c.check_id,
    label: c.label,
    status: c.na ? 'n/a' : statusFrom(c),
    detail: c.detail,
    latency_ms: c.latencyMs,
  }))

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/system_health_runs`, {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify(rows),
    })
  } catch (e) {
    console.error('[systemHealthService] Falha ao salvar histórico:', e.message)
  }

  return { runId, checks: rows }
}

export async function getHealthRuns(limit = 20) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/system_health_runs?select=run_id,created_at,status&order=created_at.desc&limit=500`,
      { headers: sbHeaders }
    )
    if (!res.ok) return []
    const rows = await res.json()
    const byRun = new Map()
    for (const r of rows) {
      if (!byRun.has(r.run_id)) byRun.set(r.run_id, { run_id: r.run_id, created_at: r.created_at, errors: 0, warnings: 0 })
      if (r.status === 'error') byRun.get(r.run_id).errors++
      if (r.status === 'warn') byRun.get(r.run_id).warnings++
    }
    return [...byRun.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limit)
  } catch {
    return []
  }
}

export async function getHealthResults(runId) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/system_health_runs?run_id=eq.${runId}&order=check_id.asc`,
      { headers: sbHeaders }
    )
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}
