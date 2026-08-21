// api/_qualidadeCatalogoAuditoria.js
//
// Orquestrador da Auditoria de Qualidade do Catálogo V2 — fonte única desta
// lógica, consumida por dois chamadores que nunca a duplicam:
//   - scripts/qualidade-catalogo-auditoria.mjs (execução manual, terminal)
//   - api/system-tools.js (?tool=catalog-quality-audit-run/..., Fase 2C)
//
// Consome o motor puro e CONGELADO
// (src/services/auditoria/qualidadeCatalogoRules.js) — nunca o altera, nunca
// recalibra, nunca muda severidade/classe/lógica de quase-duplicidade.
//
// Requer service_role (nunca exposto ao frontend) via `config.secretKey` —
// este arquivo nunca lê process.env diretamente, mesmo padrão de
// api/_shadowContextService.js (dependency injection pelo chamador).
//
// Ciclo de vida dos achados (identidade determinística por
// shadow_product_id+tipo+chave_extra — nunca por texto de mensagem):
//   achado novo                        -> cria como 'aberto'
//   achado já existia (aberto)         -> atualiza last_seen_at/last_run_id
//   achado já existia (ignorado)       -> permanece 'ignorado', NUNCA reabre sozinho
//   achado já existia (resolvido)      -> reabre: status='aberto', resolved_at=null
//   achado aberto/ignorado que sumiu   -> só numa run COMPLETA: status='resolvido'
//   run incompleta/com falha           -> NUNCA resolve nada por ausência
//
// Ver docs/integrations/SHADOW-V2-CATALOGO.md para o desenho completo.

const PAGE_SIZE = 1000

function headers(config) {
  return { apikey: config.secretKey, Authorization: `Bearer ${config.secretKey}`, 'Content-Type': 'application/json' }
}

