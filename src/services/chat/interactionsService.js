const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY

const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

export async function saveInteraction({ conv_id, client_name, channel, outcome, loss_reason, objections, scripts_used, notes }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/interactions`, {
    method: 'POST',
    headers: { ...HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify({ conv_id, client_name, channel, outcome, loss_reason, objections, scripts_used, notes }),
  })
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    const msg = errBody?.message || errBody?.hint || errBody?.code || res.status
    console.error('[interactions] Supabase error:', res.status, errBody)
    throw new Error(`Supabase ${res.status}: ${msg}`)
  }
}

export async function getInteractions(limit = 200) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/interactions?order=created_at.desc&limit=${limit}`,
    { headers: HEADERS }
  )
  if (!res.ok) throw new Error('Erro ao buscar interações')
  return res.json()
}

export async function getConversionStats() {
  const all = await getInteractions(500)
  const total = all.length
  const won = all.filter(i => i.outcome === 'closed_won').length
  const loss = all.filter(i => i.outcome === 'loss').length
  const closed = all.filter(i => i.outcome === 'closed').length
  const open = all.filter(i => i.outcome === 'em_aberto').length

  const finalizadas = won + loss + closed
  const rate = finalizadas > 0 ? Math.round((won / finalizadas) * 100) : 0

  const lossReasons = {}
  all.filter(i => i.outcome === 'loss' && i.loss_reason).forEach(i => {
    lossReasons[i.loss_reason] = (lossReasons[i.loss_reason] || 0) + 1
  })

  return { total, won, loss, closed, open, rate, lossReasons, all }
}

export async function autoCloseInactiveConversations(conversations = []) {
  const now = Date.now()
  const HOURS_24 = 24 * 60 * 60 * 1000
  const closed = []

  for (const conv of conversations) {
    try {
      if (!conv.id || !conv.fullMessages) continue

      // Busca se já foi registrada
      const existing = await fetch(
        `${SUPABASE_URL}/rest/v1/interactions?conv_id=eq.${encodeURIComponent(conv.id)}&limit=1`,
        { headers: HEADERS }
      ).then(r => r.json()).catch(() => [])

      if (existing.length > 0) continue

      // Detecta última mensagem do cliente
      const clientMsgs = conv.fullMessages.filter(m => m.from === 'user' || !m.from)
      if (clientMsgs.length === 0) continue

      const lastMsg = clientMsgs[clientMsgs.length - 1]
      const lastMsgTime = new Date(lastMsg.timestamp || lastMsg.created_at || 0).getTime()
      const inactiveMs = now - lastMsgTime

      if (inactiveMs >= HOURS_24) {
        await saveInteraction({
          conv_id: conv.id,
          client_name: conv.name || conv.contact || '',
          channel: conv.channel || 'whatsapp',
          outcome: 'closed',
          notes: `Auto-closed: inativo há ${Math.round(inactiveMs / (60 * 60 * 1000))}h`,
        })
        closed.push(conv.id)
      }
    } catch (e) {
      console.error(`[autoClose] Erro ao processar ${conv.id}:`, e.message)
    }
  }

  return { count: closed.length, closed }
}
