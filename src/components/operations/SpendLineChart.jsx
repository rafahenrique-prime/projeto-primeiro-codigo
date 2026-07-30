import { useTheme } from '../../theme.jsx'

// Mesmo padrão de gráfico leve em SVG usado em RelatoriosPage.jsx (sem libs externas)
export default function SpendLineChart({ points = [] }) {
  const { theme: t } = useTheme()
  if (!points.length) return <div style={{ color: t.textMuted, fontSize: 12 }}>Sem dados</div>

  const values = points.map(p => p.value || 0)
  const max = Math.max(...values, 1)
  const W = 100, H = 60
  const pts = values.map((v, i) => `${(i / (values.length - 1 || 1)) * W},${H - (v / max) * H}`)
  const poly = pts.join(' ')
  const area = `0,${H} ${poly} ${W},${H}`

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 140, overflow: 'visible' }}>
        <defs>
          <linearGradient id="opsSpendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#7C3AED" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#opsSpendGrad)" />
        <polyline points={poly} fill="none" stroke="#7C3AED" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {values.map((v, i) => (
          <circle key={i} cx={(i / (values.length - 1 || 1)) * W} cy={H - (v / max) * H} r="1.6" fill="#7C3AED" />
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        {points.map((p, i) => (
          <span key={i} style={{ fontSize: 10, color: t.textMuted }}>{p.date}</span>
        ))}
      </div>
    </div>
  )
}
