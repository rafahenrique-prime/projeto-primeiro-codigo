/**
 * PRIME ALERTA V2.4 LITE — read-only LAB webhook shape probe.
 * Produces fixed enums and booleans only. NEVER logs raw webhook body,
 * client IDs, customer names, message, phone, recipient, token, or arbitrary keys.
 * No Base44/GPT Maker/Supabase calls, no writes, no timers, no outbound actions.
 */
const obj = x => x && typeof x === 'object' && !Array.isArray(x) ? x : {}
const KNOWN = new Set([
  'TRANSFER_QUEUE', 'TRANSFER_AGENT', 'START_INTERACTION_HUMAN',
  'START_INTERACTION_AGENT', 'FINISH_INTERACTION_AGENT'
])
const FIELDS = [
  ['root.conversationNotificationType', root => root.conversationNotificationType],
  ['root.notificationType', root => root.notificationType],
  ['root.eventType', root => root.eventType],
  ['root.event', root => root.event],
  ['root.type', root => root.type],
  ['data.conversationNotificationType', root => obj(root.data).conversationNotificationType],
  ['data.notificationType', root => obj(root.data).notificationType],
  ['data.eventType', root => obj(root.data).eventType],
  ['data.event', root => obj(root.data).event],
  ['message.conversationNotificationType', root => obj(root.message).conversationNotificationType],
  ['message.notificationType', root => obj(root.message).notificationType],
  ['message.eventType', root => obj(root.message).eventType],
  ['data.message.conversationNotificationType', root => obj(obj(root.data).message).conversationNotificationType]
]

export function summarizeV24LiteWebhookFields(body) {
  const root = obj(body)
  let foundKnown = null
  let firstNonempty = null
  for (const [field, get] of FIELDS) {
    const value = get(root)
    if (typeof value !== 'string' || !value.trim()) continue
    const name = value.trim().toUpperCase()
    if (!firstNonempty) firstNonempty = field
    if (KNOWN.has(name)) {
      foundKnown = { field, name }
      if (name === 'TRANSFER_QUEUE') break
    }
  }
  return {
    v24_lite_probe: 'LAB_METADATA_ONLY_V1',
    v24_lite_notification_present: Boolean(firstNonempty),
    v24_lite_notification_field: foundKnown?.field || firstNonempty || 'NONE',
    v24_lite_notification_type: foundKnown?.name || (firstNonempty ? 'OTHER' : 'MISSING'),
    v24_lite_transfer_queue_present: foundKnown?.name === 'TRANSFER_QUEUE',
  }
}
