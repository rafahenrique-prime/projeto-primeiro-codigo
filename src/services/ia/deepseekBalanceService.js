const DEEPSEEK_API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY

let cached = null
let lastFetchTime = 0
const CACHE_DURATION = 30 * 60 * 1000

export async function getDeepSeekBalance() {
  try {
    const now = Date.now()
    if (cached && (now - lastFetchTime) < CACHE_DURATION) return cached

    if (!DEEPSEEK_API_KEY) return null

    const res = await fetch('https://api.deepseek.com/user/balance', {
      headers: { 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` },
    })
    if (!res.ok) return null

    const data = await res.json()
    const info = data.balance_infos?.find(b => b.currency === 'USD') || data.balance_infos?.[0]
    if (!info) return null

    cached = { balance: parseFloat(info.total_balance), isAvailable: data.is_available }
    lastFetchTime = now
    return cached
  } catch (e) {
    console.error('[DeepSeekBalance] Erro:', e.message)
    return null
  }
}
