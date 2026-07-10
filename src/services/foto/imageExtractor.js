// Extrator de imagens da Bagy para preencher produtos sem foto
// Acessa a página do produto e extrai og:image

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY

const sbHeaders = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

// Extrai og:image da página HTML
function extractImageFromHTML(html) {
  const match = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i)
  if (match && match[1]) return match[1]

  // Fallback: procurar por data-src ou src em img
  const imgMatch = html.match(/<img[^>]+(?:data-src|src)=["']([^"']+)["'][^>]*>/i)
  if (imgMatch && imgMatch[1]) return imgMatch[1]

  return null
}

// Extrai imagem de um produto usando seu link
export async function extractImageFromLink(link) {
  if (!link) return null

  try {
    const res = await fetch(link, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 5000
    })
    if (!res.ok) return null

    const html = await res.text()
    return extractImageFromHTML(html)
  } catch (err) {
    console.error('Erro ao extrair imagem de', link, ':', err.message)
    return null
  }
}

// Processa todos os produtos sem imagem e atualiza no Supabase
export async function extractMissingImages(products, onProgress) {
  const productsWithoutImages = products.filter(p => !p.imagem || !p.imagem.trim())
  console.log(`[ImageExtractor] Encontrados ${productsWithoutImages.length} produtos sem imagem`)

  const updated = []
  for (let i = 0; i < productsWithoutImages.length; i++) {
    const product = productsWithoutImages[i]
    if (onProgress) onProgress(i + 1, productsWithoutImages.length, product.nome)

    const imagemURL = await extractImageFromLink(product.link)
    if (imagemURL) {
      updated.push({ ...product, imagem: imagemURL })
      console.log(`✅ ${product.nome}: ${imagemURL.substring(0, 60)}...`)
    } else {
      console.log(`❌ ${product.nome}: não conseguiu extrair`)
      updated.push(product)
    }

    // Delay pequeno para não sobrecarregar
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  return updated
}

// Atualiza produtos no Supabase
export async function updateProductsInSupabase(products) {
  try {
    // Upsert por nome
    const rows = products.map(({ nome, preco, link, imagem, categoria, codigo }) =>
      ({ nome, preco, link, imagem, categoria: categoria || null, codigo: codigo || null })
    )

    await fetch(`${SUPABASE_URL}/rest/v1/products`, {
      method: 'POST',
      headers: { ...sbHeaders, 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify(rows),
    })

    console.log('[ImageExtractor] Produtos atualizados no Supabase')
    return true
  } catch (err) {
    console.error('[ImageExtractor] Erro ao atualizar Supabase:', err)
    return false
  }
}

// Função completa: extrair e atualizar
export async function extractAndUpdateAllImages(products, onProgress) {
  console.log('[ImageExtractor] Iniciando extração de imagens...')

  const updated = await extractMissingImages(products, onProgress)
  const imagesAdded = updated.filter(p => p.imagem).length - products.filter(p => p.imagem).length

  if (imagesAdded > 0) {
    const success = await updateProductsInSupabase(updated)
    if (success) {
      console.log(`[ImageExtractor] ✅ Processo concluído! ${imagesAdded} imagens adicionadas.`)
      return { success: true, imagesAdded, updated }
    }
  }

  return { success: false, imagesAdded, updated }
}
