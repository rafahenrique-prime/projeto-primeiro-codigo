/**
 * Product Universe V1 — runtime candidato LAB.
 *
 * READ-ONLY / FAIL-CLOSED.
 * - lê apenas shadow_products da PRIME;
 * - não usa fallback para products legado;
 * - não escreve em Supabase;
 * - não chama GPTMaker;
 * - não chama JEV;
 * - não envia mensagem;
 * - fornecedores reais são lidos do Supplier Shadow com credencial server-only;
 * - fixtures continuam opcionais somente para testes controlados do LAB.
 */

import {
  buildProductUniverseDecision,
  resolveCanonicalFamily,
} from './_productUniverseContract.js'
import { fetchSupplierShadowProducts } from './_supplierShadowAdapter.js'

export const PRODUCT_UNIVERSE_RUNTIME_VERSION = '1.0.0-candidate'

export const DEFAULT_FAMILY_RULES = [
  {
    family_id: 'NIKE_AIR_FORCE_1',
    canonical_name: 'Nike Air Force 1',
    aliases: ['Air Force', 'Air Force 1', 'AF1', 'Nike AF1'],
  },
  {
    family_id: 'NEW_BALANCE_9060',
    canonical_name: 'New Balance 9060',
    aliases: ['NB9060', 'New Balance 9060', '9060'],
  },
  {
    family_id: 'ALEXANDER_MCQUEEN_OVERSIZED',
    canonical_name: 'Alexander McQueen Oversized',
    aliases: [
      'Alexander McQueen',
      'McQueen',
      'McQueen Oversized',
      'Alexander McQueen Oversized',
    ],
  },
  {
    family_id: 'NEW_BALANCE_1000',
    canonical_name: 'New Balance 1000',
    aliases: [
      'NB1000',
      'NB 1000',
      'New Balance 1000',
      'NB 1000 Reflection',
      'New Balance 1000 Reflection',
      '1000 Reflection',
    ],
  },
  {
    family_id: 'NEW_BALANCE_2000',
    canonical_name: 'New Balance 2000',
    aliases: ['NB2000', 'NB 2000', 'New Balance 2000'],
  },
  {
    family_id: 'NEW_BALANCE_530',
    canonical_name: 'New Balance 530',
    aliases: ['NB530', 'NB 530', 'New Balance 530'],
  },
  {
    family_id: 'ADIDAS_SAMBA',
    canonical_name: 'Adidas Samba',
    aliases: [
      'Samba',
      'Adidas Samba',
      'Samba OG',
      'Adidas Samba OG',
    ],
  },
  {
    family_id: 'ADIDAS_ADI_2000',
    canonical_name: 'Adidas Adi 2000',
    aliases: [
      'Adi 2000',
      'Adi2000',
      'Adidas Adi 2000',
      'Adidas 2000',
    ],
  },
  {
    family_id: 'ADIDAS_CAMPUS',
    canonical_name: 'Adidas Campus',
    aliases: [
      'Campus',
      'Adidas Campus',
      'Campus 00s',
      'Adidas Campus 00s',
    ],
  },
  {
    family_id: 'MIZUNO_WAVE_PROPHECY_14',
    canonical_name: 'Mizuno Wave Prophecy 14',
    aliases: [
      'Mizuno Pro 14',
      'Pro 14',
      'Mizuno Prophecy 14',
      'Prophecy 14',
      'Wave Prophecy 14',
      'Mizuno Wave Prophecy 14',
    ],
  },
  {
    family_id: 'NIKE_DUNK',
    canonical_name: 'Nike Dunk',
    aliases: [
      'Dunk',
      'Nike Dunk',
      'Dunk Low',
      'Nike Dunk Low',
      'SB Dunk',
      'Nike SB Dunk',
      'Nike SB Dunk Low',
    ],
  },
  {
    family_id: 'NIKE_COURT_VISION',
    canonical_name: 'Nike Court Vision',
    aliases: [
      'Court Vision',
      'Nike Court Vision',
      'Court Vision Low',
      'Nike Court Vision Low',
    ],
  },
  {
    family_id: 'NIKE_BAILLELI',
    canonical_name: 'Nike Bailleli',
    aliases: [
      'Bailleli',
      'Nike Bailleli',
    ],
  },
  {
    family_id: 'ADIDAS_ADIZERO',
    canonical_name: 'Adidas Adizero',
    aliases: [
      'Adizero',
      'Adidas Adizero',
      'Adizero 4',
      'Adidas Adizero 4',
    ],
  },
  {
    family_id: 'NIKE_VOMERO_PREMIUM',
    canonical_name: 'Nike Vomero Premium',
    aliases: [
      'Vomero Premium',
      'Nike Vomero Premium',
      'ZoomX Vomero Premium',
      'Zoom-X Vomero Premium',
      'Nike ZoomX Vomero Premium',
      'Nike Zoom-X Vomero Premium',
    ],
  },
]

