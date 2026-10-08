import { createHash, randomUUID } from 'node:crypto'

const GATE_LEDGER_STATUSES = new Set(['READY', 'REVIEW', 'ERROR'])
const MODEL_JSON_FIELDS = [
  'brand',
  'canonical_family',
  'model',
  'category',
  'color',
  'confidence',
  'family_match',
]
const VALIDATION_VALUE_FIELDS = [
  'brand',
  'canonical_family',
  'detected_model',
  'category',
  'visual_color',
  'vision_confidence',
]
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const SECRET_VALUE_PATTERN =
  /Bearer\s+[A-Za-z0-9._~+/-]+=*|\b(?:sk|gh[pousr]|xox[baprs]|github_pat)[_-][A-Za-z0-9._-]{16,}\b|\bAIza[0-9A-Za-z_-]{30,}\b|\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/gi

function clean(value) {
  return String(value ?? '').trim()
}

function safeText(value, maxLength = 2000) {
  if (typeof value !== 'string') return null
  return value
    .slice(0, maxLength)
    .replace(SECRET_VALUE_PATTERN, '[REDACTED]')
}

function safeScalar(value, maxLength = 2000) {
  if (typeof value === 'string') return safeText(value, maxLength)
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean' || value === null) return value
  return null
}

function safeErrorCode(value) {
  const code = clean(value).toUpperCase()
  return /^[A-Z0-9_:-]{1,100}$/.test(code) ? code : null
}

function normalizeStatus(value) {
  const status = clean(value).toUpperCase()
  return GATE_LEDGER_STATUSES.has(status) ? status : 'ERROR'
}

function normalizeConfidence(value) {
  if (value == null || value === '') return null
  const confidence = Number(value)
  return Number.isFinite(confidence) && confidence >= 0 && confidence <= 1
    ? confidence
    : null
}

function normalizeCost(value) {
  if (value == null || value === '') return null
  const cost = Number(value)
  return Number.isFinite(cost) && cost >= 0 ? cost : null
}

function safeProxyRoute(value) {
  const source = clean(value)
  if (!source) return null

  try {
    const url = new URL(source)
    if (
      url.protocol !== 'http:' ||
      url.hostname !== '127.0.0.1' ||
      !/^\d{1,5}$/.test(url.port) ||
      Number(url.port) < 1 ||
      Number(url.port) > 65535 ||
      url.pathname !== '/api/supplier-harness-ocr-proxy' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null
    }
    return url.origin + url.pathname
  } catch {
    return null
  }
}

export function createGateRunKey(value, uuid = randomUUID) {
  const supplied = clean(value)
  if (supplied) {
    const digest = createHash('sha256').update(supplied).digest('hex')
    return 'supplier-gate-' + digest
  }
  return 'supplier-gate-' + uuid()
}

export function sanitizeGateModelJson(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const safe = {}
  for (const key of MODEL_JSON_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue
    const item = safeScalar(value[key])
    if (item !== null || value[key] === null) safe[key] = item
  }
  return safe
}

function sanitizeValidationResult(validation, status, errorCode) {
  const values = validation?.values && typeof validation.values === 'object'
    ? validation.values
    : {}
  const safeValues = {}

  for (const key of VALIDATION_VALUE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(values, key)) continue
    const value = values[key]
    const safe = key === 'vision_confidence'
      ? normalizeConfidence(value)
      : safeScalar(value)
    if (safe !== null || value === null) safeValues[key] = safe
  }

  return {
    status,
    error_code: safeErrorCode(errorCode),
    values: safeValues,
  }
}

export function buildGateLedgerRecord({
  gate_run_key,
  scope_key,
  supplier,
  drive_file_id,
  canonical_family,
  brand,
  model,
  category,
  result = {},
  analyzed_at = new Date().toISOString(),
}) {
  const audit = result?.audit || {}
  const validation = result?.validation || {}
  const status = normalizeStatus(
    audit.validation_status || validation.status || result.status
  )
  const errorCode = safeErrorCode(
    audit.validation_error_code ||
    validation.error_code ||
    result.error_code
  )
  const imageSha = clean(audit.image_sha256).toLowerCase()
  const promptSha = clean(audit.prompt_sha256).toLowerCase()
  const executionSha = clean(audit.execution_identity?.sha256).toLowerCase()
  const analyzedAt = new Date(analyzed_at)

  return {
    gate_run_key: clean(gate_run_key),
    scope_key: clean(scope_key),
    supplier: clean(supplier).toUpperCase(),
    drive_file_id: clean(drive_file_id || audit.drive_file_id),
    image_sha256: SHA256_PATTERN.test(imageSha) ? imageSha : null,
    canonical_family: clean(canonical_family),
    brand: safeText(clean(brand), 200),
    model: safeText(clean(model), 300),
    category: safeText(clean(category), 200),
    vision_model: safeText(clean(audit.model_effective), 200),
    vision_proxy_route: safeProxyRoute(audit.proxy_route),
    prompt_version: safeText(clean(audit.prompt_version), 200),
    prompt_sha256: SHA256_PATTERN.test(promptSha) ? promptSha : null,
    execution_identity_sha256:
      SHA256_PATTERN.test(executionSha) ? executionSha : null,
    model_json: sanitizeGateModelJson(audit.model_json || result.parsed),
    validation_result: sanitizeValidationResult(
      validation,
      status,
      errorCode
    ),
    validation_status: status,
    validation_error_code: errorCode,
    confidence: normalizeConfidence(
      audit.confidence ?? validation.values?.vision_confidence
    ),
    cost_usd: normalizeCost(
      audit.cost_usd ?? result.usage?.cost_usd
    ),
    analyzed_at: Number.isNaN(analyzedAt.valueOf())
      ? new Date().toISOString()
      : analyzedAt.toISOString(),
  }
}

