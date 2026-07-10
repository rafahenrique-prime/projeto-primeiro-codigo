// Inteligência Comercial — leitura da visão semanal agregada (gravada pelo cron-diagnosis)

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY
const TABLE = 'weekly_insights'

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

function base() {
  return `${SUPABASE_URL}/rest/v1/${TABLE}`
}

// Retorna o insight semanal mais recente
export async function getLatestWeeklyInsight() {
  try {
    const res = await fetch(`${base()}?order=week_start.desc&limit=1`, { headers })
    if (!res.ok) return null
    const data = await res.json()
    return data[0] || null
  } catch (e) {
    console.error('[WeeklyInsight] Erro ao buscar:', e.message)
    return null
  }
}
