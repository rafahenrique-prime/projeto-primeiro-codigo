import {
  analyzeSupplierImage,
  DEFAULT_VISION_MODEL,
  DEFAULT_VISION_PROXY,
  fetchDriveImage,
  parseVisionJson,
} from './_supplierVisionWorker.js'
import {
  GABY_OFFICIAL_AGENT_ID,
  LAB_HEADER_VALUE,
  handleProductUniverseRequest,
  labApiSecret,
} from './gaby-lab-product-universe-v1.js'

export const SUPPLIER_HOMOLOGATION_HARNESS_VERSION = '1.3.1'
export const SUPPLIER_HOMOLOGATION_MAX_SAMPLES = 6
export const SUPPLIER_HOMOLOGATION_ALLOWED_VISION_MODELS = [
  'google/gemini-2.5-flash-lite',
  'google/gemini-2.5-flash',
]

export const SUPPLIER_HOMOLOGATION_DEFAULT_VISION_PROXY =
  'https://ignite-prime-render-lab-api.onrender.com/api/supplier-harness-ocr-proxy'

export const SUPPLIER_HOMOLOGATION_VISION_PROXY_ENV =
  'SUPPLIER_HOMOLOGATION_HARNESS_VISION_PROXY_URL'


function clean(value) {
  return String(value ?? '').trim()
}

export function resolveSupplierHomologationVisionProxy(env = process.env) {
  return (
    clean(env?.[SUPPLIER_HOMOLOGATION_VISION_PROXY_ENV]) ||
    SUPPLIER_HOMOLOGATION_DEFAULT_VISION_PROXY
  )
}

function headerValue(req, name) {
  const direct = req?.headers?.[name]
  if (direct != null) return String(direct)
  const lower = req?.headers?.[name.toLowerCase()]
  if (lower != null) return String(lower)
  if (typeof req?.getHeader === 'function') {
    const v = req.getHeader(name)
    if (v != null) return String(v)
  }
  return ''
}

function parseBody(req) {
  if (req?.body && typeof req.body === 'object') return req.body
  if (typeof req?.body === 'string' && req.body.trim()) {
    try { return JSON.parse(req.body) } catch { return null }
  }
  return {}
}

function sendJson(res, status, payload) {
  if (typeof res?.setHeader === 'function') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
  }
  if (typeof res?.status === 'function') {
    return res.status(status).json(payload)
  }
  res.statusCode = status
  if (typeof res?.end === 'function') {
    return res.end(JSON.stringify(payload))
  }
  return payload
}

function normalizeVisionModel(value) {
  const model = clean(value)
  if (!model) return null
  return SUPPLIER_HOMOLOGATION_ALLOWED_VISION_MODELS.includes(model)
    ? model
    : false
}

function normalizeMode(value) {
  const mode = clean(value).toLowerCase() || 'vision'
  return ['vision', 'vision_compare', 'product_universe', 'full'].includes(mode)
    ? mode
    : null
}

function normalizedSample(sample = {}, expected = {}) {
  return {
    label: clean(sample.label) || null,
    supplier_key: clean(sample.supplier_key),
    drive_file_id: clean(sample.drive_file_id),
    brand: clean(sample.brand || expected.brand),
    canonical_family: clean(
      sample.canonical_family || expected.canonical_family
    ),
    detected_model: clean(sample.model || expected.model),
    category: clean(sample.category || expected.category),
  }
}

