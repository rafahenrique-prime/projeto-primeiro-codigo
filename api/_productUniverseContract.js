/**
 * GABY LAB — Product Universe Contract V1
 *
 * PURE / LAB-ONLY.
 * - No network
 * - No Supabase
 * - No GPTMaker
 * - No writes
 * - No production side effects
 *
 * Recebe evidências já coletadas por PRIME / VIVIAN / MIA e devolve
 * uma decisão comercial segura e auditável.
 */

export const PRODUCT_UNIVERSE_CONTRACT_VERSION = '1.0.0'
export const SOURCE_PRIORITY = ['PRIME', 'VIVIAN', 'MIA']

export const MATCH_TYPES = new Set(['EXACT', 'SAME_FAMILY', 'SIMILAR', 'UNKNOWN'])
export const SIZE_STATES = new Set(['CONFIRMED', 'OFFERABLE', 'UNKNOWN', 'NOT_APPLICABLE', 'UNAVAILABLE_CONFIRMED'])
export const PRICE_STATES = new Set(['CONFIRMED', 'INHERITED_FAMILY_RULE', 'UNKNOWN', 'CONFLICT'])
export const COMMERCIAL_ACTIONS = new Set(['CONTINUE_SALE', 'ASK_SMART_QUESTION', 'REQUEST_TEAM_VERIFY', 'HUMAN_REVIEW', 'STOP_CONFIRMED'])
export const PHOTO_ACTIONS = new Set(['USE_PRIME_PHOTO', 'REQUEST_TEAM_PHOTO', 'NONE'])

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function moneyNumber(value) {
  if (value == null || value === '') return null
  const n = Number(String(value).replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : null
}

function cleanSource(value) {
  const source = String(value ?? '').trim().toUpperCase()
  return SOURCE_PRIORITY.includes(source) ? source : null
}

function canonicalRequested(input = {}) {
  const visual = input.visual || {}
  const requested = input.requested || {}
  return {
    category: String(requested.category || visual.category || '').trim() || null,
    brand: String(requested.brand || visual.brand || '').trim() || null,
    model: String(requested.model || visual.model || '').trim() || null,
    color: String(requested.color || visual.color || '').trim() || null,
    size: String(requested.size || '').trim() || null,
  }
}

function familyRuleMatches(rule, evidence = {}) {
  if (!rule || !rule.family_id) return false
  const haystack = normalizeText([
    evidence.family_hint,
    evidence.name,
    evidence.model,
    evidence.brand,
  ].filter(Boolean).join(' '))

  if (!haystack) return false

  const aliases = Array.isArray(rule.aliases) ? rule.aliases : []
  const normalizedAliases = [rule.canonical_name, ...aliases]
    .map(normalizeText)
    .filter(Boolean)

  return normalizedAliases.some((alias) =>
    haystack === alias || haystack.includes(alias) || alias.includes(haystack)
  )
}

export function resolveCanonicalFamily(evidence = {}, familyRules = []) {
  const explicit = String(evidence.canonical_family || evidence.family_id || '').trim()
  if (explicit) return explicit

  for (const rule of familyRules || []) {
    if (familyRuleMatches(rule, evidence)) return String(rule.family_id)
  }

  const fallback = normalizeText([
    evidence.brand,
    evidence.model || evidence.name,
  ].filter(Boolean).join(' '))

  return fallback || null
}

function normalizeEvidence(item = {}, familyRules = []) {
  const source = cleanSource(item.source)
  if (!source) return null

  return {
    source,
    source_item_id: item.source_item_id == null ? null : String(item.source_item_id),
    name: String(item.name || '').trim() || null,
    brand: String(item.brand || '').trim() || null,
    category: String(item.category || '').trim() || null,
    model: String(item.model || '').trim() || null,
    color: String(item.color || '').trim() || null,
    canonical_family: resolveCanonicalFamily(item, familyRules),
    price: moneyNumber(item.price),
    price_pix: moneyNumber(item.price_pix),
    local_stock_confirmed: item.local_stock_confirmed === true,
    supplier_presence: item.supplier_presence === true,
    requested_size_confirmed: item.requested_size_confirmed === true,
    confirmed_unavailable: item.confirmed_unavailable === true,
    photo_ref: item.photo_ref ? String(item.photo_ref) : null,
    product_link: item.product_link ? String(item.product_link) : null,
    confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : null,
    raw_match_type: MATCH_TYPES.has(String(item.match_type || '').toUpperCase())
      ? String(item.match_type).toUpperCase()
      : null,
  }
}

function sourceRank(source) {
  const idx = SOURCE_PRIORITY.indexOf(source)
  return idx === -1 ? 99 : idx
}

function inferMatchType(item, requestedFamily) {
  if (item.raw_match_type) return item.raw_match_type
  if (requestedFamily && item.canonical_family && item.canonical_family === requestedFamily) {
    return 'SAME_FAMILY'
  }
  return 'UNKNOWN'
}

function requestedColorRank(item, requestedColor) {
  if (!requestedColor) return 0
  const target = normalizeText(requestedColor)
  if (!target) return 0

  const declared = normalizeText(item.color)
  const name = normalizeText(item.name)
  const model = normalizeText(item.model)
  const surface = normalizeText([item.name, item.model, item.color].filter(Boolean).join(' '))

  // 0 = variante mais específica possível para a cor pedida.
  // Ex.: "preto" deve vencer "preto / branco", que por sua vez deve
  // vencer "branco / preto estampado".
  if (declared === target) return 0

  // O catálogo PRIME ainda não possui cor estruturada em todos os itens.
  // Quando o próprio nome/modelo termina exatamente na cor pedida
  // ("New Balance 9060 Preto"), tratamos como cor exata sem penalizar PRIME.
  if (
    (!declared) &&
    (
      name === target ||
      model === target ||
      name.endsWith(` ${target}`) ||
      model.endsWith(` ${target}`)
    )
  ) {
    return 0
  }

  // Cor principal declarada seguida de complemento:
  // "preto / branco" para pedido "preto".
  if (declared && declared.startsWith(`${target} `)) return 1

  // Nome PRIME contém a cor, mas com complemento:
  // "Preto com Branco".
  if (!declared && surface.includes(target)) return 1

  // Cor aparece como secundária:
  // "branco / preto estampado" para pedido "preto".
  if (declared && declared.includes(target)) return 2

  // Sem cor conhecida não deve bater uma evidência explicitamente incompatível.
  if (!declared) return 3

  return 4
}

function requestedSizeRank(item, requestedSize) {
  if (!requestedSize) return 0
  if (item.requested_size_confirmed === true) return 0
  if (item.confirmed_unavailable === true) return 2
  return 1
}

function compareEvidenceForRequest(a, b, requested = {}) {
  // Regra comercial central: variante pedida pelo cliente vem antes da
  // prioridade de fonte. Ex.: Story branco + "tem preto?" => evidência preta
  // SAME_FAMILY pode vencer um item PRIME branco.
  const colorA = requestedColorRank(a, requested.color)
  const colorB = requestedColorRank(b, requested.color)
  if (colorA !== colorB) return colorA - colorB

  const sizeA = requestedSizeRank(a, requested.size)
  const sizeB = requestedSizeRank(b, requested.size)
  if (sizeA !== sizeB) return sizeA - sizeB

  const matchRank = { EXACT: 0, SAME_FAMILY: 1, SIMILAR: 2, UNKNOWN: 3 }
  const ma = matchRank[a.match_type] ?? 9
  const mb = matchRank[b.match_type] ?? 9
  if (ma !== mb) return ma - mb

  const sa = sourceRank(a.source)
  const sb = sourceRank(b.source)
  if (sa !== sb) return sa - sb

  const ca = Number.isFinite(a.confidence) ? a.confidence : -1
  const cb = Number.isFinite(b.confidence) ? b.confidence : -1
  return cb - ca
}

function familyPricingRule(familyId, pricingRules = []) {
  if (!familyId) return null
  return (pricingRules || []).find((r) =>
    String(r.family_id || '').trim() === familyId &&
    moneyNumber(r.price) !== null &&
    r.active !== false
  ) || null
}

function priceDecision(best, familyId, evidence, pricingRules) {
  if (!best) {
    return { state: 'UNKNOWN', amount: null, source: null, rule_id: null }
  }

  if (best.source === 'PRIME' && best.price !== null) {
    return { state: 'CONFIRMED', amount: best.price, source: 'PRIME', rule_id: null }
  }

  const rule = familyPricingRule(familyId, pricingRules)
  if (rule) {
    return {
      state: 'INHERITED_FAMILY_RULE',
      amount: moneyNumber(rule.price),
      source: String(rule.source || 'PRIME_FAMILY_RULE'),
      rule_id: rule.rule_id ? String(rule.rule_id) : null,
    }
  }

  // Regra comercial PRIME:
  // fornecedor NUNCA herda preço apenas porque existe um item PRIME
  // da mesma família. Herança só é permitida por pricing_rule explícita.
  return { state: 'UNKNOWN', amount: null, source: null, rule_id: null }
}

function sizeDecision(best, requestedSize, policy = {}) {
  if (!requestedSize) {
    return { state: 'NOT_APPLICABLE', requested_size: null, reason: 'SIZE_NOT_REQUESTED' }
  }

  if (!best) {
    return { state: 'UNKNOWN', requested_size: requestedSize, reason: 'NO_PRODUCT_EVIDENCE' }
  }

  if (best.requested_size_confirmed) {
    return { state: 'CONFIRMED', requested_size: requestedSize, reason: 'SOURCE_CONFIRMED' }
  }

  if (best.confirmed_unavailable) {
    return {
      state: 'UNAVAILABLE_CONFIRMED',
      requested_size: requestedSize,
      reason: 'SOURCE_CONFIRMED_UNAVAILABLE',
    }
  }

  if (policy.offer_catalog_sizes === true && ['EXACT', 'SAME_FAMILY'].includes(best.match_type)) {
    return {
      state: 'OFFERABLE',
      requested_size: requestedSize,
      reason: 'COMMERCIAL_POLICY_V1',
    }
  }

  return { state: 'UNKNOWN', requested_size: requestedSize, reason: 'NOT_CONFIRMED' }
}

function photoDecision(best) {
  if (!best) return { action: 'NONE', source: null, photo_ref: null }

  if (best.source === 'PRIME' && best.photo_ref) {
    return { action: 'USE_PRIME_PHOTO', source: 'PRIME', photo_ref: best.photo_ref }
  }

  if (best.source === 'VIVIAN' || best.source === 'MIA') {
    return {
      action: 'REQUEST_TEAM_PHOTO',
      source: best.source,
      photo_ref: best.photo_ref || null,
    }
  }

  return { action: 'NONE', source: best.source, photo_ref: best.photo_ref || null }
}

function commercialState(best, allEvidence, size, price) {
  if (!best) {
    return {
      product_state: 'UNKNOWN',
      action: 'ASK_SMART_QUESTION',
      reason: 'NO_MATCH_IN_ANY_SOURCE',
    }
  }

  const relevant = allEvidence.filter((x) =>
    x.canonical_family &&
    best.canonical_family &&
    x.canonical_family === best.canonical_family &&
    ['EXACT', 'SAME_FAMILY'].includes(x.match_type)
  )

  const confirmedUnavailableSources = new Set(
    relevant
      .filter((x) => x.confirmed_unavailable === true)
      .map((x) => x.source)
  )
  const allRelevantSourcesConfirmedUnavailable = SOURCE_PRIORITY.every((source) =>
    confirmedUnavailableSources.has(source)
  )

  // Fail-closed contra falso "não temos": STOP só existe quando PRIME,
  // VIVIAN e MIA trouxeram evidência explícita de indisponibilidade.
  if (allRelevantSourcesConfirmedUnavailable) {
    return {
      product_state: 'UNAVAILABLE_CONFIRMED',
      action: 'STOP_CONFIRMED',
      reason: 'ALL_RELEVANT_SOURCES_CONFIRMED_UNAVAILABLE',
    }
  }

  if (best.match_type === 'SIMILAR') {
    return {
      product_state: 'ALTERNATIVE',
      action: 'ASK_SMART_QUESTION',
      reason: 'SIMILAR_ONLY',
    }
  }

  if (best.source === 'PRIME' && best.local_stock_confirmed) {
    return {
      product_state: 'AVAILABLE',
      action: price.state === 'CONFLICT' ? 'HUMAN_REVIEW' : 'CONTINUE_SALE',
      reason: 'PRIME_LOCAL_CONFIRMED',
    }
  }

  if (best.source === 'PRIME') {
    return {
      product_state: size.state === 'OFFERABLE' ? 'OFFERABLE' : 'CATALOG_PRESENT',
      action: price.state === 'CONFLICT' ? 'HUMAN_REVIEW' : 'CONTINUE_SALE',
      reason: size.state === 'OFFERABLE'
        ? 'PRIME_COMMERCIAL_POLICY_V1'
        : 'PRIME_CATALOG_PRESENT',
    }
  }

  if ((best.source === 'VIVIAN' || best.source === 'MIA') && best.supplier_presence) {
    return {
      product_state: 'OFFERABLE',
      action: price.state === 'CONFLICT' ? 'HUMAN_REVIEW' : 'CONTINUE_SALE',
      reason: 'SUPPLIER_CANDIDATE_PRESENT',
    }
  }

  return {
    product_state: 'UNKNOWN',
    action: 'REQUEST_TEAM_VERIFY',
    reason: 'EVIDENCE_INSUFFICIENT',
  }
}

export function buildProductUniverseDecision(input = {}) {
  const familyRules = Array.isArray(input.family_rules) ? input.family_rules : []
  const pricingRules = Array.isArray(input.pricing_rules) ? input.pricing_rules : []
  const policy = {
    offer_catalog_sizes: input?.policy?.offer_catalog_sizes === true,
  }

  const requested = canonicalRequested(input)
  const requestedFamily = resolveCanonicalFamily({
    canonical_family: input.requested?.canonical_family,
    brand: requested.brand,
    model: requested.model,
    name: requested.model,
  }, familyRules)

  const evidence = (Array.isArray(input.evidence) ? input.evidence : [])
    .map((item) => normalizeEvidence(item, familyRules))
    .filter(Boolean)
    .map((item) => ({
      ...item,
      match_type: inferMatchType(item, requestedFamily),
    }))
    .sort((a, b) => compareEvidenceForRequest(a, b, requested))

  const exactOrFamily = evidence.filter((x) =>
    ['EXACT', 'SAME_FAMILY'].includes(x.match_type)
  )
  const best = exactOrFamily[0] || evidence[0] || null
  const canonicalFamily = best?.canonical_family || requestedFamily || null

  const coverage = {
    PRIME: evidence.some((x) => x.source === 'PRIME' && x.canonical_family === canonicalFamily),
    VIVIAN: evidence.some((x) => x.source === 'VIVIAN' && x.canonical_family === canonicalFamily),
    MIA: evidence.some((x) => x.source === 'MIA' && x.canonical_family === canonicalFamily),
  }

  const supplierCoverage = ['VIVIAN', 'MIA'].filter((s) => coverage[s]).length
  const price = priceDecision(best, canonicalFamily, evidence, pricingRules)
  const size = sizeDecision(best, requested.size, policy)
  const commercial = commercialState(best, evidence, size, price)
  const photo = photoDecision(best)

  return {
    contract_version: PRODUCT_UNIVERSE_CONTRACT_VERSION,
    requested,
    canonical_family: canonicalFamily,
    best_match: best
      ? {
          source: best.source,
          source_item_id: best.source_item_id,
          name: best.name,
          color: best.color,
          canonical_family: best.canonical_family,
          match_type: best.match_type,
          confidence: best.confidence,
        }
      : null,
    coverage: {
      ...coverage,
      supplier_count: supplierCoverage,
    },
    commercial,
    size,
    price,
    photo,
    guardrails: {
      false_out_of_stock_blocked:
        commercial.reason !== 'ALL_RELEVANT_SOURCES_CONFIRMED_UNAVAILABLE',
      supplier_presence_is_not_live_stock: true,
      supplier_photo_auto_send: false,
      customer_request_overrides_visual_variant: true,
    },
    evidence_count: evidence.length,
    evidence,
  }
}

export function validateProductUniverseDecision(decision) {
  const errors = []

  if (!decision || decision.contract_version !== PRODUCT_UNIVERSE_CONTRACT_VERSION) {
    errors.push('INVALID_CONTRACT_VERSION')
  }
  if (!COMMERCIAL_ACTIONS.has(decision?.commercial?.action)) {
    errors.push('INVALID_COMMERCIAL_ACTION')
  }
  if (!SIZE_STATES.has(decision?.size?.state)) {
    errors.push('INVALID_SIZE_STATE')
  }
  if (!PRICE_STATES.has(decision?.price?.state)) {
    errors.push('INVALID_PRICE_STATE')
  }
  if (!PHOTO_ACTIONS.has(decision?.photo?.action)) {
    errors.push('INVALID_PHOTO_ACTION')
  }
  if (
    decision?.commercial?.action === 'STOP_CONFIRMED' &&
    decision?.commercial?.reason !== 'ALL_RELEVANT_SOURCES_CONFIRMED_UNAVAILABLE'
  ) {
    errors.push('STOP_WITHOUT_CONFIRMED_UNAVAILABLE')
  }
  if (
    decision?.photo?.action === 'USE_PRIME_PHOTO' &&
    decision?.photo?.source !== 'PRIME'
  ) {
    errors.push('NON_PRIME_AUTO_PHOTO')
  }

  return { ok: errors.length === 0, errors }
}
