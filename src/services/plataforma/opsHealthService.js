// Inteligência Operacional → Painel geral: consolida a saúde de cada auditoria já ativa.
// Só lê o último resultado já salvo de cada uma (nenhuma chamada de IA nova aqui) —
// exceto WhatsApp/Instagram, que recontam os chats atuais via GPT Maker (mesma chamada
// que a Inbox já faz; sem custo de IA).
import * as bagyAuditService from '../auditoria/bagyAuditService'
import * as systemHealthService from './systemHealthService'
import * as knowledgeAuditService from '../auditoria/knowledgeAuditService'
import * as learningsAuditService from '../auditoria/learningsAuditService'
import * as whatsappAuditService from '../auditoria/whatsappAuditService'
import * as instagramAuditService from '../auditoria/instagramAuditService'
import { getQualitySummary } from '../auditoria/agentAuditService'
import { getAllEntries } from '../conhecimento/knowledgeDB'
import { getAllLearnings } from '../auditoria/agentLearningsService'
import { listChats } from '../chat/gptmaker'

function pct(value) {
  if (value == null || Number.isNaN(value)) return null
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10))
}

async function bagyHealth() {
  try {
    const runs = await bagyAuditService.getAuditRuns(1)
    if (!runs.length) return null
    const { items, totalUrls } = await bagyAuditService.getAuditResults(runs[0].run_id)
    if (!totalUrls) return null
    const divergences = items.filter(i => !i.ignored).length
    return pct(((totalUrls - divergences) / totalUrls) * 100)
  } catch { return null }
}

async function sistemaHealth() {
  try {
    const runs = await systemHealthService.getHealthRuns(1)
    if (!runs.length) return null
    const results = await systemHealthService.getHealthResults(runs[0].run_id)
    const relevant = results.filter(r => r.status !== 'n/a')
    if (!relevant.length) return null
    const ok = relevant.filter(r => r.status === 'ok').length
    return pct((ok / relevant.length) * 100)
  } catch { return null }
}

async function conhecimentoHealth() {
  try {
    const [runs, entries] = await Promise.all([knowledgeAuditService.getAuditRuns(1), getAllEntries()])
    if (!runs.length || !entries.length) return null
    return pct(100 - (runs[0].findings / entries.length) * 100)
  } catch { return null }
}

async function aprendizagemHealth() {
  try {
    const [runs, entries] = await Promise.all([learningsAuditService.getAuditRuns(1), getAllLearnings()])
    if (!runs.length || !entries.length) return null
    return pct(100 - (runs[0].findings / entries.length) * 100)
  } catch { return null }
}

async function fetchAllChats() {
  const all = []
  for (let page = 1; page <= 4; page++) {
    const batch = await listChats(undefined, page, 50)
    if (!batch.length) break
    all.push(...batch)
    if (batch.length < 50) break
  }
  return all
}

async function whatsappHealth(allChats) {
  try {
    const runs = await whatsappAuditService.getAuditRuns(1)
    if (!runs.length) return null
    const total = allChats.filter(c => c.type === 'Z_API' || c.type === 'WHATSAPP' || c.type === 'WHATSAPP_CLOUD').length
    if (!total) return null
    return pct(100 - (runs[0].findings / total) * 100)
  } catch { return null }
}

async function instagramHealth(allChats) {
  try {
    const runs = await instagramAuditService.getAuditRuns(1)
    if (!runs.length) return null
    const total = allChats.filter(c => c.type === 'INSTAGRAM').length
    if (!total) return null
    return pct(100 - (runs[0].findings / total) * 100)
  } catch { return null }
}

async function gabrielaHealth() {
  try {
    const summary = await getQualitySummary(7)
    if (!summary || !summary.total) return null
    return pct(summary.successRate)
  } catch { return null }
}

export async function getOverallHealth() {
  const allChats = await fetchAllChats().catch(() => [])

  const [bagy, sistema, conhecimento, aprendizagem, whatsapp, instagram, gabriela] = await Promise.all([
    bagyHealth(), sistemaHealth(), conhecimentoHealth(), aprendizagemHealth(),
    whatsappHealth(allChats), instagramHealth(allChats), gabrielaHealth(),
  ])

  const items = [
    { id: 'whatsapp', label: 'WhatsApp', pct: whatsapp },
    { id: 'instagram', label: 'Instagram', pct: instagram },
    { id: 'conhecimento', label: 'Conhecimento', pct: conhecimento },
    { id: 'aprendizagem', label: 'Aprendizagem', pct: aprendizagem },
    { id: 'gabriela', label: 'Gabriela', pct: gabriela },
    { id: 'sistema', label: 'Sistema', pct: sistema },
    { id: 'bagy', label: 'Bagy', pct: bagy },
  ]

  const known = items.filter(i => i.pct != null)
  const overall = known.length ? pct(known.reduce((s, i) => s + i.pct, 0) / known.length) : null

  return { items, overall, knownCount: known.length }
}
