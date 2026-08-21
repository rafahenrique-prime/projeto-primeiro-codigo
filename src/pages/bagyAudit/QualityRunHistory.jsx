// PARTE 56 / Fase 5 — histórico de execuções da Auditoria de Qualidade.
// Área visualmente independente do histórico de sincronização (nunca
// misturados numa lista única) — mesmo princípio de separação já reforçado
// em toda a PARTE 56. Só leitura (getQualityRunHistory, camada já
// homologada na Fase 1).
//
// Idioma de "mostrar mais" combinado, de propósito: "Ver todas (N)" alterna
// mostrar as 20 já carregadas (mesmo padrão do histórico de sync — só
// reexibe o que já veio); "Carregar mais" busca a PRÓXIMA página na API
// (limit/offset) quando a última página veio cheia — só aparece quando faz
// sentido, nunca inventa paginação incompatível com a API.

import { useState, useEffect, useCallback, useRef } from 'react'
import { getQualityRunHistory } from '../../services/auditoria/qualidadeCatalogoData.js'

const PAGE_SIZE = 20
const PREVIEW_COUNT = 5

const STATUS_COLOR = { completa: '#0EC331', falha: '#E8192C' }
const STATUS_DEFAULT_COLOR = '#9CA3AF'

export default function QualityRunHistory({ t, refreshSignal }) {
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const requestIdRef = useRef(0)
  const primeiroRenderRef = useRef(true)

  const carregar = useCallback((offsetAtual, modo) => {
    const meuRequestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    getQualityRunHistory({ limit: PAGE_SIZE, offset: offsetAtual })
      .then((rows) => {
        if (meuRequestId !== requestIdRef.current) return
        setRuns((prev) => {
          if (modo === 'append') {
            const idsExistentes = new Set(prev.map((r) => r.id))
            return [...prev, ...rows.filter((r) => !idsExistentes.has(r.id))]
          }
          return rows
        })
        setHasMore(rows.length === PAGE_SIZE)
      })
      .catch((e) => { if (meuRequestId === requestIdRef.current) setError(e.message) })
      .finally(() => { if (meuRequestId === requestIdRef.current) setLoading(false) })
  }, [])

  useEffect(() => {
    carregar(0, 'replace')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fase 5 — refresh isolado depois de "Auditar Qualidade" bem-sucedido.
  // Nunca dispara no primeiro render (já carrega sozinho acima); só reage a
  // mudanças reais do sinal vindas do pai.
  useEffect(() => {
    if (primeiroRenderRef.current) { primeiroRenderRef.current = false; return }
    if (refreshSignal === undefined) return
    setOffset(0)
    carregar(0, 'replace')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal])

  function handleCarregarMais() {
    const novoOffset = offset + PAGE_SIZE
    setOffset(novoOffset)
    carregar(novoOffset, 'append')
  }

  const visiveis = showAll ? runs : runs.slice(0, PREVIEW_COUNT)

  return (
    <div>
      <div style={{ fontSize: 11, color: t.textMuted, fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>
        Auditorias de qualidade
      </div>

      {loading && runs.length === 0 ? (
        <div style={{ fontSize: 12, color: t.textMuted, padding: '8px 0' }}>Carregando histórico de qualidade...</div>
      ) : error ? (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '10px 14px', color: '#E8192C', fontSize: 13 }}>
          ⚠️ Não foi possível carregar o histórico de qualidade: {error}
        </div>
      ) : runs.length === 0 ? (
        <div style={{ fontSize: 12, color: t.textMuted, padding: '8px 0' }}>Nenhuma auditoria de qualidade registrada ainda.</div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {visiveis.map((r) => {
              const statusColor = STATUS_COLOR[r.status] || STATUS_DEFAULT_COLOR
              return (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '7px 12px', borderRadius: 8, flexWrap: 'wrap', gap: 6, border: `1px solid ${t.border}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: t.text }}>
                      {new Date(r.finished_at || r.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: statusColor }}>{r.status || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    {r.total_active_products != null && <span style={{ fontSize: 11, color: t.textMuted }}>{r.total_active_products} analisados</span>}
                    {r.products_with_findings != null && <span style={{ fontSize: 11, color: t.textMuted }}>{r.products_with_findings} com achados</span>}
                    {r.total_findings != null && <span style={{ fontSize: 11, color: t.textMuted }}>{r.total_findings} findings</span>}
                    {r.critico_count != null && <span style={{ fontSize: 11, color: '#E8192C' }}>{r.critico_count} críticos</span>}
                    {r.resolvidos_automaticamente != null && <span style={{ fontSize: 11, color: '#0EC331' }}>{r.resolvidos_automaticamente} resolvidos</span>}
                  </div>
                </div>
              )
            })}
          </div>
          {runs.length > PREVIEW_COUNT && (
            <button
              onClick={() => setShowAll((v) => !v)}
              style={{ marginTop: 8, fontSize: 11, color: '#7C3AED', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              {showAll ? 'Mostrar menos' : `Ver todas (${runs.length})`}
            </button>
          )}
          {showAll && hasMore && (
            <button
              onClick={handleCarregarMais}
              disabled={loading}
              style={{ marginTop: 8, marginLeft: 12, fontSize: 11, color: '#7C3AED', background: 'none', border: '1px solid #7C3AED', borderRadius: 8, padding: '5px 12px', cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'Carregando...' : 'Carregar mais'}
            </button>
          )}
        </>
      )}
    </div>
  )
}
