/**
 * api/_bagySyncMapper.js
 *
 * Regras de mapeamento Bagy → Schema V1. Funções puras (sem I/O, sem
 * Supabase, sem fetch) — cada uma implementa exatamente uma regra já
 * validada e aprovada nesta sessão. Mantidas pequenas e testáveis
 * isoladamente.
 *
 * Fonte das regras: modo-planejar-cheerful-castle.md (Schema V1 definitivo +
 * revisão de categorias + regra definitiva de estoque), todas comprovadas
 * em poc/bagy-dooca-catalog-poc/ antes de virar código.
 */

// --- Categoria ------------------------------------------------------------
// Regra: category presente → usa direto. category null + categories[]
// presente → reconstrói pegando o item de breadcrumb mais específico (mais
// segmentos ">"). Os dois ausentes → não decide nada (deixa o caller manter
// o valor atual do Supabase).
function trimOrNull(s) {
  return typeof s === 'string' ? s.trim() : (s ?? null)
}

export function resolveCategoria(product) {
  if (product.category && product.category.name) {
    return {
      categoria: trimOrNull(product.category.name),
      categoria_breadcrumb: trimOrNull(product.category.breadcrumb),
      bagy_category_id: product.category.id ?? null,
      fonte: 'category_direto',
    }
  }
  if (Array.isArray(product.categories) && product.categories.length > 0) {
    const folha = product.categories.reduce((best, c) => {
      const segs = (c.breadcrumb || '').split('>').length
      const bestSegs = (best?.breadcrumb || '').split('>').length
      return segs > bestSegs ? c : best
    }, null)
    if (folha) {
      return {
        categoria: trimOrNull(folha.name),
        categoria_breadcrumb: trimOrNull(folha.breadcrumb),
        bagy_category_id: folha.id ?? null,
        fonte: 'categories_reconstruida',
      }
    }
  }
  return { categoria: undefined, categoria_breadcrumb: null, bagy_category_id: null, fonte: 'nenhuma' }
}

// --- Estoque ----------------------------------------------------------------
// Regra definitiva (aprovada):
// 1) product.selling_out_of_stock === true → sell_without_stock=true no
//    produto; TODA variação recebe stock_quantity=null, independente do que
//    variation.selling_out_of_stock disser (balance=9999 nunca é quantidade).
// 2) variation.selling_out_of_stock é sempre gravado como veio, sem
//    transformação — mesmo quando o produto está em modo 1.
// 3) Se product.selling_out_of_stock !== true:
//      balance === 0        → stock_quantity = 0
//      balance > 0 e != 9999 → stock_quantity = balance
//      balance === 9999      → ANOMALIA (não decide sozinho — sinaliza)
export function resolveSellWithoutStockProduto(product) {
  return product.selling_out_of_stock === true
}

export function resolveEstoqueVariacao(product, variation) {
  const sellWithoutStockVariacao = variation.selling_out_of_stock === true
  if (product.selling_out_of_stock === true) {
    return { stock_quantity: null, sell_without_stock: sellWithoutStockVariacao, anomalia: null }
  }
  const balance = variation.balance
  if (balance === 0) return { stock_quantity: 0, sell_without_stock: sellWithoutStockVariacao, anomalia: null }
  if (typeof balance === 'number' && balance > 0 && balance !== 9999) {
    return { stock_quantity: balance, sell_without_stock: sellWithoutStockVariacao, anomalia: null }
  }
  if (balance === 9999) {
    return {
      stock_quantity: undefined,
      sell_without_stock: sellWithoutStockVariacao,
      anomalia: 'balance=9999 mas product.selling_out_of_stock não é true — combinação não coberta pela regra aprovada',
    }
  }
  return {
    stock_quantity: undefined,
    sell_without_stock: sellWithoutStockVariacao,
    anomalia: `balance com valor inesperado: ${JSON.stringify(balance)}`,
  }
}

