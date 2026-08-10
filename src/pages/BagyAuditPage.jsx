import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../theme.jsx'
import { loadAuditoriaV2Dashboard, getAuditRuns as getAuditRunsV2, getExceptions as getExceptionsV2, getProductsIndex, ignoreException, reactivateException, derivarStatusGeral, runBagySyncViaUI } from '../services/auditoria/auditoriaV2Data'

const STATUS_GERAL_COLOR = { operacional: '#0EC331', atencao: '#F59E0B', problema: '#E8192C', desconhecido: '#D1D5DB' }
const STATUS_GERAL_ICON = { operacional: '🟢', atencao: '🟡', problema: '🔴', desconhecido: '⚪' }

const STATUS_FINAL_COLOR = { sucesso: '#0EC331', sucesso_com_excecoes: '#F59E0B', falha: '#E8192C' }
const STATUS_FINAL_DEFAULT_COLOR = '#9CA3AF'

function exceptionsTotalForRun(run) {
  return (run.total_404 || 0) + (run.pagina_invalida || 0) + (run.duplicate_conflict || 0) + (run.erro_rede || 0)
}

// Taxonomia da fila de exceções (bagy_sync_exceptions.tipo) — mesma já usada
// no Catálogo V1 (SyncStatusBadge), sem inventar categorias novas.
const EXCEPTION_TYPE_META = {
  '404': { label: 'Não encontrado na Bagy', color: '#E8192C' },
  duplicate_conflict: { label: 'Conflito', color: '#F97316' },
  pagina_invalida: { label: 'Página inválida', color: '#EAB308' },
}
const EXCEPTION_STATUS_LABEL = { aberto: 'Aberto', ignorado: 'Ignorado', resolvido: 'Resolvido' }

function formatExceptionDetalhe(detalhe) {
  if (!detalhe || typeof detalhe !== 'object') return null
  if (Array.isArray(detalhe.ids)) {
    return `${detalhe.duplicateCount ?? detalhe.ids.length} produtos com este link (ids: ${detalhe.ids.join(', ')})`
  }
  if (detalhe.erro) {
    return detalhe.bagyHttpStatus != null ? `${detalhe.erro} (HTTP ${detalhe.bagyHttpStatus})` : detalhe.erro
  }
  return JSON.stringify(detalhe)
}

