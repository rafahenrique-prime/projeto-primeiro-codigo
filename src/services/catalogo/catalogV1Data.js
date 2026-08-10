// Catálogo V1 — camada de dados (Fase 1)
//
// Só leitura. Não escreve nada no Supabase, não conhece React, não decide
// badge/status/apresentação — isso é responsabilidade da Fase 2 (função de
// derivação de status, ainda não implementada). Aqui só busca e agrega.
//
// 3 queries em paralelo (Promise.all), nenhuma delas por produto/variação
// individual — evita N+1 no volume atual (~555 produtos, ~2130 variações,
// ~20 exceções abertas).

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
}

const PRODUCTS_SELECT = [
  'id', 'nome', 'preco', 'price_discount', 'price_original',
  'preco_pix', 'categoria', 'categoria_breadcrumb', 'imagem', 'link',
  'marca', 'descricao', 'sell_without_stock', 'bagy_product_id', 'source',
  'synced_at', 'codigo', 'status',
].join(',')

const VARIATIONS_SELECT = ['product_id', 'stock_quantity', 'sell_without_stock'].join(',')

const VARIATION_DETAIL_SELECT = [
  'id', 'bagy_variation_id', 'attributes', 'preco', 'preco_compare',
  'stock_quantity', 'sell_without_stock', 'imagem_principal',
].join(',')

const EXCEPTIONS_SELECT = ['link', 'tipo', 'detalhe'].join(',')

const PAGE_SIZE = 1000 // limite default de "max rows" do PostgREST/Supabase — confirmado na prática (206 Partial Content)

/**
 * Busca TODAS as linhas de uma query, paginando via header Range enquanto o
 * Supabase devolver uma página cheia (206 Partial Content). Necessário
 * porque o PostgREST corta silenciosamente em `PAGE_SIZE` linhas por padrão
 * — sem paginação, `product_variations` (2130 linhas) perderia ~53% dos
 * dados sem erro nenhum (bug real encontrado e corrigido nesta fase).
 */
async function fetchAllJson(url) {
  const linhas = []
  let offset = 0
  for (;;) {
    const res = await fetch(url, {
      headers: { ...headers, Range: `${offset}-${offset + PAGE_SIZE - 1}` },
    })
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}: ${await res.text()}`)
    const pagina = await res.json()
    linhas.push(...pagina)
    if (pagina.length < PAGE_SIZE) break // última página (parcial ou vazia)
    offset += PAGE_SIZE
  }
  return linhas
}

/**
 * Agrega product_variations por product_id. Não decide "Venda sem estoque"
 * vs quantidade (isso depende de products.sell_without_stock, campo do
 * produto — decisão da Fase 2). Aqui só soma o que existe:
 * - variationCount: total de variações do produto
 * - stockTotal: soma de stock_quantity, contando só as não-nulas
 * - hasStockData: true se pelo menos 1 variação tinha stock_quantity != null
 *   (permite distinguir "soma 0 porque tem 1 variação com estoque 0 real"
 *   de "soma 0 porque nenhuma variação tem stock_quantity preenchido")
 * - sellWithoutStockVariationCount: quantas variações têm sell_without_stock
 *   true (informativo — a decisão de apresentação continua sendo do campo
 *   do produto, nunca de 9999, que nunca é gravado no Supabase)
 */
export function buildVariationAggregates(variations) {
  const map = new Map()
  for (const v of variations) {
    const atual = map.get(v.product_id) || {
      variationCount: 0,
      stockTotal: 0,
      hasStockData: false,
      sellWithoutStockVariationCount: 0,
    }
    atual.variationCount += 1
    if (v.stock_quantity !== null && v.stock_quantity !== undefined) {
      atual.stockTotal += Number(v.stock_quantity)
      atual.hasStockData = true
    }
    if (v.sell_without_stock === true) atual.sellWithoutStockVariationCount += 1
    map.set(v.product_id, atual)
  }
  return map
}

/**
 * Agrega bagy_sync_exceptions (já filtradas por status='aberto' na query)
 * por link. Um link pode ter mais de uma exceção aberta ao mesmo tempo
 * (ex. pagina_invalida E duplicate_conflict) — por isso Map<link, Exception[]>,
 * nunca Map<link, tipo>. Nenhuma exceção é sobrescrita por outra do mesmo
 * link; todas ficam guardadas. A escolha de qual badge exibir quando há mais
 * de uma (prioridade 404 > duplicate_conflict > pagina_invalida > outros) é
 * responsabilidade da Fase 2, não desta camada.
 */
export function buildExceptionsByLink(exceptions) {
  const map = new Map()
  for (const e of exceptions) {
    const lista = map.get(e.link) || []
    lista.push(e)
    map.set(e.link, lista)
  }
  return map
}

/**
 * Carrega os 3 conjuntos de dados da V1 em paralelo e devolve já agregado.
 * `products` continua uma lista simples (a tabela/filtros iteram nela
 * diretamente); `variationAggregates`/`exceptionsByLink` são Maps por
 * product_id/link para lookup O(1) linha a linha, sem query por produto.
 *
 * `bagy_product_id != null` é o sinal principal de "produto integrado à
 * Bagy" — `source` vem junto só como informação complementar (pode ficar
 * desatualizado em edições manuais de um produto já sincronizado), nunca
 * deve ser usado sozinho pra decidir origem.
 */
export async function loadCatalogV1Data() {
  const [products, variations, exceptions] = await Promise.all([
    fetchAllJson(`${SUPABASE_URL}/rest/v1/products?select=${PRODUCTS_SELECT}&order=nome.asc`),
    fetchAllJson(`${SUPABASE_URL}/rest/v1/product_variations?select=${VARIATIONS_SELECT}`),
    fetchAllJson(`${SUPABASE_URL}/rest/v1/bagy_sync_exceptions?select=${EXCEPTIONS_SELECT}&status=eq.aberto`),
  ])

  return {
    products,
    variationAggregates: buildVariationAggregates(variations),
    exceptionsByLink: buildExceptionsByLink(exceptions),
  }
}

/**
 * Busca as variações COMPLETAS de 1 produto só — usada pelo ProdutoDrawer
 * (Fase 5), sob demanda, quando o usuário abre o painel daquele produto.
 * Nunca pré-carregada em massa (ver VARIATIONS_SELECT, que traz só os 3
 * campos necessários pra tabela/agregado); aqui traz tudo que o drawer
 * precisa exibir (attributes, preços, imagem por variação).
 */
export async function getVariationsForProduct(productId) {
  return fetchAllJson(
    `${SUPABASE_URL}/rest/v1/product_variations?select=${VARIATION_DETAIL_SELECT}&product_id=eq.${productId}&order=id.asc`
  )
}
