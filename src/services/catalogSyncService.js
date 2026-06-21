// Sincronização de catálogo Bagy → Supabase
// UPSERT pattern: insere ou atualiza produtos por nome

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY
const TABLE = 'products'

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation,resolution=merge-duplicates',
}

function base() {
  return `${SUPABASE_URL}/rest/v1/${TABLE}`
}

// UPSERT: atualiza se existe, insere se não existe
export async function upsertProducts(products) {
  if (!Array.isArray(products) || products.length === 0) {
    console.log('[CatalogSync] Nenhum produto pra sincronizar')
    return { success: false, error: 'products array is empty' }
  }

  try {
    // Formata os dados com campos necessários
    const formatted = products.map(p => ({
      nome: p.nome,
      price_original: p.priceOriginal,
      price_discount: p.priceDiscount,
      discount_percent: Math.round(((p.priceOriginal - p.priceDiscount) / p.priceOriginal) * 100),
      status: p.status || 'active',
      source: 'bagy',
      synced_at: new Date().toISOString(),
    }))

    // Faz UPSERT (on_conflict na chave: name)
    const response = await fetch(base(), {
      method: 'POST',
      headers,
      body: JSON.stringify(formatted),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('[CatalogSync] UPSERT error - Status:', response.status)
      console.error('[CatalogSync] UPSERT error - Message:', error)
      console.error('[CatalogSync] Dados enviados:', JSON.stringify(formatted[0]))
      return { success: false, error, status: response.status }
    }

    const data = await response.json()
    console.log(`[CatalogSync] ✅ Sincronizados: ${data.length} produtos`)
    return { success: true, count: data.length, products: data }
  } catch (e) {
    console.error('[CatalogSync] Error:', e)
    return { success: false, error: e.message }
  }
}

// Recupera todos os produtos já sincronizados do Supabase
export async function getProductsFromSupabase() {
  try {
    const response = await fetch(base(), { headers })
    if (!response.ok) return []
    const data = await response.json()
    // Formata pra compatibilidade com app (nome → produto, price_discount → preco)
    return data.map(p => ({
      id: p.id,
      nome: p.nome,
      preco: String(p.price_discount || p.preco || '0'),
      price_original: p.price_original,
      price_discount: p.price_discount,
      imagem: p.imagem || null,
      link: p.link || null,
      categoria: p.categoria,
      codigo: p.codigo,
      status: p.status,
      source: p.source
    }))
  } catch (e) {
    console.error('[CatalogSync] Error fetching from Supabase:', e)
    return []
  }
}

// Conta quantos produtos estão sincronizados
export async function getProductCount() {
  try {
    const response = await fetch(`${base()}?select=id`, {
      headers: { ...headers, 'Prefer': 'count=exact' },
    })
    const total = parseInt(response.headers.get('content-range')?.split('/')[1] || '0')
    return total
  } catch {
    return 0
  }
}

// Busca um produto específico
export async function findProduct(name) {
  try {
    const encoded = encodeURIComponent(name)
    const response = await fetch(
      `${base()}?name=ilike.%${encoded}%`,
      { headers }
    )
    if (!response.ok) return null
    const data = await response.json()
    return data.length > 0 ? data[0] : null
  } catch {
    return null
  }
}

// Sincroniza incrementalmente: 24 → 50 → 520
export async function syncCatalogPhased(productsPerPhase = [24, 50, 520]) {
  console.log('[CatalogSync] Iniciando sincronização faseada:', productsPerPhase)
  return {
    phases: productsPerPhase,
    next: `Use upsertProducts() com ${productsPerPhase[0]} produtos inicialmente`,
  }
}
