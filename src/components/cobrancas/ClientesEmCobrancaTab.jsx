import { useState, useMemo } from 'react'

// Aba "👤 Clientes em Cobrança" — visão financeira consolidada, 1 card por cliente.
// Reaproveita exclusivamente o state `cobrancas` já carregado em CobrancasPage.jsx
// (vindo de getAllCobrancas()) — nenhuma chamada de API nova, nenhuma escrita no Base44.
// A visão por parcela individual continua em ParcelasTab.jsx — esta aba só agrega.

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)
}

// Mesmo limiar de "crítico" já usado em getTotalizadores() (cobrancasService.js)
// e em filterDefs.critico (antiga aba Lista) — não é uma regra nova.
const LIMIAR_CRITICO_DIAS = 15

function normalizeStr(s) {
  return (s || '').toString().trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function normalizePhone(s) {
  return (s || '').toString().replace(/\D/g, '')
}

// Agrupa por clienteId sempre que existir. Só cai pro fallback nome+telefone
// quando a Parcela não tem cliente_id (evita juntar todos os "sem nome" num só
// cliente, e reduz risco de homônimos por não usar só o nome).
function getGroupKey(c) {
  if (c.clienteId) return `id:${c.clienteId}`
  return `nome:${normalizeStr(c.nome)}|telefone:${normalizePhone(c.telefone)}`
}

function agruparPorCliente(cobrancas) {
  const grupos = new Map()

  for (const c of cobrancas) {
    const key = getGroupKey(c)
    if (!grupos.has(key)) {
      grupos.set(key, {
        key,
        clienteId: c.clienteId || null,
        nome: c.nome || 'Sem nome',
        telefone: (c.telefone && c.telefone !== '-') ? c.telefone : '-',
        parcelas: [],
      })
    }
    const grupo = grupos.get(key)
    grupo.parcelas.push(c)
    if (grupo.telefone === '-' && c.telefone && c.telefone !== '-') grupo.telefone = c.telefone
  }

  return Array.from(grupos.values()).map(grupo => {
    const { parcelas } = grupo
    const valorTotal = parcelas.reduce((s, p) => s + (p.valorTotal || 0), 0)
    const valorPago = parcelas.reduce((s, p) => s + (p.valorPago || 0), 0)
    const valorAberto = parcelas.reduce((s, p) => s + (p.valorAberto || 0), 0)

    const totalParcelas = parcelas.length
    // "Paga" usa o mesmo critério já usado em toda a página (valorAberto===0 e valorPago>0).
    const pagasCount = parcelas.filter(p => p.valorAberto === 0 && p.valorPago > 0).length
    const vencidasCount = parcelas.filter(p => p.diasAtraso > 0 && p.valorAberto > 0).length
    const pendentesCount = parcelas.filter(p => p.valorPago === 0).length

    // Maior atraso e próximo vencimento só consideram parcelas ainda em aberto —
    // uma parcela já paga não deveria "puxar" a data pra trás.
    const parcelasEmAberto = parcelas.filter(p => p.valorAberto > 0)
    const maiorAtraso = parcelasEmAberto.length > 0
      ? Math.max(...parcelasEmAberto.map(p => p.diasAtraso || 0))
      : 0
    const proximoVencimentoRaw = parcelasEmAberto.reduce((min, p) => {
      if (!p.vencimentoRaw) return min
      if (!min) return p.vencimentoRaw
      return p.vencimentoRaw < min ? p.vencimentoRaw : min
    }, null)
    const proximoVencimento = proximoVencimentoRaw
      ? new Date(proximoVencimentoRaw).toLocaleDateString('pt-BR')
      : '-'

    // Status consolidado — prioridade fixa, sem sobreposição (ver docs/ARCHITECTURE.md):
    // Quitado > Vencido > Parcial > Pendente. Crítico é só uma flag visual complementar.
    const quitado = valorAberto <= 0.005 || pagasCount === totalParcelas
    const vencido = !quitado && vencidasCount > 0
    const parcial = !quitado && !vencido && valorPago > 0 && valorAberto > 0

    let status = 'pendente'
    if (quitado) status = 'quitado'
    else if (vencido) status = 'vencido'
    else if (parcial) status = 'parcial'

    const critico = maiorAtraso > LIMIAR_CRITICO_DIAS

    // Progresso por valor (determinístico, sem IA) — só cai pra 0% se valorTotal for 0
    // (não deveria ocorrer, é só uma proteção contra divisão por zero).
    const progresso = valorTotal > 0 ? Math.min(100, Math.round((valorPago / valorTotal) * 100)) : 0

    const quantidadeCobrancas = parcelas.reduce((s, p) => s + (p.quantidadeCobrancas || 0), 0)

    return {
      key: grupo.key,
      clienteId: grupo.clienteId,
      nome: grupo.nome,
      telefone: grupo.telefone,
      totalParcelas,
      pagasCount,
      vencidasCount,
      pendentesCount,
      valorTotal,
      valorPago,
      valorAberto,
      maiorAtraso,
      proximoVencimento,
      proximoVencimentoRaw,
      status,
      critico,
      progresso,
      quantidadeCobrancas,
    }
  })
}

const STATUS_CONFIG = {
  quitado: { bg: '#D1FAE5', text: '#047857', icon: '✅', label: 'Quitado' },
  vencido: { bg: '#FEE2E2', text: '#DC2626', icon: '⚠️', label: 'Vencido' },
  parcial: { bg: '#FEF3C7', text: '#D97706', icon: '◐', label: 'Parcial' },
  pendente: { bg: '#E0E7FF', text: '#4F46E5', icon: '⏳', label: 'Pendente' },
}

const QUICK_FILTERS = [
  { id: 'todos', label: 'Todos' },
  { id: 'vencido', label: 'Vencidos' },
  { id: 'pendente', label: 'Pendentes' },
  { id: 'parcial', label: 'Parciais' },
  { id: 'quitado', label: 'Quitados' },
  { id: 'critico', label: 'Críticos' },
]

function matchesQuickFilter(cliente, quickFilter) {
  switch (quickFilter) {
    case 'vencido':
    case 'pendente':
    case 'parcial':
    case 'quitado':
      return cliente.status === quickFilter
    case 'critico':
      return cliente.critico === true
    default:
      return true
  }
}

function progressColor(progresso) {
  if (progresso >= 70) return '#10B981'
  if (progresso >= 30) return '#F59E0B'
  return '#DC2626'
}

export default function ClientesEmCobrancaTab({ cobrancas, theme: t, onVerParcelas }) {
  const [search, setSearch] = useState('')
  const [quickFilter, setQuickFilter] = useState('todos')
  const [sortBy, setSortBy] = useState('valorAberto') // valorAberto | atraso | vencimento | nome | progressoDesc | progressoAsc

  const clientes = useMemo(() => agruparPorCliente(cobrancas), [cobrancas])

  const quickFilterCounts = useMemo(() => {
    const counts = {}
    for (const f of QUICK_FILTERS) {
      counts[f.id] = clientes.filter(c => matchesQuickFilter(c, f.id)).length
    }
    return counts
  }, [clientes])

  const filtered = useMemo(() => {
    let result = clientes.filter(c => matchesQuickFilter(c, quickFilter))

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(c =>
        c.nome?.toLowerCase().includes(q) ||
        c.telefone?.includes(q)
      )
    }

    return [...result].sort((a, b) => {
      if (sortBy === 'atraso') return (b.maiorAtraso || 0) - (a.maiorAtraso || 0)
      if (sortBy === 'nome') return (a.nome || '').localeCompare(b.nome || '')
      if (sortBy === 'progressoDesc') return (b.progresso || 0) - (a.progresso || 0)
      if (sortBy === 'progressoAsc') return (a.progresso || 0) - (b.progresso || 0)
      if (sortBy === 'vencimento') {
        if (!a.proximoVencimentoRaw) return 1
        if (!b.proximoVencimentoRaw) return -1
        return a.proximoVencimentoRaw.localeCompare(b.proximoVencimentoRaw)
      }
      // valorAberto (default)
      return (b.valorAberto || 0) - (a.valorAberto || 0)
    })
  }, [clientes, quickFilter, search, sortBy])

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
      {/* Busca e ordenação */}
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
          <option value="valorAberto">Maior valor em aberto</option>
          <option value="atraso">Maior atraso</option>
          <option value="vencimento">Próximo vencimento</option>
          <option value="nome">Nome (A → Z)</option>
          <option value="progressoDesc">Maior progresso</option>
          <option value="progressoAsc">Menor progresso</option>
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
          {filtered.length} cliente{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Cards de clientes */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: t.textMuted, fontSize: 13 }}>
          Nenhum cliente encontrado
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(cliente => {
            const cfg = STATUS_CONFIG[cliente.status]
            return (
              <div
                key={cliente.key}
                style={{
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  padding: 14,
                  background: t.bgSecondary,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  {/* Nome + telefone + status */}
                  <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{cliente.nome}</span>
                      <span style={{
                        background: cfg.bg, color: cfg.text, fontSize: 10, fontWeight: 600,
                        padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap',
                      }}>
                        {cfg.icon} {cfg.label}
                      </span>
                      {cliente.critico && (
                        <span style={{
                          background: '#FEE2E2', color: '#DC2626', fontSize: 10, fontWeight: 600,
                          padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap',
                        }}>
                          🔴 Crítico
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4 }}>
                      {cliente.telefone}
                    </div>
                  </div>

                  {/* Contagem de parcelas */}
                  <div style={{ textAlign: 'center', fontSize: 11, minWidth: 90 }}>
                    <div style={{ fontWeight: 700, color: t.text }}>
                      {cliente.pagasCount}/{cliente.totalParcelas} pagas
                    </div>
                    <div style={{ fontSize: 9, color: t.textMuted }}>
                      {cliente.pendentesCount} pend. · {cliente.vencidasCount} venc.
                    </div>
                  </div>

                  {/* Maior atraso */}
                  <div style={{ textAlign: 'center', fontSize: 11, minWidth: 60 }}>
                    <div style={{ fontWeight: 700, color: cliente.maiorAtraso > 0 ? '#DC2626' : t.textMuted }}>
                      {cliente.maiorAtraso > 0 ? `${cliente.maiorAtraso}d` : '-'}
                    </div>
                    <div style={{ fontSize: 9, color: t.textMuted }}>maior atraso</div>
                  </div>

                  {/* Próximo vencimento */}
                  <div style={{ textAlign: 'center', fontSize: 11, minWidth: 80 }}>
                    <div style={{ fontWeight: 700, color: t.text }}>{cliente.proximoVencimento}</div>
                    <div style={{ fontSize: 9, color: t.textMuted }}>próx. vencimento</div>
                  </div>

                  {/* Valores */}
                  <div style={{ textAlign: 'right', fontSize: 11, minWidth: 100 }}>
                    <div style={{ fontWeight: 700, color: t.text }}>{formatCurrency(cliente.valorAberto)}</div>
                    <div style={{ fontSize: 9, color: t.textMuted }}>de {formatCurrency(cliente.valorTotal)}</div>
                  </div>

                  {/* Ação */}
                  <button
                    onClick={() => onVerParcelas?.({ clienteId: cliente.clienteId, nome: cliente.nome })}
                    style={{
                      fontSize: 11, fontWeight: 600, padding: '7px 12px', borderRadius: 7,
                      border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                      background: t.bgTertiary, color: t.textMid,
                    }}
                  >
                    💳 Ver parcelas
                  </button>
                </div>

                {/* Barra de progresso financeiro */}
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: t.textMuted, marginBottom: 4 }}>
                    <span>{cliente.progresso}% pago · {cliente.pagasCount} de {cliente.totalParcelas} parcelas pagas</span>
                    <span>{formatCurrency(cliente.valorPago)} pago · {formatCurrency(cliente.valorAberto)} restante</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 4, background: t.bgTertiary, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${cliente.progresso}%`,
                      background: progressColor(cliente.progresso), transition: 'width 0.2s',
                    }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
