/**
 * Cache de análise de fotos — Supabase
 * Reduz custos reutilizando análises já feitas (AWS Rekognition)
 * TTL: 30 dias
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation,resolution=merge-duplicates',
}

async function generateHash(text) {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function getCachedAnalysis(imageUrl) {
  try {
    const hash = await generateHash(imageUrl)
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/photo_cache?hash=eq.${hash}&limit=1`,
      { headers }
    )
    if (!res.ok) return null
    const data = await res.json()
    if (!data[0]) return null

    const age = Date.now() - new Date(data[0].created_at).getTime()
    if (age > CACHE_TTL_MS) return null

    console.log('[Photo Cache] Hit! Reutilizando resultado')
    return { ...data[0].result, fromCache: true, cachedAt: new Date(data[0].created_at).toLocaleString('pt-BR') }
  } catch (err) {
    console.warn('[Photo Cache] Get error:', err)
    return null
  }
}

export async function setCachedAnalysis(imageUrl, analysisResult) {
  try {
    const hash = await generateHash(imageUrl)
    await fetch(`${SUPABASE_URL}/rest/v1/photo_cache`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        hash,
        image_url: imageUrl,
        result: analysisResult,
        provider: analysisResult.provider || 'unknown',
      }),
    })
    console.log(`[Photo Cache] Salvou em cache (${hash.slice(0, 8)}...)`)
  } catch (err) {
    console.warn('[Photo Cache] Set error:', err)
  }
}

export async function getCacheStats() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/photo_cache?select=provider,created_at`, { headers })
    if (!res.ok) return { totalEntries: 0, estimatedSavings: 0, providers: {} }
    const data = await res.json()
    const providers = {}
    data.forEach(r => { providers[r.provider || 'unknown'] = (providers[r.provider || 'unknown'] || 0) + 1 })
    return {
      totalEntries: data.length,
      estimatedSavings: data.length * 0.0015,
      providers,
    }
  } catch {
    return { totalEntries: 0, estimatedSavings: 0, providers: {} }
  }
}

export async function clearCache() {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/photo_cache?hash=neq.x`, { method: 'DELETE', headers })
    console.log('[Photo Cache] Cache limpo')
    return true
  } catch { return false }
}

export async function clearCacheForUrl(imageUrl) {
  try {
    const hash = await generateHash(imageUrl)
    await fetch(`${SUPABASE_URL}/rest/v1/photo_cache?hash=eq.${hash}`, { method: 'DELETE', headers })
    return true
  } catch { return false }
}

console.log('[Photo Cache] Inicializado e pronto')
