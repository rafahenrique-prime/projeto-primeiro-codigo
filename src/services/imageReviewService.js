// Revisor Visual — gerencia produtos sem foto no catálogo

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY

const sbHeaders = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

// Carrega produtos sem foto da Supabase
export async function loadProductsWithoutImages() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/products?imagem=is.null&order=created_at.desc`, {
      headers: sbHeaders,
    })
    if (!res.ok) throw new Error('Erro ao carregar produtos')
    const data = await res.json()
    return data || []
  } catch (err) {
    console.error('[ImageReview] Erro:', err)
    throw err
  }
}

// Conta produtos sem foto
export async function countProductsWithoutImages() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/products?imagem=is.null&select=id`,
      { headers: { ...sbHeaders, 'Prefer': 'count=exact' } }
    )
    const count = res.headers.get('content-range')?.split('/')[1] || '0'
    return parseInt(count, 10)
  } catch (err) {
    console.error('[ImageReview] Erro ao contar:', err)
    return 0
  }
}

// Upload de foto pro Supabase Storage + update do produto
export async function uploadProductImage(productId, file) {
  try {
    // 1. Upload para Storage
    const fileName = `produtos/${productId}-${Date.now()}.jpg`
    const formData = new FormData()
    formData.append('file', file)

    const uploadRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/produtos/${fileName}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
        body: formData,
      }
    )

    if (!uploadRes.ok) throw new Error('Erro ao fazer upload')

    // 2. Gerar URL pública
    const imageUrl = `${SUPABASE_URL}/storage/v1/object/public/produtos/${fileName}`

    // 3. Atualizar produto na tabela
    const updateRes = await fetch(
      `${SUPABASE_URL}/rest/v1/products?id=eq.${productId}`,
      {
        method: 'PATCH',
        headers: sbHeaders,
        body: JSON.stringify({ imagem: imageUrl }),
      }
    )

    if (!updateRes.ok) throw new Error('Erro ao atualizar produto')

    return { success: true, imageUrl }
  } catch (err) {
    console.error('[ImageReview] Erro no upload:', err)
    throw err
  }
}

// Atualiza descrição do produto após identificação
export async function updateProductDescription(productId, description) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/products?id=eq.${productId}`,
      {
        method: 'PATCH',
        headers: sbHeaders,
        body: JSON.stringify({ descricao: description }),
      }
    )

    if (!res.ok) throw new Error('Erro ao atualizar descrição')
    return { success: true }
  } catch (err) {
    console.error('[ImageReview] Erro ao atualizar:', err)
    throw err
  }
}

// Marca produto como "revisado sem sucesso" (não conseguiu foto)
export async function markAsReviewedFailed(productId, reason) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/products?id=eq.${productId}`,
      {
        method: 'PATCH',
        headers: sbHeaders,
        body: JSON.stringify({ imagem: '(sem-foto)', descricao: `Revisor: ${reason}` }),
      }
    )

    if (!res.ok) throw new Error('Erro ao atualizar')
    return { success: true }
  } catch (err) {
    console.error('[ImageReview] Erro:', err)
    throw err
  }
}

// Valida e faz download de imagem via URL (reutiliza lógica do catalog)
export async function validateImageUrl(url) {
  if (!url || !url.trim()) return null
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 5000
    })
    if (!res.ok) throw new Error('URL inválida ou inacessível')
    const blob = await res.blob()
    if (!blob.type.startsWith('image/')) throw new Error('Arquivo não é uma imagem')
    return blob
  } catch (err) {
    throw new Error(`Erro ao validar imagem: ${err.message}`)
  }
}

// Atualiza produto com todos os dados
export async function updateProductComplete(productId, data) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/products?id=eq.${productId}`,
      {
        method: 'PATCH',
        headers: sbHeaders,
        body: JSON.stringify(data),
      }
    )

    if (!res.ok) throw new Error('Erro ao atualizar produto')
    return { success: true }
  } catch (err) {
    console.error('[ImageReview] Erro:', err)
    throw err
  }
}
