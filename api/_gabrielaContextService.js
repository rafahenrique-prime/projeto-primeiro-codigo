/**
 * api/_gabrielaContextService.js
 *
 * Núcleo compartilhado de FONTES DE DADO entre o canal oficial (api/webhook.js)
 * e a futura conexão da PRIME Bridge (Etapa 3, ainda não implementada). Helper
 * privado (prefixo "_", nunca `export default`, nunca vira Function própria) —
 * mesmo padrão de api/_toolConsultarProduto.js e api/_profileMemory.js.
 *
 * ===== O QUE ESTE MÓDULO FAZ =====
 * Busca catálogo cru, busca knowledge, orquestra os dois + customerMemory num
 * contrato neutro.
 *
 * ===== O QUE ESTE MÓDULO NUNCA FAZ =====
 * Não aplica ranking/score, não decide retry por "zero resultado relevante"
 * (isso é decisão de cada canal sobre o que é "resultado relevante" — o canal
 * oficial usa calcularSimilaridade()/score>0 sem mínimo de termos, a Bridge usa
 * minimumMatchesRequired() bem mais rigoroso; misturar os dois aqui mudaria o
 * comportamento de um dos dois canais), não formata resposta pro GPT Maker,
 * não conhece o contrato da PRIME Bridge, não escreve no Supabase.
 *
 * ===== customerMemory =====
 * Reaproveita getMemoryBlock() de api/_profileMemory.js sem reimplementar
 * timeout/fallback/formatação — este módulo só chama e repassa a string.
 */

import { getMemoryBlock } from './_profileMemory.js'
import { formatarPrecoBR } from './_bagySyncMapper.js'

const SHADOW_PRODUCTS_SELECT = 'id,bagy_product_id,nome,categoria_nome,preco,imagem_principal,link,codigo,marca,selling_out_of_stock,' +
  'preco_tabela,preco_pix,' +
  'parcelamento_padrao_vezes,parcelamento_padrao_valor,parcelamento_padrao_com_juros,' +
  'parcelamento_max_vezes,parcelamento_max_valor,parcelamento_max_com_juros'
const KNOWLEDGE_TITLE = 'knowledge_gabriela_supabase_completo'

/**
 * FASE 2A — único ponto que decide o "shape" comercial entregue à Gaby.
 * Reutilizado por api/webhook.js e api/_toolConsultarProduto.js pra que os
 * dois caminhos NUNCA divirjam nos valores comerciais do mesmo produto
 * (achado da investigação: cada um tinha seu próprio .map() e já
 * divergiam — ver docs/integrations/BAGY-SYNC.md/GPTMAKER-API.md).
 *
 * Regra de ausência: campo comercial sem evidência real no catálogo NUNCA
 * aparece no objeto retornado — nunca `null` explícito, nunca inventado,
 * nunca calculado como fallback. `preco` (o campo já existente antes desta
 * fase) não é tocado por esta função — cada caller continua controlando seu
 * próprio fallback de `preco`, exatamente como já fazia.
 *
 * Não decide política comercial (não monta frase pronta, não escolhe qual
 * parcelamento "priorizar" pro cliente) — só formata e entrega os fatos já
 * validados em Supabase (Fase 1/1.1). Formatação monetária reaproveita
 * formatarPrecoBR (api/_bagySyncMapper.js), já usado para `preco` — nunca
 * recalcula nenhum valor.
 */
export function formatarProdutoComercial(product) {
  const p = product || {}
  const comercial = {}

  if (p.preco_tabela != null) comercial.precoTabela = formatarPrecoBR(p.preco_tabela)
  if (p.preco_pix != null) comercial.precoPix = formatarPrecoBR(p.preco_pix)

  if (p.parcelamento_padrao_vezes != null && p.parcelamento_padrao_valor_parcela != null) {
    comercial.parcelamentoPadraoVezes = p.parcelamento_padrao_vezes
    comercial.parcelamentoPadraoValor = formatarPrecoBR(p.parcelamento_padrao_valor_parcela)
    if (p.parcelamento_padrao_com_juros != null) {
      comercial.parcelamentoPadraoComJuros = p.parcelamento_padrao_com_juros
    }
  }

  if (p.parcelamento_max_vezes != null && p.parcelamento_valor_parcela != null) {
    comercial.parcelamentoMaxVezes = p.parcelamento_max_vezes
    comercial.parcelamentoMaxValor = formatarPrecoBR(p.parcelamento_valor_parcela)
    if (p.parcelamento_com_juros != null) {
      comercial.parcelamentoMaxComJuros = p.parcelamento_com_juros
    }
  }

  return comercial
}

