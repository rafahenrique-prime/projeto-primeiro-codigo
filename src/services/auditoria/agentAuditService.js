// Supervisor Comercial — leitura das auditorias diárias da Gabriela (gravadas pelo cron-diagnosis)

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY
const TABLE = 'agent_audits'

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

function base() {
  return `${SUPABASE_URL}/rest/v1/${TABLE}`
}

// Retorna as auditorias de hoje (mais recentes primeiro)
export async function getTodayAudits() {
  try {
    const today = new Date().toISOString().split('T')[0]
    const res = await fetch(`${base()}?created_at=gte.${today}T00:00:00&order=score.asc,created_at.desc`, { headers })
    if (!res.ok) return []
    return res.json()
  } catch (e) {
    console.error('[AgentAudit] Erro ao buscar auditorias de hoje:', e.message)
    return []
  }
}

// Resumo de hoje: nota média, total avaliado, piores casos
export async function getTodayAuditSummary() {
  const audits = await getTodayAudits()
  if (!audits.length) return { avgScore: null, total: 0, lowScore: [], best: null }
  const avgScore = Math.round((audits.reduce((s, a) => s + a.score, 0) / audits.length) * 10) / 10
  const lowScore = audits.filter(a => a.score <= 4)
  const best = [...audits].sort((a, b) => b.score - a.score)[0]
  return { avgScore, total: audits.length, lowScore, best }
}

// Normaliza texto de falha pra agrupar variações do mesmo problema
// (o cron já gera frases um pouco diferentes pro mesmo tipo de erro).
function normalizeIssue(issue) {
  if (!issue) return null
  return issue
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^nao respondeu.*$/, 'não respondeu à pergunta do cliente')
}

// Painel Inteligência Operacional → Gabriela IA: lê o que o cron de auditoria
// (api/cron-diagnosis.js) já gera todo dia — sem rodar IA nova, só agrega.
export async function getQualitySummary(days = 7) {
  try {
    const since = new Date(Date.now() - days * 86400000).toISOString()
    const res = await fetch(`${base()}?created_at=gte.${since}&order=created_at.desc&limit=2000`, { headers })
    if (!res.ok) return null
    const audits = await res.json()
    if (!audits.length) return { total: 0, avgScore: null, successRate: null, failureRate: null, topIssues: [], days }

    const total = audits.length
    const avgScore = audits.reduce((s, a) => s + a.score, 0) / total
    const successCount = audits.filter(a => a.score >= 7).length
    const failureCount = audits.filter(a => a.score <= 4).length
    const failures = audits.filter(a => a.score <= 4 && a.issue)

    const issueCounts = new Map()
    for (const a of failures) {
      const key = normalizeIssue(a.issue)
      if (!key) continue
      issueCounts.set(key, (issueCounts.get(key) || 0) + 1)
    }
    const topIssues = [...issueCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([issue, count]) => ({ issue, count }))

    return {
      total, days,
      avgScore: Math.round(avgScore * 10) / 10,
      successRate: Math.round((successCount / total) * 1000) / 10,
      failureRate: Math.round((failureCount / total) * 1000) / 10,
      topIssues,
      worstCases: [...audits].sort((a, b) => a.score - b.score).slice(0, 8),
    }
  } catch (e) {
    console.error('[AgentAudit] Erro ao gerar resumo de qualidade:', e.message)
    return null
  }
}
