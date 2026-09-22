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
// CONTRATO CATÁLOGO PRIME (Etapa 0 APROVADA — substitui a regra anterior,
// que anulava o estoque quando sell_without_stock=true e assim PERDIA o
// número real): flag de política de venda e contagem física são fatos
// independentes e os dois se guardam.
//
// Regra nova:
// 1) stock_real SEMPRE preserva variation.balance quando ele é um número
//    real de estoque (0, positivo...), INDEPENDENTE de sell_without_stock.
//    balance=9999 é convenção de "sem controle de estoque", NUNCA quantidade
//    — vira stock_real=null + flag _semControle (não é anomalia bloqueante
//    quando product.selling_out_of_stock=true, porque é a combinação mais
//    comum do catálogo real: 253 produtos).
// 2) stock_quantity (legado) MANTÉM o significado atual nesta etapa:
//    product.selling_out_of_stock=true → null; senão 0/balance; 9999 sem o
//    flag do produto continua ANOMALIA bloqueante (salvaguarda existente).
// 3) variation.selling_out_of_stock continua gravado como veio.
// A recarga dos nulls históricos vem da releitura da Bagy numa sincronização
// pós-correção (o balance real está lá) — até lá, null = "desconhecido",
// nunca "tem estoque".
export function resolveSellWithoutStockProduto(product) {
  return product.selling_out_of_stock === true
}

export function resolveEstoqueVariacao(product, variation) {
  const sellWithoutStockVariacao = variation.selling_out_of_stock === true
  const balance = variation.balance
  const balanceEhNumeroReal = typeof balance === 'number' && Number.isFinite(balance) && balance >= 0 && balance !== 9999
  const semControle = balance === 9999

  if (product.selling_out_of_stock === true) {
    return {
      stock_quantity: null,
      stock_real: balanceEhNumeroReal ? balance : null,
      sell_without_stock: sellWithoutStockVariacao,
      anomalia: null,
      semControle: semControle || (!balanceEhNumeroReal && balance != null) || null,
    }
  }
  if (balance === 0) {
    return { stock_quantity: 0, stock_real: 0, sell_without_stock: sellWithoutStockVariacao, anomalia: null, semControle: null }
  }
  if (balanceEhNumeroReal && balance > 0) {
    return { stock_quantity: balance, stock_real: balance, sell_without_stock: sellWithoutStockVariacao, anomalia: null, semControle: null }
  }
  if (balance === 9999) {
    return {
      stock_quantity: undefined,
      stock_real: null,
      sell_without_stock: sellWithoutStockVariacao,
      anomalia: 'balance=9999 mas product.selling_out_of_stock não é true — combinação não coberta pela regra aprovada',
      semControle: true,
    }
  }
  return {
    stock_quantity: undefined,
    stock_real: null,
    sell_without_stock: sellWithoutStockVariacao,
    anomalia: `balance com valor inesperado: ${JSON.stringify(balance)}`,
    semControle: null,
  }
}

// --- Status ativo/inativo da variação (CONTRATO CATÁLOGO PRIME) -------------
// A variação da Bagy NÃO tem campo de status próprio. O status do TAMANHO/COR
// é derivado do VALOR DE ATRIBUTO ligado à variação, por 2 caminhos de
// evidência (comprovados ao vivo em 2026-09-21):
//  1) variation.attribute.active (booleano direto no objeto da variação);
//  2) join variation.attribute.id (= attribute_value_id) →
//     product.attribute.values[].active (e o equivalente pro atributo
//     secundário, se existir — grade dupla cor+tamanho ainda não existe no
//     catálogo real, mas a regra já está preparada).
// Sem NENHUMA evidência booleana → active=null (desconhecido). Etapa 0
// APROVADA: active=null NUNCA é tratado como disponibilidade confirmada.
// Com evidência em mais de um atributo (grade dupla): active = AND de todas
// as evidências (qualquer valor inativo derruba a variação).
function evidenciaActivePorJoin(attrValues, attrDaVariacao) {
  if (!Array.isArray(attrValues) || !attrDaVariacao) return null
  const valueId = attrDaVariacao.id ?? attrDaVariacao.attribute_value_id ?? null
  if (valueId == null) return null
  const found = attrValues.find((v) => v && v.id === valueId)
  return typeof found?.active === 'boolean' ? found.active : null
}