/**
 * Busca o catálogo cru de produtos — sem ranking, sem filtro por pergunta.
 * Mesma URL/select já usados hoje em api/webhook.js (buscarProdutos).
 *
 * @param {{ supabaseConfig: {baseUrl: string, headers: object}, fetchImpl?: Function }} deps
 * @returns {Promise<{ ok: boolean, products: Array, error_code?: string }>}
 */
function normalizeNumber(value) {
  if (value == null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatBasePrice(value) {
  if (value == null || value === '') return value
  if (typeof value === 'string' && /R\$/.test(value)) return value
  const numeric = normalizeNumber(value)
  return numeric == null ? null : formatarPrecoBR(numeric)
}

function normalizeCatalogProduct(row = {}) {
  return {
    id: row.id,
    bagy_product_id: row.bagy_product_id ?? null,
    nome: row.nome ?? '',
    categoria: row.categoria_nome ?? row.categoria ?? '',
    preco: formatBasePrice(row.preco),
    imagem: row.imagem_principal ?? row.imagem ?? null,
    link: row.link ?? null,
    codigo: row.codigo ?? null,
    marca: row.marca ?? null,
    selling_out_of_stock:
      row.selling_out_of_stock === true || row.selling_out_of_stock === 'true',
    preco_tabela: normalizeNumber(row.preco_tabela),
    preco_pix: normalizeNumber(row.preco_pix),
    parcelamento_padrao_vezes: row.parcelamento_padrao_vezes ?? null,
    parcelamento_padrao_valor_parcela: normalizeNumber(
      row.parcelamento_padrao_valor ?? row.parcelamento_padrao_valor_parcela
    ),
    parcelamento_padrao_com_juros: row.parcelamento_padrao_com_juros ?? null,
    parcelamento_max_vezes: row.parcelamento_max_vezes ?? null,
    parcelamento_valor_parcela: normalizeNumber(
      row.parcelamento_max_valor ?? row.parcelamento_valor_parcela
    ),
    parcelamento_com_juros:
      row.parcelamento_max_com_juros ?? row.parcelamento_com_juros ?? null,
  }
}

async function fetchCatalogTable({
  table,
  select,
  query = '',
  supabaseConfig,
  fetchFn,
  timeoutMs,
}) {
  const controller = timeoutMs ? new AbortController() : null
  const timeoutHandle = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null

  try {
    const res = await fetchFn(
      `${supabaseConfig.baseUrl}/rest/v1/${table}?select=${select}${query}`,
      { headers: supabaseConfig.headers, ...(controller ? { signal: controller.signal } : {}) }
    )
    if (timeoutHandle) clearTimeout(timeoutHandle)

    if (!res.ok) {
      return { ok: false, products: [], error_code: 'source_unavailable' }
    }

    let products
    try {
      products = await res.json()
    } catch {
      return { ok: false, products: [], error_code: 'source_invalid_response' }
    }

    if (!Array.isArray(products)) {
      return { ok: false, products: [], error_code: 'source_invalid_response' }
    }

    return {
      ok: true,
      products: products.map(normalizeCatalogProduct),
      source: table,
    }
  } catch (err) {
    if (timeoutHandle) clearTimeout(timeoutHandle)
    const code = err?.name === 'AbortError' ? 'source_timeout' : 'source_unavailable'
    return { ok: false, products: [], error_code: code }
  }
}

export async function fetchProductsCatalog(deps = {}) {
  const { supabaseConfig, fetchImpl, timeoutMs } = deps
  const fetchFn = fetchImpl ?? fetch

  // Fonte oficial de leitura: Mirror/Shadow, que acompanha o catálogo atual
  // usado no IGNITE. "Zero produtos" é uma resposta válida e NÃO aciona
  // fallback, evitando ressuscitar itens antigos da tabela legacy.
  const shadow = await fetchCatalogTable({
    table: 'shadow_products',
    select: SHADOW_PRODUCTS_SELECT,
    query: '&ativo=eq.true',
    supabaseConfig,
    fetchFn,
    timeoutMs,
  })

  if (shadow.ok) {
    console.log('[Catalog][source]', JSON.stringify({
      catalog_source: 'shadow_products',
      ok: true,
      error_code: null,
    }))
    return shadow
  }

  // Fail-closed: o Mirror/Shadow do IGNITE PRIME V2 é a ÚNICA fonte
  // comercial permitida. Nunca recuar silenciosamente para products (V1),
  // mesmo em indisponibilidade técnica, para evitar dados antigos no atendimento.
  const errorCode = shadow.error_code || 'source_unavailable'
  console.warn('[Catalog][source]', JSON.stringify({
    catalog_source: 'shadow_products',
    ok: false,
    error_code: errorCode,
  }))

  return {
    ok: false,
    products: [],
    source: 'shadow_products',
    error_code: errorCode,
  }
}



function normalizeAttrText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function variationMatchesSize(attributes, requestedSize) {
  if (!requestedSize) return true
  const target = normalizeAttrText(requestedSize)
  if (!target) return true

  const values = attributes && typeof attributes === 'object'
    ? Object.values(attributes)
    : []

  return values.some((value) => normalizeAttrText(value) === target)
}


const COLOR_CANONICAL = new Map([
  ['preta', 'preto'], ['pretas', 'preto'], ['pretos', 'preto'], ['preto', 'preto'],
  ['branca', 'branco'], ['brancas', 'branco'], ['brancos', 'branco'], ['branco', 'branco'],
  ['vermelha', 'vermelho'], ['vermelhas', 'vermelho'], ['vermelhos', 'vermelho'], ['vermelho', 'vermelho'],
  ['amarela', 'amarelo'], ['amarelas', 'amarelo'], ['amarelos', 'amarelo'], ['amarelo', 'amarelo'],
  ['cinza', 'cinza'], ['cinzas', 'cinza'],
  ['azul', 'azul'], ['azuis', 'azul'],
  ['verde', 'verde'], ['verdes', 'verde'],
  ['rosa', 'rosa'], ['rosas', 'rosa'],
  ['roxa', 'roxo'], ['roxas', 'roxo'], ['roxos', 'roxo'], ['roxo', 'roxo'],
  ['bege', 'bege'], ['beges', 'bege'],
  ['marrom', 'marrom'], ['marrons', 'marrom'],
  ['vinho', 'vinho'], ['vinhos', 'vinho'],
  ['laranja', 'laranja'], ['laranjas', 'laranja'],
  ['dourada', 'dourado'], ['douradas', 'dourado'], ['dourados', 'dourado'], ['dourado', 'dourado'],
  ['prateada', 'prateado'], ['prateadas', 'prateado'], ['prateados', 'prateado'], ['prateado', 'prateado'],
])

function canonicalColorToken(value) {
  const token = normalizeAttrText(value).replace(/[^a-z0-9]+/g, '')
  return COLOR_CANONICAL.get(token) || token
}

function textMatchesColor(value, requestedColor) {
  if (!requestedColor) return true
  const target = canonicalColorToken(requestedColor)
  if (!target) return true

  const tokens = normalizeAttrText(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

  return tokens.some((token) => canonicalColorToken(token) === target)
}

function variationMatchesColor(attributes, requestedColor) {
  if (!requestedColor) return true
  const values = attributes && typeof attributes === 'object'
    ? Object.values(attributes)
    : []
  return values.some((value) => textMatchesColor(value, requestedColor))
}

/**
 * Consulta em lote as variações dos candidatos e transforma em evidência
 * factual de tamanho/cor/disponibilidade. Uma única chamada PostgREST,
 * sem N+1 e sem fallback legado.
 */
export async function fetchShadowCatalogEvidence({
  products = [],
  requestedSize = null,
  requestedColor = null,
} = {}, deps = {}) {
  const { supabaseConfig, fetchImpl, timeoutMs = 5000 } = deps
  const safeProducts = Array.isArray(products)
    ? products.filter((p) => p?.id).slice(0, 100)
    : []

  if (!supabaseConfig?.baseUrl || safeProducts.length === 0) {
    return { ok: true, facts: {}, error_code: null }
  }

  const ids = [...new Set(safeProducts.map((p) => String(p.id)))]
  const fetchFn = fetchImpl ?? fetch
  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const idsParam = encodeURIComponent(`(${ids.join(',')})`)
    const url = `${supabaseConfig.baseUrl}/rest/v1/shadow_product_variations` +
      `?shadow_product_id=in.${idsParam}` +
      '&select=shadow_product_id,stock_quantity,attributes'

    const res = await fetchFn(url, {
      headers: supabaseConfig.headers,
      signal: controller.signal,
    })
    clearTimeout(timeoutHandle)

    if (!res.ok) {
      return { ok: false, facts: {}, error_code: 'source_unavailable' }
    }

    const rows = await res.json().catch(() => null)
    if (!Array.isArray(rows)) {
      return { ok: false, facts: {}, error_code: 'source_invalid_response' }
    }

    const grouped = new Map()
    for (const row of rows) {
      const pid = String(row?.shadow_product_id || '')
      if (!pid) continue
      if (!grouped.has(pid)) grouped.set(pid, [])
      grouped.get(pid).push(row)
    }

    const facts = {}

    for (const product of safeProducts) {
      const pid = String(product.id)
      const allRows = grouped.get(pid) || []
      const sizeRows = requestedSize
        ? allRows.filter((row) => variationMatchesSize(row?.attributes, requestedSize))
        : allRows

      const sizeConfirmed = requestedSize ? sizeRows.length > 0 : null
      const colorInName = requestedColor
        ? textMatchesColor(product?.nome, requestedColor)
        : true
      const colorInVariation = requestedColor
        ? allRows.some((row) => variationMatchesColor(row?.attributes, requestedColor))
        : true
      const colorConfirmed = requestedColor
        ? Boolean(colorInName || colorInVariation)
        : null

      let relevantRows = sizeRows
      if (requestedColor && !colorInName) {
        relevantRows = relevantRows.filter((row) =>
          variationMatchesColor(row?.attributes, requestedColor)
        )
      }

      let status = 'UNKNOWN'
      let reason = 'NO_VARIATIONS'

      if (requestedSize && !sizeConfirmed) {
        reason = 'SIZE_NOT_FOUND'
      } else if (requestedColor && !colorConfirmed) {
        reason = 'COLOR_NOT_FOUND'
      } else if (product?.selling_out_of_stock === true) {
        status = 'AVAILABLE'
        reason = 'SELLING_OUT_OF_STOCK_ALLOWED'
      } else if (relevantRows.length > 0) {
        const quantities = relevantRows
          .map((row) => normalizeNumber(row?.stock_quantity))
          .filter((n) => n !== null)

        if (quantities.some((n) => n > 0)) {
          status = 'AVAILABLE'
          reason = requestedSize ? 'SIZE_IN_STOCK' : 'PRODUCT_IN_STOCK'
        } else if (
          quantities.length === relevantRows.length &&
          quantities.every((n) => n === 0)
        ) {
          status = 'OUT_OF_STOCK'
          reason = requestedSize ? 'SIZE_OUT_OF_STOCK' : 'PRODUCT_OUT_OF_STOCK'
        } else {
          reason = 'STOCK_NOT_DETERMINISTIC'
        }
      }

      facts[pid] = {
        status,
        reason,
        sizeConfirmed,
        colorConfirmed,
        requestedSize,
        requestedColor,
      }
    }

    return { ok: true, facts, error_code: null }
  } catch (err) {
    clearTimeout(timeoutHandle)
    return {
      ok: false,
      facts: {},
      error_code: err?.name === 'AbortError' ? 'source_timeout' : 'source_unavailable',
    }
  }
}

/**
 * Verifica disponibilidade real no Mirror para um produto já identificado.
 * Nunca infere estoque pela existência do produto.
 *
 * AVAILABLE     -> ao menos uma variação relevante tem stock_quantity > 0
 * OUT_OF_STOCK  -> variação relevante existe, mas todas têm estoque 0
 * UNKNOWN       -> sem variações ou tamanho solicitado não encontrado
 */
export async function fetchShadowProductAvailability({
  shadowProductId,
  requestedSize = null,
} = {}, deps = {}) {
  const { supabaseConfig, fetchImpl, timeoutMs = 3500 } = deps
  if (!shadowProductId || !supabaseConfig?.baseUrl) {
    return { status: 'UNKNOWN', reason: 'INVALID_INPUT' }
  }

  const fetchFn = fetchImpl ?? fetch
  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const url = `${supabaseConfig.baseUrl}/rest/v1/shadow_product_variations` +
      `?shadow_product_id=eq.${encodeURIComponent(shadowProductId)}` +
      '&select=stock_quantity,attributes,selling_out_of_stock,balance_raw'

    const res = await fetchFn(url, {
      headers: supabaseConfig.headers,
      signal: controller.signal,
    })
    clearTimeout(timeoutHandle)

    if (!res.ok) return { status: 'UNKNOWN', reason: 'SOURCE_UNAVAILABLE' }

    const rows = await res.json().catch(() => null)
    if (!Array.isArray(rows) || rows.length === 0) {
      return { status: 'UNKNOWN', reason: 'NO_VARIATIONS' }
    }

    const relevant = rows.filter((row) => variationMatchesSize(row?.attributes, requestedSize))
    if (relevant.length === 0) {
      return { status: 'UNKNOWN', reason: 'SIZE_NOT_FOUND', requestedSize }
    }

    const quantities = relevant
      .map((row) => Number(row?.stock_quantity))
      .filter((n) => Number.isFinite(n))

    if (quantities.some((n) => n > 0)) {
      return {
        status: 'AVAILABLE',
        reason: requestedSize ? 'SIZE_IN_STOCK' : 'PRODUCT_IN_STOCK',
        requestedSize,
      }
    }

    if (quantities.length === relevant.length && quantities.every((n) => n === 0)) {
      return {
        status: 'OUT_OF_STOCK',
        reason: requestedSize ? 'SIZE_OUT_OF_STOCK' : 'PRODUCT_OUT_OF_STOCK',
        requestedSize,
      }
    }

    return { status: 'UNKNOWN', reason: 'STOCK_NOT_DETERMINISTIC', requestedSize }
  } catch (err) {
    clearTimeout(timeoutHandle)
    return {
      status: 'UNKNOWN',
      reason: err?.name === 'AbortError' ? 'SOURCE_TIMEOUT' : 'SOURCE_UNAVAILABLE',
      requestedSize,
    }
  }
}

/**
 * Busca a linha fixa de knowledge (title=eq.knowledge_gabriela_supabase_completo).
 * Mesma URL/select já usados hoje em api/webhook.js (buscarKnowledge).
 *
 * @param {{ supabaseConfig: {baseUrl: string, headers: object}, fetchImpl?: Function }} deps
 * @returns {Promise<{ ok: boolean, knowledge: {title,content,category}|null }>}
 */
export async function fetchGabrielaKnowledge(deps = {}) {
  const { supabaseConfig, fetchImpl, timeoutMs } = deps
  const fetchFn = fetchImpl ?? fetch

  // timeoutMs é opcional — sem ele (uso atual de api/webhook.js), comportamento
  // idêntico a antes desta etapa. A PRIME Bridge (Etapa 4) passa um timeout
  // curto pra nunca segurar o fluxo principal caso o Supabase trave.
  const controller = timeoutMs ? new AbortController() : null
  const timeoutHandle = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null

  try {
    const res = await fetchFn(
      `${supabaseConfig.baseUrl}/rest/v1/knowledge?title=eq.${KNOWLEDGE_TITLE}&select=title,content,category`,
      { headers: supabaseConfig.headers, ...(controller ? { signal: controller.signal } : {}) }
    )
    if (timeoutHandle) clearTimeout(timeoutHandle)

    if (!res.ok) {
      return { ok: false, knowledge: null }
    }

    const rows = await res.json()
    if (!Array.isArray(rows) || rows.length === 0) {
      return { ok: true, knowledge: null }
    }

    return { ok: true, knowledge: rows[0] }
  } catch (err) {
    if (timeoutHandle) clearTimeout(timeoutHandle)
    return { ok: false, knowledge: null }
  }
}

/**
 * Orquestra catálogo cru + knowledge + customerMemory em paralelo, retornando
 * um contrato neutro. Não aplica ranking nem decide retry — quem chama decide
 * o que fazer com `products` (aplicar score, filtrar, re-consultar, etc).
 *
 * @param {string} pergunta
 * @param {{ contextId?: string, supabaseConfig: object, fetchImpl?: Function }} options
 */
export async function buildGabrielaSharedContext(pergunta, options = {}) {
  const { contextId, supabaseConfig, fetchImpl } = options

  const [catalogResult, knowledgeResult, customerMemory] = await Promise.all([
    fetchProductsCatalog({ supabaseConfig, fetchImpl }),
    fetchGabrielaKnowledge({ supabaseConfig, fetchImpl }),
    getMemoryBlock(contextId),
  ])

  return {
    products: catalogResult.products,
    knowledge: knowledgeResult.knowledge,
    customerMemory,
    metadata: {
      pergunta,
      timestamp: new Date().toISOString(),
    },
  }
}
