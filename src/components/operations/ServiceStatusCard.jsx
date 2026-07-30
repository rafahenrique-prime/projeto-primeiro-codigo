import { useTheme } from '../../theme.jsx'
import { StatusDot, DataSourceBadge, TrendBadge } from './StatusBadge.jsx'

// Componente de apresentação puro — não conhece OpenRouter, Vercel, Supabase, etc.
// Recebe só a forma normalizada: { provider, status, metrics, lastUpdated, dataSource, message }
export default function ServiceStatusCard({ service }) {
  const { theme: t } = useTheme()
  const { provider, status, metrics = [], dataSource, message } = service

  return (
    <div style={{
      background: t.bg, border: `1px solid ${t.border}`, borderRadius: 14,
      padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0,
      boxShadow: '0 1px 2px rgba(16,24,40,0.03)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{provider}</span>
        <StatusDot status={status} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {metrics.map((m, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: t.textMuted }}>{m.label}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 700, color: t.text }}>{m.value}</span>
              <TrendBadge trend={m.trend} />
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 8, borderTop: `1px solid ${t.borderLight}` }}>
        <DataSourceBadge dataSource={dataSource} />
        {message && <span style={{ fontSize: 10, color: t.textMuted, textAlign: 'right' }}>{message}</span>}
      </div>
    </div>
  )
}
