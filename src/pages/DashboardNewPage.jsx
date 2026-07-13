import { useMemo, useState, useEffect } from 'react'
import { useTheme } from '../theme.jsx'
import InfraCard, { ProgressRow } from '../components/InfraCard'
import { getSupabaseStorageInfo } from '../services/plataforma/supabaseStorage'
import { getDeepSeekBalance } from '../services/ia/deepseekBalanceService'
import { getMonthlyTokenUsage } from '../services/plataforma/tokenLoggingService'
import { getOpenRouterBalance } from '../services/ia/openrouterBalanceService'
import { getVercelStatus } from '../services/plataforma/vercelStatusService'
import { contarVencemHoje } from '../services/crm/cobrancasService'

function today() {
  return new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .replace(/^\w/, c => c.toUpperCase())
}

function isToday(rawTime) {
  if (!rawTime) return false
  const d = new Date(rawTime)
  const now = new Date()
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
}

function timeSince(rawTime) {
  if (!rawTime) return ''
  const diff = Math.floor((Date.now() - new Date(rawTime).getTime()) / 60000)
  if (diff < 1) return 'agora'
  if (diff < 60) return `${diff}m`
  return `${Math.floor(diff / 60)}h`
}

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function WhatsAppIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path fill="#25D366" d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.38 5.07L2 22l5.07-1.33C8.52 21.5 10.22 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm5.2 14.2c-.23.65-1.35 1.24-1.86 1.28-.5.05-1.02.24-3.4-.7-2.87-1.15-4.7-4.06-4.84-4.25-.14-.19-1.16-1.55-1.16-2.95s.72-2.1.98-2.38c.26-.28.56-.35.75-.35.19 0 .38 0 .54.01.18.01.42-.07.65.5.24.58.82 2 .89 2.14.07.14.12.31.02.5-.1.19-.15.31-.3.48-.15.17-.31.38-.44.51-.15.15-.3.31-.13.6.17.29.76 1.25 1.63 2.02 1.12 1 2.06 1.31 2.35 1.46.29.15.46.13.63-.08.17-.21.72-.84.91-1.13.19-.29.38-.24.64-.14.26.1 1.65.78 1.93.92.28.14.47.21.54.33.07.12.07.68-.16 1.33z" />
    </svg>
  )
}

function InstagramIcon({ size = 16 }) {
  const id = useMemo(() => `ig-${Math.random().toString(36).slice(2)}`, [])
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#F58529" />
          <stop offset="50%" stopColor="#DD2A7B" />
          <stop offset="100%" stopColor="#8134AF" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="6" fill={`url(#${id})`} />
      <rect x="6.5" y="6.5" width="11" height="11" rx="3.5" fill="none" stroke="#fff" strokeWidth="1.6" />
      <circle cx="17.3" cy="6.7" r="1.1" fill="#fff" />
    </svg>
  )
}

const AVATAR_GRADIENTS = [
  'linear-gradient(150deg,#F0333F,#C81525)',
  'linear-gradient(150deg,#8B7CF6,#6D4FE0)',
  'linear-gradient(150deg,#FCB447,#E88A0C)',
  'linear-gradient(150deg,#8B93F8,#5D64E8)',
  'linear-gradient(150deg,#F472B6,#DB2777)',
]

