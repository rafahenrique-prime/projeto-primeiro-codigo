import { useState, useMemo } from 'react'
import { Search, CreditCard, MessageCircle, RefreshCw, Phone, Calendar } from 'lucide-react'
import WhatsAppSendModal from './WhatsAppSendModal'

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
      // Só em aberto — usado pelo seletor de parcela do WhatsAppSendModal (Fase 2 UX).
      // Não altera nenhum cálculo acima, é só exposição do array já computado.
      parcelasDetalhe: parcelasEmAberto,
    }
  })
}

const STATUS_CONFIG = {
  quitado: { bg: '#ECFDF5', text: '#059669', dot: '#10B981', label: 'Quitado' },
  vencido: { bg: '#FEF2F2', text: '#DC2626', dot: '#DC2626', label: 'Vencido' },
  parcial: { bg: '#FFFBEB', text: '#B45309', dot: '#F59E0B', label: 'Parcial' },
  pendente: { bg: '#F4F4F5', text: '#52525B', dot: '#A1A1AA', label: 'Pendente' },
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

function getStatusBarColor(status, critico) {
  if (critico) return '#DC2626' // Vermelho — crítico
  switch (status) {
    case 'quitado': return '#10B981' // Verde
    case 'vencido': return '#DC2626' // Vermelho
    case 'parcial': return '#F59E0B' // Laranja
    case 'pendente': return '#F59E0B' // Amarelo
    default: return '#9CA3AF' // Cinza
  }
}

function getInitials(name) {
  return (name || 'SN')
    .split(' ')
    .slice(0, 2)
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function getAvatarBgColor(name) {
  const colors = ['#52525B', '#71717A', '#57534E', '#3F3F46', '#44403C', '#3F3F46']
  const index = (name || '').charCodeAt(0) % colors.length
  return colors[index]
}

export default function ClientesEmCobrancaTab({ cobrancas, theme: t, onVerParcelas, sincronizarTelefones, sincronizandoTelefones }) {
  const [search, setSearch] = useState('')
  const [quickFilter, setQuickFilter] = useState('todos')
  const [sortBy, setSortBy] = useState('valorAberto')
  const [clienteSelecionado, setClienteSelecionado] = useState(null)

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
      return (b.valorAberto || 0) - (a.valorAberto || 0)
    })
  }, [clientes, quickFilter, search, sortBy])

  return (
    <div style={{ padding: '24px 24px 32px', overflowY: 'auto', flex: 1 }}>
      {/* Busca, ordenação e sincronizar geral — sem bordas, fundo neutro */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: 280 }}>
          <Search size={14} strokeWidth={2} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: t.textMuted }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome ou telefone"
            style={{
              width: '100%',
              border: 'none',
              borderRadius: 6,
              padding: '8px 12px 8px 32px',
              fontSize: 13,
              background: t.bgTertiary,
              color: t.text,
              outline: 'none',
            }}
          />
        </div>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          style={{
            border: 'none',
            borderRadius: 6,
            padding: '8px 12px',
            fontSize: 13,
            background: t.bgTertiary,
            color: t.textMid,
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
        <button
          onClick={() => sincronizarTelefones?.(null, 'todos')}
          disabled={sincronizandoTelefones}
          title="Sincronizar telefones com Base44"
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            border: 'none',
            borderRadius: 6,
            padding: '8px 14px',
            fontSize: 12.5,
            fontWeight: 600,
            background: t.bgTertiary,
            color: t.textMid,
            cursor: sincronizandoTelefones ? 'not-allowed' : 'pointer',
            opacity: sincronizandoTelefones ? 0.6 : 1,
            transition: 'background-color 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { if (!sincronizandoTelefones) { e.currentTarget.style.background = t.bgSecondary; e.currentTarget.style.color = t.text } }}
          onMouseLeave={e => { e.currentTarget.style.background = t.bgTertiary; e.currentTarget.style.color = t.textMid }}
        >
          <RefreshCw size={13} strokeWidth={2} style={sincronizandoTelefones ? { animation: 'spin 0.8s linear infinite' } : undefined} />
          Sincronizar Base44
        </button>
      </div>

      {/* Filtros rápidos — segmented control neutro, sem vermelho decorativo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginBottom: 20 }}>
        {QUICK_FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setQuickFilter(f.id)}
            style={{
              fontSize: 12.5,
              padding: '6px 12px',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              background: quickFilter === f.id ? t.text : 'transparent',
              color: quickFilter === f.id ? t.bg : t.textMid,
              fontWeight: 600,
              transition: 'all 0.15s',
            }}
          >
            {f.label} · {quickFilterCounts[f.id] ?? 0}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: 12, color: t.textMuted }}>
          {filtered.length} cliente{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Lista premium de clientes */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: t.textMuted, fontSize: 14 }}>
          Nenhum cliente encontrado
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {filtered.map((cliente, idx) => {
            const cfg = STATUS_CONFIG[cliente.status]
            const statusBarColor = getStatusBarColor(cliente.status, cliente.critico)
            const initials = getInitials(cliente.nome)
            const avatarBg = getAvatarBgColor(cliente.nome)

            return (
              <div
                key={cliente.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '11px 12px',
                  borderBottom: idx < filtered.length - 1 ? `1px solid ${t.borderLight || t.border}` : 'none',
                  background: t.bg,
                  transition: 'background-color 0.15s',
                  borderLeft: `2px solid ${statusBarColor}`,
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = t.bgSecondary}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = t.bg}
              >
                {/* Avatar com iniciais — neutro, sem cor decorativa */}
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    background: avatarBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: 11,
                    flexShrink: 0,
                  }}
                >
                  {initials}
                </div>

                {/* Coluna: Nome + ID + Telefone */}
                <div style={{ flex: '0 0 210px', minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {cliente.nome}
                  </div>
                  <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{cliente.clienteId?.slice(0, 8) || '—'}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <Phone size={10} strokeWidth={2} />
                      {cliente.telefone}
                    </span>
                  </div>
                </div>

                {/* Coluna: Status */}
                <div style={{ flex: '0 0 130px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    color: cfg.text,
                    fontSize: 11.5,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, display: 'inline-block' }} />
                    {cfg.label}
                  </span>
                  {cliente.critico && (
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: '#DC2626', whiteSpace: 'nowrap' }}>
                      · Crítico
                    </span>
                  )}
                </div>

                {/* Coluna: Limite disponível (com mini barra de progresso) */}
                <div style={{ flex: '0 0 140px' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: t.text }}>
                    {formatCurrency(cliente.valorAberto)}
                  </div>
                  <div style={{ height: 2, borderRadius: 1, background: t.bgTertiary, overflow: 'hidden', marginTop: 5 }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.min(100, cliente.progresso)}%`,
                      background: progressColor(cliente.progresso),
                      transition: 'width 0.2s',
                    }} />
                  </div>
                  <div style={{ fontSize: 10, color: t.textMuted, marginTop: 3 }}>
                    {cliente.progresso}% de {formatCurrency(cliente.valorTotal)}
                  </div>
                </div>

                {/* Coluna: Última atividade */}
                <div style={{ flex: '0 0 100px', fontSize: 11.5, color: t.textMid, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Calendar size={12} strokeWidth={2} style={{ color: t.textMuted, flexShrink: 0 }} />
                  {cliente.proximoVencimento}
                </div>

                {/* Coluna: Ações — Parcelas */}
                <button
                  onClick={() => onVerParcelas?.({ clienteId: cliente.clienteId, nome: cliente.nome })}
                  title="Ver parcelas"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 6,
                    border: 'none',
                    background: 'transparent',
                    color: t.textMid,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s',
                    flexShrink: 0,
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = t.bgTertiary
                    e.currentTarget.style.color = t.text
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = t.textMid
                  }}
                >
                  <CreditCard size={15} strokeWidth={2} />
                </button>

                {/* Coluna: Ações — WhatsApp */}
                <button
                  onClick={() => setClienteSelecionado(cliente)}
                  title="Enviar mensagem WhatsApp"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 6,
                    border: 'none',
                    background: 'transparent',
                    color: t.textMid,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s',
                    flexShrink: 0,
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = '#ECFDF5'
                    e.currentTarget.style.color = '#059669'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = t.textMid
                  }}
                >
                  <MessageCircle size={15} strokeWidth={2} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {clienteSelecionado && (
        <WhatsAppSendModal
          cliente={clienteSelecionado}
          parcelas={clienteSelecionado.parcelasDetalhe || []}
          theme={t}
          onClose={() => setClienteSelecionado(null)}
        />
      )}
    </div>
  )
}
