import { useState, useMemo } from 'react'

// Aba "💳 Parcelas" — visão financeira somente-leitura, 1 linha = 1 Parcela.
// Reaproveita exclusivamente o state `cobrancas` já carregado em CobrancasPage.jsx
// (vindo de getAllCobrancas()) — nenhuma chamada de API nova é feita aqui.

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)
}

const QUICK_FILTERS = [
  { id: 'todas', label: 'Todas' },
  { id: 'pendentes', label: 'Pendentes' },
  { id: 'vencidas', label: 'Vencidas' },
  { id: 'parciais', label: 'Parciais' },
  { id: 'pagas', label: 'Pagas' },
]

function matchesQuickFilter(c, quickFilter) {
  const paga = c.valorAberto === 0 && c.valorPago > 0
  const parcial = c.valorAberto > 0 && c.valorPago > 0
  const pendente = c.valorPago === 0
  const vencida = c.diasAtraso > 0

  switch (quickFilter) {
    case 'pendentes':
      return pendente
    case 'vencidas':
      return vencida
    case 'parciais':
      return parcial
    case 'pagas':
      return paga
    default:
      return true
  }
}

export default function ParcelasTab({ cobrancas, theme: t }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [quickFilter, setQuickFilter] = useState('todas')
  const [sortBy, setSortBy] = useState('vencimento') // 'vencimento' | 'atraso' | 'valor'

  const statusOptions = useMemo(() => {
    const set = new Set(cobrancas.map(c => c.status).filter(Boolean))
    return Array.from(set).sort()
  }, [cobrancas])

  const quickFilterCounts = useMemo(() => {
    const counts = {}
    for (const f of QUICK_FILTERS) {
      counts[f.id] = cobrancas.filter(c => matchesQuickFilter(c, f.id)).length
    }
    return counts
  }, [cobrancas])

  const filtered = useMemo(() => {
    let result = cobrancas.filter(c => matchesQuickFilter(c, quickFilter))

    if (statusFilter !== 'todos') {
      result = result.filter(c => c.status === statusFilter)
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(c =>
        c.nome?.toLowerCase().includes(q) ||
        c.telefone?.includes(q)
      )
    }

    return [...result].sort((a, b) => {
      if (sortBy === 'atraso') return (b.diasAtraso || 0) - (a.diasAtraso || 0)
      if (sortBy === 'valor') return (b.valorAberto || 0) - (a.valorAberto || 0)
      // vencimento: mais próximo/mais antigo primeiro (ISO string ordena bem)
      return (a.vencimentoRaw || '').localeCompare(b.vencimentoRaw || '')
    })
  }, [cobrancas, quickFilter, statusFilter, search, sortBy])

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
      {/* Busca, status e ordenação */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome ou telefone..."
          style={{
            width: 320,
            border: `1px solid ${t.border}`,
            borderRadius: 7,
            padding: '7px 12px',
            fontSize: 13,
            background: t.inputBg,
            color: t.text,
            outline: 'none',
          }}
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{
            border: `1px solid ${t.border}`,
            borderRadius: 7,
            padding: '7px 12px',
            fontSize: 13,
            background: t.inputBg,
            color: t.text,
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          <option value="todos">Todos os status</option>
          {statusOptions.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          style={{
            border: `1px solid ${t.border}`,
            borderRadius: 7,
            padding: '7px 12px',
            fontSize: 13,
            background: t.inputBg,
            color: t.text,
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          <option value="vencimento">Ordenar por vencimento</option>
          <option value="atraso">Maior atraso</option>
          <option value="valor">Maior valor</option>
        </select>
      </div>

      {/* Filtros rápidos */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {QUICK_FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setQuickFilter(f.id)}
            style={{
              fontSize: 12,
              padding: '7px 14px',
              borderRadius: 7,
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              background: quickFilter === f.id ? (t.primary || '#E8192C') : t.bgTertiary,
              color: quickFilter === f.id ? '#fff' : t.textMid,
              fontWeight: quickFilter === f.id ? 600 : 500,
              transition: 'all 0.12s',
            }}
          >
            {f.label} ({quickFilterCounts[f.id] ?? 0})
          </button>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>
          {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Tabela financeira de parcelas */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: t.textMuted, fontSize: 13 }}>
          Nenhuma parcela encontrada
        </div>
      ) : (
        <div style={{ border: `1px solid ${t.border}`, borderRadius: 8, overflow: 'hidden' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr 1fr 0.8fr 1fr 1fr 1fr 0.8fr 1.3fr 0.8fr',
            gap: 8,
            padding: '10px 16px',
            background: t.bgTertiary,
            fontSize: 10,
            fontWeight: 700,
            color: t.textMuted,
            textTransform: 'uppercase',
          }}>
            <div>Cliente</div>
            <div>Parcela</div>
            <div>Vencimento</div>
            <div>Status</div>
            <div style={{ textAlign: 'center' }}>Atraso</div>
            <div style={{ textAlign: 'right' }}>Valor Total</div>
            <div style={{ textAlign: 'right' }}>Pago</div>
            <div style={{ textAlign: 'right' }}>Restante</div>
            <div style={{ textAlign: 'center' }}>Cobranças</div>
            <div>Telefone</div>
            <div style={{ textAlign: 'center' }}>Link</div>
          </div>

          {filtered.map(c => (
            <div
              key={c.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr 1fr 0.8fr 1fr 1fr 1fr 0.8fr 1.3fr 0.8fr',
                gap: 8,
                padding: '10px 16px',
                borderTop: `1px solid ${t.border}`,
                fontSize: 12,
                color: t.text,
                alignItems: 'center',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = t.bgSecondary }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                {c.nome}
              </div>
              <div style={{ color: t.textMid }}>{c.parcelas}</div>
              <div style={{ color: t.textMid }}>{c.vencimento}</div>
              <div style={{ color: t.textMid }}>{c.status || '-'}</div>
              <div style={{ textAlign: 'center', fontWeight: 700, color: c.diasAtraso > 0 ? '#DC2626' : t.textMuted }}>
                {c.diasAtraso > 0 ? `${c.diasAtraso}d` : '-'}
              </div>
              <div style={{ textAlign: 'right' }}>{formatCurrency(c.valorTotal)}</div>
              <div style={{ textAlign: 'right', color: '#047857' }}>{formatCurrency(c.valorPago)}</div>
              <div style={{ textAlign: 'right', fontWeight: 700, color: c.valorAberto > 0 ? '#DC2626' : t.textMuted }}>
                {formatCurrency(c.valorAberto)}
              </div>
              <div style={{ textAlign: 'center', color: t.textMid }}>{c.quantidadeCobrancas ?? '-'}</div>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: t.textMid }}>
                {c.telefone || '-'}
              </div>
              <div style={{ textAlign: 'center' }}>
                {c.paymentLink || c.payment_link ? (
                  <a
                    href={c.paymentLink || c.payment_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: t.primary || '#E8192C', fontSize: 14 }}
                    title="Abrir link de pagamento"
                  >
                    🔗
                  </a>
                ) : (
                  <span style={{ color: t.textMuted }}>—</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
