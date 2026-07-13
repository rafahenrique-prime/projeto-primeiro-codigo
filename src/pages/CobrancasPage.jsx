import { useState, useMemo, useEffect } from 'react'
import { useTheme } from '../theme.jsx'
import { getAllCobrancas, getTotalizadores, buscarTelefoneParaWhatsApp, getHistoricoAtividades, getClientes, sincronizarTelefonesEncontrados, registrarPagamentoManual } from '../services/crm/cobrancasService'
import { PieChart, Pie, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'

// Dados fake pra fallback se API falhar
const MOCK_COBRANCAS = [
  { id: 1, nome: 'ALESSANDRO ELISA', status: 'Atrasado', diasAtraso: 83, vencimento: '14/04/2026', valorTotal: 1874.99, valorAberto: 918.99, valorPago: 956.00, parcelas: '4x', telefone: '(34) 98765-4321' },
  { id: 2, nome: 'ALESSANDRO PEREIRA LOPES 10ZIN', status: 'Atrasado', diasAtraso: 52, vencimento: '15/05/2026', valorTotal: 638.00, valorAberto: 638.00, valorPago: 0, parcelas: '1x', telefone: '(34) 99876-5432' },
  { id: 3, nome: 'ALEXANDRE SETE RODAS', status: 'Atrasado', diasAtraso: 86, vencimento: '11/04/2026', valorTotal: 3126.70, valorAberto: 3126.70, valorPago: 0, parcelas: '1x', telefone: '(34) 98765-1234' },
  { id: 4, nome: 'ALVARO BARBEARIA', status: 'Atrasado', diasAtraso: 78, vencimento: '19/04/2026', valorTotal: 309.00, valorAberto: 309.00, valorPago: 0, parcelas: '1x', telefone: '(34) 99876-5555' },
  { id: 5, nome: 'BARBEIRO MARCUS 02', status: 'Semanal', diasAtraso: 0, vencimento: '11/07/2026', valorTotal: 1823.80, valorAberto: 1311.80, valorPago: 512.00, parcelas: '1x', telefone: '(34) 98765-6666' },
  { id: 6, nome: 'BATOM PROZA', status: 'Mensal', diasAtraso: 0, vencimento: '21/07/2026', valorTotal: 339.00, valorAberto: 339.00, valorPago: 0, parcelas: '1x', telefone: '(34) 99876-7777' },
  { id: 7, nome: 'BOCAO PROZA', status: 'Atrasado', diasAtraso: 21, vencimento: '15/06/2026', valorTotal: 607.00, valorAberto: 607.00, valorPago: 0, parcelas: '1x', telefone: '(34) 98765-8888' },
  { id: 8, nome: 'CASSIANO IRMAO JOAO', status: 'Atrasado', diasAtraso: 25, vencimento: '11/06/2026', valorTotal: 2241.00, valorAberto: 2241.00, valorPago: 0, parcelas: '1x', telefone: '(34) 99876-9999' },
  { id: 9, nome: 'DINEI BARBEARIA', status: 'Atrasado', diasAtraso: 66, vencimento: '01/05/2026', valorTotal: 879.00, valorAberto: 629.00, valorPago: 250.00, parcelas: '1x', telefone: '(34) 98765-0000' },
  { id: 10, nome: 'GABRIEL SILVA PINHEIRO GARRAGEM', status: 'Atrasado', diasAtraso: 38, vencimento: '29/05/2026', valorTotal: 3136.00, valorAberto: 3136.00, valorPago: 0, parcelas: '1x', telefone: '(34) 99876-1111' },
]

function WhatsAppIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path fill="#25D366" d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.38 5.07L2 22l5.07-1.33C8.52 21.5 10.22 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm5.2 14.2c-.23.65-1.35 1.24-1.86 1.28-.5.05-1.02.24-3.4-.7-2.87-1.15-4.7-4.06-4.84-4.25-.14-.19-1.16-1.55-1.16-2.95s.72-2.1.98-2.38c.26-.28.56-.35.75-.35.19 0 .38 0 .54.01.18.01.42-.07.65.5.24.58.82 2 .89 2.14.07.14.12.31.02.5-.1.19-.15.31-.3.48-.15.17-.31.38-.44.51-.15.15-.3.31-.13.6.17.29.76 1.25 1.63 2.02 1.12 1 2.06 1.31 2.35 1.46.29.15.46.13.63-.08.17-.21.72-.84.91-1.13.19-.29.38-.24.64-.14.26.1 1.65.78 1.93.92.28.14.47.21.54.33.07.12.07.68-.16 1.33z" />
    </svg>
  )
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function statusColor(status, diasAtraso) {
  if (diasAtraso > 0) {
    return { bg: '#FEE2E2', text: '#DC2626', icon: '⚠️', label: 'Atrasado' }
  }
  const s = (status || '').trim()
  switch (s) {
    case 'Pago':
      return { bg: '#D1FAE5', text: '#047857', icon: '✅', label: 'Pago' }
    case 'Cobrado Hoje':
      return { bg: '#FEF3C7', text: '#D97706', icon: '📞', label: 'Cobrado Hoje' }
    case 'Aguardando Resposta':
      return { bg: '#E0E7FF', text: '#4F46E5', icon: '⏳', label: 'Aguardando' }
    case 'Promessa de Pagamento':
      return { bg: '#BFDBFE', text: '#1E40AF', icon: '🤝', label: 'Promessa' }
    case 'Sem Retorno':
      return { bg: '#FECACA', text: '#991B1B', icon: '❌', label: 'Sem Retorno' }
    case 'Não Cobrado':
      return { bg: '#F3F4F6', text: '#6B7280', icon: '•', label: 'Não Cobrado' }
    default:
      return { bg: '#F3F4F6', text: '#6B7280', icon: '•', label: s || 'Sem Status' }
  }
}