function normalizeKey(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizedCompareCandidates(compare = {}) {
  const seen = new Set()
  const rows = []

  for (const item of Array.isArray(compare.candidates) ? compare.candidates : []) {
    const canonicalFamily = clean(item?.canonical_family)
    const model = clean(item?.model)
    if (!canonicalFamily || !model) continue

    const key = normalizeKey(canonicalFamily)
    if (!key || seen.has(key)) continue
    seen.add(key)

    rows.push({
      canonical_family: canonicalFamily,
      model,
    })
  }

  return rows
}

export function buildKnownPairVisionGuidance(compare = {}) {
  const candidates = normalizedCompareCandidates(compare)
  const keys = new Set(
    candidates.map(item => normalizeKey(item.canonical_family))
  )

  const isCourtPair =
    keys.has('NIKE_COURT_BOROUGH') &&
    keys.has('NIKE_COURT_VISION') &&
    keys.size === 2

  if (!isCourtPair) return []

  return [
    'precision_protocol: NIKE_COURT_BOROUGH_VS_COURT_VISION_V2',
    'Antes de escolher, inspecione separadamente: (1) proporção e volume da biqueira, (2) desenho dos painéis laterais/eyestay, (3) integração do Swoosh com os painéis, (4) geometria do colar e calcanhar, (5) proporção da lateral da sola.',
    'Sinais genéricos NÃO são suficientes sozinhos: cor, logo Nike, couro/sintético, perfurações e cupsole aparecem nas duas famílias.',
    'Court Borough: procure como tendência uma biqueira visualmente mais espaçosa/volumosa e uma construção geral mais encorpada/robusta. Em versões infantis, atacadores elásticos, tira aderente ou pull tab podem reforçar Borough, mas a ausência deles não elimina Borough.',
    'Court Vision: procure como tendência uma silhueta mais limpa e de perfil baixo, com leitura visual mais enxuta de sneaker lifestyle inspirado no basquete dos anos 80.',
    'Não decida por um único sinal fraco. Para confidence >= 0.80, exija pelo menos 2 sinais estruturais independentes coerentes e nenhuma contradição forte. Caso contrário, use canonical_family="UNKNOWN".',
    'Faça a decisão pela geometria visível desta foto; não use cor ou memória de colorway como atalho.',
  ]
}

export function visionCompareOutputBudget(compare = {}) {
  return buildKnownPairVisionGuidance(compare).length > 0 ? 650 : 300
}

export function visionCompareTimeoutBudget(compare = {}, requestedTimeoutMs) {
  const requested = Number(requestedTimeoutMs)
  if (Number.isFinite(requested) && requested > 0) return requested
  return buildKnownPairVisionGuidance(compare).length > 0 ? 20000 : undefined
}

function visionUsage(json = null) {
  return {
    input_tokens: json?.usage?.prompt_tokens ?? null,
    output_tokens: json?.usage?.completion_tokens ?? null,
    total_tokens: json?.usage?.total_tokens ?? null,
    cost_usd:
      typeof json?.usage?.cost === 'number'
        ? json.usage.cost
        : null,
  }
}

function visionCompareInputError(samples, compare = {}) {
  if (!Array.isArray(samples) || samples.length < 1) {
    return 'HARNESS_SAMPLES_REQUIRED'
  }
  if (samples.length > SUPPLIER_HOMOLOGATION_MAX_SAMPLES) {
    return 'HARNESS_SAMPLE_LIMIT_EXCEEDED'
  }

  const candidates = normalizedCompareCandidates(compare)
  if (candidates.length < 2) return 'HARNESS_COMPARE_CANDIDATES_REQUIRED'
  if (candidates.length > 6) return 'HARNESS_COMPARE_CANDIDATE_LIMIT_EXCEEDED'

  const allowed = new Set(
    candidates.map(item => normalizeKey(item.canonical_family))
  )

  for (const sample of samples) {
    const supplier = clean(sample?.supplier_key)
    if (!['VIVIAN', 'MIA'].includes(supplier)) {
      return 'HARNESS_SUPPLIER_INVALID'
    }
    if (!clean(sample?.drive_file_id)) {
      return 'HARNESS_DRIVE_FILE_ID_REQUIRED'
    }

    const expectedFamily = normalizeKey(sample?.expected_family)
    if (!expectedFamily || !allowed.has(expectedFamily)) {
      return 'HARNESS_COMPARE_EXPECTED_FAMILY_INVALID'
    }
  }

  return null
}

export function buildVisionComparePrompt(compare = {}) {
  const candidates = normalizedCompareCandidates(compare)
  const options = candidates
    .map((item, index) =>
      `${index + 1}. canonical_family=${item.canonical_family}; model=${item.model}`
    )
    .join('\n')
  const precisionGuidance = buildKnownPairVisionGuidance(compare)

  return [
    'Você analisa uma foto de produto de moda/calçado para um catálogo interno.',
    'Faça uma comparação CEGA entre as opções abaixo.',
    'Nenhuma opção é a resposta esperada; escolha somente pelo que aparece visualmente na foto.',
    'Se a imagem não permitir diferenciar com segurança, responda canonical_family como "UNKNOWN".',
    'Responda SOMENTE JSON válido, sem markdown.',
    '',
    `brand_hint: ${clean(compare.brand) || 'unknown'}`,
    `category_hint: ${clean(compare.category) || 'unknown'}`,
    'candidate_options:',
    options,
    ...(precisionGuidance.length ? ['', 'precision_guidance:', ...precisionGuidance] : []),
    '',
    'Formato obrigatório:',
    '{"observations":{"toe":"...","side_panels":"...","swoosh":"...","collar_heel":"...","sole":"..."},"evidence_for":"...","evidence_against":"...","brand":"...","canonical_family":"...","model":"...","category":"...","color":"...","confidence":0.00}',
    '',
    'canonical_family: use exatamente um canonical_family da lista ou "UNKNOWN".',
    'model: use o model correspondente à opção escolhida ou "UNKNOWN".',
    'observations: descreva apenas o que realmente está visível, sem inventar detalhes ocultos.',
    'evidence_for: cite de forma curta os sinais visuais que sustentam a escolha.',
    'evidence_against: cite qualquer sinal que contradiga a escolha; se houver contradição forte, reduza a confiança.',
    'color: descrição curta em português; cor principal primeiro.',
    'confidence: número de 0 a 1 sobre a escolha entre as opções.',
  ].join('\n')
}

async function postVisionCompare(
  url,
  body,
  fetchImpl,
  timeoutMs,
  visionProxySecret = ''
) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(visionProxySecret
          ? { 'x-prime-lab-secret': visionProxySecret }
          : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timer)
    const json = await res.json().catch(() => null)
    return { ok: Boolean(res.ok), status: Number(res.status) || null, json }
  } catch (error) {
    clearTimeout(timer)
    return {
      ok: false,
      status: null,
      json: null,
      error_code:
        error?.name === 'AbortError' ? 'VISION_COMPARE_TIMEOUT' : 'VISION_COMPARE_NETWORK_ERROR',
    }
  }
}

