/**
 * PRIME ALERTA V2.4 LITE -- OFFLINE TARGETED PROOF / LAB ONLY.
 * No provider clients, HTTP handlers, timers, persistent writes or notifications.
 * The caller MUST authenticate the webhook, enforce an atomic durable claim,
 * cap costs and bind all identities BEFORE supplying these snapshots.
 *
 * This detector deliberately does not activate a Telegram alert or a watch.
 */
const isId = v => typeof v === 'string' && v.trim().length >= 6 && v.length <= 240
const eventTime = v => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{13}$/.test(v) ? Number(v) : Date.parse(v)
  return Number.isFinite(n) && n > 0 ? n : NaN
}
const skip = reason => ({ confirmed: false, eligibleToCreateWatch: false, reason })

/**
 * Returns confirmation from ONE known conversation and its recent messages.
 * Does not discover chats or fetch other users' records.
 */
export function evaluateLiteTargetedTransfer({ event, chat, interaction, messages, priorState, v23IncidentPresent } = {}, opts = {}) {
  const agentId = opts.allowedLabAgentId
  const channelId = opts.allowedLabChannelId
  const when = eventTime(event?.receivedAt)
  if (!isId(agentId) || !isId(channelId) || !isId(event?.chatId) || !Number.isFinite(when) || !isId(event?.channelId))
    return skip('INVALID_OR_UNSCOPED_EVENT')
  if (event?.agentId !== agentId || event?.channelId !== channelId || event?.channel !== 'INSTAGRAM')
    return skip('OUT_OF_SCOPE_EVENT')
  if (chat?.id !== event.chatId || chat?.agentId !== agentId || chat?.channelId !== channelId || chat?.type !== 'INSTAGRAM')
    return skip('CHAT_SCOPE_MISMATCH')
  if (interaction?.chatId !== event.chatId || interaction?.agentId !== agentId || interaction?.channelType !== 'INSTAGRAM')
    return skip('INTERACTION_SCOPE_MISMATCH')
  if (chat?.humanTalk !== true || interaction?.status !== 'WAITING')
    return skip('NOT_WAITING_FOR_HUMAN')
  if (v23IncidentPresent !== false) return skip('V23_DEDUPE_NOT_PROVEN')
  if (!Array.isArray(messages) || messages.length > 100) return skip('INVALID_MESSAGE_WINDOW')

  const latestUserMs = Math.max(-Infinity, ...messages.filter(m => m?.role === 'user' && m?.type === 'TEXT').map(m => eventTime(m.time)).filter(Number.isFinite))
  if (!Number.isFinite(latestUserMs) || latestUserMs > when + 5_000 || when - latestUserMs > 300_000)
    return skip('FRESH_CUSTOMER_MESSAGE_NOT_FOUND')
  const queueMs = Math.max(-Infinity, ...messages.filter(m => m?.role === 'system' && m?.type === 'NOTIFICATION' && m?.conversationNotificationType === 'TRANSFER_QUEUE').map(m => eventTime(m.time)).filter(Number.isFinite))
  if (!Number.isFinite(queueMs) || queueMs < latestUserMs || queueMs > when + 5_000 || when - queueMs > 120_000)
    return skip('FRESH_TRANSFER_QUEUE_NOT_FOUND')

  // To authorize any future real alert, we must prove a previously persisted
  // state was false, not infer it from the model's message text.
  const priorAt = eventTime(priorState?.observedAt)
  const transitionObserved = priorState?.humanTalk === false &&
    priorState?.chatId === event.chatId &&
    priorState?.agentId === agentId &&
    Number.isFinite(priorAt) && priorAt < queueMs
  return {
    confirmed: true,
    eligibleToCreateWatch: false, // LAB gate: never auto-enable
    reason: transitionObserved ? 'SHADOW_TRANSFER_PROVEN' : 'SHADOW_TRANSFER_NO_PRIOR_STATE',
    transitionObserved,
    freshnessMs: Math.round(when - queueMs),
    // Do NOT return raw messages, phone, IDs, recipient or text.
  }
}

/**
 * Requires a scoped candidate already approved by the LAB classifier and
 * the durable database claim. All dependencies are injected. Fail-closed.
 * This function has no actual networking; tests use synthetic snapshots.
 */
export async function runLiteTargetedShadow(candidate, adapters = {}, opts = {}) {
  const fail = reason => skip(reason)
  if (opts.mode !== 'LAB_SHADOW_ONLY' || candidate?.action !== 'reserved_candidate')
    return fail('LAB_RESERVED_CANDIDATE_REQUIRED')
  const identity = candidate.reservation
  if (!isId(identity?.contextId) || identity?.agentId !== opts.allowedLabAgentId || identity?.channel !== 'INSTAGRAM')
    return fail('SCOPE_REJECTED')
  if (!isId(opts.allowedLabChannelId) || typeof adapters.readOneChat !== 'function' ||
      typeof adapters.readRecentMessages !== 'function' ||
      typeof adapters.readOneInteraction !== 'function' ||
      typeof adapters.v23IncidentExists !== 'function')
    return fail('REQUIRED_ADAPTER_UNAVAILABLE')
  try {
    const event = { chatId: identity.contextId, agentId: identity.agentId, channel: 'INSTAGRAM',
      channelId: opts.allowedLabChannelId, receivedAt: opts.receivedAt }
    // Bounded: one exact chat, one exact chat's recent messages,
    // one exact chat's interaction, one V2.3 incident check. No list-all.
    const chat = await adapters.readOneChat(identity.contextId)
    if (chat?.id !== identity.contextId || chat?.agentId !== identity.agentId ||
        chat?.channelId !== opts.allowedLabChannelId || chat?.type !== 'INSTAGRAM')
      return fail('CHAT_SCOPE_MISMATCH')
    if (chat?.humanTalk !== true) return fail('NOT_WAITING_FOR_HUMAN')
    const [messages, interaction, v23IncidentPresent] = await Promise.all([
      adapters.readRecentMessages(identity.contextId, 50),
      adapters.readOneInteraction(identity.contextId),
      adapters.v23IncidentExists(identity.contextId),
    ])
    return evaluateLiteTargetedTransfer({ event, chat, messages, interaction,
      priorState: opts.priorState, v23IncidentPresent }, opts)
  } catch { return fail('TARGETED_READ_FAILED') }
}
