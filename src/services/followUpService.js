/**
 * Follow-up Service — Motor autônomo de reengajamento
 * Armazenamento: Supabase (persistência) + localStorage (cache rápido síncrono)
 * Na inicialização, carrega do Supabase para o localStorage.
 * Em cada escrita, salva nos dois.
 */

import { sendMessage, finishChat } from './gptmaker'
import { groqRequest } from './groq'

const STATE_KEY    = 'followup_state'
const LOG_KEY      = 'followup_log'
const SCHEDULE_KEY = 'followup_schedule'
const STAGES_KEY   = 'followup_stages'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY
const TABLE = 'followup_state'

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation,resolution=merge-duplicates',
}

// ─── Supabase key-value helpers ─────────────────────────────────────────────

async function sbGet(key) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?key=eq.${encodeURIComponent(key)}&limit=1`, { headers })
    if (!res.ok) return null
    const data = await res.json()
    return data[0]?.value ?? null
  } catch { return null }
}

async function sbSet(key, value) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
    })
  } catch {}
}

// Carrega todos os dados do Supabase para o localStorage (chamado na inicialização)
export async function syncFromSupabase() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, { headers })
    if (!res.ok) return
    const rows = await res.json()
    for (const row of rows) {
      if (row.key && row.value !== undefined) {
        localStorage.setItem(row.key, typeof row.value === 'string' ? row.value : JSON.stringify(row.value))
      }
    }
  } catch {}
}

// ─── Helpers de escrita dupla (localStorage + Supabase) ─────────────────────

function lsGet(key, fallback = null) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback }
}

function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
  sbSet(key, value) // fire-and-forget
}

// ─── Schedule ───────────────────────────────────────────────────────────────

const DEFAULT_SCHEDULE = {
  startHour: 9,
  endHour: 20,
  blockSaturday: false,
  blockSunday: true,
}

export function getSchedule() {
  return { ...DEFAULT_SCHEDULE, ...(lsGet(SCHEDULE_KEY) || {}) }
}

export function saveSchedule(schedule) {
  lsSet(SCHEDULE_KEY, schedule)
}

export function isWithinSchedule(schedule = getSchedule()) {
  if (schedule.startHour >= schedule.endHour) return true
  const now = new Date()
  const day = now.getDay()
  const hour = now.getHours()
  if (schedule.blockSunday && day === 0) return false
  if (schedule.blockSaturday && day === 6) return false
  if (hour < schedule.startHour || hour >= schedule.endHour) return false
  return true
}

// ─── Stages ─────────────────────────────────────────────────────────────────

const DEFAULT_FIXED_TEXT = `Oi! Tudo bem? 😊

Percebi que nossa conversa ficou parada por algumas horas.

Ainda posso te ajudar com seu pedido ou prefere que eu finalize seu atendimento?

✅ Sim, preciso de ajuda
❌ Não, pode finalizar