export default function CobrancasPage() {
  const { theme: t } = useTheme()
  const [tab, setTab] = useState('lista') // 'lista' | 'dashboard' | 'fluxo' | 'historico'
  const [filter, setFilter] = useState('todos')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('diasAtraso') // 'diasAtraso' | 'nome-asc' | 'nome-desc' | 'valor-desc' | 'valor-asc' | 'tentativas'
  const [cobrancas, setCobrancas] = useState([])
  const [clientes, setClientes] = useState([])
  const [totalizadores, setTotalizadores] = useState({ totalAtraso: 0, qtdAtrasados: 0, diasMedia: 0, totalReceber: 0, totalRecebido: 0, critico: 0, urgente: 0 })
  const [historicoAtividades, setHistoricoAtividades] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [clienteSearch, setClienteSearch] = useState('')
  const [clienteSortBy, setClienteSortBy] = useState('nome-asc')
  const [sincronizandoTelefones, setSincronizandoTelefones] = useState(false)
  const [pagamentoModalCobranca, setPagamentoModalCobranca] = useState(null)

  useEffect(() => {
    loadCobrancas()
  }, [])

  async function sincronizarTelefones() {
    setSincronizandoTelefones(true)
    try {
      const result = await sincronizarTelefonesEncontrados()
      alert(`✅ Sincronização concluída!\n${result.sucesso} clientes atualizados\n${result.erro} com erro`)
      await loadCobrancas()
    } catch (err) {
      console.error('Erro ao sincronizar:', err)
      alert(`❌ Erro: ${err.message}`)
    } finally {
      setSincronizandoTelefones(false)
    }
  }

  async function syncData() {
    setSyncing(true)
    try {
      const [dados, totals, historico, clientesList] = await Promise.all([
        getAllCobrancas(),
        getTotalizadores(),
        getHistoricoAtividades(),
        getClientes()
      ])
      setCobrancas(dados && dados.length > 0 ? dados : MOCK_COBRANCAS)
      setTotalizadores(totals)
      setHistoricoAtividades(historico)
      setClientes(clientesList)
    } catch (err) {
      console.error('Erro ao sincronizar:', err)
    } finally {
      setSyncing(false)
    }
  }

  async function loadCobrancas() {
    setLoading(true)
    setError('')
    try {
      const [dados, totals, historico, clientesList] = await Promise.all([
        getAllCobrancas(),
        getTotalizadores(),
        getHistoricoAtividades(),
        getClientes()
      ])
      setCobrancas(dados && dados.length > 0 ? dados : MOCK_COBRANCAS)
      setTotalizadores(totals)
      setHistoricoAtividades(historico)
      setClientes(clientesList)
    } catch (err) {
      console.error('Erro ao carregar cobranças:', err)
      setError('Erro ao carregar dados. Usando dados de exemplo.')
      setCobrancas(MOCK_COBRANCAS)
    } finally {
      setLoading(false)
    }
  }

  // Filtros
  const filtered = useMemo(() => {
    let result = cobrancas
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const amanha = new Date(hoje.getTime() + 24 * 60 * 60 * 1000)
    const fimSemana = new Date(hoje.getTime() + 7 * 24 * 60 * 60 * 1000)
    const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)

    if (filter !== 'todos') {
      if (filter === 'hoje') {
        const hojeStr = new Date().toISOString().slice(0, 10)
        result = result.filter(c => (c.vencimentoRaw || '').slice(0, 10) === hojeStr)
      } else if (filter === '1-5') {
        // Atenção: exclui pagos (100%)
        result = result.filter(c => !(c.valorAberto === 0 && c.valorPago > 0) && c.diasAtraso >= 1 && c.diasAtraso <= 5)
      } else if (filter === '6-15') {
        // Urgente: exclui pagos (100%)
        result = result.filter(c => !(c.valorAberto === 0 && c.valorPago > 0) && c.diasAtraso >= 6 && c.diasAtraso <= 15)
      } else if (filter === 'critico') {
        // Crítico: apenas 15+ dias (sem limite de valor, exclui pagos)
        result = result.filter(c => !(c.valorAberto === 0 && c.valorPago > 0) && c.diasAtraso > 15)
      } else if (filter === 'pago') {
        result = result.filter(c => c.valorAberto === 0 && c.valorPago > 0)
      } else if (filter === 'pendente') {
        // Sem pagamento nenhum
        result = result.filter(c => c.valorPago === 0)
      } else if (filter === 'parcial') {
        result = result.filter(c => c.valorAberto > 0 && c.valorPago > 0)
      } else if (filter === 'avencer') {
        // A vencer: sem atraso, vence entre amanhã e daqui 7 dias (comparação por string ISO, sem risco de fuso)
        const amanhaStr = amanha.toISOString().slice(0, 10)
        const fimSemanaStr = fimSemana.toISOString().slice(0, 10)
        result = result.filter(c => {
          const vencStr = (c.vencimentoRaw || '').slice(0, 10)
          return c.diasAtraso === 0 && vencStr >= amanhaStr && vencStr <= fimSemanaStr
        })
      } else if (filter === 'risco') {
        // Risco Alto: 30+ dias atrasado OU parcialmente pago (exclui pagos 100%)
        result = result.filter(c => !(c.valorAberto === 0 && c.valorPago > 0) && (c.diasAtraso > 30 || (c.valorAberto > 0 && c.valorPago > 0)))
      }
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(c => c.nome?.toLowerCase().includes(q) || c.telefone?.includes(q))
    }

    return result.sort((a, b) => {
      if (sortBy === 'diasAtraso') return (b.diasAtraso || 0) - (a.diasAtraso || 0)
      if (sortBy === 'nome-asc') return (a.nome || '').localeCompare(b.nome || '')
      if (sortBy === 'nome-desc') return (b.nome || '').localeCompare(a.nome || '')
      if (sortBy === 'valor-desc') return (b.valorAberto || 0) - (a.valorAberto || 0)
      if (sortBy === 'valor-asc') return (a.valorAberto || 0) - (b.valorAberto || 0)
      if (sortBy === 'tentativas') return (b.quantidadeCobrancas || 0) - (a.quantidadeCobrancas || 0)
      return 0
    })
  }, [filter, search, sortBy, cobrancas])

  // Definições dos filtros rápidos — separado do JSX pra poder distribuir os chips
  // em 2 lugares diferentes na tela (linha principal + ao lado da busca).
  const filterDefs = useMemo(() => {
    const hojeStr = new Date().toISOString().slice(0, 10)
    const hoje0 = new Date()
    hoje0.setHours(0, 0, 0, 0)
    const fimSemanaStr = new Date(hoje0.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const pagoFilter = c => c.valorAberto === 0 && c.valorPago > 0
    return {
      hoje: { id: 'hoje', label: '📅 Hoje', getCount: () => cobrancas.filter(c => (c.vencimentoRaw || '').slice(0, 10) === hojeStr).length },
      critico: { id: 'critico', label: '🔴 Crítico (15+)', getCount: () => cobrancas.filter(c => !pagoFilter(c) && c.diasAtraso > 15).length },
      '6-15': { id: '6-15', label: '🟠 Urgente (6-15)', getCount: () => cobrancas.filter(c => !pagoFilter(c) && c.diasAtraso >= 6 && c.diasAtraso <= 15).length },
      '1-5': { id: '1-5', label: '🟡 Atenção (1-5)', getCount: () => cobrancas.filter(c => !pagoFilter(c) && c.diasAtraso >= 1 && c.diasAtraso <= 5).length },
      avencer: { id: 'avencer', label: '🔵 A Vencer (7d)', getCount: () => cobrancas.filter(c => !pagoFilter(c) && c.diasAtraso === 0 && (c.vencimentoRaw || '').slice(0, 10) > hojeStr && (c.vencimentoRaw || '').slice(0, 10) <= fimSemanaStr).length },
      risco: { id: 'risco', label: '💥 Risco Alto', getCount: () => cobrancas.filter(c => !pagoFilter(c) && (c.diasAtraso > 30 || (c.valorAberto > 0 && c.valorPago > 0))).length },
      todos: { id: 'todos', label: '📋 Todos', getCount: () => cobrancas.length },
      pendente: { id: 'pendente', label: '⏳ Pendente', getCount: () => cobrancas.filter(c => c.valorPago === 0).length },
      parcial: { id: 'parcial', label: '◐ Parc. Pago', getCount: () => cobrancas.filter(c => c.valorAberto > 0 && c.valorPago > 0).length },
      pago: { id: 'pago', label: '✅ Pago', getCount: () => cobrancas.filter(c => c.valorAberto === 0 && c.valorPago > 0).length },
    }
  }, [cobrancas])

  function FilterChip({ f, compact = false }) {
    return (
      <button
        onClick={() => setFilter(f.id)}
        style={{
          fontSize: compact ? 11 : 12,
          padding: compact ? '6px 12px' : '7px 14px',
          borderRadius: 7,
          border: 'none',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          background: filter === f.id ? (t.primary || '#E8192C') : t.bgTertiary,
          color: filter === f.id ? '#fff' : t.textMid,
          fontWeight: filter === f.id ? 600 : 500,
          transition: 'all 0.12s',
          flexShrink: 0,
        }}
      >
        {f.label} ({f.getCount()})
      </button>
    )
  }

  return (
    <div style={{ flex: 1, background: t.bg, borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px', borderBottom: `1px solid ${t.border}` }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: t.text, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>💰</span>
            Cobranças
            <span style={{ fontSize: 11, fontWeight: 600, color: t.primary, background: t.primaryBg, padding: '2px 8px', borderRadius: 6, marginLeft: 'auto' }}>
              {cobrancas.length} registros
            </span>
            <button
              onClick={syncData}
              disabled={syncing}
              title="Sincronizar dados"
              style={{
                background: 'none',
                border: 'none',
                cursor: syncing ? 'not-allowed' : 'pointer',
                fontSize: 16,
                padding: '4px 8px',
                opacity: syncing ? 0.5 : 1,
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={e => { if (!syncing) e.currentTarget.style.opacity = '0.7' }}
              onMouseLeave={e => { if (!syncing) e.currentTarget.style.opacity = '1' }}
            >
              🔄
            </button>
          </div>
        </div>

        {/* Abas */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, borderBottom: `1px solid ${t.border}`, paddingBottom: 12 }}>
          <button
            onClick={() => setTab('lista')}
            style={{
              background: 'none',
              border: 'none',
              padding: '8px 12px',
              fontSize: 13,
              fontWeight: tab === 'lista' ? 700 : 500,
              color: tab === 'lista' ? (t.primary || '#E8192C') : t.textMid,
              cursor: 'pointer',
              borderBottom: tab === 'lista' ? `2px solid ${t.primary || '#E8192C'}` : 'none',
              transition: 'all 0.2s',
            }}
          >
            📋 Lista
          </button>
          <button
            onClick={() => setTab('dashboard')}
            style={{
              background: 'none',
              border: 'none',
              padding: '8px 12px',
              fontSize: 13,
              fontWeight: tab === 'dashboard' ? 700 : 500,
              color: tab === 'dashboard' ? (t.primary || '#E8192C') : t.textMid,
              cursor: 'pointer',
              borderBottom: tab === 'dashboard' ? `2px solid ${t.primary || '#E8192C'}` : 'none',
              transition: 'all 0.2s',
            }}
          >
            📊 Dashboard
          </button>
          <button
            onClick={() => setTab('fluxo')}
            style={{
              background: 'none',
              border: 'none',
              padding: '8px 12px',
              fontSize: 13,
              fontWeight: tab === 'fluxo' ? 700 : 500,
              color: tab === 'fluxo' ? (t.primary || '#E8192C') : t.textMid,
              cursor: 'pointer',
              borderBottom: tab === 'fluxo' ? `2px solid ${t.primary || '#E8192C'}` : 'none',
              transition: 'all 0.2s',
            }}
          >
            📈 Fluxo de Caixa
          </button>
          <button
            onClick={() => setTab('historico')}
            style={{
              background: 'none',
              border: 'none',
              padding: '8px 12px',
              fontSize: 13,
              fontWeight: tab === 'historico' ? 700 : 500,
              color: tab === 'historico' ? (t.primary || '#E8192C') : t.textMid,
              cursor: 'pointer',
              borderBottom: tab === 'historico' ? `2px solid ${t.primary || '#E8192C'}` : 'none',
              transition: 'all 0.2s',
            }}
          >
            📅 Histórico
          </button>
          <button
            onClick={() => setTab('clientes')}
            style={{
              background: 'none',
              border: 'none',
              padding: '8px 12px',
              fontSize: 13,
              fontWeight: tab === 'clientes' ? 700 : 500,
              color: tab === 'clientes' ? (t.primary || '#E8192C') : t.textMid,
              cursor: 'pointer',
              borderBottom: tab === 'clientes' ? `2px solid ${t.primary || '#E8192C'}` : 'none',
              transition: 'all 0.2s',
            }}
          >
            👥 Clientes
          </button>
        </div>

        {/* Cards de totalizadores */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
          <Card icon="💵" label="Total em Atraso" value={formatCurrency(totalizadores.totalAtraso)} color="#DC2626" />
          <Card icon="⚠️" label="Clientes Atrasados" value={totalizadores.qtdAtrasados} color="#F59E0B" />
          <Card icon="📅" label="Dias Médios" value={`${totalizadores.diasMedia}d`} color="#3B82F6" />
          <Card icon="📊" label="Total a Receber" value={formatCurrency(totalizadores.totalReceber)} color="#10B981" />
          <Card icon="✅" label="Valores Pagos" value={formatCurrency(totalizadores.totalRecebido || 0)} color="#10B981" />
          <Card icon="🔴" label="Crítico (15+)" value={totalizadores.critico} color="#DC2626" />
          <Card icon="🟠" label="Urgente (6-15)" value={totalizadores.urgente} color="#F59E0B" />
        </div>

        {/* Conteúdo Lista */}
        {tab === 'lista' && (
          <>
            {/* Busca e Filtros */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
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
                <option value="nome-asc">Nome (A → Z)</option>
                <option value="nome-desc">Nome (Z → A)</option>
                <option value="diasAtraso">Dias (maior atraso)</option>
                <option value="valor-desc">Maior dívida</option>
                <option value="valor-asc">Menor dívida</option>
                <option value="tentativas">Mais cobranças</option>
              </select>
              <div style={{ width: 1, height: 20, background: t.border, flexShrink: 0 }} />
              <FilterChip f={filterDefs.parcial} compact />
              <FilterChip f={filterDefs.pago} compact />
            </div>

            {/* Filtros rápidos por urgência — Pago/Parc. Pago ficaram ao lado da busca, ver acima */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <FilterChip f={filterDefs.hoje} />
              <FilterChip f={filterDefs.critico} />
              <FilterChip f={filterDefs['6-15']} />
              <FilterChip f={filterDefs['1-5']} />
              <FilterChip f={filterDefs.avencer} />
              <div style={{ width: 1, height: 20, background: t.border, flexShrink: 0 }} />
              <FilterChip f={filterDefs.risco} />
              <div style={{ width: 1, height: 20, background: t.border, flexShrink: 0 }} />
              <FilterChip f={filterDefs.todos} />
              <FilterChip f={filterDefs.pendente} />
            </div>
          </>
        )}
      </div>

      {/* Conteúdo */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
        {tab === 'lista' && (loading ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: t.textMuted, fontSize: 13 }}>
            ⏳ Carregando cobranças...
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '20px', background: '#FEE2E2', color: '#DC2626', borderRadius: 8, margin: '12px 24px', fontSize: 12 }}>
            ⚠️ {error}
            <button onClick={loadCobrancas} style={{
              display: 'block',
              marginTop: 10,
              padding: '6px 12px',
              background: '#DC2626',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 12,
            }}>
              Tentar novamente
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: t.textMuted, fontSize: 13 }}>
            Nenhuma cobrança encontrada
          </div>
        ) : (
          <div>
            {filtered.map(cobranca => {
              const colors = statusColor(cobranca.status, cobranca.diasAtraso)
              const percentualPago = cobranca.valorTotal > 0 ? Math.round((cobranca.valorPago / cobranca.valorTotal) * 100) : 0
              return (
                <div
                  key={cobranca.id}
                  style={{
                    padding: '12px 24px',
                    borderBottom: `1px solid ${t.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = t.bgSecondary }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  {/* Status badge */}
                  <div style={{
                    background: colors.bg,
                    color: colors.text,
                    padding: '5px 8px',
                    borderRadius: 6,
                    fontSize: 10,
                    fontWeight: 600,
                    minWidth: 64,
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}>
                    {colors.icon} {colors.label}
                  </div>

                  {/* Info cliente */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: t.text, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {cobranca.nome}
                    </div>
                    <div style={{ fontSize: 11, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {cobranca.telefone} • Venc: {cobranca.vencimento}
                    </div>
                  </div>

                  {/* Tentativas */}
                  <div style={{ textAlign: 'center', fontSize: 11, minWidth: 40, flexShrink: 0 }}>
                    <div style={{ fontWeight: 700, color: t.text }}>{cobranca.quantidadeCobrancas}</div>
                    <div style={{ fontSize: 9, color: t.textMuted }}>tentativas</div>
                  </div>

                  {/* Dias em atraso */}
                  {cobranca.diasAtraso > 0 && (
                    <div style={{ textAlign: 'center', fontSize: 11, minWidth: 34, flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, color: '#DC2626' }}>{cobranca.diasAtraso}d</div>
                      <div style={{ fontSize: 9, color: t.textMuted }}>atraso</div>
                    </div>
                  )}

                  {/* Valores */}
                  <div style={{ textAlign: 'right', fontSize: 11, minWidth: 84, flexShrink: 0 }}>
                    <div style={{ fontWeight: 600, color: t.text }}>
                      {formatCurrency(cobranca.valorAberto)}
                    </div>
                    <div style={{ fontSize: 9, color: t.textMuted }}>
                      de {formatCurrency(cobranca.valorTotal)}
                    </div>
                  </div>

                  {/* % pago — chip, sem barra visual (economiza espaço horizontal pro nome) */}
                  <div style={{
                    fontSize: 11, fontWeight: 700, minWidth: 40, textAlign: 'center', flexShrink: 0,
                    color: percentualPago >= 70 ? '#10B981' : percentualPago >= 30 ? '#F59E0B' : '#DC2626',
                    background: percentualPago >= 70 ? '#ECFDF5' : percentualPago >= 30 ? '#FFFBEB' : '#FEF2F2',
                    borderRadius: 6, padding: '3px 6px',
                  }}>
                    {percentualPago}%
                  </div>

                  {/* Ações */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      title={`WhatsApp: ${cobranca.nome}`}
                      onClick={async () => {
                        const telefone = await buscarTelefoneParaWhatsApp(cobranca.clienteId, cobranca.nome)
                        if (!telefone || telefone === '-') {
                          alert('⚠️ Telefone não disponível para este cliente')
                          return
                        }
                        const msg = `Olá ${cobranca.nome}, seu débito de ${formatCurrency(cobranca.valorAberto)} venceu há ${cobranca.diasAtraso} dias. Podemos combinar um pagamento?\n\nPara acompanhar sua notinha, acesse:\nhttps://primeapp.base44.app/portal`
                        const encodedMsg = encodeURIComponent(msg)
                        const phone = telefone.replace(/\D/g, '')
                        window.open(`https://wa.me/55${phone}?text=${encodedMsg}`, '_blank')
                      }}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 6,
                        border: 'none',
                        background: '#ECFDF5',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'opacity 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.opacity = 0.8 }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = 1 }}
                    >
                      <WhatsAppIcon size={17} />
                    </button>
                    <button
                      title="Copiar link do Portal do Cliente"
                      onClick={async () => {
                        const msg = `Olá ${cobranca.nome}! Para acompanhar sua notinha, acesse o Portal do Cliente:\nhttps://primeapp.base44.app/portal`
                        try {
                          await navigator.clipboard.writeText(msg)
                          alert('✅ Link copiado! Cole no WhatsApp do cliente.')
                        } catch (err) {
                          console.error('[CobrancasPage] Erro ao copiar link do portal:', err.message)
                          alert('⚠️ Não foi possível copiar o link.')
                        }
                      }}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 6,
                        border: `1px solid ${t.border}`,
                        background: t.bgTertiary,
                        color: t.textMid,
                        cursor: 'pointer',
                        fontSize: 14,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.opacity = 0.8 }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = 1 }}
                    >
                      🔗
                    </button>
                    <button
                      title="Registrar pagamento manual"
                      onClick={() => setPagamentoModalCobranca(cobranca)}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 6,
                        border: 'none',
                        background: '#ECFDF5',
                        color: '#047857',
                        cursor: 'pointer',
                        fontSize: 14,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'opacity 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.opacity = 0.8 }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = 1 }}
                    >
                      💰
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ))}

        {/* Dashboard */}
        {tab === 'dashboard' && (
          <DashboardCobrancas cobrancas={cobrancas} theme={t} />
        )}

        {/* Fluxo de Caixa */}
        {tab === 'fluxo' && (
          <FluxoCaixaCobrancas cobrancas={cobrancas} totalizadores={totalizadores} theme={t} />
        )}

        {/* Histórico de Atividades */}
        {tab === 'historico' && (
          <HistoricoAtividadesCobrancas atividades={historicoAtividades} theme={t} />
        )}

        {/* Clientes */}
        {tab === 'clientes' && (
          <ClientesTab clientes={clientes} search={clienteSearch} setSearch={setClienteSearch} sortBy={clienteSortBy} setSortBy={setClienteSortBy} theme={t} sincronizarTelefones={sincronizarTelefones} sincronizandoTelefones={sincronizandoTelefones} />
        )}
      </div>

      {pagamentoModalCobranca && (
        <PagamentoModal
          cobranca={pagamentoModalCobranca}
          theme={t}
          onClose={() => setPagamentoModalCobranca(null)}
          onSalvo={() => { setPagamentoModalCobranca(null); loadCobrancas() }}
        />
      )}
    </div>
  )
}

function PagamentoModal({ cobranca, theme: t, onClose, onSalvo }) {
  const [valor, setValor] = useState(cobranca.valorAberto?.toFixed(2) || '0.00')
  const [forma, setForma] = useState('pix')
  const [data, setData] = useState(new Date().toISOString().slice(0, 10))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function handleSalvar() {
    const valorNum = parseFloat(valor.replace(',', '.'))
    if (!valorNum || valorNum <= 0) {
      setErro('Digite um valor válido')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      await registrarPagamentoManual(cobranca.id, { valorPago: valorNum, formaPagamento: forma, dataPagamento: data })
      onSalvo()
    } catch (err) {
      setErro('Erro ao registrar: ' + err.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: t.bg, borderRadius: 12, padding: 24, width: '100%', maxWidth: 380, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: t.text, margin: 0 }}>Registrar Pagamento</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: t.textMuted }}>✕</button>
        </div>

        <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 4 }}>{cobranca.nome}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: t.text, marginBottom: 16 }}>
          {formatCurrency(cobranca.valorAberto)} <span style={{ fontSize: 11, fontWeight: 400, color: t.textMuted }}>em aberto</span>
        </div>

        <label style={{ fontSize: 11, fontWeight: 600, color: t.textMid, display: 'block', marginBottom: 4 }}>Valor pago</label>
        <input
          value={valor}
          onChange={e => setValor(e.target.value)}
          style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${t.border}`, background: t.inputBg, color: t.text, fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }}
        />

        <label style={{ fontSize: 11, fontWeight: 600, color: t.textMid, display: 'block', marginBottom: 4 }}>Forma de pagamento</label>
        <select
          value={forma}
          onChange={e => setForma(e.target.value)}
          style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${t.border}`, background: t.inputBg, color: t.text, fontSize: 13, marginBottom: 12, boxSizing: 'border-box' }}
        >
          <option value="pix">PIX</option>
          <option value="dinheiro">Dinheiro</option>
          <option value="cartao">Cartão</option>
          <option value="transferencia">Transferência</option>
          <option value="outro">Outro</option>
        </select>

        <label style={{ fontSize: 11, fontWeight: 600, color: t.textMid, display: 'block', marginBottom: 4 }}>Data do pagamento</label>
        <input
          type="date"
          value={data}
          onChange={e => setData(e.target.value)}
          style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${t.border}`, background: t.inputBg, color: t.text, fontSize: 13, marginBottom: 16, boxSizing: 'border-box' }}
        />

        {erro && <div style={{ fontSize: 11, color: '#DC2626', marginBottom: 12 }}>{erro}</div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 8, border: `1px solid ${t.border}`, background: 'none', color: t.textMid, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Cancelar</button>
          <button
            onClick={handleSalvar}
            disabled={salvando}
            style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: '#047857', color: '#fff', cursor: salvando ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, opacity: salvando ? 0.6 : 1 }}
          >
            {salvando ? 'Salvando...' : 'Confirmar Pagamento'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Card({ icon, label, value, color }) {
  const { theme: t } = useTheme()
  return (
    <div style={{
      background: t.bgSecondary,
      border: `1px solid ${t.border}`,
      borderRadius: 8,
      padding: 14,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
    }}>
      <div style={{ fontSize: 24 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color }}>
          {value}
        </div>
      </div>
    </div>
  )
}

function DashboardCobrancas({ cobrancas, theme: t }) {
  // Gráfico 1: Distribuição por Status
  const statusDistribution = useMemo(() => {
    const dist = {
      'Atrasado': cobrancas.filter(c => c.diasAtraso > 0).length,
      'Semanal': cobrancas.filter(c => c.diasAtraso === 0 && c.status === 'Semanal').length,
      'Mensal': cobrancas.filter(c => c.diasAtraso === 0 && c.status === 'Mensal').length,
      'Pago': cobrancas.filter(c => c.valorAberto === 0 && c.valorPago > 0).length,
    }
    return Object.entries(dist).map(([name, value]) => ({ name, value }))
  }, [cobrancas])

  // Gráfico 2: Top 10 Maiores Devedores
  const topDevedores = useMemo(() => {
    return cobrancas
      .sort((a, b) => (b.valorAberto || 0) - (a.valorAberto || 0))
      .slice(0, 10)
      .map(c => ({ nome: c.nome.substring(0, 20), valor: c.valorAberto || 0 }))
  }, [cobrancas])

  // Gráfico 3: Recebimentos últimos 30 dias - Com dados REAIS de historicoPagamentos
  const recebimentos = useMemo(() => {
    const dias = {}
    const hoje = new Date()

    // Inicializar últimos 30 dias
    for (let i = 29; i >= 0; i--) {
      const data = new Date(hoje.getTime() - i * 24 * 60 * 60 * 1000)
      const diaKey = `${data.getDate()}/${data.getMonth() + 1}`
      dias[diaKey] = 0
    }

    // Somar pagamentos de cada dia a partir de historicoPagamentos
    cobrancas.forEach(c => {
      if (c.historicoPagamentos && Array.isArray(c.historicoPagamentos)) {
        c.historicoPagamentos.forEach(pagto => {
          const pagtoDate = new Date(pagto.data)
          const diaKey = `${pagtoDate.getDate()}/${pagtoDate.getMonth() + 1}`

          // Se está nos últimos 30 dias, somar
          if (dias.hasOwnProperty(diaKey)) {
            dias[diaKey] += pagto.valor || 0
          }
        })
      }
    })

    // Converter para array ordenado
    return Object.entries(dias).map(([data, valor]) => ({ data, valor }))
  }, [cobrancas])

  const COLORS = ['#DC2626', '#F59E0B', '#10B981', '#3B82F6']

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: 20 }}>
        {/* Gráfico 1: Distribuição por Status */}
        <div style={{ background: t.bgSecondary, border: `1px solid ${t.border}`, borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 12 }}>📊 Distribuição por Status</div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={statusDistribution} cx="50%" cy="50%" labelLine={false} label={({ name, value }) => `${name}: ${value}`} outerRadius={80} fill="#8884d8" dataKey="value">
                {statusDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [`${value} cobranças`, 'Quantidade']} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Gráfico 2: Top 10 Maiores Devedores */}
        <div style={{ background: t.bgSecondary, border: `1px solid ${t.border}`, borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 12 }}>👥 Top 10 Maiores Devedores</div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topDevedores} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
              <XAxis dataKey="nome" angle={-45} textAnchor="end" height={100} fontSize={11} tick={{ fill: t.textMid }} />
              <YAxis tick={{ fill: t.textMid }} />
              <Tooltip formatter={(value) => [`R$ ${value.toFixed(2)}`, 'Dívida']} />
              <Bar dataKey="valor" fill="#DC2626" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Gráfico 3: Recebimentos Últimos 30 Dias */}
        <div style={{ background: t.bgSecondary, border: `1px solid ${t.border}`, borderRadius: 8, padding: 16, gridColumn: 'span 2' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 12 }}>📈 Recebimentos - Últimos 30 Dias</div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={recebimentos}>
              <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
              <XAxis dataKey="data" tick={{ fill: t.textMid }} fontSize={11} />
              <YAxis tick={{ fill: t.textMid }} />
              <Tooltip formatter={(value) => [`R$ ${value.toFixed(2)}`, 'Recebido']} />
              <Line type="monotone" dataKey="valor" stroke="#10B981" dot={false} isAnimationActive={true} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

function FluxoCaixaCobrancas({ cobrancas, totalizadores, theme: t }) {
  // Gráfico: Fluxo de Caixa Mensal (6 meses) - Com dados REAIS do Base44
  const fluxoCaixa = useMemo(() => {
    const meses = {}
    const hoje = new Date()

    // Inicializar últimos 6 meses
    for (let i = 5; i >= 0; i--) {
      const data = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
      const mesKey = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`
      const mesLabel = data.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
      meses[mesKey] = { mes: mesLabel, Previsto: 0, Recebido: 0 }
    }

    // Somar valores REAIS do Base44
    cobrancas.forEach(c => {
      // PREVISTO: valorTotal pelo mês de vencimento
      if (c.vencimento) {
        const vencDate = new Date(c.vencimento.split('/').reverse().join('-'))
        const mesKey = `${vencDate.getFullYear()}-${String(vencDate.getMonth() + 1).padStart(2, '0')}`
        if (meses[mesKey]) {
          meses[mesKey].Previsto += c.valorTotal || 0
        }
      }

      // RECEBIDO: somar histórico de pagamentos
      if (c.historicoPagamentos && Array.isArray(c.historicoPagamentos)) {
        c.historicoPagamentos.forEach(pagto => {
          const pagtoDate = new Date(pagto.data)
          const mesKey = `${pagtoDate.getFullYear()}-${String(pagtoDate.getMonth() + 1).padStart(2, '0')}`
          if (meses[mesKey]) {
            meses[mesKey].Recebido += pagto.valor || 0
          }
        })
      }
    })

    return Object.values(meses)
  }, [cobrancas])

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
      <div style={{ background: t.bgSecondary, border: `1px solid ${t.border}`, borderRadius: 8, padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 16 }}>💰 Fluxo de Caixa Mensal</div>

        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={fluxoCaixa} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
            <XAxis dataKey="mes" tick={{ fill: t.textMid }} fontSize={12} />
            <YAxis tick={{ fill: t.textMid }} />
            <Tooltip
              formatter={(value) => [`R$ ${value.toLocaleString('pt-BR')}`, '']}
              labelFormatter={(label) => `${label}`}
              contentStyle={{ background: t.bgSecondary, border: `1px solid ${t.border}`, borderRadius: 6 }}
            />
            <Legend
              wrapperStyle={{ paddingTop: 20 }}
              iconType="square"
            />
            <Bar dataKey="Previsto" fill="#3B82F6" radius={[8, 8, 0, 0]} />
            <Bar dataKey="Recebido" fill="#10B981" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>

        <div style={{ marginTop: 20, padding: 12, background: t.bgTertiary, borderRadius: 6 }}>
          <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 8 }}>
            📌 <strong>Última atualização:</strong> {new Date().toLocaleString('pt-BR')}
          </div>
          <div style={{ fontSize: 11, color: t.textMuted }}>
            💡 <strong>Dica:</strong> Clique em "Sincronizar" acima para atualizar os dados com informações reais do Base44.
          </div>
        </div>
      </div>
    </div>
  )
}