// --- Imagem -----------------------------------------------------------------
// Regra: products.imagem = product.image.src, fallback images[0].src, null se
// nenhum existir — MAS nunca sobrescrever uma imagem que já foi re-hospedada
// no Storage do próprio Supabase (heurística: já não é do CDN da Dooca).
export function resolveImagemProduto(product, imagemAtualNoSupabase) {
  const jaRehospedada = typeof imagemAtualNoSupabase === 'string'
    && imagemAtualNoSupabase.length > 0
    && !imagemAtualNoSupabase.includes('cdn.dooca.store')

  if (jaRehospedada) {
    return { imagem: imagemAtualNoSupabase, motivo: 'mantida — já re-hospedada fora do CDN da Dooca' }
  }
  const src = product.image?.src || product.images?.[0]?.src || null
  return { imagem: src, motivo: src ? 'atualizada a partir da Bagy' : 'sem imagem disponível na Bagy' }
}

export function resolveImagemVariacao(variation) {
  return variation.image?.src || variation.images?.[0]?.src || null
}

// --- Atributos (variação) ---------------------------------------------------
// attributes é jsonb genérico — nunca cria coluna fixa tamanho/cor. Heurística
// validada: se attribute_name contém "TAMANHO", a chave vira "tamanho"; se
// contém "COR", vira "cor"; caso contrário usa o nome do atributo em minúsculas
// como chave (fallback honesto, sem inventar semântica que não temos evidência).
export function resolveAttributes(variation) {
  const attr = variation.attribute
  if (!attr || !attr.name) return { attributes: {}, fallback: false }
  const attrName = (attr.attribute_name || '').toUpperCase()
  let key
  let fallback = false
  if (attrName.includes('TAMANHO')) key = 'tamanho'
  else if (attrName.includes('COR')) key = 'cor'
  else {
    key = (attr.attribute_name || 'atributo').trim().toLowerCase().replace(/\s+/g, '_')
    fallback = true
  }
  return { attributes: { [key]: attr.name }, fallback }
}

// --- Preço --------------------------------------------------------------
export function formatarPrecoBR(valorNumerico) {
  if (typeof valorNumerico !== 'number') return null
  return 'R$ ' + valorNumerico.toFixed(2).replace('.', ',')
}

// --- Marca ----------------------------------------------------------------
export function resolveMarca(product) {
  return product.brand?.name ? product.brand.name.trim() : null
}

// --- Monta a linha completa de `products` para um produto (sem tocar Supabase) ---
export function mapProductRow(product, { imagemAtualNoSupabase } = {}) {
  const cat = resolveCategoria(product)
  const img = resolveImagemProduto(product, imagemAtualNoSupabase)
  return {
    bagy_product_id: product.id,
    nome: product.name,
    link: `https://www.primestoremen.com.br${product.url}`,
    ...(cat.categoria !== undefined ? { categoria: cat.categoria } : {}),
    categoria_breadcrumb: cat.categoria_breadcrumb,
    bagy_category_id: cat.bagy_category_id,
    preco: formatarPrecoBR(product.price),
    preco_pix: product.payments?.pix?.total ?? null,
    imagem: img.imagem,
    descricao: product.description ?? null,
    marca: resolveMarca(product),
    sell_without_stock: resolveSellWithoutStockProduto(product),
    source: 'bagy_sync',
    _meta: { imagemMotivo: img.motivo, categoriaFonte: cat.fonte },
  }
}

// --- Monta as linhas de `product_variations` para um produto (sem tocar Supabase) ---
export function mapVariationRows(product, productUuid) {
  const variations = Array.isArray(product.variations) ? product.variations : []
  return variations.map((v) => {
    const estoque = resolveEstoqueVariacao(product, v)
    const attrs = resolveAttributes(v)
    return {
      product_id: productUuid,
      bagy_variation_id: v.id,
      attributes: attrs.attributes,
      preco: v.price != null ? Number(v.price) : null,
      preco_compare: v.price_compare != null ? Number(v.price_compare) : null,
      stock_quantity: estoque.stock_quantity,
      sell_without_stock: estoque.sell_without_stock,
      imagem_principal: resolveImagemVariacao(v),
      _anomalia: estoque.anomalia,
      _attributeFallback: attrs.fallback,
    }
  })
}
