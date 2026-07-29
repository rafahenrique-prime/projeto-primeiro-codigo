import { useState, useMemo, useEffect } from 'react'
import { useTheme } from '../theme.jsx'
import { getAllCobrancas, getTotalizadores, getHistoricoAtividades, getClientes, sincronizarTelefonesEncontrados, registrarPagamentoManual } from '../services/crm/cobrancasService'
import { PieChart, Pie, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'
import { RefreshCw, AlertTriangle, Clock, BarChart3, CheckCircle2, Circle, Flame, Users, LayoutDashboard, TrendingUp, CalendarDays, CreditCard, Search, Phone, MessageCircle, PencilLine, Import, Trash2, PlusCircle, FileText } from 'lucide-react'
import ParcelasTab from '../components/cobrancas/ParcelasTab'
import ClientesEmCobrancaTab from '../components/cobrancas/ClientesEmCobrancaTab'
import WhatsAppSendModal from '../components/cobrancas/WhatsAppSendModal'

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

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export default function CobrancasPage() {
  const { theme: t } = useTheme()
  const [tab, setTab] = useState('clientes-cobranca') // 'clientes-cobranca' | 'dashboard' | 'fluxo' | 'historico' | 'clientes' | 'parcelas'
  const [initialParcelasFilter, setInitialParcelasFilter] = useState(null) // { clienteId, nome } | null — vindo de "💳 Ver parcelas"
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
  const [clienteSelecionado, setClienteSelecionado] = useState(null)

  useEffect(() => {
    loadCobrancas()
  }, [])

  // "💳 Ver parcelas" (aba Clientes em Cobrança) — abre a aba Parcelas já filtrada pelo cliente.
  function handleVerParcelas(filtro) {
    setInitialParcelasFilter(filtro)
    setTab('parcelas')
  }

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

  return (
    <div style={{ flex: 1, background: t.bg, borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '24px 24px 0' }}>
        <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: t.text, margin: 0, letterSpacing: '-0.01em' }}>
            Cobranças
          </h1>
          <span style={{ fontSize: 12, fontWeight: 500, color: t.textMuted, marginLeft: 'auto' }}>
            {cobrancas.length} registros
          </span>
          <button
            onClick={syncData}
            disabled={syncing}
            title="Sincronizar dados"
            style={{
              background: 'none',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 6,
              cursor: syncing ? 'not-allowed' : 'pointer',
              color: t.textMuted,
              transition: 'background-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { if (!syncing) { e.currentTarget.style.background = t.bgTertiary; e.currentTarget.style.color = t.text } }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = t.textMuted }}
          >
            <RefreshCw size={14} strokeWidth={2} style={syncing ? { animation: 'spin 0.8s linear infinite' } : undefined} />
          </button>
        </div>

        {/* Abas — underline neutro, sem cor de marca no texto inativo/ativo */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: `1px solid ${t.borderLight || t.border}` }}>
          {[
            { id: 'clientes-cobranca', label: 'Clientes em Cobrança', Icon: Users },
            { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
            { id: 'fluxo', label: 'Fluxo de Caixa', Icon: TrendingUp },
            { id: 'historico', label: 'Histórico', Icon: CalendarDays },
            { id: 'clientes', label: 'Clientes', Icon: Users },
            { id: 'parcelas', label: 'Parcelas', Icon: CreditCard },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => { if (id === 'parcelas') setInitialParcelasFilter(null); setTab(id) }}
              style={{
                background: 'none',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 4px',
                marginRight: 20,
                fontSize: 13,
                fontWeight: 600,
                color: tab === id ? t.text : t.textMuted,
                cursor: 'pointer',
                borderBottom: tab === id ? `2px solid ${t.text}` : '2px solid transparent',
                marginBottom: -1,
                transition: 'color 0.15s',
              }}
            >
              <Icon size={14} strokeWidth={2} />
              {label}
            </button>
          ))}
        </div>

        {/* Cards de totalizadores — flat, sem borda, hierarquia por tamanho */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 4, marginBottom: 20 }}>
          <Card Icon={CreditCard} label="Total em Atraso" value={formatCurrency(totalizadores.totalAtraso)} tone="danger" />
          <Card Icon={AlertTriangle} label="Clientes Atrasados" value={totalizadores.qtdAtrasados} tone="warning" />
          <Card Icon={Clock} label="Dias Médios" value={`${totalizadores.diasMedia}d`} tone="neutral" />
          <Card Icon={BarChart3} label="Total a Receber" value={formatCurrency(totalizadores.totalReceber)} tone="neutral" />
          <Card Icon={CheckCircle2} label="Valores Pagos" value={formatCurrency(totalizadores.totalRecebido || 0)} tone="success" />
          <Card Icon={Flame} label="Crítico (15+)" value={totalizadores.critico} tone="danger" />
          <Card Icon={Circle} label="Urgente (6-15)" value={totalizadores.urgente} tone="warning" />
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Conteúdo */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
        {tab === 'clientes-cobranca' && (loading ? (
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
        ) : (
          <ClientesEmCobrancaTab cobrancas={cobrancas} theme={t} onVerParcelas={handleVerParcelas} />
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
          <ClientesTab clientes={clientes} search={clienteSearch} setSearch={setClienteSearch} sortBy={clienteSortBy} setSortBy={setClienteSortBy} theme={t} sincronizarTelefones={sincronizarTelefones} sincronizandoTelefones={sincronizandoTelefones} clienteSelecionado={clienteSelecionado} setClienteSelecionado={setClienteSelecionado} />
        )}

        {/* Parcelas */}
        {tab === 'parcelas' && (
          <ParcelasTab
            cobrancas={cobrancas}
            theme={t}
            initialClienteFilter={initialParcelasFilter}
            onClearInitialFilter={() => setInitialParcelasFilter(null)}
            setClienteSelecionado={setClienteSelecionado}
            setPagamentoModalCobranca={setPagamentoModalCobranca}
          />
        )}
      </div>

      {clienteSelecionado && (
        <WhatsAppSendModal
          cliente={clienteSelecionado}
          // Este mount é compartilhado por ParcelasTab (passa a própria parcela
          // normalizada, que tem valorTotal) e ClientesTab (passa um Cliente cru, sem
          // valorTotal) — heurística local só pra decidir se há 1 parcela em contexto
          // ou nenhuma; nunca resolve valor/vencimento/PIX aqui.
          parcelas={typeof clienteSelecionado.valorTotal === 'number' ? [clienteSelecionado] : []}
          theme={t}
          onClose={() => setClienteSelecionado(null)}
        />
      )}

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

const CARD_TONES = {
  neutral: '#71717A',
  success: '#059669',
  warning: '#B45309',
  danger: '#DC2626',
}

function Card({ Icon, label, value, tone = 'neutral' }) {
  const { theme: t } = useTheme()
  const toneColor = CARD_TONES[tone]
  return (
    <div style={{
      padding: '12px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: t.textMuted }}>
        {Icon && <Icon size={12} strokeWidth={2} style={{ color: toneColor }} />}
        <span style={{ fontSize: 11, fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: t.text, letterSpacing: '-0.01em' }}>
        {value}
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

function ClientesTab({ clientes, search, setSearch, sortBy, setSortBy, theme: t, sincronizarTelefones, sincronizandoTelefones, clienteSelecionado, setClienteSelecionado }) {
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
    <div style={{ padding: '24px 24px 32px', overflowY: 'auto', flex: 1 }}>
      {/* Busca, ordenação e sincronizar — mesmo padrão da aba Clientes em Cobrança */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: 280 }}>
          <Search size={14} strokeWidth={2} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: t.textMuted }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, telefone ou documento"
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
          <option value="nome-asc">Nome (A → Z)</option>
          <option value="nome-desc">Nome (Z → A)</option>
          <option value="telefone">Telefone</option>
          <option value="cidade">Cidade</option>
        </select>
        {clientesSemTelefone > 0 && (
          <button
            onClick={() => setFilterSemTelefone(!filterSemTelefone)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 12px',
              fontSize: 12.5,
              fontWeight: 600,
              background: filterSemTelefone ? t.text : t.bgTertiary,
              color: filterSemTelefone ? t.bg : '#B45309',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <AlertTriangle size={13} strokeWidth={2} />
            {clientesSemTelefone} sem telefone
          </button>
        )}
        <button
          onClick={sincronizarTelefones}
          disabled={sincronizandoTelefones}
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

      <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 8 }}>
        {clientesFiltrados.length} de {clientes.length} clientes
      </div>

      {/* Lista de Clientes — mesma densidade e tipografia da aba Clientes em Cobrança */}
      {clientesFiltrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: t.textMuted, fontSize: 14 }}>
          Nenhum cliente encontrado
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {clientesFiltrados.map((cliente, idx) => {
            const semTelefone = !cliente.telefone || cliente.telefone === '-'
            return (
              <div
                key={cliente.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '11px 12px',
                  borderBottom: idx < clientesFiltrados.length - 1 ? `1px solid ${t.borderLight || t.border}` : 'none',
                  background: t.bg,
                  opacity: semTelefone ? 0.6 : 1,
                  transition: 'background-color 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = t.bgSecondary}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = t.bg}
              >
                <div style={{ flex: '0 0 220px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13.5, fontWeight: 600, color: t.text }}>
                  {cliente.nome}
                </div>

                <div style={{ flex: '0 0 150px', fontSize: 12, color: semTelefone ? '#B45309' : t.textMid, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Phone size={12} strokeWidth={2} />
                  {semTelefone ? 'Sem telefone' : cliente.telefone}
                </div>

                <div style={{ flex: '0 0 130px', fontSize: 12, color: t.textMuted }}>
                  {cliente.documento && cliente.documento !== '-' ? cliente.documento : '—'}
                </div>

                <div style={{ flex: '0 0 140px', fontSize: 12, color: t.textMuted }}>
                  {(cliente.cidade || cliente.estado) ? `${cliente.cidade || ''}${cliente.estado ? ` - ${cliente.estado}` : ''}` : '—'}
                </div>

                <div style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: t.text }}>
                  {cliente.limiteCredito > 0 ? formatCurrency(cliente.limiteCredito) : ''}
                </div>

                <button
                  onClick={() => setClienteSelecionado(cliente)}
                  disabled={semTelefone}
                  title={semTelefone ? 'Cliente sem telefone válido' : 'Enviar mensagem'}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 6,
                    border: 'none',
                    background: 'transparent',
                    color: semTelefone ? t.borderMid : t.textMid,
                    cursor: semTelefone ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s',
                    flexShrink: 0,
                  }}
                  onMouseEnter={e => { if (!semTelefone) { e.currentTarget.style.background = '#ECFDF5'; e.currentTarget.style.color = '#059669' } }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = semTelefone ? t.borderMid : t.textMid }}
                >
                  <MessageCircle size={15} strokeWidth={2} />
                </button>
              </div>
            )
          })}
        </div>
      )}
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
    pagamento: { Icon: CheckCircle2, cor: '#059669', bg: '#ECFDF5', label: 'Pagamento' },
    edicao: { Icon: PencilLine, cor: '#52525B', bg: '#F4F4F5', label: 'Edição' },
    importacao: { Icon: Import, cor: '#B45309', bg: '#FFFBEB', label: 'Importação' },
    exclusao: { Icon: Trash2, cor: '#DC2626', bg: '#FEF2F2', label: 'Exclusão' },
    novo: { Icon: PlusCircle, cor: '#52525B', bg: '#F4F4F5', label: 'Novo' },
    outro: { Icon: FileText, cor: '#52525B', bg: '#F4F4F5', label: 'Outro' },
  }
  const tipoFallback = { Icon: FileText, cor: '#52525B', bg: '#F4F4F5', label: 'Atividade' }

  const filtrosTipo = [
    { id: 'todos', label: 'Todos' },
    { id: 'pagamento', label: 'Pagamento' },
    { id: 'edicao', label: 'Edição' },
    { id: 'importacao', label: 'Importação' },
    { id: 'exclusao', label: 'Exclusão' },
  ]

  return (
    <div style={{ padding: '24px 24px 32px', overflowY: 'auto', flex: 1 }}>
      {/* Busca + filtros — mesmo padrão das demais abas */}
      <div style={{ position: 'relative', width: 300, marginBottom: 12 }}>
        <Search size={14} strokeWidth={2} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: t.textMuted }} />
        <input
          type="text"
          placeholder="Buscar por cliente"
          value={busca}
          onChange={e => setBusca(e.target.value)}
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginBottom: 20 }}>
        {filtrosTipo.map(f => (
          <button
            key={f.id}
            onClick={() => setFiltroTipo(f.id)}
            style={{
              fontSize: 12.5,
              padding: '6px 12px',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              background: filtroTipo === f.id ? t.text : 'transparent',
              color: filtroTipo === f.id ? t.bg : t.textMid,
              fontWeight: 600,
              transition: 'all 0.15s',
            }}
          >
            {f.label}{f.id !== 'todos' ? ` · ${atividadesRaw.filter(a => a.tipo === f.id).length}` : ` · ${atividadesRaw.length}`}
          </button>
        ))}
      </div>

      {/* Timeline de Atividades */}
      <div>
        {Object.entries(atividadesPorData).length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: t.textMuted, fontSize: 14 }}>
            Nenhuma atividade encontrada
          </div>
        ) : (
          Object.entries(atividadesPorData).map(([dataLabel, ativs]) => (
            <div key={dataLabel} style={{ marginBottom: 20 }}>
              {/* Cabeçalho da data */}
              <div style={{ fontSize: 11.5, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 10 }}>
                {dataLabel} · {ativs.length}
              </div>

              {/* Linhas de atividade */}
              <div>
                {ativs.map((a, idx) => {
                  const config = tipoConfig[a.tipo] ?? tipoFallback
                  const { Icon } = config
                  return (
                    <div
                      key={a.id}
                      style={{
                        display: 'flex',
                        gap: 12,
                        padding: '10px 4px',
                        alignItems: 'flex-start',
                        borderBottom: idx < ativs.length - 1 ? `1px solid ${t.borderLight || t.border}` : 'none',
                      }}
                    >
                      {/* Ícone com fundo semântico sutil */}
                      <div
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 6,
                          background: config.bg,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          marginTop: 1,
                        }}
                      >
                        <Icon size={14} strokeWidth={2} style={{ color: config.cor }} />
                      </div>

                      {/* Conteúdo — nome do cliente em destaque (mesmo padrão das abas Clientes),
                          descrição da ação vira legenda secundária. Só quando temos clienteNome
                          de verdade; sem isso, cai no comportamento antigo (descrição como título). */}
                      {(() => {
                        const temNomeCliente = a.clienteNome && a.clienteNome !== '-'
                        return (
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: temNomeCliente ? 14 : 13, fontWeight: temNomeCliente ? 700 : 600, color: t.text }}>
                              {temNomeCliente ? a.clienteNome : a.descricao}
                            </div>
                            {temNomeCliente && (
                              <div style={{ fontSize: 12, color: t.textMid, marginTop: 2 }}>
                                {a.descricao}
                              </div>
                            )}
                            <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 2 }}>
                              {a.entityId || '-'}
                            </div>

                            {/* Valores */}
                            {(a.valor > 0 || a.valorAnterior) && (
                              <div style={{ display: 'flex', gap: 16, fontSize: 12, marginTop: 4 }}>
                                {a.valor > 0 && (
                                  <span style={{ fontWeight: 700, color: config.cor, fontVariantNumeric: 'tabular-nums' }}>
                                    {formatCurrency(a.valor)}
                                  </span>
                                )}
                                {a.valorAnterior && (
                                  <span style={{ color: t.textMuted, fontVariantNumeric: 'tabular-nums' }}>
                                    {a.valorAnterior} → {a.valorNovo}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })()}

                      {/* Hora */}
                      <div style={{ fontSize: 11.5, color: t.textMuted, textAlign: 'right', minWidth: 60, fontVariantNumeric: 'tabular-nums', paddingTop: 1 }}>
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
    </div>
  )
}