export async function analyzeSupplierImageBlindCompare(
  sample = {},
  compare = {},
  {
    visionProxyUrl = DEFAULT_VISION_PROXY,
    visionModel = DEFAULT_VISION_MODEL,
    fetchImpl = fetch,
    timeoutMs = 12000,
    visionProxySecret = '',
  } = {}
) {
  const image = await fetchDriveImage(clean(sample.drive_file_id), {
    fetchImpl,
    timeoutMs: Math.min(timeoutMs, 8000),
  })

  if (!image.ok) {
    return {
      ok: false,
      error_code: image.error_code,
      chosen_family: null,
      confidence: null,
    }
  }

  const result = await postVisionCompare(
    visionProxyUrl,
    {
      model: visionModel,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: buildVisionComparePrompt(compare) },
          { type: 'image_url', image_url: { url: image.data_url } },
        ],
      }],
      max_tokens: visionCompareOutputBudget(compare),
      temperature: 0.1,
    },
    fetchImpl,
    timeoutMs,
    visionProxySecret,
  )

  if (!result.ok) {
    return {
      ok: false,
      error_code: result.error_code || 'VISION_COMPARE_PROVIDER_ERROR',
      chosen_family: null,
      confidence: null,
      provider_status: result.status ?? null,
      usage: visionUsage(result.json),
    }
  }

  const parsed = parseVisionJson(result.json?.choices?.[0]?.message?.content)
  if (!parsed) {
    return {
      ok: false,
      error_code: 'VISION_COMPARE_INVALID_JSON',
      chosen_family: null,
      confidence: null,
      provider_status: result.status ?? null,
      usage: visionUsage(result.json),
    }
  }

  const candidates = normalizedCompareCandidates(compare)
  const allowed = new Map(
    candidates.map(item => [normalizeKey(item.canonical_family), item])
  )
  const chosenKey = normalizeKey(parsed.canonical_family)
  const chosen = allowed.get(chosenKey) || null
  const confidenceRaw = Number(parsed.confidence)
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.max(0, Math.min(confidenceRaw, 1))
    : null

  return {
    ok: true,
    parsed,
    chosen_family: chosen?.canonical_family || null,
    chosen_model: chosen?.model || null,
    confidence,
    color: clean(parsed.color) || null,
    error_code:
      !chosen
        ? 'VISION_COMPARE_UNKNOWN'
        : confidence == null || confidence < 0.80
          ? 'VISION_COMPARE_LOW_CONFIDENCE'
          : null,
    provider_status: result.status ?? null,
    usage: visionUsage(result.json),
    image: {
      content_type: image.content_type,
      bytes: image.bytes,
    },
  }
}