export default function DashboardNewPage({ conversations = [] }) {
  const { theme: t, primary } = { theme: useTheme().theme, primary: '#E8192C' }

  const stats = useMemo(() => {
    const hoje = conversations.filter(c => isToday(c.rawTime))
    const wa = conversations.filter(c => c.channel === 'whatsapp')
    const ig = conversations.filter(c => c.channel === 'instagram')
    const autopilot = conversations.filter(c => c.mode === 'autopilot')
    const aguardando = conversations.filter(c => c.unread > 0)
    const total = conversations.length || 1
    const pctIA = Math.round((autopilot.length / total) * 100)
    return { hoje, wa, ig, autopilot, aguardando, pctIA }
  }, [conversations])

  const recent = conversations.slice(0, 5)

  // Storage real (Supabase)
  const [storage, setStorage] = useState(null)
  useEffect(() => {
    let cancelled = false
    getSupabaseStorageInfo().then(data => { if (!cancelled) setStorage(data) })
    const interval = setInterval(() => getSupabaseStorageInfo().then(data => { if (!cancelled) setStorage(data) }), 30 * 60 * 1000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  // Saldo real DeepSeek
  const [deepseek, setDeepseek] = useState(null)
  useEffect(() => {
    let cancelled = false
    getDeepSeekBalance().then(data => { if (!cancelled) setDeepseek(data) })
    return () => { cancelled = true }
  }, [])

  // % de uso real de tokens DeepSeek (usado como barra do card DeepSeek)
  const [tokenPercent, setTokenPercent] = useState(null)
  useEffect(() => {
    let cancelled = false
    getMonthlyTokenUsage('deepseek').then(({ totalTokens }) => {
      if (cancelled) return
      const pct = Math.min(Math.round((totalTokens / 1000000) * 100), 100)
      setTokenPercent(pct)
    }).catch(() => { if (!cancelled) setTokenPercent(null) })
    return () => { cancelled = true }
  }, [])

  // Saldo real OpenRouter
  const [openrouter, setOpenrouter] = useState(null)
  useEffect(() => {
    let cancelled = false
    getOpenRouterBalance().then(data => { if (!cancelled) setOpenrouter(data) })
    return () => { cancelled = true }
  }, [])

  // Status real de deploy Vercel (uso de Functions/transferência não é exposto no Hobby)
  const [vercel, setVercel] = useState(null)
  useEffect(() => {
    let cancelled = false
    getVercelStatus().then(data => { if (!cancelled) setVercel(data) })
    return () => { cancelled = true }
  }, [])

  // Cobranças reais (vencem hoje)
  const [cobrancasHoje, setCobrancasHoje] = useState(null)
  useEffect(() => {
    let cancelled = false
    contarVencemHoje().then(data => { if (!cancelled) setCobrancasHoje(data) })
    return () => { cancelled = true }
  }, [])

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: t.appBg, padding: '0 28px 24px 28px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 10, color: primary, letterSpacing: '1px', marginBottom: 1 }}>///</div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 24, color: t.text, letterSpacing: '-0.5px', lineHeight: 1, textTransform: 'uppercase' }}>Dashboard</div>
          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4 }}>{today()} · PRIME STORE Uberlândia</div>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
        <KpiCard value={conversations.length} label="CONVERSAS HOJE" sub="Dados ao vivo" />
        <KpiCard value={`${stats.pctIA}%`} label="RESOLVIDAS IA" sub="Autopilot ativo" />
        <KpiCard value={stats.aguardando.length} label="AGUARDANDO" sub={stats.aguardando.length > 0 ? 'Atender agora' : 'Tudo em dia'} />
        <KpiCard value={stats.wa.length + stats.ig.length} label="CANAIS ATIVOS" sub={`${stats.wa.length} WA · ${stats.ig.length} IG`} />
      </div>

      {/* Inbox + Agente/Créditos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 10, marginBottom: 10 }}>

        <InfraCard>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: t.text }}>Inbox — recentes</span>
            <span style={{ fontSize: 9, color: primary, fontWeight: 700 }}>Ver tudo →</span>
          </div>
          {recent.length === 0
            ? <div style={{ color: t.textMuted, fontSize: 12 }}>Sem conversas</div>
            : recent.map((conv, i) => (
              <div key={conv.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: i < recent.length - 1 ? `1px solid ${t.borderLight}` : 'none' }}>
                {conv.picture
                  ? <img src={conv.picture} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />
                  : <div style={{ width: 28, height: 28, borderRadius: '50%', background: AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{conv.initials}</div>
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.name}</div>
                  <div style={{ fontSize: 10, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.lastMsg || 'Sem mensagens'}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                  <span style={{ fontSize: 9, color: t.textMuted }}>{timeSince(conv.rawTime)}</span>
                  {conv.channel === 'whatsapp' ? <WhatsAppIcon size={14} /> : <InstagramIcon size={14} />}
                </div>
              </div>
            ))
          }
        </InfraCard>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Agente ativo — MOCK, ainda sem endpoint de "quem está atendendo agora" */}
          <InfraCard style={{ background: `linear-gradient(165deg, ${t.bg}, ${t.bgSecondary})` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: '#0EA5A6', letterSpacing: '0.6px' }}>AGENTE ATIVO</span>
              <span style={{ fontSize: 8.5, fontWeight: 700, color: '#047857', background: '#ECFDF5', padding: '2px 9px', borderRadius: 20 }}>ATIVO</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: t.bgTertiary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>👩🏻‍💼</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: t.text }}>Gabriela</div>
                <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>Canal principal · WhatsApp</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 7, marginTop: 10 }}>
              <div style={{ width: 26, height: 26, borderRadius: 8, background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><WhatsAppIcon size={13} /></div>
              <div style={{ width: 26, height: 26, borderRadius: 8, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="12" height="12" viewBox="0 0 24 24"><path fill="#229ED9" d="M21.05 2.93c-.31-.25-.77-.28-1.36-.06L2.93 9.72c-.86.32-.86 1.6.02 1.9l4.55 1.53 1.75 5.63c.2.63.98.82 1.44.35l2.6-2.66 4.61 3.44c.6.45 1.47.13 1.64-.61l3.05-13.66c.14-.63-.08-1.19-.54-1.51z" /></svg>
              </div>
              <div style={{ width: 26, height: 26, borderRadius: 8, background: '#FDF2F8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><InstagramIcon size={12} /></div>
            </div>
          </InfraCard>

          {/* Créditos por dia — MOCK, sem série histórica real ligada ainda */}
          <InfraCard style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: t.text, marginBottom: 10 }}>
              Créditos por dia <span style={{ fontWeight: 400, color: t.textMuted, fontSize: 9.5 }}>· 7 dias</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 42 }}>
              {[6, 3, 6, 2, 32, 14].map((h, i) => {
                const isToday = i === 5
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: '100%', height: h, borderRadius: 4, background: isToday ? `linear-gradient(180deg, #F0333F, #B4121F)` : 'linear-gradient(180deg, #FBD1D1, #F5B8B8)', boxShadow: isToday ? '0 3px 8px rgba(232,25,44,0.3)' : 'none' }} />
                    <span style={{ fontSize: 9, color: isToday ? primary : t.textMuted, fontWeight: isToday ? 700 : 400 }}>{WEEKDAY_LABELS[(new Date().getDay() - 5 + i + 7) % 7]}</span>
                  </div>
                )
              })}
            </div>
          </InfraCard>
        </div>
      </div>

      {/* Precisa de atenção — MOCK, sem fonte de eventos consolidada ainda */}
      <InfraCard style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: t.text }}>Precisa de atenção</span>
          <span style={{ fontSize: 9, color: primary, fontWeight: 700 }}>Ver tudo →</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {cobrancasHoje && cobrancasHoje.quantidade > 0 && (
            <AttentionItem bg="#FEF2F2" badgeBg="#FEE2E2" icon="🔴" title={`${cobrancasHoje.quantidade} cobranças vencem hoje`} titleColor="#991B1B" sub={`R$ ${cobrancasHoje.valorEmAberto.toFixed(2)} em aberto`} />
          )}
          {/* Saldo OpenRouter e Deploy — MOCK, sem regra de alerta automático ainda */}
          <AttentionItem bg="#FFFBEB" badgeBg="#FEF3C7" icon="🟠" title="Saldo OpenRouter baixo" sub="Abaixo de US$ 1" />
          <AttentionItem bg="#ECFDF5" badgeBg="#D1FAE5" icon="🟢" title="Deploy com sucesso" titleColor="#047857" sub="Hoje às 12:34" />
        </div>
      </InfraCard>

      {/* Infraestrutura */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: t.textMuted, letterSpacing: '1.2px' }}>INFRAESTRUTURA</span>
        <div style={{ flex: 1, height: 1, background: t.border }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>

        <InfraCard>
          <ProgressRow icon="📦" label="Storage" valueLabel={storage ? `${storage.usedGB.toFixed(2)}/${storage.totalGB} GB` : '—'} percent={storage?.usedPercent ?? 0} />
          <ProgressRow icon="🗄️" label="Database" valueLabel={storage?.dbUsedMB != null ? `${storage.dbUsedMB.toFixed(1)}/${storage.dbTotalMB} MB` : '—'} percent={storage?.dbUsedPercent ?? 0} />
        </InfraCard>

        <InfraCard>
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
              <span style={{ fontSize: 13 }}>🧠</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: t.text }}>DeepSeek</span>
            </div>
            <div style={{ fontSize: 10, color: t.textMuted, display: 'flex', justifyContent: 'space-between' }}>
              <span>Créditos</span>
              <span style={{ fontWeight: 700, color: t.text }}>{deepseek ? `$${deepseek.balance.toFixed(2)}` : '—'}</span>
            </div>
            {tokenPercent != null && (
              <div style={{ height: 3, background: t.bgTertiary, borderRadius: 3, marginTop: 4 }}>
                <div style={{ width: `${tokenPercent}%`, height: '100%', background: 'linear-gradient(90deg,#34D39999,#059669)', borderRadius: 3 }} />
              </div>
            )}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
              <span style={{ fontSize: 13 }}>💰</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: t.text }}>OpenRouter</span>
            </div>
            <div style={{ fontSize: 10, color: t.textMuted, display: 'flex', justifyContent: 'space-between' }}>
              <span>Créditos</span>
              <span style={{ fontWeight: 700, color: t.text }}>{openrouter ? `$${openrouter.balance.toFixed(2)}` : '—'}</span>
            </div>
            {openrouter && openrouter.totalCredits > 0 && (
              <div style={{ height: 3, background: t.bgTertiary, borderRadius: 3, marginTop: 4 }}>
                <div style={{ width: `${Math.min(Math.round((openrouter.totalUsage / openrouter.totalCredits) * 100), 100)}%`, height: '100%', background: 'linear-gradient(90deg,#34D39999,#059669)', borderRadius: 3 }} />
              </div>
            )}
          </div>
        </InfraCard>

        <InfraCard>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13 }}>☁️</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: t.text }}>Vercel</span>
            </div>
            {vercel && (
              <span style={{ fontSize: 8.5, fontWeight: 700, color: vercel.state === 'READY' ? '#059669' : primary }}>
                ● {vercel.state === 'READY' ? 'Online' : vercel.state}
              </span>
            )}
          </div>
          {vercel ? (
            <>
              <div style={{ fontSize: 10, color: t.textMuted }}>{vercel.branch || 'main'} · {new Date(vercel.createdAt).toLocaleDateString('pt-BR')}</div>
              <div style={{ fontSize: 9, color: t.textMuted, marginTop: 5, fontStyle: 'italic' }}>{vercel.usageNote}</div>
            </>
          ) : (
            <div style={{ fontSize: 10, color: t.textMuted }}>—</div>
          )}
        </InfraCard>

        <InfraCard accent>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 13 }}>💳</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: t.text }}>Cobranças</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: primary, letterSpacing: '-0.3px' }}>
            {cobrancasHoje ? `${cobrancasHoje.quantidade} hoje` : '—'}
          </div>
          <div style={{ fontSize: 10, color: t.textMuted, marginTop: 4 }}>
            {cobrancasHoje ? `R$ ${cobrancasHoje.valorEmAberto.toFixed(2)} em aberto` : ''}
          </div>
        </InfraCard>
      </div>
    </div>
  )
}

function KpiCard({ value, label, sub }) {
  return (
    <div style={{
      background: 'linear-gradient(150deg, #F0333F, #B4121F)',
      borderRadius: 14,
      padding: '12px 14px',
      boxShadow: '0 8px 18px -8px rgba(232,25,44,0.55), inset 0 1px 0 rgba(255,255,255,0.15)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.72)', letterSpacing: '0.6px', fontWeight: 600 }}>{label}</div>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff', boxShadow: '0 0 6px #fff' }} />
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginTop: 6, letterSpacing: '-0.5px' }}>{value}</div>
      <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.78)', marginTop: 2 }}>{sub}</div>
    </div>
  )
}

function AttentionItem({ bg, badgeBg, icon, title, titleColor, sub }) {
  return (
    <div style={{ background: bg, borderRadius: 10, padding: '8px 10px', display: 'flex', gap: 8 }}>
      <div style={{ width: 22, height: 22, borderRadius: 7, background: badgeBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: titleColor || 'inherit' }}>{title}</div>
        <div style={{ fontSize: 9, color: '#9CA3AF' }}>{sub}</div>
      </div>
    </div>
  )
}
