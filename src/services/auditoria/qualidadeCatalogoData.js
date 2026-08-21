// Auditoria de Qualidade do Catálogo — camada de dados do frontend (PARTE 56,
// Fase 1). Ponte entre a futura UI (BagyAuditPage.jsx, ainda não alterada) e
// as 4 rotas já homologadas na Fase 2C (api/system-tools.js), todas
// consumidas via `/api/system-tools?tool=...` — nunca fala com o Supabase
// direto (diferente de auditoriaV2Data.js, que lê products/bagy_sync_runs/
// bagy_sync_exceptions via REST com a chave anon: as 4 rotas daqui são
// backend-only, e mesmo a leitura fica consistente indo pela mesma rota
// HTTP). Mesmo padrão de tratamento de erro de auditoriaV2Data.js:
// `res.json().catch(() => ({}))` + `throw new Error(body.error || 'HTTP '+status)`.
//
// Nunca altera o motor de qualidade (src/services/auditoria/
// qualidadeCatalogoRules.js, congelado), nunca escreve em
// shadow_products/shadow_product_variations, nunca chama a Bagy — essas
// garantias já são estruturais do backend (Fase 2C); este arquivo só
// encaminha chamadas.

/**
 * Última auditoria de qualidade executada (ou null se nenhuma ainda) — via
 * `?tool=catalog-quality-audit-summary`, sem `?historico=1`.
 */
export async function getQualitySummary() {
  const res = await fetch('/api/system-tools?tool=catalog-quality-audit-summary')
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
  return body.ultimaRun ?? null
}

/**
 * Histórico paginado de auditorias de qualidade — mesma rota acima, com
 * `?historico=1&limit=&offset=` (suportado pela API desde a Fase 2C).
 */
export async function getQualityRunHistory({ limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams({
    tool: 'catalog-quality-audit-summary',
    historico: '1',
    limit: String(limit),
    offset: String(offset),
  })
  const res = await fetch(`/api/system-tools?${params.toString()}`)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
  return body.runs ?? []
}

/**
 * Findings filtráveis/paginados — via `?tool=catalog-quality-findings`. Só
 * envia os filtros que vierem realmente definidos (nunca `undefined`/`''`
 * como query param) — a validação de valores permitidos para
 * status/severidade/classe já acontece no backend (api/
 * _qualidadeCatalogoAuditoria.js); este arquivo não duplica essa lista, só
 * repassa o que o chamador informou.
 */
export async function getQualityFindings({
  status,
  severidade,
  classe,
  tipo,
  bagyProductId,
  nome,
  limit = 50,
  offset = 0,
} = {}) {
  const params = new URLSearchParams({ tool: 'catalog-quality-findings', limit: String(limit), offset: String(offset) })
  if (status !== undefined && status !== '') params.set('status', status)
  if (severidade !== undefined && severidade !== '') params.set('severidade', severidade)
  if (classe !== undefined && classe !== '') params.set('classe', classe)
  if (tipo !== undefined && tipo !== '') params.set('tipo', tipo)
  if (bagyProductId !== undefined && bagyProductId !== '') params.set('bagyProductId', String(bagyProductId))
  if (nome !== undefined && nome !== '') params.set('nome', nome)

  const res = await fetch(`/api/system-tools?${params.toString()}`)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
  return body.findings ?? []
}

/**
 * Executa 1 auditoria de qualidade real (motor congelado + persistência do
 * histórico) — via `?tool=catalog-quality-audit-run`. Mesmo padrão de
 * `actionSecret` já usado por `runBagySyncViaUI`/`ignoreException` em
 * auditoriaV2Data.js: senha digitada pelo usuário no modal, nunca
 * persistida/logada aqui, comparada no backend com BAGY_UI_ACTION_SECRET.
 * Devolve o corpo completo da resposta ({ok, run, resumo} em sucesso, ou
 * {ok:false, run, motivo} se a leitura do catálogo ou o motor falharem —
 * ambos os casos chegam como HTTP 200, então nunca lançam aqui; falha de
 * transporte/autenticação real (401/500) segue o tratamento de erro padrão).
 */
export async function runQualityAudit(actionSecret) {
  const res = await fetch('/api/system-tools?tool=catalog-quality-audit-run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actionSecret }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
  return body
}

const FINDING_STATUS_PERMITIDO_NO_CLIENTE = new Set(['aberto', 'ignorado'])

/**
 * Altera o status manual de 1 finding — via `?tool=catalog-quality-finding-
 * status`. Só aceita 'aberto'/'ignorado' — rejeitado NO CLIENTE antes de
 * qualquer chamada de rede se vier qualquer outro valor (inclui 'resolvido':
 * a resolução é sempre automática, resultado de uma auditoria completa que
 * não encontrou mais aquele achado — nunca uma ação manual, nem aqui nem no
 * backend, que já rejeita 'resolvido' de qualquer forma com HTTP 400).
 */
export async function setFindingStatus(id, status, actionSecret) {
  if (!FINDING_STATUS_PERMITIDO_NO_CLIENTE.has(status)) {
    throw new Error(`status inválido — permitido apenas: aberto, ignorado (recebido: ${status})`)
  }
  const res = await fetch('/api/system-tools?tool=catalog-quality-finding-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status, actionSecret }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
  return body.finding
}
