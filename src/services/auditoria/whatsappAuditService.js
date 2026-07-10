// Inteligência Operacional → WhatsApp: audita a qualidade da operação via GPT Maker.
// 100% regra — são checagens estruturais (tempo, duplicidade, nome vazio), não precisam
// de interpretação semântica. IA (DeepSeek R1) fica reservada pra quando surgir uma
// necessidade real de julgamento (ex: "esse cliente parece insatisfeito?").
import { listChats } from '../gptmaker'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY

const sbHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

const UNANSWERED_MIN_MINUTES = 120   // 2h com mensagem não lida do cliente
const ABANDONED_HOURS = 24           // sem nenhuma interação há mais de 1 dia
const STALE_DAYS = 7                 // sem nenhuma interação há mais de 1 semana
const MAX_PAGES = 4
const PAGE_SIZE = 50

function ageMinutes(time) {
  if (!time) return null
  return (Date.now() - new Date(time).getTime()) / 60000
}

function isUnnamed(name, phone) {
  if (!name || !name.trim()) return true
  const digitsOnly = name.replace(/\D/g, '')
  if (digitsOnly.length >= 8 && digitsOnly === (phone || '').replace(/\D/g, '')) return true
  if (/^sem nome$/i.test(name.trim())) return true
  return false
}

async function fetchAllWhatsappChats() {
  const all = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await listChats(undefined, page, PAGE_SIZE)
    if (!batch.length) break
    all.push(...batch)
    if (batch.length < PAGE_SIZE) break
  }
  return all.filter(c => c.type === 'Z_API' || c.type === 'WHATSAPP' || c.type === 'WHATSAPP_CLOUD')
}

export async function runWhatsappAudit() {
  const runId = String(Date.now())
  const chats = await fetchAllWhatsappChats()
  const findings = []

  const byPhone = new Map()
  for (const c of chats) {
    const phone = (c.whatsappPhone || '').replace(/\D/g, '')
    if (!phone) continue
    if (!byPhone.has(phone)) byPhone.set(phone, [])
    byPhone.get(phone).push(c)
  }

  for (const c of chats) {
    const age = ageMinutes(c.time)
    const phone = c.whatsappPhone || ''

    if ((c.unReadCount || 0) > 0 && age != null && age > UNANSWERED_MIN_MINUTES) {
      findings.push({
        type: 'sem_resposta', chat_id: c.id, contact_name: c.name || '—', phone,
        detail: `${c.unReadCount} mensagem(ns) não lida(s) há ${Math.round(age / 60)}h`,
      })
    }

    if (isUnnamed(c.name, phone)) {
      findings.push({ type: 'sem_nome', chat_id: c.id, contact_name: c.name || '—', phone, detail: 'Contato sem nome identificado' })
    }

    if (age != null) {
      const ageHours = age / 60
      if (ageHours > STALE_DAYS * 24) {
        findings.push({ type: 'sem_interacao_recente', chat_id: c.id, contact_name: c.name || '—', phone, detail: `Sem interação há ${Math.round(ageHours / 24)} dias` })
      } else if (ageHours > ABANDONED_HOURS) {
        findings.push({ type: 'abandonada', chat_id: c.id, contact_name: c.name || '—', phone, detail: `Sem interação há ${Math.round(ageHours)}h` })
      }
    }
  }

  for (const [phone, group] of byPhone) {
    if (group.length > 1) {
      findings.push({
        type: 'contato_duplicado', chat_id: group.map(g => g.id).join(','), contact_name: group.map(g => g.name || '—').join(' / '), phone,
        detail: `${group.length} conversas para o mesmo número`,
      })
    }
  }

  const rows = findings.length > 0
    ? findings.map(f => ({ run_id: runId, ignored: false, ...f }))
    : chats.length > 0
      ? [{ run_id: runId, type: 'ok', ignored: true, detail: 'Nenhum problema encontrado' }]
      : []

  if (rows.length > 0) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_audit_findings`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify(rows),
      })
    } catch (e) {
      console.error('[whatsappAudit] Falha ao salvar achados:', e.message)
    }
  }

  return { runId, totalChats: chats.length, findings: rows }
}

export async function getAuditRuns(limit = 20) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/whatsapp_audit_findings?select=run_id,created_at,type,ignored&order=created_at.desc&limit=2000`,
      { headers: sbHeaders }
    )
    if (!res.ok) return []
    const rows = await res.json()
    const byRun = new Map()
    for (const r of rows) {
      if (!byRun.has(r.run_id)) byRun.set(r.run_id, { run_id: r.run_id, created_at: r.created_at, findings: 0 })
      if (!r.ignored) byRun.get(r.run_id).findings++
    }
    return [...byRun.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limit)
  } catch {
    return []
  }
}

export async function getAuditResults(runId) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/whatsapp_audit_findings?run_id=eq.${runId}&order=type.asc`,
      { headers: sbHeaders }
    )
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export async function setFindingIgnored(id, ignored) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_audit_findings?id=eq.${id}`, {
      method: 'PATCH',
      headers: sbHeaders,
      body: JSON.stringify({ ignored }),
    })
    return res.ok
  } catch {
    return false
  }
}
