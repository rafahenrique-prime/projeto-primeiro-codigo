import { analyzeSupplierImage } from './_supplierVisionWorker.js'
import {
  GABY_OFFICIAL_AGENT_ID,
  LAB_HEADER_VALUE,
  handleProductUniverseRequest,
  labApiSecret,
} from './gaby-lab-product-universe-v1.js'

export const SUPPLIER_HOMOLOGATION_HARNESS_VERSION = '1.0.0'
export const SUPPLIER_HOMOLOGATION_MAX_SAMPLES = 6

function clean(value) {
  return String(value ?? '').trim()
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

function normalizeMode(value) {
  const mode = clean(value).toLowerCase() || 'vision'
  return ['vision', 'product_universe', 'full'].includes(mode)
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
  const wantsProductUniverse =
    mode === 'product_universe' || mode === 'full'

  const expected = input.expected || {}
  const samples = Array.isArray(input.samples) ? input.samples : []
  const productUniverse = input.product_universe || {}

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
        visionProxyUrl: deps.visionProxyUrl,
        visionModel: deps.visionModel,
        fetchImpl: deps.fetchImpl,
        timeoutMs: deps.visionTimeoutMs,
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
    ...(wantsProductUniverse ? [productUniverseResult?.pass === true] : []),
  ]

  return {
    ok: true,
    harness_version: SUPPLIER_HOMOLOGATION_HARNESS_VERSION,
    mode,
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
