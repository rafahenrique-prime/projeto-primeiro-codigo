import { useState, useEffect } from 'react'
import { getQualitySummary } from '../services/agentAuditService'

const PERIODS = [
  { days: 1, label: 'Hoje' },
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
]

export default function GabrielaAuditTab({ t }) {
  const [days, setDays] = useState(7)
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [days])

  async function load() {
    setLoading(true)
    const s = await getQualitySummary(days)
    setSummary(s)
    setLoading(false)
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: t.text, margin: 0 }}>🤖 Qualidade da Gabriela IA</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {PERIODS.map(p => (
            <button key={p.days} onClick={() => setDays(p.days)} style={{
              fontSize: 12, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 600,
              border: `1px solid ${days === p.days ? (t.primary || '#E8192C') : t.border}`,
              background: days === p.days ? (t.primary || '#E8192C') : 'transparent',
              color: days === p.days ? '#fff' : t.textMid,
            }}>{p.label}</button>
          ))}
        </div>
      </div>
      <p style={{ fontSize: 12, color: t.textMuted, marginTop: 0, marginBottom: 20 }}>
        Sem IA nova aqui — só agrega o que o cron de auditoria diária (api/cron-diagnosis.js) já avalia todo dia com Groq.
      </p>

      {loading ? (
        <div style={{ textAlign: 'center', color: t.textMuted, fontSize: 13, padding: '60px 0' }}>Carregando...</div>
      ) : !summary || summary.total === 0 ? (
        <div style={{ textAlign: 'center', color: t.textMuted, fontSize: 13, padding: '60px 0' }}>
          Nenhuma resposta avaliada nesse período ainda.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
            <MetricCard t={t} label="Respostas avaliadas" value={summary.total} color="#6366F1" />
            <MetricCard t={t} label="Confiança média" value={`${summary.avgScore}/10`} color={scoreColor(summary.avgScore)} />
            <MetricCard t={t} label="Taxa de sucesso" value={`${summary.successRate}%`} sub="nota ≥ 7" color="#0EC331" />
            <MetricCard t={t} label="Falhas detectadas" value={`${summary.failureRate}%`} sub="nota ≤ 4" color="#E8192C" />
          </div>

          {summary.topIssues.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: t.textMuted, fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>
                Principais motivos de falha
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {summary.topIssues.map(i => (
                  <div key={i.issue} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 12px' }}>
                    <span style={{ fontSize: 13, color: t.text, textTransform: 'capitalize' }}>{i.issue}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#E8192C' }}>{i.count}x</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ fontSize: 11, color: t.textMuted, fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>
            Piores casos do período
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {summary.worstCases.map(c => (
              <div key={c.id} style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{c.client_name || '—'}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor(c.score), background: `${scoreColor(c.score)}15`, borderRadius: 6, padding: '2px 8px' }}>
                    nota {c.score}/10
                  </span>
                </div>
                {c.issue && <div style={{ fontSize: 12, color: '#E8192C', marginBottom: 4 }}>⚠️ {c.issue}</div>}
                {c.excerpt && <div style={{ fontSize: 12, color: t.textMid, fontStyle: 'italic' }}>{c.excerpt}</div>}
              </div>
            ))}
          </div>

          <div style={{ textAlign: 'center', color: t.textMuted, fontSize: 11.5, padding: '16px 0 0' }}>
            Correções humanas (quando um atendente reescreve a resposta da Gabriela) ainda não têm rastreamento — métrica pendente.
          </div>
        </>
      )}
    </div>
  )
}

function scoreColor(score) {
  if (score == null) return '#9CA3AF'
  if (score >= 7) return '#0EC331'
  if (score >= 5) return '#F59E0B'
  return '#E8192C'
}

function MetricCard({ t, label, value, sub, color }) {
  return (
    <div style={{ flex: '1 1 180px', background: t.bg, border: `1px solid ${t.border}`, borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>{label}{sub ? ` (${sub})` : ''}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
    </div>
  )
}
