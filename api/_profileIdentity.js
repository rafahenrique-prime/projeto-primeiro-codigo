// Captura e persiste identidade do cliente via context_id — caminho automático do webhook.
// Fase 2A: só existência/dados básicos do perfil. Não monta memória nem entra no prompt
// da Gabriela ainda (isso é Fase 2B em diante). Erro aqui nunca pode travar a resposta —
// toda chamada externa deve ser envolvida em try/catch com fallback silencioso.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

function base() {
  return `${SUPABASE_URL}/rest/v1/customer_profiles`
}

async function getProfileByContextId(contextId) {
  try {
    const res = await fetch(`${base()}?context_id=eq.${encodeURIComponent(contextId)}&limit=1`, { headers })
    if (!res.ok) return null
    const data = await res.json()
    return data[0] || null
  } catch {
    return null
  }
}

// Cria ou atualiza a identidade básica do cliente, indexada por context_id.
// Nunca lança erro — chamador deve tratar como fire-and-forget.
export async function upsertIdentity({ contextId, telefone, canal }) {
  if (!contextId || contextId === 'desconhecido') return

  try {
    const existing = await getProfileByContextId(contextId)

    const payload = {
      context_id: contextId,
      telefone: telefone || existing?.telefone || null,
      channel: canal || existing?.channel || null,
      last_seen: new Date().toISOString(),
    }

    if (existing) {
      const res = await fetch(`${base()}?context_id=eq.${encodeURIComponent(contextId)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
      })
      if (!res.ok) console.error('[ProfileIdentity] PATCH falhou:', res.status)
    } else {
      const res = await fetch(base(), {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) console.error('[ProfileIdentity] POST falhou:', res.status)
    }
  } catch (err) {
    console.error('[ProfileIdentity] Erro ao gravar identidade:', err.message)
  }
}