const PRIME_SELECT = [
  'id',
  'bagy_product_id',
  'nome',
  'categoria_nome',
  'preco',
  'preco_pix',
  'imagem_principal',
  'link',
  'codigo',
  'marca',
].join(',')

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function numeric(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function requestShape(input = {}) {
  const visual = input.visual || {}
  const requested = input.requested || {}

  return {
    brand: String(requested.brand || visual.brand || '').trim() || null,
    model: String(requested.model || visual.model || '').trim() || null,
    color: String(requested.color || visual.color || '').trim() || null,
    size: String(requested.size || '').trim() || null,
    category: String(requested.category || visual.category || '').trim() || null,
    query: String(input.query || '').trim() || null,
  }
}

function tokens(value) {
  return normalizeText(value)
    .split(' ')
    .filter((x) => x.length >= 2)
}

function tokenOverlap(a, b) {
  const left = [...new Set(tokens(a))]
  const right = new Set(tokens(b))
  if (left.length === 0 || right.size === 0) return 0
  const hits = left.filter((x) => right.has(x)).length
  return hits / left.length
}

function colorMatches(surface, requestedColor) {
  const target = normalizeText(requestedColor)
  if (!target) return null
  return normalizeText(surface).includes(target)
}

function requestSearchText(requested) {
  return [
    requested.brand,
    requested.model,
    requested.color,
    requested.category,
    requested.query,
  ].filter(Boolean).join(' ')
}

function scoreCandidate(candidate, requested, requestedFamily, familyRules) {
  const surface = [
    candidate.nome,
    candidate.marca,
    candidate.categoria_nome,
    candidate.codigo,
  ].filter(Boolean).join(' ')

  const candidateFamily = resolveCanonicalFamily({
    name: candidate.nome,
    brand: candidate.marca,
    model: candidate.nome,
  }, familyRules)

  let score = 0
  let matchType = 'UNKNOWN'

  if (requestedFamily && candidateFamily && requestedFamily === candidateFamily) {
    score += 200
    matchType = colorMatches(surface, requested.color) === true ? 'EXACT' : 'SAME_FAMILY'
  }

  const overlap = tokenOverlap(requestSearchText(requested), surface)
  score += Math.round(overlap * 100)

  if (requested.brand && normalizeText(surface).includes(normalizeText(requested.brand))) {
    score += 25
  }

  if (requested.color && colorMatches(surface, requested.color) === true) {
    score += 40
  }

  if (requested.model && normalizeText(surface).includes(normalizeText(requested.model))) {
    score += 50
  }

  if (matchType === 'UNKNOWN' && score >= 80) {
    matchType = 'SIMILAR'
  }

  return {
    score,
    matchType,
    canonicalFamily: candidateFamily,
  }
}

export async function fetchPrimeShadowCatalog(deps = {}) {
  const {
    supabaseConfig,
    fetchImpl = fetch,
    timeoutMs = 4500,
    limit = 2000,
  } = deps

  if (!supabaseConfig?.baseUrl || !supabaseConfig?.headers) {
    return {
      ok: false,
      products: [],
      source: 'shadow_products',
      error_code: 'SUPABASE_CONFIG_MISSING',
    }
  }

  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const url =
      `${supabaseConfig.baseUrl}/rest/v1/shadow_products` +
      `?select=${encodeURIComponent(PRIME_SELECT)}&ativo=eq.true&limit=${limit}`

    const res = await fetchImpl(url, {
      method: 'GET',
      headers: supabaseConfig.headers,
      signal: controller.signal,
    })

    clearTimeout(timeoutHandle)

    if (!res?.ok) {
      return {
        ok: false,
        products: [],
        source: 'shadow_products',
        error_code: 'PRIME_SOURCE_UNAVAILABLE',
        http_status: Number(res?.status) || null,
      }
    }

    const rows = await res.json().catch(() => null)
    if (!Array.isArray(rows)) {
      return {
        ok: false,
        products: [],
        source: 'shadow_products',
        error_code: 'PRIME_SOURCE_INVALID_RESPONSE',
      }
    }

    return {
      ok: true,
      products: rows,
      source: 'shadow_products',
      error_code: null,
    }
  } catch (error) {
    clearTimeout(timeoutHandle)
    return {
      ok: false,
      products: [],
      source: 'shadow_products',
      error_code:
        error?.name === 'AbortError'
          ? 'PRIME_SOURCE_TIMEOUT'
          : 'PRIME_SOURCE_UNAVAILABLE',
    }
  }
}