function ClientesTab({ clientes, search, setSearch, sortBy, setSortBy, theme: t, sincronizarTelefones, sincronizandoTelefones }) {
  const [filterSemTelefone, setFilterSemTelefone] = useState(false)

  // Contar clientes sem telefone
  const clientesSemTelefone = useMemo(() =>
    clientes.filter(c => !c.telefone || c.telefone === '-').length
  , [clientes])

  // Filtrar e ordenar clientes
  const clientesFiltrados = useMemo(() => {
    let result = clientes

    // Filtro: Sem Telefone
    if (filterSemTelefone) {
      result = result.filter(c => !c.telefone || c.telefone === '-')
    }

    // Busca por nome, telefone ou documento
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(c =>
        (c.nome && c.nome.toLowerCase().includes(q)) ||
        (c.telefone && c.telefone.includes(q)) ||
        (c.documento && c.documento.includes(q))
      )
    }

    // Ordenar
    if (sortBy === 'nome-asc') result.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
    else if (sortBy === 'nome-desc') result.sort((a, b) => (b.nome || '').localeCompare(a.nome || ''))
    else if (sortBy === 'telefone') result.sort((a, b) => (a.telefone || '').localeCompare(b.telefone || ''))
    else if (sortBy === 'cidade') result.sort((a, b) => (a.cidade || '').localeCompare(b.cidade || ''))

    return result
  }, [clientes, search, sortBy, filterSemTelefone])

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
      {/* Botão de Sincronização */}
      <button
        onClick={sincronizarTelefones}
        disabled={sincronizandoTelefones}
        style={{
          marginBottom: 16,
          padding: '10px 16px',
          background: sincronizandoTelefones ? '#9CA3AF' : '#10B981',
          color: '#FFFFFF',
          border: 'none',
          borderRadius: 8,
          cursor: sincronizandoTelefones ? 'not-allowed' : 'pointer',
          fontWeight: 600,
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          transition: 'all 0.2s',
        }}
      >
        {sincronizandoTelefones ? '⏳ Sincronizando...' : '🔄 Sincronizar Telefones do Base44'}
      </button>

      {/* Contador de Clientes Sem Telefone */}
      {clientesSemTelefone > 0 && (
        <div style={{
          marginBottom: 16,
          padding: 12,
          background: '#FEF3C7',
          border: '1px solid #FBBF24',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 13, color: '#92400E', fontWeight: 600 }}>
            ⚠️ {clientesSemTelefone} cliente{clientesSemTelefone !== 1 ? 's' : ''} sem telefone
          </div>
          <button
            onClick={() => setFilterSemTelefone(!filterSemTelefone)}
            style={{
              padding: '4px 12px',
              fontSize: 12,
              background: filterSemTelefone ? '#FBBF24' : t.bgTertiary,
              color: filterSemTelefone ? '#FFFFFF' : t.textMid,
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 600,
              transition: 'all 0.2s',
            }}
          >
            {filterSemTelefone ? '✓ Filtrando' : 'Filtrar'}
          </button>
        </div>
      )}

      {/* Filtros e Busca */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, telefone ou documento..."
            style={{
              flex: 1,
              border: `1px solid ${t.border}`,
              borderRadius: 8,
              padding: '8px 12px',
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
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 13,
              background: t.inputBg,
              color: t.text,
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="nome-asc">Nome (A → Z)</option>
            <option value="nome-desc">Nome (Z → A)</option>
            <option value="telefone">Telefone</option>
            <option value="cidade">Cidade</option>
          </select>
        </div>
      </div>

      {/* Lista de Clientes */}
      {clientesFiltrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: t.textMuted, fontSize: 13 }}>
          Nenhum cliente encontrado
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {clientesFiltrados.map(cliente => {
            const semTelefone = !cliente.telefone || cliente.telefone === '-'
            return (
            <div
              key={cliente.id}
              style={{
                background: semTelefone ? '#F3F4F6' : t.bgSecondary,
                border: `1px solid ${semTelefone ? '#E5E7EB' : t.border}`,
                borderRadius: 8,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                opacity: semTelefone ? 0.75 : 1,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: t.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                {semTelefone && <span>⚠️</span>}
                {cliente.nome}
              </div>

              {cliente.telefone && cliente.telefone !== '-' ? (
                <div style={{ fontSize: 11, color: t.textMuted }}>
                  📱 {cliente.telefone}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: '#DC2626', fontWeight: 600 }}>
                  🚨 Sem telefone
                </div>
              )}

              {cliente.documento && cliente.documento !== '-' && (
                <div style={{ fontSize: 11, color: t.textMuted }}>
                  🆔 {cliente.documento}
                </div>
              )}

              {cliente.email && cliente.email !== '-' && (
                <div style={{ fontSize: 11, color: t.textMuted }}>
                  ✉️ {cliente.email}
                </div>
              )}

              {(cliente.cidade || cliente.estado) && (
                <div style={{ fontSize: 11, color: t.textMuted }}>
                  📍 {cliente.cidade}{cliente.estado ? ` - ${cliente.estado}` : ''}
                </div>
              )}

              {cliente.limiteCredito > 0 && (
                <div style={{ fontSize: 11, color: t.primary, fontWeight: 600 }}>
                  Limite: R$ {cliente.limiteCredito.toFixed(2)}
                </div>
              )}
            </div>
            )
          })}
        </div>
      )}

      {/* Info */}
      <div style={{ marginTop: 20, padding: 12, background: t.bgTertiary, borderRadius: 6 }}>
        <div style={{ fontSize: 11, color: t.textMuted }}>
          ✅ <strong>Clientes sincronizados:</strong> {clientesFiltrados.length} de {clientes.length} registros do Base44
        </div>
      </div>
    </div>
  )
}

