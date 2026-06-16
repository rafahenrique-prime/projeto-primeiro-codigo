import { useState } from 'react'
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
  const [collapsed, setCollapsed] = useState(false)
  const w = collapsed ? 56 : 210

  return (
    <div style={{ width: w, minWidth: w, background: t.navBg, display: 'flex', flexDirection: 'column', flexShrink: 0, borderRight: `1px solid ${t.border}`, padding: '0 0 12px 0', transition: 'width 0.2s, min-width 0.2s, background 0.2s', overflow: 'hidden' }}>

      {/* Logo */}
      <div style={{ height: 56, display: 'flex', alignItems: 'center', padding: collapsed ? '0 12px' : '0 10px 0 18px', borderBottom: `1px solid ${t.border}`, justifyContent: 'space-between', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <svg width="32" height="32" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shapeRendering="crispEdges" style={{ flexShrink: 0 }}>
            <rect x="4" y="4" width="8" height="6" fill="#E8714A"/>
            <rect x="2" y="5" width="2" height="3" fill="#E8714A"/>
            <rect x="12" y="5" width="2" height="3" fill="#E8714A"/>
            <rect x="5" y="6" width="2" height="2" fill="#1a1a1a"/>
            <rect x="9" y="6" width="2" height="2" fill="#1a1a1a"/>
            <rect x="5" y="10" width="2" height="3" fill="#E8714A"/>
            <rect x="9" y="10" width="2" height="3" fill="#E8714A"/>
          </svg>
          {!collapsed && (
            <span style={{ fontWeight: 700, fontSize: 15, color: t.text, letterSpacing: '-0.3px', whiteSpace: 'nowrap' }}>
              IGNITE <span style={{ color: '#0EC331' }}>PRIME</span>
            </span>
          )}
        </div>
        {!collapsed && (
          <button onClick={() => setCollapsed(true)} title="Recolher menu" style={{
            background: t.bgTertiary, border: `1px solid ${t.border}`, borderRadius: 8,
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'background 0.15s', flexShrink: 0,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.textMid} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
        )}
        {collapsed && (
          <button onClick={() => setCollapsed(false)} title="Expandir menu" style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.textMid} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        )}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: collapsed ? '10px 6px 0' : '10px 10px 0' }}>

        {/* Deal Claude */}
        <button onClick={() => setPage('dealonca')} title={collapsed ? 'Deal Claude' : ''} style={{
          width: '100%', background: page === 'dealonca' ? '#E8714A' : '#FEF3EE',
          color: page === 'dealonca' ? '#fff' : '#C05020',
          borderRadius: 10, padding: collapsed ? '10px 0' : '10px 12px', fontSize: 13, fontWeight: 600,
          border: 'none', marginBottom: 14, textAlign: 'left', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 8,
        }}>
          <ClawdIcon size={20} active={page === 'dealonca'} />
          {!collapsed && 'Deal Claude'}
        </button>

        {!collapsed && <Label color={t.textMuted}>Espaço de Trabalho</Label>}
        {collapsed && <div style={{ height: 6 }} />}
        {workItems.map(item => (
          <Item key={item.id} item={item} active={page === item.id} onClick={() => setPage(item.id)}
            badge={item.badge ? unreadCount : 0} t={t} collapsed={collapsed} />
        ))}

        {!collapsed && <Label color={t.textMuted} style={{ marginTop: 16 }}>Inteligência</Label>}
        {collapsed && <div style={{ height: 10 }} />}
        {intelItems.map(item => (
          <Item key={item.id} item={item} active={page === item.id} onClick={() => setPage(item.id)} badge={0} t={t} collapsed={collapsed} />
        ))}

        <div style={{ flex: 1 }} />

        {!collapsed && <Label color={t.textMuted}>Sistema</Label>}
        <Item item={{ id: 'reports', label: 'Dashboards' }} active={page === 'reports'} onClick={() => setPage('reports')} badge={0} t={t} collapsed={collapsed} />
      </div>

      {/* User */}
      <div style={{ margin: '8px 6px 0', padding: collapsed ? '10px 0' : '10px 8px', borderTop: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 8 }}>
        <div title={collapsed ? 'Rafael · PRIME STORE' : ''} style={{ width: 32, height: 32, borderRadius: '50%', background: '#0EC331', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>R</div>
        {!collapsed && (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>Rafael</div>
              <div style={{ fontSize: 11, color: t.textMuted }}>PRIME STORE</div>
            </div>
            <button onClick={toggle} title={dark ? 'Tema claro' : 'Tema escuro'} style={{
              background: t.bgTertiary, border: `1px solid ${t.border}`, borderRadius: 8,
              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: 14, transition: 'background 0.15s', flexShrink: 0,
            }}>{dark ? '☀️' : '🌙'}</button>
          </>
        )}
        {collapsed && (
          <button onClick={toggle} title={dark ? 'Tema claro' : 'Tema escuro'} style={{
            background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0,
          }}>{dark ? '☀️' : '🌙'}</button>
        )}
      </div>
    </div>
  )
}

function Label({ children, color, style }) {
  return <div style={{ fontSize: 10, color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', padding: '4px 8px 6px', ...style }}>{children}</div>
}

function Item({ item, active, onClick, badge = 0, t, collapsed = false }) {
  return (
    <div onClick={onClick} title={collapsed ? item.label : ''} style={{
      height: 40, padding: collapsed ? '0' : '0 10px', borderRadius: 8, marginBottom: 2,
      display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 10, cursor: 'pointer',
      background: active ? '#F0FDF4' : 'transparent',
      color: active ? '#0EC331' : t.textSecondary,
      fontSize: 13, fontWeight: active ? 600 : 400,
      transition: 'background 0.1s', position: 'relative',
    }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.background = t.bgTertiary }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      <span style={{ width: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', color: active ? '#0EC331' : t.textMid, flexShrink: 0 }}>
        {ICONS[item.id] || <Dot />}
      </span>
      {!collapsed && item.label}
      {!collapsed && badge > 0 && (
        <span style={{ marginLeft: 'auto', background: '#FEF08A', color: '#713F12', fontSize: 10, fontWeight: 700, borderRadius: 9999, padding: '1px 7px', minWidth: 18, textAlign: 'center' }}>{badge}</span>
      )}
      {collapsed && badge > 0 && (
        <span style={{ position: 'absolute', top: 4, right: 4, background: '#0EC331', width: 8, height: 8, borderRadius: '50%' }} />
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
function Da()  { return <ClawdIcon size={15} /> }
function ClawdIcon({ size = 20, active = false }) {
  const c = active ? '#fff' : '#E8714A'
  const s = Math.round(size * 16 / 20)
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shapeRendering="crispEdges" style={{ flexShrink: 0 }}>
      <rect x="4" y="4" width="8" height="6" fill={c}/>
      <rect x="2" y="5" width="2" height="3" fill={c}/>
      <rect x="12" y="5" width="2" height="3" fill={c}/>
      <rect x="5" y="6" width="2" height="2" fill={active ? '#E8714A' : '#fff'}/>
      <rect x="9" y="6" width="2" height="2" fill={active ? '#E8714A' : '#fff'}/>
      <rect x="5" y="10" width="2" height="3" fill={c}/>
      <rect x="9" y="10" width="2" height="3" fill={c}/>
    </svg>
  )
}
function Dot() { return <svg width="6" height="6" viewBox="0 0 6 6"><circle cx="3" cy="3" r="3" fill="currentColor"/></svg> }