export function selectPrimeEvidence(
  products = [],
  input = {},
  options = {}
) {
  const familyRules = Array.isArray(options.familyRules)
    ? options.familyRules
    : DEFAULT_FAMILY_RULES
  const maxCandidates = Number.isFinite(Number(options.maxCandidates))
    ? Math.max(1, Math.min(20, Number(options.maxCandidates)))
    : 8

  const requested = requestShape(input)
  const requestedFamily = resolveCanonicalFamily({
    brand: requested.brand,
    model: requested.model || requested.query,
    name: requested.model || requested.query,
  }, familyRules)

  return (Array.isArray(products) ? products : [])
    .map((row) => {
      const scored = scoreCandidate(row, requested, requestedFamily, familyRules)
      return { row, ...scored }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCandidates)
    .map(({ row, score, matchType, canonicalFamily }) => ({
      source: 'PRIME',
      source_item_id: row.id ?? row.bagy_product_id ?? null,
      name: row.nome ?? null,
      brand: row.marca ?? null,
      category: row.categoria_nome ?? null,
      model: row.nome ?? null,
      color: null,
      canonical_family: canonicalFamily,
      price: numeric(row.preco),
      price_pix: numeric(row.preco_pix),
      local_stock_confirmed: false,
      supplier_presence: false,
      requested_size_confirmed: false,
      confirmed_unavailable: false,
      photo_ref: row.imagem_principal ?? null,
      product_link: row.link ?? null,
      confidence: Math.min(1, score / 300),
      match_type: matchType,
      runtime_score: score,
    }))
}

export function selectSupplierFixtureEvidence(
  fixtures = [],
  input = {},
  options = {}
) {
  const familyRules = Array.isArray(options.familyRules)
    ? options.familyRules
    : DEFAULT_FAMILY_RULES
  const requested = requestShape(input)
  const requestedFamily = resolveCanonicalFamily({
    brand: requested.brand,
    model: requested.model || requested.query,
    name: requested.model || requested.query,
  }, familyRules)

  return (Array.isArray(fixtures) ? fixtures : [])
    .filter((x) => ['VIVIAN', 'MIA'].includes(String(x?.source || '').toUpperCase()))
    .map((item) => {
      const source = String(item.source).toUpperCase()
      const family = resolveCanonicalFamily({
        canonical_family: item.canonical_family,
        brand: item.brand,
        model: item.model,
        name: item.name,
      }, familyRules)

      const surface = [item.name, item.brand, item.model, item.color]
        .filter(Boolean)
        .join(' ')
      const sameFamily =
        requestedFamily && family && requestedFamily === family
      const exactColor =
        requested.color && colorMatches(surface, requested.color) === true

      let matchType = String(item.match_type || '').toUpperCase()
      if (!['EXACT', 'SAME_FAMILY', 'SIMILAR', 'UNKNOWN'].includes(matchType)) {
        matchType = sameFamily
          ? (exactColor ? 'EXACT' : 'SAME_FAMILY')
          : 'UNKNOWN'
      }

      const lexical = tokenOverlap(requestSearchText(requested), surface)
      const relevant =
        sameFamily ||
        lexical > 0 ||
        matchType === 'EXACT' ||
        matchType === 'SAME_FAMILY' ||
        matchType === 'SIMILAR'

      if (!relevant) return null

      return {
        source,
        source_item_id: item.source_item_id ?? null,
        name: item.name ?? null,
        brand: item.brand ?? null,
        category: item.category ?? null,
        model: item.model ?? item.name ?? null,
        color: item.color ?? null,
        canonical_family: family,
        price: null,
        price_pix: null,
        local_stock_confirmed: false,
        supplier_presence: true,
        requested_size_confirmed: item.requested_size_confirmed === true,
        confirmed_unavailable: item.confirmed_unavailable === true,
        photo_ref: item.photo_ref ?? null,
        product_link: item.product_link ?? null,
        confidence: Number.isFinite(Number(item.confidence))
          ? Number(item.confidence)
          : null,
        match_type: matchType,
      }
    })
    .filter(Boolean)
}

export async function buildProductUniverseRuntime(input = {}, deps = {}) {
  const familyRules = Array.isArray(deps.familyRules)
    ? deps.familyRules
    : DEFAULT_FAMILY_RULES

  const primeResult = await fetchPrimeShadowCatalog({
    supabaseConfig: deps.supabaseConfig,
    fetchImpl: deps.fetchImpl,
    timeoutMs: deps.timeoutMs,
    limit: deps.primeLimit,
  })

  const primeEvidence = primeResult.ok
    ? selectPrimeEvidence(primeResult.products, input, {
        familyRules,
        maxCandidates: deps.maxPrimeCandidates,
      })
    : []

  const supplierResult = deps.supplierSupabaseConfig
    ? await fetchSupplierShadowProducts({
        supabaseConfig: deps.supplierSupabaseConfig,
        fetchImpl: deps.supplierFetchImpl || deps.fetchImpl,
        timeoutMs: deps.supplierTimeoutMs || deps.timeoutMs,
        limit: deps.supplierLimit,
        rpcToken: deps.supplierRpcToken || null,
      })
    : {
        ok: false,
        rows: [],
        evidence: [],
        error_code: 'SUPPLIER_SHADOW_DISABLED',
      }

  const realSupplierEvidence = supplierResult.ok
    ? selectSupplierFixtureEvidence(
        supplierResult.evidence,
        input,
        { familyRules }
      )
    : []

  const fixtureEvidence = selectSupplierFixtureEvidence(
    deps.supplierFixtures || [],
    input,
    { familyRules }
  )

  const seenSupplierEvidence = new Set()
  const supplierEvidence = [...realSupplierEvidence, ...fixtureEvidence]
    .filter((item) => {
      const key = [
        item.source,
        item.source_item_id || '',
        item.canonical_family || '',
        item.name || '',
        item.color || '',
      ].join('|')
      if (seenSupplierEvidence.has(key)) return false
      seenSupplierEvidence.add(key)
      return true
    })

  const decision = buildProductUniverseDecision({
    query: input.query,
    visual: input.visual || {},
    requested: input.requested || {},
    family_rules: familyRules,
    pricing_rules: Array.isArray(deps.pricingRules) ? deps.pricingRules : [],
    policy: {
      offer_catalog_sizes: true,
    },
    evidence: [...primeEvidence, ...supplierEvidence],
  })

  return {
    ok: true,
    runtime_version: PRODUCT_UNIVERSE_RUNTIME_VERSION,
    mode: 'LAB_READ_ONLY_CANDIDATE',
    source_status: {
      PRIME: {
        ok: primeResult.ok,
        source: 'shadow_products',
        rows_read: primeResult.products.length,
        candidates: primeEvidence.length,
        error_code: primeResult.error_code || null,
      },
      VIVIAN: {
        mode: deps.supplierSupabaseConfig
          ? (deps.supplierRpcToken ? 'REAL_SHADOW_RPC' : 'REAL_SHADOW')
          : 'FIXTURE_ONLY',
        source_ok: supplierResult.ok,
        rows_read: supplierResult.rows?.filter((x) => x.supplier_key === 'VIVIAN').length || 0,
        candidates: supplierEvidence.filter((x) => x.source === 'VIVIAN').length,
        error_code: supplierResult.error_code || null,
      },
      MIA: {
        mode: deps.supplierSupabaseConfig
          ? (deps.supplierRpcToken ? 'REAL_SHADOW_RPC' : 'REAL_SHADOW')
          : 'FIXTURE_ONLY',
        source_ok: supplierResult.ok,
        rows_read: supplierResult.rows?.filter((x) => x.supplier_key === 'MIA').length || 0,
        candidates: supplierEvidence.filter((x) => x.source === 'MIA').length,
        error_code: supplierResult.error_code || null,
      },
    },
    decision,
    side_effects: {
      supabase_write: false,
      gptmaker_call: false,
      customer_message: false,
      jev_call: false,
    },
  }
}
