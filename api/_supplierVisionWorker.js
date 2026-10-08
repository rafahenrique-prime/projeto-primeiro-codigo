import { createHash } from 'node:crypto'
import {
  isReusableSupplierGateLedgerEntry,
  readReusableSupplierGateLedger,
} from './_supplierGateLedger.js'

/**
 * Supplier Vision Worker V1 — LAB only.
 *
 * Fluxo:
 * queue RPC -> Google Drive image rendition -> Vision proxy existente
 * -> validação determinística -> narrow apply RPC.
 *
 * Não decide preço/estoque/tamanho e não conversa com cliente.
 */

export const SUPPLIER_VISION_WORKER_VERSION = '1.0.3'
export const SUPPLIER_VISION_PROMPT_VERSION = 'supplier-vision-prompt-v1.0.0'
export const DEFAULT_VISION_MODEL = 'google/gemini-2.5-flash-lite'

export function resolveRenderLabVisionProxyUrl(port = process.env.PORT) {
  const parsedPort = Number(port)
  const safePort =
    Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535
      ? parsedPort
      : 10000
  return 'http://127.0.0.1:' + safePort + '/api/supplier-harness-ocr-proxy'
}

export const DEFAULT_VISION_PROXY = resolveRenderLabVisionProxyUrl()

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function clean(value) {
  return String(value ?? '').trim()
}

export function normalizeSupplierVisionContext(row = {}) {
  return {
    supplier: clean(row.supplier_key || row.supplier),
    brand: clean(row.brand),
    canonical_family: clean(row.canonical_family),
    model: clean(row.detected_model || row.model),
    category: clean(row.category),
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function sanitizeVisionProxyRoute(value) {
  const source = clean(value)
  if (!source) return null

  try {
    const url = new URL(source)
    url.username = ''
    url.password = ''
    const safeParams = [...url.searchParams.entries()]
      .filter(([key]) => !/(token|secret|key|auth|credential|password)/i.test(key))
    url.search = ''
    for (const [key, paramValue] of safeParams) {
      url.searchParams.append(key, paramValue)
    }
    return url.origin + url.pathname + url.search
  } catch {
    return source.split('?')[0].split('#')[0] || null
  }
}

function sanitizeVisionAuditValue(value, depth = 0) {
  if (depth > 5) return null
  if (value == null || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    return value
      .slice(0, 2000)
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
      .replace(/\b(?:sk|gh[pousr]|xox[baprs]|github_pat)[_-][A-Za-z0-9._-]{16,}\b/gi, '[REDACTED]')
      .replace(/\bAIza[0-9A-Za-z_-]{30,}\b/g, '[REDACTED]')
      .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED]')
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map(item => sanitizeVisionAuditValue(item, depth + 1))
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([key]) => !/(token|secret|password|api[_-]?key|authorization|credential)/i.test(key))
      .slice(0, 50)
    return Object.fromEntries(
      entries.map(([key, item]) => [
        key,
        sanitizeVisionAuditValue(item, depth + 1),
      ])
    )
  }
  return null
}

export function buildVisionExecutionIdentity({
  drive_file_id,
  context = {},
  model,
  proxy_route,
  prompt_version,
  prompt_sha256,
  image_sha256,
}) {
  const identity = {
    drive_file_id: clean(drive_file_id) || null,
    supplier: clean(context.supplier) || null,
    brand: clean(context.brand) || null,
    canonical_family: clean(context.canonical_family) || null,
    model: clean(context.model) || null,
    category: clean(context.category) || null,
    model_effective: clean(model) || null,
    proxy_route: sanitizeVisionProxyRoute(proxy_route),
    prompt_version: clean(prompt_version) || null,
    prompt_sha256: clean(prompt_sha256) || null,
    image_sha256: clean(image_sha256) || null,
  }
  return {
    ...identity,
    sha256: sha256(JSON.stringify(identity)),
  }
}

function clampLimit(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 1
  return Math.max(1, Math.min(Math.trunc(n), 5))
}