function visionInputError(samples, expected) {
  if (!Array.isArray(samples) || samples.length < 1) {
    return 'HARNESS_SAMPLES_REQUIRED'
  }
  if (samples.length > SUPPLIER_HOMOLOGATION_MAX_SAMPLES) {
    return 'HARNESS_SAMPLE_LIMIT_EXCEEDED'
  }

  const rows = samples.map(sample => normalizedSample(sample, expected))
  for (const row of rows) {
    if (!row.supplier_key || !['VIVIAN', 'MIA'].includes(row.supplier_key)) {
      return 'HARNESS_SUPPLIER_INVALID'
    }
    if (!row.drive_file_id) return 'HARNESS_DRIVE_FILE_ID_REQUIRED'
    if (!row.canonical_family) return 'HARNESS_CANONICAL_FAMILY_REQUIRED'
    if (!row.brand) return 'HARNESS_BRAND_REQUIRED'
  }

  return null
}

function productUniverseInputError(config = {}) {
  const requested = config.requested || {}
  const visual = config.visual || {}
  const query = clean(config.query)

  if (
    !query &&
    !clean(requested.brand) &&
    !clean(requested.model) &&
    !clean(visual.brand) &&
    !clean(visual.model)
  ) {
    return 'HARNESS_PRODUCT_CONTEXT_REQUIRED'
  }

  return null
}

function sumCost(results) {
  return results.reduce((sum, item) => {
    const n = Number(item?.usage?.cost_usd)
    return Number.isFinite(n) ? sum + n : sum
  }, 0)
}

function checkProductUniverseExpectations(payload, expected = {}) {
  const decision = payload?.decision || {}
  const checks = []

  const add = (name, actual, wanted) => {
    if (wanted == null || wanted === '') return
    checks.push({
      name,
      expected: wanted,
      actual: actual ?? null,
      pass: actual === wanted,
    })
  }

  add('canonical_family', decision.canonical_family, expected.canonical_family)
  add('action', decision.commercial?.action, expected.action)
  add('product_state', decision.commercial?.product_state, expected.product_state)
  add('price_state', decision.price?.state, expected.price_state)
  add('size_state', decision.size?.state, expected.size_state)
  add('best_source', decision.best_match?.source, expected.best_source)
  add('best_match_type', decision.best_match?.match_type, expected.best_match_type)

  if (expected.min_supplier_count != null) {
    const actual = Number(decision.coverage?.supplier_count ?? 0)
    const wanted = Number(expected.min_supplier_count)
    checks.push({
      name: 'min_supplier_count',
      expected: wanted,
      actual,
      pass: Number.isFinite(wanted) && actual >= wanted,
    })
  }

  if (expected.price_amount_null === true) {
    const actual = decision.price?.amount ?? null
    checks.push({
      name: 'price_amount_null',
      expected: true,
      actual: actual === null,
      pass: actual === null,
    })
  }

  return {
    pass: checks.every(item => item.pass),
    checks,
  }
}

