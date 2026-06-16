export default function Sidebar({ page, setPage }) {
  const items = [
    { id: 'inbox', icon: '💬', label: 'Inbox', dot: true },
    { id: 'contacts', icon: '👥', label: 'Contatos' },
    { id: 'reports', icon: '📊', label: 'Relatórios' },
    { id: 'campaigns', icon: '📣', label: 'Campanhas' },
  ]
  const bottom = [
    { id: 'channels', icon: '🔗', label: 'Canais' },
    { id: 'settings', icon: '⚙️', label: 'Configurações' },
  ]

  return (
    <div style={{ width: 64, background: '#18181b', borderRight: '1px solid #27272a', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0', gap: 4, flexShrink: 0 }}>
      {items.map(item => (
        <NavItem key={item.id} item={item} active={page === item.id} onClick={() => setPage(item.id)} />
      ))}
      <div style={{ flex: 1 }} />
      {bottom.map(item => (
        <NavItem key={item.id} item={item} active={page === item.id} onClick={() => setPage(item.id)} />
      ))}
    </div>
  )
}

function NavItem({ item, active, onClick }) {
  return (
    <div
      onClick={onClick}
      title={item.label}
      style={{
        width: 40, height: 40, borderRadius: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', fontSize: 18, position: 'relative',
        background: active ? '#6366f1' : 'transparent',
        color: active ? '#fff' : '#71717a',
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#27272a' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      {item.icon}
      {item.dot && !active && (
        <div style={{ position: 'absolute', top: 6, right: 6, width: 7, height: 7, background: '#ef4444', borderRadius: '50%', border: '1.5px solid #18181b' }} />
      )}
    </div>
  )
}