function formatDuration(ms) {
  if (ms == null) return '—'
  const totalSec = Math.round(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`
}

export default function BagyAuditPage({ onNavigateToCatalogProduct }) {
  const { theme: t } = useTheme()

  // Resumo superior (V2). Falha aqui nunca deve derrubar o resto da página,
  // só o próprio bloco de resumo.
  const [v2Dashboard, setV2Dashboard] = useState(null)
  const [v2Loading, setV2Loading] = useState(true)
  const [v2Error, setV2Error] = useState(null)

  // Histórico de execuções (V2) — bagy_sync_runs, leve (sem detalhes jsonb).
  const [v2Runs, setV2Runs] = useState([])
  const [v2RunsLoading, setV2RunsLoading] = useState(true)
  const [v2RunsError, setV2RunsError] = useState(null)
  const [showAllV2Runs, setShowAllV2Runs] = useState(false)
  const [selectedV2RunId, setSelectedV2RunId] = useState(null)

  // Fila de exceções (V2) — bagy_sync_exceptions, enriquecida com nome do
  // produto via Map<link, product> (1 leitura só, zero N+1).
  const [v2Exceptions, setV2Exceptions] = useState([])
  const [v2ProductsByLink, setV2ProductsByLink] = useState(null)
  const [v2ProductsById, setV2ProductsById] = useState(null)
  const [v2ExcLoading, setV2ExcLoading] = useState(true)
  const [v2ExcError, setV2ExcError] = useState(null)
  const [v2ExcFilterTipo, setV2ExcFilterTipo] = useState('all')
  const [v2ExcFilterStatus, setV2ExcFilterStatus] = useState('all')

  // Fase 7 — "Verificar agora"/"Sincronizar agora". `runAction`:
  // 'pronto'|'verificando'|'sincronizando'|'sucesso'|'sucesso_com_excecoes'|'erro'.
  const [runAction, setRunAction] = useState('pronto')
  const [runActionError, setRunActionError] = useState(null)
  const [runActionResult, setRunActionResult] = useState(null)
  const [showSyncConfirm, setShowSyncConfirm] = useState(false)
  // Etapa A — expande/recolhe a lista de produtos novos detectados no
  // resultado de "Verificar agora" (leitura, nenhum botão de inserir ainda).
  const [showProdutosNovos, setShowProdutosNovos] = useState(false)
  // Correção de segurança — BAGY_UI_ACTION_SECRET (ver api/system-tools.js):
  // toda ação de escrita do painel (Verificar/Sincronizar/Ignorar/Reativar)
  // agora exige essa senha de ação, digitada a cada vez, nunca persistida
  // (não vai pra localStorage/state global fora do necessário pro clique atual).
  const [showVerifyPasswordModal, setShowVerifyPasswordModal] = useState(false)
  const [verifyPasswordInput, setVerifyPasswordInput] = useState('')
  const [syncPasswordInput, setSyncPasswordInput] = useState('')

  // Extraídas de useEffect pra função nomeada — chamadas no mount E de novo
  // depois de "Verificar agora"/"Sincronizar agora" bem-sucedidos (Fase 7),
  // sem duplicar a query em nenhum dos dois casos.
  const loadV2Dashboard = useCallback(() => {
    let cancelado = false
    setV2Loading(true)
    setV2Error(null)
    loadAuditoriaV2Dashboard()
      .then((dashboard) => { if (!cancelado) setV2Dashboard(dashboard) })
      .catch((e) => { if (!cancelado) setV2Error(e.message) })
      .finally(() => { if (!cancelado) setV2Loading(false) })
    return () => { cancelado = true }
  }, [])

  const loadV2Runs = useCallback(() => {
    let cancelado = false
    setV2RunsLoading(true)
    setV2RunsError(null)
    getAuditRunsV2()
      .then((rows) => { if (!cancelado) setV2Runs(rows) })
      .catch((e) => { if (!cancelado) setV2RunsError(e.message) })
      .finally(() => { if (!cancelado) setV2RunsLoading(false) })
    return () => { cancelado = true }
  }, [])

  const loadV2Exceptions = useCallback(() => {
    let cancelado = false
    setV2ExcLoading(true)
    setV2ExcError(null)
    Promise.all([getExceptionsV2(), getProductsIndex()])
      .then(([exceptions, productsIndex]) => {
        if (cancelado) return
        setV2Exceptions(exceptions)
        setV2ProductsByLink(productsIndex.byLink)
        setV2ProductsById(productsIndex.byId)
      })
      .catch((e) => { if (!cancelado) setV2ExcError(e.message) })
      .finally(() => { if (!cancelado) setV2ExcLoading(false) })
    return () => { cancelado = true }
  }, [])

  useEffect(loadV2Dashboard, [])
  useEffect(loadV2Runs, [])
  useEffect(loadV2Exceptions, [])

  // Refresh dos 3 blocos V2 depois de uma execução bem-sucedida — reutiliza
  // as mesmas funções acima, nenhuma query nova inventada pra isso.
  function refreshV2AfterRun() {
    loadV2Dashboard()
    loadV2Runs()
    loadV2Exceptions()
  }

  async function handleVerifyNow() {
    if (runAction === 'verificando' || runAction === 'sincronizando') return
    const senha = verifyPasswordInput
    setShowVerifyPasswordModal(false)
    setVerifyPasswordInput('')
    setRunAction('verificando')
    setRunActionError(null)
    setRunActionResult(null)
    try {
      const resultado = await runBagySyncViaUI('dry_run', senha)
      setRunActionResult(resultado)
      setRunAction(resultado.resumo?.comErro > 0 ? 'sucesso_com_excecoes' : 'sucesso')
      refreshV2AfterRun()
    } catch (e) {
      setRunActionError(e.message)
      setRunAction('erro')
    }
  }

  async function handleSyncConfirm() {
    const senha = syncPasswordInput
    setShowSyncConfirm(false)
    setSyncPasswordInput('')
    setRunAction('sincronizando')
    setRunActionError(null)
    setRunActionResult(null)
    try {
      const resultado = await runBagySyncViaUI('write', senha)
      setRunActionResult(resultado)
      const houveFalhaParcial = resultado.resumo?.comErro > 0 || (resultado.produtosNovosFalhas?.length ?? 0) > 0
      setRunAction(houveFalhaParcial ? 'sucesso_com_excecoes' : 'sucesso')
      refreshV2AfterRun()
    } catch (e) {
      setRunActionError(e.message)
      setRunAction('erro')
    }
  }

  // Fase 5 — atualiza o state local (lista + resumo do topo) depois de um
  // Ignorar/Reativar bem-sucedido em bagy_sync_exceptions, sem reload da
  // página. A escrita real já aconteceu (V2ExceptionCard chamou
  // ignoreException/reactivateException); aqui só refletimos o resultado.
  function handleExceptionStatusChanged(id, oldStatus, newStatus) {
    setV2Exceptions(prev => prev.map(e => e.id === id ? { ...e, status: newStatus } : e))
    setV2Dashboard(prev => {
      if (!prev) return prev
      const porStatus = { ...prev.exceptionCounts.porStatus }
      porStatus[oldStatus] = Math.max(0, (porStatus[oldStatus] || 0) - 1)
      porStatus[newStatus] = (porStatus[newStatus] || 0) + 1
      const exceptionCounts = { ...prev.exceptionCounts, porStatus }
      const statusGeral = derivarStatusGeral({ latestRun: prev.latestRun, openExceptionsCount: porStatus.aberto })
      return { ...prev, exceptionCounts, statusGeral }
    })
  }

  const v2ExcCountsByTipo = v2Exceptions.reduce((acc, e) => { acc[e.tipo] = (acc[e.tipo] || 0) + 1; return acc }, {})
  const v2ExcCountsByStatus = v2Exceptions.reduce((acc, e) => { acc[e.status] = (acc[e.status] || 0) + 1; return acc }, {})
  const v2ExcFiltered = v2Exceptions.filter(e =>
    (v2ExcFilterTipo === 'all' || e.tipo === v2ExcFilterTipo) &&
    (v2ExcFilterStatus === 'all' || e.status === v2ExcFilterStatus)
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: t.bg, borderRadius: 12 }}>
    <div style={{ padding: 24, maxWidth: 1040, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: t.text, margin: 0 }}>🔍 Auditoria Bagy (Beta)</h1>
      </div>
      <p style={{ fontSize: 12, color: t.textMuted, marginTop: 0, marginBottom: 12 }}>
        Compara os produtos sincronizados da Bagy com o catálogo interno. "Verificar agora" só lê (dry_run); "Sincronizar agora" grava no catálogo.
      </p>

      {/* Fase 7 — ações manuais reais: chamam exclusivamente system-tools?tool=
          bagy-sync-run-ui, que por sua vez chama o sincronizador oficial
          (api/_bagySyncService.js). Nenhuma lógica de scraping/mapper/estoque/
          RPC/retry vive aqui — só orquestração de UI. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <button
          onClick={() => setShowVerifyPasswordModal(true)}
          disabled={runAction === 'verificando' || runAction === 'sincronizando'}
          style={{
            background: runAction === 'verificando' ? '#BFDBFE' : '#2563EB', color: '#fff', border: 'none',
            borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600,
            cursor: (runAction === 'verificando' || runAction === 'sincronizando') ? 'not-allowed' : 'pointer',
          }}
        >
          {runAction === 'verificando' ? 'Verificando...' : 'Verificar agora'}
        </button>
        <button
          onClick={() => setShowSyncConfirm(true)}
          disabled={runAction === 'verificando' || runAction === 'sincronizando'}
          style={{
            background: runAction === 'sincronizando' ? '#FECACA' : '#DC2626', color: '#fff', border: 'none',
            borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600,
            cursor: (runAction === 'verificando' || runAction === 'sincronizando') ? 'not-allowed' : 'pointer',
          }}
        >
          {runAction === 'sincronizando' ? 'Sincronizando...' : 'Sincronizar agora'}
        </button>
        <span style={{ fontSize: 11, color: t.textMuted }}>
          Verificar = só leitura (dry_run). Sincronizar = grava no catálogo (write, com confirmação).
        </span>
      </div>

      {runActionError && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '10px 14px', color: '#E8192C', fontSize: 13, marginBottom: 16 }}>
          ⚠️ {runActionError}
        </div>
      )}

      {runActionResult && (runAction === 'sucesso' || runAction === 'sucesso_com_excecoes') && (
        <div style={{
          background: (runAction === 'sucesso' && !(runActionResult.produtosNovosFalhas?.length > 0)) ? '#ECFDF5' : '#FFFBEB',
          border: `1px solid ${(runAction === 'sucesso' && !(runActionResult.produtosNovosFalhas?.length > 0)) ? '#A7F3D0' : '#FDE68A'}`,
          borderRadius: 10, padding: '12px 14px', marginBottom: 16, fontSize: 12, color: t.text,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            {runActionResult.mode === 'write'
              ? (runActionResult.produtosNovosFalhas?.length > 0 ? 'Sincronização concluída com falhas parciais' : 'Sincronização concluída')
              : 'Verificação concluída'}
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span>{runActionResult.resumo.total} existentes analisados</span>
            {runActionResult.mode === 'write'
              ? <span>{runActionResult.resumo.updatesEmProducts} atualizados</span>
              : <span>{runActionResult.resumo.mudariam} alterações necessárias</span>}
            <span>{runActionResult.resumo.semMudanca} sem mudança</span>
            <span>{runActionResult.resumo.naoEncontradosNaBagy} não encontrados</span>
            <span>{runActionResult.resumo.duplicateConflicts} conflitos</span>
            <span>{runActionResult.resumo.paginaInvalida} páginas inválidas</span>
            {runActionResult.resumo.retriesExecutados > 0 && <span>{runActionResult.resumo.retriesExecutados} retries</span>}
            <span>{runActionResult.resumo.excecoesRegistradas ?? (runActionResult.resumo.naoEncontradosNaBagy + runActionResult.resumo.duplicateConflicts + runActionResult.resumo.paginaInvalida)} exceções puladas com segurança</span>
            {runActionResult.mode === 'write' ? (
              <>
                <span style={{ fontWeight: 700, color: '#6366F1' }}>
                  {(runActionResult.produtosNovosInseridos?.length ?? 0)} produto{(runActionResult.produtosNovosInseridos?.length ?? 0) === 1 ? '' : 's'} novo{(runActionResult.produtosNovosInseridos?.length ?? 0) === 1 ? '' : 's'} adicionado{(runActionResult.produtosNovosInseridos?.length ?? 0) === 1 ? '' : 's'}
                </span>
                {runActionResult.produtosNovosFalhas?.length > 0 && (
                  <span style={{ fontWeight: 700, color: '#DC2626' }}>
                    {runActionResult.produtosNovosFalhas.length} falha{runActionResult.produtosNovosFalhas.length === 1 ? '' : 's'} de inserção
                  </span>
                )}
              </>
            ) : (
              Array.isArray(runActionResult.produtosNovos) && (
                <span style={{ fontWeight: 700, color: '#6366F1' }}>
                  {runActionResult.produtosNovos.length} produto{runActionResult.produtosNovos.length === 1 ? '' : 's'} novo{runActionResult.produtosNovos.length === 1 ? '' : 's'} detectado{runActionResult.produtosNovos.length === 1 ? '' : 's'}
                </span>
              )
            )}
          </div>

          {runActionResult.descobertaErro && (
            <div style={{ marginTop: 8, fontSize: 11, color: '#E8192C' }}>
              ⚠️ Descoberta de produtos novos falhou (resto do resultado acima não foi afetado): {runActionResult.descobertaErro}
            </div>
          )}

          {runActionResult.produtosNovosErro && (
            <div style={{ marginTop: 8, fontSize: 11, color: '#E8192C' }}>
              ⚠️ Inserção de produtos novos falhou por completo (produtos existentes acima não foram afetados): {runActionResult.produtosNovosErro}
            </div>
          )}

          {Array.isArray(runActionResult.produtosNovosFalhas) && runActionResult.produtosNovosFalhas.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {runActionResult.produtosNovosFalhas.map((f) => (
                <div key={f.link} style={{ fontSize: 11, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 6, padding: '4px 8px' }}>
                  ⚠️ Falhou: {f.link} — {f.motivo}
                </div>
              ))}
            </div>
          )}

          {Array.isArray(runActionResult.produtosNovosInseridos) && runActionResult.produtosNovosInseridos.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {runActionResult.produtosNovosInseridos.map((p) => (
                <div key={p.bagyProductId || p.link} style={{ fontSize: 11, color: '#059669', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 6, padding: '4px 8px' }}>
                  ✅ Adicionado: <strong>{p.nome || p.link}</strong> ({p.variacoesInseridas} variação{p.variacoesInseridas === 1 ? '' : 'ões'})
                </div>
              ))}
            </div>
          )}

          {Array.isArray(runActionResult.produtosNovos) && runActionResult.produtosNovos.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <button onClick={() => setShowProdutosNovos(v => !v)}
                style={{ fontSize: 11, color: '#6366F1', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}>
                {showProdutosNovos ? 'Ocultar produtos novos ▲' : 'Ver produtos novos ▼'}
              </button>
              {showProdutosNovos && (
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {runActionResult.produtosNovos.map((p) => (
                    <div key={p.bagyProductId || p.link} style={{ fontSize: 11, color: t.text, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 6, padding: '4px 8px' }}>
                      <strong>{p.nome || p.link}</strong>
                      {p.preco != null && <> · R$ {p.preco}</>}
                      {' · '}<a href={p.link} target="_blank" rel="noreferrer" style={{ color: t.textMuted }}>ver na Bagy ↗</a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showVerifyPasswordModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: t.bg, borderRadius: 12, padding: 24, maxWidth: 380, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: t.text }}>Verificar agora</h3>
            <p style={{ fontSize: 13, color: t.textMuted, marginBottom: 10 }}>
              Digite a senha de ação para iniciar a verificação (dry_run, não escreve no catálogo).
            </p>
            <input
              type="password"
              autoFocus
              value={verifyPasswordInput}
              onChange={(e) => setVerifyPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleVerifyNow()}
              placeholder="Senha de ação"
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '8px 10px', borderRadius: 8, border: `1px solid ${t.border}`, marginBottom: 16, background: t.bg, color: t.text }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => { setShowVerifyPasswordModal(false); setVerifyPasswordInput('') }}
                style={{ fontSize: 13, color: t.text, background: 'none', border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleVerifyNow}
                style={{ fontSize: 13, color: '#fff', background: '#2563EB', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer' }}>
                Verificar
              </button>
            </div>
          </div>
        </div>
      )}

      {showSyncConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: t.bg, borderRadius: 12, padding: 24, maxWidth: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: t.text }}>Confirmar sincronização</h3>
            <p style={{ fontSize: 13, color: t.text, marginBottom: 10 }}>
              Esta ação atualizará o catálogo interno com os dados atuais da Bagy.
            </p>
            <ul style={{ fontSize: 12, color: t.textMuted, margin: '0 0 16px', paddingLeft: 18, lineHeight: 1.6 }}>
              <li>Produtos existentes (<code>products</code>) podem ser atualizados</li>
              <li>Produtos novos publicados na Bagy podem ser adicionados ao catálogo (cada um revalidado antes de inserir)</li>
              <li>Variações (<code>product_variations</code>) podem ser inseridas/atualizadas</li>
              <li>Exceções (404, página inválida, conflito) serão puladas com segurança — nunca alteradas/corrigidas automaticamente</li>
              <li>Cada produto (existente ou novo) é gravado via RPC transacional (tudo ou nada)</li>
            </ul>
            <input
              type="password"
              autoFocus
              value={syncPasswordInput}
              onChange={(e) => setSyncPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSyncConfirm()}
              placeholder="Senha de ação"
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '8px 10px', borderRadius: 8, border: `1px solid ${t.border}`, marginBottom: 16, background: t.bg, color: t.text }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => { setShowSyncConfirm(false); setSyncPasswordInput('') }}
                style={{ fontSize: 13, color: t.text, background: 'none', border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleSyncConfirm}
                style={{ fontSize: 13, color: '#fff', background: '#DC2626', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer' }}>
                Confirmar sincronização
              </button>
            </div>
          </div>
        </div>
      )}

      {v2Loading ? (
        <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 14, padding: 20, marginBottom: 20, fontSize: 12, color: t.textMuted }}>
          Carregando resumo...
        </div>
      ) : v2Error ? (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 14, padding: '10px 14px', color: '#E8192C', fontSize: 13, marginBottom: 20 }}>
          ⚠️ Não foi possível carregar o resumo: {v2Error}
        </div>
      ) : v2Dashboard ? (
        <ExecutiveSummary t={t} dashboard={v2Dashboard} />
      ) : null}

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: t.textMuted, fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>Histórico de execuções</div>
        {v2RunsLoading ? (
          <div style={{ fontSize: 12, color: t.textMuted, padding: '8px 0' }}>Carregando histórico...</div>
        ) : v2RunsError ? (
          <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '10px 14px', color: '#E8192C', fontSize: 13 }}>
            ⚠️ Não foi possível carregar o histórico: {v2RunsError}
          </div>
        ) : v2Runs.length === 0 ? (
          <div style={{ fontSize: 12, color: t.textMuted, padding: '8px 0' }}>Nenhuma execução do sincronizador registrada ainda.</div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(showAllV2Runs ? v2Runs : v2Runs.slice(0, 5)).map(r => {
                const active = selectedV2RunId === r.run_id
                const statusColor = STATUS_FINAL_COLOR[r.status_final] || STATUS_FINAL_DEFAULT_COLOR
                return (
                  <div key={r.run_id} onClick={() => setSelectedV2RunId(r.run_id)} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
                    padding: '7px 12px', borderRadius: 8, flexWrap: 'wrap', gap: 6,
                    background: active ? (t.primaryBg || '#FEF2F2') : 'transparent',
                    border: `1px solid ${active ? (t.primary || '#E8192C') : t.border}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: t.text, fontWeight: active ? 600 : 400 }}>
                        {new Date(r.finished_at || r.started_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: r.mode === 'write' ? '#DC2626' : '#6B7280', background: r.mode === 'write' ? '#FEF2F2' : '#F3F4F6', borderRadius: 6, padding: '1px 6px', textTransform: 'uppercase' }}>
                        {r.mode === 'write' ? 'WRITE' : r.mode === 'dry_run' ? 'DRY RUN' : (r.mode || '—')}
                      </span>
                      <span style={{ fontSize: 11, color: t.textMuted }}>{r.trigger || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 11, color: t.textMuted }}>{r.total_analisado ?? '—'} analisados</span>
                      <span style={{ fontSize: 11, color: t.textMuted }}>{exceptionsTotalForRun(r)} {exceptionsTotalForRun(r) === 1 ? 'exceção' : 'exceções'}</span>
                      <span style={{ fontSize: 11, color: t.textMuted }}>{formatDuration(r.duration_ms)}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: statusColor }}>{r.status_final || '—'}</span>
                    </div>
                  </div>
                )
              })}
            </div>
            {v2Runs.length > 5 && (
              <button
                onClick={() => setShowAllV2Runs(v => !v)}
                style={{ marginTop: 8, fontSize: 11, color: t.primary || '#E8192C', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                {showAllV2Runs ? 'Mostrar menos' : `Ver todas as execuções (${v2Runs.length})`}
              </button>
            )}
          </>
        )}
      </div>

      <div>
        <div style={{ fontSize: 11, color: t.textMuted, fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>Pendências de sincronização</div>

        {v2ExcLoading ? (
          <div style={{ fontSize: 12, color: t.textMuted, padding: '8px 0' }}>Carregando pendências...</div>
        ) : v2ExcError ? (
          <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '10px 14px', color: '#E8192C', fontSize: 13 }}>
            ⚠️ Não foi possível carregar as pendências: {v2ExcError}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              <FilterChip active={v2ExcFilterTipo === 'all'} onClick={() => setV2ExcFilterTipo('all')} color={t.primary || '#E8192C'}
                label={`Todos (${v2Exceptions.length})`} />
              {Object.entries(EXCEPTION_TYPE_META).map(([tipo, meta]) => (v2ExcCountsByTipo[tipo] > 0) && (
                <FilterChip key={tipo} active={v2ExcFilterTipo === tipo} onClick={() => setV2ExcFilterTipo(tipo)} color={meta.color}
                  label={`${meta.label} (${v2ExcCountsByTipo[tipo]})`} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              <FilterChip active={v2ExcFilterStatus === 'all'} onClick={() => setV2ExcFilterStatus('all')} color="#6B7280"
                label="Todos os status" />
              {Object.entries(EXCEPTION_STATUS_LABEL).map(([status, label]) => (
                <FilterChip key={status} active={v2ExcFilterStatus === status} onClick={() => setV2ExcFilterStatus(status)} color="#6B7280"
                  label={`${label} (${v2ExcCountsByStatus[status] || 0})`} />
              ))}
            </div>

            {v2ExcFiltered.length === 0 ? (
              <div style={{ textAlign: 'center', color: t.textMuted, fontSize: 13, padding: '40px 0' }}>
                {v2Exceptions.length === 0 ? 'Nenhuma pendência registrada. 🎉' : 'Nenhum item nesse filtro.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {v2ExcFiltered.map(exc => (
                  <V2ExceptionCard
                    key={exc.id}
                    exc={exc}
                    t={t}
                    product={v2ProductsByLink?.get(exc.link)}
                    productsById={v2ProductsById}
                    onStatusChanged={(newStatus) => handleExceptionStatusChanged(exc.id, exc.status, newStatus)}
                    onNavigateToCatalogProduct={onNavigateToCatalogProduct}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
    </div>
  )
}

function ExecutiveSummary({ t, dashboard }) {
  const { productCounts, exceptionCounts, latestRun, statusGeral } = dashboard

  return (
    <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 14, padding: 20, marginBottom: 20, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
      <HealthRing status={statusGeral} />
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 8 }}>
          {latestRun
            ? <>Última execução: {new Date(latestRun.finished_at || latestRun.started_at).toLocaleString('pt-BR')} · {latestRun.mode} · {latestRun.trigger}</>
            : 'Nenhuma execução do sincronizador registrada ainda'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
          <SummaryLine icon="📦" label="Produtos" value={productCounts.total} color={t.text} />
          <SummaryLine icon="🔗" label="Sincronizados" value={productCounts.sincronizados} color="#0EC331" />
          <SummaryLine icon="✍️" label="Manuais" value={productCounts.manuais} color="#6366F1" />
          <SummaryLine icon="⚠️" label="Exceções abertas" value={exceptionCounts.porStatus.aberto} color="#E8192C" />
          {latestRun && (
            <>
              <SummaryLine icon="📊" label="Analisados" value={latestRun.total_analisado} color={t.text} />
              <SummaryLine icon="✅" label="Sem mudança" value={latestRun.sem_mudanca} color="#0EC331" />
              <SummaryLine icon="🔴" label="404" value={latestRun.total_404} color="#E8192C" />
              <SummaryLine icon="🟡" label="Página inválida" value={latestRun.pagina_invalida} color="#F59E0B" />
              <SummaryLine icon="🟠" label="Conflitos" value={latestRun.duplicate_conflict} color="#F97316" />
              <SummaryLine icon="🌐" label="Erro de rede" value={latestRun.erro_rede} color="#6B7280" />
              <SummaryLine icon="🔁" label="Retries" value={latestRun.retries_executados} color="#6B7280" />
              <SummaryLine icon="➕" label="Variações inseridas" value={latestRun.variacoes_inseridas} color="#7C3AED" />
              <SummaryLine icon="♻️" label="Variações atualizadas" value={latestRun.variacoes_atualizadas} color="#7C3AED" />
              <SummaryLine icon="🏁" label="Status final" value={latestRun.status_final} color={t.text} />
              <SummaryLine icon="⏱️" label="Duração" value={formatDuration(latestRun.duration_ms)} color={t.text} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryLine({ icon, label, value, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
      <span>{icon}</span>
      <span style={{ color: '#6B7280' }}>{label}:</span>
      <span style={{ fontWeight: 700, color }}>{value}</span>
    </div>
  )
}

function HealthRing({ status }) {
  const color = STATUS_GERAL_COLOR[status?.status] || '#D1D5DB'
  const icon = STATUS_GERAL_ICON[status?.status] || '⚪'
  return (
    <div style={{ position: 'relative', width: 110, height: 110, flexShrink: 0 }}>
      <div style={{
        width: 110, height: 110, borderRadius: '50%',
        background: color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.6s ease',
      }}>
        <div style={{ width: 88, height: 88, borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 4 }}>
          <div style={{ fontSize: 22 }}>{icon}</div>
          <div style={{ fontSize: 9, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{status?.label || 'Status'}</div>
        </div>
      </div>
    </div>
  )
}

function FilterChip({ active, onClick, color, label }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 12, padding: '5px 12px', borderRadius: 9999, border: `1px solid ${color}`, cursor: 'pointer', fontWeight: 600,
      background: active ? color : `${color}12`,
      color: active ? '#fff' : color,
    }}>{label}</button>
  )
}

// Fase 4/5 — card de 1 exceção de bagy_sync_exceptions. "Corrigir" continua
// desabilitado (fora do escopo desta fase) e "Ver na Bagy" continua funcional
// (o link é o mesmo dado real, não muda com a fonte).
//
// Ignorar/Reativar (Fase 5): o card gerencia sua própria chamada de escrita
// (ignoreException/reactivateException, via system-tools?tool=bagy-exception-
// status, service_role) — só avisa o pai (onStatusChanged) depois de confirmado
// pelo backend. Nunca muda o texto/cor visualmente antes da resposta chegar
// (sem otimismo prematuro) — evita mostrar "ignorado" se a escrita falhar.
//
// "Ver no Catálogo" (Fase 6): reutiliza o Catálogo V1 existente (nenhum
// drawer novo) — nunca escolhe sozinho entre 2 produtos de um
// duplicate_conflict. Para os outros tipos, resolve por `product` (já vem do
// Map<link, product> carregado 1x pelo pai). Para duplicate_conflict, usa os
// 2 IDs reais do próprio `detalhe.ids` (gravados pelo sincronizador) contra
// `productsById` (mesma leitura única de products, sem query nova) — mostra
// 1 botão por produto, nunca abre um lado arbitrariamente.
function V2ExceptionCard({ exc, t, product, productsById, onStatusChanged, onNavigateToCatalogProduct }) {
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)
  // Correção de segurança — Ignorar/Reativar também exigem BAGY_UI_ACTION_SECRET
  // agora. Campo de senha inline (sem modal novo) — mais simples visualmente.
  const [showPasswordInput, setShowPasswordInput] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const meta = EXCEPTION_TYPE_META[exc.tipo] || { label: exc.tipo, color: '#6B7280' }
  const detalheTexto = formatExceptionDetalhe(exc.detalhe)

  const conflictIds = exc.tipo === 'duplicate_conflict' && Array.isArray(exc.detalhe?.ids) ? exc.detalhe.ids : null

  async function handleToggleStatus() {
    const senha = passwordInput
    setShowPasswordInput(false)
    setPasswordInput('')
    setBusy(true)
    setActionError(null)
    try {
      const updated = exc.status === 'aberto' ? await ignoreException(exc.id, senha) : await reactivateException(exc.id, senha)
      onStatusChanged(updated?.status || (exc.status === 'aberto' ? 'ignorado' : 'aberto'))
    } catch (e) {
      setActionError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 10, padding: '12px 14px', opacity: exc.status === 'ignorado' ? 0.6 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: meta.color, background: `${meta.color}15`, borderRadius: 6, padding: '2px 8px' }}>{meta.label}</span>
          <span style={{ fontSize: 11, color: '#9CA3AF' }}>· {EXCEPTION_STATUS_LABEL[exc.status] || exc.status}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a href={exc.link} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: t.textMuted }}>ver na Bagy ↗</a>
          <button title="Correção automática ainda não implementada — em breve" disabled
            style={{ fontSize: 11, color: '#9CA3AF', background: 'none', border: `1px solid ${t.border}`, borderRadius: 6, padding: '2px 8px', cursor: 'not-allowed' }}>
            Corrigir
          </button>
          {exc.status === 'aberto' && (
            <button onClick={() => setShowPasswordInput(v => !v)} disabled={busy}
              style={{ fontSize: 11, color: '#6B7280', background: 'none', border: `1px solid ${t.border}`, borderRadius: 6, padding: '2px 8px', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>
              {busy ? '...' : 'Ignorar'}
            </button>
          )}
          {exc.status === 'ignorado' && (
            <button onClick={() => setShowPasswordInput(v => !v)} disabled={busy}
              style={{ fontSize: 11, color: '#7C3AED', background: 'none', border: '1px solid #7C3AED', borderRadius: 6, padding: '2px 8px', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>
              {busy ? '...' : 'Reativar'}
            </button>
          )}
        </div>
      </div>

      {showPasswordInput && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
          <input
            type="password"
            autoFocus
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleToggleStatus()}
            placeholder="Senha de ação"
            style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: `1px solid ${t.border}`, background: t.bg, color: t.text, flex: 1, maxWidth: 180 }}
          />
          <button onClick={handleToggleStatus}
            style={{ fontSize: 11, color: '#fff', background: exc.status === 'aberto' ? '#6B7280' : '#7C3AED', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
            Confirmar
          </button>
          <button onClick={() => { setShowPasswordInput(false); setPasswordInput('') }}
            style={{ fontSize: 11, color: t.textMuted, background: 'none', border: 'none', cursor: 'pointer' }}>
            Cancelar
          </button>
        </div>
      )}
      <div style={{ fontSize: 12, color: t.text, fontWeight: 600 }}>
        {product?.nome || exc.link}
      </div>
      {product?.preco && <div style={{ fontSize: 11, color: t.textMuted }}>{product.preco}</div>}

      {onNavigateToCatalogProduct && conflictIds && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          {conflictIds.map((id, idx) => {
            const p = productsById?.get(id)
            return (
              <button key={id} onClick={() => onNavigateToCatalogProduct(id)}
                style={{ fontSize: 11, color: '#6366F1', background: 'none', border: '1px solid #6366F1', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>
                Ver no Catálogo — {p?.nome ? p.nome : `produto ${idx + 1}`}
              </button>
            )
          })}
        </div>
      )}
      {onNavigateToCatalogProduct && !conflictIds && product?.id && (
        <button onClick={() => onNavigateToCatalogProduct(product.id)}
          style={{ fontSize: 11, color: '#6366F1', background: 'none', border: '1px solid #6366F1', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', marginTop: 6 }}>
          Ver no Catálogo
        </button>
      )}
      {detalheTexto && (
        <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4 }}>{detalheTexto}</div>
      )}
      {actionError && (
        <div style={{ fontSize: 11, color: '#E8192C', marginTop: 4 }}>⚠️ Não foi possível atualizar: {actionError}</div>
      )}
      <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 6 }}>
        1ª detecção: {new Date(exc.primeira_deteccao).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        {' · '}última: {new Date(exc.ultima_deteccao).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        {exc.run_id_ultima_deteccao && <> · run: {exc.run_id_ultima_deteccao}</>}
      </div>
    </div>
  )
}
