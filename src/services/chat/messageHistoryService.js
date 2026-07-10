// Histórico próprio de mensagens — Supabase
// Cópia local independente do GPTMaker

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY
const TABLE = 'message_history'

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation,resolution=merge-duplicates',
}

function base() {
  return `${SUPABASE_URL}/rest/v1/${TABLE}`
}

// Salva mensagens novas de uma conversa (ignora as que já existem pelo msg_id)
export async function syncMessages(convId, msgs) {
  if (!convId || !msgs?.length) return

  try {
    // Busca IDs já salvos para não duplicar
    const res = await fetch(
      `${base()}?conv_id=eq.${encodeURIComponent(convId)}&select=msg_id`,
      { headers }
    )
    const existing = res.ok ? await res.json() : []
    const existingIds = new Set(existing.map(r => r.msg_id).filter(Boolean))

    // Filtra só mensagens novas
    const newMsgs = msgs.filter(m => {
      const id = String(m.id || '')
      return id && !existingIds.has(id)
    })

    if (newMsgs.length === 0) return

    const rows = newMsgs.map(m => ({
      conv_id: convId,
      msg_id: String(m.id || ''),
      role: m.role || 'user',
      content: m.text || m.content || '',
      msg_type: m.type || 'text',
    }))

    await fetch(base(), {
      method: 'POST',
      headers,
      body: JSON.stringify(rows),
    })
  } catch (e) {
    console.warn('[MessageHistory] Sync error:', e)
  }
}

// Recupera histórico de uma conversa do Supabase
export async function getConvHistory(convId, limit = 100) {
  try {
    const res = await fetch(
      `${base()}?conv_id=eq.${encodeURIComponent(convId)}&order=created_at.asc&limit=${limit}`,
      { headers }
    )
    if (!res.ok) return []
    return res.json()
  } catch { return [] }
}

// Apaga permanentemente todo o histórico de uma conversa
export async function deleteConvHistory(convId) {
  if (!convId) return false
  try {
    const res = await fetch(
      `${base()}?conv_id=eq.${encodeURIComponent(convId)}`,
      { method: 'DELETE', headers: { ...headers, 'Prefer': 'return=minimal' } }
    )
    return res.ok
  } catch (e) {
    console.warn('[MessageHistory] Delete error:', e)
    return false
  }
}

// Arquiva histórico de uma conversa (soft delete — hard delete após 90 dias)
export async function archiveConvHistory(convId) {
  if (!convId) return false
  try {
    const res = await fetch(
      `${base()}?conv_id=eq.${encodeURIComponent(convId)}`,
      {
        method: 'PATCH',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ archived_at: new Date().toISOString() }),
      }
    )
    return res.ok
  } catch (e) {
    console.warn('[MessageHistory] Archive error:', e)
    return false
  }
}

// Retorna total de mensagens salvas
export async function getHistoryStats() {
  try {
    const res = await fetch(`${base()}?select=conv_id`, {
      headers: { ...headers, 'Prefer': 'count=exact' },
    })
    const total = parseInt(res.headers.get('content-range')?.split('/')[1] || '0')
    const data = res.ok ? await res.json() : []
    const convIds = new Set(data.map(r => r.conv_id))
    return { total_messages: total, total_conversations: convIds.size }
  } catch { return { total_messages: 0, total_conversations: 0 } }
}
