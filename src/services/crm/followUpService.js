/**
 * Follow-up Service — Motor autônomo de reengajamento
 * Armazenamento: 100% Supabase (sem localStorage) — acessível de qualquer dispositivo.
 * O dedup de envios usa uma constraint única no banco (followup_sent) como trava
 * atômica real: duas abas/sessões tentando enviar ao mesmo tempo só uma consegue
 * gravar a reserva, a outra recebe conflito e desiste — sem janela de corrida.
 */

import { sendMessage } from '../gptmaker'
import { groqRequest } from '../ia/groq'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

// ─── Schedule + Stages (linha única de config em followup_config) ──────────

const DEFAULT_SCHEDULE = {
  startHour: 9,
  endHour: 20,
  blockSaturday: false,
  blockSunday: true,
}

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

export { DEFAULT_FIXED_TEXT, DEFAULT_SCHEDULE, DEFAULT_STAGES }

async function getConfigRow() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/followup_config?id=eq.1&limit=1`, { headers })
    if (!res.ok) return null
    const data = await res.json()
    return data[0] || null
  } catch { return null }
}

export async function getScheduleAsync() {
  const row = await getConfigRow()
  return { ...DEFAULT_SCHEDULE, ...(row?.schedule || {}) }
}

export async function getStagesAsync() {
  const row = await getConfigRow()
  return Array.isArray(row?.stages) && row.stages.length > 0 ? row.stages : DEFAULT_STAGES
}

async function upsertConfig(patch) {
  const current = await getConfigRow()
  const body = {
    id: 1,
    schedule: patch.schedule ?? current?.schedule ?? DEFAULT_SCHEDULE,
    stages: patch.stages ?? current?.stages ?? DEFAULT_STAGES,
    updated_at: new Date().toISOString(),
  }
  await fetch(`${SUPABASE_URL}/rest/v1/followup_config`, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify(body),
  })
}

export async function saveScheduleAsync(schedule) {
  await upsertConfig({ schedule })
}

export async function saveStagesAsync(stages) {
  await upsertConfig({ stages })
}

export function isWithinSchedule(schedule = DEFAULT_SCHEDULE) {
  if (schedule.startHour >= schedule.endHour) return true
  const now = new Date()
  const day = now.getDay()
  const hour = now.getHours()
  if (schedule.blockSunday && day === 0) return false
  if (schedule.blockSaturday && day === 6) return false
  if (hour < schedule.startHour || hour >= schedule.endHour) return false
  return true
}

// ─── Reserva de envio — trava atômica real via constraint única no banco ───
// claimSend tenta INSERIR a reserva; só uma chamada concorrente consegue (a
// constraint unique(conv_id, stage) rejeita a segunda com 409). Se o envio
// falhar depois (rede, rate-limit), releaseSend libera a reserva pra tentar
// de novo no próximo ciclo — sem isso, uma falha de rede "queimaria" o envio
// pra sempre.

async function claimSend(convId, stage) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/followup_sent`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ conv_id: convId, stage }),
    })
    return res.status === 201
  } catch {
    return false // falha de rede: mais seguro não enviar do que arriscar duplicar
  }
}

async function releaseSend(convId, stage) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/followup_sent?conv_id=eq.${encodeURIComponent(convId)}&stage=eq.${encodeURIComponent(stage)}`, {
      method: 'DELETE',
      headers,
    })
  } catch {}
}

// ─── Log ─────────────────────────────────────────────────────────────────────

async function appendLog(entry) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/followup_log`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        conv_id: entry.convId || null,
        conv_name: entry.conv || null,
        stage: entry.stage || null,
        text: entry.text || null,
        action: entry.action || null,
        status: entry.status || null,
      }),
    })
  } catch {}
}

export async function getFollowUpLog(limit = 100) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/followup_log?order=created_at.desc&limit=${limit}`, { headers })
    if (!res.ok) return []
    const rows = await res.json()
    return rows.map(r => ({ conv: r.conv_name, convId: r.conv_id, stage: r.stage, text: r.text, action: r.action, status: r.status, at: r.created_at }))
  } catch { return [] }
}

export async function clearFollowUpState() {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/followup_sent?conv_id=not.is.null`, { method: 'DELETE', headers })
    await fetch(`${SUPABASE_URL}/rest/v1/followup_log?conv_id=not.is.null`, { method: 'DELETE', headers })
  } catch {}
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

