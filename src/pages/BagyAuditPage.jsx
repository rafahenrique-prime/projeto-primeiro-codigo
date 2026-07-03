import { useState, useEffect } from 'react'
import { useTheme } from '../theme.jsx'
import { runBagyAudit, getAuditRuns, getAuditResults } from '../services/bagyAuditService'

const STATUS_LABEL = {
  missing_in_catalog: { label: 'Não está no catálogo', color: '#E8192C' },
  missing_in_bagy: { label: 'Sumiu da Bagy', color: '#F59E0B' },
  price_diff: { label: 'Preço diferente', color: '#7C3AED' },
  name_diff: { label: 'Nome diferente', color: '#6366F1' },
  price_and_name_diff: { label: 'Preço + nome diferentes', color: '#DB2777' },
}

function formatBRL(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
}

export default function BagyAuditPage() {
  const { theme: t } = useTheme()
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const [runs, setRuns] = useState([])
  const [activeRun, setActiveRun] = useState(null)
  const [results, setResults] = useState([])
  const [filter, setFilter] = useState('all')

  useEffect(() => { loadRuns() }, [])

  async function loadRuns() {
    const r = await getAuditRuns()
    setRuns(r)
    if (r.length > 0 && !activeRun) selectRun(r[0].run_id)
  }

  async function selectRun(runId) {
    setActiveRun(runId)
    const res = await getAuditResults(runId)
    setResults(res)
  }

  async function handleRun() {
    setRunning(true)
    setError(null)
    setProgress({ processed: 0, total: null })
    try {
      const out = await runBagyAudit((processed, total) => setProgress({ processed, total }))
      await loadRuns()
      await selectRun(out.runId)
    } catch (e) {
      setError(e.message)
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  const filtered = filter === 'all' ? results : results.filter(r => r.status === filter)
  const counts = results.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc }, {})

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: t.text, margin: 0 }}>🔍 Auditoria Bagy (Beta)</h1>
        <button
          onClick={handleRun}
          disabled={running}
          style={{
            background: running ? '#DDD6FE' : '#7C3AED', color: '#fff', border: 'none',
            borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600,
            cursor: running ? 'not-allowed' : 'pointer',
          }}
        >
          {running
            ? progress?.total ? `Rodando... ${progress.processed}/${progress.total}` : 'Iniciando...'
            : 'Rodar auditoria agora'}
        </button>
      </div>
      <p style={{ fontSize: 12, color: t.textMuted, marginTop: 0, marginBottom: 20 }}>
        Compara os produtos publicados na Bagy (via sitemap público) com o catálogo interno. Não usa a API paga da Bagy e não altera nada no catálogo — só lê e gera relatório. Execução manual, sem agendamento automático ainda.
      </p>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '10px 14px', color: '#E8192C', fontSize: 13, marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {runs.length > 0 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: t.textMuted, fontWeight: 600, textTransform: 'uppercase' }}>Execuções:</span>
          {runs.map(r => (
            <button key={r.run_id} onClick={() => selectRun(r.run_id)} style={{
              fontSize: 11, padding: '3px 10px', borderRadius: 9999, border: 'none', cursor: 'pointer',
              background: activeRun === r.run_id ? (t.primary || '#E8192C') : t.bgTertiary,
              color: activeRun === r.run_id ? '#fff' : t.textMid,
            }}>{new Date(r.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</button>
          ))}
        </div>
      )}

      {activeRun && (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            <button onClick={() => setFilter('all')} style={{
              fontSize: 12, padding: '5px 12px', borderRadius: 9999, border: 'none', cursor: 'pointer', fontWeight: 600,
              background: filter === 'all' ? (t.primary || '#E8192C') : t.bgTertiary,
              color: filter === 'all' ? '#fff' : t.textMid,
            }}>Todos ({results.length})</button>
            {Object.entries(STATUS_LABEL).map(([key, meta]) => counts[key] && (
              <button key={key} onClick={() => setFilter(key)} style={{
                fontSize: 12, padding: '5px 12px', borderRadius: 9999, border: `1px solid ${meta.color}`, cursor: 'pointer', fontWeight: 600,
                background: filter === key ? meta.color : `${meta.color}12`,
                color: filter === key ? '#fff' : meta.color,
              }}>{meta.label} ({counts[key]})</button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', color: t.textMuted, fontSize: 13, padding: '40px 0' }}>
              {results.length === 0 ? 'Nenhuma divergência encontrada nessa execução. 🎉' : 'Nenhum item nesse filtro.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(r => {
                const meta = STATUS_LABEL[r.status] || { label: r.status, color: '#6B7280' }
                return (
                  <div key={r.id} style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: meta.color, background: `${meta.color}15`, borderRadius: 6, padding: '2px 8px' }}>{meta.label}</span>
                      {r.url && <a href={r.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: t.textMuted }}>ver na Bagy ↗</a>}
                    </div>
                    <div style={{ display: 'flex', gap: 24, fontSize: 12, color: t.textMid, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ color: t.textMuted, fontSize: 10, textTransform: 'uppercase', marginBottom: 2 }}>Bagy</div>
                        <div>{r.bagy_name || '—'}</div>
                        <div>{formatBRL(r.bagy_price)} {r.bagy_stock === 'out_of_stock' && <span style={{ color: '#E8192C' }}>· sem estoque</span>}</div>
                      </div>
                      <div>
                        <div style={{ color: t.textMuted, fontSize: 10, textTransform: 'uppercase', marginBottom: 2 }}>Catálogo interno</div>
                        <div>{r.catalog_name || '—'}</div>
                        <div>{formatBRL(r.catalog_price)}</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {!activeRun && !running && (
        <div style={{ textAlign: 'center', color: t.textMuted, fontSize: 13, padding: '60px 0' }}>
          Nenhuma auditoria rodada ainda. Clique em "Rodar auditoria agora" pra começar.
        </div>
      )}
    </div>
  )
}
