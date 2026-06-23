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
// Faz UPSERT por NOME para evitar duplicatas
export async function upsertProducts(products) {
  if (!Array.isArray(products) || products.length === 0) {
    console.log('[CatalogSync] Nenhum produto pra sincronizar')
    return { success: false, error: 'products array is empty' }
  }

  try {
    console.log('[CatalogSync] Iniciando UPSERT de', products.length, 'produtos')

    let inserted = 0
    let updated = 0
    const resultados = []

    for (const p of products) {
      // Formata dados completos
      const dados = {
        nome: p.nome,
        preco: p.preco,
        imagem: p.imagem,
        link: p.link,
        categoria: p.categoria,
        price_original: p.price_original ? parseFloat(p.price_original) : null,
        price_discount: p.price_discount ? parseFloat(p.price_discount) : null,
        codigo: p.codigo || null,
        status: p.status || 'active',
        source: 'manual', // Diferencia de 'bagy' (webhook)
        synced_at: new Date().toISOString(),
      }

      // 1. Buscar se produto com esse nome já existe
      const existente = await fetch(
        `${base()}?nome=eq.${encodeURIComponent(p.nome)}`,
        { headers }
      ).then(r => r.json())

      if (existente && existente.length > 0) {
        // UPDATE: produto já existe
        const id = existente[0].id
        const updateRes = await fetch(
          `${base()}?id=eq.${id}`,
          {
            method: 'PATCH',
            headers,
            body: JSON.stringify(dados),
          }
        )
        if (updateRes.ok) {
          updated++
          resultados.push({ nome: p.nome, acao: 'atualizado' })
          console.log(`[CatalogSync] ✏️ Atualizado: ${p.nome}`)
        }
      } else {
        // INSERT: produto novo
        const insertRes = await fetch(
          base(),
          {
            method: 'POST',
            headers,
            body: JSON.stringify(dados),
          }
        )
        if (insertRes.ok) {
          inserted++
          resultados.push({ nome: p.nome, acao: 'inserido' })
          console.log(`[CatalogSync] ➕ Inserido: ${p.nome}`)
        }
      }
    }

    console.log(`[CatalogSync] ✅ UPSERT completo: ${inserted} inseridos, ${updated} atualizados`)
    return { success: true, inserted, updated, total: inserted + updated, produtos: resultados }
  } catch (e) {
    console.error('[CatalogSync] Error:', e)
    return { success: false, error: e.message }
  }
}

// Formata preço para padrão R$ XXX,XX
function formatPrice(value) {
  if (!value && value !== 0) return 'R$ 0,00'
  const str = String(value).trim()
  let num

  if (str.includes('R$')) {
    // Já formatado em BR: "R$ 1.299,99" → remove R$, troca . por nada e , por .
    num = parseFloat(str.replace('R$', '').trim().replace(/\./g, '').replace(',', '.'))
  } else {
    // Tenta parse direto primeiro (Supabase retorna 299.99 com ponto decimal)
    num = parseFloat(str)
    if (isNaN(num)) {
      // Fallback: formato BR com vírgula decimal ("299,99")
      num = parseFloat(str.replace(/\./g, '').replace(',', '.'))
    }
  }

  if (isNaN(num)) return 'R$ 0,00'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num)
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
      preco: formatPrice(p.price_discount || p.preco || '0'),
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
