// PARTE 56 / Fase 3 (leitura) + Fase 4 (Ignorar/Reativar) + Fase 5 (refresh
// pós-auditoria) — orquestra a busca/filtro/paginação de findings da
// Auditoria de Qualidade, o patch local depois de uma triagem confirmada
// pelo backend (handleFindingStatusChanged abaixo), e o refetch isolado
// quando o pai sinaliza que uma nova auditoria terminou (refreshSignal).
// Nunca acessa Supabase direto — só getQualityFindings (leitura) e,
// indiretamente via QualityFindingCard, setFindingStatus (escrita,
// protegida por senha de ação).

import { useState, useEffect, useCallback, useRef } from 'react'
import { getQualityFindings } from '../../services/auditoria/qualidadeCatalogoData.js'
import QualityFilters, { ehIdNumerico } from './QualityFilters.jsx'
import QualityFindingCard from './QualityFindingCard.jsx'

const PAGE_SIZE = 50

// Ordenação local (só dentro da página já carregada — a API não ordena por
// severidade/classe, e não é alterada nesta fase). Nunca afirma ser uma
// ordenação global entre páginas.
const SEVERIDADE_RANK = { CRITICO: 0, IMPORTANTE: 1, REVISAR: 2 }
const CLASSE_RANK = { FATO: 0, ALERTA: 1, SUGESTAO: 2 }

export function ordenarLocal(findings) {
  return [...findings].sort((a, b) => {
    const sevDiff = (SEVERIDADE_RANK[a.severidade] ?? 99) - (SEVERIDADE_RANK[b.severidade] ?? 99)
    if (sevDiff !== 0) return sevDiff
    return (CLASSE_RANK[a.classe] ?? 99) - (CLASSE_RANK[b.classe] ?? 99)
  })
}

// Só os parâmetros que catalog-quality-findings realmente suporta — nenhum
// inventado (nada de `ativo`, nada de ordenação server-side).
export function montarParametrosApi(filters) {
  const params = { limit: PAGE_SIZE }
  if (filters.status && filters.status !== 'all') params.status = filters.status
  if (filters.severidade && filters.severidade !== 'all') params.severidade = filters.severidade
  if (filters.classe && filters.classe !== 'all') params.classe = filters.classe
  if (filters.tipo && filters.tipo !== 'all') params.tipo = filters.tipo
  const busca = (filters.busca || '').trim()
  if (busca) {
    // Só valor puramente numérico vira bagyProductId — qualquer outra coisa
    // (inclusive "boné 123") é tratada como nome, nunca presumido ID.
    if (ehIdNumerico(busca)) params.bagyProductId = busca
    else params.nome = busca
  }
  return params
}

const FILTROS_PADRAO = { classe: 'all', severidade: 'all', status: 'aberto', tipo: 'all', busca: '' }

