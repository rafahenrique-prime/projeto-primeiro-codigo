import { useState, useEffect } from 'react'
import { runSystemHealthCheck, getHealthRuns, getHealthResults } from '../services/systemHealthService'

const STATUS_META = {
  ok: { label: 'OK', color: '#0EC331', icon: '✅' },
  warn: { label: 'Lento', color: '#F59E0B', icon: '⚠️' },
  error: { label: 'Falha', color: '#E8192C', icon: '❌' },
  'n/a': { label: 'N/A', color: '#9CA3AF', icon: '➖' },
}

export default function SystemHealthTab({ t }) {
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const [runs, setRuns] = useState([])
  const [activeRun, setActiveRun] = useState(null)
  const [results, setResults] = useState([])

  useEffect(() => { loadRuns() }, [])

  async function loadRuns() {
    const r = await getHealthRuns()
    setRuns(r)
    if (r.length > 0) selectRun(r[0].run_id)
  }

  async function selectRun(runId) {
    setActiveRun(runId)
    const items = await getHealthResults(runId)
    setResults(items)
  }

  async function handleRun() {
    setRunning(true)
    setError(null)
    try {
      const out = await runSystemHealthCheck()
      await loadRuns()
      await selectRun(out.runId)
    } catch (e) {
      setError(e.message)
    } finally {
      setRunning(false)
    }
  }

  const activeRunMeta = runs.find(r => r.run_id === activeRun)
  const okCount = results.filter(r => r.status === 'ok').length
  const relevant = results.filter(r => r.status !== 'n/a')
  const health = relevant.length > 0 ? (relevant.filter(r => r.status === 'ok').length / relevant.length) * 100 : null

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: t.text, margin: 0 }}>⚙️ Saúde do Sistema</h2>
        <button onClick={handleRun} disabled={running} style={{
          background: running ? '#DDD6FE' : '#7C3AED', color: '#fff', border: 'none',
          borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600,
          cursor: running ? 'not-allowed' : 'pointer',
        }}>
          {running ? 'Verificando...' : 'Verificar agora'}
        </button>
      </div>
      <p style={{ fontSize: 12, color: t.textMuted, marginTop: 0, marginBottom: 20 }}>
        Checagens técnicas reais (sem IA): Supabase, WhatsApp/Instagram via GPT Maker, Groq e o webhook do ignite-webhook.
      </p>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '10px 14px', color: '#E8192C', fontSize: 13, marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {activeRun && (
        <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 14, padding: 20, marginBottom: 20, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
          <HealthRing pct={health} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 8 }}>
              Última checagem: {activeRunMeta ? new Date(activeRunMeta.created_at).toLocaleString('pt-BR') : '—'}
            </div>
            <div style={{ fontSize: 13, color: t.textMid }}>
              {okCount}/{relevant.length} serviços operando normalmente
            </div>
          </div>
        </div>
      )}

      {runs.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: t.textMuted, fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>Histórico de checagens</div>
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
                  <span style={{ fontSize: 11, color: r.errors > 0 ? '#E8192C' : r.warnings > 0 ? '#F59E0B' : '#0EC331' }}>
                    {r.errors > 0 ? `${r.errors} falha(s)` : r.warnings > 0 ? `${r.warnings} lento(s)` : 'tudo ok'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {activeRun && results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {results.map(r => (
            <CheckCard key={r.check_id} r={r} t={t} />
          ))}
        </div>
      )}

      {!activeRun && !running && (
        <div style={{ textAlign: 'center', color: t.textMuted, fontSize: 13, padding: '60px 0' }}>
          Nenhuma checagem rodada ainda. Clique em "Verificar agora" pra começar.
        </div>
      )}
    </div>
  )
}

function HealthRing({ pct }) {
  const known = pct != null
  const color = !known ? '#D1D5DB' : pct >= 90 ? '#0EC331' : pct >= 60 ? '#F59E0B' : '#E8192C'
  const deg = known ? Math.max(0, Math.min(100, pct)) * 3.6 : 0
  return (
    <div style={{ position: 'relative', width: 90, height: 90, flexShrink: 0 }}>
      <div style={{
        width: 90, height: 90, borderRadius: '50%',
        background: `conic-gradient(${color} ${deg}deg, #E5E7EB ${deg}deg)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.6s ease',
      }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: known ? 17 : 13, fontWeight: 800, color }}>{known ? `${pct.toFixed(0)}%` : '—'}</div>
          <div style={{ fontSize: 8, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase' }}>Saúde</div>
        </div>
      </div>
    </div>
  )
}

function CheckCard({ r, t }) {
  const meta = STATUS_META[r.status] || STATUS_META['n/a']
  return (
    <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: meta.color, background: `${meta.color}15`, borderRadius: 6, padding: '2px 8px', flexShrink: 0 }}>
          {meta.icon} {meta.label}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{r.label}</span>
      </div>
      <div style={{ fontSize: 12, color: t.textMid, textAlign: 'right' }}>
        {r.detail}
        {r.latency_ms != null && r.status !== 'n/a' && (
          <span style={{ color: t.textMuted }}> · {r.latency_ms}ms</span>
        )}
      </div>
    </div>
  )
}
