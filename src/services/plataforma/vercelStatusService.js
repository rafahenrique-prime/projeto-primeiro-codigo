const STATUS_ENDPOINT = 'https://ignite-webhook.vercel.app/api/vercel-status'

let cached = null
let lastFetchTime = 0
const CACHE_DURATION = 15 * 60 * 1000

export async function getVercelStatus() {
  try {
    const now = Date.now()
    if (cached && (now - lastFetchTime) < CACHE_DURATION) return cached

    const res = await fetch(STATUS_ENDPOINT)
    if (!res.ok) return null

    const data = await res.json()
    if (!data.available) return null

    cached = data
    lastFetchTime = now
    return cached
  } catch (e) {
    console.error('[VercelStatus] Erro:', e.message)
    return null
  }
}
