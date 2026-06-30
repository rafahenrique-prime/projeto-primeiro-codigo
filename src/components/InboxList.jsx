import { useTheme } from '../theme.jsx'

function timeSince(rawTime) {
  if (!rawTime) return null
  const diff = Math.floor((Date.now() - new Date(rawTime).getTime()) / 1000 / 60)
  if (diff < 1) return 'agora'
  if (diff < 60) return `${diff}m`
  const h = Math.floor(diff / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

const IG_COLORS = ['#E1306C', '#4F8EF7']

function igColorMap(conversations) {
  const map = {}
  let idx = 0
  for (const c of conversations) {
    const key = c.igChannelId || c.channelId
    if (c.channel === 'instagram' && key && !(key in map)) {
      map[key] = IG_COLORS[idx % IG_COLORS.length]
      idx++
    }
  }
  return map
}

export default function InboxList({ conversations, allConversations, active, onSelect, filter, setFilter, search, setSearch, botSleep, sleepLoading, onToggleSleep, profilesMap = {} }) {
  const { theme: t } = useTheme()
  const igColors = igColorMap(allConversations || conversations)
  const humanCount = (allConversations || conversations).filter(c => c.mode === 'copilot' && c.unread > 0).length

  return (
    <div style={{ width: 300, background: t.bg, borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      {/* Header */}
      <div style={{ padding: '16px 14px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 16, color: t.text, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            <span style={{ color: t.primary || '#E8192C' }}>/// </span>INBOX — RECENTES
          </div>
          <span style={{ background: t.bgTertiary, color: t.textMid, fontSize: 11, fontWeight: 600, borderRadius: 9999, padding: '2px 8px' }}>{conversations.length}</span>
        </div>
        <div style={{ position: 'relative', marginBottom: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '7px 12px 7px 30px', fontSize: 13, color: t.text, outline: 'none', boxSizing: 'border-box' }}
            placeholder="Buscar conversa..."
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted, fontSize: 14, lineHeight: 1 }}>×</button>
          )}
          <button
            onClick={onToggleSleep}
            disabled={sleepLoading}
            title={sleepLoading ? 'Aguarde...' : botSleep ? 'Bot dormindo — clique para acordar' : 'Bot ativo — clique para dormir'}
            style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 8, border: `1.5px solid ${botSleep ? '#F59E0B' : t.border}`, background: botSleep ? '#FFFBEB' : t.bgTertiary, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: sleepLoading ? 'wait' : 'pointer', transition: 'all 0.15s', opacity: sleepLoading ? 0.6 : 1 }}
          >
            {sleepLoading ? <span style={{ fontSize: 14 }}>⏳</span> : <SparkIcon asleep={botSleep} />}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {humanCount > 0 && (
            <button onClick={() => setFilter(filter === 'human' ? 'all' : 'human')} style={{
              fontSize: 11, padding: '4px 11px', borderRadius: 9999, border: 'none', cursor: 'pointer',
              background: filter === 'human' ? '#DC2626' : '#FEE2E2',
              color: filter === 'human' ? '#fff' : '#DC2626',
              fontWeight: 700, transition: 'all 0.12s',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              🚨 Humano
              <span style={{ background: filter === 'human' ? 'rgba(255,255,255,0.3)' : '#DC2626', color: '#fff', borderRadius: 9999, fontSize: 10, fontWeight: 700, minWidth: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{humanCount}</span>
            </button>
          )}
          {[['all','Todos'],['meus','Meus'],['autoia','Auto-IA'],['unread','Não lidas'],['wa','WhatsApp']].map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)} style={{
              fontSize: 11, padding: '4px 11px', borderRadius: 9999, border: 'none', cursor: 'pointer',
              background: filter === k ? (t.primary || '#E8192C') : t.bgTertiary,
              color: filter === k ? '#fff' : t.textMid,
              fontWeight: filter === k ? 700 : 500,
              transition: 'all 0.12s',
            }}>{label}</button>
          ))}
          {Object.entries(igColors).map(([channelId, color], i) => {
            const key = `ig:${channelId}`
            const isActive = filter === key
            return (
              <button key={key} onClick={() => setFilter(isActive ? 'all' : key)} style={{
                fontSize: 11, padding: '4px 11px', borderRadius: 9999, border: `1.5px solid ${isActive ? color : 'transparent'}`,
                cursor: 'pointer', background: isActive ? color : t.bgTertiary,
                color: isActive ? '#fff' : t.textMid,
                fontWeight: isActive ? 700 : 500, transition: 'all 0.12s',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <IgIcon color={isActive ? '#fff' : color} />
                {i + 1}
              </button>
            )
          })}
          <button onClick={() => setFilter(filter === 'ig' ? 'all' : 'ig')} style={{
            fontSize: 11, padding: '4px 11px', borderRadius: 9999, border: 'none', cursor: 'pointer',
            background: filter === 'ig' ? '#E1306C' : t.bgTertiary,
            color: filter === 'ig' ? '#fff' : t.textMid,
            fontWeight: filter === 'ig' ? 700 : 500, transition: 'all 0.12s',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <IgIcon color={filter === 'ig' ? '#fff' : '#E1306C'} />
            Instagram
          </button>
        </div>
      </div>

      <div style={{ height: 1, background: t.border }} />

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {conversations.length === 0
          ? <div style={{ textAlign: 'center', color: t.textMuted, fontSize: 13, marginTop: 40 }}>Nenhuma conversa encontrada</div>
          : conversations.map(conv => (
            <ConvItem key={conv.id} conv={conv} isActive={active?.id === conv.id} onClick={() => onSelect(conv)} t={t} igColors={igColors} buyScore={profilesMap[conv.id]?.buy_score} />
          ))
        }
      </div>
    </div>
  )
}

function ConvItem({ conv, isActive, onClick, t, igColors = {}, buyScore }) {
  const progress = conv.objective_progress || 0
  const isWa = conv.channel === 'whatsapp'
  const igBadgeColor = igColors[conv.igChannelId || conv.channelId] || '#E1306C'
  const ringColor = isWa ? '#0EC331' : igBadgeColor
  const waitTime = conv.unread > 0 ? timeSince(conv.rawTime) : null
  const isLong = waitTime && !['agora','1m','2m','3m','4m','5m'].includes(waitTime)
  const needsHuman = conv.mode === 'copilot' && conv.unread > 0

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', cursor: 'pointer',
        background: isActive ? (t.primaryBg || '#fff5f5') : needsHuman ? '#FFF5F5' : 'transparent',
        borderLeft: isActive ? `3px solid ${t.primary || '#E8192C'}` : needsHuman ? '3px solid #DC2626' : '3px solid transparent',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = needsHuman ? '#FEE2E2' : t.bgSecondary }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = needsHuman ? '#FFF5F5' : 'transparent' }}
    >
      {/* Avatar */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: `conic-gradient(${ringColor} ${progress * 3.6}deg, ${t.borderLight} ${progress * 3.6}deg)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {conv.picture
            ? <img src={conv.picture} alt="" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover' }} onError={e => e.target.style.display='none'} />
            : <div style={{ width: 38, height: 38, borderRadius: '50%', background: conv.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff' }}>{conv.initials}</div>
          }
        </div>
        <div style={{
          position: 'absolute', bottom: -1, right: -1,
          width: 16, height: 16, borderRadius: '50%',
          background: isWa ? '#25D366' : igBadgeColor,
          border: `2px solid ${t.bg}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {isWa
            ? <svg width="8" height="8" viewBox="0 0 24 24" fill="#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            : <svg width="8" height="8" viewBox="0 0 24 24" fill="#fff"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" fill="#E1306C"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" stroke="#fff" strokeWidth="2"/></svg>
          }
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{conv.name}</div>
          <div style={{ fontSize: 11, color: t.textMuted, flexShrink: 0, marginLeft: 4 }}>{conv.time}</div>
        </div>
        <div style={{ fontSize: 12, color: t.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>{conv.lastMsg || 'Sem mensagens'}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {needsHuman
            ? <span style={{ fontSize: 10, fontWeight: 700, color: '#DC2626', background: '#FEE2E2', borderRadius: 4, padding: '1px 6px', display: 'flex', alignItems: 'center', gap: 3 }}>🚨 Aguardando</span>
            : <span style={{ fontSize: 10, fontWeight: 600, color: conv.mode === 'copilot' ? '#6366F1' : '#00A84F', background: conv.mode === 'copilot' ? '#EEF2FF' : '#F0FDF4', borderRadius: 4, padding: '1px 6px' }}>{conv.mode === 'copilot' ? 'Copilot' : 'AutoPilot'}</span>
          }
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {buyScore >= 70 && (
              <span title="Score de conversão" style={{ fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '1px 5px', background: '#FEF2F2', color: '#E8192C' }}>🔥 {buyScore}</span>
            )}
            {waitTime && (
              <span style={{
                fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '1px 5px',
                background: isLong ? '#FEE2E2' : '#FEF3C7',
                color: isLong ? '#DC2626' : '#D97706',
              }}>⏱ {waitTime}</span>
            )}
            {conv.unread > 0 && (
              <span style={{ background: t.primary || '#E8192C', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 9999, minWidth: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>{conv.unread}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function SparkIcon({ asleep }) {
  if (asleep) return <span style={{ fontSize: 18, lineHeight: 1 }}>😴</span>
  return (
    <svg width="22" height="22" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="20" r="18" fill="#FDE68A" stroke="#F59E0B" strokeWidth="1.5"/>
      <text x="14" y="22" fontSize="11" textAnchor="middle" fill="#16A34A" fontWeight="bold">$</text>
      <text x="26" y="22" fontSize="11" textAnchor="middle" fill="#16A34A" fontWeight="bold">$</text>
      <path d="M12 28 Q20 35 28 28" stroke="#1C1917" strokeWidth="2.2" strokeLinecap="round" fill="#FDE68A"/>
    </svg>
  )
}

function IgIcon({ color = '#E1306C' }) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" fill={color}/>
      <circle cx="12" cy="12" r="4" fill="none" stroke="white" strokeWidth="2.5"/>
      <circle cx="17.5" cy="6.5" r="1.3" fill="white"/>
    </svg>
  )
}
