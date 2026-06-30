// Atualiza customer_profiles em tempo real (chamado fire-and-forget por knowledge.js
// a cada mensagem do cliente) e dispara alerta lead_quente quando o score cruza 70.

import { extractFromMessages } from './_scoring.js'
import { logCodexAlert } from './_codexAlerts.js'

const GPTMAKER_TOKEN = process.env.VITE_GPTMAKER_TOKEN
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY
const BASE = 'https://api.gptmaker.ai'

const HOT_LEAD_THRESHOLD = 70

const SB_HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

function mergeArray(existing, newItems) {
  const base = Array.isArray(existing) ? existing : []
  const add = Array.isArray(newItems) ? newItems : []
  return [...new Set([...base, ...add])]
}

async function getChatMessages(chatId) {
  try {
    const res = await fetch(`${BASE}/v2/chat/${chatId}/messages`, {
      headers: { 'Authorization': `Bearer ${GPTMAKER_TOKEN}` },
    })
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

async function getProfile(convId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/customer_profiles?conv_id=eq.${encodeURIComponent(convId)}&limit=1`,
    { headers: SB_HEADERS }
  )
  if (!res.ok) return null
  const data = await res.json()
  return data[0] || null
}

export async function updateCustomerScore(chatId) {
  if (!chatId || !GPTMAKER_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) return

  try {
    const msgs = await getChatMessages(chatId)
    if (!msgs.length) return

    const existing = await getProfile(chatId)
    const extracted = extractFromMessages(msgs)

    const profile = {
      conv_id: chatId,
      name: existing?.name || null,
      channel: existing?.channel || null,
      last_seen: new Date().toISOString(),
      message_count: msgs.length,
      interests: mergeArray(existing?.interests, extracted.interests),
      products_asked: mergeArray(existing?.products_asked, extracted.products_asked),
      tags: mergeArray(existing?.tags, extracted.tags),
      cep: extracted.cep || existing?.cep || null,
      size: extracted.size || existing?.size || null,
      buy_score: extracted.buy_score ?? existing?.buy_score ?? 0,
      notes: existing?.notes || null,
    }

    if (existing) {
      await fetch(`${SUPABASE_URL}/rest/v1/customer_profiles?conv_id=eq.${encodeURIComponent(chatId)}`, {
        method: 'PATCH',
        headers: { ...SB_HEADERS, 'Prefer': 'return=minimal' },
        body: JSON.stringify(profile),
      })
    } else {
      await fetch(`${SUPABASE_URL}/rest/v1/customer_profiles`, {
        method: 'POST',
        headers: { ...SB_HEADERS, 'Prefer': 'return=minimal' },
        body: JSON.stringify(profile),
      })
    }

    // Alerta só na transição frio→quente, não repete a cada mensagem com score já alto
    const wasHot = (existing?.buy_score || 0) >= HOT_LEAD_THRESHOLD
    const isHot = profile.buy_score >= HOT_LEAD_THRESHOLD
    if (isHot && !wasHot) {
      await logCodexAlert({
        type: 'lead_quente',
        severity: 'atencao',
        conversationId: chatId,
        message: `Lead esquentou: score ${profile.buy_score}/100${profile.name ? ` — ${profile.name}` : ''}`,
        data: { score: profile.buy_score, cep: profile.cep, size: profile.size, tags: profile.tags },
      })
    }
  } catch (err) {
    console.error('[customerScoring] erro (ignorado):', err.message)
  }
}
