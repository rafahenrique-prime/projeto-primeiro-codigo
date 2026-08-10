// Badge visual do status de sincronização do Catálogo V1 — mesmo padrão de
// pill já usado em src/components/operations/StatusBadge.jsx (DataSourceBadge):
// inline style, bg claro + texto colorido, sem framework novo.

const SEVERITY_COLORS = {
  success: { bg: '#ECFDF5', color: '#059669' },
  warning: { bg: '#FEF3C7', color: '#B45309' },
  error:   { bg: '#FEE2E2', color: '#DC2626' },
  neutral: { bg: '#EFF6FF', color: '#2563EB' },
}

const STATUS_ICON = {
  synced: '🟢',
  manual: '🔵',
  exception: '🟡',
  not_found: '🔴',
  conflict: '⚠️',
}

/**
 * @param {{status: {status: string, label: string, severity: string, reason: string}}} props
 */
export default function SyncStatusBadge({ status }) {
  if (!status) return null
  const cores = SEVERITY_COLORS[status.severity] || SEVERITY_COLORS.neutral
  const icone = STATUS_ICON[status.status] || ''
  return (
    <span
      title={status.reason}
      style={{
        fontSize: 9.5, fontWeight: 700, color: cores.color, background: cores.bg,
        borderRadius: 5, padding: '2px 6px', letterSpacing: '0.2px', whiteSpace: 'nowrap',
        display: 'inline-flex', alignItems: 'center', gap: 4,
      }}
    >
      <span aria-hidden="true">{icone}</span>
      {status.label}
    </span>
  )
}