async function fetchAll(config, caminho, select, extra = '') {
  const rows = []
  let offset = 0
  while (true) {
    const res = await fetch(`${config.supabaseUrl}/rest/v1/${caminho}?select=${select}${extra}&limit=${PAGE_SIZE}&offset=${offset}`, { headers: headers(config) })
    if (!res.ok) throw new Error(`${caminho}: ${res.status} ${await res.text()}`)
    const page = await res.json()
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return rows
}

async function inserirRun(config, row) {
  const res = await fetch(`${config.supabaseUrl}/rest/v1/catalog_quality_audit_runs`, {
    method: 'POST',
    headers: { ...headers(config), Prefer: 'return=representation' },
    body: JSON.stringify([row]),
  })
  const json = await res.json()
  if (!res.ok || !Array.isArray(json)) throw new Error(`inserirRun falhou: ${res.status} ${JSON.stringify(json)}`)
  return json[0]
}

async function atualizarRun(config, id, patch) {
  const res = await fetch(`${config.supabaseUrl}/rest/v1/catalog_quality_audit_runs?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...headers(config), Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(`atualizarRun(${id}) falhou: ${res.status} ${await res.text()}`)
}

async function inserirFinding(config, row) {
  const res = await fetch(`${config.supabaseUrl}/rest/v1/catalog_quality_findings`, {
    method: 'POST',
    headers: { ...headers(config), Prefer: 'return=representation' },
    body: JSON.stringify([row]),
  })
  const json = await res.json()
  if (!res.ok || !Array.isArray(json)) throw new Error(`inserirFinding falhou: ${res.status} ${JSON.stringify(json)}`)
  return json[0]
}

async function atualizarFinding(config, id, patch) {
  const res = await fetch(`${config.supabaseUrl}/rest/v1/catalog_quality_findings?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...headers(config), Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(`atualizarFinding(${id}) falhou: ${res.status} ${await res.text()}`)
}

// --- Identidade determinística ----------------------------------------------
// A regra `quase_duplicado` é a única que pode gerar mais de 1 achado do
// mesmo tipo no mesmo produto (1 por parceiro de quase-duplicidade) — para
// essa, a chave extra é o bagy_product_id do parceiro, extraído do texto
// `encontrado` já produzido pelo motor congelado (sem alterar o motor).
// Todas as outras regras produzem no máximo 1 achado por tipo por produto.
export function calcularChaveExtra(achado) {
  if (achado.tipo !== 'quase_duplicado') return ''
  const m = achado.encontrado.match(/bagy_product_id (\d+)/)
  return m ? m[1] : ''
}

export function chaveIdentidade(shadowProductId, achado) {
  return `${shadowProductId}::${achado.tipo}::${calcularChaveExtra(achado)}`
}

// --- Orquestração principal — executa a auditoria e persiste o histórico ---
export async function rodarAuditoriaQualidade(config) {
  const { avaliarCatalogo } = await import('../src/services/auditoria/qualidadeCatalogoRules.js')

  let produtos, variacoes
  try {
    produtos = await fetchAll(config, 'shadow_products', 'id,bagy_product_id,nome,marca,categoria_nome,preco,preco_pix,link,imagem_principal,ativo,content_synced_at')
    variacoes = await fetchAll(config, 'shadow_product_variations', 'id,shadow_product_id')
  } catch (e) {
    const run = await inserirRun(config, { status: 'falha', erro: 'Falha ao carregar dados do Catálogo V2: ' + e.message, finished_at: new Date().toISOString() })
    return { ok: false, run, motivo: e.message }
  }

  const variationsByProductId = new Map()
  for (const v of variacoes) {
    const lista = variationsByProductId.get(v.shadow_product_id) || []
    lista.push(v)
    variationsByProductId.set(v.shadow_product_id, lista)
  }

  let resultado
  try {
    // Motor puro, congelado — não alterado, não recalibrado nesta frente.
    resultado = avaliarCatalogo(produtos, variationsByProductId)
  } catch (e) {
    const run = await inserirRun(config, { status: 'falha', erro: 'Falha ao executar o motor de qualidade: ' + e.message, finished_at: new Date().toISOString() })
    return { ok: false, run, motivo: e.message }
  }

  const contentSyncedById = new Map(produtos.map((p) => [p.id, p.content_synced_at ?? null]))

  // --- monta o conjunto de achados desta execução, com identidade --------
  const achadosAtuais = new Map() // chave -> { produto, achado }
  let fatoCount = 0, alertaCount = 0, sugestaoCount = 0
  let criticoCount = 0, importanteCount = 0, revisarCount = 0
  for (const r of resultado.resultados) {
    for (const achado of r.achados) {
      const chave = chaveIdentidade(r.produto.id, achado)
      achadosAtuais.set(chave, { produto: r.produto, achado })
      if (achado.classe === 'FATO') fatoCount++
      else if (achado.classe === 'ALERTA') alertaCount++
      else if (achado.classe === 'SUGESTAO') sugestaoCount++
      if (achado.severidade === 'CRITICO') criticoCount++
      else if (achado.severidade === 'IMPORTANTE') importanteCount++
      else if (achado.severidade === 'REVISAR') revisarCount++
    }
  }

  // --- cria a run (já sabemos que os dados carregaram e o motor rodou) ---
  const run = await inserirRun(config, {
    status: 'completa',
    total_active_products: resultado.totalAtivosAnalisados,
    products_without_findings: resultado.semAchados,
    products_with_findings: resultado.comAchados,
    total_findings: achadosAtuais.size,
    fato_count: fatoCount,
    alerta_count: alertaCount,
    sugestao_count: sugestaoCount,
    critico_count: criticoCount,
    importante_count: importanteCount,
    revisar_count: revisarCount,
  })

  // --- carrega findings já existentes (qualquer status) -------------------
  const findingsExistentes = await fetchAll(config, 'catalog_quality_findings', '*')
  const findingsPorChave = new Map(
    findingsExistentes.map((f) => [`${f.shadow_product_id}::${f.tipo}::${f.chave_extra}`, f])
  )

  let novos = 0, reabertos = 0, resolvidosAutomaticamente = 0
  const agora = new Date().toISOString()

  for (const [chave, { produto, achado }] of achadosAtuais) {
    const existente = findingsPorChave.get(chave)
    if (!existente) {
      await inserirFinding(config, {
        shadow_product_id: produto.id,
        bagy_product_id: produto.bagy_product_id,
        chave_extra: calcularChaveExtra(achado),
        tipo: achado.tipo,
        classe: achado.classe,
        severidade: achado.severidade,
        mensagem: achado.mensagem,
        encontrado: achado.encontrado,
        esperado_sugerido: achado.esperado_sugerido,
        por_que: achado.porQue,
        o_que_conferir: achado.oQueConferir,
        content_synced_at: contentSyncedById.get(produto.id) ?? null,
        status: 'aberto',
        first_seen_at: agora,
        last_seen_at: agora,
        first_run_id: run.id,
        last_run_id: run.id,
      })
      novos++
      continue
    }

    // já existia — nunca duplica, sempre atualiza o mesmo registro
    const patch = {
      mensagem: achado.mensagem,
      encontrado: achado.encontrado,
      esperado_sugerido: achado.esperado_sugerido,
      por_que: achado.porQue,
      o_que_conferir: achado.oQueConferir,
      content_synced_at: contentSyncedById.get(produto.id) ?? null,
      last_seen_at: agora,
      last_run_id: run.id,
      updated_at: agora,
    }
    if (existente.status === 'resolvido') {
      patch.status = 'aberto'
      patch.resolved_at = null
      reabertos++
    }
    // status 'aberto' continua 'aberto'; status 'ignorado' PERMANECE
    // 'ignorado' — nunca reabre sozinho (regra explícita da Fase 2B).
    await atualizarFinding(config, existente.id, patch)
  }

  // --- resolve findings que sumiram (só porque esta run é COMPLETA) ------
  for (const [chave, existente] of findingsPorChave) {
    if (achadosAtuais.has(chave)) continue
    if (existente.status === 'resolvido') continue // já resolvido, nada a fazer
    await atualizarFinding(config, existente.id, { status: 'resolvido', resolved_at: agora, updated_at: agora })
    resolvidosAutomaticamente++
  }

  await atualizarRun(config, run.id, {
    finished_at: new Date().toISOString(),
    novos_findings: novos,
    resolvidos_automaticamente: resolvidosAutomaticamente,
    reabertos,
  })

  return {
    ok: true,
    run: { ...run, novos_findings: novos, resolvidos_automaticamente: resolvidosAutomaticamente, reabertos },
    resumo: {
      totalAtivosAnalisados: resultado.totalAtivosAnalisados,
      semAchados: resultado.semAchados,
      comAchados: resultado.comAchados,
      totalFindings: achadosAtuais.size,
      novos,
      reabertos,
      resolvidosAutomaticamente,
    },
  }
}

// --- Leitura (Fase 2C) -------------------------------------------------------
// Só GET/leitura — nunca escreve em shadow_products/shadow_product_variations
// nem chama a Bagy. RLS já permite SELECT público nas 2 tabelas (mesmo padrão
// de shadow_reconciliation_runs/bagy_sync_runs) — estas funções só existem
// pra centralizar paginação/filtros e não obrigar o frontend a montar a
// query REST na mão.

export async function buscarUltimaRun(config) {
  const res = await fetch(`${config.supabaseUrl}/rest/v1/catalog_quality_audit_runs?select=*&order=created_at.desc&limit=1`, { headers: headers(config) })
  if (!res.ok) throw new Error(`buscarUltimaRun: ${res.status} ${await res.text()}`)
  const rows = await res.json()
  return rows[0] || null
}

export async function buscarHistoricoRuns(config, { limit = 20, offset = 0 } = {}) {
  const limitSeguro = Math.min(Math.max(Number(limit) || 20, 1), 100)
  const offsetSeguro = Math.max(Number(offset) || 0, 0)
  const res = await fetch(
    `${config.supabaseUrl}/rest/v1/catalog_quality_audit_runs?select=*&order=created_at.desc&limit=${limitSeguro}&offset=${offsetSeguro}`,
    { headers: headers(config) }
  )
  if (!res.ok) throw new Error(`buscarHistoricoRuns: ${res.status} ${await res.text()}`)
  return res.json()
}

const STATUS_VALIDOS = new Set(['aberto', 'ignorado', 'resolvido'])
const SEVERIDADE_VALIDAS = new Set(['CRITICO', 'IMPORTANTE', 'REVISAR'])
const CLASSE_VALIDAS = new Set(['FATO', 'ALERTA', 'SUGESTAO'])

// buscarFindings: filtros só entram na query se explicitamente informados e
// dentro das listas fechadas acima — nunca concatena valor livre em SQL,
// sempre via query params do PostgREST (encodeURIComponent). `nome` filtra
// pelo produto embutido via a FK shadow_product_id → shadow_products (join
// de leitura, PostgREST resource embedding) — findings não guardam nome.
export async function buscarFindings(config, filtros = {}) {
  const { status, severidade, classe, tipo, bagyProductId, nome, limit = 50, offset = 0 } = filtros
  const limitSeguro = Math.min(Math.max(Number(limit) || 50, 1), 200)
  const offsetSeguro = Math.max(Number(offset) || 0, 0)

  const params = new URLSearchParams()
  params.set('select', '*,shadow_products(nome,ativo,content_synced_at,last_seen_at)')
  params.set('order', 'last_seen_at.desc')
  params.set('limit', String(limitSeguro))
  params.set('offset', String(offsetSeguro))

  if (status !== undefined) {
    if (!STATUS_VALIDOS.has(status)) throw new Error('status_invalido')
    params.set('status', `eq.${status}`)
  }
  if (severidade !== undefined) {
    if (!SEVERIDADE_VALIDAS.has(severidade)) throw new Error('severidade_invalida')
    params.set('severidade', `eq.${severidade}`)
  }
  if (classe !== undefined) {
    if (!CLASSE_VALIDAS.has(classe)) throw new Error('classe_invalida')
    params.set('classe', `eq.${classe}`)
  }
  if (tipo !== undefined && tipo !== '') {
    params.set('tipo', `eq.${tipo}`)
  }
  if (bagyProductId !== undefined && bagyProductId !== '') {
    const idNum = Number(bagyProductId)
    if (!Number.isFinite(idNum)) throw new Error('bagy_product_id_invalido')
    params.set('bagy_product_id', `eq.${idNum}`)
  }
  if (nome !== undefined && nome !== '') {
    params.set('shadow_products.nome', `ilike.*${nome}*`)
  }

  const res = await fetch(`${config.supabaseUrl}/rest/v1/catalog_quality_findings?${params.toString()}`, { headers: headers(config) })
  if (!res.ok) throw new Error(`buscarFindings: ${res.status} ${await res.text()}`)
  return res.json()
}

// --- Status manual do finding (Fase 2C) --------------------------------------
// Só aberto<->ignorado — 'resolvido' NUNCA é aceito aqui (só a auditoria
// automática, numa run completa, pode marcar resolvido — ver
// rodarAuditoriaQualidade acima).
const STATUS_MANUAL_PERMITIDO = new Set(['aberto', 'ignorado'])

export async function atualizarStatusFindingManual(config, id, novoStatus) {
  if (!STATUS_MANUAL_PERMITIDO.has(novoStatus)) {
    throw new Error('status_invalido')
  }
  const res = await fetch(`${config.supabaseUrl}/rest/v1/catalog_quality_findings?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { ...headers(config), Prefer: 'return=representation' },
    body: JSON.stringify({ status: novoStatus, updated_at: new Date().toISOString() }),
  })
  if (!res.ok) throw new Error(`atualizarStatusFindingManual: ${res.status} ${await res.text()}`)
  const rows = await res.json()
  return rows[0] || null
}
