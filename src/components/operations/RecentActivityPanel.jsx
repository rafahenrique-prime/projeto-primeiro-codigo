import { useTheme } from '../../theme.jsx'

const KIND_ICON = { ia: '🤖', deploy: '🚀', sync: '🔄', alert: '⚠️' }

export default function RecentActivityPanel({ items = [] }) {
  const { theme: t } = useTheme()
  return (
    <div style={{
      background: t.bg, border: `1px solid ${t.border}`, borderRadius: 14,
      padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12,
      boxShadow: '0 1px 2px rgba(16,24,40,0.03)',
    }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: t.text }}>Atividade recente</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map(item => (
          <div key={item.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px',
            borderBottom: `1px solid ${t.borderLight}`, fontSize: 12.5,
          }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>{KIND_ICON[item.kind] || '•'}</span>
            <span style={{ color: t.textSecondary, flex: 1 }}>{item.label}</span>
            <span style={{ color: t.textMuted, fontSize: 11, whiteSpace: 'nowrap' }}>{item.time}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
