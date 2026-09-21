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

const PRODUCTS_SELECT_OFICIAL = 'id,nome,categoria,preco,imagem,link,codigo,' +
  'preco_tabela,preco_pix,' +
  'parcelamento_padrao_vezes,parcelamento_padrao_valor_parcela,parcelamento_padrao_com_juros,' +
  'parcelamento_max_vezes,parcelamento_valor_parcela,parcelamento_com_juros'

// CONTRATO CATÁLOGO PRIME (Etapa 1, só quando deps.contratoV2 === true):
// select estendido ganha marca (campo já sincronizado pelo mapper mas nunca
// lido pela Gaby), status e sell_without_stock (insumos da disponibilidade
// e do filtro de ativos), bagy_product_id/source (insumos da canônica).
const PRODUCTS_SELECT_CONTRATO_V2 = PRODUCTS_SELECT_OFICIAL + ',' +
  'marca,status,sell_without_stock,bagy_product_id,source'

// CONTRATO CATÁLOGO PRIME: a Gaby só enxerga produtos ativos. Whitelist
// explícita com os vocabulários REAIS hoje gravados na coluna (medido em
// 2026-09-21: 'active' em 566 linhas, 'Ativo' em 8 legadas, 'inactive' em
// 5) — valor desconhecido/futuro fica FORA por padrão, nunca dentro. O
// plano original dizia status=eq.ativo, mas 'ativo' não existe na coluna:
// um filtro por ele esvaziaria o catálogo inteiro da Gaby.
const PRODUCTS_FILTRO_ATIVOS = 'status=in.(active,Ativo,ativo)'

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
export async function fetchProductsCatalog(deps = {}) {
  const { supabaseConfig, fetchImpl, timeoutMs } = deps
  const fetchFn = fetchImpl ?? fetch

  // timeoutMs é opcional — sem ele (uso atual de api/webhook.js), nenhum
  // AbortController é criado e o fetch se comporta exatamente como antes desta
  // etapa. Com ele (uso da PRIME Bridge, que já tinha esse timeout próprio em
  // fetchProductsFromSource), preserva o error_code 'source_timeout' que os
  // testes da Bridge já esperavam antes da extração.
  const controller = timeoutMs ? new AbortController() : null
  const timeoutHandle = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null

  try {
    // CONTRATO CATÁLOGO PRIME: deps.contratoV2 liga select estendido +
    // filtro de ativos. Default false = URL idêntica à de sempre (nenhuma
    // mudança de comportamento pra quem não pedir o contrato novo).
    const select = deps.contratoV2 === true ? PRODUCTS_SELECT_CONTRATO_V2 : PRODUCTS_SELECT_OFICIAL
    const filtro = deps.contratoV2 === true ? `&${PRODUCTS_FILTRO_ATIVOS}` : ''
    const res = await fetchFn(
      `${supabaseConfig.baseUrl}/rest/v1/products?select=${select}${filtro}`,
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

    return { ok: true, products }
  } catch (err) {
    if (timeoutHandle) clearTimeout(timeoutHandle)
    const code = err?.name === 'AbortError' ? 'source_timeout' : 'source_unavailable'
    return { ok: false, products: [], error_code: code }
  }
}

/**
 * CONTRATO CATÁLOGO PRIME: busca as variações de um conjunto de produtos
 * (insumo da disponibilidade DISPONIVEL/ESGOTADO/A_CONFIRMAR/INDISPONIVEL).
 * Leitura única por lote de ids — usada pelo webhook depois do top-5, nunca
 * no catálogo inteiro. Se as colunas novas (stock_real/active) ainda não
 * existirem no schema alvo (ex.: produção antes da migration), o PostgREST
 * responde 400 e esta função devolve ok:false — o caller degrada pra
 * A_CONFIRMAR em vez de inventar disponibilidade.
 *
 * @param {{ supabaseConfig: {baseUrl: string, headers: object}, fetchImpl?: Function }} deps
 * @param {string[]} productIds
 * @returns {Promise<{ ok: boolean, variations: Array, error_code?: string }>}
 */
export async function fetchVariationsPorProdutos(deps = {}, productIds = []) {
  const { supabaseConfig, fetchImpl } = deps
  const fetchFn = fetchImpl ?? fetch

  if (!Array.isArray(productIds) || productIds.length === 0) {
    return { ok: true, variations: [] }
  }

  const select = 'product_id,bagy_variation_id,attributes,preco,stock_real,stock_quantity,sell_without_stock,active'
  const ids = productIds.map((id) => encodeURIComponent(id)).join(',')

  try {
    const res = await fetchFn(
      `${supabaseConfig.baseUrl}/rest/v1/product_variations?select=${select}&product_id=in.(${ids})`,
      { headers: supabaseConfig.headers }
    )
    if (!res.ok) {
      return { ok: false, variations: [], error_code: 'source_unavailable' }
    }
    let variations
    try {
      variations = await res.json()
    } catch {
      return { ok: false, variations: [], error_code: 'source_invalid_response' }
    }
    if (!Array.isArray(variations)) {
      return { ok: false, variations: [], error_code: 'source_invalid_response' }
    }
    return { ok: true, variations }
  } catch {
    return { ok: false, variations: [], error_code: 'source_unavailable' }
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
