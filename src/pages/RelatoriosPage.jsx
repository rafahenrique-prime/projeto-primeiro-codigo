import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../theme.jsx'
import { getDashboardData, checkUserTokenStatus, updateUserToken } from '../services/gptmaker'

const GREEN = '#0EC331'
const PURPLE = '#8B5CF6'

function fmtDate(d) {
  return d.toISOString().slice(0, 10)
}

function subtractDays(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

const PRESETS = [
  { label: 'Hoje', days: 0 },
  { label: '7 dias', days: 7 },
  { label: '30 dias', days: 30 },
]

export default function RelatoriosPage() {
  const { theme: t, dark } = useTheme()
  const [tab, setTab] = useState('geral')
  const [preset, setPreset] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  const [showTokenModal, setShowTokenModal] = useState(false)
  const [tokenInput, setTokenInput] = useState('')
  const [tokenSaving, setTokenSaving] = useState(false)

  const load = useCallback(async (days) => {
    setLoading(true)
    setError(null)
    try {
      const end = fmtDate(new Date())
      const start = fmtDate(days === 0 ? new Date() : subtractDays(days))
      const result = await getDashboardData(start, end)
      setData(result)
    } catch (e) {
      setError(e.message || 'Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(PRESETS[preset].days)
  }, [preset])

  function saveToken() {
    if (!tokenInput.trim()) return
    setTokenSaving(true)
    updateUserToken(tokenInput.trim())
    setShowTokenModal(false)
    setTokenInput('')
    setTokenSaving(false)
    load(PRESETS[preset].days)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: t.appBg, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: t.bg, borderBottom: `1px solid ${t.border}`, padding: '16px 24px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 24, color: t.text, textTransform: 'uppercase', letterSpacing: '-0.3px' }}>
              <span style={{ color: '#E8192C' }}>/// </span>RELATÓRIOS
            </div>
            <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>Dados em tempo real via GPT Maker</div>
          </div>

          <div style={{ display: 'flex', align: 'center', gap: 8 }}>
            {/* Preset buttons */}
            <div style={{ background: t.bgTertiary, borderRadius: 9999, padding: 3, display: 'flex', gap: 0 }}>
              {PRESETS.map((p, i) => (
                <button key={i} onClick={() => setPreset(i)} style={{
                  background: preset === i ? t.bg : 'transparent',
                  color: preset === i ? '#E8192C' : t.textMuted,
                  border: 'none', borderRadius: 9999,
                  padding: '5px 14px', fontSize: 12, fontWeight: preset === i ? 700 : 500,
                  boxShadow: preset === i ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}>{p.label}</button>
              ))}
            </div>
            <button onClick={() => load(PRESETS[preset].days)} style={{
              background: t.bgTertiary, border: `1px solid ${t.border}`, borderRadius: 9999,
              padding: '5px 14px', fontSize: 12, color: t.textMid, cursor: 'pointer',
            }}>↻ Atualizar</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginTop: 16, borderBottom: `1px solid ${t.border}` }}>
          {[['geral', 'Visão Geral'], ['atendimento', 'Atendimento']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              background: 'transparent', border: 'none', borderBottom: tab === id ? '2px solid #E8192C' : '2px solid transparent',
              padding: '8px 20px', fontSize: 13, fontWeight: tab === id ? 700 : 500,
              color: tab === id ? '#E8192C' : t.textMuted, cursor: 'pointer', marginBottom: -1,
              transition: 'all 0.15s',
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 36, height: 36, border: `3px solid ${t.border}`, borderTopColor: '#E8192C', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
              <div style={{ color: t.textMuted, fontSize: 13 }}>Carregando dados...</div>
            </div>
          </div>
        ) : error ? (
          <div style={{ background: dark ? '#1a0a0a' : '#fff5f5', border: '1px solid #fca5a5', borderRadius: 12, padding: 24, fontSize: 13 }}>
            <div style={{ color: '#E8192C', fontWeight: 700, marginBottom: 6, fontSize: 15 }}>Erro ao carregar relatórios</div>
            <div style={{ color: dark ? '#fca5a5' : '#991b1b', marginBottom: 16 }}>{error}</div>
            {(error.includes('Token') || error.includes('token')) && (
              <button onClick={() => setShowTokenModal(true)} style={{
                background: '#E8192C', color: '#fff', border: 'none', borderRadius: 8,
                padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                🔑 Renovar Token
              </button>
            )}
          </div>
        ) : tab === 'geral' ? (
          <GeralTab data={data} t={t} dark={dark} />
        ) : (
          <AtendimentoTab data={data} t={t} dark={dark} />
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Modal Renovar Token */}
      {showTokenModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowTokenModal(false)}>
          <div style={{
            background: dark ? '#161616' : '#fff', borderRadius: 16, padding: 28, width: 540, maxWidth: '90vw',
            border: `1px solid ${dark ? '#2a2a2a' : '#e5e5e5'}`, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 18, color: dark ? '#fff' : '#111', marginBottom: 4 }}>
              🔑 Renovar Token GPT Maker
            </div>
            <div style={{ fontSize: 12, color: dark ? '#888' : '#666', marginBottom: 20 }}>
              Token salvo no navegador — sem editar arquivo, sem reiniciar servidor.
            </div>

            <div style={{ background: dark ? '#0d0d0d' : '#f4f4f4', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 11, color: dark ? '#aaa' : '#555', lineHeight: 1.8 }}>
              <strong style={{ color: dark ? '#fff' : '#111' }}>Como obter o token:</strong><br/>
              1. Abra <a href="https://app.gptmaker.ai" target="_blank" rel="noreferrer" style={{ color: '#E8192C' }}>app.gptmaker.ai</a> logado<br/>
              2. Pressione <strong>F12</strong> → aba <strong>Console</strong><br/>
              3. Cole e pressione Enter:<br/>
              <code style={{
                display: 'block', background: dark ? '#1a1a1a' : '#e8e8e8', padding: '6px 8px',
                borderRadius: 4, marginTop: 6, fontSize: 10, wordBreak: 'break-all', color: dark ? '#e2e2e2' : '#333',
              }}>
                JSON.parse(document.getElementById('__NEXT_DATA__').textContent).props.pageProps.user.token
              </code>
              4. Copie o resultado (começa com <strong>eyJ...</strong>) e cole abaixo
            </div>

            <textarea
              value={tokenInput}
              onChange={e => setTokenInput(e.target.value)}
              placeholder="Cole aqui o token (eyJ...)"
              style={{
                width: '100%', height: 80, resize: 'vertical', fontSize: 11, fontFamily: 'monospace',
                background: dark ? '#0d0d0d' : '#f9f9f9', color: dark ? '#fff' : '#111',
                border: `1px solid ${tokenInput ? '#E8192C' : (dark ? '#2a2a2a' : '#ddd')}`,
                borderRadius: 8, padding: 10, outline: 'none', boxSizing: 'border-box',
              }}
            />

            <div style={{ display: 'flex', gap: 10, marginTop: 14, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowTokenModal(false); setTokenInput('') }} style={{
                background: 'transparent', border: `1px solid ${dark ? '#333' : '#ddd'}`,
                borderRadius: 8, padding: '9px 18px', fontSize: 13, color: dark ? '#aaa' : '#666', cursor: 'pointer',
              }}>Cancelar</button>
              <button onClick={saveToken} disabled={!tokenInput.trim() || tokenSaving} style={{
                background: tokenInput.trim() ? '#E8192C' : '#666', color: '#fff', border: 'none',
                borderRadius: 8, padding: '9px 20px', fontSize: 13, fontWeight: 700,
                cursor: tokenInput.trim() ? 'pointer' : 'not-allowed', transition: 'background 0.15s',
              }}>
                {tokenSaving ? 'Salvando...' : '✓ Salvar e Carregar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── ABA VISÃO GERAL ─── */
function GeralTab({ data, t }) {
  // API retorna: {current, previous}
  const resolved = data?.resolved?.current ?? 0
  const credits  = data?.credits?.current  ?? 0
  const contacts = data?.contacts?.current ?? 0
  const appts    = data?.appointments?.current ?? 0

  // by-period: {periodType, values: [{date: count}]}
  const periodValues = data?.creditsByPeriod?.values?.[0] || {}
  const byPeriod = Object.entries(periodValues).map(([date, value]) => ({ date, value }))

  // by-model: [{modelName, totalCredits, requestCount}]
  const byModel = Array.isArray(data?.creditsByModel) ? data.creditsByModel : []

  // assistants: [{assistantName, metrics: {credits, ...}}]
  const assistants = Array.isArray(data?.assistantsPerf) ? data.assistantsPerf : []

  // contacts-perf: [{contactName, metrics: {totalInteractions}}]
  const topContacts = Array.isArray(data?.contactsPerf) ? data.contactsPerf : []

  const totalCredits = byModel.reduce((s, m) => s + (m.totalCredits || 0), 0) || 1

  return (
    <div>
      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <KpiCard value={resolved} label="Atendimentos Concluídos" sub="Finalizados no período" icon="✅" t={t} />
        <KpiCard value={credits}  label="Créditos Gastos" sub="Consumidos em IA" icon="💳" t={t} highlight />
        <KpiCard value={contacts} label="Novos Contatos" sub="Captados no período" icon="👤" t={t} />
        <KpiCard value={appts}    label="Agendamentos" sub="Realizados no período" icon="📅" t={t} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>

        {/* Créditos por período */}
        <Card title="Créditos por Período" sub="Evolução diária" t={t}>
          {byPeriod.length > 0
            ? <LineChart data={byPeriod} t={t} />
            : <Empty t={t} />}
        </Card>

        {/* Gastos por modelo */}
        <Card title="Gastos por Modelo" sub="Consumo por IA" t={t}>
          {byModel.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {byModel.slice(0, 6).map((m, i) => {
                const val = m.totalCredits || 0
                const pct = Math.round((val / totalCredits) * 100)
                const colors = ['#8B5CF6','#0EC331','#E8192C','#3B82F6','#F59E0B','#EC4899']
                return (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: t.textSecondary, marginBottom: 3 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors[i], display: 'inline-block' }} />
                        <span style={{ fontWeight: 600 }}>#{i+1}</span>
                        <span style={{ color: t.textMuted }}>{(m.modelName || 'Modelo').slice(0, 16)}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, fontWeight: 600 }}>
                        <span>{val} créditos</span>
                        <span style={{ color: t.textMuted }}>{pct}%</span>
                      </div>
                    </div>
                    <div style={{ height: 4, borderRadius: 9999, background: t.bgTertiary }}>
                      <div style={{ height: 4, borderRadius: 9999, background: colors[i], width: `${pct}%`, transition: 'width 0.5s' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : <Empty t={t} />}
        </Card>
      </div>

      {/* Top agentes + contatos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 16 }}>

        <Card title="Top Agentes" sub="Consumo de Créditos" t={t}>
          {assistants.length > 0 ? assistants.slice(0, 5).map((a, i) => (
            <RankRow key={i} rank={i+1} name={a.assistantName || 'Agente'} value={`${a.metrics?.credits || 0} créditos`} t={t} />
          )) : <Empty t={t} />}
        </Card>

        <Card title="Top Atendentes" sub="Resolveu atendimentos" t={t}>
          {assistants.length > 0 ? assistants.slice(0, 5).map((a, i) => (
            <RankRow key={i} rank={i+1} name={a.assistantName || 'Agente'} value={`${a.metrics?.resolvedAttendances || 0} resolvidos`} t={t} />
          )) : <Empty t={t} msg="Sem dados" />}
        </Card>

        <Card title="Top Contatos" sub="Interações" t={t}>
          {topContacts.length > 0 ? topContacts.slice(0, 5).map((c, i) => (
            <RankRow key={i} rank={i+1} name={c.contactName || 'Contato'} value={`${c.metrics?.totalInteractions || 0} interações`} t={t} />
          )) : <Empty t={t} />}
        </Card>
      </div>
    </div>
  )
}

/* ─── ABA ATENDIMENTO ─── */
function AtendimentoTab({ data, t }) {
  // by-hour: [{hourOfDay, totalInteractions, resolvedInteractions, totalCredits}]
  const byHour = Array.isArray(data?.byHour) ? data.byHour : []

  // by-channel: {values: [{label, data: {date: credits}}]}
  const channelValues = data?.byChannel?.values || []
  const byChannel = channelValues.map(ch => ({
    name: ch.label,
    total: Object.values(ch.data || {}).reduce((s, v) => s + v, 0),
  }))

  // Totais calculados do by-hour
  const totalInteractions = byHour.reduce((s, h) => s + h.totalInteractions, 0)
  const totalResolved     = byHour.reduce((s, h) => s + h.resolvedInteractions, 0)
  const totalCreditsHour  = byHour.reduce((s, h) => s + h.totalCredits, 0)
  const transferidos      = byHour.reduce((s, h) => s + Math.max(0, h.totalInteractions - h.resolvedInteractions), 0)

  const avgCredits      = totalInteractions > 0 ? (totalCreditsHour / totalInteractions).toFixed(1) : 0
  const iaResolutionRate= totalInteractions > 0 ? Math.round((totalResolved / totalInteractions) * 100) : 0

  // Pico de hora
  const pico = byHour.reduce((best, h) => h.totalCredits > (best.totalCredits || 0) ? h : best, {})
  const sorted = [...byHour].sort((a, b) => b.totalCredits - a.totalCredits)
  const segundo = sorted[1]
  const terceiro = sorted[2]

  // Monta array completo 0-23h para o gráfico
  const hourMap = {}
  byHour.forEach(h => { hourMap[h.hourOfDay] = h.totalCredits })
  const byHourFull = Array.from({ length: 24 }, (_, i) => ({
    hour: `${String(i).padStart(2,'0')}:00`,
    value: hourMap[i] || 0,
  }))

  return (
    <div>
      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <KpiCard
          value={totalInteractions}
          label="Total de Atendimentos"
          subList={[
            { label: 'Resolvidos pela IA', value: totalResolved, color: GREEN },
            { label: 'Transferidos', value: transferidos, color: '#F59E0B' },
          ]}
          t={t}
        />
        <KpiCard value={avgCredits} label="Média de Créditos" subList={[
          { label: 'Total de créditos', value: totalCreditsHour, color: '#8B5CF6' },
          { label: 'Horas com atividade', value: byHour.length, color: t.textMuted },
        ]} t={t} />
        <KpiCard value={`${iaResolutionRate}%`} label="Taxa Resolução IA" subList={[
          { label: 'Resolvidos', value: totalResolved, color: GREEN },
          { label: 'Total atendimentos', value: totalInteractions, color: t.textMuted },
        ]} t={t} />
        <KpiCard value={byChannel.length > 0 ? byChannel[0].name : '—'} label="Canal Principal" subList={
          byChannel.slice(0, 3).map(c => ({ label: c.name, value: `${c.total}c`, color: '#8B5CF6' }))
        } t={t} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>

        {/* Timeline */}
        <Card title="Timeline de Consumo" sub="Créditos por hora do dia" t={t}>
          {byHour.length > 0 ? (
            <>
              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                {pico.hourOfDay !== undefined && (
                  <PicoCard label="🔥 Pico" hour={`${String(pico.hourOfDay).padStart(2,'0')}:00`} value={pico.totalCredits} color="#F59E0B" t={t} />
                )}
                {segundo && (
                  <PicoCard label="2º" hour={`${String(segundo.hourOfDay).padStart(2,'0')}:00`} value={segundo.totalCredits} color="#94A3B8" t={t} />
                )}
                {terceiro && (
                  <PicoCard label="3º" hour={`${String(terceiro.hourOfDay).padStart(2,'0')}:00`} value={terceiro.totalCredits} color="#CD7F32" t={t} />
                )}
              </div>
              <BarChart data={byHourFull} t={t} />
            </>
          ) : <Empty t={t} />}
        </Card>

        {/* Por canal */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Créditos por Canal" sub="Consumo por canal" t={t}>
            {byChannel.length > 0
              ? byChannel.map((c, i) => (
                  <RankRow key={i} rank={i+1} name={c.name} value={`${c.total}c`} t={t} />
                ))
              : <Empty t={t} />}
          </Card>

          <Card title="Performance IA vs Humano" sub="Resolução no período" t={t}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <StatRow label="Agente de IA" value={`${iaResolutionRate}%`} sub={`${totalResolved} resolvidos`} color={GREEN} t={t} />
              <StatRow label="Transferidos" value={transferidos} sub="Passados ao humano" color="#F59E0B" t={t} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

/* ─── COMPONENTS ─── */

function Card({ title, sub, children, t }) {
  return (
    <div style={{ background: t.bg, borderRadius: 12, border: `1px solid ${t.border}`, padding: '18px 20px' }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{sub}</div>}
      </div>
      {children}
    </div>
  )
}

function KpiCard({ value, label, sub, subList, icon, highlight, t }) {
  return (
    <div style={{
      background: highlight ? (t.primaryBg || '#fff5f5') : t.bg,
      border: `1px solid ${highlight ? '#fca5a5' : t.border}`,
      borderRadius: 12, padding: '16px 18px',
    }}>
      {icon && <div style={{ fontSize: 18, marginBottom: 6 }}>{icon}</div>}
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 36, lineHeight: 1, color: highlight ? '#E8192C' : t.text }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: t.textMuted, marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: t.textMuted, marginTop: 6 }}>{sub}</div>}
      {subList && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {subList.map((s, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: t.textMuted }}>{s.label}</span>
              <span style={{ color: s.color, fontWeight: 600 }}>{s.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RankRow({ rank, name, value, t }) {
  const colors = ['#F59E0B','#94A3B8','#CD7F32']
  const isTop = rank <= 3
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${t.borderLight}` }}>
      <span style={{
        width: 20, height: 20, borderRadius: '50%', fontSize: 10, fontWeight: 800,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        background: isTop ? `${colors[rank-1]}22` : t.bgTertiary,
        color: isTop ? colors[rank-1] : t.textMuted,
      }}>{rank}</span>
      <span style={{ flex: 1, fontSize: 12, color: t.textSecondary, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: t.text, flexShrink: 0 }}>{value}</span>
    </div>
  )
}

function StatRow({ label, value, sub, color, t }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 16, fontWeight: 800, color, fontFamily: "'Barlow Condensed', sans-serif" }}>{value}</span>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{label}</div>
        <div style={{ fontSize: 11, color: color, fontWeight: 600 }}>{sub}</div>
      </div>
    </div>
  )
}

function PicoCard({ label, hour, value, color, t }) {
  return (
    <div style={{ background: `${color}15`, border: `1px solid ${color}44`, borderRadius: 10, padding: '10px 14px', minWidth: 100 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, color }}>{hour}</div>
      <div style={{ fontSize: 11, color: t.textMuted }}>{value} créditos</div>
    </div>
  )
}

function LineChart({ data, t }) {
  const values = data.map(d => d.value || d.credits || 0)
  const max = Math.max(...values, 1)
  const W = 100, H = 60
  const pts = values.map((v, i) => `${(i / (values.length - 1 || 1)) * W},${H - (v / max) * H}`)
  const poly = pts.join(' ')
  const area = `0,${H} ${poly} ${W},${H}`
  const labels = data.map(d => d.date || d.period || d.hour || '')

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 80, overflow: 'visible' }}>
        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E8192C" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#E8192C" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#lineGrad)" />
        <polyline points={poly} fill="none" stroke="#E8192C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {values.map((v, i) => (
          <circle key={i} cx={(i / (values.length - 1 || 1)) * W} cy={H - (v / max) * H} r="2" fill="#E8192C" />
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        {[labels[0], labels[Math.floor(labels.length/2)], labels[labels.length-1]].map((l, i) => (
          <span key={i} style={{ fontSize: 10, color: t.textMuted }}>{(l||'').slice(5)}</span>
        ))}
      </div>
    </div>
  )
}

function BarChart({ data, t }) {
  const values = data.map(d => d.credits || d.value || 0)
  const max = Math.max(...values, 1)
  const peakIdx = values.indexOf(Math.max(...values))

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80 }}>
      {data.slice(0, 24).map((d, i) => {
        const v = d.credits || d.value || 0
        const h = Math.round((v / max) * 70)
        const label = (d.hour || d.period || `${i}h`).slice(0, 5)
        const isPeak = i === peakIdx
        return (
          <div key={i} title={`${label}: ${v} créditos`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{
              width: '100%', borderRadius: '3px 3px 0 0',
              height: h || 2,
              background: isPeak ? '#F59E0B' : PURPLE,
              opacity: isPeak ? 1 : 0.6,
              transition: 'height 0.4s',
            }} />
          </div>
        )
      })}
    </div>
  )
}

function Empty({ t, msg }) {
  return <div style={{ color: t.textMuted, fontSize: 12, textAlign: 'center', padding: '20px 0' }}>{msg || 'Sem dados disponíveis'}</div>
}
