const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY

let cached = null
let lastFetchTime = 0
const CACHE_DURATION = 30 * 60 * 1000

export async function getOpenRouterBalance() {
  try {
    const now = Date.now()
    if (cached && (now - lastFetchTime) < CACHE_DURATION) return cached

    if (!OPENROUTER_API_KEY) return null

    const res = await fetch('https://openrouter.ai/api/v1/credits', {
      headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}` },
    })
    if (!res.ok) return null

    const { data } = await res.json()
    if (!data) return null

    const totalCredits = data.total_credits ?? 0
    const totalUsage = data.total_usage ?? 0

    cached = {
      balance: totalCredits - totalUsage,
      totalCredits,
      totalUsage,
    }
    lastFetchTime = now
    return cached
  } catch (e) {
    console.error('[OpenRouterBalance] Erro:', e.message)
    return null
  }
}
