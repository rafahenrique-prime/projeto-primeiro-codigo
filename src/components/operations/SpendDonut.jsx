import { useTheme } from '../../theme.jsx'

export default function SpendDonut({ total = 0, slices = [] }) {
  const { theme: t } = useTheme()
  const R = 40, C = 2 * Math.PI * R
  let offset = 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', width: 110, height: 110, flexShrink: 0 }}>
        <svg width="110" height="110" viewBox="0 0 110 110">
          <circle cx="55" cy="55" r={R} fill="none" stroke={t.bgTertiary} strokeWidth="14" />
          {slices.map((s, i) => {
            const frac = total > 0 ? s.value / total : 0
            const dash = frac * C
            const circle = (
              <circle
                key={i}
                cx="55" cy="55" r={R} fill="none"
                stroke={s.color} strokeWidth="14"
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 55 55)"
              />
            )
            offset += dash
            return circle
          })}
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>US$ {total.toFixed(2)}</span>
          <span style={{ fontSize: 9, color: t.textMuted }}>Total</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 140 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: t.textSecondary }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
              {s.label}
            </span>
            <span style={{ fontWeight: 700, color: t.text }}>US$ {s.value.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
