import { useState } from 'react'
import { useTheme } from '../theme.jsx'

const workItems = [
  { id: 'inbox',    label: 'Mensagem',   badge: true },
  { id: 'agents',   label: 'Agentes' },
  { id: 'channels', label: 'Canais' },
  { id: 'catalogo', label: '📦 Catálogo', badge: false },
  { id: 'importar', label: '🔗 Importar', badge: false },
  { id: 'importar-backup', label: '📥 Backup', badge: false },
  { id: 'extrator', label: '🔨 Extrator', badge: false },
]
const intelItems = [
  { id: 'knowledge', label: 'Conhecimento' },
  { id: 'contacts',  label: 'Contatos' },
  { id: 'photo',     label: '📸 Fotos' },
  { id: 'lab',       label: '🧪 Lab IA' },
  { id: 'relatorios', label: 'Relatórios' },
]

function getIcon(id) {
  switch(id) {
    case 'inbox':      return <Msg />
    case 'agents':     return <Ag />
    case 'channels':   return <Ch />
    case 'knowledge':  return <Kn />
    case 'contacts':   return <Co />
    case 'dealonca':   return <Da />
    case 'relatorios': return <Rep />
    case 'simulador':  return <Sim />
    case 'catalogo':   return <Cat />
    case 'importar':   return <Imp />
    case 'importar-backup': return <Bak />
    case 'photo':      return <Pho />
    case 'extrator':   return <Ext />
    default:           return <Dot />
  }
}