async function runProductUniverseViaHandler(config, {
  env = process.env,
  secret = labApiSecret(env),
  deps = {},
} = {}) {
  const state = {
    status: null,
    payload: null,
    headers: {},
  }

  const res = {
    setHeader(name, value) {
      state.headers[name] = value
    },
    status(code) {
      state.status = code
      return {
        json(payload) {
          state.payload = payload
          return payload
        },
      }
    },
  }

  await handleProductUniverseRequest({
    method: 'POST',
    headers: {
      'x-prime-lab': LAB_HEADER_VALUE,
      'x-prime-lab-secret': secret,
    },
    body: {
      query: config.query,
      visual: config.visual,
      requested: config.requested,
    },
  }, res, {
    ...deps,
    env,
    labApiSecret: secret,
  })

  return {
    ok: state.status === 200 && state.payload?.ok === true,
    http_status: state.status,
    payload: state.payload,
  }
}

export async function runSupplierHomologationHarness(input = {}, deps = {}) {
  const mode = normalizeMode(input.mode)
  if (!mode) {
    return {
      ok: false,
      error: 'HARNESS_MODE_INVALID',
      harness_version: SUPPLIER_HOMOLOGATION_HARNESS_VERSION,
    }
  }

  const wantsVision = mode === 'vision' || mode === 'full'
  const wantsVisionCompare = mode === 'vision_compare'
  const wantsProductUniverse =
    mode === 'product_universe' || mode === 'full'

  const expected = input.expected || {}
  const compare = input.compare || {}
  const samples = Array.isArray(input.samples) ? input.samples : []
  const productUniverse = input.product_universe || {}
  const requestedVisionModel = normalizeVisionModel(input.vision_model)

  if (requestedVisionModel === false) {
    return {
      ok: false,
      error: 'HARNESS_VISION_MODEL_INVALID',
      harness_version: SUPPLIER_HOMOLOGATION_HARNESS_VERSION,
      allowed_vision_models: SUPPLIER_HOMOLOGATION_ALLOWED_VISION_MODELS,
    }
  }

  const selectedVisionModel = requestedVisionModel || deps.visionModel

  if (wantsVision) {
    const error = visionInputError(samples, expected)
    if (error) {
      return {
        ok: false,
        error,
        harness_version: SUPPLIER_HOMOLOGATION_HARNESS_VERSION,
      }
    }
  }

  if (wantsVisionCompare) {
    const error = visionCompareInputError(samples, compare)
    if (error) {
      return {
        ok: false,
        error,
        harness_version: SUPPLIER_HOMOLOGATION_HARNESS_VERSION,
      }
    }
  }

  if (wantsProductUniverse) {
    const error = productUniverseInputError(productUniverse)
    if (error) {
      return {
        ok: false,
        error,
        harness_version: SUPPLIER_HOMOLOGATION_HARNESS_VERSION,
      }
    }
  }

  const analyzeFn = deps.analyzeFn || analyzeSupplierImage
  const compareAnalyzeFn =
    deps.compareAnalyzeFn || analyzeSupplierImageBlindCompare
  const productUniverseFn =
    deps.productUniverseFn ||
    (config => runProductUniverseViaHandler(config, {
      env: deps.env || process.env,
      secret: deps.labApiSecret || labApiSecret(deps.env || process.env),
      deps: deps.productUniverseDeps || {},
    }))

  let vision = null
  if (wantsVision) {
    const results = []
    for (let index = 0; index < samples.length; index += 1) {
      const row = normalizedSample(samples[index], expected)
      const startedAt = Date.now()
      const out = await analyzeFn(row, {
        visionProxyUrl:
          deps.visionProxyUrl ||
          resolveSupplierHomologationVisionProxy(deps.env || process.env),
        visionModel: selectedVisionModel,
        fetchImpl: deps.fetchImpl,
        timeoutMs: deps.visionTimeoutMs,
        visionProxySecret:
          deps.visionProxySecret ||
          labApiSecret(deps.env || process.env),
      })

      results.push({
        index,
        label: row.label || `sample-${index + 1}`,
        supplier: row.supplier_key,
        drive_file_id: row.drive_file_id,
        ok: out?.ok === true,
        status: out?.validation?.status || null,
        error_code: out?.validation?.error_code || out?.error_code || null,
        parsed: out?.parsed || null,
        validation: out?.validation || null,
        usage: out?.usage || null,
        image: out?.image || null,
        duration_ms: Date.now() - startedAt,
      })
    }

    const ready = results.filter(item => item.status === 'ready').length
    const review = results.filter(item => item.status === 'review').length
    const errors = results.filter(item => item.ok !== true).length

    vision = {
      total: results.length,
      ready,
      review,
      errors,
      cost_usd: Number(sumCost(results).toFixed(8)),
      pass:
        results.length > 0 &&
        ready === results.length &&
        review === 0 &&
        errors === 0,
      results,
    }
  }

  let comparison = null
  if (wantsVisionCompare) {
    const results = []
    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index]
      const startedAt = Date.now()
      const out = await compareAnalyzeFn(sample, compare, {
        visionProxyUrl:
          deps.visionProxyUrl ||
          resolveSupplierHomologationVisionProxy(deps.env || process.env),
        visionModel: selectedVisionModel,
        fetchImpl: deps.fetchImpl,
        timeoutMs: visionCompareTimeoutBudget(compare, deps.visionTimeoutMs),
        visionProxySecret:
          deps.visionProxySecret ||
          labApiSecret(deps.env || process.env),
      })

      const expectedFamily = clean(sample.expected_family)
      const match =
        out?.ok === true &&
        out?.error_code == null &&
        normalizeKey(out?.chosen_family) === normalizeKey(expectedFamily)

      results.push({
        index,
        label: clean(sample.label) || `sample-${index + 1}`,
        supplier: clean(sample.supplier_key),
        drive_file_id: clean(sample.drive_file_id),
        expected_family: expectedFamily || null,
        chosen_family: out?.chosen_family || null,
        chosen_model: out?.chosen_model || null,
        confidence: out?.confidence ?? null,
        color: out?.color || null,
        match,
        status: match ? 'ready' : 'review',
        error_code:
          match
            ? null
            : out?.error_code || 'VISION_COMPARE_MISMATCH',
        provider_status: out?.provider_status ?? null,
        parsed: out?.parsed || null,
        usage: out?.usage || null,
        image: out?.image || null,
        duration_ms: Date.now() - startedAt,
      })
    }

    const matched = results.filter(item => item.match === true).length
    const review = results.filter(item => item.status === 'review').length
    const errors = results.filter(item =>
      item.error_code &&
      !['VISION_COMPARE_MISMATCH', 'VISION_COMPARE_LOW_CONFIDENCE', 'VISION_COMPARE_UNKNOWN']
        .includes(item.error_code)
    ).length

    comparison = {
      total: results.length,
      matched,
      review,
      errors,
      cost_usd: Number(sumCost(results).toFixed(8)),
      pass:
        results.length > 0 &&
        matched === results.length &&
        review === 0 &&
        errors === 0,
      candidates: normalizedCompareCandidates(compare),
      results,
    }
  }

  let productUniverseResult = null
  if (wantsProductUniverse) {
    const raw = await productUniverseFn(productUniverse)
    const expectation = checkProductUniverseExpectations(
      raw?.payload,
      productUniverse.expect || {}
    )

    productUniverseResult = {
      ok: raw?.ok === true,
      http_status: raw?.http_status ?? null,
      pass: raw?.ok === true && expectation.pass,
      checks: expectation.checks,
      decision: raw?.payload?.decision
        ? {
            canonical_family: raw.payload.decision.canonical_family ?? null,
            action: raw.payload.decision.commercial?.action ?? null,
            product_state:
              raw.payload.decision.commercial?.product_state ?? null,
            best_source: raw.payload.decision.best_match?.source ?? null,
            best_color: raw.payload.decision.best_match?.color ?? null,
            best_match_type:
              raw.payload.decision.best_match?.match_type ?? null,
            supplier_count:
              raw.payload.decision.coverage?.supplier_count ?? null,
            price_state: raw.payload.decision.price?.state ?? null,
            price_amount: raw.payload.decision.price?.amount ?? null,
            size_state: raw.payload.decision.size?.state ?? null,
          }
        : null,
      source_status: raw?.payload?.source_status || null,
      error:
        raw?.payload?.error ||
        raw?.payload?.error_code ||
        (raw?.ok === true ? null : 'PRODUCT_UNIVERSE_HARNESS_FAILED'),
    }
  }

  const passes = [
    ...(wantsVision ? [vision?.pass === true] : []),
    ...(wantsVisionCompare ? [comparison?.pass === true] : []),
    ...(wantsProductUniverse ? [productUniverseResult?.pass === true] : []),
  ]

  return {
    ok: true,
    harness_version: SUPPLIER_HOMOLOGATION_HARNESS_VERSION,
    mode,
    vision_model: selectedVisionModel || DEFAULT_VISION_MODEL,
    verdict: passes.every(Boolean) ? 'PASS' : 'REVIEW',
    side_effects: {
      supplier_shadow_write: false,
      catalog_prime_write: false,
      gptmaker_call: false,
      customer_message: false,
      gaby_official_call: false,
      cron_activation: false,
    },
    vision,
    comparison,
    product_universe: productUniverseResult,
  }
}

