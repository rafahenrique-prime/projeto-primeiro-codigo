// Biblioteca de Aprendizados — log separado do que o CODEX aprendeu sozinho
// (auditorias). Não alimenta a Gabriela ainda — é só observação pro Rafael revisar.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY
const TABLE = 'agent_learnings'

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

function base() {
  return `${SUPABASE_URL}/rest/v1/${TABLE}`
}

export async function getAllLearnings() {
  try {
    const res = await fetch(`${base()}?order=created_at.desc`, { headers })
    if (!res.ok) return []
    return res.json()
  } catch (e) {
    console.error('[AgentLearnings] Erro ao buscar:', e.message)
    return []
  }
}

export async function deleteLearning(id) {
  const res = await fetch(`${base()}?id=eq.${id}`, { method: 'DELETE', headers })
  if (!res.ok) throw new Error(`Supabase deleteLearning: ${res.status}`)
}
