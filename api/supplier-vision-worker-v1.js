import { runSupplierVisionWorker } from './_supplierVisionWorker.js'
import { LAB_HEADER_VALUE, labApiSecret } from './gaby-lab-product-universe-v1.js'

export function isSupplierVisionWorkerEnabled(env = process.env) {
  return String(env.SUPPLIER_VISION_WORKER_ENABLED || '')
    .trim()
    .toLowerCase() === 'true'
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

export async function handleSupplierVisionWorkerRequest(req, res, deps = {}) {
  const env = deps.env || process.env

  if (!isSupplierVisionWorkerEnabled(env)) {
    return sendJson(res, 404, {
      ok: false,
      error: 'SUPPLIER_VISION_WORKER_DISABLED',
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

  const dryRun = body.dry_run !== false
  if (!dryRun && body.confirm !== 'VISION_WRITE_LAB') {
    return sendJson(res, 400, {
      ok: false,
      error: 'VISION_WRITE_CONFIRMATION_REQUIRED',
    })
  }

  const supabaseUrl =
    deps.supabaseUrl ||
    env.SUPABASE_URL ||
    env.VITE_SUPABASE_URL

  const publicKey =
    deps.publicKey ||
    env.VITE_SUPABASE_KEY

  const workerToken =
    deps.workerToken ||
    env.SUPPLIER_VISION_WORKER_TOKEN

  if (!supabaseUrl || !publicKey || !workerToken) {
    return sendJson(res, 503, {
      ok: false,
      error: 'SUPPLIER_VISION_WORKER_CONFIG_MISSING',
    })
  }

  const result = await runSupplierVisionWorker({
    limit: body.limit,
    dry_run: dryRun,
  }, {
    supabaseUrl,
    publicKey,
    workerToken,
    fetchImpl: deps.fetchImpl,
    rpcTimeoutMs: deps.rpcTimeoutMs,
    visionTimeoutMs: deps.visionTimeoutMs,
    visionProxyUrl: deps.visionProxyUrl,
    visionModel: deps.visionModel,
  })

  return sendJson(res, result.ok ? 200 : 502, result)
}

export default async function handler(req, res) {
  return handleSupplierVisionWorkerRequest(req, res)
}
