// Captura e persiste identidade do cliente via context_id — caminho automático do webhook.
// Fase 2A (corrigida): conv_id é NOT NULL + UNIQUE em customer_profiles, então toda
// criação de linha precisa incluir conv_id. Fluxo: busca por context_id -> fallback por
// conv_id = contextId (reconcilia com perfis já criados pelo painel — já observado que
// conv_id e context_id coincidem tanto em WhatsApp quanto em Instagram) -> só cria linha
// nova se nenhum dos dois existir. Nunca sobrescreve campo existente com null/vazio.
// Não monta memória nem entra no prompt da Gabriela ainda (fase futura). Erro aqui nunca
// pode travar a resposta — toda chamada externa é envolvida em try/catch, chamador trata
// como fire-and-forget.

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

function isValid(value) {
  return typeof value === 'string' && value.trim().length > 0
}

// Loga status + corpo estruturado do erro (sem headers/chaves) — nunca imprime `headers`.
async function logFailure(label, res) {
  let body = null
  try { body = await res.json() } catch { /* corpo não veio como JSON */ }
  console.error(`[ProfileIdentity] ${label} falhou:`, res.status, body || '(sem corpo)')
}

async function findByContextId(contextId) {
  try {
    const res = await fetch(`${base()}?context_id=eq.${encodeURIComponent(contextId)}&order=last_seen.desc&limit=1`, { headers })
    if (!res.ok) return null
    const data = await res.json()
    return data[0] || null
  } catch {
    return null
  }
}

async function findByConvId(convId) {
  try {
    const res = await fetch(`${base()}?conv_id=eq.${encodeURIComponent(convId)}&limit=1`, { headers })
    if (!res.ok) return null
    const data = await res.json()
    return data[0] || null
  } catch {
    return null
  }
}

async function patchProfile(convId, payload) {
  const res = await fetch(`${base()}?conv_id=eq.${encodeURIComponent(convId)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(payload),
  })
  if (!res.ok) await logFailure('PATCH', res)
}

async function insertProfile(payload) {
  const res = await fetch(base(), {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'return=minimal' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await logFailure('POST', res)
}

// Cria ou atualiza a identidade básica do cliente, reconciliando context_id com conv_id
// quando possível. Nunca lança erro — chamador deve tratar como fire-and-forget.
export async function upsertIdentity({ contextId, telefone, canal }) {
  if (!isValid(contextId) || contextId === 'desconhecido') return

  try {
    // 1. Busca por context_id — caso comum: 2ª+ mensagem da mesma identidade já capturada.
    const byContext = await findByContextId(contextId)
    if (byContext) {
      const payload = { last_seen: new Date().toISOString() }
      if (isValid(telefone)) payload.telefone = telefone
      if (isValid(canal)) payload.channel = canal
      await patchProfile(byContext.conv_id, payload)
      return
    }

    // 2. Fallback: busca por conv_id = contextId — reconcilia com perfil já criado
    //    pelo caminho do painel (conv_id e context_id já observados como coincidentes).
    const byConv = await findByConvId(contextId)
    if (byConv) {
      const payload = { context_id: contextId, last_seen: new Date().toISOString() }
      if (isValid(telefone)) payload.telefone = telefone
      if (isValid(canal)) payload.channel = canal
      await patchProfile(byConv.conv_id, payload)
      return
    }

    // 3. Nenhum dos dois existe — cria linha nova. conv_id = contextId satisfaz a
    //    constraint NOT NULL/UNIQUE sem gerar valor sintético (é o próprio identificador real).
    await insertProfile({
      conv_id: contextId,
      context_id: contextId,
      telefone: isValid(telefone) ? telefone : null,
      channel: isValid(canal) ? canal : null,
      last_seen: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[ProfileIdentity] Erro inesperado ao gravar identidade:', err.message)
  }
}