Estou à disposição! 💙`

const DEFAULT_STAGES = [
  { id: '30min', label: '30 minutos', min: 30,   max: 1424,    action: 'message',  enabled: true },
  { id: '23h45', label: '23h45',      min: 1425, max: 1439,    action: 'message',  enabled: true },
  { id: '24h',   label: '24 horas',   min: 1440, max: 999999,  action: 'finalize', enabled: true },
]

export { DEFAULT_FIXED_TEXT }

export function getStages() {
  const saved = lsGet(STAGES_KEY)
  return Array.isArray(saved) && saved.length > 0 ? saved : DEFAULT_STAGES
}

export function saveStages(stages) {
  lsSet(STAGES_KEY, stages)
}

const STAGES = Object.fromEntries(DEFAULT_STAGES.map(s => [s.id, { min: s.min, max: s.max }]))

// ─── Estado de envios ────────────────────────────────────────────────────────

function loadState() {
  return lsGet(STATE_KEY) || {}
}

function saveState(state) {
  lsSet(STATE_KEY, state)
}

function wasSent(convId, stage, state) {
  return !!state[`${convId}_${stage}`]
}

function markSent(convId, stage, state) {
  state[`${convId}_${stage}`] = { sentAt: new Date().toISOString() }
}

// ─── Log ─────────────────────────────────────────────────────────────────────

function appendLog(entry) {
  const log = lsGet(LOG_KEY) || []
  log.unshift({ ...entry, at: new Date().toISOString() })
  lsSet(LOG_KEY, log.slice(0, 100))
}

export function getFollowUpLog() {
  return lsGet(LOG_KEY) || []
}

export function clearFollowUpState() {
  localStorage.removeItem(STATE_KEY)
  localStorage.removeItem(LOG_KEY)
  sbSet(STATE_KEY, {})
  sbSet(LOG_KEY, [])
}

// ─── Cálculo de inatividade ──────────────────────────────────────────────────

function getInactiveMinutes(conv) {
  const ts = conv.rawTime
  if (!ts) return null
  try {
    let last
    if (typeof ts === 'number') {
      last = ts > 1e12 ? new Date(ts) : new Date(ts * 1000)
    } else {
      last = new Date(ts)
    }
    if (isNaN(last.getTime())) return null
    const diff = Math.floor((Date.now() - last.getTime()) / 60000)
    return diff < 0 ? null : diff
  } catch { return null }
}

function detectStage(inactiveMin) {
  if (inactiveMin === null) return null
  for (const stage of getStages().filter(s => s.enabled)) {
    if (inactiveMin >= stage.min && inactiveMin <= stage.max) return stage.id
  }
  return null
}

// ─── Geração de mensagem via Groq ────────────────────────────────────────────

async function generateFollowUpText(conv, stage) {
  const clientName = (conv.name || 'cliente').split(' ')[0]
  const lastMsg = conv.lastMsg || ''
  const channel = conv.channel === 'instagram' ? 'Instagram' : 'WhatsApp'

  const stageInstructions = {
    '30min': `O cliente sumiu há 30 minutos. Mande uma mensagem CURTA e LEVE retomando o assunto sem forçar a venda. Máx 15 palavras. Tom: amigável, sem pressão.`,
    '23h45': `O cliente está inativo há quase 24h. Simule um vendedor que está encerrando o dia e quer saber se ainda pode ajudar. Crie senso de urgência SUAVE. Máx 20 palavras.`,
    '24h':   `Último contato após 24h de silêncio. Mensagem final, amigável, deixando a porta aberta. Sem pressão. Máx 15 palavras.`,
  }

  const prompt = `Você é ${conv.agentName || 'Gabriela'}, consultora de vendas.