function normalizeText(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function buildDriveRenditionUrl(fileId) {
  const id = clean(fileId)
  if (!id) return null
  return `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=w1600`
}

export function parseVisionJson(text) {
  const raw = clean(text)
  if (!raw) return null

  const candidates = [
    raw,
    raw.replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\s*\`\`\`$/i, ''),
  ]

  const firstBrace = raw.indexOf('{')
  const lastBrace = raw.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(raw.slice(firstBrace, lastBrace + 1))
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed
      }
    } catch {}
  }

  return null
}

export function validateVisionResult(row = {}, parsed = {}) {
  const expectedFamily = clean(row.canonical_family)
  const expectedBrand = clean(row.brand)
  const expectedModel = clean(row.detected_model)
  const expectedCategory = clean(row.category)

  if (!expectedFamily) {
    return {
      status: 'review',
      error_code: 'VISION_EXPECTED_FAMILY_MISSING',
      values: {
        brand: expectedBrand || null,
        canonical_family: null,
        detected_model: expectedModel || null,
        category: expectedCategory || null,
        visual_color: null,
        vision_confidence: null,
      },
    }
  }

  const confidenceRaw = Number(parsed.confidence)
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.max(0, Math.min(confidenceRaw, 1))
    : null

  const parsedFamily = normalizeText(parsed.canonical_family)
  const parsedModel = normalizeText(parsed.model)
  const parsedBrand = normalizeText(parsed.brand || expectedBrand)
  const expectedFamilyNormalized = normalizeText(expectedFamily)
  const expectedBrandNormalized = normalizeText(expectedBrand)

  const vomeroCompatible =
    expectedFamilyNormalized === 'nike vomero' &&
    expectedBrandNormalized === 'nike' &&
    parsedBrand === 'nike' &&
    [parsedFamily, parsedModel].some(value =>
      value.split(' ').includes('vomero')
    )

  const airMaxDnCompatible =
    expectedFamilyNormalized === 'nike air max dn' &&
    expectedBrandNormalized === 'nike' &&
    parsedBrand === 'nike' &&
    [parsedFamily, parsedModel].some(value =>
      value.includes('air max dn')
    )

  const airMax270Compatible =
    expectedFamilyNormalized === 'nike air max 270' &&
    expectedBrandNormalized === 'nike' &&
    parsedBrand === 'nike' &&
    [parsedFamily, parsedModel].some(value =>
      value.includes('air max 270')
    )

  const airMax97Compatible =
    expectedFamilyNormalized === 'nike air max 97' &&
    expectedBrandNormalized === 'nike' &&
    parsedBrand === 'nike' &&
    [parsedFamily, parsedModel].some(value =>
      value.includes('air max 97')
    )

  const airMax95Compatible =
    expectedFamilyNormalized === 'nike air max 95' &&
    expectedBrandNormalized === 'nike' &&
    parsedBrand === 'nike' &&
    [parsedFamily, parsedModel].some(value =>
      value.includes('air max 95')
    )

  const airMax90Compatible =
    expectedFamilyNormalized === 'nike air max 90' &&
    expectedBrandNormalized === 'nike' &&
    parsedBrand === 'nike' &&
    [parsedFamily, parsedModel].some(value =>
      value.includes('air max 90')
    )

  const jordan1Compatible =
    expectedFamilyNormalized === 'nike air jordan 1' &&
    expectedBrandNormalized === 'nike' &&
    parsedBrand === 'nike' &&
    [parsedFamily, parsedModel].some(value =>
      value.includes('jordan 1')
    )

  const jordan3Compatible =
    expectedFamilyNormalized === 'nike air jordan 3' &&
    expectedBrandNormalized === 'nike' &&
    parsedBrand === 'nike' &&
    [parsedFamily, parsedModel].some(value =>
      value.includes('jordan 3')
    )

  const jordan4Compatible =
    expectedFamilyNormalized === 'nike air jordan 4' &&
    expectedBrandNormalized === 'nike' &&
    parsedBrand === 'nike' &&
    [parsedFamily, parsedModel].some(value =>
      value.includes('jordan 4')
    )

  const familyMatch =
    parsed.family_match === true ||
    parsedFamily === expectedFamilyNormalized ||
    vomeroCompatible ||
    airMax90Compatible ||
    airMax95Compatible ||
    airMax97Compatible ||
    airMax270Compatible ||
    airMaxDnCompatible ||
    jordan1Compatible ||
    jordan3Compatible ||
    jordan4Compatible

  const color = clean(parsed.color)
  const model = clean(parsed.model)
  const brand = clean(parsed.brand)
  const category = clean(parsed.category)

  if (!familyMatch) {
    return {
      status: 'review',
      error_code: 'VISION_FAMILY_MISMATCH',
      values: {
        brand: expectedBrand || brand || null,
        canonical_family: expectedFamily,
        detected_model: expectedModel || model || null,
        category: expectedCategory || category || null,
        visual_color: color || null,
        vision_confidence: confidence,
      },
    }
  }

  if (confidence == null || confidence < 0.80) {
    return {
      status: 'review',
      error_code: 'VISION_LOW_CONFIDENCE',
      values: {
        brand: expectedBrand || brand || null,
        canonical_family: expectedFamily,
        detected_model: expectedModel || model || null,
        category: expectedCategory || category || null,
        visual_color: color || null,
        vision_confidence: confidence,
      },
    }
  }

  if (!color) {
    return {
      status: 'review',
      error_code: 'VISION_COLOR_MISSING',
      values: {
        brand: expectedBrand || brand || null,
        canonical_family: expectedFamily,
        detected_model: expectedModel || model || null,
        category: expectedCategory || category || null,
        visual_color: null,
        vision_confidence: confidence,
      },
    }
  }

  return {
    status: 'ready',
    error_code: null,
    values: {
      brand: brand || expectedBrand || null,
      canonical_family: expectedFamily,
      detected_model: model || expectedModel || null,
      category: category || expectedCategory || null,
      visual_color: color,
      vision_confidence: confidence,
    },
  }
}

async function postJson(url, body, headers, fetchImpl, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers,
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
        error?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
    }
  }
}

export async function fetchVisionQueue({
  supabaseUrl,
  publicKey,
  workerToken,
  limit = 1,
  driveFileIds = [],
  fetchImpl = fetch,
  timeoutMs = 4500,
}) {
  if (!supabaseUrl || !publicKey || !workerToken) {
    return { ok: false, rows: [], error_code: 'WORKER_RPC_CONFIG_MISSING' }
  }

  const selectedIds = [
    ...new Set(
      (Array.isArray(driveFileIds) ? driveFileIds : [])
        .map(clean)
        .filter(Boolean)
    ),
  ]

  const scoped = selectedIds.length > 0
  const rpcName = scoped
    ? 'lab_supplier_vision_queue_selected'
    : 'lab_supplier_vision_queue'
  const rpcBody = scoped
    ? {
        p_token: workerToken,
        p_limit: clampLimit(limit),
        p_drive_file_ids: selectedIds,
      }
    : {
        p_token: workerToken,
        p_limit: clampLimit(limit),
      }

  const result = await postJson(
    `${supabaseUrl}/rest/v1/rpc/${rpcName}`,
    rpcBody,
    {
      apikey: publicKey,
      Authorization: `Bearer ${publicKey}`,
      'Content-Type': 'application/json',
    },
    fetchImpl,
    timeoutMs,
  )

  if (!result.ok || !Array.isArray(result.json)) {
    return {
      ok: false,
      rows: [],
      error_code: 'WORKER_QUEUE_UNAVAILABLE',
      http_status: result.status,
    }
  }

  return { ok: true, rows: result.json, error_code: null }
}

export async function fetchDriveImage(fileId, {
  fetchImpl = fetch,
  timeoutMs = 8000,
} = {}) {
  const url = buildDriveRenditionUrl(fileId)
  if (!url) return { ok: false, error_code: 'DRIVE_FILE_ID_MISSING' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!res?.ok) {
      return {
        ok: false,
        error_code: 'DRIVE_IMAGE_UNAVAILABLE',
        http_status: Number(res?.status) || null,
      }
    }

    const contentType = String(res.headers?.get?.('content-type') || '')
      .split(';')[0]
      .trim()
      .toLowerCase()

    if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
      return {
        ok: false,
        error_code: 'DRIVE_IMAGE_TYPE_UNSUPPORTED',
        content_type: contentType || null,
      }
    }

    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length <= 0 || buf.length > MAX_IMAGE_BYTES) {
      return {
        ok: false,
        error_code: 'DRIVE_IMAGE_SIZE_INVALID',
        bytes: buf.length,
      }
    }

    return {
      ok: true,
      data_url: 'data:' + contentType + ';base64,' + buf.toString('base64'),
      content_type: contentType,
      bytes: buf.length,
      sha256: sha256(buf),
      error_code: null,
    }
  } catch (error) {
    clearTimeout(timer)
    return {
      ok: false,
      error_code:
        error?.name === 'AbortError'
          ? 'DRIVE_IMAGE_TIMEOUT'
          : 'DRIVE_IMAGE_UNAVAILABLE',
    }
  }
}

export function supplierVisionGuidance(row = {}) {
  if (clean(row.canonical_family) !== 'NIKE_COURT_BOROUGH') return []

  return [
    'precision_protocol: NIKE_COURT_BOROUGH_CONFIRMATION_V2',
    'Antes de marcar family_match=true, confirme sinais estruturais de Court Borough e descarte confusão com Nike Court Vision.',
    'Inspecione principalmente: volume/proporção da biqueira, desenho dos painéis laterais/eyestay, integração do Swoosh, geometria do colar/calcanhar e proporção da lateral da sola.',
    'Cor, logo Nike, material sintético/couro, perfurações e cupsole NÃO bastam sozinhos para confirmar a família.',
    'Court Borough tende a leitura mais encorpada/robusta e biqueira visualmente mais espaçosa; Court Vision tende a silhueta mais limpa e de perfil baixo.',
    'Para family_match=true e confidence>=0.80, exija pelo menos 2 sinais estruturais coerentes e nenhuma contradição forte. Em dúvida, family_match=false.',
  ]
}

export function buildSupplierVisionPrompt(row = {}) {
  const guidance = supplierVisionGuidance(row)
  const context = normalizeSupplierVisionContext(row)

  return [
    'Você analisa uma foto de produto de moda/calçado para um catálogo interno.',
    'Responda SOMENTE JSON válido, sem markdown.',
    'Nunca invente preço, estoque, tamanho, disponibilidade, prazo ou link.',
    'A pasta já forneceu uma família esperada. Confirme visualmente se a foto pertence a ela.',
    '',
    'supplier: ' + context.supplier,
    'expected_brand: ' + (context.brand || 'unknown'),
    'expected_family: ' + (context.canonical_family || 'unknown'),
    'expected_model: ' + (context.model || 'unknown'),
    'expected_category: ' + (context.category || 'unknown'),
    ...(guidance.length ? ['', 'precision_guidance:', ...guidance] : []),
    '',
    'Formato obrigatório:',
    '{"brand":"...","canonical_family":"...","model":"...","category":"...","color":"...","confidence":0.00,"family_match":true}',
    '',
    'color: use descrição curta em português; cor principal primeiro. Exemplos: "preto", "preto / branco", "bege / marrom".',
    'confidence: número de 0 a 1 sobre a identificação visual e cor.',
    'family_match: true somente se a foto realmente corresponder à família esperada.',
  ].join('\n')
}
export function buildSupplierVisionRequestContext(row = {}, {
  visionProxyUrl = DEFAULT_VISION_PROXY,
  visionModel = DEFAULT_VISION_MODEL,
} = {}) {
  const context = normalizeSupplierVisionContext(row)
  const analysisRow = {
    ...row,
    supplier_key: context.supplier,
    brand: context.brand,
    canonical_family: context.canonical_family,
    detected_model: context.model,
    category: context.category,
  }
  const selectedProxyUrl = clean(visionProxyUrl) || DEFAULT_VISION_PROXY
  const requestedModel = clean(visionModel) || DEFAULT_VISION_MODEL
  const proxyRoute = sanitizeVisionProxyRoute(selectedProxyUrl)
  const prompt = buildSupplierVisionPrompt(analysisRow)
  const promptSha256 = sha256(prompt)

  return {
    context,
    analysisRow,
    selectedProxyUrl,
    requestedModel,
    proxyRoute,
    prompt,
    promptSha256,
  }
}

export async function analyzeSupplierImage(row, {
  visionProxyUrl = DEFAULT_VISION_PROXY,
  visionModel = DEFAULT_VISION_MODEL,
  visionProxySecret = '',
  fetchImpl = fetch,
  timeoutMs = 12000,
} = {}) {
  const {
    context,
    analysisRow,
    selectedProxyUrl,
    requestedModel,
    proxyRoute,
    prompt,
    promptSha256,
  } = buildSupplierVisionRequestContext(row, { visionProxyUrl, visionModel })

  const buildAudit = (overrides = {}) => ({
    drive_file_id: clean(analysisRow.drive_file_id) || null,
    context,
    model_requested: requestedModel,
    model_effective: null,
    model_source: null,
    proxy_route: proxyRoute,
    prompt_version: SUPPLIER_VISION_PROMPT_VERSION,
    prompt_sha256: promptSha256,
    model_json: null,
    validation_status: 'error',
    validation_error_code: null,
    confidence: null,
    cost_usd: null,
    image_sha256: null,
    image_bytes: null,
    image_content_type: null,
    execution_identity: null,
    ...overrides,
  })

  const image = await fetchDriveImage(analysisRow.drive_file_id, {
    fetchImpl,
    timeoutMs: Math.min(timeoutMs, 8000),
  })

  if (!image.ok) {
    return {
      ok: false,
      stage: 'drive',
      error_code: image.error_code,
      http_status: image.http_status || null,
      audit: buildAudit({
        validation_error_code: image.error_code,
        image_bytes: image.bytes ?? null,
        image_content_type: image.content_type ?? null,
      }),
    }
  }

  const result = await postJson(
    selectedProxyUrl,
    {
      model: requestedModel,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: image.data_url } },
        ],
      }],
      max_tokens: 350,
      temperature: 0.1,
    },
    {
      'Content-Type': 'application/json',
      ...(clean(visionProxySecret)
        ? { 'x-prime-lab-secret': clean(visionProxySecret) }
        : {}),
    },
    fetchImpl,
    timeoutMs,
  )

  const providerModel = clean(result.json?.model)
  const costUsd =
    typeof result.json?.usage?.cost === 'number'
      ? result.json.usage.cost
      : null
  const imageAudit = {
    image_sha256: image.sha256,
    image_bytes: image.bytes,
    image_content_type: image.content_type,
    cost_usd: costUsd,
  }
  const usage = {
    input_tokens: result.json?.usage?.prompt_tokens ?? null,
    output_tokens: result.json?.usage?.completion_tokens ?? null,
    total_tokens: result.json?.usage?.total_tokens ?? null,
    cost_usd: costUsd,
  }
  const executionIdentityFor = model => buildVisionExecutionIdentity({
    drive_file_id: analysisRow.drive_file_id,
    context,
    model: model || requestedModel,
    proxy_route: proxyRoute,
    prompt_version: SUPPLIER_VISION_PROMPT_VERSION,
    prompt_sha256: promptSha256,
    image_sha256: image.sha256,
  })

  if (!result.ok) {
    const errorCode =
      result.error_code === 'TIMEOUT'
        ? 'VISION_TIMEOUT'
        : 'VISION_PROVIDER_ERROR'
    return {
      ok: false,
      stage: 'vision',
      error_code: errorCode,
      http_status: result.status,
      usage,
      audit: buildAudit({
        ...imageAudit,
        model_effective: providerModel || null,
        model_source: providerModel ? 'provider_response' : null,
        validation_error_code: errorCode,
        execution_identity: executionIdentityFor(providerModel),
      }),
    }
  }

  const text = result.json?.choices?.[0]?.message?.content
  const parsed = parseVisionJson(text)
  if (!parsed) {
    return {
      ok: false,
      stage: 'vision',
      error_code: 'VISION_INVALID_JSON',
      http_status: result.status,
      usage,
      audit: buildAudit({
        ...imageAudit,
        model_effective: providerModel || requestedModel,
        model_source: providerModel ? 'provider_response' : 'requested_model_fallback',
        validation_error_code: 'VISION_INVALID_JSON',
        execution_identity: executionIdentityFor(providerModel),
      }),
    }
  }

  const validation = validateVisionResult(analysisRow, parsed)
  const effectiveModel = providerModel || requestedModel
  const executionIdentity = buildVisionExecutionIdentity({
    drive_file_id: analysisRow.drive_file_id,
    context,
    model: effectiveModel,
    proxy_route: proxyRoute,
    prompt_version: SUPPLIER_VISION_PROMPT_VERSION,
    prompt_sha256: promptSha256,
    image_sha256: image.sha256,
  })
  const audit = buildAudit({
    ...imageAudit,
    model_effective: effectiveModel,
    model_source: providerModel ? 'provider_response' : 'requested_model_fallback',
    model_json: sanitizeVisionAuditValue(parsed),
    validation_status: validation.status,
    validation_error_code: validation.error_code,
    confidence: validation.values?.vision_confidence ?? null,
    execution_identity: executionIdentity,
  })

  return {
    ok: true,
    stage: 'vision',
    parsed,
    validation,
    usage,
    image: {
      content_type: image.content_type,
      bytes: image.bytes,
      sha256: image.sha256,
    },
    audit,
  }
}
export async function applyVisionResult(row, validation, {
  supabaseUrl,
  publicKey,
  workerToken,
  fetchImpl = fetch,
  timeoutMs = 4500,
}) {
  const values = validation?.values || {}
  const result = await postJson(
    `${supabaseUrl}/rest/v1/rpc/lab_supplier_vision_apply`,
    {
      p_token: workerToken,
      p_id: row.id,
      p_brand: values.brand,
      p_canonical_family: values.canonical_family,
      p_detected_model: values.detected_model,
      p_category: values.category,
      p_visual_color: values.visual_color,
      p_vision_confidence: values.vision_confidence,
      p_analysis_status: validation.status,
      p_error_code: validation.error_code,
    },
    {
      apikey: publicKey,
      Authorization: `Bearer ${publicKey}`,
      'Content-Type': 'application/json',
    },
    fetchImpl,
    timeoutMs,
  )

  if (!result.ok || !Array.isArray(result.json)) {
    return {
      ok: false,
      error_code: 'WORKER_APPLY_UNAVAILABLE',
      http_status: result.status,
    }
  }

  return {
    ok: true,
    row: result.json[0] || null,
    error_code: null,
  }
}


function gateLedgerReuseFailure(driveFileId, errorCode, {
  imageSha256 = null,
  executionIdentitySha256 = null,
  confidence = null,
  gateLedgerId = null,
  originalGateCostUsd = null,
  reused = false,
  audit = null,
} = {}) {
  return {
    drive_file_id: driveFileId,
    status: 'error',
    persisted: false,
    error_code: errorCode,
    source: 'gate_ledger',
    reused,
    gate_ledger_id: gateLedgerId,
    image_sha256: imageSha256,
    execution_identity_sha256: executionIdentitySha256,
    validation_status: 'ERROR',
    confidence,
    original_gate_cost_usd: originalGateCostUsd,
    current_vision_cost_usd: 0,
    usage: { cost_usd: 0 },
    audit: {
      drive_file_id: driveFileId,
      image_sha256: imageSha256,
      execution_identity: executionIdentitySha256
        ? { sha256: executionIdentitySha256 }
        : null,
      validation_status: 'ERROR',
      validation_error_code: errorCode,
      confidence,
      cost_usd: 0,
      source: 'gate_ledger',
      reused,
      gate_ledger_id: gateLedgerId,
      original_gate_cost_usd: originalGateCostUsd,
      current_vision_cost_usd: 0,
      ...(audit || {}),
    },
  }
}

function reusableValidationForExpectedContext(entry, expected) {
  if (
    !entry ||
    String(entry.validation_status || '').toUpperCase() !== 'READY' ||
    String(entry.validation_result?.status || '').toUpperCase() !== 'READY' ||
    entry.validation_result?.error_code != null
  ) return null

  const values = entry.validation_result?.values
  if (!values || typeof values !== 'object' || Array.isArray(values)) return null
  const allowedKeys = new Set([
    'brand',
    'canonical_family',
    'detected_model',
    'category',
    'visual_color',
    'vision_confidence',
  ])
  if (Object.keys(values).some(key => !allowedKeys.has(key))) return null

  if (values.canonical_family !== expected.canonical_family) return null
  for (const key of ['brand', 'detected_model', 'category']) {
    if (values[key] != null && typeof values[key] !== 'string') return null
  }

  if (typeof values.vision_confidence !== 'number') return null
  const confidence = values.vision_confidence
  if (!Number.isFinite(confidence) || confidence < 0.80 || confidence > 1) return null
  if (typeof values.visual_color !== 'string' || !clean(values.visual_color)) return null
  if (!clean(entry.gate_ledger_id)) return null

  return {
    status: 'ready',
    error_code: null,
    values: { ...values },
  }
}

const REUSE_IDENTITY_FIELDS = [
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

function exactReuseIdentityMatches(left, right) {
  return REUSE_IDENTITY_FIELDS.every(key =>
    typeof right?.[key] === 'string' &&
    right[key].length > 0 &&
    left?.[key] === right[key]
  )
}

/**
 * Read-only preflight for manual homologation. Every explicit ID is hashed and
 * looked up against the current scope context before the scanner can write to
 * Supplier Shadow. Misses are returned as errors and are never scanner inputs.
 */
export async function prepareSupplierGateLedgerReuse(input = {}, deps = {}) {
  const requestedIds = Array.isArray(input.drive_file_ids)
    ? input.drive_file_ids.map(clean)
    : []
  const scopeKey = clean(input.scope_key)
  const scopeContext = input.scope_context && typeof input.scope_context === 'object'
    ? input.scope_context
    : {}
  const invalidIds =
    requestedIds.length === 0 ||
    requestedIds.length > 3 ||
    new Set(requestedIds).size !== requestedIds.length ||
    requestedIds.some(id => !/^[A-Za-z0-9_-]{10,}$/.test(id))

  if (invalidIds || !scopeKey) {
    return {
      ok: false,
      prepared: [],
      processed: [],
      error_code: invalidIds
        ? 'GATE_LEDGER_REUSE_IDS_REQUIRED'
        : 'GATE_LEDGER_REUSE_SCOPE_REQUIRED',
    }
  }

  const expectedScopeContext = {
    supplier: clean(scopeContext.supplier).toUpperCase(),
    brand: clean(scopeContext.brand),
    canonical_family: clean(scopeContext.canonical_family),
    model: clean(scopeContext.model),
    category: clean(scopeContext.category),
  }
  if (Object.values(expectedScopeContext).some(value => !value)) {
    return {
      ok: false,
      prepared: [],
      processed: requestedIds.map(id =>
        gateLedgerReuseFailure(id, 'GATE_LEDGER_REUSE_CONTEXT_MISSING')
      ),
      error_code: 'GATE_LEDGER_REUSE_CONTEXT_MISSING',
    }
  }

  const fetchImpl = deps.fetchImpl || fetch
  const proxyUrl = deps.visionProxyUrl || resolveRenderLabVisionProxyUrl()
  const model = deps.visionModel || DEFAULT_VISION_MODEL
  const prepared = []
  const processed = []

  for (const driveFileId of requestedIds) {
    const row = {
      drive_file_id: driveFileId,
      supplier_key: expectedScopeContext.supplier,
      brand: expectedScopeContext.brand,
      canonical_family: expectedScopeContext.canonical_family,
      detected_model: expectedScopeContext.model,
      category: expectedScopeContext.category,
    }
    const requestContext = buildSupplierVisionRequestContext(row, {
      visionProxyUrl: proxyUrl,
      visionModel: model,
    })
    if (!requestContext.proxyRoute) {
      processed.push(gateLedgerReuseFailure(
        driveFileId,
        'GATE_LEDGER_REUSE_IDENTITY_UNAVAILABLE'
      ))
      continue
    }

    const image = await fetchDriveImage(driveFileId, {
      fetchImpl,
      timeoutMs: Math.min(deps.visionTimeoutMs || 8000, 8000),
    })
    if (!image.ok) {
      processed.push(gateLedgerReuseFailure(
        driveFileId,
        'GATE_LEDGER_REUSE_IMAGE_UNAVAILABLE'
      ))
      continue
    }

    const executionIdentity = buildVisionExecutionIdentity({
      drive_file_id: driveFileId,
      context: requestContext.context,
      model: requestContext.requestedModel,
      proxy_route: requestContext.proxyRoute,
      prompt_version: SUPPLIER_VISION_PROMPT_VERSION,
      prompt_sha256: requestContext.promptSha256,
      image_sha256: image.sha256,
    })
    const expectedIdentity = {
      supplier: requestContext.context.supplier.toUpperCase(),
      scope_key: scopeKey,
      drive_file_id: driveFileId,
      image_sha256: image.sha256,
      canonical_family: requestContext.context.canonical_family,
      brand: requestContext.context.brand,
      model: requestContext.context.model,
      category: requestContext.context.category,
      vision_model: requestContext.requestedModel,
      vision_proxy_route: requestContext.proxyRoute,
      prompt_version: SUPPLIER_VISION_PROMPT_VERSION,
      prompt_sha256: requestContext.promptSha256,
      execution_identity_sha256: executionIdentity.sha256,
    }

    const ledgerRead = await (deps.ledgerLookupFn || readReusableSupplierGateLedger)(
      expectedIdentity,
      {
        supabaseUrl: deps.supabaseUrl,
        publicKey: deps.publicKey,
        cycleToken: deps.cycleToken,
        fetchImpl,
        timeoutMs: deps.rpcTimeoutMs,
      }
    )
    if (!ledgerRead?.ok) {
      processed.push(gateLedgerReuseFailure(
        driveFileId,
        'GATE_LEDGER_REUSE_LOOKUP_FAILED',
        {
          imageSha256: image.sha256,
          executionIdentitySha256: executionIdentity.sha256,
        }
      ))
      continue
    }

    const entry = ledgerRead.row || null
    if (
      !entry ||
      !isReusableSupplierGateLedgerEntry(entry, expectedIdentity) ||
      !exactReuseIdentityMatches(entry, expectedIdentity)
    ) {
      processed.push(gateLedgerReuseFailure(
        driveFileId,
        'GATE_LEDGER_REUSE_MISS',
        {
          imageSha256: image.sha256,
          executionIdentitySha256: executionIdentity.sha256,
        }
      ))
      continue
    }

    const validation = reusableValidationForExpectedContext(entry, expectedIdentity)
    if (!validation) {
      processed.push(gateLedgerReuseFailure(
        driveFileId,
        'GATE_LEDGER_REUSE_VALIDATION_INVALID',
        {
          imageSha256: image.sha256,
          executionIdentitySha256: executionIdentity.sha256,
          gateLedgerId: entry.gate_ledger_id,
          confidence: entry.confidence ?? null,
          originalGateCostUsd: entry.cost_usd ?? null,
        }
      ))
      continue
    }

    prepared.push({
      drive_file_id: driveFileId,
      expected_identity: expectedIdentity,
      entry,
    })
  }

  return {
    ok: processed.length === 0 && prepared.length === requestedIds.length,
    prepared,
    processed,
    error_code: processed.length === 0 ? null : 'GATE_LEDGER_REUSE_INCOMPLETE',
  }
}

/**
 * Manual homologation apply phase. It consumes only preflighted READY ledger
 * hits and exact selected queue rows, re-hashes the current rendition, then
 * applies the saved validation result. No proxy call or fallback is possible.
 */
export async function runSupplierGateLedgerReuseWorker(input = {}, deps = {}) {
  const requestedIds = Array.isArray(input.drive_file_ids)
    ? input.drive_file_ids.map(clean)
    : []
  const scopeKey = clean(input.scope_key)
  const scopeContext = input.scope_context && typeof input.scope_context === 'object'
    ? input.scope_context
    : {}
  const invalidIds =
    requestedIds.length === 0 ||
    requestedIds.length > 3 ||
    new Set(requestedIds).size !== requestedIds.length ||
    requestedIds.some(id => !/^[A-Za-z0-9_-]{10,}$/.test(id))

  if (invalidIds || !scopeKey) {
    return {
      ok: false,
      queued: 0,
      processed: [],
      error_code: invalidIds
        ? 'GATE_LEDGER_REUSE_IDS_REQUIRED'
        : 'GATE_LEDGER_REUSE_SCOPE_REQUIRED',
    }
  }

  const expectedScopeContext = {
    supplier: clean(scopeContext.supplier).toUpperCase(),
    brand: clean(scopeContext.brand),
    canonical_family: clean(scopeContext.canonical_family),
    model: clean(scopeContext.model),
    category: clean(scopeContext.category),
  }
  if (Object.values(expectedScopeContext).some(value => !value)) {
    return {
      ok: false,
      queued: 0,
      processed: requestedIds.map(id =>
        gateLedgerReuseFailure(id, 'GATE_LEDGER_REUSE_CONTEXT_MISSING')
      ),
      error_code: 'GATE_LEDGER_REUSE_CONTEXT_MISSING',
    }
  }

  let preflight
  if (input.prepared_entries === undefined) {
    preflight = await prepareSupplierGateLedgerReuse(input, deps)
  } else if (Array.isArray(input.prepared_entries)) {
    preflight = { prepared: input.prepared_entries, processed: [] }
  } else {
    preflight = {
      prepared: [],
      processed: requestedIds.map(id =>
        gateLedgerReuseFailure(id, 'GATE_LEDGER_REUSE_PREFLIGHT_INVALID')
      ),
    }
  }

  const preparedById = new Map()
  let malformedPrepared = false
  for (const prepared of Array.isArray(preflight.prepared) ? preflight.prepared : []) {
    const id = clean(prepared?.drive_file_id)
    if (
      !requestedIds.includes(id) ||
      preparedById.has(id) ||
      !prepared?.expected_identity ||
      !prepared?.entry
    ) {
      malformedPrepared = true
      continue
    }
    preparedById.set(id, prepared)
  }
  if (malformedPrepared) {
    const failures = requestedIds.map(id =>
      gateLedgerReuseFailure(id, 'GATE_LEDGER_REUSE_PREFLIGHT_INVALID')
    )
    return {
      ok: false,
      queued: 0,
      processed: failures,
      error_code: 'GATE_LEDGER_REUSE_PREFLIGHT_INVALID',
    }
  }

  const preparedIds = requestedIds.filter(id => preparedById.has(id))
  if (preparedIds.length === 0) {
    const failuresById = new Map(
      (preflight.processed || []).map(item => [clean(item.drive_file_id), item])
    )
    const processed = requestedIds.map(id =>
      failuresById.get(id) ||
      gateLedgerReuseFailure(id, 'GATE_LEDGER_REUSE_PREFLIGHT_MISS')
    )
    return {
      ok: false,
      queued: 0,
      processed,
      error_code: 'GATE_LEDGER_REUSE_INCOMPLETE',
      side_effects: {
        supplier_shadow_write: false,
        vision_call: false,
        gate_ledger_read: true,
        gptmaker_call: false,
        customer_message: false,
        gaby_official: false,
      },
    }
  }

  const fetchImpl = deps.fetchImpl || fetch
  const queue = await fetchVisionQueue({
    supabaseUrl: deps.supabaseUrl,
    publicKey: deps.publicKey,
    workerToken: deps.workerToken,
    limit: Math.min(preparedIds.length, clampLimit(input.limit ?? preparedIds.length)),
    driveFileIds: preparedIds,
    fetchImpl,
    timeoutMs: deps.rpcTimeoutMs,
  })
  if (!queue.ok) {
    const processed = requestedIds.map(id =>
      preparedById.has(id)
        ? gateLedgerReuseFailure(id, 'GATE_LEDGER_REUSE_QUEUE_UNAVAILABLE')
        : (preflight.processed || []).find(item => clean(item.drive_file_id) === id) ||
          gateLedgerReuseFailure(id, 'GATE_LEDGER_REUSE_PREFLIGHT_MISS')
    )
    return {
      ok: false,
      queued: 0,
      processed,
      error_code: 'GATE_LEDGER_REUSE_QUEUE_UNAVAILABLE',
      side_effects: {
        supplier_shadow_write: false,
        vision_call: false,
        gate_ledger_read: true,
        gptmaker_call: false,
        customer_message: false,
        gaby_official: false,
      },
    }
  }

  const preparedSet = new Set(preparedIds)
  const queuedIds = (Array.isArray(queue.rows) ? queue.rows : [])
    .map(row => clean(row?.drive_file_id))
  const unexpectedQueueIds = queuedIds.filter(id => !preparedSet.has(id))
  if (unexpectedQueueIds.length > 0) {
    const processed = requestedIds.map(id =>
      preparedById.has(id)
        ? gateLedgerReuseFailure(id, 'GATE_LEDGER_REUSE_QUEUE_ID_MISMATCH')
        : (preflight.processed || []).find(item => clean(item.drive_file_id) === id) ||
          gateLedgerReuseFailure(id, 'GATE_LEDGER_REUSE_PREFLIGHT_MISS')
    )
    return {
      ok: false,
      queued: queue.rows.length,
      processed,
      error_code: 'GATE_LEDGER_REUSE_QUEUE_ID_MISMATCH',
      side_effects: {
        supplier_shadow_write: false,
        vision_call: false,
        gate_ledger_read: true,
        gptmaker_call: false,
        customer_message: false,
        gaby_official: false,
      },
    }
  }

  const rowsById = new Map()
  for (const row of queue.rows) {
    const id = clean(row?.drive_file_id)
    if (!rowsById.has(id)) rowsById.set(id, [])
    rowsById.get(id).push(row)
  }

  const appliedById = new Map()
  for (const driveFileId of preparedIds) {
    const matchingRows = rowsById.get(driveFileId) || []
    if (matchingRows.length !== 1) {
      appliedById.set(driveFileId, gateLedgerReuseFailure(
        driveFileId,
        matchingRows.length === 0
          ? 'GATE_LEDGER_REUSE_QUEUE_ITEM_MISSING'
          : 'GATE_LEDGER_REUSE_QUEUE_ITEM_DUPLICATE'
      ))
      continue
    }

    const row = matchingRows[0]
    if (!clean(row?.id)) {
      appliedById.set(driveFileId, gateLedgerReuseFailure(
        driveFileId,
        'GATE_LEDGER_REUSE_SHADOW_ROW_ID_MISSING'
      ))
      continue
    }

    const rowContext = normalizeSupplierVisionContext(row)
    const rowContextMatchesScope =
      rowContext.supplier.toUpperCase() === expectedScopeContext.supplier &&
      rowContext.brand === expectedScopeContext.brand &&
      rowContext.canonical_family === expectedScopeContext.canonical_family &&
      rowContext.model === expectedScopeContext.model &&
      rowContext.category === expectedScopeContext.category
    if (!rowContextMatchesScope) {
      appliedById.set(driveFileId, gateLedgerReuseFailure(
        driveFileId,
        'GATE_LEDGER_REUSE_CONTEXT_MISMATCH'
      ))
      continue
    }

    const requestContext = buildSupplierVisionRequestContext(row, {
      visionProxyUrl: deps.visionProxyUrl || resolveRenderLabVisionProxyUrl(),
      visionModel: deps.visionModel || DEFAULT_VISION_MODEL,
    })
    const image = await fetchDriveImage(driveFileId, {
      fetchImpl,
      timeoutMs: Math.min(deps.visionTimeoutMs || 8000, 8000),
    })
    if (!image.ok) {
      appliedById.set(driveFileId, gateLedgerReuseFailure(
        driveFileId,
        'GATE_LEDGER_REUSE_IMAGE_UNAVAILABLE'
      ))
      continue
    }

    const executionIdentity = buildVisionExecutionIdentity({
      drive_file_id: driveFileId,
      context: requestContext.context,
      model: requestContext.requestedModel,
      proxy_route: requestContext.proxyRoute,
      prompt_version: SUPPLIER_VISION_PROMPT_VERSION,
      prompt_sha256: requestContext.promptSha256,
      image_sha256: image.sha256,
    })
    const expectedIdentity = {
      supplier: requestContext.context.supplier.toUpperCase(),
      scope_key: scopeKey,
      drive_file_id: driveFileId,
      image_sha256: image.sha256,
      canonical_family: requestContext.context.canonical_family,
      brand: requestContext.context.brand,
      model: requestContext.context.model,
      category: requestContext.context.category,
      vision_model: requestContext.requestedModel,
      vision_proxy_route: requestContext.proxyRoute,
      prompt_version: SUPPLIER_VISION_PROMPT_VERSION,
      prompt_sha256: requestContext.promptSha256,
      execution_identity_sha256: executionIdentity.sha256,
    }

    const prepared = preparedById.get(driveFileId)
    const entry = prepared?.entry || null
    if (
      !exactReuseIdentityMatches(prepared?.expected_identity, expectedIdentity) ||
      !isReusableSupplierGateLedgerEntry(entry, expectedIdentity) ||
      !exactReuseIdentityMatches(entry, expectedIdentity)
    ) {
      appliedById.set(driveFileId, gateLedgerReuseFailure(
        driveFileId,
        'GATE_LEDGER_REUSE_IDENTITY_CHANGED',
        {
          imageSha256: image.sha256,
          executionIdentitySha256: executionIdentity.sha256,
        }
      ))
      continue
    }

    const validation = reusableValidationForExpectedContext(entry, expectedIdentity)
    if (!validation) {
      appliedById.set(driveFileId, gateLedgerReuseFailure(
        driveFileId,
        'GATE_LEDGER_REUSE_VALIDATION_INVALID',
        {
          imageSha256: image.sha256,
          executionIdentitySha256: executionIdentity.sha256,
          gateLedgerId: entry.gate_ledger_id,
          confidence: entry.confidence ?? null,
          originalGateCostUsd: entry.cost_usd ?? null,
        }
      ))
      continue
    }

    const apply = await (deps.applyFn || applyVisionResult)(row, validation, {
      supabaseUrl: deps.supabaseUrl,
      publicKey: deps.publicKey,
      workerToken: deps.workerToken,
      fetchImpl,
      timeoutMs: deps.rpcTimeoutMs,
    })
    const applyOkay = apply?.ok === true
    const confidence = Number(entry.confidence ?? validation.values.vision_confidence)
    const originalGateCost = entry.cost_usd == null
      ? null
      : Number(entry.cost_usd)
    const gateLedgerId = clean(entry.gate_ledger_id)
    const audit = {
      drive_file_id: driveFileId,
      context: requestContext.context,
      model_effective: expectedIdentity.vision_model,
      proxy_route: expectedIdentity.vision_proxy_route,
      prompt_version: expectedIdentity.prompt_version,
      prompt_sha256: expectedIdentity.prompt_sha256,
      image_sha256: expectedIdentity.image_sha256,
      execution_identity: { sha256: expectedIdentity.execution_identity_sha256 },
      validation_status: 'READY',
      confidence: Number.isFinite(confidence) ? confidence : null,
      cost_usd: 0,
      source: 'gate_ledger',
      reused: true,
      gate_ledger_id: gateLedgerId,
      original_gate_cost_usd: Number.isFinite(originalGateCost)
        ? originalGateCost
        : null,
      current_vision_cost_usd: 0,
    }
    appliedById.set(driveFileId, {
      id: row.id,
      drive_file_id: driveFileId,
      supplier: row.supplier_key || expectedIdentity.supplier,
      family: row.canonical_family || expectedIdentity.canonical_family,
      color: validation.values.visual_color ?? null,
      confidence: audit.confidence,
      status: applyOkay ? 'ready' : 'error',
      error_code: applyOkay ? null : apply?.error_code || 'WORKER_APPLY_UNAVAILABLE',
      persisted: applyOkay,
      source: 'gate_ledger',
      reused: true,
      gate_ledger_id: gateLedgerId,
      image_sha256: expectedIdentity.image_sha256,
      execution_identity_sha256: expectedIdentity.execution_identity_sha256,
      validation_status: 'READY',
      original_gate_cost_usd: audit.original_gate_cost_usd,
      current_vision_cost_usd: 0,
      usage: { cost_usd: 0 },
      audit,
    })
  }

  const preflightErrorsById = new Map(
    (preflight.processed || []).map(item => [clean(item.drive_file_id), item])
  )
  const processed = requestedIds.map(id =>
    appliedById.get(id) ||
    preflightErrorsById.get(id) ||
    gateLedgerReuseFailure(id, 'GATE_LEDGER_REUSE_PREFLIGHT_MISS')
  )
  const allOkay = processed.every(item =>
    item.status === 'ready' && item.persisted === true
  )

  return {
    ok: allOkay,
    worker_version: SUPPLIER_VISION_WORKER_VERSION,
    dry_run: false,
    queued: queue.rows.length,
    processed,
    error_code: allOkay ? null : 'GATE_LEDGER_REUSE_INCOMPLETE',
    side_effects: {
      supplier_shadow_write: processed.some(item => item.persisted === true),
      vision_call: false,
      gate_ledger_read: true,
      gptmaker_call: false,
      customer_message: false,
      gaby_official: false,
    },
  }
}

export async function runSupplierVisionWorker(input = {}, deps = {}) {
  const {
    supabaseUrl,
    publicKey,
    workerToken,
    fetchImpl = fetch,
  } = deps

  const limit = clampLimit(input.limit)
  const dryRun = input.dry_run !== false

  const queue = await fetchVisionQueue({
    supabaseUrl,
    publicKey,
    workerToken,
    limit,
    driveFileIds: input.drive_file_ids,
    fetchImpl,
    timeoutMs: deps.rpcTimeoutMs,
  })

  if (!queue.ok) {
    return {
      ok: false,
      worker_version: SUPPLIER_VISION_WORKER_VERSION,
      dry_run: dryRun,
      error_code: queue.error_code,
      processed: [],
    }
  }

  const processed = []

  for (const row of queue.rows) {
    const startedAt = Date.now()

    if (!clean(row.canonical_family)) {
      const validation = validateVisionResult(row, {})
      let apply = { ok: true, skipped: dryRun }
      if (!dryRun) {
        apply = await applyVisionResult(row, validation, {
          supabaseUrl,
          publicKey,
          workerToken,
          fetchImpl,
          timeoutMs: deps.rpcTimeoutMs,
        })
      }
      processed.push({
        id: row.id,
        supplier: row.supplier_key,
        family: null,
        status: validation.status,
        error_code: validation.error_code,
        persisted: !dryRun && apply.ok,
        latency_ms: Date.now() - startedAt,
      })
      continue
    }

    const analysis = await analyzeSupplierImage(row, {
      visionProxyUrl: deps.visionProxyUrl,
      visionModel: deps.visionModel,
      visionProxySecret: deps.visionProxySecret,
      fetchImpl,
      timeoutMs: deps.visionTimeoutMs,
    })

    if (!analysis.ok) {
      processed.push({
        id: row.id,
        drive_file_id: row.drive_file_id || analysis.audit?.drive_file_id || null,
        supplier: row.supplier_key,
        family: row.canonical_family,
        status: 'error',
        error_code: analysis.error_code,
        persisted: false,
        usage: analysis.usage || {
          cost_usd: analysis.audit?.cost_usd ?? null,
        },
        audit: analysis.audit || null,
        latency_ms: Date.now() - startedAt,
      })
      continue
    }

    let apply = { ok: true, skipped: dryRun }
    if (!dryRun) {
      apply = await applyVisionResult(row, analysis.validation, {
        supabaseUrl,
        publicKey,
        workerToken,
        fetchImpl,
        timeoutMs: deps.rpcTimeoutMs,
      })
    }

    processed.push({
      id: row.id,
      drive_file_id: row.drive_file_id || analysis.audit?.drive_file_id || null,
      supplier: row.supplier_key,
      family: row.canonical_family,
      color: analysis.validation.values.visual_color,
      confidence: analysis.validation.values.vision_confidence,
      status: analysis.validation.status,
      error_code:
        apply.ok
          ? analysis.validation.error_code
          : apply.error_code,
      persisted: !dryRun && apply.ok,
      usage: analysis.usage,
      image: analysis.image,
      audit: analysis.audit || null,
      latency_ms: Date.now() - startedAt,
    })
  }

  return {
    ok: true,
    worker_version: SUPPLIER_VISION_WORKER_VERSION,
    dry_run: dryRun,
    queued: queue.rows.length,
    processed,
    side_effects: {
      supplier_shadow_write: !dryRun,
      gptmaker_call: false,
      customer_message: false,
      gaby_official: false,
    },
  }
}
