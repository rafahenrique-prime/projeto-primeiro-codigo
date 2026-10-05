import { scanSupplierDrive, SCANNER_SCOPES } from './_supplierDriveScanner.js'
import { LAB_HEADER_VALUE, labApiSecret } from './gaby-lab-product-universe-v1.js'

export function isSupplierDriveScannerEnabled(env = process.env) {
  return String(env.SUPPLIER_DRIVE_SCANNER_ENABLED || '')
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

export async function handleSupplierDriveScannerRequest(req, res, deps = {}) {
  const env = deps.env || process.env

  if (!isSupplierDriveScannerEnabled(env)) {
    return sendJson(res, 404, {
      ok: false,
      error: 'SUPPLIER_DRIVE_SCANNER_DISABLED',
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
  if (!dryRun && body.confirm !== 'DRIVE_SCAN_WRITE_LAB') {
    return sendJson(res, 400, {
      ok: false,
      error: 'DRIVE_SCAN_WRITE_CONFIRMATION_REQUIRED',
    })
  }

  const requestedScopes = Array.isArray(body.scope_keys)
    ? body.scope_keys.map(String)
    : null

  if (
    requestedScopes &&
    requestedScopes.some(
      key => !SCANNER_SCOPES.some(scope => scope.key === key)
    )
  ) {
    return sendJson(res, 400, {
      ok: false,
      error: 'INVALID_SCANNER_SCOPE',
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

  if (!supabaseUrl || !publicKey || !scannerToken) {
    return sendJson(res, 503, {
      ok: false,
      error: 'SUPPLIER_DRIVE_SCANNER_CONFIG_MISSING',
    })
  }

  const result = await scanSupplierDrive({
    dry_run: dryRun,
    max_changes: body.max_changes,
    scope_keys: requestedScopes,
  }, {
    supabaseUrl,
    publicKey,
    scannerToken,
    fetchImpl: deps.fetchImpl,
    driveTimeoutMs: deps.driveTimeoutMs,
    fingerprintTimeoutMs: deps.fingerprintTimeoutMs,
    timeoutMs: deps.rpcTimeoutMs,
  })

  return sendJson(res, result.ok ? 200 : 502, result)
}

export default async function handler(req, res) {
  return handleSupplierDriveScannerRequest(req, res)
}
