import { useTheme } from '../../theme.jsx'
import { StatusDot } from './StatusBadge.jsx'

// summaryLabel é texto livre (nunca uma % de uptime histórico inventada) —
// reflete só a contagem real de serviços monitorados online agora mesmo.
export default function HealthCheckPanel({ summaryLabel, checks = [] }) {
  const { theme: t } = useTheme()
  return (
    <div style={{
      background: t.bg, border: `1px solid ${t.border}`, borderRadius: 14,
      padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12,
      boxShadow: '0 1px 2px rgba(16,24,40,0.03)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: t.text }}>Health Check</span>
        {summaryLabel && <span style={{ fontSize: 12, color: '#10B981', fontWeight: 700 }}>{summaryLabel}</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {checks.map((c, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontSize: 12.5, padding: '8px 10px', borderRadius: 8, background: t.bgSecondary,
          }}>
            <span style={{ color: t.text, fontWeight: 600 }}>{c.label}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: t.textMuted, fontSize: 11 }}>{c.detail}</span>
              <StatusDot status={c.status} />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
