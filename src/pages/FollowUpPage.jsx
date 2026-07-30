import { useState, useEffect } from 'react'
import { useTheme } from '../theme.jsx'
import { RefreshCw, Clock, BarChart3, Activity, Settings, PlusCircle } from 'lucide-react'
import { runFollowUpCheck, getFollowUpSummary, getFollowUpLog, clearFollowUpState, getScheduleAsync, saveScheduleAsync, isWithinSchedule, getResponseRate, getStagesAsync, saveStagesAsync, DEFAULT_FIXED_TEXT, DEFAULT_SCHEDULE, DEFAULT_STAGES } from '../services/crm/followUpService'
import { sendMessage } from '../services/chat/gptmaker'

export default function FollowUpPage({ conversations = [] }) {
  const { theme: t } = useTheme()
  const [running, setRunning]       = useState(false)
  const [result, setResult]         = useState(null)
  const [summary, setSummary]       = useState({ total: 0, pending: [], sent: [], inactive: [] })
  const [log, setLog]               = useState([])
  const [confirmSend, setConfirmSend] = useState(false)
  const [filterStage, setFilterStage] = useState('all')
  const [activeTab, setActiveTab] = useState('pending')
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE)
  const withinSchedule = isWithinSchedule(schedule)
  const [editedMessages, setEditedMessages] = useState([])
  const [sendingEdited, setSendingEdited] = useState(false)
  const [channelFilter, setChannelFilter] = useState({ whatsapp: true, instagram: true })
  const [responseRate, setResponseRate] = useState({ total: 0, responded: 0, rate: 0, byStage: {} })
  const [enabled, setEnabled] = useState(() => localStorage.getItem('followup_enabled') !== 'false')
  const [stages, setStages] = useState(DEFAULT_STAGES)
  const [editingFixed, setEditingFixed] = useState({})

  function toggleEnabled() {
    const next = !enabled
    setEnabled(next)
    localStorage.setItem('followup_enabled', String(next))
  }

  useEffect(() => {
    getScheduleAsync().then(setSchedule)
    getStagesAsync().then(setStages)
  }, [])

  useEffect(() => {
    refresh()
  }, [conversations])

  async function refresh() {
    const [s, l, r] = await Promise.all([
      getFollowUpSummary(conversations),
      getFollowUpLog(),
      getResponseRate(conversations),
    ])
    setSummary(s)
    setLog(l)
    setResponseRate(r)
  }

  async function updateSchedule(patch) {
    const next = { ...schedule, ...patch }
    setSchedule(next)
    await saveScheduleAsync(next)
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
      if (!msg.convId || !msg.text.trim()) {
        console.warn(`[FollowUp] ⚠️ Pulando mensagem inválida:`, msg)
        continue
      }

      // Retry logic: tenta 3 vezes com backoff
      let sent = false
      let lastError = null
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await sendMessage(msg.convId, msg.text)
          console.log(`[FollowUp] ✅ Enviado para "${msg.conv}" (tentativa ${attempt})`)
          results.push({ ...msg, status: 'sent', attempts: attempt })
          sent = true
          break
        } catch (err) {
          lastError = err
          console.warn(`[FollowUp] Tentativa ${attempt}/3 falhou para "${msg.conv}": ${err.message}`)
          if (attempt < 3) {
            // Aguarda 500ms * tentativa antes de retentar
            await new Promise(resolve => setTimeout(resolve, 500 * attempt))
          }
        }
      }

      if (!sent) {
        console.error(`[FollowUp] ❌ Falha final para "${msg.conv}": ${lastError?.message}`)
        results.push({ ...msg, status: 'error', error: lastError?.message })
      }
    }

    setSendingEdited(false)
    setEditedMessages([])
    const sent = results.filter(r => r.status === 'sent')
    const errors = results.filter(r => r.status === 'error')
    console.log(`[FollowUp] Resumo: ${sent.length} enviados, ${errors.length} erros`)
    setResult({ dryRun: false, sent, errors })
    refresh()
  }

  const pendingFiltered = filterStage === 'all'
    ? summary.pending
    : summary.pending.filter(p => p.stage === filterStage)

  const card = (children, style = {}) => (
    <div style={{ background: t.bg, borderRadius: 12, padding: '16px 18px', ...style }}>
      {children}
    </div>
  )

  const sectionTitle = (txt, Icon) => (
    <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
      {Icon && <Icon size={13} strokeWidth={2} style={{ color: t.textMuted }} />}
      {txt}
    </div>
  )

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: t.appBg, overflowY: 'auto', padding: '24px 28px', gap: 12 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: t.text, letterSpacing: '-0.02em' }}>
            Follow-up
          </div>
          <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 4 }}>
            Motor autônomo de reengajamento · {summary.total} conversas monitoradas
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={toggleEnabled}
            style={{
              borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none',
              background: enabled ? t.bg : '#FEF2F2',
              color: enabled ? t.text : '#DC2626',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            <div style={{
              width: 32, height: 18, borderRadius: 10, background: enabled ? '#10B981' : '#DC2626',
              position: 'relative', transition: 'background 0.2s', flexShrink: 0,
            }}>
              <div style={{
                position: 'absolute', top: 2, left: enabled ? 16 : 2,
                width: 14, height: 14, borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
              }} />
            </div>
            {enabled ? 'Follow-up ON' : 'Follow-up OFF'}
          </button>
          <button
            onClick={refresh}
            style={{ background: t.bg, border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, color: t.textMid, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={13} strokeWidth={2} />
            Atualizar
          </button>
        </div>
      </div>

      {!enabled && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, background: '#FEF2F2', borderLeft: '3px solid #DC2626' }}>
          <div>
            <div style={{ fontWeight: 700, color: '#DC2626', fontSize: 13 }}>Follow-up desligado</div>
            <div style={{ color: t.textMid, fontSize: 12, marginTop: 1 }}>Nenhuma mensagem será enviada automaticamente. Ligue quando terminar os testes.</div>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1,
        background: t.borderLight || t.border, borderRadius: 10, overflow: 'hidden',
      }}>
        {[
          { label: 'Pendentes', value: summary.pending.length, color: t.text },
          { label: 'Enviados', value: summary.sent.length, color: '#059669' },
          { label: 'Inativos +24h', value: summary.inactive.length, color: t.text },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: t.bg, padding: '14px 18px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: t.textMid, marginBottom: 6 }}>{kpi.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: kpi.color, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{kpi.value}</div>
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
            {sectionTitle('Distribuição de inatividade', BarChart3)}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {buckets.map((b, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: t.text }}>{b.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: b.color, fontVariantNumeric: 'tabular-nums' }}>{b.count} conv.</span>
                  </div>
                  <div style={{ height: 6, background: t.bgTertiary, borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.round((b.count / total) * 100)}%`,
                      background: b.color,
                      borderRadius: 3,
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
          {sectionTitle('Taxa de resposta pós follow-up', Activity)}
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>

            {/* Círculo de taxa geral */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 80 }}>
              <div style={{
                width: 68, height: 68, borderRadius: '50%',
                background: `conic-gradient(#059669 ${responseRate.rate * 3.6}deg, ${t.bgTertiary} ${responseRate.rate * 3.6}deg)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ width: 50, height: 50, borderRadius: '50%', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#059669', fontVariantNumeric: 'tabular-nums' }}>{responseRate.rate}%</span>
                </div>
              </div>
              <div style={{ fontSize: 10.5, color: t.textMuted, marginTop: 6, textAlign: 'center' }}>
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
                      <span style={{ fontSize: 11, color: t.textMuted, fontVariantNumeric: 'tabular-nums' }}>{data.responded}/{data.total} · {pct}%</span>
                    </div>
                    <div style={{ height: 4, background: t.bgTertiary, borderRadius: 2 }}>
                      <div style={{ height: 4, width: `${pct}%`, background: pct >= 50 ? '#10B981' : '#F59E0B', borderRadius: 2, transition: 'width 0.4s' }} />
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
            <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
              <button onClick={() => setActiveTab('pending')} style={{
                background: activeTab === 'pending' ? t.text : 'transparent',
                color: activeTab === 'pending' ? t.bg : t.textMid,
                border: 'none',
                borderRadius: 6, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              }}>
                Pendentes · {summary.pending.length}
              </button>
              <button onClick={() => setActiveTab('sent')} style={{
                background: activeTab === 'sent' ? t.text : 'transparent',
                color: activeTab === 'sent' ? t.bg : t.textMid,
                border: 'none',
                borderRadius: 6, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              }}>
                Enviados · {log.length}
              </button>
            </div>

            {/* Aba Pendentes */}
            {activeTab === 'pending' && (
              <>
                <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
                  {['all', '30min', '23h45', '24h'].map(s => (
                    <button key={s} onClick={() => setFilterStage(s)} style={{
                      background: filterStage === s ? t.text : t.bgTertiary,
                      color: filterStage === s ? t.bg : t.textMid,
                      border: 'none',
                      borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    }}>
                      {s === 'all' ? 'Todos' : s}
                    </button>
                  ))}
                </div>
                {pendingFiltered.length === 0 ? (
                  <div style={{ color: t.textMuted, fontSize: 12.5, padding: '8px 4px' }}>Nenhum pendente neste filtro.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 280, overflowY: 'auto' }}>
                    {pendingFiltered.map((p, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 4px', borderBottom: i < pendingFiltered.length - 1 ? `1px solid ${t.borderLight || t.border}` : 'none' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1 }}>{p.inactiveMin}min inativo</div>
                        </div>
                        <span style={{ background: t.bgTertiary, color: t.textMid, borderRadius: 6, padding: '3px 9px', fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{p.stage}</span>
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
                  <div style={{ color: t.textMuted, fontSize: 12.5, padding: '8px 4px' }}>Nenhum envio registrado ainda.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 280, overflowY: 'auto' }}>
                    {log.map((entry, i) => {
                      const statusCor = entry.status === 'sent' ? '#10B981' : entry.status === 'finalized' ? '#F59E0B' : entry.status === 'simulated' ? t.textMuted : '#DC2626'
                      const statusLabel = entry.status === 'sent' ? 'enviado' : entry.status === 'finalized' ? 'finalizado' : entry.status === 'simulated' ? 'simulado' : 'erro'
                      return (
                        <div key={i} style={{ padding: '10px 4px', borderBottom: i < log.length - 1 ? `1px solid ${t.borderLight || t.border}` : 'none' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                            <span style={{ fontSize: 12.5, fontWeight: 700, color: t.text }}>{entry.conv}</span>
                            <span style={{ fontSize: 10.5, fontWeight: 600, color: t.textMid, display: 'flex', alignItems: 'center', gap: 5 }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusCor, display: 'inline-block' }} />
                              {statusLabel} · {entry.stage}
                            </span>
                          </div>
                          {entry.text && <div style={{ fontSize: 11.5, color: t.textMid, marginBottom: 2, fontStyle: 'italic' }}>"{entry.text}"</div>}
                          <div style={{ fontSize: 10.5, color: t.textMuted }}>{entry.at ? new Date(entry.at).toLocaleString('pt-BR') : ''}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Horário inteligente */}
        {card(
          <>
            {sectionTitle('Horário de envio', Clock)}

            {/* Status atual */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: withinSchedule ? '#ECFDF5' : '#FFFBEB',
              borderRadius: 8, padding: '8px 12px', marginBottom: 14,
              fontSize: 12, fontWeight: 600,
              color: withinSchedule ? '#059669' : '#B45309',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: withinSchedule ? '#10B981' : '#F59E0B', display: 'inline-block', flexShrink: 0 }} />
              {withinSchedule ? 'Dentro da janela — envios permitidos agora' : 'Fora da janela — envios bloqueados agora'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Horário */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>Início</div>
                  <select value={schedule.startHour} onChange={e => updateSchedule({ startHour: +e.target.value })}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: 'none', background: t.bgTertiary, color: t.text, fontSize: 13 }}>
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{String(i).padStart(2,'0')}:00</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>Fim</div>
                  <select value={schedule.endHour} onChange={e => updateSchedule({ endHour: +e.target.value })}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: 'none', background: t.bgTertiary, color: t.text, fontSize: 13 }}>
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
                      flex: 1, padding: '8px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
                      background: schedule[key] ? '#FEF2F2' : t.bgTertiary,
                      color: schedule[key] ? '#DC2626' : t.textMid,
                    }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Editor de Estágios */}
        {card(
          <>
            {sectionTitle('Ações de inatividade', Settings)}
            <div style={{ fontSize: 12.5, color: t.textMuted, marginBottom: 14 }}>
              Configure o que o agente faz quando o cliente para de responder.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                    border: `1px solid ${t.borderLight || t.border}`,
                    borderRadius: 10, overflow: 'hidden',
                    opacity: stage.enabled ? 1 : 0.55,
                  }}>
                    {/* Linha do tempo */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', background: t.bgSecondary, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12.5, color: t.textMid, whiteSpace: 'nowrap' }}>Se não responder em</span>
                      <select
                        value={selectedTime.label}
                        onChange={e => {
                          const opt = TIME_OPTIONS.find(o => o.label === e.target.value) || TIME_OPTIONS[1]
                          const next = stages.map((s, j) => j === i ? { ...s, min: opt.min, max: opt.max, label: opt.label } : s)
                          setStages(next); saveStagesAsync(next)
                        }}
                        style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: t.bgTertiary, color: t.text, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                      >
                        {TIME_OPTIONS.map(o => <option key={o.label} value={o.label}>{o.label}</option>)}
                      </select>
                      <span style={{ fontSize: 12.5, color: t.textMid, whiteSpace: 'nowrap' }}>o agente deve</span>
                      <select
                        value={stage.action}
                        onChange={e => {
                          const next = stages.map((s, j) => j === i ? { ...s, action: e.target.value } : s)
                          setStages(next); saveStagesAsync(next)
                        }}
                        style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: t.bgTertiary, color: t.text, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                      >
                        <option value="message">Interagir com cliente (IA)</option>
                        <option value="fixed">Mensagem fixa</option>
                        <option value="fixed_and_finalize">Mensagem + Finalizar</option>
                        <option value="finalize">Finalizar atendimento</option>
                      </select>
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => {
                            const next = stages.map((s, j) => j === i ? { ...s, enabled: !s.enabled } : s)
                            setStages(next); saveStagesAsync(next)
                          }}
                          style={{ fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                            background: stage.enabled ? '#ECFDF5' : t.bgTertiary,
                            color: stage.enabled ? '#059669' : t.textMuted }}
                        >
                          {stage.enabled ? '● Ativo' : '○ Inativo'}
                        </button>
                        {stages.length > 1 && (
                          <button
                            onClick={() => { const next = stages.filter((_, j) => j !== i); setStages(next); saveStagesAsync(next) }}
                            style={{ fontSize: 13, padding: '4px 9px', borderRadius: 6, border: 'none', background: 'transparent', color: t.textMuted, cursor: 'pointer', fontWeight: 700 }}
                          >✕</button>
                        )}
                      </div>
                    </div>

                    {/* Descrição da ação */}
                    {stage.action === 'message' && (
                      <div style={{ padding: '9px 14px', background: t.bg, borderTop: `1px solid ${t.borderLight || t.border}`, display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ fontSize: 11, color: t.textMuted }}>↳</span>
                        <span style={{ fontSize: 11.5, color: t.textMid, fontStyle: 'italic' }}>
                          Mensagem gerada por IA (Groq) com base no histórico da conversa
                        </span>
                      </div>
                    )}
                    {(stage.action === 'fixed' || stage.action === 'fixed_and_finalize') && (
                      <div style={{ borderTop: `1px solid ${t.borderLight || t.border}`, background: t.bg }}>
                        {stage.action === 'fixed_and_finalize' && (
                          <div style={{ padding: '6px 14px', background: '#FFFBEB', fontSize: 11, color: '#B45309', fontWeight: 600 }}>
                            ↳ Envia esta mensagem e em seguida finaliza a conversa automaticamente
                          </div>
                        )}
                        {editingFixed[stage.id] ? (
                          <div style={{ padding: '12px 14px' }}>
                            <textarea
                              value={stage.fixedText ?? DEFAULT_FIXED_TEXT}
                              onChange={e => {
                                const next = stages.map((s, j) => j === i ? { ...s, fixedText: e.target.value } : s)
                                setStages(next); saveStagesAsync(next)
                              }}
                              rows={8}
                              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: 'none', fontSize: 13, color: t.text, background: t.bgTertiary, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', lineHeight: 1.6, outline: 'none' }}
                            />
                            <button
                              onClick={() => setEditingFixed(p => ({ ...p, [stage.id]: false }))}
                              style={{ marginTop: 8, padding: '6px 16px', borderRadius: 7, border: 'none', background: t.text, color: t.bg, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                            >
                              Confirmar
                            </button>
                          </div>
                        ) : (
                          <div style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                            <div style={{ flex: 1 }}>
                              <span style={{ fontSize: 11, color: t.textMuted }}>↳ </span>
                              <span style={{ fontSize: 12, color: t.textMid, whiteSpace: 'pre-line' }}>
                                {(stage.fixedText ?? DEFAULT_FIXED_TEXT).split('\n')[0]}…
                              </span>
                            </div>
                            <button
                              onClick={() => setEditingFixed(p => ({ ...p, [stage.id]: true }))}
                              style={{ flexShrink: 0, padding: '4px 12px', borderRadius: 7, border: 'none', background: t.bgTertiary, color: t.textMid, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                            >
                              Editar
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {stage.action === 'finalize' && (
                      <div style={{ padding: '9px 14px', background: '#FFFBEB', borderTop: `1px solid ${t.borderLight || t.border}`, display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ fontSize: 11, color: '#B45309' }}>↳</span>
                        <span style={{ fontSize: 11.5, color: '#B45309' }}>
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
                  setStages(next); saveStagesAsync(next)
                }}
                style={{ background: 'transparent', border: `1px dashed ${t.borderLight || t.border}`, color: t.textMuted, borderRadius: 10, padding: '11px', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <PlusCircle size={14} strokeWidth={2} />
                Adicionar ação
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
                    { key: 'whatsapp', label: 'WhatsApp', activeColor: '#059669', activeBg: '#ECFDF5' },
                    { key: 'instagram', label: 'Instagram', activeColor: t.text, activeBg: t.bgTertiary },
                  ].map(({ key, label, activeColor, activeBg }) => {
                    const active = channelFilter[key]
                    return (
                      <button key={key} onClick={() => setChannelFilter(p => ({ ...p, [key]: !p[key] }))} style={{
                        flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none',
                        background: active ? activeBg : t.bgTertiary,
                        color: active ? activeColor : t.textMuted,
                      }}>
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <button
                onClick={() => run(true)}
                disabled={running}
                style={{ background: t.bgTertiary, border: 'none', color: t.textMid, borderRadius: 10, padding: '12px 16px', fontSize: 13, fontWeight: 700, cursor: running ? 'not-allowed' : 'pointer', opacity: running ? 0.6 : 1, textAlign: 'left' }}
              >
                {running ? 'Processando...' : 'Simular follow-ups'}
                <div style={{ fontSize: 11, fontWeight: 400, marginTop: 2, opacity: 0.8 }}>Gera as mensagens sem enviar nada</div>
              </button>

              {!confirmSend ? (
                <button
                  onClick={() => setConfirmSend(true)}
                  disabled={running || summary.pending.length === 0 || !withinSchedule}
                  style={{ background: withinSchedule ? t.text : t.bgTertiary, border: 'none', color: withinSchedule ? t.bg : t.textMuted, borderRadius: 10, padding: '12px 16px', fontSize: 13, fontWeight: 700, cursor: (running || summary.pending.length === 0 || !withinSchedule) ? 'not-allowed' : 'pointer', opacity: (running || summary.pending.length === 0 || !withinSchedule) ? 0.5 : 1, textAlign: 'left' }}
                >
                  Enviar follow-ups
                  <div style={{ fontSize: 11, fontWeight: 400, marginTop: 2, opacity: 0.85 }}>
                    {!withinSchedule ? 'Fora do horário configurado' : `${summary.pending.length} clientes serão contatados`}
                  </div>
                </button>
              ) : (
                <div style={{ background: '#FEF2F2', borderRadius: 10, padding: '12px 16px', borderLeft: '3px solid #DC2626' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#DC2626', marginBottom: 8 }}>Confirmar envio para {summary.pending.length} clientes?</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => run(false)} style={{ flex: 1, background: '#DC2626', border: 'none', color: '#fff', borderRadius: 8, padding: '8px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Sim, enviar</button>
                    <button onClick={() => setConfirmSend(false)} style={{ flex: 1, background: t.bg, border: 'none', color: t.textMid, borderRadius: 8, padding: '8px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                  </div>
                </div>
              )}

              <button
                onClick={async () => { await clearFollowUpState(); await refresh(); setResult(null) }}
                style={{ background: 'none', border: 'none', color: t.textMuted, borderRadius: 10, padding: '10px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                Resetar histórico de envios
              </button>
            </div>

            {/* Resultado da simulação — editável */}
            {result && result.dryRun && editedMessages.length > 0 && (
              <div style={{ marginTop: 16, background: t.bgSecondary, borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 4 }}>Revise e edite antes de enviar</div>
                <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 12 }}>Verificadas: {result.checked} · {editedMessages.length} mensagens geradas</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {editedMessages.map((msg, i) => (
                    <div key={i} style={{ background: t.bg, borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: t.text }}>{msg.conv}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, background: t.bgTertiary, color: t.textMid, borderRadius: 5, padding: '2px 7px' }}>{msg.stage}</span>
                      </div>
                      <textarea
                        value={msg.text}
                        onChange={e => setEditedMessages(prev => prev.map((m, j) => j === i ? { ...m, text: e.target.value } : m))}
                        rows={2}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: t.bgTertiary, fontSize: 12, color: t.text, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }}
                      />
                    </div>
                  ))}
                </div>
                <button
                  onClick={sendEdited}
                  disabled={sendingEdited || !withinSchedule}
                  style={{ marginTop: 12, width: '100%', background: withinSchedule ? t.text : t.bgTertiary, border: 'none', color: withinSchedule ? t.bg : t.textMuted, borderRadius: 9, padding: '10px', fontSize: 13, fontWeight: 700, cursor: (sendingEdited || !withinSchedule) ? 'not-allowed' : 'pointer', opacity: (sendingEdited || !withinSchedule) ? 0.6 : 1 }}
                >
                  {sendingEdited ? 'Enviando...' : `Enviar ${editedMessages.length} mensagens editadas`}
                </button>
              </div>
            )}

            {/* Resultado de envio real */}
            {result && !result.dryRun && (
              <div style={{ marginTop: 16, background: '#ECFDF5', borderRadius: 10, padding: '12px 16px', borderLeft: '3px solid #10B981' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#059669', marginBottom: 4 }}>Envios realizados</div>
                <div style={{ fontSize: 12, color: t.textMid }}>
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
          {sectionTitle('Histórico de envios')}
          {log.length === 0 ? (
            <div style={{ color: t.textMuted, fontSize: 12.5 }}>Nenhum envio registrado ainda.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
              {log.map((entry, i) => {
                const statusCor = entry.status === 'sent' ? '#10B981' : entry.status === 'finalized' ? '#F59E0B' : entry.status === 'simulated' ? t.textMuted : '#DC2626'
                const statusLabel = entry.status === 'sent' ? 'enviado' : entry.status === 'finalized' ? 'finalizado' : entry.status === 'simulated' ? 'simulado' : 'erro'
                return (
                  <div key={i} style={{ background: t.bgSecondary, borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: t.text }}>{entry.conv}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 600, color: t.textMid, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusCor, display: 'inline-block' }} />
                        {statusLabel} · {entry.stage}
                      </span>
                    </div>
                    {entry.text && <div style={{ fontSize: 11, color: t.textMid, marginBottom: 4 }}>"{entry.text}"</div>}
                    <div style={{ fontSize: 10, color: t.textMuted }}>{entry.at ? new Date(entry.at).toLocaleString('pt-BR') : ''}</div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

    </div>
  )
}