export function resolveActiveVariacao(product, variation) {
  const evidencias = []
  const attr = variation?.attribute ?? null
  const attr2 = variation?.attribute_secondary ?? null

  if (typeof attr?.active === 'boolean') evidencias.push(attr.active)
  else {
    const porJoin = evidenciaActivePorJoin(product?.attribute?.values, attr)
    if (porJoin !== null) evidencias.push(porJoin)
  }

  if (attr2) {
    if (typeof attr2?.active === 'boolean') evidencias.push(attr2.active)
    else {
      const porJoin2 = evidenciaActivePorJoin(product?.attribute_secondary?.values, attr2)
      if (porJoin2 !== null) evidencias.push(porJoin2)
    }
  }

  if (evidencias.length === 0) return null
  return evidencias.every(Boolean)
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
// CONTRATO CATÁLOGO PRIME: atributo SECUNDÁRIO (grade dupla, ex. cor+tamanho)
// entra no mesmo jsonb pela mesma heurística quando existir — no catálogo real
// de 2026-09-21 nenhum produto tem attribute_secondary, mas a regra já está
// preparada. Se primário e secundário caírem na MESMA chave, o secundário usa
// sufixo "_2" pra nunca sobrescrever o primário silenciosamente.
function chaveAtributo(attributeName) {
  const attrName = (attributeName || '').toUpperCase()
  if (attrName.includes('TAMANHO')) return { key: 'tamanho', fallback: false }
  if (attrName.includes('COR')) return { key: 'cor', fallback: false }
  return { key: (attributeName || 'atributo').trim().toLowerCase().replace(/\s+/g, '_'), fallback: true }
}

export function resolveAttributes(variation) {
  const attributes = {}
  let fallback = false

  const attr = variation.attribute
  if (attr && attr.name) {
    const { key, fallback: fb } = chaveAtributo(attr.attribute_name)
    attributes[key] = attr.name
    fallback = fallback || fb
  }

  const attr2 = variation.attribute_secondary
  if (attr2 && attr2.name) {
    let { key, fallback: fb } = chaveAtributo(attr2.attribute_name)
    if (key in attributes) key = `${key}_2`
    attributes[key] = attr2.name
    fallback = fallback || fb
  }

  return { attributes, fallback }
}

// --- Preço --------------------------------------------------------------
export function formatarPrecoBR(valorNumerico) {
  if (typeof valorNumerico !== 'number') return null
  return 'R$ ' + valorNumerico.toFixed(2).replace('.', ',')
}

// --- Atributos Google estruturados (piloto LAB) -----------------------------
const GENDER_VALUES = new Set(['male', 'female', 'unisex'])
const AGE_GROUP_VALUES = new Set(['newborn', 'infant', 'toddler', 'kids', 'adult'])

function enumOrNull(value, allowed) {
  return typeof value === 'string' && allowed.has(value.trim().toLowerCase())
    ? value.trim().toLowerCase()
    : null
}

function colorName(value) {
  if (typeof value === 'string') return value.trim() || null
  if (value && typeof value.name === 'string') return value.name.trim() || null
  return null
}

export function resolveGender(product) {
  return enumOrNull(product?.gender, GENDER_VALUES)
}

export function resolveAgeGroup(product) {
  return enumOrNull(product?.age_group, AGE_GROUP_VALUES)
}

// Cor do produto só existe quando a Bagy a entrega explicitamente e com um
// único valor inequívoco. Nome/slug/descrição nunca são usados como fonte.
export function resolveProductColor(product) {
  const direct = colorName(product?.color)
  if (direct) return direct
  const colors = Array.isArray(product?.colors)
    ? [...new Set(product.colors.map(colorName).filter(Boolean))]
    : []
  return colors.length === 1 ? colors[0] : null
}

// Cor específica da variação vence a cor comum do produto. O fallback do
// produto é factual e explícito; se nenhum existir, grava NULL.
export function resolveVariationColor(product, variation) {
  return colorName(variation?.color) || resolveProductColor(product)
}

export function resolveGoogleProductCategory(product) {
  const candidates = [
    product?.google_product_category,
    product?.category?.google_taxonomy_id,
    product?.category_default?.google_taxonomy_id,
  ]
  const value = candidates.find((v) => v !== null && v !== undefined && v !== '')
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null
}

// --- Marca ----------------------------------------------------------------
export function resolveMarca(product) {
  return product.brand?.name ? product.brand.name.trim() : null
}

// --- Monta a linha completa de `products` para um produto (sem tocar Supabase) ---
export function mapProductRow(product, { imagemAtualNoSupabase, status } = {}) {
  const cat = resolveCategoria(product)
  const img = resolveImagemProduto(product, imagemAtualNoSupabase)
  return {
    bagy_product_id: product.id,
    // CONTRATO CATÁLOGO PRIME: `status` só entra na linha quando o caller
    // (service) tem uma transação de estado a escrever ('active'/'inactive').
    // Ausente aqui, o campo nem aparece no diff — produto não muda de status
    // por acidente (ver resolveStatusProduto em api/_bagySyncService.js).
    ...(status !== undefined ? { status } : {}),
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
    gender: resolveGender(product),
    age_group: resolveAgeGroup(product),
    color: resolveProductColor(product),
    google_product_category: resolveGoogleProductCategory(product),
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
      stock_real: estoque.stock_real,
      active: resolveActiveVariacao(product, v),
      color: resolveVariationColor(product, v),
      sell_without_stock: estoque.sell_without_stock,
      imagem_principal: resolveImagemVariacao(v),
      _anomalia: estoque.anomalia,
      _semControle: estoque.semControle,
      _attributeFallback: attrs.fallback,
    }
  })
}
