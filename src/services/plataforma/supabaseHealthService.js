// Health check real de conectividade do Supabase pro Operations Center — mesmo
// padrão já usado em diagnosticService.js/systemHealthService.js (anon key já
// pública no bundle, RLS protege os dados). Só confirma que a REST API responde,
// nunca inventa métrica de billing/storage/uso (Supabase não expõe isso via
// anon key). Cache client-side best-effort, mesmo TTL do vercelStatusService.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY

let cached = null
let lastFetchTime = 0
const CACHE_DURATION = 5 * 60 * 1000

export async function getSupabaseHealth(force = false) {
  const now = Date.now()
  if (!force && cached && (now - lastFetchTime) < CACHE_DURATION) return cached

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { available: false, errorCode: 'SUPABASE_NOT_CONFIGURED', lastChecked: new Date().toISOString() }
  }

  const startedAt = Date.now()
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/products?select=id&limit=1`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    })
    const latencyMs = Date.now() - startedAt

    if (!res.ok) {
      const result = { available: false, errorCode: `SUPABASE_HTTP_${res.status}`, lastChecked: new Date().toISOString() }
      cached = result
      lastFetchTime = now
      return result
    }

    const result = { available: true, latencyMs, lastChecked: new Date().toISOString() }
    cached = result
    lastFetchTime = now
    return result
  } catch (e) {
    console.error('[SupabaseHealth] Erro:', e.message)
    const result = { available: false, errorCode: 'SUPABASE_CLIENT_ERROR', lastChecked: new Date().toISOString() }
    cached = result
    lastFetchTime = now
    return result
  }
}
