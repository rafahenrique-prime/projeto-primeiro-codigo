/**
 * Supplier Vision Worker V1 — LAB only.
 *
 * Fluxo:
 * queue RPC -> Google Drive image rendition -> Vision proxy existente
 * -> validação determinística -> narrow apply RPC.
 *
 * Não decide preço/estoque/tamanho e não conversa com cliente.
 */

export const SUPPLIER_VISION_WORKER_VERSION = '1.0.0'
export const DEFAULT_VISION_MODEL = 'google/gemini-2.5-flash-lite'
export const DEFAULT_VISION_PROXY =
  'https://ignite-webhook.vercel.app/api/system-tools?tool=ocr-openrouter'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function clean(value) {
  return String(value ?? '').trim()
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

  const familyMatch =
    parsed.family_match === true ||
    parsedFamily === expectedFamilyNormalized ||
    vomeroCompatible

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
  fetchImpl = fetch,
  timeoutMs = 4500,
}) {
  if (!supabaseUrl || !publicKey || !workerToken) {
    return { ok: false, rows: [], error_code: 'WORKER_RPC_CONFIG_MISSING' }
  }

  const result = await postJson(
    `${supabaseUrl}/rest/v1/rpc/lab_supplier_vision_queue`,
    { p_token: workerToken, p_limit: clampLimit(limit) },
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
      data_url: `data:${contentType};base64,${buf.toString('base64')}`,
      content_type: contentType,
      bytes: buf.length,
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

function visionPrompt(row) {
  return [
    'Você analisa uma foto de produto de moda/calçado para um catálogo interno.',
    'Responda SOMENTE JSON válido, sem markdown.',
    'Nunca invente preço, estoque, tamanho, disponibilidade, prazo ou link.',
    'A pasta já forneceu uma família esperada. Confirme visualmente se a foto pertence a ela.',
    '',
    `supplier: ${clean(row.supplier_key)}`,
    `expected_brand: ${clean(row.brand) || 'unknown'}`,
    `expected_family: ${clean(row.canonical_family) || 'unknown'}`,
    `expected_model: ${clean(row.detected_model) || 'unknown'}`,
    `expected_category: ${clean(row.category) || 'unknown'}`,
    '',
    'Formato obrigatório:',
    '{"brand":"...","canonical_family":"...","model":"...","category":"...","color":"...","confidence":0.00,"family_match":true}',
    '',
    'color: use descrição curta em português; cor principal primeiro. Exemplos: "preto", "preto / branco", "bege / marrom".',
    'confidence: número de 0 a 1 sobre a identificação visual e cor.',
    'family_match: true somente se a foto realmente corresponder à família esperada.',
  ].join('\n')
}

export async function analyzeSupplierImage(row, {
  visionProxyUrl = DEFAULT_VISION_PROXY,
  visionModel = DEFAULT_VISION_MODEL,
  fetchImpl = fetch,
  timeoutMs = 12000,
} = {}) {
  const image = await fetchDriveImage(row.drive_file_id, {
    fetchImpl,
    timeoutMs: Math.min(timeoutMs, 8000),
  })

  if (!image.ok) {
    return {
      ok: false,
      stage: 'drive',
      error_code: image.error_code,
      http_status: image.http_status || null,
    }
  }

  const result = await postJson(
    visionProxyUrl,
    {
      model: visionModel,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: visionPrompt(row) },
          { type: 'image_url', image_url: { url: image.data_url } },
        ],
      }],
      max_tokens: 350,
      temperature: 0.1,
    },
    { 'Content-Type': 'application/json' },
    fetchImpl,
    timeoutMs,
  )

  if (!result.ok) {
    return {
      ok: false,
      stage: 'vision',
      error_code:
        result.error_code === 'TIMEOUT'
          ? 'VISION_TIMEOUT'
          : 'VISION_PROVIDER_ERROR',
      http_status: result.status,
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
    }
  }

  return {
    ok: true,
    stage: 'vision',
    parsed,
    validation: validateVisionResult(row, parsed),
    usage: {
      input_tokens: result.json?.usage?.prompt_tokens ?? null,
      output_tokens: result.json?.usage?.completion_tokens ?? null,
      total_tokens: result.json?.usage?.total_tokens ?? null,
      cost_usd:
        typeof result.json?.usage?.cost === 'number'
          ? result.json.usage.cost
          : null,
    },
    image: {
      content_type: image.content_type,
      bytes: image.bytes,
    },
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
      fetchImpl,
      timeoutMs: deps.visionTimeoutMs,
    })

    if (!analysis.ok) {
      processed.push({
        id: row.id,
        supplier: row.supplier_key,
        family: row.canonical_family,
        status: 'error',
        error_code: analysis.error_code,
        persisted: false,
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
