import { useTheme } from '../../theme.jsx'

// Estados de disponibilidade do serviço (não confundir com dataSource)
const STATUS_MAP = {
  online:       { color: '#10B981', label: 'Online' },
  atencao:      { color: '#F59E0B', label: 'Atenção' },
  offline:      { color: '#EF4444', label: 'Offline' },
  indisponivel: { color: '#94A3B8', label: 'Indisponível' },
  verificando:  { color: '#6366F1', label: 'Verificando...' },
}

export function StatusDot({ status }) {
  const s = STATUS_MAP[status] || STATUS_MAP.indisponivel
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: s.color }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
      {s.label}
    </span>
  )
}

// Selo discreto de origem do dado — nunca deixa um mock passar por real
const SOURCE_MAP = {
  real:    { label: 'Dado real', bg: '#ECFDF5', color: '#059669' },
  mock:    { label: 'Mock — aguardando integração', bg: '#FEF3C7', color: '#B45309' },
  manual:  { label: 'Atualização manual', bg: '#EFF6FF', color: '#2563EB' },
  loading: { label: 'Verificando...', bg: '#EEF2FF', color: '#4F46E5' },
}

export function DataSourceBadge({ dataSource }) {
  const s = SOURCE_MAP[dataSource] || SOURCE_MAP.mock
  return (
    <span style={{
      fontSize: 9.5, fontWeight: 700, color: s.color, background: s.bg,
      borderRadius: 5, padding: '2px 6px', letterSpacing: '0.2px', whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  )
}

export function TrendBadge({ trend }) {
  const { theme: t } = useTheme()
  if (trend === null || trend === undefined) return null
  const up = trend >= 0
  const color = up ? '#10B981' : '#EF4444'
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {up ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
    </span>
  )
}
