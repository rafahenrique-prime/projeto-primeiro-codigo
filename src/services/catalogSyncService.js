// Sincronização de catálogo Bagy → Supabase
// UPSERT pattern: insere ou atualiza produtos por nome

import { validarProdutoUnico } from './knowledgeGenerator'

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

// Logar ação no histórico do catálogo
async function logAction(action, produto_nome, produto_id = null) {
  try {
    await fetch('/api/log-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action, // 'add', 'edit', 'delete'
        produto_nome,
        produto_id
      })
    })
  } catch (e) {
    console.warn('[CatalogSync] Erro ao logar:', e.message)
    // Não quebra a operação principal
  }
}

// Download de imagem e upload para Supabase Storage
export async function uploadImageToStorage(imageUrl, productName) {
  if (!imageUrl || imageUrl.trim() === '') {
    return null
  }

  try {
    console.log(`[ImageUpload] Baixando imagem de: ${imageUrl.slice(0, 60)}...`)

    // 1. Baixar imagem da URL
    const imgResponse = await fetch(imageUrl)
    if (!imgResponse.ok) {
      console.warn(`[ImageUpload] Erro ao baixar: ${imgResponse.status}`)
      return imageUrl // Retorna URL original se falhar
    }

    const blob = await imgResponse.blob()

    // 2. Gerar nome do arquivo único
    const fileName = `${productName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${Date.now()}.jpg`
    const storagePath = `produtos/${fileName}`

    // 3. Fazer upload pro Supabase Storage
    const uploadRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/produtos/${fileName}`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
        body: blob,
      }
    )

    if (!uploadRes.ok) {
      console.warn(`[ImageUpload] Erro ao fazer upload: ${uploadRes.status}`)
      return imageUrl // Retorna URL original se falhar
    }

    // 4. Construir URL pública do arquivo
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/produtos/${fileName}`
    console.log(`[ImageUpload] ✅ Imagem salva: ${fileName}`)
    return publicUrl
  } catch (e) {
    console.error(`[ImageUpload] Erro:`, e.message)
    return imageUrl // Retorna URL original em caso de erro
  }
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
      // 0. Download e upload da imagem para Supabase Storage (só se for URL externa ou arquivo novo)
      let imagemUrl = p.imagem
      if (p.imagem && p.imagem.trim() !== '' && !p.imagem.includes('supabase.co')) {
        // Só tenta upload se não for já uma URL do Supabase Storage
        imagemUrl = await uploadImageToStorage(p.imagem, p.nome)
      }

      // Formata dados completos
      const dados = {
        nome: p.nome,
        preco: p.preco,
        imagem: imagemUrl, // URL da imagem salva no Storage
        link: p.link,
        categoria: p.categoria,
        price_original: p.price_original ? parseFloat(p.price_original) : null,
        price_discount: p.price_discount ? parseFloat(p.price_discount) : null,
        codigo: p.codigo || null,
        status: p.status || 'active',
        source: 'manual', // Diferencia de 'bagy' (webhook)
        synced_at: new Date().toISOString(),
      }

      // 1. Buscar produto — prioriza ID (UUID) para não criar duplicata ao renomear
      // Se o produto tem UUID válido, busca por ele. Senão, busca por nome (fallback).
      let existente = []
      const isUUID = p.id && typeof p.id === 'string' && p.id.length === 36 && p.id.includes('-')

      if (isUUID) {
        existente = await fetch(`${base()}?id=eq.${p.id}`, { headers }).then(r => r.json())
        if (existente?.length > 0) console.log(`[CatalogSync] 🔑 Encontrado por ID: ${p.nome}`)
      }

      // Fallback: sem UUID ou não encontrou — busca por nome
      if (!existente || existente.length === 0) {
        existente = await fetch(
          `${base()}?nome=eq.${encodeURIComponent(p.nome)}`,
          { headers }
        ).then(r => r.json())
      }

      if (existente && existente.length > 0) {
        // UPDATE: usa sempre o ID do Supabase (não o nome) para o PATCH
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
          // LOG: Registrar edição
          await logAction('edit', p.nome, id)
        }
      } else {
        // CAMADA 2: Validação de Duplicata - Evita inserir duplicatas
        const validacao = await validarProdutoUnico(p.nome);
        if (validacao.existe) {
          console.warn(`[CatalogSync] ⏭️  Produto duplicado ignorado: "${p.nome}" já existe como "${validacao.produtoExistente}"`);
          resultados.push({ nome: p.nome, acao: 'ignorado_duplicata', motivo: validacao.mensagem });
          continue; // Pula para próximo produto
        }

        // INSERT: produto novo
        const insertRes = await fetch(
          base(),
          {
            method: 'POST',
            headers: { ...headers, 'Prefer': 'return=representation' },
            body: JSON.stringify(dados),
          }
        )
        if (insertRes.ok) {
          inserted++
          const insertedProduct = await insertRes.json()
          const supabaseId = insertedProduct[0]?.id
          resultados.push({ nome: p.nome, acao: 'inserido', supabaseId })
          console.log(`[CatalogSync] ➕ Inserido: ${p.nome} (ID: ${supabaseId})`)
          // LOG: Registrar adição
          await logAction('add', p.nome, supabaseId)
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

// Deleta um produto do Supabase
export async function deleteProductFromSupabase(id, produtoNome = 'Desconhecido') {
  try {
    console.log('[CatalogSync] Deletando produto ID:', id)
    const response = await fetch(
      `${base()}?id=eq.${id}`,
      {
        method: 'DELETE',
        headers
      }
    )
    if (!response.ok) {
      console.error('[CatalogSync] Erro ao deletar:', response.status)
      return { success: false, error: `HTTP ${response.status}` }
    }
    console.log('[CatalogSync] ✅ Produto deletado com sucesso')
    // LOG: Registrar deleção
    await logAction('delete', produtoNome, id)
    return { success: true }
  } catch (e) {
    console.error('[CatalogSync] Erro:', e.message)
    return { success: false, error: e.message }
  }
}

// Recupera histórico de ações do catálogo
export async function getCatalogHistory(limit = 100) {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/catalog_history?order=timestamp.desc&limit=${limit}`,
      { headers }
    )
    if (!response.ok) return []
    const data = await response.json()
    return data.map(h => ({
      id: h.id,
      action: h.action, // 'add', 'edit', 'delete'
      produto_nome: h.produto_nome,
      produto_id: h.produto_id,
      timestamp: new Date(h.timestamp),
      created_at: h.created_at
    }))
  } catch (e) {
    console.error('[CatalogSync] Erro ao buscar histórico:', e)
    return []
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
