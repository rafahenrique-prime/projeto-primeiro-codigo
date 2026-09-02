/**
 * api/_bagySyncService.js
 *
 * Orquestrador do sincronizador Bagy → Supabase. Junta client (leitura) +
 * mapper (regras) + compare (diff) + supabase (escrita) + logger, sem
 * conhecer os detalhes de nenhuma das camadas.
 *
 * Aceita um produto por vez (bagy_product_id OU link) ou um array — o
 * caller decide a origem da lista (sincronização completa, incremental,
 * webhook, manual) sem precisar mudar nada aqui. Nada neste arquivo cria
 * cron, agenda nada, nem chama a si mesmo em loop — é só a função pura de
 * "sincronizar isto agora, uma vez".
 *
 * Modos:
 *   mode: 'dry_run' (padrão) → nunca escreve, só devolve o que faria
 *   mode: 'write'             → aplica exatamente o que o dry_run mostraria
 *
 * Nunca usa delete-all, nunca substitui tabela inteira — sempre update/insert
 * pontual por registro (ver api/_bagySyncSupabase.js).
 */

import { fetchBagyProductByLink } from './_bagySyncClient.js'
import { mapProductRow, mapVariationRows } from './_bagySyncMapper.js'
import { diffProductFields, diffVariations } from './_bagySyncCompare.js'
import {
  getProductRowsByLink,
  getProductByBagyId,
  getVariationsByProductId,
  syncProductTransactional,
  insertSyncRun,
  getExceptionByLinkTipo,
  insertException,
  touchException,
} from './_bagySyncSupabase.js'
import { createRunLogger } from './_bagySyncLogger.js'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Concorrência controlada — só orquestra (limita workers simultâneos,
// preserva ordem via índice pré-alocado, aguarda todos). Não decide nada
// sobre erro/sucesso de item: `worker` é responsável por nunca lançar (o
// tratamento de erro por produto continua vivendo em quem chama, com o
// mesmo shape que o for..of sequencial sempre produziu — ver
// processarItemBatch abaixo). Genérico o suficiente pra ser testado
// isoladamente com workers falsos, sem precisar mockar Bagy/Supabase.
export async function processWithConcurrency(items, limit, worker) {
  const results = new Array(items.length)
  let nextIndex = 0

  async function runWorker() {
    while (true) {
      const i = nextIndex++
      if (i >= items.length) return
      results[i] = await worker(items[i], i)
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length))
  await Promise.all(Array.from({ length: workerCount }, runWorker))

  return results
}

/**
 * Classifica o resultado de um syncProduct que falhou (result.ok === false)
 * numa das 4 categorias conhecidas — usada tanto pelo retry (só a primeira
 * categoria é retentada) quanto pela fila de exceções (as outras 3 viram
 * linha em bagy_sync_exceptions).
 *
 * 'erro_rede'        → falha de fetch pura (sem resposta HTTP nenhuma —
 *                       timeout, conexão recusada/terminada). Único caso
 *                       elegível a retry automático.
 * '404'              → Bagy respondeu, produto não existe/foi removido.
 * 'pagina_invalida'  → Bagy respondeu 200, mas sem window.dooca.product
 *                       válido (marcador ausente ou JSON quebrado).
 * 'duplicate_conflict' → ambiguidade de dado no Supabase (link duplicado
 *                       sem forma segura de desempate).
 * null               → erro de outra natureza (ex. escrita bloqueada por
 *                       anomalia de estoque) — não é retentável nem entra
 *                       na fila de exceções desta etapa.
 */
export function classificarFalha(result) {
  if (result.duplicateConflict) return 'duplicate_conflict'
  if (result.produtoNaoEncontradoNaBagy) return '404'
  if (result.paginaInvalida) return 'pagina_invalida'
  if (result.erroDeRede) return 'erro_rede'
  return null
}

/**
 * Resolve qual linha de `products` usar quando há mais de uma com o mesmo
 * link (link não é UNIQUE — duplicatas reais já existem no catálogo).
 * Nunca escolhe arbitrariamente: usa bagy_product_id como desempate
 * primário (é a chave estável de verdade), depois "só 1 linha já é
 * bagy_sync" como fallback razoável; se nenhuma das duas resolver,
 * devolve DUPLICATE_CONFLICT e quem chamar decide pular o produto.
 */
export function resolveProductRow(rows, bagyProductId) {
  const ids = rows.map((r) => r.id)
  if (rows.length === 0) return { status: 'NOT_FOUND', product: null, rule: null, duplicateCount: 0, ids }
  if (rows.length === 1) return { status: 'OK', product: rows[0], rule: 'single_match', duplicateCount: 1, ids }

  const porBagyId = rows.filter((r) => r.bagy_product_id === bagyProductId)
  if (porBagyId.length === 1) {
    return { status: 'OK', product: porBagyId[0], rule: 'bagy_product_id_match', duplicateCount: rows.length, ids }
  }

  const porSourceSync = rows.filter((r) => r.source === 'bagy_sync')
  if (porSourceSync.length === 1) {
    return { status: 'OK', product: porSourceSync[0], rule: 'single_bagy_sync_source', duplicateCount: rows.length, ids }
  }

  return { status: 'DUPLICATE_CONFLICT', product: null, rule: null, duplicateCount: rows.length, ids }
}

/**
 * Sincroniza UM produto. `input` é { link } ou { bagyProductId } — se vier
 * só bagyProductId, resolve o link a partir do que já está gravado no
 * Supabase (a Dooca não tem endpoint público de "GET por id").
 */
export async function syncProduct(input, { mode = 'dry_run', logger } = {}) {
  const log = logger || createRunLogger(`single-${Date.now()}`)
  const result = { input, mode, ok: false }

  let link
  let bagyProductIdConhecido = input.bagyProductId ?? null

  if (input.link) {
    link = input.link
  } else if (input.bagyProductId) {
    // já sabemos o bagy_product_id — resolve direto por ele, que TEM
    // constraint UNIQUE (sem risco de duplicata aqui).
    const current = await getProductByBagyId(input.bagyProductId)
    log.step('produto_localizado_supabase', { por: 'bagy_product_id', encontrado: !!current })
    if (!current) {
      result.erro = 'bagyProductId informado sem link e produto não existe ainda no Supabase — forneça link para produtos novos'
      log.error('resolucao_link', new Error(result.erro))
      return result
    }
    link = current.link
  } else {
    result.erro = 'input precisa de link ou bagyProductId'
    log.error('input_invalido', new Error(result.erro))
    return result
  }

  // 1) ler da Bagy primeiro — precisamos do bagy.product.id ANTES de
  // resolver qual linha do Supabase usar, pra desambiguar duplicatas de
  // link de forma determinística (ver resolveProductRow).
  const bagy = await fetchBagyProductByLink(link)
  log.step('leitura_bagy', { url: bagy.url, httpStatus: bagy.httpStatus, httpMs: bagy.httpMs, ok: bagy.ok })
  if (!bagy.ok) {
    result.erro = `falha ao ler Bagy: ${bagy.reason}`
    result.bagyHttpStatus = bagy.httpStatus
    result.produtoNaoEncontradoNaBagy = bagy.httpStatus === 404
    // httpStatus === null só acontece quando o fetch() em si lançou exceção
    // (timeout, conexão recusada/terminada) — nunca chegou a existir uma
    // resposta HTTP. É a única classe de erro elegível a retry automático
    // (ver classificarFalha/syncBatch); 200 sem marcador válido (produto
    // "quebrado"/sem window.dooca.product) e qualquer 4xx/5xx != 404 não são
    // rede, são conteúdo — não adianta retentar.
    result.erroDeRede = bagy.httpStatus === null
    result.paginaInvalida = bagy.httpStatus === 200 && !result.produtoNaoEncontradoNaBagy
    log.error('leitura_bagy', new Error(result.erro))
    return result
  }
  bagyProductIdConhecido = bagy.product.id

  // 2) localizar a linha certa em products, tratando duplicatas de link
  const rows = await getProductRowsByLink(link)
  const resolucao = resolveProductRow(rows, bagyProductIdConhecido)
  log.step('produto_localizado_supabase', {
    por: 'link',
    duplicateCount: resolucao.duplicateCount,
    ids: resolucao.ids,
    status: resolucao.status,
    rule: resolucao.rule,
  })

  if (resolucao.status === 'DUPLICATE_CONFLICT') {
    result.erro = `DUPLICATE_CONFLICT — ${resolucao.duplicateCount} linhas com o mesmo link e nenhuma forma segura de escolher qual usar (ids: ${resolucao.ids.join(', ')})`
    result.duplicateConflict = { duplicateCount: resolucao.duplicateCount, ids: resolucao.ids }
    log.error('duplicate_conflict', new Error(result.erro))
    return result
  }

  const current = resolucao.product // null quando status === 'NOT_FOUND' (produto novo, fora de escopo de escrita)
  result.resolucaoProduto = { status: resolucao.status, rule: resolucao.rule, duplicateCount: resolucao.duplicateCount }

  // 3) mapear
  const mappedProduct = mapProductRow(bagy.product, { imagemAtualNoSupabase: current?.imagem })
  const productDiff = diffProductFields(current, mappedProduct)
  log.step('mapeamento_produto', { camposDiferentes: Object.keys(productDiff) })

  // 4) variações — só dá pra mapear/comparar de verdade se o produto já existe
  //    (product_variations.product_id é FK obrigatória); produto novo primeiro
  //    precisa ganhar um id no Supabase.
  let variationDiff = { toInsert: [], toUpdate: [], unchanged: [] }
  let anomalias = []
  let variacoesComAtributoFallback = 0
  if (current) {
    const mappedVariations = mapVariationRows(bagy.product, current.id)
    anomalias = mappedVariations.filter((v) => v._anomalia).map((v) => ({ bagy_variation_id: v.bagy_variation_id, anomalia: v._anomalia }))
    variacoesComAtributoFallback = mappedVariations.filter((v) => v._attributeFallback).length
    const existingVariations = await getVariationsByProductId(current.id)
    variationDiff = diffVariations(existingVariations, mappedVariations)
    log.step('comparacao_variacoes', {
      toInsert: variationDiff.toInsert.length,
      toUpdate: variationDiff.toUpdate.length,
      unchanged: variationDiff.unchanged.length,
      anomalias: anomalias.length,
    })
  } else {
    log.step('comparacao_variacoes', { pulado: 'produto ainda não existe no Supabase — variações entram numa etapa futura de criação de produto' })
  }

  result.ok = true
  result.link = link
  result.bagyProductId = bagy.product.id
  result.produtoExisteNoSupabase = !!current
  result.productUuid = current?.id ?? null
  result.productDiff = productDiff
  result.categoriaFonte = mappedProduct._meta?.categoriaFonte ?? null
  result.imagemMotivo = mappedProduct._meta?.imagemMotivo ?? null
  result.variationDiff = {
    toInsert: variationDiff.toInsert.length,
    toUpdate: variationDiff.toUpdate.length,
    unchanged: variationDiff.unchanged.length,
  }
  result.anomalias = anomalias
  result.variacoesComAtributoFallback = variacoesComAtributoFallback
  result.mudariaAlgo = Object.keys(productDiff).length > 0 || variationDiff.toInsert.length > 0 || variationDiff.toUpdate.length > 0

  if (mode === 'write') {
    if (!current) {
      result.erro = 'escrita de produto novo (INSERT em products) não implementada — este sincronizador só faz UPDATE de produto existente + upsert de variações, por decisão explícita de escopo desta etapa'
      log.error('write_bloqueado', new Error(result.erro))
      return result
    }
    if (anomalias.length > 0) {
      result.erro = `escrita abortada — ${anomalias.length} anomalia(s) de estoque não resolvida(s) pela regra aprovada`
      log.error('write_bloqueado_anomalia', new Error(result.erro))
      return result
    }

    const houveMudancaProduto = Object.keys(productDiff).length > 0
    const variacoesParaEscrever = [
      ...variationDiff.toInsert.map(({ _anomalia, _attributeFallback, ...row }) => row),
      ...variationDiff.toUpdate.map((u) => {
        const { _anomalia, _attributeFallback, ...row } = u.mapped
        return row
      }),
    ]

    if (!houveMudancaProduto && variacoesParaEscrever.length === 0) {
      log.step('escrita_pulada', { motivo: 'nada mudou — nenhuma chamada RPC feita' })
      result.escrito = false
      return result
    }

    const productFields = {}
    for (const campo of Object.keys(productDiff)) productFields[campo] = mappedProduct[campo]

    try {
      const rpcResult = await syncProductTransactional({
        productId: current.id,
        productFields,
        variations: variacoesParaEscrever,
      })
      log.step('escrita_transacional', {
        camposProduto: Object.keys(productFields),
        variacoesEnviadas: variacoesParaEscrever.length,
        rpcResult,
      })
      result.escrito = true
      result.rpcResult = rpcResult
    } catch (e) {
      result.ok = false
      result.erro = `escrita transacional falhou (nada foi gravado — a function é atômica): ${e.message}`
      log.error('escrita_transacional_falhou', e)
      return result
    }
  }

  return result
}

/**
 * Auditoria Bagy V2 — Etapa B: insere um produto COMPLETAMENTE NOVO (nunca
 * visto em products) + suas variações, numa única transação (migration 022,
 * branch p_product_id=NULL de bagy_sync_product_transaction). Reaproveita
 * mapProductRow/mapVariationRows — nenhuma regra de preço/estoque/categoria/
 * marca/descrição/imagem é duplicada aqui. `status`/`source`/`codigo`
 * nunca são enviados no payload — o banco aplica os defaults sozinho.
 *
 * Chamada explicitamente 1 produto por vez pelo caller (Etapa B — nunca em
 * massa ainda; isso é Etapa C, não implementada). `bagyProduct` é o objeto
 * `window.dooca.product` já lido (ex. via fetchBagyProductByLink(link).product).
 */
export async function syncNewProduct(bagyProduct, { logger } = {}) {
  const log = logger || createRunLogger(`new-product-${Date.now()}`)
  const result = { bagyProductId: bagyProduct.id, ok: false }

  // Idempotência explícita — mesma checagem que a RPC também faz (defesa em
  // profundidade); aqui evita nem montar o payload se já existe.
  const existente = await getProductByBagyId(bagyProduct.id)
  if (existente) {
    result.erro = `bagy_product_id ${bagyProduct.id} já existe em products (id ${existente.id}) — não é produto novo, use syncProduct`
    log.error('syncNewProduct_ja_existe', new Error(result.erro))
    return result
  }

  const mappedProduct = mapProductRow(bagyProduct, {})
  // Só os campos que fazem sentido pro INSERT — nunca status/codigo, que
  // ficam a cargo dos defaults do próprio schema (ver migration 022).
  // `source` é EXCEÇÃO deliberada: enviado explicitamente como
  // 'bagy_sync' (mesmo valor que mapProductRow já produz e que o fluxo de
  // UPDATE normal sempre grava) — sem isso, o produto nasceria com o
  // default global da coluna ('bagy', usado por outros fluxos que não
  // este sincronizador) e o próximo dry_run detectaria uma "alteração"
  // fantasma só pra corrigir esse campo. NÃO mexe no default global da
  // coluna nem em produtos manuais — só o payload deste caminho específico.
  const productFields = {
    bagy_product_id: mappedProduct.bagy_product_id,
    nome: mappedProduct.nome,
    link: mappedProduct.link,
    ...(mappedProduct.categoria !== undefined ? { categoria: mappedProduct.categoria } : {}),
    categoria_breadcrumb: mappedProduct.categoria_breadcrumb,
    bagy_category_id: mappedProduct.bagy_category_id,
    preco: mappedProduct.preco,
    preco_pix: mappedProduct.preco_pix,
    imagem: mappedProduct.imagem,
    descricao: mappedProduct.descricao,
    marca: mappedProduct.marca,
    sell_without_stock: mappedProduct.sell_without_stock,
    source: mappedProduct.source,
  }

  const mappedVariations = mapVariationRows(bagyProduct, null)
  const anomalias = mappedVariations.filter((v) => v._anomalia).map((v) => ({ bagy_variation_id: v.bagy_variation_id, anomalia: v._anomalia }))
  if (anomalias.length > 0) {
    result.erro = `escrita abortada — ${anomalias.length} anomalia(s) de estoque não resolvida(s) pela regra aprovada`
    log.error('syncNewProduct_anomalia', new Error(result.erro))
    return result
  }
  const variations = mappedVariations.map(({ _anomalia, _attributeFallback, product_id, ...row }) => row)

  try {
    const rpcResult = await syncProductTransactional({
      productId: null,
      productFields,
      variations,
    })
    log.step('insert_transacional', {
      camposProduto: Object.keys(productFields),
      variacoesEnviadas: variations.length,
      rpcResult,
    })
    result.ok = true
    result.escrito = true
    result.rpcResult = rpcResult
    result.productUuid = rpcResult?.product_id ?? null
  } catch (e) {
    result.erro = `INSERT transacional falhou (nada foi gravado — a function é atômica): ${e.message}`
    log.error('syncNewProduct_falhou', e)
  }

  return result
}

// Retry automático — só para 'erro_rede' (falha de fetch pura, sem resposta
// HTTP). Backoff fixo aprovado: tentativa original + retry em ~2s + retry em
// ~5s = no máximo 3 tentativas totais. 404 / pagina_invalida / duplicate_conflict
// / erro estrutural nunca são retentados (ver classificarFalha).
const RETRY_DELAYS_MS = [2000, 5000]

/**
 * Roda syncProduct com retry automático limitado, só para erro de rede
 * transitório. Devolve o resultado final + quantos retries foram
 * consumidos (0 quando a tentativa original já deu certo ou falhou por
 * um motivo não-retentável).
 */
async function syncProductComRetry(item, { mode, logger }) {
  let tentativa = 0
  let result = await syncProduct(item, { mode, logger })

  while (!result.ok && classificarFalha(result) === 'erro_rede' && tentativa < RETRY_DELAYS_MS.length) {
    const delay = RETRY_DELAYS_MS[tentativa]
    logger.step('retry_agendado', { link: item.link, tentativa: tentativa + 1, delayMs: delay, motivo: result.erro })
    await sleep(delay)
    tentativa++
    result = await syncProduct(item, { mode, logger })
  }

  return { result, retries: tentativa }
}

/**
 * Upsert de exceção conhecida (404 / pagina_invalida / duplicate_conflict)
 * na fila persistente. Nunca cria/edita nada em bagy_sync_runs — é uma
 * função auxiliar chamada só de dentro de syncBatch, por item que falhou
 * de forma terminal (não-retentável). Falha de gravação aqui é reportada,
 * nunca escondida, e nunca derruba o resultado real do sync.
 */
async function registrarExcecaoSeAplicavel(result, runId, logger) {
  const tipo = classificarFalha(result)
  if (tipo !== '404' && tipo !== 'pagina_invalida' && tipo !== 'duplicate_conflict') return null

  const link = result.link || result.input?.link
  if (!link) return null // sem link resolvido (ex. bagyProductId sem produto no Supabase) — nada a registrar

  const detalhe = tipo === 'duplicate_conflict'
    ? result.duplicateConflict
    : { erro: result.erro, bagyHttpStatus: result.bagyHttpStatus ?? null }

  try {
    const existente = await getExceptionByLinkTipo(link, tipo)
    if (existente) {
      await touchException(existente.id, { detalhe, runId })
      return { link, tipo, acao: 'atualizada', status: existente.status }
    }
    await insertException({ link, tipo, detalhe, runId })
    return { link, tipo, acao: 'criada', status: 'aberto' }
  } catch (e) {
    logger.error('excecao_nao_gravada', e)
    return { link, tipo, acao: 'falhou_ao_gravar', erro: e.message }
  }
}

/**
 * Sincroniza uma lista de produtos, isolando falhas por item (uma falha
 * não derruba o lote inteiro). Serve tanto para "sincronização completa"
 * (lista = catálogo inteiro) quanto "incremental" (lista = só os que
 * mudaram) quanto "webhook" (lista = 1 item) — mesma função, origem da
 * lista é decisão do caller.
 *
 * Ao final, persiste 1 linha em bagy_sync_runs e faz upsert das exceções
 * conhecidas em bagy_sync_exceptions (ver migration 021). Essa persistência
 * é só um "anexo" ao resultado — se ela falhar, o resultado real do sync
 * (results/resumo) continua sendo devolvido normalmente, com o erro de
 * persistência reportado à parte (nunca escondido, nunca derruba o sync).
 */
// Concorrência do dry_run — ponto de partida conservador aprovado. Fixa,
// pequena, fácil de ajustar depois de homologar (não subir sem nova
// aprovação). `write` nunca usa isso — continua sequencial (ver syncBatch).
const DRY_RUN_CONCURRENCY = 4

/**
 * Processa 1 item do lote (mesma unidade de trabalho que o for..of
 * sequencial sempre executou): roda syncProductComRetry, registra exceção
 * se aplicável, e NUNCA deixa uma exceção escapar — item que falhar de
 * forma inesperada vira `{ input, ok: false, erro }`, exatamente o shape
 * que o catch do loop antigo já produzia. Usado tanto pelo caminho
 * sequencial (write) quanto pelo concorrente (dry_run via
 * processWithConcurrency) — mesmo comportamento de erro nos dois modes.
 */
async function processarItemBatch(item, { mode, runId, logger }) {
  try {
    const { result: r, retries } = await syncProductComRetry(item, { mode, logger })
    let reg = null
    if (!r.ok) {
      reg = await registrarExcecaoSeAplicavel(r, runId, logger)
    }
    return { result: r, retries, reg }
  } catch (e) {
    logger.error('erro_item', e)
    return { result: { input: item, ok: false, erro: e.message }, retries: 0, reg: null }
  }
}

export async function syncBatch(items, { mode = 'dry_run', runId, trigger = 'manual' } = {}) {
  const finalRunId = runId || `batch-${Date.now()}`
  const log = createRunLogger(finalRunId)
  log.step('inicio_lote', { total: items.length, mode, trigger })

  const startedAt = new Date()
  const results = []
  let retriesExecutados = 0
  const excecoesRegistradas = []

  // dry_run: concorrência controlada (menor tempo total, mesma ordem final
  // de `results` — ver processWithConcurrency). write: permanece
  // estritamente sequencial, sem nenhuma mudança de comportamento — decisão
  // deliberada até tratarmos separadamente a atomicidade do lote em write.
  let itemResults
  if (mode === 'write') {
    itemResults = []
    for (const item of items) {
      itemResults.push(await processarItemBatch(item, { mode, runId: finalRunId, logger: log }))
    }
  } else {
    itemResults = await processWithConcurrency(items, DRY_RUN_CONCURRENCY, (item) =>
      processarItemBatch(item, { mode, runId: finalRunId, logger: log })
    )
  }

  for (const { result: r, retries, reg } of itemResults) {
    retriesExecutados += retries
    results.push(r)
    if (reg) excecoesRegistradas.push(reg)
  }

  const finishedAt = new Date()
  const resumo = {
    total: results.length,
    ok: results.filter((r) => r.ok).length,
    comErro: results.filter((r) => !r.ok).length,
    mudariam: results.filter((r) => r.ok && r.mudariaAlgo).length,
    semMudanca: results.filter((r) => r.ok && !r.mudariaAlgo).length,
    updatesEmProducts: results.filter((r) => r.ok && Object.keys(r.productDiff || {}).length > 0).length,
    insertsEmVariations: results.reduce((acc, r) => acc + (r.variationDiff?.toInsert || 0), 0),
    updatesEmVariations: results.reduce((acc, r) => acc + (r.variationDiff?.toUpdate || 0), 0),
    comAnomalia: results.filter((r) => (r.anomalias || []).length > 0).length,
    duplicateConflicts: results.filter((r) => r.duplicateConflict).length,
    naoEncontradosNaBagy: results.filter((r) => r.produtoNaoEncontradoNaBagy).length,
    paginaInvalida: results.filter((r) => r.paginaInvalida).length,
    erroRede: results.filter((r) => !r.ok && classificarFalha(r) === 'erro_rede').length,
    retriesExecutados,
    excecoesRegistradas: excecoesRegistradas.length,
  }

  const statusFinal = resumo.comErro === 0
    ? 'sucesso'
    : (resumo.duplicateConflicts + resumo.naoEncontradosNaBagy + resumo.paginaInvalida) === resumo.comErro
      ? 'sucesso_com_excecoes'
      : 'falha'

  log.step('fim_lote', { ...resumo, statusFinal })

  let persistedRun = null
  let persistError = null
  try {
    persistedRun = await insertSyncRun({
      run_id: finalRunId,
      mode,
      trigger,
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: finishedAt.getTime() - startedAt.getTime(),
      total_analisado: resumo.total,
      sincronizados: results.filter((r) => r.ok && r.mudariaAlgo && (mode === 'dry_run' || r.escrito)).length,
      sem_mudanca: resumo.semMudanca,
      total_404: resumo.naoEncontradosNaBagy,
      pagina_invalida: resumo.paginaInvalida,
      duplicate_conflict: resumo.duplicateConflicts,
      erro_rede: resumo.erroRede,
      retries_executados: resumo.retriesExecutados,
      variacoes_inseridas: resumo.insertsEmVariations,
      variacoes_atualizadas: resumo.updatesEmVariations,
      status_final: statusFinal,
      erro_fatal: null,
      detalhes: results,
    })
  } catch (e) {
    persistError = e.message
    log.error('persistencia_run_falhou', e)
  }

  return {
    results,
    resumo: { ...resumo, statusFinal },
    log: log.summary(),
    runId: finalRunId,
    persistencia: {
      runGravado: !!persistedRun,
      erro: persistError,
      excecoesRegistradas,
    },
  }
}
