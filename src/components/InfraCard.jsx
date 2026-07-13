import { useTheme } from '../theme.jsx'

export function ProgressRow({ icon, label, valueLabel, percent, barColor = '#059669' }) {
  const { theme: t } = useTheme()
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 15 }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{label}</span>
      </div>
      <div style={{ fontSize: 11, color: t.textMuted, display: 'flex', justifyContent: 'space-between' }}>
        <span>{valueLabel}</span>
        {percent != null && <span style={{ fontWeight: 700, color: barColor }}>{percent}%</span>}
      </div>
      {percent != null && (
        <div style={{ height: 4, background: t.bgTertiary, borderRadius: 3, marginTop: 5 }}>
          <div style={{ width: `${Math.min(percent, 100)}%`, height: '100%', background: `linear-gradient(90deg, ${barColor}99, ${barColor})`, borderRadius: 3 }} />
        </div>
      )}
    </div>
  )
}

export default function InfraCard({ children, accent = false, style = {} }) {
  const { theme: t } = useTheme()
  return (
    <div style={{
      background: t.bg,
      borderRadius: 16,
      border: `1px solid ${accent ? '#FBD5D5' : t.border}`,
      padding: '18px 20px',
      boxShadow: '0 1px 2px rgba(16,24,40,0.03), 0 8px 20px -12px rgba(16,24,40,0.08)',
      ...style,
    }}>
      {children}
    </div>
  )
}
