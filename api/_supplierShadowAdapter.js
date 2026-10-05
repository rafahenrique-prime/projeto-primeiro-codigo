/**
 * Supplier Shadow V1 — adapter read-only.
 *
 * Nunca mistura VIVIAN/MIA com o Mirror oficial da PRIME.
 * Nunca escreve no Supabase.
 * Só expõe itens active=true + analysis_status=ready.
 */

export const SUPPLIER_SHADOW_ADAPTER_VERSION = '1.0.0'

export const SUPPLIER_KEYS = new Set(['VIVIAN', 'MIA'])

const SELECT = [
  'id',
  'supplier_key',
  'drive_file_id',
  'drive_path',
  'drive_url',
  'file_name',
  'brand',
  'canonical_family',
  'detected_model',
  'category',
  'visual_color',
  'gender_hint',
  'vision_confidence',
  'analysis_status',
  'active',
].join(',')

function cleanSupplier(value) {
  const key = String(value ?? '').trim().toUpperCase()
  return SUPPLIER_KEYS.has(key) ? key : null
}

export function supplierShadowRowToEvidence(row = {}) {
  const source = cleanSupplier(row.supplier_key)
  if (!source) return null
  if (row.active !== true) return null
  if (row.analysis_status !== 'ready') return null

  return {
    source,
    source_item_id: row.id == null ? null : String(row.id),
    name: String(row.detected_model || row.file_name || '').trim() || null,
    brand: String(row.brand || '').trim() || null,
    category: String(row.category || '').trim() || null,
    model: String(row.detected_model || row.file_name || '').trim() || null,
    color: String(row.visual_color || '').trim() || null,
    canonical_family: String(row.canonical_family || '').trim() || null,

    // Catálogo de fornecedor não traz preço comercial da PRIME.
    price: null,
    price_pix: null,

    // Presença no Supplier Shadow = candidato comercial, nunca estoque local.
    local_stock_confirmed: false,
    supplier_presence: true,
    requested_size_confirmed: false,
    confirmed_unavailable: false,

    // V1: foto do Drive é referência interna para a equipe, não autoenvio.
    photo_ref: row.drive_url ? String(row.drive_url) : null,
    product_link: null,

    confidence: Number.isFinite(Number(row.vision_confidence))
      ? Number(row.vision_confidence)
      : null,
  }
}

export async function fetchSupplierShadowProducts(deps = {}) {
  const {
    supabaseConfig,
    fetchImpl = fetch,
    timeoutMs = 4500,
    limit = 2500,
  } = deps

  if (!supabaseConfig?.baseUrl || !supabaseConfig?.headers) {
    return {
      ok: false,
      rows: [],
      evidence: [],
      error_code: 'SUPPLIER_SHADOW_CONFIG_MISSING',
    }
  }

  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const url =
      `${supabaseConfig.baseUrl}/rest/v1/supplier_shadow_products` +
      `?select=${encodeURIComponent(SELECT)}` +
      '&active=eq.true' +
      '&analysis_status=eq.ready' +
      `&limit=${limit}`

    const res = await fetchImpl(url, {
      method: 'GET',
      headers: supabaseConfig.headers,
      signal: controller.signal,
    })

    clearTimeout(timeoutHandle)

    if (!res?.ok) {
      return {
        ok: false,
        rows: [],
        evidence: [],
        error_code: 'SUPPLIER_SHADOW_UNAVAILABLE',
        http_status: Number(res?.status) || null,
      }
    }

    const rows = await res.json().catch(() => null)
    if (!Array.isArray(rows)) {
      return {
        ok: false,
        rows: [],
        evidence: [],
        error_code: 'SUPPLIER_SHADOW_INVALID_RESPONSE',
      }
    }

    return {
      ok: true,
      rows,
      evidence: rows.map(supplierShadowRowToEvidence).filter(Boolean),
      error_code: null,
    }
  } catch (error) {
    clearTimeout(timeoutHandle)
    return {
      ok: false,
      rows: [],
      evidence: [],
      error_code:
        error?.name === 'AbortError'
          ? 'SUPPLIER_SHADOW_TIMEOUT'
          : 'SUPPLIER_SHADOW_UNAVAILABLE',
    }
  }
}