export async function handleSupplierHomologationHarnessRequest(
  req,
  res,
  deps = {}
) {
  const env = deps.env || process.env

  if (String(req?.method || 'GET').toUpperCase() !== 'POST') {
    return sendJson(res, 405, {
      ok: false,
      error: 'METHOD_NOT_ALLOWED',
    })
  }

  const labHeader =
    headerValue(req, 'x-prime-lab') ||
    headerValue(req, 'X-Prime-Lab')

  if (labHeader !== LAB_HEADER_VALUE) {
    return sendJson(res, 403, {
      ok: false,
      error: 'LAB_HEADER_REQUIRED',
    })
  }

  const expectedSecret = deps.labApiSecret || labApiSecret(env)
  if (!expectedSecret) {
    return sendJson(res, 503, {
      ok: false,
      error: 'LAB_API_SECRET_MISSING',
    })
  }

  const receivedSecret =
    headerValue(req, 'x-prime-lab-secret') ||
    headerValue(req, 'X-Prime-Lab-Secret')

  if (receivedSecret !== expectedSecret) {
    return sendJson(res, 403, {
      ok: false,
      error: 'LAB_API_SECRET_INVALID',
    })
  }

  const body = parseBody(req)
  if (body == null) {
    return sendJson(res, 400, {
      ok: false,
      error: 'INVALID_JSON_BODY',
    })
  }

  const agentId = clean(body.agent_id || body.agentId)
  if (agentId === GABY_OFFICIAL_AGENT_ID) {
    return sendJson(res, 403, {
      ok: false,
      error: 'GABY_OFFICIAL_BLOCKED',
    })
  }

  const result = await runSupplierHomologationHarness(body, {
    ...deps,
    env,
    labApiSecret: expectedSecret,
  })

  const badInput = result?.ok === false &&
    String(result?.error || '').startsWith('HARNESS_')

  return sendJson(res, badInput ? 400 : 200, result)
}

export default async function handler(req, res) {
  return handleSupplierHomologationHarnessRequest(req, res)
}
