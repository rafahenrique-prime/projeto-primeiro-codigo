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
    const res = await fetchFn(
      `${supabaseConfig.baseUrl}/rest/v1/products?select=${PRODUCTS_SELECT_OFICIAL}`,
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
