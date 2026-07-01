// Alertas proativos do CODEX (lead_quente, objecao_recorrente, gap_conhecimento, etc)
// Gravados pelo backend (api/_codexAlerts.js) — aqui só lemos e marcamos como resolvido.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY
const TABLE = 'codex_alerts'

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

function base() {
  return `${SUPABASE_URL}/rest/v1/${TABLE}`
}

// Busca alertas não resolvidos (mais recentes primeiro), limitado para não crescer indefinidamente
export async function getUnresolvedAlerts(limit = 20) {
  try {
    const res = await fetch(`${base()}?resolved=eq.false&order=created_at.desc&limit=${limit}`, { headers })
    if (!res.ok) return []
    return res.json()
  } catch (e) {
    console.error('[CodexAlerts] Erro ao buscar:', e.message)
    return []
  }
}

// Conta alertas não resolvidos (pro badge)
export async function countUnresolvedAlerts() {
  try {
    const res = await fetch(`${base()}?select=id&resolved=eq.false`, {
      headers: { ...headers, 'Prefer': 'count=exact' },
    })
    const total = parseInt(res.headers.get('content-range')?.split('/')[1] || '0')
    return total
  } catch {
    return 0
  }
}

// Marca um alerta específico como resolvido
export async function resolveAlert(id) {
  try {
    const res = await fetch(`${base()}?id=eq.${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ resolved: true }),
    })
    return res.ok
  } catch (e) {
    console.error('[CodexAlerts] Erro ao resolver:', e.message)
    return false
  }
}

// Marca todos os não resolvidos como resolvidos
export async function resolveAllAlerts() {
  try {
    const res = await fetch(`${base()}?resolved=eq.false`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ resolved: true }),
    })
    return res.ok
  } catch (e) {
    console.error('[CodexAlerts] Erro ao resolver todos:', e.message)
    return false
  }
}
