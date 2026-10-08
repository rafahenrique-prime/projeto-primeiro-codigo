import { timingSafeEqual } from 'node:crypto'
import { runSupplierCatalogCycle } from './_supplierCatalogCycle.js'

export function isSupplierCatalogCycleEnabled(env = process.env) {
  return String(env.SUPPLIER_CATALOG_CYCLE_ENABLED || '')
    .trim()
    .toLowerCase() === 'true'
}

function headerValue(req, name) {
  const direct = req?.headers?.[name]
  if (direct != null) return String(direct)
  const lower = req?.headers?.[name.toLowerCase()]
  if (lower != null) return String(lower)
  if (typeof req?.getHeader === 'function') {
    const value = req.getHeader(name)
    if (value != null) return String(value)
  }
  return ''
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''))
  const right = Buffer.from(String(b || ''))
  if (left.length !== right.length) return false
  if (left.length === 0) return false
  return timingSafeEqual(left, right)
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

export async function handleSupplierCatalogCycleRequest(req, res, deps = {}) {
  const env = deps.env || process.env

  if (!isSupplierCatalogCycleEnabled(env)) {
    return sendJson(res, 404, {
      ok: false,
      error: 'SUPPLIER_CATALOG_CYCLE_DISABLED',
    })
  }

  if (String(req?.method || 'GET').toUpperCase() !== 'POST') {
    return sendJson(res, 405, {
      ok: false,
      error: 'METHOD_NOT_ALLOWED',
    })
  }

  const expectedToken =
    deps.cycleToken ||
    String(env.SUPPLIER_CATALOG_CYCLE_TOKEN || '').trim()

  const receivedToken =
    headerValue(req, 'x-prime-cycle-token') ||
    headerValue(req, 'X-Prime-Cycle-Token')

  if (!safeEqual(receivedToken, expectedToken)) {
    return sendJson(res, 403, {
      ok: false,
      error: 'SUPPLIER_CYCLE_TOKEN_INVALID',
    })
  }

  const body = parseBody(req)
  if (body == null) {
    return sendJson(res, 400, {
      ok: false,
      error: 'INVALID_JSON_BODY',
    })
  }

  if (body.confirm !== 'SUPPLIER_CATALOG_CYCLE_LAB') {
    return sendJson(res, 400, {
      ok: false,
      error: 'SUPPLIER_CYCLE_CONFIRMATION_REQUIRED',
    })
  }

  const supabaseUrl =
    deps.supabaseUrl ||
    env.SUPABASE_URL ||
    env.VITE_SUPABASE_URL

  const publicKey =
    deps.publicKey ||
    env.VITE_SUPABASE_KEY

  const scannerToken =
    deps.scannerToken ||
    env.SUPPLIER_DRIVE_SCANNER_TOKEN

  const workerToken =
    deps.workerToken ||
    env.SUPPLIER_VISION_WORKER_TOKEN

  if (!supabaseUrl || !publicKey || !scannerToken || !workerToken || !expectedToken) {
    return sendJson(res, 503, {
      ok: false,
      error: 'SUPPLIER_CYCLE_CONFIG_MISSING',
    })
  }

  const result = await runSupplierCatalogCycle({
    cycle_key: body.cycle_key,
    trigger: body.trigger || 'supabase_cron',
    max_changes: body.max_changes,
    scope_keys: body.scope_keys,
    drive_file_ids: body.drive_file_ids,
    reuse_gate_ledger: body.reuse_gate_ledger,
  }, {
    supabaseUrl,
    publicKey,
    scannerToken,
    workerToken,
    cycleToken: expectedToken,
    fetchImpl: deps.fetchImpl,
    rpcTimeoutMs: deps.rpcTimeoutMs,
    driveTimeoutMs: deps.driveTimeoutMs,
    fingerprintTimeoutMs: deps.fingerprintTimeoutMs,
    visionTimeoutMs: deps.visionTimeoutMs,
    visionProxyUrl: deps.visionProxyUrl,
    visionModel: deps.visionModel,
    visionProxySecret:
      deps.visionProxySecret || env.LAB_PRODUCT_UNIVERSE_API_SECRET,
    startFn: deps.startFn,
    finishFn: deps.finishFn,
    scannerFn: deps.scannerFn,
    visionFn: deps.visionFn,
  })

  const status = result.ok || result.duplicate ? 200 : 502
  return sendJson(res, status, result)
}

export default async function handler(req, res) {
  return handleSupplierCatalogCycleRequest(req, res)
}
