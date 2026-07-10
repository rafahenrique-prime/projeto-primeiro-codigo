// Inteligência Operacional → Instagram: audita DMs via GPT Maker.
// 100% regra — mesma lógica estrutural do WhatsApp (tempo, duplicidade, nome vazio).
// "Comentários sem resposta" e "perguntas recorrentes" do plano original não têm fonte de
// dado ainda (GPT Maker só expõe DMs, não comentários de post) — ficam de fora até existir
// uma integração real, em vez de fingir uma métrica sem dado por trás.
import { listChats } from '../gptmaker'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY

const sbHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

const UNANSWERED_MIN_MINUTES = 120
const ABANDONED_HOURS = 24
const STALE_DAYS = 7
const MAX_PAGES = 4
const PAGE_SIZE = 50

function ageMinutes(time) {
  if (!time) return null
  return (Date.now() - new Date(time).getTime()) / 60000
}

function isUnnamed(name) {
  if (!name || !name.trim()) return true
  if (/^sem nome$/i.test(name.trim())) return true
  return false
}

async function fetchAllInstagramChats() {
  const all = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await listChats(undefined, page, PAGE_SIZE)
    if (!batch.length) break
    all.push(...batch)
    if (batch.length < PAGE_SIZE) break
  }
  return all.filter(c => c.type === 'INSTAGRAM')
}

export async function runInstagramAudit() {
  const runId = String(Date.now())
  const chats = await fetchAllInstagramChats()
  const findings = []

  const byUsername = new Map()
  for (const c of chats) {
    const username = (c.username || '').toLowerCase()
    if (!username) continue
    if (!byUsername.has(username)) byUsername.set(username, [])
    byUsername.get(username).push(c)
  }

  for (const c of chats) {
    const age = ageMinutes(c.time)
    const username = c.username || ''

    if ((c.unReadCount || 0) > 0 && age != null && age > UNANSWERED_MIN_MINUTES) {
      findings.push({
        type: 'sem_resposta', chat_id: c.id, contact_name: c.name || '—', username,
        detail: `${c.unReadCount} mensagem(ns) não lida(s) há ${Math.round(age / 60)}h`,
      })
    }

    if (isUnnamed(c.name)) {
      findings.push({ type: 'sem_nome', chat_id: c.id, contact_name: c.name || '—', username, detail: 'Contato sem nome identificado' })
    }

    if (age != null) {
      const ageHours = age / 60
      if (ageHours > STALE_DAYS * 24) {
        findings.push({ type: 'sem_interacao_recente', chat_id: c.id, contact_name: c.name || '—', username, detail: `Sem interação há ${Math.round(ageHours / 24)} dias` })
      } else if (ageHours > ABANDONED_HOURS) {
        findings.push({ type: 'abandonada', chat_id: c.id, contact_name: c.name || '—', username, detail: `Sem interação há ${Math.round(ageHours)}h` })
      }
    }
  }

  for (const [username, group] of byUsername) {
    if (group.length > 1) {
      findings.push({
        type: 'contato_duplicado', chat_id: group.map(g => g.id).join(','), contact_name: group.map(g => g.name || '—').join(' / '), username,
        detail: `${group.length} conversas para o mesmo @${username}`,
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
      await fetch(`${SUPABASE_URL}/rest/v1/instagram_audit_findings`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify(rows),
      })
    } catch (e) {
      console.error('[instagramAudit] Falha ao salvar achados:', e.message)
    }
  }

  return { runId, totalChats: chats.length, findings: rows }
}

export async function getAuditRuns(limit = 20) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/instagram_audit_findings?select=run_id,created_at,type,ignored&order=created_at.desc&limit=2000`,
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
      `${SUPABASE_URL}/rest/v1/instagram_audit_findings?run_id=eq.${runId}&order=type.asc`,
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
    const res = await fetch(`${SUPABASE_URL}/rest/v1/instagram_audit_findings?id=eq.${id}`, {
      method: 'PATCH',
      headers: sbHeaders,
      body: JSON.stringify({ ignored }),
    })
    return res.ok
  } catch {
    return false
  }
}
