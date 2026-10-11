/**
 * PRIME ALERTA V2.4 LITE: offline candidate filter (no I/O).
 * LAB ONLY. Never wire into the official webhook or V2.3 without new approval.
 * A role of assistant/tool/system DOES NOT prove a transfer.
 * Production-capable mode is fail closed: a verified, explicit TRANSFER_QUEUE
 * notification is required. LAB shadow can explore unidentified bursts offline.
 */
const CANDIDATE_ROLES = new Set(['assistant', 'tool', 'system'])
const VALID_CHANNELS = new Set(['WHATSAPP', 'INSTAGRAM'])
const clean = (value, max = 240) =>
  typeof value === 'string' && value.trim() && value.trim().length <= max ? value.trim() : ''

export function classifyLiteSignal(event, opts = {}) {
  const ignore = (reason) => ({ action: 'ignore', reason })
  if (opts.trustedSource !== true) return ignore('UNTRUSTED_SOURCE')
  const contextId = clean(event?.contextId)
  const messageId = clean(event?.messageId)
  const role = clean(event?.role, 40).toLowerCase()
  const channel = clean(event?.channel, 40).toUpperCase()
  const actualAgentId = clean(event?.agentId)
  const officialAgentId = clean(opts.officialAgentId)
  const eventType = clean(event?.conversationNotificationType ??
    event?.notificationType ?? event?.eventType, 80).toUpperCase()

  if (!contextId || !VALID_CHANNELS.has(channel)) return ignore('INVALID_CONTEXT_OR_CHANNEL')
  if (!officialAgentId) return ignore('OFFICIAL_AGENT_NOT_CONFIGURED')
  if (actualAgentId && actualAgentId !== officialAgentId) return ignore('AGENT_NOT_ALLOWED')
  if (role === 'user') return ignore('USER_MESSAGE_NOT_TRANSFER_SIGNAL')
  if (!CANDIDATE_ROLES.has(role)) return ignore('ROLE_NOT_TRANSFER_CANDIDATE')
  if (eventType && eventType !== 'TRANSFER_QUEUE') return ignore('OTHER_NOTIFICATION_TYPE')
  if (eventType !== 'TRANSFER_QUEUE' && opts.mode !== 'lab_shadow')
    return ignore('EXPLICIT_TRANSFER_SIGNAL_MISSING')
  return {
    action: 'probe_candidate',
    reason: eventType === 'TRANSFER_QUEUE'
      ? 'EXPLICIT_TRANSFER_SIGNAL' : 'LAB_UNVERIFIED_NON_USER_SIGNAL',
    // Strictly internal; do not log or persist raw IDs. HMAC before DB storage.
    reservation: { contextId, channel, agentId: officialAgentId },
    metadata: { role, channel, hasMessageId: Boolean(messageId) },
  }
}

// Runs only after one chat-specific read and verification of fresh messages.
// External adapter MUST cross-check V2.3 canonical dedupe/fingerprint atomically.
export function verifiedTransferEligible(e) {
  return e?.previousHumanTalk === false && e?.currentHumanTalk === true &&
    e?.freshTransferQueue === true && Boolean(clean(e?.clientMessageId)) &&
    e?.existingPendingIncident === false
}
