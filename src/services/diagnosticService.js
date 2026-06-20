// Diagnóstico automático — salva e recupera relatórios do Supabase

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY
const TABLE = 'diagnostics'

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
}

function base() {
  return `${SUPABASE_URL}/rest/v1/${TABLE}`
}

// Salva um diagnóstico no Supabase
export async function saveDiagnostic(report, stats = {}) {
  try {
    const res = await fetch(base(), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        report,
        hot_leads: stats.hot_leads || 0,
        no_reply: stats.no_reply || 0,
      }),
    })
    if (!res.ok) throw new Error(`saveDiagnostic: ${res.status}`)
    const data = await res.json()
    return data[0]
  } catch (e) {
    console.error('[Diagnostic] Erro ao salvar:', e)
    return null
  }
}

// Retorna os últimos N diagnósticos
export async function getRecentDiagnostics(limit = 10) {
  try {
    const res = await fetch(`${base()}?order=created_at.desc&limit=${limit}`, { headers })
    if (!res.ok) return []
    return res.json()
  } catch { return [] }
}

// Retorna o último diagnóstico salvo
export async function getLastDiagnostic() {
  const list = await getRecentDiagnostics(1)
  return list[0] || null
}

// Verifica se já rodou diagnóstico hoje
export async function hasRunToday() {
  try {
    const today = new Date().toISOString().split('T')[0]
    const res = await fetch(
      `${base()}?created_at=gte.${today}T00:00:00&limit=1`,
      { headers }
    )
    if (!res.ok) return false
    const data = await res.json()
    return data.length > 0
  } catch { return false }
}
