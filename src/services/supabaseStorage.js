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

// Soma o tamanho real dos arquivos no bucket 'produtos' (paginado, 1000 por página)
async function getBucketUsedBytes(bucket = 'produtos') {
  let offset = 0
  const limit = 1000
  let totalBytes = 0

  while (true) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers: sbHeaders,
      body: JSON.stringify({ prefix: '', limit, offset }),
    })
    if (!res.ok) break
    const items = await res.json()
    totalBytes += items.reduce((sum, o) => sum + (o.metadata?.size || 0), 0)
    if (items.length < limit) break
    offset += limit
  }

  return totalBytes
}

// Tamanho real do banco Postgres via função criada no SQL Editor do Supabase
// (create or replace function get_database_size() ...), sem precisar de token de admin
async function getDatabaseSizeBytes() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_database_size`, {
      method: 'POST',
      headers: sbHeaders,
      body: JSON.stringify({}),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function getSupabaseStorageInfo() {
  try {
    const now = Date.now()
    if (cachedStorageData && (now - lastFetchTime) < CACHE_DURATION) {
      return cachedStorageData
    }

    const [usedBytes, dbBytes] = await Promise.all([
      getBucketUsedBytes('produtos'),
      getDatabaseSizeBytes(),
    ])
    const plano = localStorage.getItem('supabase_plan') || 'free'
    const totalGB = plano === 'pro' ? 100 : 1
    const usedGB = usedBytes / (1024 ** 3)
    const usedPercent = Math.min(100, Math.round((usedGB / totalGB) * 1000) / 10)

    const dbTotalMB = plano === 'pro' ? 8192 : 500
    const dbUsedMB = dbBytes != null ? dbBytes / (1024 ** 2) : null
    const dbUsedPercent = dbUsedMB != null ? Math.min(100, Math.round((dbUsedMB / dbTotalMB) * 1000) / 10) : null

    cachedStorageData = {
      plan: plano,
      totalGB,
      usedGB,
      usedPercent,
      dbTotalMB,
      dbUsedMB,
      dbUsedPercent,
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
