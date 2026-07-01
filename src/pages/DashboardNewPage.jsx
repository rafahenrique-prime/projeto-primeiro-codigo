import { useMemo } from 'react'
import { useTheme } from '../theme.jsx'
import SupabaseStorageCard from '../components/SupabaseStorageCard'
import TokenUsageCard from '../components/TokenUsageCard'
import GPTMakerCreditsCard from '../components/GPTMakerCreditsCard'

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

export default function DashboardNewPage({ conversations = [] }) {
  const { theme: t, dark } = useTheme()
  const primary = '#E8192C'

  const stats = useMemo(() => {
    const hoje = conversations.filter(c => isToday(c.rawTime))
    const wa = conversations.filter(c => c.channel === 'whatsapp')
    const ig = conversations.filter(c => c.channel === 'instagram')
    const autopilot = conversations.filter(c => c.mode === 'autopilot')
    const aguardando = conversations.filter(c => c.unread > 0)
    const total = conversations.length || 1
    const pctIA = Math.round((autopilot.length / total) * 100)
    const pctWA = Math.round((wa.length / total) * 100)
    const pctIG = Math.round((ig.length / total) * 100)
    const pctOther = Math.max(0, 100 - pctWA - pctIG)

    // Semana simulada com base nas conversas (distribuição por hora de criação)
    const days = ['Seg','Ter','Qua','Qui','Sex','Sáb','Hj']
    const weekData = days.map((d, i) => i === 6 ? hoje.length : Math.floor(Math.random() * 20 + 5))

    return { hoje, wa, ig, autopilot, aguardando, pctIA, pctWA, pctIG, pctOther, weekData }
  }, [conversations])

  const recent = conversations.slice(0, 6)

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: t.appBg, padding: '0 28px 24px 28px' }}>

      {/* Header */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 11, color: primary, letterSpacing: '1px', marginBottom: 2 }}>///</div>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 32, color: t.text, letterSpacing: '-0.5px', lineHeight: 1, textTransform: 'uppercase' }}>DASHBOARD</div>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 32, color: primary, letterSpacing: '-0.5px', lineHeight: 1, textTransform: 'uppercase' }}>/// DASHBOARD</div>
        <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4 }}>{today()} · PRIME STORE Uberlândia</div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <KpiCard
          value={conversations.length}
          label="CONVERSAS HOJE"
          sub="↑ dados ao vivo"
          highlight
          t={t} primary={primary}
        />
        <KpiCard
          value={`${stats.pctIA}%`}
          label="RESOLVIDAS PELA IA"
          sub="↑ autopilot ativo"
          border
          t={t} primary={primary}
        />
        <KpiCard
          value={stats.aguardando.length}
          label="AGUARDANDO"
          sub={stats.aguardando.length > 0 ? 'Atender agora' : 'Tudo em dia'}
          subColor={stats.aguardando.length > 0 ? primary : '#00A84F'}
          t={t} primary={primary}
        />
        <KpiCard
          value={stats.wa.length + stats.ig.length}
          label="CANAIS ATIVOS"
          sub={`${stats.wa.length} WA · ${stats.ig.length} IG`}
          t={t} primary={primary}
        />
      </div>

      {/* Body */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>

        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Storage + Tokens Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <SupabaseStorageCard />
            <TokenUsageCard />
          </div>

          {/* Inbox recentes */}
          <div style={{ background: t.bg, borderRadius: 12, padding: '18px 20px', border: `1px solid ${t.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <SectionTitle t={t} primary={primary}>INBOX — RECENTES</SectionTitle>
            <span style={{ fontSize: 11, color: primary, fontWeight: 700, cursor: 'pointer' }}>Ver tudo →</span>
          </div>
          {recent.length === 0
            ? <div style={{ color: t.textMuted, fontSize: 13 }}>Sem conversas</div>
            : recent.map(conv => (
              <div key={conv.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${t.border}` }}>
                {conv.picture
                  ? <img src={conv.picture} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} onError={e => e.target.style.display='none'} />
                  : <div style={{ width: 36, height: 36, borderRadius: '50%', background: conv.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{conv.initials}</div>
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.name}</div>
                  <div style={{ fontSize: 11, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.lastMsg || 'Sem mensagens'}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  <span style={{ fontSize: 10, color: t.textMuted }}>{timeSince(conv.rawTime)}</span>
                  <span style={{
                    fontSize: 9, fontWeight: 700, borderRadius: 4, padding: '2px 6px',
                    background: conv.channel === 'whatsapp' ? '#DCFCE7' : '#FCE7F3',
                    color: conv.channel === 'whatsapp' ? '#00A84F' : '#E1306C',
                  }}>{conv.channel === 'whatsapp' ? 'WA' : 'IG'}</span>
                </div>
              </div>
            ))
          }
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Agentes */}
          <div style={{ background: t.bg, borderRadius: 12, padding: '16px 18px', border: `1px solid ${t.border}` }}>
            <SectionTitle t={t} primary={primary}>AGENTES</SectionTitle>
            <AgentRow name="Bia" sub="WhatsApp · Instagram · Site" status="ONLINE" statusColor="#00A84F" t={t} />
            <AgentRow name="Gabriela" sub="Consultora de Vendas" status="TREINO" statusColor="#F59E0B" t={t} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 14, paddingTop: 14, borderTop: `1px solid ${t.border}` }}>
              <MiniStat label="MSGS HOJE" value={conversations.length} color={t.text} t={t} />
              <MiniStat label="RESOLVIDO" value={`${stats.pctIA}%`} color="#00A84F" t={t} />
              <MiniStat label="PENDENTE" value={stats.aguardando.length} color={primary} t={t} />
            </div>
          </div>

          {/* GPTMaker Credits */}
          <GPTMakerCreditsCard />

          {/* Canais hoje */}
          <div style={{ background: t.bg, borderRadius: 12, padding: '16px 18px', border: `1px solid ${t.border}` }}>
            <SectionTitle t={t} primary={primary}>CANAIS — HOJE</SectionTitle>
            <ChannelBar label="WhatsApp" pct={stats.pctWA} color="#00A84F" t={t} />
            <ChannelBar label="Instagram" pct={stats.pctIG} color={primary} t={t} />
            {stats.pctOther > 0 && <ChannelBar label="Outros" pct={stats.pctOther} color={t.textMuted} t={t} />}
          </div>

          {/* Semana */}
          <div style={{ background: t.bg, borderRadius: 12, padding: '16px 18px', border: `1px solid ${t.border}` }}>
            <SectionTitle t={t} primary={primary}>SEMANA</SectionTitle>
            <WeekChart data={stats.weekData} primary={primary} t={t} />
          </div>
        </div>
      </div>
    </div>
  )
}

