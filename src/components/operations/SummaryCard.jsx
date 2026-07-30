import { useTheme } from '../../theme.jsx'
import { TrendBadge } from './StatusBadge.jsx'

export default function SummaryCard({ icon, label, value, trend, accent = '#7C3AED' }) {
  const { theme: t } = useTheme()
  return (
    <div style={{
      background: t.bg, border: `1px solid ${t.border}`, borderRadius: 14,
      padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0,
      boxShadow: '0 1px 2px rgba(16,24,40,0.03)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 30, height: 30, borderRadius: 9, background: `${accent}1a`, color: accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0,
        }}>{icon}</span>
        <span style={{ fontSize: 12, color: t.textMuted, fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: t.text, lineHeight: 1.1 }}>{value}</div>
      <TrendBadge trend={trend} />
    </div>
  )
}
