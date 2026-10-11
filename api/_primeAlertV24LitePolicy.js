/**
 * PRIME ALERTA V2.4 LITE — policy offline e sem efeitos colaterais.
 * NAO conectar a producao sem gate de validacao. NAO substitui V2.3.
 * Sem Base44, GPTMaker, Telegram, storage, timers ou rede.
 *
 * ATENCAO: before any backend probe, acquire an atomic, persistent
 * per-chat reservation; this pure reducer by itself cannot prevent
 * concurrent requests on separate serverless workers.
 */
const CANDIDATE_ROLES = new Set(['assistant', 'tool', 'system'])
const VALID_CHANNELS = new Set(['WHATSAPP', 'INSTAGRAM'])
const DEFAULT_COOLDOWN_MS = 20_000
const clean = (value, limit = 200) =>
  typeof value === 'string' && value.trim().length <= limit
    ? value.trim()
    : ''

export function classifyLiteSignal(event, previousState = {}, opts = {}) {
  const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now()
  const cooldownMs = Number.isFinite(opts.cooldownMs) && opts.cooldownMs >= 0
    ? opts.cooldownMs : DEFAULT_COOLDOWN_MS
  const contextId = clean(event?.contextId, 240)
  const messageId = clean(event?.messageId, 240)
  const role = clean(event?.role, 40).toLowerCase()
  const channel = clean(event?.channel, 40).toUpperCase()
  const eventType = clean(
    event?.conversationNotificationType ?? event?.notificationType ?? event?.eventType,
    80,
  ).toUpperCase()
  const actualAgentId = clean(event?.agentId, 200)
  const requiredAgentId = clean(opts.officialAgentId, 200)
  const ignore = reason => ({ action: 'ignore', reason, nextState: previousState })

  if (!contextId || !VALID_CHANNELS.has(channel)) return ignore('INVALID_CONTEXT_OR_CHANNEL')
  if (requiredAgentId && actualAgentId && actualAgentId !== requiredAgentId)
    return ignore('AGENT_NOT_ALLOWED')
  if (role === 'user') return ignore('USER_MESSAGE_NOT_TRANSFER_SIGNAL')
  if (!CANDIDATE_ROLES.has(role)) return ignore('ROLE_NOT_TRANSFER_CANDIDATE')
  if (eventType && eventType !== 'TRANSFER_QUEUE') return ignore('OTHER_NOTIFICATION_TYPE')

  const lastProbeAtMs = Number(previousState?.lastProbeAtMs)
  if (Number.isFinite(lastProbeAtMs) && lastProbeAtMs > 0 &&
      nowMs - lastProbeAtMs >= 0 && nowMs - lastProbeAtMs < cooldownMs)
    return ignore('COALESCED_WITH_RECENT_SIGNAL')

  return {
    action: 'probe_candidate',
    reason: eventType === 'TRANSFER_QUEUE'
      ? 'EXPLICIT_TRANSFER_SIGNAL' : 'NON_USER_STATE_CHANGE_CANDIDATE',
    reservation: { contextId, channel, firstObservedAtMs: nowMs },
    nextState: { ...previousState, lastProbeAtMs: nowMs },
    metadata: { role, channel, hasMessageId: Boolean(messageId) },
  }
}

// Pure final gate after an external, single-chat verification.
// A production adapter must ALSO dedupe against V2.3 canonical incident rows.
export function verifiedTransferEligible(evidence) {
  return evidence?.previousHumanTalk === false &&
    evidence?.currentHumanTalk === true &&
    evidence?.freshTransferQueue === true &&
    Boolean(clean(evidence?.clientMessageId, 240)) &&
    evidence?.existingPendingIncident !== true
}
