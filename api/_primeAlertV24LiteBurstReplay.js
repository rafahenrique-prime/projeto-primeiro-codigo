/**
 * PRIME ALERTA V2.4 LITE — offline replay for sanitized LAB observer logs.
 * Pure function; no network, storage, timers, Base44, GPT Maker or Telegram.
 * IMPORTANT: 'OTHER' means non-user, NOT confirmed transfer.
 * Every output below is UNVERIFIED; no watch or alert is authorized.
 */
const VALID_FINGERPRINT = /^[a-f0-9]{24,64}$/
const ROLES = new Set(['USER', 'OTHER', 'UNKNOWN'])
const DEFAULT_GAP_MS = 1500

/**
 * Input: {chat_fingerprint, source_role, received_at} from existing LAB observer.
 * Limits are diagnostic, not an enforcement or per-user production budget.
 */
export function planLiteBurstReplay(records, options = {}) {
  const gapMs = Number.isInteger(options.gapMs) && options.gapMs >= 250 && options.gapMs <= 5000
    ? options.gapMs : DEFAULT_GAP_MS
  const globalMaxCandidates = Number.isInteger(options.maxCandidates) &&
    options.maxCandidates >= 1 && options.maxCandidates <= 10
    ? options.maxCandidates : 10
  const valid = []
  let rejected = 0
  for (const r of Array.isArray(records) ? records : []) {
    const fingerprint = typeof r?.chat_fingerprint === 'string'
      ? r.chat_fingerprint.toLowerCase() : ''
    const role = r?.source_role
    const atMs = Date.parse(r?.received_at)
    if (!VALID_FINGERPRINT.test(fingerprint) || !ROLES.has(role) ||
        !Number.isFinite(atMs) || atMs <= 0) {
      rejected++
      continue
    }
    valid.push({ fingerprint, role, atMs })
  }
  valid.sort((a, b) => a.atMs - b.atMs)
  const groups = new Map()
  let userEvents = 0
  let unknownRoleEvents = 0
  for (const e of valid) {
    if (e.role === 'USER') { userEvents++; continue }
    if (e.role === 'UNKNOWN') { unknownRoleEvents++; continue }
    let batches = groups.get(e.fingerprint)
    if (!batches) { batches = []; groups.set(e.fingerprint, batches) }
    const last = batches[batches.length - 1]
    if (last && e.atMs - last.lastMs <= gapMs) {
      last.lastMs = e.atMs
      last.signals++
    } else {
      batches.push({ firstMs: e.atMs, lastMs: e.atMs, signals: 1 })
    }
  }
  const all = [...groups.values()].flat().sort((a, b) => a.firstMs - b.firstMs)
  return {
    version: 'LAB_REPLAY_ONLY_V1',
    received: valid.length,
    rejected,
    ignoredUserEvents: userEvents,
    ignoredUnknownRoleEvents: unknownRoleEvents,
    unverifiedNonUserSignals: all.reduce((n, e) => n + e.signals, 0),
    candidateBursts: all.length,
    // This plan can predict a hypothetical number of probes; it does NOT run them.
    candidateProbesWithinLabBudget: Math.min(all.length, globalMaxCandidates),
    additionalBurstsAboveLabBudget: Math.max(0, all.length - globalMaxCandidates),
    burstSizes: all.map(b => b.signals),
    couldSendTelegram: false,
    couldConfirmTransfer: false,
    note: 'Candidate burst is not a confirmed transfer; requires verified chat state and queue event.'
  }
}
