// Auditoria Bagy V2 — camada de leitura (Fase 1)
//
// Lê exclusivamente dados já produzidos pelo sincronizador oficial
// (products, bagy_sync_runs, bagy_sync_exceptions) — NÃO executa scraping
// próprio, NÃO consulta sitemap.xml/JSON-LD, NÃO reimplementa a Auditoria
// antiga (api/bagy-audit.js). Só leitura, mesmo padrão de paginação via
// Range já validado no Catálogo V1 (catalogV1Data.js).

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
}

const PAGE_SIZE = 1000 // mesmo limite default do PostgREST já confirmado no Catálogo V1

/**
 * Busca TODAS as linhas de uma query, paginando via header Range enquanto o
 * Supabase devolver uma página cheia (206 Partial Content) — evita o mesmo
 * truncamento silencioso já encontrado e corrigido na Fase 1 do Catálogo V1.
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
    if (pagina.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return linhas
}

const RUN_LIST_SELECT = [
  'run_id', 'mode', 'trigger', 'started_at', 'finished_at', 'duration_ms',
  'total_analisado', 'sincronizados', 'sem_mudanca', 'total_404',
  'pagina_invalida', 'duplicate_conflict', 'erro_rede', 'retries_executados',
  'variacoes_inseridas', 'variacoes_atualizadas', 'status_final',
].join(',')
// Sem `detalhes` (jsonb pesado, array por produto) — listagem fica leve;
// detalhes completos só sob demanda em getAuditRunById.

const RUN_DETAIL_SELECT = [...RUN_LIST_SELECT.split(','), 'detalhes'].join(',')

const EXCEPTION_SELECT = [
  'id', 'link', 'tipo', 'detalhe', 'primeira_deteccao', 'ultima_deteccao',
  'run_id_ultima_deteccao', 'status', 'resolvido_em',
].join(',')

/**
 * Contadores de origem (Bagy/Manual) — mesmo sinal já validado no Catálogo V1
 * (bagy_product_id como sinal principal de origem, nunca `source` sozinho).
 */
export async function getProductOriginCounts() {
  const products = await fetchAllJson(`${SUPABASE_URL}/rest/v1/products?select=bagy_product_id`)
  const total = products.length
  const sincronizados = products.filter((p) => p.bagy_product_id != null).length
  return { total, sincronizados, manuais: total - sincronizados }
}

/**
 * Contadores da fila de exceções, por status e por tipo. Uma query só —
 * agregação client-side (volume atual: ~20-30 linhas).
 */
export async function getExceptionCounts() {
  const exceptions = await fetchAllJson(
    `${SUPABASE_URL}/rest/v1/bagy_sync_exceptions?select=status,tipo`
  )
  const porStatus = { aberto: 0, ignorado: 0, resolvido: 0 }
  const porTipo = { '404': 0, duplicate_conflict: 0, pagina_invalida: 0 }
  for (const e of exceptions) {
    if (porStatus[e.status] !== undefined) porStatus[e.status] += 1
    if (porTipo[e.tipo] !== undefined) porTipo[e.tipo] += 1
  }
  return { total: exceptions.length, porStatus, porTipo }
}

/**
 * Última execução do sincronizador (mais recente por started_at). Usa o
 * índice já existente (bagy_sync_runs_started_at_idx) via order+limit=1 —
 * não traz o histórico inteiro pra achar 1 linha.
 */
export async function getLatestRun() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/bagy_sync_runs?select=${RUN_LIST_SELECT}&order=started_at.desc&limit=1`,
    { headers }
  )
  if (!res.ok) throw new Error(`getLatestRun → HTTP ${res.status}: ${await res.text()}`)
  const rows = await res.json()
  return rows[0] || null
}

/**
 * Histórico de execuções, leve (sem `detalhes` jsonb) — paginado via Range
 * caso o volume um dia ultrapasse PAGE_SIZE (hoje é pequeno, mas o padrão
 * evita truncamento silencioso independentemente do volume atual).
 */
export async function getAuditRuns() {
  return fetchAllJson(
    `${SUPABASE_URL}/rest/v1/bagy_sync_runs?select=${RUN_LIST_SELECT}&order=started_at.desc`
  )
}

/**
 * 1 execução completa, incluindo `detalhes` (array por produto) — sob
 * demanda, só quando o usuário abre aquela execução específica.
 */
export async function getAuditRunById(runId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/bagy_sync_runs?select=${RUN_DETAIL_SELECT}&run_id=eq.${encodeURIComponent(runId)}`,
    { headers }
  )
  if (!res.ok) throw new Error(`getAuditRunById → HTTP ${res.status}: ${await res.text()}`)
  const rows = await res.json()
  return rows[0] || null
}

/**
 * Fila de exceções, com filtro opcional por status/tipo (aplicado via
 * query string — filtragem no servidor, não client-side, já que o volume
 * poderia crescer independente do que a UI mostra por padrão).
 */
export async function getExceptions({ status, tipo } = {}) {
  const params = new URLSearchParams({ select: EXCEPTION_SELECT, order: 'ultima_deteccao.desc' })
  if (status) params.set('status', `eq.${status}`)
  if (tipo) params.set('tipo', `eq.${tipo}`)
  return fetchAllJson(`${SUPABASE_URL}/rest/v1/bagy_sync_exceptions?${params.toString()}`)
}

/**
 * Fase 5 — alterna status de 1 exceção. `bagy_sync_exceptions` revoga
 * INSERT/UPDATE/DELETE de anon/authenticated (migration 021), então o
 * frontend nunca faz PATCH direto — passa por `system-tools?tool=
 * bagy-exception-status` (service_role, escopo estrito: só `status`, só
 * 'aberto'/'ignorado' nesta fase). Devolve a exceção atualizada.
 */