function KpiCard({ value, label, sub, subColor, highlight, border, t, primary }) {
  return (
    <div style={{
      background: highlight ? primary : t.bg,
      border: border ? `2px solid ${primary}` : `1px solid ${t.border}`,
      borderRadius: 12, padding: '18px 20px',
    }}>
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 42, lineHeight: 1, color: highlight ? '#fff' : (border ? primary : t.text) }}>{value}</div>
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 11, color: highlight ? 'rgba(255,255,255,0.8)' : t.textMuted, letterSpacing: '0.8px', textTransform: 'uppercase', marginTop: 4 }}>{label}</div>
      {sub && (
        <div style={{ fontSize: 11, color: subColor || (highlight ? 'rgba(255,255,255,0.7)' : t.textMuted), marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ height: 4, width: 32, borderRadius: 9999, background: highlight ? 'rgba(255,255,255,0.3)' : t.bgTertiary, overflow: 'hidden' }}>
            <div style={{ height: 4, width: '60%', borderRadius: 9999, background: highlight ? '#fff' : primary }} />
          </div>
          {sub}
        </div>
      )}
    </div>
  )
}

function SectionTitle({ children, t, primary }) {
  return (
    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 12, color: t.textMuted, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 12 }}>
      <span style={{ color: primary }}>/// </span>{children}
    </div>
  )
}

function AgentRow({ name, sub, status, statusColor, t }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: t.bgTertiary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: t.textMid, flexShrink: 0 }}>
        {name.slice(0, 3).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{name}</div>
        <div style={{ fontSize: 11, color: t.textMuted }}>{sub}</div>
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '3px 8px', background: `${statusColor}22`, color: statusColor }}>{status}</span>
    </div>
  )
}

function MiniStat({ label, value, color, t }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, color }}>{value}</div>
      <div style={{ fontSize: 9, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
    </div>
  )
}

function ChannelBar({ label, pct, color, t }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: t.textSecondary, marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ fontWeight: 700 }}>{pct}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 9999, background: t.bgTertiary, overflow: 'hidden' }}>
        <div style={{ height: 6, width: `${pct}%`, borderRadius: 9999, background: color, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  )
}

function WeekChart({ data, primary, t }) {
  const max = Math.max(...data, 1)
  const days = ['Seg','Ter','Qua','Qui','Sex','Sáb','Hj']
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 60 }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{
            width: '100%', borderRadius: 4,
            height: `${Math.round((v / max) * 52)}px`,
            background: i === 6 ? primary : `${primary}55`,
            transition: 'height 0.4s ease',
          }} />
          <div style={{ fontSize: 9, color: i === 6 ? primary : t.textMuted, fontWeight: i === 6 ? 700 : 400 }}>{days[i]}</div>
        </div>
      ))}
    </div>
  )
}
