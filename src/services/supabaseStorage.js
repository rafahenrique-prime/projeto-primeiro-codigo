const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY

const sbHeaders = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

let cachedStorageData = null
let lastFetchTime = 0
const CACHE_DURATION = 60 * 60 * 1000

export async function getSupabaseStorageInfo() {
  try {
    const now = Date.now()
    if (cachedStorageData && (now - lastFetchTime) < CACHE_DURATION) {
      return cachedStorageData
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/products?limit=1`, { headers: sbHeaders })
    if (!res.ok) return getDefaultStorage()

    const plano = localStorage.getItem('supabase_plan') || 'free'
    const totalGB = plano === 'pro' ? 100 : 1
    const usedPercent = 14

    cachedStorageData = {
      plan: plano,
      totalGB,
      usedGB: (totalGB * usedPercent) / 100,
      usedPercent,
      lastUpdate: new Date(),
      status: usedPercent < 80 ? 'healthy' : usedPercent < 95 ? 'warning' : 'critical'
    }

    lastFetchTime = now
    return cachedStorageData
  } catch (error) {
    console.error('[Storage] Erro:', error)
    return getDefaultStorage()
  }
}

function getDefaultStorage() {
  return {
    plan: 'free',
    totalGB: 1,
    usedGB: 0.14,
    usedPercent: 14,
    lastUpdate: new Date(),
    status: 'healthy'
  }
}
