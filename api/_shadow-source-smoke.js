import { fetchProductsCatalog } from './_gabrielaContextService.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' })
  }

  const baseUrl = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_KEY

  if (!baseUrl || !key) {
    return res.status(500).json({
      ok: false,
      source: 'shadow_products',
      error_code: 'SMOKE_ENV_MISSING',
    })
  }

  const result = await fetchProductsCatalog({
    supabaseConfig: {
      baseUrl,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
    },
    timeoutMs: 5000,
  })

  return res.status(result.ok ? 200 : 503).json({
    ok: Boolean(result.ok),
    source: result.source || 'shadow_products',
    count: Array.isArray(result.products) ? result.products.length : 0,
    error_code: result.error_code || null,
  })
}