export function isReusableSupplierGateLedgerEntry(entry, expected) {
  if (!entry || !expected || String(entry.validation_status).toUpperCase() !== 'READY') {
    return false
  }

  const exactFields = [
    'supplier',
    'scope_key',
    'drive_file_id',
    'image_sha256',
    'canonical_family',
    'brand',
    'model',
    'category',
    'vision_model',
    'vision_proxy_route',
    'prompt_version',
    'prompt_sha256',
    'execution_identity_sha256',
  ]

  return exactFields.every(key =>
    typeof expected[key] === 'string' &&
    expected[key].length > 0 &&
    entry[key] === expected[key]
  )
}

function rpcEndpoint(supabaseUrl, functionName) {
  const base = clean(supabaseUrl).replace(/\/+$/, '')
  if (!base || !/^https:\/\/[^/]+$/i.test(base)) return null
  return base + '/rest/v1/rpc/' + functionName
}

async function callLedgerRpc(name, payload, {
  supabaseUrl,
  publicKey,
  fetchImpl = fetch,
  timeoutMs = 5000,
} = {}) {
  const endpoint = rpcEndpoint(supabaseUrl, name)
  if (!endpoint || !clean(publicKey)) {
    return { ok: false, error_code: 'GATE_LEDGER_CONFIG_MISSING', rows: [] }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        apikey: publicKey,
        Authorization: 'Bearer ' + publicKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const json = await response.json().catch(() => null)
    if (!response.ok || !Array.isArray(json)) {
      return {
        ok: false,
        error_code: 'GATE_LEDGER_RPC_FAILED',
        rows: [],
        http_status: Number(response.status) || null,
      }
    }
    return { ok: true, error_code: null, rows: json }
  } catch (error) {
    return {
      ok: false,
      error_code: error?.name === 'AbortError'
        ? 'GATE_LEDGER_RPC_TIMEOUT'
        : 'GATE_LEDGER_RPC_NETWORK_ERROR',
      rows: [],
    }
  } finally {
    clearTimeout(timer)
  }
}

function validateRecord(record) {
  if (!record || typeof record !== 'object') return 'GATE_LEDGER_RECORD_INVALID'
  if (!record.gate_run_key || record.gate_run_key.length > 120) {
    return 'GATE_LEDGER_RUN_KEY_INVALID'
  }
  if (!/^[A-Z0-9_]{1,120}$/.test(record.scope_key || '')) {
    return 'GATE_LEDGER_SCOPE_KEY_INVALID'
  }
  if (!['MIA', 'VIVIAN'].includes(record.supplier)) {
    return 'GATE_LEDGER_SUPPLIER_INVALID'
  }
  if (!record.drive_file_id || record.drive_file_id.length > 512) {
    return 'GATE_LEDGER_DRIVE_FILE_ID_INVALID'
  }
  for (const key of ['canonical_family', 'brand', 'model', 'category', 'prompt_version']) {
    if (!record[key]) return 'GATE_LEDGER_CONTEXT_MISSING'
  }
  if (!record.vision_proxy_route) return 'GATE_LEDGER_PROXY_ROUTE_INVALID'
  if (!SHA256_PATTERN.test(record.prompt_sha256 || '')) {
    return 'GATE_LEDGER_PROMPT_HASH_INVALID'
  }
  if (!GATE_LEDGER_STATUSES.has(record.validation_status)) {
    return 'GATE_LEDGER_STATUS_INVALID'
  }
  if (
    record.validation_status !== 'ERROR' &&
    (
      !SHA256_PATTERN.test(record.image_sha256 || '') ||
      !record.vision_model ||
      !SHA256_PATTERN.test(record.execution_identity_sha256 || '')
    )
  ) {
    return 'GATE_LEDGER_EXECUTION_IDENTITY_INCOMPLETE'
  }
  if (!record.validation_result || typeof record.validation_result !== 'object') {
    return 'GATE_LEDGER_VALIDATION_RESULT_INVALID'
  }
  return null
}