Canal: ${channel}
Cliente: ${clientName}
Última mensagem do cliente: "${lastMsg}"
Instrução: ${stageInstructions[stage]}
Responda APENAS com o texto da mensagem. Sem aspas, sem explicação. Use 1-2 emojis naturais.`

  try {
    const data = await groqRequest({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 80,
    })
    return data.choices[0].message.content.trim()
  } catch {
    const fallbacks = {
      '30min': `Oi ${clientName}! Ainda posso te ajudar? 😊`,
      '23h45': `${clientName}, estou encerrando o dia — ainda tem interesse? 🕙`,
      '24h':   `Oi ${clientName}! Qualquer dúvida é só chamar. Estarei aqui! 👋`,
    }
    return fallbacks[stage]
  }
}

// ─── Motor principal ─────────────────────────────────────────────────────────

let _running = false
let _lastRun = 0

export async function runFollowUpCheck(conversations = [], options = {}) {
  if (!options.dryRun && localStorage.getItem('followup_enabled') === 'false') {
    return { checked: 0, sent: [], skipped: 'disabled' }
  }

  if (_running) return { checked: 0, sent: [], skipped: 'running' }
  if (!options.dryRun && Date.now() - _lastRun < 60000) return { checked: 0, sent: [], skipped: 'throttle' }
  _running = true
  _lastRun = Date.now()

  const schedule = getSchedule()
  if (!options.dryRun && !isWithinSchedule(schedule)) {
    _running = false
    return { checked: 0, sent: [], errors: [], skipped: 'outside_schedule', schedule }
  }

  const state  = loadState()
  const sent   = []
  const errors = []
  const debug  = []

  const autoConvs = conversations.filter(c => c.id)

  for (const conv of autoConvs) {
    const inactiveMin = getInactiveMinutes(conv)
    debug.push({ name: conv.name, rawTime: conv.rawTime, inactiveMin, mode: conv.mode })

    if (inactiveMin === null || inactiveMin < 30) continue

    const stage = detectStage(inactiveMin)
    if (!stage) continue
    if (wasSent(conv.id, stage, state)) continue

    try {
      // Validação crítica: conv.id DEVE existir
      if (!conv.id) {
        console.warn(`[FollowUp] ⚠️ Conversa "${conv.name}" sem ID, pulando`)
        errors.push({ conv: conv.name, stage, error: 'Conversa sem ID' })
        continue
      }

      const stageCfg = getStages().find(s => s.id === stage) || {}
      const action = stageCfg.action || 'message'

      if (options.dryRun) {
        const text = action === 'finalize' ? '[Finalizar atendimento]'
          : action === 'fixed' ? (stageCfg.fixedText || DEFAULT_FIXED_TEXT)
          : await generateFollowUpText(conv, stage)
        sent.push({ conv: conv.name, stage, text, action, dryRun: true })
        appendLog({ conv: conv.name, convId: conv.id, stage, text, action, status: 'simulated' })
      } else if (action === 'finalize') {
        await finishChat(conv.id)
        markSent(conv.id, stage, state)
        sent.push({ conv: conv.name, stage, action })
        appendLog({ conv: conv.name, convId: conv.id, stage, action, status: 'finalized' })
      } else if (action === 'fixed') {
        const text = stageCfg.fixedText || DEFAULT_FIXED_TEXT
        await sendMessage(conv.id, text)
        markSent(conv.id, stage, state)
        sent.push({ conv: conv.name, stage, text })
        appendLog({ conv: conv.name, convId: conv.id, stage, text, status: 'sent' })
        console.log(`[FollowUp] ✅ "${conv.name}" (fixed): mensagem enviada`)
      } else {
        const text = await generateFollowUpText(conv, stage)
        await sendMessage(conv.id, text)
        markSent(conv.id, stage, state)
        sent.push({ conv: conv.name, stage, text })
        appendLog({ conv: conv.name, convId: conv.id, stage, text, status: 'sent' })
        console.log(`[FollowUp] ✅ "${conv.name}" (${stage}): "${text.slice(0, 40)}..."`)
      }
    } catch (err) {
      console.error(`[FollowUp] ❌ "${conv.name}" (${stage}): ${err.message}`)
      errors.push({ conv: conv.name, stage, error: err.message })
      appendLog({ conv: conv.name, convId: conv.id, stage, status: 'error', error: err.message })
    }
  }

  if (!options.dryRun) saveState(state)
  _running = false
  return { checked: autoConvs.length, sent, errors, debug }
}

// ─── Taxa de resposta ─────────────────────────────────────────────────────────

export function getResponseRate(conversations = []) {
  const log = getFollowUpLog().filter(e => e.status === 'sent' && e.convId && e.at)
  if (log.length === 0) return { total: 0, responded: 0, rate: 0, byStage: {} }

  const convMap = Object.fromEntries(conversations.map(c => [c.id, c]))
  const byStage = {}
  let responded = 0

  for (const entry of log) {
    const conv = convMap[entry.convId]
    const sentAt = new Date(entry.at).getTime()
    const lastActivity = conv?.rawTime
      ? (typeof conv.rawTime === 'number'
          ? conv.rawTime > 1e12 ? conv.rawTime : conv.rawTime * 1000
          : new Date(conv.rawTime).getTime())
      : 0

    const didRespond = lastActivity > sentAt
    if (!byStage[entry.stage]) byStage[entry.stage] = { total: 0, responded: 0 }
    byStage[entry.stage].total++
    if (didRespond) { byStage[entry.stage].responded++; responded++ }
  }

  return { total: log.length, responded, rate: Math.round((responded / log.length) * 100), byStage }
}

// ─── Sumário ──────────────────────────────────────────────────────────────────

export function getFollowUpSummary(conversations = []) {
  const state = loadState()
  const autoConvs = conversations.filter(c => c.id)
  const summary = { total: autoConvs.length, pending: [], sent: [], inactive: [] }

  for (const conv of autoConvs) {
    const inactiveMin = getInactiveMinutes(conv)
    if (inactiveMin === null) continue

    const stage = detectStage(inactiveMin)
    const sentStages = Object.entries(STAGES)
      .filter(([s]) => wasSent(conv.id, s, state))
      .map(([s]) => s)

    if (inactiveMin >= 1440 && wasSent(conv.id, '24h', state)) {
      summary.inactive.push({ name: conv.name, inactiveMin })
    } else if (stage && !wasSent(conv.id, stage, state)) {
      summary.pending.push({ name: conv.name, stage, inactiveMin })
    } else if (sentStages.length > 0) {
      summary.sent.push({ name: conv.name, stages: sentStages, inactiveMin })
    }
  }

  return summary
}
