/**
 * LAB endpoint candidate — Product Universe V1
 *
 * Deliberately disabled by default.
 * No GPTMaker integration. No customer send. Read-only.
 */

import { buildProductUniverseRuntime } from './_productUniverseRuntime.js'

export const GABY_OFFICIAL_AGENT_ID = '3F78AF104664B0D1CB84D23672FCADC5'
export const LAB_HEADER_VALUE = 'GABY-LAB-COMERCIAL-V1'

export function isProductUniverseRuntimeEnabled(env = process.env) {
  return String(env.LAB_PRODUCT_UNIVERSE_RUNTIME_ENABLED || '')
    .trim()
    .toLowerCase() === 'true'
}

export function canUseSupplierFixtures(env = process.env) {
  const enabled = String(env.LAB_PRODUCT_UNIVERSE_FIXTURES_ENABLED || '')
    .trim()
    .toLowerCase() === 'true'
  const vercelEnv = String(env.VERCEL_ENV || '').trim().toLowerCase()
  return enabled && vercelEnv !== 'production'
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

function parseBody(req) {
  if (req?.body && typeof req.body === 'object') return req.body
  if (typeof req?.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body)
    } catch {
      return null
    }
  }
  return {}
}

export function supplierFixturesForRequest(body = {}, env = process.env) {
  if (!canUseSupplierFixtures(env)) return []
  return Array.isArray(body?.supplier_fixtures) ? body.supplier_fixtures : []
}

export async function handleProductUniverseRequest(
  req,
  res,
  deps = {}
) {
  const env = deps.env || process.env

  if (!isProductUniverseRuntimeEnabled(env)) {
    return sendJson(res, 404, {
      ok: false,
      error: 'LAB_RUNTIME_DISABLED',
    })
  }

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

  const body = parseBody(req)
  if (body == null) {
    return sendJson(res, 400, {
      ok: false,
      error: 'INVALID_JSON_BODY',
    })
  }

  const agentId = String(
    body.agent_id ||
    body.agentId ||
    ''
  ).trim()

  if (agentId === GABY_OFFICIAL_AGENT_ID) {
    return sendJson(res, 403, {
      ok: false,
      error: 'GABY_OFFICIAL_BLOCKED',
    })
  }

  const requested = body.requested || {}
  const visual = body.visual || {}
  const query = String(body.query || '').trim()

  if (
    !query &&
    !requested.model &&
    !requested.brand &&
    !visual.model &&
    !visual.brand
  ) {
    return sendJson(res, 400, {
      ok: false,
      error: 'PRODUCT_CONTEXT_REQUIRED',
    })
  }

  const supabaseUrl =
    deps.supabaseConfig?.baseUrl ||
    env.VITE_SUPABASE_URL
  const supabaseKey =
    deps.supabaseKey ||
    env.VITE_SUPABASE_KEY

  if (!supabaseUrl || !supabaseKey) {
    return sendJson(res, 503, {
      ok: false,
      error: 'LAB_SUPABASE_CONFIG_MISSING',
    })
  }

  const supplierFixtures =
    deps.supplierFixtures ??
    supplierFixturesForRequest(body, env)

  // Supplier Shadow é server-only: nunca usa VITE_SUPABASE_KEY.
  // Sem SUPABASE_SECRET_KEY, a fonte real simplesmente fica indisponível
  // e o runtime continua fail-closed usando apenas PRIME/fixtures LAB.
  const supplierSupabaseUrl =
    deps.supplierSupabaseConfig?.baseUrl ||
    env.SUPABASE_URL ||
    env.VITE_SUPABASE_URL

  const supplierSecretKey =
    deps.supplierSecretKey ||
    env.SUPABASE_SECRET_KEY

  const supplierSupabaseConfig =
    deps.supplierSupabaseConfig ||
    (
      supplierSupabaseUrl && supplierSecretKey
        ? {
            baseUrl: supplierSupabaseUrl,
            headers: {
              apikey: supplierSecretKey,
              Authorization: `Bearer ${supplierSecretKey}`,
              'Content-Type': 'application/json',
            },
          }
        : null
    )

  const result = await buildProductUniverseRuntime({
    query,
    visual,
    requested,
  }, {
    supabaseConfig: deps.supabaseConfig || {
      baseUrl: supabaseUrl,
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
    },
    fetchImpl: deps.fetchImpl,
    timeoutMs: deps.timeoutMs,
    primeLimit: deps.primeLimit,
    maxPrimeCandidates: deps.maxPrimeCandidates,
    supplierSupabaseConfig,
    supplierFetchImpl: deps.supplierFetchImpl,
    supplierTimeoutMs: deps.supplierTimeoutMs,
    supplierLimit: deps.supplierLimit,
    supplierFixtures,
    familyRules: deps.familyRules,
    pricingRules: deps.pricingRules,
  })

  return sendJson(res, 200, result)
}

export default async function handler(req, res) {
  return handleProductUniverseRequest(req, res)
}