async function setExceptionStatus(id, status, actionSecret) {
  const res = await fetch('/api/system-tools?tool=bagy-exception-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status, actionSecret }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
  return body.exception
}

export function ignoreException(id, actionSecret) {
  return setExceptionStatus(id, 'ignorado', actionSecret)
}

export function reactivateException(id, actionSecret) {
  return setExceptionStatus(id, 'aberto', actionSecret)
}

/**
 * Fase 7 — "Verificar agora" (mode='dry_run') e "Sincronizar agora"
 * (mode='write', exige confirmação explícita já feita pela UI antes de
 * chamar esta função). Chama exclusivamente `system-tools?tool=
 * bagy-sync-run-ui` — nunca reimplementa scraping/mapper/regra de estoque/
 * RPC/retry aqui; toda essa lógica continua só no sincronizador oficial
 * (api/_bagySyncService.js). BAGY_SYNC_SECRET nunca é usado nem conhecido
 * pelo frontend — essa rota UI não exige esse secret. Em vez disso exige
 * `actionSecret` (senha de ação digitada pelo usuário no modal, nunca
 * persistida) comparada no backend com BAGY_UI_ACTION_SECRET.
 */
export async function runBagySyncViaUI(mode, actionSecret) {
  const body = mode === 'write'
    ? { mode: 'write', confirm: 'SIM', actionSecret }
    : { mode: 'dry_run', actionSecret }
  const res = await fetch('/api/system-tools?tool=bagy-sync-run-ui', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const responseBody = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(responseBody.error || `HTTP ${res.status}`)
  return responseBody
}

/**
 * Map<link, {id, nome, preco, imagem}> — 1 query só, usada pra resolver nome
 * de produto a partir do `link` de uma exceção sem fazer query por linha
 * (zero N+1). `link` não é chave única em `products` (existem duplicatas —
 * ver BAGY-SYNC.md §4), então em caso de colisão o último encontrado vence;
 * suficiente pra exibição, nunca usado pra decidir qual produto abrir num
 * `duplicate_conflict` — isso usa `getProductsIndex()` (também tem `byId`).
 */
export async function getProductsByLink() {
  const products = await fetchAllJson(`${SUPABASE_URL}/rest/v1/products?select=id,link,nome,preco,imagem`)
  const map = new Map()
  for (const p of products) {
    if (p.link) map.set(p.link, p)
  }
  return map
}

/**
 * Fase 6 ("Ver no Catálogo") — mesma 1 query de getProductsByLink, mas
 * devolve os dois índices de uma vez (`byLink` e `byId`) pra evitar uma
 * segunda leitura de `products` na mesma página. `byId` é o que permite abrir
 * com segurança cada lado de um `duplicate_conflict` (2 IDs reais no
 * `detalhe` da exceção) sem escolher arbitrariamente entre eles.
 */
export async function getProductsIndex() {
  const products = await fetchAllJson(`${SUPABASE_URL}/rest/v1/products?select=id,link,nome,preco,imagem`)
  const byLink = new Map()
  const byId = new Map()
  for (const p of products) {
    if (p.link) byLink.set(p.link, p)
    byId.set(p.id, p)
  }
  return { byLink, byId }
}

/**
 * Status geral de saúde — função pura, sem I/O, recebe os dados já
 * carregados e devolve só a decisão (testável isoladamente, mesmo padrão
 * de derivarStatusCatalogo no Catálogo V1).
 *
 * Regra (mínima, deliberadamente simples):
 *   🔴 problema      — última run com status_final='falha'
 *   🟡 atenção        — última run 'sucesso_com_excecoes' OU há exceções abertas
 *   🟢 operacional    — última run 'sucesso' E nenhuma exceção aberta
 *   ⚪ desconhecido   — nenhuma run encontrada ainda
 *
 * NÃO usa `erro_fatal` (coluna sempre null, nunca escrita por código nenhum
 * — confirmado no diagnóstico da Fase 1) nem depende de `resolvido_em`
 * (também nunca escrita automaticamente) para nenhuma decisão.
 */
export function derivarStatusGeral({ latestRun, openExceptionsCount }) {
  if (!latestRun) {
    return { status: 'desconhecido', label: 'Sem execuções registradas', reason: 'nenhuma linha em bagy_sync_runs ainda' }
  }
  if (latestRun.status_final === 'falha') {
    return { status: 'problema', label: 'Problema', reason: 'última execução terminou com status_final=falha' }
  }
  if (latestRun.status_final === 'sucesso_com_excecoes' || openExceptionsCount > 0) {
    return {
      status: 'atencao',
      label: 'Atenção necessária',
      reason: latestRun.status_final === 'sucesso_com_excecoes'
        ? 'última execução teve exceções (sucesso_com_excecoes)'
        : `${openExceptionsCount} exceção(ões) aberta(s) na fila`,
    }
  }
  return { status: 'operacional', label: 'Operacional', reason: 'última execução com sucesso e nenhuma exceção aberta' }
}

/**
 * Carrega o conjunto base do dashboard em paralelo — 1 chamada por fonte,
 * nenhuma por produto/exceção/run individual.
 */
export async function loadAuditoriaV2Dashboard() {
  const [productCounts, exceptionCounts, latestRun] = await Promise.all([
    getProductOriginCounts(),
    getExceptionCounts(),
    getLatestRun(),
  ])
  const statusGeral = derivarStatusGeral({
    latestRun,
    openExceptionsCount: exceptionCounts.porStatus.aberto,
  })
  return { productCounts, exceptionCounts, latestRun, statusGeral }
}
