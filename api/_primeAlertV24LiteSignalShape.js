/**
 * PRIME ALERTA V2.4 LITE — shape inspector: LAB offline, NO SIDE EFFECTS.
 * Accepts any payload; deliberately returns no raw identifiers, text,
 * attachments, phone, recipient, message bodies or secrets.
 * NEVER call it from GABY OFICIAL production without a separate gate.
 */
const KNOWN_TYPES = new Set([
  'TRANSFER_QUEUE', 'TRANSFER_AGENT', 'START_INTERACTION_HUMAN',
  'START_INTERACTION_AGENT', 'FINISH_INTERACTION_AGENT',
])
const VALID_ROLES = new Set(['system', 'tool', 'assistant', 'user'])
const VALID_CHANNELS = new Set(['WHATSAPP', 'INSTAGRAM'])
const safe = (v, maxLength = 120) =>
  typeof v === 'string' && v.trim().length <= maxLength ? v.trim() : ''

export function inspectLiteWebhookShape(raw) {
  const body = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const notificationFields = [
    'conversationNotificationType', 'notificationType', 'eventType',
  ].filter(k => typeof body[k] === 'string' && body[k].trim())
  const rawType = notificationFields.length ? safe(body[notificationFields[0]], 80).toUpperCase() : ''
  const rawRole = safe(body.role, 40).toLowerCase()
  const rawChannel = safe(body.channel, 40).toUpperCase()

  return {
    version: 'LAB_V24_LITE_SHAPE_V1',
    // Flags, not raw IDs
    has_context_id: Boolean(safe(body.contextId, 240)),
    has_message_id: Boolean(safe(body.messageId, 240)),
    has_agent_id: Boolean(safe(body.agentId, 240)),
    has_channel_id: Boolean(safe(body.channelId, 240)),
    // Whitelisted enum values only; unexpected values never get logged
    role: VALID_ROLES.has(rawRole) ? rawRole : 'OTHER',
    channel: VALID_CHANNELS.has(rawChannel) ? rawChannel : 'OTHER',
    notification_type: !notificationFields.length ? 'MISSING' : KNOWN_TYPES.has(rawType) ? rawType : 'OTHER',
    notification_field: notificationFields[0] || 'NONE',
    has_notification_field: notificationFields.length > 0,
    // No raw key listing: unknown keys could themselves contain PII
  }
}
