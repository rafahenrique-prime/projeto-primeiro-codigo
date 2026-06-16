import { useTheme } from '../theme.jsx'

const workItems = [
  { id: 'inbox',     label: 'Mensagem',    badge: true },
  { id: 'agents',    label: 'Agentes' },
  { id: 'channels',  label: 'Canais' },
]
const intelItems = [
  { id: 'knowledge', label: 'Conhecimento' },
  { id: 'contacts',  label: 'Contatos' },
]

const ICONS = {
  inbox:     <Msg />,
  agents:    <Ag />,
  channels:  <Ch />,
  knowledge: <Kn />,
  contacts:  <Co />,
  dealonca:  <Da />,
}

export default function LeftNav({ page, setPage, unreadCount = 0 }) {
  const { theme: t, dark, toggle } = useTheme()

  return (
    <div style={{ width: 210, background: t.navBg, display: 'flex', flexDirection: 'column', flexShrink: 0, borderRight: `1px solid ${t.border}`, padding: '0 0 12px 0', transition: 'background 0.2s' }}>

      {/* Logo */}
      <div style={{ height: 56, display: 'flex', alignItems: 'center', padding: '0 18px', borderBottom: `1px solid ${t.border}`, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 28, height: 28, background: '#0EC331', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: 15, color: t.text, letterSpacing: '-0.3px' }}>
            IGNITE <span style={{ color: '#0EC331' }}>PRIME</span>
          </span>
        </div>
        <button onClick={toggle} title={dark ? 'Tema claro' : 'Tema escuro'} style={{
          background: t.bgTertiary, border: `1px solid ${t.border}`, borderRadius: 8,
          width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', fontSize: 14, transition: 'background 0.15s',
        }}>
          {dark ? '☀️' : '🌙'}
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '10px 10px 0' }}>

        {/* DealOnça */}
        <button onClick={() => setPage('dealonca')} style={{
          width: '100%', background: page === 'dealonca' ? '#0EC331' : '#EFFDF4',
          color: page === 'dealonca' ? '#fff' : '#0A7A1E',
          borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 600,
          border: 'none', marginBottom: 14, textAlign: 'left', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 16 }}>🐆</span> DealOnça
        </button>

        <Label color={t.textMuted}>Espaço de Trabalho</Label>
        {workItems.map(item => (
          <Item key={item.id} item={item} active={page === item.id} onClick={() => setPage(item.id)}
            badge={item.badge ? unreadCount : 0} t={t} />
        ))}

        <Label color={t.textMuted} style={{ marginTop: 16 }}>Inteligência</Label>
        {intelItems.map(item => (
          <Item key={item.id} item={item} active={page === item.id} onClick={() => setPage(item.id)} badge={0} t={t} />
        ))}

        <div style={{ flex: 1 }} />

        <Label color={t.textMuted}>Sistema</Label>
        <Item item={{ id: 'reports', label: 'Dashboards' }} active={page === 'reports'} onClick={() => setPage('reports')} badge={0} t={t} />
      </div>

      {/* User */}
      <div style={{ margin: '8px 10px 0', padding: '10px 8px', borderTop: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#0EC331', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>R</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>Rafael</div>
          <div style={{ fontSize: 11, color: t.textMuted }}>PRIME STORE</div>
        </div>
      </div>
    </div>
  )
}

function Label({ children, color, style }) {
  return <div style={{ fontSize: 10, color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', padding: '4px 8px 6px', ...style }}>{children}</div>
}

function Item({ item, active, onClick, badge = 0, t }) {
  return (
    <div onClick={onClick} style={{
      height: 40, padding: '0 10px', borderRadius: 8, marginBottom: 2,
      display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
      background: active ? '#F0FDF4' : 'transparent',
      color: active ? '#0EC331' : t.textSecondary,
      fontSize: 13, fontWeight: active ? 600 : 400,
      transition: 'background 0.1s',
    }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.background = t.bgTertiary }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      <span style={{ width: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', color: active ? '#0EC331' : t.textMid }}>
        {ICONS[item.id] || <Dot />}
      </span>
      {item.label}
      {badge > 0 && (
        <span style={{ marginLeft: 'auto', background: '#FEF08A', color: '#713F12', fontSize: 10, fontWeight: 700, borderRadius: 9999, padding: '1px 7px', minWidth: 18, textAlign: 'center' }}>{badge}</span>
      )}
    </div>
  )
}

// Icons
function Msg() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> }
function Ag()  { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg> }
function Ch()  { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> }
function Kn()  { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> }
function Co()  { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> }
function Da()  { return <span>🐆</span> }
function Dot() { return <svg width="6" height="6" viewBox="0 0 6 6"><circle cx="3" cy="3" r="3" fill="currentColor"/></svg> }
