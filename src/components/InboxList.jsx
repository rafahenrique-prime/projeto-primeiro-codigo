import { useTheme } from '../theme.jsx'

export default function InboxList({ conversations, active, onSelect, filter, setFilter }) {
  const { theme: t } = useTheme()

  return (
    <div style={{ width: 300, background: t.bg, borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      {/* Header */}
      <div style={{ padding: '16px 14px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: t.text }}>Mensagens</div>
          <span style={{ background: t.bgTertiary, color: t.textMid, fontSize: 11, fontWeight: 600, borderRadius: 9999, padding: '2px 8px' }}>{conversations.length}</span>
        </div>
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            style={{ width: '100%', background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '7px 12px 7px 30px', fontSize: 13, color: t.textSecondary, outline: 'none', boxSizing: 'border-box' }}
            placeholder="Buscar conversa..."
            readOnly
          />
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[['all','Todos'],['unread','Não lidas'],['wa','WhatsApp'],['ig','Instagram']].map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)} style={{
              fontSize: 11, padding: '4px 11px', borderRadius: 9999, border: 'none', cursor: 'pointer',
              background: filter === k ? '#0EC331' : t.bgTertiary,
              color: filter === k ? '#fff' : t.textMid,
              fontWeight: filter === k ? 700 : 500,
              transition: 'all 0.12s',
            }}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{ height: 1, background: t.border }} />

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {conversations.map(conv => (
          <ConvItem key={conv.id} conv={conv} isActive={active?.id === conv.id} onClick={() => onSelect(conv)} t={t} />
        ))}
      </div>
    </div>
  )
}

function ConvItem({ conv, isActive, onClick, t }) {
  const progress = conv.objective_progress || 0
  const isWa = conv.channel === 'whatsapp'

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', cursor: 'pointer',
        background: isActive ? '#F0FDF4' : 'transparent',
        borderLeft: isActive ? '3px solid #0EC331' : '3px solid transparent',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = t.bgSecondary }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
    >
      {/* Avatar */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: `conic-gradient(#0EC331 ${progress * 3.6}deg, ${t.borderLight} ${progress * 3.6}deg)`,
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
          background: isWa ? '#25D366' : '#E1306C',
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
          <span style={{
            fontSize: 10, fontWeight: 600, color: conv.mode === 'copilot' ? '#6366F1' : '#0EC331',
            background: conv.mode === 'copilot' ? '#EEF2FF' : '#F0FDF4',
            borderRadius: 4, padding: '1px 6px',
          }}>{conv.mode === 'copilot' ? 'Copilot' : 'AutoPilot'}</span>
          {conv.unread > 0 && (
            <span style={{ background: '#0EC331', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 9999, minWidth: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>{conv.unread}</span>
          )}
        </div>
      </div>
    </div>
  )
}
