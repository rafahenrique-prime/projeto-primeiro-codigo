import { useState, useMemo } from 'react'
import { Search, Phone, CheckCircle2, MessageCircle, Check, ExternalLink, ChevronDown } from 'lucide-react'

// Aba "💳 Parcelas" — visão financeira somente-leitura, 1 card = 1 Parcela.
// Reaproveita exclusivamente o state `cobrancas` já carregado em CobrancasPage.jsx
// (vindo de getAllCobrancas()) — nenhuma chamada de API nova é feita aqui.
//
// Redesign (aprovado): lista de cards agrupados por criticidade, no lugar da tabela
// antiga. Nenhum dado novo foi inventado — "Parcela X de Y" e "falta N parcela(s)"
// são calculados agrupando as parcelas já existentes por clienteId (mesmo padrão já
// usado em ClientesEmCobrancaTab). Tags e timeline pedidos no brief original ficaram
// de fora por não existir dado real no schema hoje (ver auditoria da conversa).

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

// Mesmo limiar de "crítico" já usado em ClientesEmCobrancaTab/cobrancasService — não é uma regra nova.
const LIMIAR_CRITICO_DIAS = 15

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

// Grupo de criticidade — só usa campos que já existem (diasAtraso, valorAberto, valorPago).
function getGrupo(c) {
  if (c.valorAberto === 0 && c.valorPago > 0) return 'pagas'
  if (c.diasAtraso > LIMIAR_CRITICO_DIAS) return 'critico'
  if (c.diasAtraso > 0) return 'atencao'
  return 'avencer'
}

const GRUPOS_CONFIG = {
  critico: { label: 'Crítico', sub: `${LIMIAR_CRITICO_DIAS}d ou mais`, cor: '#DC2626' },
  atencao: { label: 'Atenção', sub: '1 a 15 dias', cor: '#F59E0B' },
  avencer: { label: 'A vencer', sub: '', cor: '#10B981' },
  pagas: { label: 'Pagas', sub: '', cor: '#10B981' },
}
const ORDEM_GRUPOS = ['critico', 'atencao', 'avencer', 'pagas']

function diasParaVencer(vencimentoRaw) {
  if (!vencimentoRaw) return null
  const venc = new Date(vencimentoRaw)
  const hoje = new Date()
  venc.setHours(0, 0, 0, 0)
  hoje.setHours(0, 0, 0, 0)
  return Math.round((venc - hoje) / (1000 * 60 * 60 * 24))
}

