/**
 * Serviço de Cache para Análise de Fotos
 *
 * Reduz custos reutilizando análises já feitas
 * (Google Vision custa $1.50/1000 reqs, cache = economia)
 *
 * Estratégia:
 * - Gera hash da URL da foto
 * - Reutiliza resultado se cache existe
 * - TTL configurável (default: 30 dias)
 */

// ==================== HASH ====================

async function generateHash(text) {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}

// ==================== STORAGE ====================

const CACHE_KEY = 'photo_analysis_cache'
const CACHE_INDEX_KEY = 'photo_cache_index'
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000 // 30 dias em ms

function getCache() {
  try {
    const data = localStorage.getItem(CACHE_KEY)
    return data ? JSON.parse(data) : {}
  } catch {
    return {}
  }
}

function saveCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch (err) {
    console.warn('[Photo Cache] Storage full or error:', err)
  }
}

function getCacheIndex() {
  try {
    const data = localStorage.getItem(CACHE_INDEX_KEY)
    return data ? JSON.parse(data) : {}
  } catch {
    return {}
  }
}

function saveCacheIndex(index) {
  try {
    localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(index))
  } catch (err) {
    console.warn('[Photo Cache] Index save error:', err)
  }
}

// ==================== LIMPEZA ====================

function cleanExpiredCache() {
  const cache = getCache()
  const index = getCacheIndex()
  const now = Date.now()
  let cleaned = 0

  for (const hash in index) {
    if (now - index[hash].timestamp > CACHE_TTL) {
      delete cache[hash]
      delete index[hash]
      cleaned++
    }
  }

  if (cleaned > 0) {
    saveCache(cache)
    saveCacheIndex(index)
    console.log(`[Photo Cache] Limpou ${cleaned} entradas expiradas`)
  }
}

// ==================== MAIN API ====================

export async function getCachedAnalysis(imageUrl) {
  try {
    const hash = await generateHash(imageUrl)
    const cache = getCache()

    if (cache[hash]) {
      const index = getCacheIndex()
      if (index[hash] && Date.now() - index[hash].timestamp < CACHE_TTL) {
        console.log(`[Photo Cache] Hit! Reutilizando resultado (economizou ~$0.0015)`)
        return {
          ...cache[hash],
          fromCache: true,
          cachedAt: new Date(index[hash].timestamp).toLocaleString('pt-BR'),
        }
      }
    }

    return null
  } catch (err) {
    console.warn('[Photo Cache] Get error:', err)
    return null
  }
}

export async function setCachedAnalysis(imageUrl, analysisResult) {
  try {
    const hash = await generateHash(imageUrl)
    const cache = getCache()
    const index = getCacheIndex()

    cache[hash] = {
      ...analysisResult,
      imageUrl, // Para debug
    }

    index[hash] = {
      timestamp: Date.now(),
      provider: analysisResult.provider,
    }

    saveCache(cache)
    saveCacheIndex(index)

    console.log(`[Photo Cache] Salvou resultado em cache (${hash.slice(0, 8)}...)`)

    // Limpeza em background
    setTimeout(cleanExpiredCache, 1000)
  } catch (err) {
    console.warn('[Photo Cache] Set error:', err)
  }
}

// ==================== STATS ====================

export function getCacheStats() {
  cleanExpiredCache()

  const cache = getCache()
  const index = getCacheIndex()
  const now = Date.now()

  const stats = {
    totalEntries: Object.keys(cache).length,
    estimatedSavings: Object.keys(cache).length * 0.0015, // $1.50 / 1000
    providers: {},
    oldestEntry: null,
    newestEntry: null,
  }

  let oldestTime = now
  let newestTime = 0

  for (const hash in index) {
    const provider = index[hash].provider || 'unknown'
    stats.providers[provider] = (stats.providers[provider] || 0) + 1

    const time = index[hash].timestamp
    if (time < oldestTime) oldestTime = time
    if (time > newestTime) newestTime = time
  }

  if (oldestTime !== now) {
    stats.oldestEntry = new Date(oldestTime).toLocaleString('pt-BR')
  }
  if (newestTime > 0) {
    stats.newestEntry = new Date(newestTime).toLocaleString('pt-BR')
  }

  return stats
}

// ==================== LIMPEZA MANUAL ====================

export function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY)
    localStorage.removeItem(CACHE_INDEX_KEY)
    console.log('[Photo Cache] Cache limpo completamente')
    return true
  } catch (err) {
    console.warn('[Photo Cache] Clear error:', err)
    return false
  }
}

export function clearCacheForUrl(imageUrl) {
  return new Promise(async resolve => {
    try {
      const hash = await generateHash(imageUrl)
      const cache = getCache()
      const index = getCacheIndex()

      if (hash in cache) {
        delete cache[hash]
        delete index[hash]
        saveCache(cache)
        saveCacheIndex(index)
        console.log(`[Photo Cache] Removeu entrada: ${hash.slice(0, 8)}...`)
        resolve(true)
      } else {
        resolve(false)
      }
    } catch (err) {
      console.warn('[Photo Cache] Clear for URL error:', err)
      resolve(false)
    }
  })
}

// ==================== INICIALIZAÇÃO ====================

// Limpa cache expirado ao carregar
cleanExpiredCache()

console.log('[Photo Cache] Inicializado e pronto')