function HistoricoAtividadesCobrancas({ atividades: atividadesRaw, theme: t }) {
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [busca, setBusca] = useState('')

  // Normalizar e filtrar atividades do Base44
  const atividades = useMemo(() => {
    let result = atividadesRaw || []

    // Filtrar por tipo
    if (filtroTipo !== 'todos') {
      result = result.filter(a => a.tipo === filtroTipo)
    }

    // Filtrar por busca (no entityId ou na descrição)
    if (busca.trim()) {
      const q = busca.toLowerCase()
      result = result.filter(a =>
        (a.entityId && a.entityId.toLowerCase().includes(q)) ||
        (a.descricao && a.descricao.toLowerCase().includes(q))
      )
    }

    return result.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  }, [atividadesRaw, filtroTipo, busca])

  // Agrupar por data
  const atividadesPorData = useMemo(() => {
    const grupos = {}
    atividades.forEach(a => {
      const data = new Date(a.timestamp)
      const dataKey = data.toLocaleDateString('pt-BR')
      if (!grupos[dataKey]) grupos[dataKey] = []
      grupos[dataKey].push(a)
    })
    return grupos
  }, [atividades])

  const tipoConfig = {
    pagamento: { icon: '✅', cor: '#10B981', label: 'Pagamento' },
    edicao: { icon: '📝', cor: '#3B82F6', label: 'Edição' },
    importacao: { icon: '📥', cor: '#F59E0B', label: 'Importação' },
    exclusao: { icon: '🗑️', cor: '#DC2626', label: 'Exclusão' },
    novo: { icon: '🆕', cor: '#8B5CF6', label: 'Novo' },
    outro: { icon: '📋', cor: '#6B7280', label: 'Outro' },
  }
  const tipoFallback = { icon: '📋', cor: '#6B7280', label: 'Atividade' }

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
      {/* Filtros */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 9, color: t.textMuted, fontWeight: 600, marginBottom: 8 }}>TIPO DE ATIVIDADE</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {['todos', 'pagamento', 'edicao', 'importacao', 'exclusao'].map(tipo => (
            <button
              key={tipo}
              onClick={() => setFiltroTipo(tipo)}
              style={{
                fontSize: 11,
                padding: '6px 12px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                background: filtroTipo === tipo ? (t.primary || '#E8192C') : t.bgTertiary,
                color: filtroTipo === tipo ? '#fff' : t.textMid,
                fontWeight: filtroTipo === tipo ? 600 : 500,
                transition: 'all 0.12s',
              }}
            >
              {tipo === 'todos' ? 'Todos' : tipoConfig[tipo]?.label}
            </button>
          ))}
        </div>

        {/* Busca */}
        <input
          type="text"
          placeholder="Buscar por cliente..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            fontSize: 12,
            borderRadius: 6,
            border: `1px solid ${t.border}`,
            background: t.bgTertiary,
            color: t.text,
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Timeline de Atividades */}
      <div>
        {Object.entries(atividadesPorData).length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: t.textMuted }}>
            📭 Nenhuma atividade encontrada
          </div>
        ) : (
          Object.entries(atividadesPorData).map(([dataLabel, ativs]) => (
            <div key={dataLabel} style={{ marginBottom: 24 }}>
              {/* Cabeçalho da data */}
              <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${t.border}` }}>
                {dataLabel} ({ativs.length})
              </div>

              {/* Cards de atividade */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {ativs.map(a => {
                  const config = tipoConfig[a.tipo] ?? tipoFallback
                  return (
                    <div
                      key={a.id}
                      style={{
                        display: 'flex',
                        gap: 12,
                        padding: 12,
                        background: t.bgSecondary,
                        border: `1px solid ${t.border}`,
                        borderRadius: 8,
                        alignItems: 'flex-start',
                      }}
                    >
                      {/* Ícone com cor */}
                      <div
                        style={{
                          fontSize: 20,
                          minWidth: 28,
                          textAlign: 'center',
                          opacity: 0.8,
                        }}
                      >
                        {config.icon}
                      </div>

                      {/* Conteúdo */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: t.text, marginBottom: 3 }}>
                          {a.descricao}
                        </div>
                        <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>
                          {a.entityId || '-'}
                        </div>

                        {/* Valores */}
                        <div style={{ display: 'flex', gap: 16, fontSize: 11 }}>
                          {a.valor > 0 && (
                            <span style={{ fontWeight: 600, color: config.cor }}>
                              R$ {a.valor.toFixed(2)}
                            </span>
                          )}
                          {a.valorAnterior && (
                            <span style={{ color: t.textMuted, textDecoration: 'line-through' }}>
                              R$ {a.valorAnterior} → {a.valorNovo}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Hora */}
                      <div style={{ fontSize: 11, color: t.textMuted, textAlign: 'right', minWidth: 60 }}>
                        {new Date(a.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Info */}
      <div style={{ marginTop: 20, padding: 12, background: t.bgTertiary, borderRadius: 6 }}>
        <div style={{ fontSize: 11, color: t.textMuted }}>
          ✅ <strong>Histórico em tempo real:</strong> Dados sincronizados da entidade ActivityLog do Base44 ({atividades.length} registros)
        </div>
      </div>
    </div>
  )
}
