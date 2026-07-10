import { useState, useEffect } from 'react'
import { useTheme } from '../theme.jsx'
import { runBagyAudit, getAuditRuns, getAuditResults, setDivergenceIgnored } from '../services/auditoria/bagyAuditService'

const STATUS_LABEL = {
  missing_in_catalog: { label: 'Somente na Bagy', color: '#E8192C' },
  missing_in_bagy: { label: 'Somente no Catálogo', color: '#F59E0B' },
  price_diff: { label: 'Preço diferente', color: '#7C3AED' },
  name_diff: { label: 'Nome diferente', color: '#6366F1' },
  price_and_name_diff: { label: 'Preço + nome diferentes', color: '#DB2777' },
}

function formatBRL(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
}

function healthColor(pct) {
  if (pct >= 98) return '#0EC331'
  if (pct >= 90) return '#F59E0B'
  return '#E8192C'
}

export default function BagyAuditPage() {
  const { theme: t } = useTheme()
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const [runs, setRuns] = useState([])
  const [activeRun, setActiveRun] = useState(null)
  const [results, setResults] = useState([])
  const [totalUrls, setTotalUrls] = useState(null)
  const [filter, setFilter] = useState('all')

  useEffect(() => { loadRuns() }, [])

  async function loadRuns() {
    const r = await getAuditRuns()
    setRuns(r)
    if (r.length > 0) selectRun(r[0].run_id)
  }

  async function selectRun(runId) {
    setActiveRun(runId)
    const { items, totalUrls } = await getAuditResults(runId)
    setResults(items)
    setTotalUrls(totalUrls)
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

  async function handleIgnore(item) {
    const reason = item.diff_kind === 'cosmetic_name'
      ? 'Diferença cosmética (acento/pontuação) — auto-detectada'
      : window.prompt('Motivo de ignorar essa divergência (opcional):') || 'Sem motivo informado'
    const ok = await setDivergenceIgnored(item.id, true, reason)
    if (ok) setResults(prev => prev.map(r => r.id === item.id ? { ...r, ignored: true, ignore_reason: reason } : r))
  }

  async function handleUnignore(item) {
    const ok = await setDivergenceIgnored(item.id, false, null)
    if (ok) setResults(prev => prev.map(r => r.id === item.id ? { ...r, ignored: false, ignore_reason: null } : r))
  }

  // Achamos totalUrls a partir do run atual? Não persistimos separadamente — usamos a soma
  // de todos os status como aproximação de "analisados" só pra runs antigas sem esse dado.
  const activeRunMeta = runs.find(r => r.run_id === activeRun)
  const nonIgnored = results.filter(r => !r.ignored)
  const counts = nonIgnored.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc }, {})
  const ignoredCount = results.filter(r => r.ignored).length
  const totalDivergences = nonIgnored.length

  const filtered = filter === 'all' ? nonIgnored
    : filter === 'ignored' ? results.filter(r => r.ignored)
    : nonIgnored.filter(r => r.status === filter)

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: t.bg, borderRadius: 12 }}>
    <div style={{ padding: 24, maxWidth: 1040, margin: '0 auto' }}>
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
        Compara os produtos publicados na Bagy (via sitemap público) com o catálogo interno. Não usa a API paga da Bagy e não altera nada no catálogo — só lê e gera relatório.
      </p>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '10px 14px', color: '#E8192C', fontSize: 13, marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {activeRun && (
        <ExecutiveSummary
          t={t}
          totalDivergences={totalDivergences}
          counts={counts}
          ignoredCount={ignoredCount}
          lastRunAt={activeRunMeta?.created_at}
          analyzed={totalUrls}
        />
      )}

      {runs.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: t.textMuted, fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>Histórico de execuções</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {runs.map(r => {
              const active = activeRun === r.run_id
              return (
                <div key={r.run_id} onClick={() => selectRun(r.run_id)} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
                  padding: '7px 12px', borderRadius: 8,
                  background: active ? (t.primaryBg || '#FEF2F2') : 'transparent',
                  border: `1px solid ${active ? (t.primary || '#E8192C') : t.border}`,
                }}>
                  <span style={{ fontSize: 12, color: t.text, fontWeight: active ? 600 : 400 }}>
                    {new Date(r.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span style={{ fontSize: 11, color: t.textMuted }}>{r.divergences} divergência{r.divergences !== 1 ? 's' : ''}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {activeRun && (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} color={t.primary || '#E8192C'}
              label={`Todos (${totalDivergences})`} />
            {Object.entries(STATUS_LABEL).map(([key, meta]) => counts[key] && (
              <FilterChip key={key} active={filter === key} onClick={() => setFilter(key)} color={meta.color}
                label={`${meta.label} (${counts[key]})`} />
            ))}
            {ignoredCount > 0 && (
              <FilterChip active={filter === 'ignored'} onClick={() => setFilter('ignored')} color="#9CA3AF"
                label={`Ignorados (${ignoredCount})`} />
            )}
          </div>

          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', color: t.textMuted, fontSize: 13, padding: '40px 0' }}>
              {totalDivergences === 0 ? 'Nenhuma divergência encontrada nessa execução. 🎉' : 'Nenhum item nesse filtro.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(r => (
                <DivergenceCard key={r.id} r={r} t={t} onIgnore={handleIgnore} onUnignore={handleUnignore} />
              ))}
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
    </div>
  )
}

function ExecutiveSummary({ t, totalDivergences, counts, ignoredCount, lastRunAt, analyzed }) {
  const missingInCatalog = counts.missing_in_catalog || 0
  const missingInBagy = counts.missing_in_bagy || 0
  const nameOnly = counts.name_diff || 0
  const priceOnly = counts.price_diff || 0
  const both = counts.price_and_name_diff || 0
  const hasTotal = analyzed != null
  const synced = hasTotal ? Math.max(analyzed - totalDivergences, 0) : null
  const health = hasTotal && analyzed > 0 ? (synced / analyzed) * 100 : null

  return (
    <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 14, padding: 20, marginBottom: 20, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
      <HealthRing pct={health} />
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 8 }}>
          Última auditoria: {lastRunAt ? new Date(lastRunAt).toLocaleString('pt-BR') : '—'}
          {hasTotal ? ` · ${analyzed} produtos analisados` : ' · total analisado indisponível nessa execução (rodada antes dessa métrica existir)'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
          <SummaryLine icon="✅" label="Sincronizados" value={synced ?? '—'} color="#0EC331" />
          <SummaryLine icon="⚠️" label="Nome diferente" value={nameOnly} color="#6366F1" />
          <SummaryLine icon="💰" label="Preço diferente" value={priceOnly} color="#7C3AED" />
          <SummaryLine icon="🔀" label="Preço + nome" value={both} color="#DB2777" />
          <SummaryLine icon="📦" label="Somente na Bagy" value={missingInCatalog} color="#E8192C" />
          <SummaryLine icon="📋" label="Somente no Catálogo" value={missingInBagy} color="#F59E0B" />
          {ignoredCount > 0 && <SummaryLine icon="🙈" label="Ignorados" value={ignoredCount} color="#9CA3AF" />}
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

function HealthRing({ pct }) {
  const known = pct != null
  const color = known ? healthColor(pct) : '#D1D5DB'
  const deg = known ? Math.max(0, Math.min(100, pct)) * 3.6 : 0
  return (
    <div style={{ position: 'relative', width: 110, height: 110, flexShrink: 0 }}>
      <div style={{
        width: 110, height: 110, borderRadius: '50%',
        background: `conic-gradient(${color} ${deg}deg, #E5E7EB ${deg}deg)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.6s ease',
      }}>
        <div style={{ width: 88, height: 88, borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: known ? 20 : 14, fontWeight: 800, color }}>{known ? `${pct.toFixed(1)}%` : '—'}</div>
          <div style={{ fontSize: 9, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Saúde</div>
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

function DivergenceCard({ r, t, onIgnore, onUnignore }) {
  const meta = STATUS_LABEL[r.status] || { label: r.status, color: '#6B7280' }
  const isCosmetic = r.diff_kind === 'cosmetic_name' && !r.ignored
  return (
    <div style={{ background: t.bg, border: `1px solid ${r.ignored ? t.border : t.border}`, borderRadius: 10, padding: '12px 14px', opacity: r.ignored ? 0.6 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: meta.color, background: `${meta.color}15`, borderRadius: 6, padding: '2px 8px' }}>{meta.label}</span>
          {isCosmetic && (
            <span title="Só difere em acento/pontuação — provavelmente é o mesmo produto" style={{ fontSize: 11, fontWeight: 600, color: '#059669', background: '#ECFDF5', borderRadius: 6, padding: '2px 8px' }}>
              ✨ Diferença cosmética (acento/hífen)
            </span>
          )}
          {r.ignored && (
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>· ignorado{r.ignore_reason ? `: ${r.ignore_reason}` : ''}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {r.url && <a href={r.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: t.textMuted }}>ver na Bagy ↗</a>}
          <button title="Correção automática ainda não implementada — em breve" disabled
            style={{ fontSize: 11, color: '#9CA3AF', background: 'none', border: `1px solid ${t.border}`, borderRadius: 6, padding: '2px 8px', cursor: 'not-allowed' }}>
            Corrigir
          </button>
          {r.ignored
            ? <button onClick={() => onUnignore(r)} style={{ fontSize: 11, color: '#7C3AED', background: 'none', border: '1px solid #7C3AED', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>Reativar</button>
            : <button onClick={() => onIgnore(r)} style={{ fontSize: 11, color: '#6B7280', background: 'none', border: `1px solid ${t.border}`, borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>Ignorar</button>
          }
        </div>
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
}
