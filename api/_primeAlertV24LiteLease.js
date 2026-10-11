/**
 * PURE LAB orchestration around an injected atomic reservation implementation.
 * This file has no Base44/Supabase client, no network, no timers and no writes.
 * Integration is intentionally missing. All real calls must remain disabled.
 */
import { createHmac } from 'node:crypto'
import { classifyLiteSignal } from './_primeAlertV24LitePolicy.js'

export function liteChatDigest({ contextId, agentId, channel }, secret) {
  if (typeof secret !== 'string' || secret.length < 32)
    throw new Error('LAB_GATE_HMAC_SECRET_UNAVAILABLE')
  if (!contextId || !agentId || !channel) throw new Error('LAB_GATE_IDENTITY_INVALID')
  return createHmac('sha256', secret)
    .update(JSON.stringify([agentId, channel, contextId]))
    .digest('hex')
}

/**
 * dbClaim is an injected RPC: async ({chatDigest}) => {accepted:boolean, reason:string}.
 * It must enforce uniqueness, 120s per-chat cooldown, short lease and daily cap
 * IN A SINGLE DATABASE TRANSACTION. Never substitute in-memory production state.
 */
export async function gateLiteSignal(event, opts = {}, dbClaim) {
  const candidate = classifyLiteSignal(event, opts)
  if (candidate.action !== 'probe_candidate') return candidate
  if (typeof dbClaim !== 'function')
    return { action: 'ignore', reason: 'ATOMIC_RESERVATION_NOT_CONFIGURED' }
  let chatDigest
  try { chatDigest = liteChatDigest(candidate.reservation, opts.hmacSecret) }
  catch { return { action: 'ignore', reason: 'LAB_GATE_SECRET_NOT_CONFIGURED' } }
  try {
    const result = await dbClaim({ chatDigest })
    if (result?.accepted !== true)
      return { action: 'ignore', reason: result?.reason || 'RESERVATION_DENIED' }
    return {
      action: 'reserved_candidate',
      reason: candidate.reason,
      metadata: candidate.metadata,
      // The caller alone holds raw context, never store this in audit logs.
      reservation: candidate.reservation,
    }
  } catch {
    return { action: 'ignore', reason: 'RESERVATION_UNAVAILABLE' }
  }
}