export default function LeftNav({ page, setPage, unreadCount = 0 }) {
  const { theme: t, dark, toggle } = useTheme()
  const [collapsed, setCollapsed] = useState(false)
  const w = collapsed ? 56 : 240

  return (
    <div style={{ width: w, minWidth: w, background: t.navBg, display: 'flex', flexDirection: 'column', flexShrink: 0, borderRight: `1px solid ${t.border}`, padding: '0 0 12px 0', transition: 'width 0.2s, min-width 0.2s, background 0.2s', overflow: 'hidden' }}>

      {/* Logo — fundo preto fixo */}
      <div style={{ background: dark ? '#1a1a1a' : '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, height: 72, position: 'relative', borderBottom: `1px solid ${t.border}` }}>
        {collapsed ? (
          /* Modo colapsado: só listras + botão expandir centralizado */
          <button onClick={() => setCollapsed(false)} title="Expandir menu" style={{
            width: '100%', height: '100%', background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 0,
          }}>
            <svg width="24" height="36" viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg">
              <polygon points="0,2 8,2 6,34 -2,34" fill="#E8192C"/>
              <polygon points="10,2 17,2 15,34 8,34" fill="#E8192C"/>
              <polygon points="19,2 26,2 24,34 17,34" fill="#E8192C"/>
            </svg>
          </button>
        ) : (
          /* Modo expandido: logo completa */
          <>
            <img src={dark ? '/logo-prime-dark.png' : '/logo-prime.png'} alt="PRIME STORE" title="Página inicial" onClick={() => { setPage('inbox'); window.location.reload() }} style={{ width: 'calc(80% - 36px)', height: 'auto', display: 'block', marginLeft: 12, cursor: 'pointer' }} />
            <button onClick={() => setCollapsed(true)} title="Recolher menu" style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
              width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#E8192C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
          </>
        )}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: collapsed ? '10px 6px 0' : '10px 10px 0', overflowY: 'auto', overflowX: 'hidden' }}>

        {/* Dashboard */}
        <button onClick={() => setPage('dashboard')} title={collapsed ? 'Dashboard' : ''} style={{
          width: '100%',
          background: page === 'dashboard' ? '#E8192C' : (dark ? 'rgba(232,25,44,0.1)' : '#fff5f5'),
          color: page === 'dashboard' ? '#fff' : '#E8192C',
          borderRadius: 10, padding: collapsed ? '10px 0' : '10px 12px', fontSize: 13, fontWeight: 700,
          border: `1px solid ${page === 'dashboard' ? 'transparent' : (dark ? 'rgba(232,25,44,0.2)' : '#ffd0d5')}`,
          marginBottom: 8, textAlign: 'left', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 8,
          fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.3px',
        }}>
          <DashIcon active={page === 'dashboard'} />
          {!collapsed && 'Dashboard'}
        </button>

        {/* CODEX */}
        <button onClick={() => setPage('dealonca')} title={collapsed ? 'CODEX' : ''} style={{
          width: '100%',
          background: page === 'dealonca' ? '#7C3AED' : (dark ? 'rgba(124,58,237,0.12)' : '#F5F3FF'),
          color: page === 'dealonca' ? '#fff' : '#7C3AED',
          borderRadius: 10, padding: collapsed ? '10px 0' : '10px 12px', fontSize: 13, fontWeight: 700,
          border: `1px solid ${page === 'dealonca' ? 'transparent' : (dark ? 'rgba(124,58,237,0.25)' : '#DDD6FE')}`,
          marginBottom: 14, textAlign: 'left', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 8,
          fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.3px',
        }}>
          <CodexNavIcon size={20} active={page === 'dealonca'} />
          {!collapsed && 'CODEX'}
        </button>

        {/* Follow-up */}
        <button onClick={() => setPage('followup')} title={collapsed ? 'Follow-up' : ''} style={{
          width: '100%',
          background: page === 'followup' ? '#059669' : (dark ? 'rgba(5,150,105,0.12)' : '#ECFDF5'),
          color: page === 'followup' ? '#fff' : '#059669',
          borderRadius: 10, padding: collapsed ? '10px 0' : '10px 12px', fontSize: 13, fontWeight: 700,
          border: `1px solid ${page === 'followup' ? 'transparent' : (dark ? 'rgba(5,150,105,0.25)' : '#A7F3D0')}`,
          marginBottom: 14, textAlign: 'left', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 8,
          fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.3px',
        }}>
          <span style={{ fontSize: 18 }}>📬</span>
          {!collapsed && 'Follow-up'}
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
  const primary = t.primary || '#E8192C'
  const primaryBg = t.primaryBg || '#fff5f5'
  return (
    <div onClick={onClick} title={collapsed ? item.label : ''} style={{
      height: 40, padding: collapsed ? '0' : '0 10px', borderRadius: collapsed ? 8 : 6, marginBottom: 2,
      display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 10, cursor: 'pointer',
      background: active ? primaryBg : 'transparent',
      color: active ? primary : t.textSecondary,
      fontSize: 13, fontWeight: active ? 600 : 400,
      borderLeft: !collapsed ? `2px solid ${active ? primary : 'transparent'}` : 'none',
      transition: 'background 0.1s', position: 'relative',
    }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.background = t.bgTertiary }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      <span style={{ position: 'relative', width: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', color: active ? primary : t.textMid, flexShrink: 0 }}>
        {getIcon(item.id)}
        {collapsed && badge > 0 && (
          <span style={{
            position: 'absolute', top: -6, right: -8,
            background: primary, color: '#fff',
            fontSize: 9, fontWeight: 800, lineHeight: 1,
            borderRadius: 9999, minWidth: 16, height: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px', border: '2px solid #fff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }}>{badge > 99 ? '99+' : badge}</span>
        )}
      </span>
      {!collapsed && item.label}
      {!collapsed && badge > 0 && (
        <span style={{
          marginLeft: 'auto',
          background: primary, color: '#fff',
          fontSize: 11, fontWeight: 800, lineHeight: 1,
          borderRadius: 9999, minWidth: 20, height: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 6px', boxShadow: `0 0 0 3px ${primaryBg}`,
          animation: badge > 0 ? 'badgePop 0.3s ease' : 'none',
        }}>{badge > 99 ? '99+' : badge}</span>
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
function Da()  { return <CodexNavIcon size={15} /> }
function CodexNavIcon({ size = 20, active = false }) {
  const c = active ? '#fff' : '#7C3AED'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/>
      <path d="M12 2v20"/>
      <path d="M2 8.5l10 7 10-7"/>
    </svg>
  )
}
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
function Rep()  { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> }
function Sim()  { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/><path d="M11 8v6"/><path d="M8 11h6"/></svg> }
function Cat()  { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6-6 6 6M3 9h18v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z"/><rect x="5" y="12" width="4" height="4"/><rect x="15" y="12" width="4" height="4"/></svg> }
function Imp()  { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0l-4-4m4 4l4-4M3 19h18a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2v0a2 2 0 0 1 2-2z"/></svg> }
function Bak()  { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><path d="M19.07 4.93l-2.58 2.58A8 8 0 1 0 12 2c2.12 0 4.07.78 5.55 2.05"/><polyline points="13 2 19.07 2 19.07 8.07"/></svg> }
function Pho()  { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> }
function Ext()  { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 1 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg> }
function Dot() { return <svg width="6" height="6" viewBox="0 0 6 6"><circle cx="3" cy="3" r="3" fill="currentColor"/></svg> }
function DashIcon({ active }) {
  const c = active ? '#fff' : '#E8192C'
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
}

function PrimeStoreLogo({ collapsed }) {
  if (collapsed) {
    return (
      <svg width="32" height="32" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
        <polygon points="4,8 14,8 10,32 0,32" fill="#E8192C"/>
        <polygon points="15,8 23,8 19,32 11,32" fill="#E8192C"/>
        <polygon points="26,8 34,8 30,32 22,32" fill="#E8192C"/>
      </svg>
    )
  }
  return (
    <svg width="160" height="48" viewBox="0 0 200 48" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      {/* 3 listras diagonais */}
      <polygon points="4,6 18,6 13,42 -1,42" fill="#E8192C"/>
      <polygon points="21,6 33,6 28,42 16,42" fill="#E8192C"/>
      <polygon points="37,6 49,6 44,42 32,42" fill="#E8192C"/>
      {/* PRIME */}
      <text x="58" y="30" fontFamily="'Barlow Condensed', Arial Black, sans-serif" fontWeight="800" fontSize="28" fill="white" letterSpacing="1">PRIME</text>
      {/* STORE */}
      <text x="60" y="43" fontFamily="'Barlow Condensed', Arial, sans-serif" fontWeight="600" fontSize="11" fill="#E8192C" letterSpacing="5">STORE</text>
    </svg>
  )
}