function detectStage(inactiveMin, stages) {
  if (inactiveMin === null) return null
  for (const stage of stages.filter(s => s.enabled)) {
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

  const schedule = await getScheduleAsync()
  if (!options.dryRun && !isWithinSchedule(schedule)) {
    _running = false
    return { checked: 0, sent: [], errors: [], skipped: 'outside_schedule', schedule }
  }

  const stages = await getStagesAsync()
  const sent   = []
  const errors = []
  const debug  = []

  const autoConvs = conversations.filter(c => c.id)

  // Trava real contra corrida entre abas/sessões: claimSend tenta INSERIR a reserva
  // no banco (constraint unique conv_id+stage) ANTES de gerar texto ou enviar —
  // se outra sessão já reservou, a segunda tentativa falha e pula (continue), sem
  // nunca chegar perto de mandar mensagem duplicada. Se o envio falhar depois,
  // releaseSend devolve a reserva pra tentar de novo no próximo ciclo.
  for (const conv of autoConvs) {
    const inactiveMin = getInactiveMinutes(conv)
    debug.push({ name: conv.name, rawTime: conv.rawTime, inactiveMin, mode: conv.mode })

    if (inactiveMin === null || inactiveMin < 30) continue

    const stage = detectStage(inactiveMin, stages)
    if (!stage) continue

    if (!conv.id) {
      console.warn(`[FollowUp] ⚠️ Conversa "${conv.name}" sem ID, pulando`)
      errors.push({ conv: conv.name, stage, error: 'Conversa sem ID' })
      continue
    }

    const stageCfg = stages.find(s => s.id === stage) || {}
    const action = stageCfg.action || 'message'

    if (options.dryRun) {
      const text = action === 'finalize' ? '[Finalizar atendimento]'
        : action === 'fixed_and_finalize' ? `${stageCfg.fixedText || DEFAULT_FIXED_TEXT} → [Finalizar]`
        : action === 'fixed' ? (stageCfg.fixedText || DEFAULT_FIXED_TEXT)
        : await generateFollowUpText(conv, stage)
      sent.push({ conv: conv.name, stage, text, action, dryRun: true })
      await appendLog({ conv: conv.name, convId: conv.id, stage, text, action, status: 'simulated' })
      continue
    }

    const claimed = await claimSend(conv.id, stage)
    if (!claimed) continue // outra sessão já reservou/enviou esse estágio pra essa conversa

    try {
      if (action === 'finalize') {
        // GPT Maker removeu o endpoint de "finish chat" da API — não há mais como
        // encerrar o chat do lado deles. Aqui só paramos de mandar follow-up pra
        // essa conversa (a reserva em followup_sent já garante isso).
        sent.push({ conv: conv.name, stage, action })
        await appendLog({ conv: conv.name, convId: conv.id, stage, action, status: 'finalized' })
      } else if (action === 'fixed') {
        const text = stageCfg.fixedText || DEFAULT_FIXED_TEXT
        await sendMessage(conv.id, text)
        sent.push({ conv: conv.name, stage, text })
        await appendLog({ conv: conv.name, convId: conv.id, stage, text, status: 'sent' })
        console.log(`[FollowUp] ✅ "${conv.name}" (fixed): mensagem enviada`)
      } else if (action === 'fixed_and_finalize') {
        const text = stageCfg.fixedText || DEFAULT_FIXED_TEXT
        await sendMessage(conv.id, text)
        sent.push({ conv: conv.name, stage, text, action })
        await appendLog({ conv: conv.name, convId: conv.id, stage, text, action, status: 'finalized' })
        console.log(`[FollowUp] ✅ "${conv.name}" (fixed_and_finalize): mensagem enviada + finalizado`)
      } else {
        const text = await generateFollowUpText(conv, stage)
        await sendMessage(conv.id, text)
        sent.push({ conv: conv.name, stage, text })
        await appendLog({ conv: conv.name, convId: conv.id, stage, text, status: 'sent' })
        console.log(`[FollowUp] ✅ "${conv.name}" (${stage}): "${text.slice(0, 40)}..."`)
      }
    } catch (err) {
      console.error(`[FollowUp] ❌ "${conv.name}" (${stage}): ${err.message}`)
      await releaseSend(conv.id, stage) // libera a reserva pra tentar de novo no próximo ciclo
      errors.push({ conv: conv.name, stage, error: err.message })
      await appendLog({ conv: conv.name, convId: conv.id, stage, status: 'error', error: err.message })
    }
  }

  _running = false
  return { checked: autoConvs.length, sent, errors, debug }
}

// ─── Taxa de resposta ─────────────────────────────────────────────────────────

export async function getResponseRate(conversations = []) {
  const allLog = await getFollowUpLog()
  const log = allLog.filter(e => e.status === 'sent' && e.convId && e.at)
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

// Busca em lote (1 request) quais conv_id+stage já têm reserva/envio registrado —
// evita 1 request por conversa por estágio, que ficaria caro com dezenas de conversas.
async function getSentSet() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/followup_sent?select=conv_id,stage`, { headers })
    if (!res.ok) return new Set()
    const rows = await res.json()
    return new Set(rows.map(r => `${r.conv_id}_${r.stage}`))
  } catch { return new Set() }
}

export async function getFollowUpSummary(conversations = []) {
  const [stages, sentSet] = await Promise.all([getStagesAsync(), getSentSet()])
  const wasSent = (convId, stage) => sentSet.has(`${convId}_${stage}`)
  const autoConvs = conversations.filter(c => c.id)
  const summary = { total: autoConvs.length, pending: [], sent: [], inactive: [] }

  for (const conv of autoConvs) {
    const inactiveMin = getInactiveMinutes(conv)
    if (inactiveMin === null) continue

    const stage = detectStage(inactiveMin, stages)
    const sentStages = stages.map(s => s.id).filter(s => wasSent(conv.id, s))

    if (inactiveMin >= 1440 && wasSent(conv.id, '24h')) {
      summary.inactive.push({ name: conv.name, inactiveMin })
    } else if (stage && !wasSent(conv.id, stage)) {
      summary.pending.push({ name: conv.name, stage, inactiveMin })
    } else if (sentStages.length > 0) {
      summary.sent.push({ name: conv.name, stages: sentStages, inactiveMin })
    }
  }

  return summary
}
