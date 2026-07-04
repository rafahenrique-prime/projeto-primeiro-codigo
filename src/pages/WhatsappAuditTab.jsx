import { useState, useEffect } from 'react'
import { runWhatsappAudit, getAuditRuns, getAuditResults, setFindingIgnored } from '../services/whatsappAuditService'

const TYPE_META = {
  sem_resposta: { label: 'Sem resposta', color: '#E8192C', icon: '⏰' },
  contato_duplicado: { label: 'Contato duplicado', color: '#7C3AED', icon: '🧬' },
  sem_nome: { label: 'Sem nome', color: '#F59E0B', icon: '❓' },
  abandonada: { label: 'Abandonada', color: '#DB2777', icon: '👋' },
  sem_interacao_recente: { label: 'Sem interação recente', color: '#9CA3AF', icon: '🗓️' },
}

export default function WhatsappAuditTab({ t }) {
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const [runs, setRuns] = useState([])
  const [activeRun, setActiveRun] = useState(null)
  const [results, setResults] = useState([])
  const [filter, setFilter] = useState('all')
  const [totalChats, setTotalChats] = useState(null)

  useEffect(() => { loadRuns(true) }, [])

  async function loadRuns(autoSelect = false) {
    const r = await getAuditRuns()
    setRuns(r)
    if (autoSelect && r.length > 0) selectRun(r[0].run_id)
  }

  async function selectRun(runId) {
    setActiveRun(runId)
    const items = await getAuditResults(runId)
    setResults(items)
  }

  async function handleRun() {
    setRunning(true)
    setError(null)
    try {
      const out = await runWhatsappAudit()
      setActiveRun(out.runId)
      setResults(out.findings.map((f, i) => ({ id: `local-${i}`, ...f })))
      setTotalChats(out.totalChats)
      await loadRuns()
    } catch (e) {
      setError(e.message)
    } finally {
      setRunning(false)
    }
  }

  async function handleIgnore(item, ignored) {
    if (String(item.id).startsWith('local-')) {
      setResults(prev => prev.map(r => r.id === item.id ? { ...r, ignored } : r))
      return
    }
    const ok = await setFindingIgnored(item.id, ignored)
    if (ok) setResults(prev => prev.map(r => r.id === item.id ? { ...r, ignored } : r))
  }

  const activeRunMeta = runs.find(r => r.run_id === activeRun)
  const nonIgnored = results.filter(r => !r.ignored)
  const counts = nonIgnored.reduce((acc, r) => { acc[r.type] = (acc[r.type] || 0) + 1; return acc }, {})
  const ignoredCount = results.filter(r => r.ignored).length

  const filtered = filter === 'all' ? nonIgnored
    : filter === 'ignored' ? results.filter(r => r.ignored)
    : nonIgnored.filter(r => r.type === filter)

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: t.text, margin: 0 }}>💬 Auditoria de WhatsApp</h2>
        <button onClick={handleRun} disabled={running} style={{
          background: running ? '#DDD6FE' : '#7C3AED', color: '#fff', border: 'none',
          borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600,
          cursor: running ? 'not-allowed' : 'pointer',
        }}>
          {running ? 'Analisando conversas...' : 'Rodar auditoria agora'}
        </button>
      </div>
      <p style={{ fontSize: 12, color: t.textMuted, marginTop: 0, marginBottom: 20 }}>
        100% regra (sem custo de IA): leads sem resposta, contatos duplicados, contatos sem nome, conversas abandonadas e sem interação recente.
      </p>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '10px 14px', color: '#E8192C', fontSize: 13, marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {activeRun && (
        <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 14, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 8 }}>
            Última auditoria: {activeRunMeta ? new Date(activeRunMeta.created_at).toLocaleString('pt-BR') : '—'}
            {totalChats != null && ` · ${totalChats} conversas analisadas`}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
            {Object.entries(TYPE_META).map(([key, meta]) => (
              <SummaryLine key={key} icon={meta.icon} label={meta.label} value={counts[key] || 0} color={meta.color} />
            ))}
            {ignoredCount > 0 && <SummaryLine icon="🙈" label="Ignorados" value={ignoredCount} color="#9CA3AF" />}
          </div>
        </div>
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
                  <span style={{ fontSize: 11, color: t.textMuted }}>{r.findings} achado{r.findings !== 1 ? 's' : ''}</span>
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
              label={`Todos (${nonIgnored.length})`} />
            {Object.entries(TYPE_META).map(([key, meta]) => counts[key] && (
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
              {nonIgnored.length === 0 ? 'Nenhum problema encontrado nessa execução. 🎉' : 'Nenhum item nesse filtro.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(r => (
                <FindingCard key={r.id} r={r} t={t} onIgnore={handleIgnore} />
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

function FilterChip({ active, onClick, color, label }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 12, padding: '5px 12px', borderRadius: 9999, border: `1px solid ${color}`, cursor: 'pointer', fontWeight: 600,
      background: active ? color : `${color}12`,
      color: active ? '#fff' : color,
    }}>{label}</button>
  )
}

function FindingCard({ r, t, onIgnore }) {
  const meta = TYPE_META[r.type] || { label: r.type, color: '#6B7280', icon: '•' }
  return (
    <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 10, padding: '12px 14px', opacity: r.ignored ? 0.6 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: meta.color, background: `${meta.color}15`, borderRadius: 6, padding: '2px 8px' }}>
          {meta.icon} {meta.label}
        </span>
        <button onClick={() => onIgnore(r, !r.ignored)} style={{
          fontSize: 11, color: r.ignored ? '#7C3AED' : '#6B7280',
          background: 'none', border: `1px solid ${r.ignored ? '#7C3AED' : t.border}`, borderRadius: 6, padding: '2px 8px', cursor: 'pointer',
        }}>{r.ignored ? 'Reativar' : 'Ignorar'}</button>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{r.contact_name || '—'} {r.phone && <span style={{ fontWeight: 400, color: t.textMuted }}>· {r.phone}</span>}</div>
      {r.detail && <div style={{ fontSize: 12, color: t.textMid, marginTop: 4 }}>{r.detail}</div>}
    </div>
  )
}