function recordPayload(record, token) {
  return {
    p_token: token,
    p_gate_run_key: record.gate_run_key,
    p_scope_key: record.scope_key,
    p_supplier: record.supplier,
    p_drive_file_id: record.drive_file_id,
    p_image_sha256: record.image_sha256,
    p_canonical_family: record.canonical_family,
    p_brand: record.brand,
    p_model: record.model,
    p_category: record.category,
    p_vision_model: record.vision_model,
    p_vision_proxy_route: record.vision_proxy_route,
    p_prompt_version: record.prompt_version,
    p_prompt_sha256: record.prompt_sha256,
    p_execution_identity_sha256: record.execution_identity_sha256,
    p_model_json: record.model_json,
    p_validation_result: record.validation_result,
    p_validation_status: record.validation_status,
    p_validation_error_code: record.validation_error_code,
    p_confidence: record.confidence,
    p_cost_usd: record.cost_usd,
    p_analyzed_at: record.analyzed_at,
  }
}

export async function persistSupplierGateLedger(records, {
  supabaseUrl,
  publicKey,
  cycleToken,
  fetchImpl = fetch,
  timeoutMs = 5000,
} = {}) {
  const rows = Array.isArray(records) ? records : []
  if (!clean(supabaseUrl) || !clean(publicKey) || !clean(cycleToken)) {
    return {
      ok: false,
      status: 'not_configured',
      attempted: 0,
      inserted: 0,
      existing: 0,
      failed: rows.length,
      results: [],
      error_code: 'GATE_LEDGER_CONFIG_MISSING',
    }
  }

  const results = []
  for (const record of rows) {
    const invalid = validateRecord(record)
    if (invalid) {
      results.push({
        drive_file_id: record?.drive_file_id || null,
        outcome: 'failed',
        error_code: invalid,
      })
      continue
    }

    const response = await callLedgerRpc(
      'lab_supplier_gate_ledger_record',
      recordPayload(record, cycleToken),
      { supabaseUrl, publicKey, fetchImpl, timeoutMs },
    )
    const row = response.rows[0] || null
    if (!response.ok || !row) {
      results.push({
        drive_file_id: record.drive_file_id,
        outcome: 'failed',
        error_code: response.error_code || 'GATE_LEDGER_RECORD_REJECTED',
      })
      continue
    }
    results.push({
      drive_file_id: record.drive_file_id,
      outcome: row.inserted === true ? 'inserted' : 'existing',
      validation_status: row.validation_status || record.validation_status,
      created_at: row.created_at || null,
    })
  }

  const inserted = results.filter(row => row.outcome === 'inserted').length
  const existing = results.filter(row => row.outcome === 'existing').length
  const failed = results.length - inserted - existing

  return {
    ok: failed === 0 && rows.length > 0,
    status: failed > 0 ? 'partial' : 'persisted',
    attempted: rows.length,
    inserted,
    existing,
    failed,
    results,
    ...(failed > 0 ? { error_code: 'GATE_LEDGER_PERSISTENCE_INCOMPLETE' } : {}),
  }
}

export async function readReusableSupplierGateLedger(identity, {
  supabaseUrl,
  publicKey,
  cycleToken,
  fetchImpl = fetch,
  timeoutMs = 5000,
} = {}) {
  if (!identity || !clean(cycleToken)) {
    return { ok: false, row: null, error_code: 'GATE_LEDGER_CONFIG_MISSING' }
  }

  const payload = {
    p_token: cycleToken,
    p_supplier: identity.supplier,
    p_scope_key: identity.scope_key,
    p_drive_file_id: identity.drive_file_id,
    p_image_sha256: identity.image_sha256,
    p_canonical_family: identity.canonical_family,
    p_brand: identity.brand,
    p_model: identity.model,
    p_category: identity.category,
    p_vision_model: identity.vision_model,
    p_vision_proxy_route: identity.vision_proxy_route,
    p_prompt_version: identity.prompt_version,
    p_prompt_sha256: identity.prompt_sha256,
    p_execution_identity_sha256: identity.execution_identity_sha256,
  }
  const response = await callLedgerRpc(
    'lab_supplier_gate_ledger_find_reusable',
    payload,
    { supabaseUrl, publicKey, fetchImpl, timeoutMs },
  )
  if (!response.ok) {
    return { ok: false, row: null, error_code: response.error_code }
  }

  const row = response.rows[0] || null
  return {
    ok: true,
    row: isReusableSupplierGateLedgerEntry(row, identity) ? row : null,
    error_code: null,
  }
}
