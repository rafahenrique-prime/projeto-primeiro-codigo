// Badge compacto de origem do produto — mesmo padrão visual de SyncStatusBadge/
// DataSourceBadge (pill inline-style). bagy_product_id é o sinal principal
// (nunca `source` sozinho); `source` só entra como texto de apoio no title.

const ORIGEM_STYLE = {
  bagy:   { bg: '#EEF2FF', color: '#4F46E5', label: 'Bagy' },
  manual: { bg: '#F1F5F9', color: '#475569', label: 'Manual' },
}

/**
 * @param {{ bagyProductId: number|null, source?: string }} props
 */
export default function OrigemBadge({ bagyProductId, source }) {
  const chave = bagyProductId != null ? 'bagy' : 'manual'
  const s = ORIGEM_STYLE[chave]
  return (
    <span
      title={source ? `source: ${source}` : undefined}
      style={{
        fontSize: 9.5, fontWeight: 700, color: s.color, background: s.bg,
        borderRadius: 5, padding: '2px 6px', letterSpacing: '0.2px', whiteSpace: 'nowrap',
      }}
    >
      {s.label}
    </span>
  )
}