function getInitials(nome) {
  return (nome || '?')
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// Chave de agrupamento por cliente — mesmo critério de ClientesEmCobrancaTab.getGroupKey:
// prioriza clienteId; só cai no fallback nome quando a Parcela não tem cliente_id.
function getClienteKey(c) {
  if (c.clienteId) return `id:${c.clienteId}`
  return `nome:${(c.nome || '').trim().toLowerCase()}`
}

export default function ParcelasTab({ cobrancas, theme: t, initialClienteFilter = null, onClearInitialFilter, setClienteSelecionado, setPagamentoModalCobranca }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [quickFilter, setQuickFilter] = useState('todas')
  const [sortBy, setSortBy] = useState('vencimento') // 'vencimento' | 'atraso' | 'valor'
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set(['pagas']))
  // Filtro por cliente vindo de "💳 Ver parcelas" (aba Clientes em Cobrança).
  // Inicializado só na montagem — o componente é desmontado/remontado a cada troca de aba,
  // então não precisa de useEffect pra sincronizar com a prop.
  const [clienteFilter, setClienteFilter] = useState(initialClienteFilter)

  function limparFiltroCliente() {
    setClienteFilter(null)
    onClearInitialFilter?.()
  }

  function toggleGrupo(id) {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Base já restrita ao cliente selecionado (se houver) — todo o resto (busca,
  // status, filtros rápidos, contadores) opera em cima dessa base.
  const baseCobrancas = useMemo(() => {
    if (!clienteFilter) return cobrancas
    if (clienteFilter.clienteId) {
      return cobrancas.filter(c => c.clienteId === clienteFilter.clienteId)
    }
    // Fallback só quando o cliente não tinha clienteId (ver ClientesEmCobrancaTab)
    const nomeAlvo = (clienteFilter.nome || '').toLowerCase()
    return cobrancas.filter(c => (c.nome || '').toLowerCase() === nomeAlvo)
  }, [cobrancas, clienteFilter])

  // "Parcela X de Y" / "falta N parcela(s)" — calculado a partir de TODAS as parcelas
  // do cliente (não só as visíveis após busca/filtro), pra não mudar a contagem
  // conforme o operador filtra a lista. Ordenado por vencimento (mais antiga = 1ª).
  const parcelaPosicaoPorId = useMemo(() => {
    const porCliente = new Map()
    for (const c of cobrancas) {
      const key = getClienteKey(c)
      if (!porCliente.has(key)) porCliente.set(key, [])
      porCliente.get(key).push(c)
    }
    const posicoes = new Map()
    for (const grupo of porCliente.values()) {
      const ordenado = [...grupo].sort((a, b) => (a.vencimentoRaw || '').localeCompare(b.vencimentoRaw || ''))
      ordenado.forEach((c, idx) => {
        posicoes.set(c.id, { indice: idx + 1, total: ordenado.length })
      })
    }
    return posicoes
  }, [cobrancas])

  const statusOptions = useMemo(() => {
    const set = new Set(baseCobrancas.map(c => c.status).filter(Boolean))
    return Array.from(set).sort()
  }, [baseCobrancas])

  const quickFilterCounts = useMemo(() => {
    const counts = {}
    for (const f of QUICK_FILTERS) {
      counts[f.id] = baseCobrancas.filter(c => matchesQuickFilter(c, f.id)).length
    }
    return counts
  }, [baseCobrancas])

  // Barra de distribuição — os outros totais (total a receber, em atraso, recebido,
  // clientes em atraso) já aparecem nos cards do topo da página; "a vencer" é o único
  // número que não existe em nenhum outro lugar, por isso é o único mantido aqui.
  const resumo = useMemo(() => {
    let aVencer = 0
    let somaCritico = 0, somaAtencao = 0, somaEmDia = 0

    for (const c of baseCobrancas) {
      if (c.diasAtraso > 0) {
        if (c.diasAtraso > LIMIAR_CRITICO_DIAS) somaCritico += c.valorAberto || 0
        else somaAtencao += c.valorAberto || 0
      } else if (c.valorAberto > 0) {
        aVencer += c.valorAberto || 0
        somaEmDia += c.valorAberto || 0
      }
    }

    const somaAging = somaCritico + somaAtencao + somaEmDia
    return {
      aVencer,
      pctCritico: somaAging > 0 ? (somaCritico / somaAging) * 100 : 0,
      pctAtencao: somaAging > 0 ? (somaAtencao / somaAging) * 100 : 0,
      pctEmDia: somaAging > 0 ? (somaEmDia / somaAging) * 100 : 0,
    }
  }, [baseCobrancas])

  const filtered = useMemo(() => {
    let result = baseCobrancas.filter(c => matchesQuickFilter(c, quickFilter))

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
  }, [baseCobrancas, quickFilter, statusFilter, search, sortBy])

  // Agrupa a lista já filtrada/ordenada por criticidade, preservando a ordem interna.
  const grupos = useMemo(() => {
    const porGrupo = { critico: [], atencao: [], avencer: [], pagas: [] }
    for (const c of filtered) porGrupo[getGrupo(c)].push(c)

    const subtotais = {}
    for (const id of ORDEM_GRUPOS) {
      subtotais[id] = porGrupo[id].reduce((s, c) => s + (id === 'pagas' ? (c.valorPago || 0) : (c.valorAberto || 0)), 0)
    }
    return { porGrupo, subtotais }
  }, [filtered])

  const inputStyle = {
    border: 'none',
    borderRadius: 6,
    padding: '8px 12px',
    fontSize: 13,
    background: t.bgTertiary,
    color: t.textMid,
    outline: 'none',
  }

  return (
    <div style={{ padding: '20px 24px 32px', overflowY: 'auto', flex: 1 }}>
      {/* Filtro por cliente (vindo da aba Clientes em Cobrança) */}
      {clienteFilter && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
          padding: '8px 14px', borderRadius: 8, background: t.bgTertiary,
        }}>
          <span style={{ fontSize: 12, color: t.text }}>
            Mostrando parcelas de: <strong>{clienteFilter.nome}</strong>
          </span>
          <button
            onClick={limparFiltroCliente}
            style={{
              marginLeft: 'auto', fontSize: 11, fontWeight: 600, padding: '4px 10px',
              borderRadius: 6, border: 'none', cursor: 'pointer',
              background: t.text, color: t.bg,
            }}
          >
            Limpar filtro
          </button>
        </div>
      )}

      {/* Só o que não está no resumo do topo da página: "A vencer" */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: t.textMid }}>Distribuição da carteira em aberto</span>
        <span style={{ fontSize: 12, color: t.textMuted }}>
          A vencer: <strong style={{ color: t.text, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(resumo.aVencer)}</strong>
        </span>
      </div>

      {/* Barra proporcional — crítico / atenção / em dia, com o percentual já dentro da barra */}
      <div style={{ display: 'flex', height: 26, borderRadius: 6, overflow: 'hidden', gap: 2, marginBottom: 22 }}>
        {resumo.pctCritico > 0 && (
          <div style={{ width: `${resumo.pctCritico}%`, background: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 2 }}>
            {resumo.pctCritico >= 8 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
                {resumo.pctCritico >= 16 ? 'Crítico ' : ''}{Math.round(resumo.pctCritico)}%
              </span>
            )}
          </div>
        )}
        {resumo.pctAtencao > 0 && (
          <div style={{ width: `${resumo.pctAtencao}%`, background: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 2 }}>
            {resumo.pctAtencao >= 8 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
                {resumo.pctAtencao >= 16 ? 'Atenção ' : ''}{Math.round(resumo.pctAtencao)}%
              </span>
            )}
          </div>
        )}
        {resumo.pctEmDia > 0 && (
          <div style={{ width: `${resumo.pctEmDia}%`, background: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 2 }}>
            {resumo.pctEmDia >= 8 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
                {resumo.pctEmDia >= 16 ? 'Em dia ' : ''}{Math.round(resumo.pctEmDia)}%
              </span>
            )}
          </div>
        )}
      </div>

      {/* Filtros — busca, status e ordenação numa única linha */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: 260 }}>
          <Search size={14} strokeWidth={2} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: t.textMuted }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome ou telefone"
            style={{ ...inputStyle, width: '100%', padding: '8px 12px 8px 32px', color: t.text }}
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
          <option value="todos">Todos os status</option>
          {statusOptions.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
          <option value="vencimento">Ordenar por vencimento</option>
          <option value="atraso">Maior atraso</option>
          <option value="valor">Maior valor</option>
        </select>
      </div>

      {/* Filtros rápidos */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginBottom: 22 }}>
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
          {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Grupos recolhíveis por criticidade */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: t.textMuted, fontSize: 14 }}>
          Nenhuma parcela encontrada
        </div>
      ) : (
        ORDEM_GRUPOS.filter(id => grupos.porGrupo[id].length > 0).map(id => {
          const cfg = GRUPOS_CONFIG[id]
          const itens = grupos.porGrupo[id]
          const colapsado = collapsedGroups.has(id)
          return (
            <div key={id} style={{ marginBottom: 4 }}>
              <div
                onClick={() => toggleGrupo(id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 6px',
                  cursor: 'pointer', borderRadius: 8, userSelect: 'none',
                }}
                onMouseEnter={e => e.currentTarget.style.background = t.bgTertiary}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <ChevronDown size={13} strokeWidth={2.5} style={{ color: t.textMuted, transition: 'transform 0.15s', transform: colapsado ? 'rotate(-90deg)' : 'none', flexShrink: 0 }} />
                <span style={{ width: 3, height: 15, borderRadius: 2, background: cfg.cor, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{cfg.label}</span>
                <span style={{ fontSize: 12.5, color: t.textMuted }}>{cfg.sub ? `${cfg.sub} · ` : ''}{itens.length}</span>
                <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: t.text, fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(grupos.subtotais[id])}
                </span>
              </div>

              {!colapsado && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 0 6px' }}>
                  {itens.map(c => {
                    const posicao = parcelaPosicaoPorId.get(c.id) || { indice: 1, total: 1 }
                    const temTelefone = c.telefone && c.telefone !== '-'
                    const jaQuitada = c.valorAberto === 0 && c.valorPago > 0
                    const temLink = c.paymentLink || c.payment_link

                    let dataLinha, dataCor
                    if (jaQuitada) {
                      dataCor = '#059669'
                      dataLinha = 'Quitada'
                    } else if (c.diasAtraso > 0) {
                      dataCor = c.diasAtraso > LIMIAR_CRITICO_DIAS ? '#DC2626' : '#B45309'
                      dataLinha = `${c.diasAtraso} dia${c.diasAtraso !== 1 ? 's' : ''} de atraso`
                    } else {
                      const dias = diasParaVencer(c.vencimentoRaw)
                      dataCor = '#059669'
                      dataLinha = dias === 0 ? 'Vence hoje' : dias != null ? `em ${dias} dia${dias !== 1 ? 's' : ''}` : '—'
                    }

                    const restanteCor = jaQuitada ? t.textMuted : (c.diasAtraso > 0 ? dataCor : t.text)

                    return (
                      <div
                        key={c.id}
                        className="parcela-card"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 20, padding: '12px 16px',
                          background: t.bg, borderRadius: 10, border: `1px solid ${t.borderLight || t.border}`,
                          transition: 'box-shadow 0.15s, border-color 0.15s', flexWrap: 'wrap',
                        }}
                      >
                        {/* Quem */}
                        <div style={{ flex: '0 0 180px', minWidth: 140 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.nome}
                          </div>
                          <div style={{ fontSize: 11.5, color: temTelefone ? t.textMuted : '#B45309', marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
                            <Phone size={10} strokeWidth={2} />
                            {temTelefone ? c.telefone : 'Sem telefone'}
                          </div>
                          {c.quantidadeCobrancas > 0 && (
                            <div style={{ fontSize: 10.5, color: t.textMuted, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <CheckCircle2 size={10} strokeWidth={2} />
                              Cobrança enviada
                            </div>
                          )}
                        </div>

                        {/* Parcela */}
                        <div style={{ flex: '0 0 130px' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>
                            {posicao.total > 1 ? `Parcela ${posicao.indice} de ${posicao.total}` : 'Parcela única'}
                          </div>
                          {posicao.total > 1 && (
                            <>
                              <div style={{ display: 'flex', gap: 4, marginTop: 7 }}>
                                {Array.from({ length: posicao.total }).map((_, i) => (
                                  <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i < posicao.indice ? t.textMid : t.bgTertiary }} />
                                ))}
                              </div>
                              <div style={{ fontSize: 11, color: t.textMuted, marginTop: 6 }}>
                                {posicao.total - posicao.indice > 0 ? `falta ${posicao.total - posicao.indice} parcela${posicao.total - posicao.indice !== 1 ? 's' : ''}` : 'última parcela'}
                              </div>
                            </>
                          )}
                        </div>

                        {/* Datas */}
                        <div style={{ flex: '0 0 140px' }}>
                          <div style={{ fontSize: 11.5, color: t.textMuted }}>Venceu em {c.vencimento}</div>
                          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4, color: dataCor, fontVariantNumeric: 'tabular-nums' }}>{dataLinha}</div>
                        </div>

                        {/* Valores */}
                        <div style={{ flex: '0 0 190px', textAlign: 'right' }}>
                          <div style={{ fontSize: 11, color: t.textMuted, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                            {c.valorPago > 0 ? `${formatCurrency(c.valorPago)} pago de ${formatCurrency(c.valorTotal)}` : `Nada pago de ${formatCurrency(c.valorTotal)}`}
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 3, color: restanteCor, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                            {formatCurrency(c.valorAberto)}
                          </div>
                        </div>

                        {/* Ações */}
                        <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
                          <button
                            onClick={() => temTelefone && setClienteSelecionado?.(c)}
                            disabled={!temTelefone}
                            title={temTelefone ? 'Enviar mensagem WhatsApp' : 'Cliente sem telefone válido'}
                            style={{
                              width: 30, height: 30, borderRadius: 7, border: 'none', background: 'transparent',
                              color: t.textMuted, cursor: temTelefone ? 'pointer' : 'not-allowed',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              opacity: temTelefone ? 1 : 0.3, transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => { if (temTelefone) { e.currentTarget.style.background = '#ECFDF5'; e.currentTarget.style.color = '#059669' } }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = t.textMuted }}
                          >
                            <MessageCircle size={16} strokeWidth={2} />
                          </button>
                          <button
                            onClick={() => !jaQuitada && setPagamentoModalCobranca?.(c)}
                            disabled={jaQuitada}
                            title={jaQuitada ? 'Parcela já quitada' : 'Registrar pagamento'}
                            style={{
                              width: 30, height: 30, borderRadius: 7, border: 'none', background: 'transparent',
                              color: t.textMuted, cursor: jaQuitada ? 'not-allowed' : 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              opacity: jaQuitada ? 0.3 : 1, transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => { if (!jaQuitada) { e.currentTarget.style.background = t.bgTertiary; e.currentTarget.style.color = t.text } }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = t.textMuted }}
                          >
                            <Check size={16} strokeWidth={2} />
                          </button>
                          {temLink ? (
                            <a
                              href={c.paymentLink || c.payment_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Abrir link de pagamento"
                              style={{
                                width: 30, height: 30, borderRadius: 7, color: t.textMuted,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = t.bgTertiary; e.currentTarget.style.color = t.text }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = t.textMuted }}
                            >
                              <ExternalLink size={16} strokeWidth={2} />
                            </a>
                          ) : (
                            <span style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.3, color: t.textMuted }}>
                              <ExternalLink size={16} strokeWidth={2} />
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })
      )}

      <style>{`
        .parcela-card:hover { box-shadow: 0 2px 10px rgba(0,0,0,0.06); }
        @media (max-width: 900px) {
          .parcela-card { justify-content: flex-start; }
        }
      `}</style>
    </div>
  )
}