export default function QualityFindingsList({ t, refreshSignal }) {
  const [filters, setFilters] = useState(FILTROS_PADRAO)
  const [findings, setFindings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [tiposVistos, setTiposVistos] = useState([])
  const [expandedFindingIds, setExpandedFindingIds] = useState(() => new Set())
  // Descarta respostas obsoletas (ex.: troca rápida de filtro antes da 1ª
  // resposta voltar) — nunca deixa uma resposta antiga sobrescrever um
  // filtro mais novo.
  const requestIdRef = useRef(0)
  const filtersRef = useRef(filters)
  filtersRef.current = filters
  const primeiroRenderRef = useRef(true)

  const carregar = useCallback((filtrosAtuais, offsetAtual, modo) => {
    const meuRequestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    const params = { ...montarParametrosApi(filtrosAtuais), offset: offsetAtual }
    getQualityFindings(params)
      .then((rows) => {
        if (meuRequestId !== requestIdRef.current) return
        setFindings((prev) => {
          if (modo === 'append') {
            const idsExistentes = new Set(prev.map((f) => f.id))
            return [...prev, ...rows.filter((f) => !idsExistentes.has(f.id))]
          }
          return rows
        })
        setHasMore(rows.length === PAGE_SIZE)
        setTiposVistos((prev) => Array.from(new Set([...prev, ...rows.map((f) => f.tipo)])).sort())
      })
      .catch((e) => { if (meuRequestId === requestIdRef.current) setError(e.message) })
      .finally(() => { if (meuRequestId === requestIdRef.current) setLoading(false) })
  }, [])

  useEffect(() => {
    carregar(FILTROS_PADRAO, 0, 'replace')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fase 5 — refresh isolado depois de "Auditar Qualidade" bem-sucedido.
  // Só existe porque esta lista já foi montada (o pai só passa refreshSignal
  // pra componentes que já foram abertos ao menos 1x) — respeita os filtros
  // ATUAIS (nunca volta pro padrão), só reseta o offset já que o conjunto de
  // findings pode ter mudado inteiro. Nunca dispara no mount inicial (o
  // efeito acima já cobre isso).
  useEffect(() => {
    if (primeiroRenderRef.current) { primeiroRenderRef.current = false; return }
    if (refreshSignal === undefined) return
    setOffset(0)
    setExpandedFindingIds(new Set())
    carregar(filtersRef.current, 0, 'replace')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal])

  // Toda mudança de filtro: reseta offset, substitui a lista — nunca
  // concatena resultados de filtros diferentes.
  function handleFilterChange(patch) {
    const novosFiltros = { ...filters, ...patch }
    setFilters(novosFiltros)
    setOffset(0)
    setExpandedFindingIds(new Set())
    carregar(novosFiltros, 0, 'replace')
  }

  function handleCarregarMais() {
    const novoOffset = offset + PAGE_SIZE
    setOffset(novoOffset)
    carregar(filters, novoOffset, 'append')
  }

  function toggleExpand(id) {
    setExpandedFindingIds((prev) => {
      const novo = new Set(prev)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  // Fase 4 — patch local depois da confirmação do backend (QualityFindingCard
  // só chama isto após setFindingStatus resolver com sucesso — nunca antes).
  // Nunca refaz a busca inteira: se o novo status ainda satisfaz o filtro
  // atual, só atualiza a linha; se deixou de satisfazer (ex.: filtro
  // "aberto" e o finding virou "ignorado"), remove só essa linha da lista —
  // filtros/busca/paginação/outros cards expandidos continuam intactos.
  function handleFindingStatusChanged(updatedFinding) {
    setFindings((prev) => {
      if (updatedFinding.status !== filters.status) {
        return prev.filter((f) => f.id !== updatedFinding.id)
      }
      return prev.map((f) => (f.id === updatedFinding.id ? { ...f, ...updatedFinding } : f))
    })
    setExpandedFindingIds((prev) => {
      if (!prev.has(updatedFinding.id) || updatedFinding.status === filters.status) return prev
      const novo = new Set(prev)
      novo.delete(updatedFinding.id)
      return novo
    })
  }

  const findingsOrdenados = ordenarLocal(findings)
  const filtroPadrao = filters.classe === 'all' && filters.severidade === 'all' && filters.status === 'aberto' && filters.tipo === 'all' && !filters.busca

  return (
    <div>
      <QualityFilters filters={filters} onChange={handleFilterChange} tiposDisponiveis={tiposVistos} t={t} />

      {loading && findings.length === 0 ? (
        <div style={{ fontSize: 12, color: t.textMuted, padding: '8px 0' }}>Carregando findings...</div>
      ) : error ? (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '10px 14px', color: '#E8192C', fontSize: 13 }}>
          ⚠️ Não foi possível carregar os findings: {error}
        </div>
      ) : findingsOrdenados.length === 0 ? (
        <div style={{ textAlign: 'center', color: t.textMuted, fontSize: 13, padding: '40px 0' }}>
          {filtroPadrao ? '🎉 Nenhum problema de qualidade em aberto.' : 'Nenhum item nesse filtro.'}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {findingsOrdenados.map((finding) => (
              <QualityFindingCard
                key={finding.id}
                finding={finding}
                t={t}
                expanded={expandedFindingIds.has(finding.id)}
                onToggleExpand={() => toggleExpand(finding.id)}
                onStatusChanged={handleFindingStatusChanged}
              />
            ))}
          </div>
          {hasMore && (
            <button
              onClick={handleCarregarMais}
              disabled={loading}
              style={{ marginTop: 12, fontSize: 12, color: '#7C3AED', background: 'none', border: '1px solid #7C3AED', borderRadius: 8, padding: '7px 14px', cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'Carregando...' : 'Carregar mais'}
            </button>
          )}
        </>
      )}
    </div>
  )
}
