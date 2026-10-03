// PRIME ALERTA V2.4 — onStartInteraction LAB probe.
//
// Isolated diagnostic endpoint. It has NO Base44 fan-out, NO watch creation,
// NO Telegram, and does not touch /api/onnewmessage.
// It intentionally logs only sanitized metadata so we can learn whether the
// GPTMaker onStartInteraction webhook fires and which non-sensitive fields
// are present. Never log message text, phone, recipient, media, or raw IDs.

import { createHash } from 'node:crypto'

function hashShort(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  return createHash('sha256').update(value.trim()).digest('hex').slice(0, 20)
}

function cleanEnum(value, max = 80) {
  if (typeof value !== 'string') return null
  const v = value.trim()
  if (!v) return null
  return v.slice(0, max)
}

function logProbe(body) {
  const keys = Object.keys(body).sort().slice(0, 40)
  const contextId =
    typeof body.contextId === 'string' ? body.contextId :
    typeof body.chatId === 'string' ? body.chatId :
    null
  const messageId =
    typeof body.messageId === 'string' ? body.messageId :
    typeof body.id === 'string' ? body.id :
    null

  const event = {
    event: 'onstartinteraction_received',
    keys,
    role: cleanEnum(body.role),
    type: cleanEnum(body.type),
    conversationNotificationType:
      cleanEnum(body.conversationNotificationType) ||
      cleanEnum(body.notificationType) ||
      cleanEnum(body.event),
    context_id_hash: hashShort(contextId),
    message_id_hash: hashShort(messageId),
    has_agent_id: typeof body.agentId === 'string' && Boolean(body.agentId.trim()),
    has_channel_id: typeof body.channelId === 'string' && Boolean(body.channelId.trim()),
    has_recipient: typeof body.recipient === 'string' && Boolean(body.recipient.trim()),
    has_contact_phone: typeof body.contactPhone === 'string' && Boolean(body.contactPhone.trim()),
    has_message_text:
      (typeof body.message === 'string' && Boolean(body.message.trim())) ||
      (typeof body.text === 'string' && Boolean(body.text.trim())),
  }

  console.log('[onstartinteraction-lab]', JSON.stringify(event))
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      route: 'onstartinteraction-lab',
      ready: true,
      side_effects: false,
    })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' })
  }

  const body =
    req.body &&
    typeof req.body === 'object' &&
    !Array.isArray(req.body)
      ? req.body
      : {}

  logProbe(body)

  return res.status(200).json({
    ok: true,
    route: 'onstartinteraction-lab',
    received: true,
    side_effects: false,
  })
}
