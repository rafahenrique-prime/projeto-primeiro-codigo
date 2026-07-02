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
