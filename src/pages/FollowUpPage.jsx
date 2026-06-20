import { useState, useEffect } from 'react'
import { useTheme } from '../theme.jsx'
import { runFollowUpCheck, getFollowUpSummary, getFollowUpLog, clearFollowUpState, getSchedule, saveSchedule, isWithinSchedule, getResponseRate, getStages, saveStages, DEFAULT_FIXED_TEXT } from '../services/followUpService'
import { sendMessage } from '../services/gptmaker'

export default function FollowUpPage({ conversations = [] }) {
  const { theme: t } = useTheme()
  const [running, setRunning]       = useState(false)
  const [result, setResult]         = useState(null)
  const [summary, setSummary]       = useState({ total: 0, pending: [], sent: [], inactive: [] })
  const [log, setLog]               = useState([])
  const [confirmSend, setConfirmSend] = useState(false)
  const [filterStage, setFilterStage] = useState('all')
  const [activeTab, setActiveTab] = useState('pending')
  const [schedule, setSchedule] = useState(getSchedule)
  const withinSchedule = isWithinSchedule(schedule)
  const [editedMessages, setEditedMessages] = useState([])
  const [sendingEdited, setSendingEdited] = useState(false)
  const [channelFilter, setChannelFilter] = useState({ whatsapp: true, instagram: true })
  const [responseRate, setResponseRate] = useState({ total: 0, responded: 0, rate: 0, byStage: {} })
  const [enabled, setEnabled] = useState(() => localStorage.getItem('followup_enabled') !== 'false')
  const [stages, setStages] = useState(getStages)
  const [editingFixed, setEditingFixed] = useState({})

  function toggleEnabled() {
    const next = !enabled
    setEnabled(next)
    localStorage.setItem('followup_enabled', String(next))
  }

  useEffect(() => {
    refresh()
  }, [conversations])

  function refresh() {
    setSummary(getFollowUpSummary(conversations))
    setLog(getFollowUpLog())
    setResponseRate(getResponseRate(conversations))
  }

  function updateSchedule(patch) {
    const next = { ...schedule, ...patch }
    setSchedule(next)
    saveSchedule(next)
  }

  async function run(dryRun) {
    if (!dryRun && !enabled) return
    setRunning(true)
    setResult(null)
    setConfirmSend(false)
    setEditedMessages([])
    try {
      const filtered = conversations.filter(c => {
        if (c.channel === 'whatsapp' && !channelFilter.whatsapp) return false
        if (c.channel === 'instagram' && !channelFilter.instagram) return false
        return true
      })
      const r = await runFollowUpCheck(filtered, { dryRun })
      setResult({ ...r, dryRun })
      if (dryRun && r.sent?.length > 0) {
        // Preenche edição com os textos gerados
        const convMap = Object.fromEntries(conversations.map(c => [c.name, c.id]))
        setEditedMessages(r.sent.map(s => ({
          conv: s.conv,
          convId: convMap[s.conv] || null,
          stage: s.stage,
          text: s.text,
        })))
      }
    } finally {
      setRunning(false)
      refresh()
    }
  }

  async function sendEdited() {
    if (!enabled || !withinSchedule) return
    setSendingEdited(true)
    const results = []
    for (const msg of editedMessages) {
      if (!msg.convId || !msg.text.trim()) continue
      try {
        await sendMessage(msg.convId, msg.text)
        results.push({ ...msg, status: 'sent' })
      } catch {
        results.push({ ...msg, status: 'error' })
      }
    }
    setSendingEdited(false)
    setEditedMessages([])
    setResult({ dryRun: false, sent: results.filter(r => r.status === 'sent'), errors: results.filter(r => r.status === 'error') })
    refresh()
  }

  const pendingFiltered = filterStage === 'all'
    ? summary.pending
    : summary.pending.filter(p => p.stage === filterStage)

  const card = (children, style = {}) => (
    <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 12, padding: '16px 20px', ...style }}>
      {children}
    </div>
  )

  const sectionTitle = (txt) => (
    <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>{txt}</div>
  )

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: t.appBg, overflowY: 'auto', padding: '24px 28px', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: t.text, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5 }}>
            📬 Dashboard Follow-Up
          </div>
          <div style={{ fontSize: 13, color: t.textMuted, marginTop: 2 }}>
            Motor autônomo de reengajamento · {summary.total} conversas monitoradas
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={toggleEnabled}
            style={{
              borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none',
              background: enabled ? '#D1FAE5' : '#FEE2E2',
              color: enabled ? '#065F46' : '#DC2626',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            <div style={{
              width: 36, height: 20, borderRadius: 10, background: enabled ? '#10B981' : '#F87171',
              position: 'relative', transition: 'background 0.2s', flexShrink: 0,
            }}>
              <div style={{
                position: 'absolute', top: 3, left: enabled ? 18 : 3,
                width: 14, height: 14, borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </div>
            {enabled ? 'Follow-up ON' : 'Follow-up OFF'}
          </button>
          <button
            onClick={refresh}
            style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '7px 14px', fontSize: 12, color: t.textSecondary, cursor: 'pointer', fontWeight: 600 }}
          >
            🔄 Atualizar
          </button>
        </div>
      </div>

      {!enabled && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🔴</span>
          <div>
            <div style={{ fontWeight: 700, color: '#DC2626', fontSize: 13 }}>Follow-up DESLIGADO</div>
            <div style={{ color: '#991B1B', fontSize: 12 }}>Nenhuma mensagem será enviada automaticamente. Ligue quando terminar os testes.</div>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { label: 'Pendentes', value: summary.pending.length, bg: '#FEF3C7', color: '#92400E', icon: '⏳' },
          { label: 'Enviados', value: summary.sent.length, bg: '#D1FAE5', color: '#065F46', icon: '✅' },
          { label: 'Inativos +24h', value: summary.inactive.length, bg: '#F3F4F6', color: '#374151', icon: '😴' },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: kpi.bg, borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
            <div style={{ fontSize: 12, color: kpi.color, fontWeight: 600, marginTop: 2 }}>{kpi.icon} {kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Gráfico de inatividade */}
      {(() => {
        const buckets = [
          { label: 'Ativos (< 30min)',   color: '#10B981', count: 0 },
          { label: '30min – 23h44',      color: '#F59E0B', count: 0 },
          { label: '23h45 – 23h59',      color: '#EF4444', count: 0 },
          { label: '+24h inativo',       color: '#6B7280', count: 0 },
        ]
        for (const conv of conversations) {
          const ts = conv.rawTime
          if (!ts) continue
          let last
          try {
            last = typeof ts === 'number' ? (ts > 1e12 ? new Date(ts) : new Date(ts * 1000)) : new Date(ts)
            if (isNaN(last.getTime())) continue
          } catch { continue }
          const min = Math.floor((Date.now() - last.getTime()) / 60000)
          if (min < 30) buckets[0].count++
          else if (min < 1425) buckets[1].count++
          else if (min < 1440) buckets[2].count++
          else buckets[3].count++
        }
        const total = conversations.length || 1
        return card(
          <>
            {sectionTitle('📊 Distribuição de Inatividade')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {buckets.map((b, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: t.text }}>{b.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: b.color }}>{b.count} conv.</span>
                  </div>
                  <div style={{ height: 10, background: t.appBg, border: `1px solid ${t.border}`, borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.round((b.count / total) * 100)}%`,
                      background: b.color,
                      borderRadius: 6,
                      transition: 'width 0.5s ease',
                      minWidth: b.count > 0 ? 4 : 0,
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )
      })()}

      {/* Taxa de resposta */}
      {responseRate.total > 0 && card(
        <>
          {sectionTitle('🔔 Taxa de Resposta Pós Follow-up')}
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>

            {/* Círculo de taxa geral */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 80 }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: `conic-gradient(#059669 ${responseRate.rate * 3.6}deg, #E5E7EB ${responseRate.rate * 3.6}deg)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative',
              }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#059669' }}>{responseRate.rate}%</span>
                </div>
              </div>
              <div style={{ fontSize: 11, color: t.textMuted, marginTop: 6, textAlign: 'center' }}>
                {responseRate.responded}/{responseRate.total} responderam
              </div>
            </div>

            {/* Por estágio */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(responseRate.byStage).map(([stage, data]) => {
                const pct = data.total > 0 ? Math.round((data.responded / data.total) * 100) : 0
                return (
                  <div key={stage}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: t.text }}>{stage}</span>
                      <span style={{ fontSize: 11, color: t.textMuted }}>{data.responded}/{data.total} · {pct}%</span>
                    </div>
                    <div style={{ height: 6, background: '#E5E7EB', borderRadius: 4 }}>
                      <div style={{ height: 6, width: `${pct}%`, background: pct >= 50 ? '#059669' : pct >= 20 ? '#F59E0B' : '#EF4444', borderRadius: 4, transition: 'width 0.4s' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Pendentes / Enviados com abas */}
        {card(
          <>
            {/* Abas */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: `1px solid ${t.border}`, paddingBottom: 10 }}>
              <button onClick={() => setActiveTab('pending')} style={{
                background: activeTab === 'pending' ? '#7C3AED' : 'transparent',
                color: activeTab === 'pending' ? '#fff' : t.textMuted,
                border: `1px solid ${activeTab === 'pending' ? '#7C3AED' : t.border}`,
                borderRadius: 8, padding: '5px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>
                ⏳ Pendentes ({summary.pending.length})
              </button>
              <button onClick={() => setActiveTab('sent')} style={{
                background: activeTab === 'sent' ? '#059669' : 'transparent',
                color: activeTab === 'sent' ? '#fff' : t.textMuted,
                border: `1px solid ${activeTab === 'sent' ? '#059669' : t.border}`,
                borderRadius: 8, padding: '5px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>
                ✅ Enviados ({log.length})
              </button>
            </div>

            {/* Aba Pendentes */}
            {activeTab === 'pending' && (
              <>
                <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                  {['all', '30min', '23h45', '24h'].map(s => (
                    <button key={s} onClick={() => setFilterStage(s)} style={{
                      background: filterStage === s ? '#7C3AED' : t.appBg,
                      color: filterStage === s ? '#fff' : t.textSecondary,
                      border: `1px solid ${filterStage === s ? '#7C3AED' : t.border}`,
                      borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    }}>
                      {s === 'all' ? 'Todos' : s}
                    </button>
                  ))}
                </div>
                {pendingFiltered.length === 0 ? (
                  <div style={{ color: t.textMuted, fontSize: 13, padding: '8px 0' }}>Nenhum pendente neste filtro.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                    {pendingFiltered.map((p, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: t.appBg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 12px' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: t.textMuted }}>{p.inactiveMin}min inativo</div>
                        </div>
                        <span style={{ background: '#F0EBFF', color: '#7C3AED', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{p.stage}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Aba Enviados */}
            {activeTab === 'sent' && (
              <>
                {log.length === 0 ? (
                  <div style={{ color: t.textMuted, fontSize: 13, padding: '8px 0' }}>Nenhum envio registrado ainda.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
                    {log.map((entry, i) => (
                      <div key={i} style={{ background: t.appBg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '10px 12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{entry.conv}</span>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
                            background: entry.status === 'sent' ? '#D1FAE5' : entry.status === 'finalized' ? '#FEF3C7' : entry.status === 'simulated' ? '#F0EBFF' : '#FEE2E2',
                            color: entry.status === 'sent' ? '#065F46' : entry.status === 'finalized' ? '#92400E' : entry.status === 'simulated' ? '#5B21B6' : '#DC2626',
                          }}>
                            {entry.status === 'sent' ? '✅' : entry.status === 'finalized' ? '🔚' : entry.status === 'simulated' ? '🧪' : '❌'} {entry.stage}
                          </span>
                        </div>
                        {entry.text && <div style={{ fontSize: 12, color: t.textSecondary, marginBottom: 4, fontStyle: 'italic' }}>"{entry.text}"</div>}
                        <div style={{ fontSize: 10, color: t.textMuted }}>{entry.at ? new Date(entry.at).toLocaleString('pt-BR') : ''}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Horário inteligente */}
        {card(
          <>
            {sectionTitle('⏰ Horário de Envio')}

            {/* Status atual */}
            <div style={{
              background: withinSchedule ? '#D1FAE5' : '#FEF3C7',
              border: `1px solid ${withinSchedule ? '#A7F3D0' : '#FDE68A'}`,
              borderRadius: 8, padding: '8px 12px', marginBottom: 14,
              fontSize: 12, fontWeight: 600,
              color: withinSchedule ? '#065F46' : '#92400E',
            }}>
              {withinSchedule ? '🟢 Dentro da janela — envios permitidos agora' : '🟡 Fora da janela — envios bloqueados agora'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Horário */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>Início</div>
                  <select value={schedule.startHour} onChange={e => updateSchedule({ startHour: +e.target.value })}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: 13 }}>
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{String(i).padStart(2,'0')}:00</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>Fim</div>
                  <select value={schedule.endHour} onChange={e => updateSchedule({ endHour: +e.target.value })}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: 13 }}>
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{String(i).padStart(2,'0')}:00</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dias bloqueados */}
              <div>
                <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 8 }}>Bloquear envios em:</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { label: 'Sábado', key: 'blockSaturday' },
                    { label: 'Domingo', key: 'blockSunday' },
                  ].map(({ label, key }) => (
                    <button key={key} onClick={() => updateSchedule({ [key]: !schedule[key] })} style={{
                      flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      background: schedule[key] ? '#FEE2E2' : t.appBg,
                      color: schedule[key] ? '#DC2626' : t.textMuted,
                      border: `1px solid ${schedule[key] ? '#FECACA' : t.border}`,
                    }}>
                      {schedule[key] ? '🚫' : '✅'} {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Editor de Estágios — estilo GPT Maker */}
        {card(
          <>
            {sectionTitle('⚙️ Ações de Inatividade')}
            <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 14 }}>
              Configure o que o agente faz quando o cliente para de responder.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {stages.map((stage, i) => {
                const TIME_OPTIONS = [
                  { label: '5 minutos',   min: 5,    max: 29 },
                  { label: '30 minutos',  min: 30,   max: 59 },
                  { label: '1 hora',      min: 60,   max: 119 },
                  { label: '2 horas',     min: 120,  max: 239 },
                  { label: '4 horas',     min: 240,  max: 479 },
                  { label: '8 horas',     min: 480,  max: 1424 },
                  { label: '23h45',       min: 1425, max: 1439 },
                  { label: '1 dia',       min: 1440, max: 2879 },
                  { label: '2 dias',      min: 2880, max: 4319 },
                  { label: '3 dias',      min: 4320, max: 999999 },
                ]
                const selectedTime = TIME_OPTIONS.find(o => o.min === stage.min) || TIME_OPTIONS[1]
                return (
                  <div key={stage.id} style={{
                    border: `1px solid ${stage.enabled ? t.border : '#FECACA'}`,
                    borderRadius: 12, overflow: 'hidden',
                    opacity: stage.enabled ? 1 : 0.55,
                  }}>
                    {/* Linha do tempo */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: t.appBg, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, color: t.textSecondary, whiteSpace: 'nowrap' }}>⏱ Se não responder em</span>
                      <select
                        value={selectedTime.label}
                        onChange={e => {
                          const opt = TIME_OPTIONS.find(o => o.label === e.target.value) || TIME_OPTIONS[1]
                          const next = stages.map((s, j) => j === i ? { ...s, min: opt.min, max: opt.max, label: opt.label } : s)
                          setStages(next); saveStages(next)
                        }}
                        style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                      >
                        {TIME_OPTIONS.map(o => <option key={o.label} value={o.label}>{o.label}</option>)}
                      </select>
                      <span style={{ fontSize: 13, color: t.textSecondary, whiteSpace: 'nowrap' }}>o agente deve</span>
                      <select
                        value={stage.action}
                        onChange={e => {
                          const next = stages.map((s, j) => j === i ? { ...s, action: e.target.value } : s)
                          setStages(next); saveStages(next)
                        }}
                        style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                      >
                        <option value="message">💬 Interagir com cliente (IA)</option>
                        <option value="fixed">📝 Mensagem fixa</option>
                        <option value="finalize">🔚 Finalizar atendimento</option>
                      </select>
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => {
                            const next = stages.map((s, j) => j === i ? { ...s, enabled: !s.enabled } : s)
                            setStages(next); saveStages(next)
                          }}
                          style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                            background: stage.enabled ? '#D1FAE5' : '#FEE2E2',
                            color: stage.enabled ? '#065F46' : '#DC2626' }}
                        >
                          {stage.enabled ? '● Ativo' : '○ Inativo'}
                        </button>
                        {stages.length > 1 && (
                          <button
                            onClick={() => { const next = stages.filter((_, j) => j !== i); setStages(next); saveStages(next) }}
                            style={{ fontSize: 13, padding: '4px 9px', borderRadius: 6, border: `1px solid #FECACA`, background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', fontWeight: 700 }}
                          >✕</button>
                        )}
                      </div>
                    </div>

                    {/* Descrição da ação */}
                    {stage.action === 'message' && (
                      <div style={{ padding: '10px 14px', background: t.bg, borderTop: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: t.textMuted }}>↳</span>
                        <span style={{ fontSize: 12, color: t.textSecondary, fontStyle: 'italic' }}>
                          Mensagem gerada por IA (Groq) com base no histórico da conversa
                        </span>
                      </div>
                    )}
                    {stage.action === 'fixed' && (
                      <div style={{ borderTop: `1px solid ${t.border}`, background: t.bg }}>
                        {editingFixed[stage.id] ? (
                          <div style={{ padding: '12px 14px' }}>
                            <textarea
                              value={stage.fixedText ?? DEFAULT_FIXED_TEXT}
                              onChange={e => {
                                const next = stages.map((s, j) => j === i ? { ...s, fixedText: e.target.value } : s)
                                setStages(next); saveStages(next)
                              }}
                              rows={8}
                              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${t.border}`, fontSize: 13, color: t.text, background: t.appBg, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', lineHeight: 1.6 }}
                            />
                            <button
                              onClick={() => setEditingFixed(p => ({ ...p, [stage.id]: false }))}
                              style={{ marginTop: 8, padding: '6px 16px', borderRadius: 7, border: 'none', background: '#7C3AED', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                            >
                              ✓ Confirmar
                            </button>
                          </div>
                        ) : (
                          <div style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                            <div style={{ flex: 1 }}>
                              <span style={{ fontSize: 11, color: t.textMuted }}>↳ </span>
                              <span style={{ fontSize: 12, color: t.textSecondary, whiteSpace: 'pre-line' }}>
                                {(stage.fixedText ?? DEFAULT_FIXED_TEXT).split('\n')[0]}…
                              </span>
                            </div>
                            <button
                              onClick={() => setEditingFixed(p => ({ ...p, [stage.id]: true }))}
                              style={{ flexShrink: 0, padding: '4px 12px', borderRadius: 7, border: `1px solid ${t.border}`, background: t.appBg, color: t.textSecondary, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                            >
                              ✏️ Editar
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {stage.action === 'finalize' && (
                      <div style={{ padding: '10px 14px', background: '#FFFBEB', borderTop: `1px solid #FDE68A`, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: '#92400E' }}>↳</span>
                        <span style={{ fontSize: 12, color: '#92400E' }}>
                          Conversa será marcada como finalizada automaticamente
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}

              <button
                onClick={() => {
                  const next = [...stages, { id: `stage_${Date.now()}`, label: '1 hora', min: 60, max: 119, action: 'message', enabled: true, fixedText: DEFAULT_FIXED_TEXT }]
                  setStages(next); saveStages(next)
                }}
                style={{ background: 'transparent', border: `1px dashed ${t.border}`, color: t.textMuted, borderRadius: 10, padding: '11px', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 2 }}
              >
                + Adicionar ação
              </button>
            </div>
          </>
        )}

        {/* Ações */}
        {card(
          <>
            {sectionTitle('Ações')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              {/* Filtro por canal */}
              <div>
                <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 6 }}>Canais incluídos:</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { key: 'whatsapp', label: 'WhatsApp', icon: '💬', activeColor: '#25D366', activeBg: '#DCFCE7', activeBorder: '#86EFAC' },
                    { key: 'instagram', label: 'Instagram', icon: '📷', activeColor: '#E1306C', activeBg: '#FCE7F3', activeBorder: '#F9A8D4' },
                  ].map(({ key, label, icon, activeColor, activeBg, activeBorder }) => {
                    const active = channelFilter[key]
                    return (
                      <button key={key} onClick={() => setChannelFilter(p => ({ ...p, [key]: !p[key] }))} style={{
                        flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        background: active ? activeBg : t.appBg,
                        color: active ? activeColor : t.textMuted,
                        border: `1px solid ${active ? activeBorder : t.border}`,
                      }}>
                        {icon} {label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <button
                onClick={() => run(true)}
                disabled={running}
                style={{ background: '#F0EBFF', border: '1px solid #7C3AED', color: '#7C3AED', borderRadius: 10, padding: '12px 16px', fontSize: 13, fontWeight: 700, cursor: running ? 'not-allowed' : 'pointer', opacity: running ? 0.6 : 1, textAlign: 'left' }}
              >
                {running ? '⏳ Processando...' : '🧪 Simular Follow-ups'}
                <div style={{ fontSize: 11, fontWeight: 400, marginTop: 2, opacity: 0.8 }}>Gera as mensagens sem enviar nada</div>
              </button>

              {!confirmSend ? (
                <button
                  onClick={() => setConfirmSend(true)}
                  disabled={running || summary.pending.length === 0 || !withinSchedule}
                  style={{ background: withinSchedule ? '#7C3AED' : '#9CA3AF', border: 'none', color: '#fff', borderRadius: 10, padding: '12px 16px', fontSize: 13, fontWeight: 700, cursor: (running || summary.pending.length === 0 || !withinSchedule) ? 'not-allowed' : 'pointer', opacity: (running || summary.pending.length === 0 || !withinSchedule) ? 0.5 : 1, textAlign: 'left' }}
                >
                  📤 Enviar Follow-ups
                  <div style={{ fontSize: 11, fontWeight: 400, marginTop: 2, opacity: 0.85 }}>
                    {!withinSchedule ? '🚫 Fora do horário configurado' : `${summary.pending.length} clientes serão contatados`}
                  </div>
                </button>
              ) : (
                <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#DC2626', marginBottom: 8 }}>⚠️ Confirmar envio para {summary.pending.length} clientes?</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => run(false)} style={{ flex: 1, background: '#DC2626', border: 'none', color: '#fff', borderRadius: 8, padding: '8px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Sim, enviar</button>
                    <button onClick={() => setConfirmSend(false)} style={{ flex: 1, background: '#fff', border: '1px solid #E5E5E5', color: '#374151', borderRadius: 8, padding: '8px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                  </div>
                </div>
              )}

              <button
                onClick={() => { clearFollowUpState(); refresh(); setResult(null) }}
                style={{ background: 'none', border: `1px solid ${t.border}`, color: t.textMuted, borderRadius: 10, padding: '10px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                🗑 Resetar histórico de envios
              </button>
            </div>

            {/* Resultado da simulação — editável */}
            {result && result.dryRun && editedMessages.length > 0 && (
              <div style={{ marginTop: 16, background: '#F0EBFF', border: '1px solid #DDD6FE', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#5B21B6', marginBottom: 4 }}>✏️ Revise e edite antes de enviar</div>
                <div style={{ fontSize: 11, color: '#7C3AED', marginBottom: 12 }}>Verificadas: {result.checked} · {editedMessages.length} mensagens geradas</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {editedMessages.map((msg, i) => (
                    <div key={i} style={{ background: '#fff', border: '1px solid #DDD6FE', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#0A0A0A' }}>{msg.conv}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, background: '#EDE9FE', color: '#5B21B6', borderRadius: 5, padding: '2px 7px' }}>{msg.stage}</span>
                      </div>
                      <textarea
                        value={msg.text}
                        onChange={e => setEditedMessages(prev => prev.map((m, j) => j === i ? { ...m, text: e.target.value } : m))}
                        rows={2}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #DDD6FE', fontSize: 12, color: '#374151', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }}
                      />
                    </div>
                  ))}
                </div>
                <button
                  onClick={sendEdited}
                  disabled={sendingEdited || !withinSchedule}
                  style={{ marginTop: 12, width: '100%', background: withinSchedule ? '#7C3AED' : '#9CA3AF', border: 'none', color: '#fff', borderRadius: 9, padding: '10px', fontSize: 13, fontWeight: 700, cursor: (sendingEdited || !withinSchedule) ? 'not-allowed' : 'pointer', opacity: (sendingEdited || !withinSchedule) ? 0.6 : 1 }}
                >
                  {sendingEdited ? '⏳ Enviando...' : `📤 Enviar ${editedMessages.length} mensagens editadas`}
                </button>
              </div>
            )}

            {/* Resultado de envio real */}
            {result && !result.dryRun && (
              <div style={{ marginTop: 16, background: '#D1FAE5', border: '1px solid #A7F3D0', borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#065F46', marginBottom: 4 }}>✅ Envios realizados</div>
                <div style={{ fontSize: 12, color: '#064E3B' }}>
                  Enviadas: {result.sent?.length || 0}{result.errors?.length > 0 && ` · Erros: ${result.errors.length}`}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Log */}
      {card(
        <>
          {sectionTitle('Histórico de Envios')}
          {log.length === 0 ? (
            <div style={{ color: t.textMuted, fontSize: 13 }}>Nenhum envio registrado ainda.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
              {log.map((entry, i) => (
                <div key={i} style={{ background: t.appBg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: t.text }}>{entry.conv}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 5,
                      background: entry.status === 'sent' ? '#D1FAE5' : entry.status === 'finalized' ? '#FEF3C7' : entry.status === 'simulated' ? '#F0EBFF' : '#FEE2E2',
                      color: entry.status === 'sent' ? '#065F46' : entry.status === 'finalized' ? '#92400E' : entry.status === 'simulated' ? '#5B21B6' : '#DC2626',
                    }}>
                      {entry.status === 'sent' ? '✅ enviado' : entry.status === 'finalized' ? '🔚 finalizado' : entry.status === 'simulated' ? '🧪 simulado' : '❌ erro'} · {entry.stage}
                    </span>
                  </div>
                  {entry.text && <div style={{ fontSize: 11, color: t.textSecondary, marginBottom: 4 }}>"{entry.text}"</div>}
                  <div style={{ fontSize: 10, color: t.textMuted }}>{entry.at ? new Date(entry.at).toLocaleString('pt-BR') : ''}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

    </div>
  )
}
