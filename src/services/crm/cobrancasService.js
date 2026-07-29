import { createClient } from '@base44/sdk'

// Conta nova (migrada 13/07/2026): schema relacional Cliente → Venda → Parcela,
// em vez do antigo Cobranca (registro único por cliente com parcelas aninhadas em JSON).
// Cada Parcela vira 1 linha na UI (antes era 1 linha por Cobranca agregada).

let base44Client = null

function getClient() {
  if (!base44Client) {
    const appId = import.meta.env.VITE_BASE44_APP_ID
    const apiKey = import.meta.env.VITE_BASE44_API_KEY
    if (!appId) throw new Error('VITE_BASE44_APP_ID não configurado')

    base44Client = createClient({
      appId,
      headers: apiKey ? { api_key: apiKey } : undefined,
    })
  }
  return base44Client
}

// Formata uma data pura (YYYY-MM-DD, sem horário/fuso — caso de data_vencimento/
// data_pagamento na Parcela) sem passar por `new Date()`, que interpretaria a string
// como UTC-meia-noite e deslocaria o dia em fusos negativos (ex.: America/Sao_Paulo
// mostrava 27/07/2026 pra um vencimento real de 28/07/2026). Não usar para timestamps
// com horário/fuso reais (created_date/updated_date etc.) — só para estas duas datas
// civis puras.
function formatarDataSemFuso(valor) {
  if (!valor) return null
  const dataPura = String(valor).slice(0, 10)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataPura)
  if (!match) return null
  const [, ano, mes, dia] = match
  return `${dia}/${mes}/${ano}`
}

function calcularDiasAtraso(vencimento) {
  if (!vencimento) return 0
  const vencDate = new Date(vencimento)
  const hoje = new Date()
  const diffMs = hoje - vencDate
  const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  return dias > 0 ? dias : 0
}

// Normaliza uma Parcela pro mesmo formato que a UI já espera (era normalizarCobranca)
function normalizarParcela(p, telefonecliente = '-') {
  const valorTotal = parseFloat(p.valor_atualizado) || parseFloat(p.valor_base) || 0
  const valorPago = parseFloat(p.valor_pago) || 0
  const valorAberto = valorTotal - valorPago

  // Schema novo não tem contador de tentativas de cobrança, só um flag booleano —
  // aproximação: 1 se já foi enviada, 0 se não.
  const quantidadeCobrancas = p.cobranca_enviada ? 1 : 0

  const historicoPagamentos = (valorPago > 0 && p.data_pagamento)
    ? [{ data: p.data_pagamento, valor: valorPago }]
    : []

  return {
    id: p.id,
    nome: p.cliente_nome || 'Sem nome',
    clienteId: p.cliente_id,
    status: p.status || 'pendente',
    diasAtraso: calcularDiasAtraso(p.data_vencimento),
    vencimento: p.data_vencimento ? (formatarDataSemFuso(p.data_vencimento) || '-') : '-',
    vencimentoRaw: p.data_vencimento || null,
    valorTotal,
    valorAberto,
    valorPago,
    parcelas: `Parcela ${p.numero || 1}`,
    telefone: telefonecliente || '-',
    observacoes: '',
    quantidadeCobrancas,
    proximaAcao: '-',
    historicoPagamentos,
  }
}

async function buscarTelefoneCliente(clienteId, nomeCliente) {
  try {
    const base44 = getClient()
    let cliente = null

    if (clienteId) {
      try {
        cliente = await base44.entities.Cliente.get(clienteId)
      } catch (err) {
        console.warn(`[buscarTelefoneCliente] ⚠️ ID ${clienteId} não encontrado, tentando por nome...`)
      }
    }

    if (!cliente && nomeCliente) {
      try {
        const clientes = await base44.entities.Cliente.filter({ nome: nomeCliente })
        if (clientes && clientes.length > 0) cliente = clientes[0]
      } catch (err) {
        console.warn(`[buscarTelefoneCliente] ⚠️ Filtro por nome falhou:`, err.message)
      }
    }

    return cliente?.telefone || '-'
  } catch (err) {
    console.warn(`[buscarTelefoneCliente] ❌ ${nomeCliente}:`, err.message)
    return '-'
  }
}

// Busca todas as parcelas + mapa de telefone por cliente (1 fetch de Cliente, não N)
async function listarParcelasComTelefone() {
  const base44 = getClient()
  const [parcelas, clientes] = await Promise.all([
    base44.entities.Parcela.list(),
    base44.entities.Cliente.list(),
  ])

  const telefonePorClienteId = new Map(clientes.map(c => [c.id, c.telefone || '-']))

  return (parcelas || []).map(p => normalizarParcela(p, telefonePorClienteId.get(p.cliente_id) || '-'))
}

export async function getAllCobrancas() {
  try {
    const normalized = await listarParcelasComTelefone()
    console.log('[cobrancasService] 📊 Total de parcelas:', normalized.length)
    return normalized
  } catch (err) {
    console.error('[cobrancasService] Erro ao listar todas:', err.message)
    return []
  }
}

export async function buscarTelefoneParaWhatsApp(clienteId, nomeCliente) {
  return await buscarTelefoneCliente(clienteId, nomeCliente)
}

export async function listCobrancas(filtroStatus = null) {
  try {
    let cobrancas = await listarParcelasComTelefone()
    if (filtroStatus && filtroStatus !== 'todos') {
      cobrancas = cobrancas.filter(c => c.status === filtroStatus)
    }
    return cobrancas.sort((a, b) => b.diasAtraso - a.diasAtraso)
  } catch (err) {
    console.error('[cobrancasService] Erro ao listar cobranças:', err.message)
    return []
  }
}

export async function listCobrancasAtrasadas() {
  try {
    const cobrancas = await listarParcelasComTelefone()
    return cobrancas.filter(c => c.diasAtraso > 0).sort((a, b) => b.diasAtraso - a.diasAtraso)
  } catch (err) {
    console.error('[cobrancasService] Erro ao listar atrasadas:', err.message)
    return []
  }
}

// Quantas parcelas vencem hoje (usado no card do Dashboard)
export async function contarVencemHoje() {
  try {
    const base44 = getClient()
    const parcelas = await base44.entities.Parcela.list()
    const hojeStr = new Date().toISOString().slice(0, 10)
    const hoje = (parcelas || []).filter(p => p.status !== 'pago' && (p.data_vencimento || '').slice(0, 10) === hojeStr)
    const valorEmAberto = hoje.reduce((sum, p) => sum + ((parseFloat(p.valor_atualizado) || parseFloat(p.valor_base) || 0) - (parseFloat(p.valor_pago) || 0)), 0)
    return { quantidade: hoje.length, valorEmAberto }
  } catch (err) {
    console.error('[cobrancasService] Erro ao contar vencem hoje:', err.message)
    return { quantidade: 0, valorEmAberto: 0 }
  }
}

const MOCK_HISTORICO_ATIVIDADES = [
  { id: '1', tipo: 'pagamento', activityType: 'PAYMENT', timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), entityId: 'ALESSANDRO ELISA', descricao: 'Pagamento recebido', valor: 918.99, valorAnterior: null, valorNovo: null, userId: 'sistema' },
  { id: '2', tipo: 'edicao', activityType: 'EDIT', timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), entityId: 'ALESSANDRO PEREIRA LOPES', descricao: 'Status atualizado', valor: 0, valorAnterior: 'Pendente', valorNovo: 'Atrasado', userId: 'rafael' },
  { id: '3', tipo: 'pagamento', activityType: 'PAYMENT', timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), entityId: 'DINEI BARBEARIA', descricao: 'Pagamento parcial', valor: 250.00, valorAnterior: null, valorNovo: null, userId: 'sistema' },
  { id: '4', tipo: 'importacao', activityType: 'IMPORT', timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), entityId: 'Lote 001', descricao: 'Importação em lote', valor: 5000.00, valorAnterior: null, valorNovo: null, userId: 'rafael' },
  { id: '5', tipo: 'novo', activityType: 'NEW', timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), entityId: 'GABRIEL SILVA', descricao: 'Nova cobrança criada', valor: 3136.00, valorAnterior: null, valorNovo: null, userId: 'rafael' },
]

export async function getHistoricoAtividades() {
  try {
    const base44 = getClient()
    let result = []
    try {
      result = await base44.entities.HistoricoAtividade.list()
    } catch (err) {
      console.error('[getHistoricoAtividades] ❌ Erro ao carregar HistoricoAtividade:', err.message)
      return MOCK_HISTORICO_ATIVIDADES
    }

    if (!result || result.length === 0) return MOCK_HISTORICO_ATIVIDADES

    const atividades = result
      .map(log => {
        const timestamp = log.created_date || new Date().toISOString()
        if (isNaN(new Date(timestamp).getTime())) return null
        return {
          id: log.id,
          tipo: log.tipo || 'outro',
          descricao: log.descricao || '-',
          clienteNome: log.cliente_nome || '-',
          entityId: log.cobranca_id || '-',
          valor: log.valor || 0,
          valorAnterior: log.valor_anterior || null,
          timestamp,
          userId: log.usuario || '-',
          detalhes: log.detalhes || '',
        }
      })
      .filter(Boolean)

    return atividades.length > 0
      ? atividades.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      : MOCK_HISTORICO_ATIVIDADES
  } catch (err) {
    console.error('[getHistoricoAtividades] ❌ Erro fatal:', err.message)
    return MOCK_HISTORICO_ATIVIDADES
  }
}

export async function getClientes() {
  try {
    const base44 = getClient()
    const result = await base44.entities.Cliente.list()
    if (!result || result.length === 0) return []

    const clientes = result
      .map(cliente => ({
        id: cliente.id,
        nome: cliente.nome || '-',
        telefone: cliente.telefone || '-',
        documento: cliente.cpf || '-',
        email: cliente.email || '-',
        endereco: cliente.endereco || '-',
        cidade: '-',
        estado: '-',
        cep: '-',
        observacoes: cliente.observacoes || '',
        dataNascimento: cliente.data_nascimento ? new Date(cliente.data_nascimento).toLocaleDateString('pt-BR') : '-',
        limiteCredito: cliente.limite_credito || 0,
        profissao: '-',
        status: cliente.status || 'ativo',
        created_date: cliente.created_date,
        updated_date: cliente.updated_date,
      }))

    return clientes.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
  } catch (err) {
    console.error('[getClientes] ❌ Erro fatal:', err.message)
    return []
  }
}

// Sincroniza telefones encontrados manualmente na agenda do Rafael com o cadastro de Cliente
export async function sincronizarTelefonesEncontrados() {
  const base44 = getClient()

  const telefones = {
    "JADER": "999774855",
    "DINEI BARBEARIA": "034993133042",
    "NAYARA PLATAFORMA GUCCI": "99174-4510",
    "CLEITON BARBEARIA": "(015 34) 99658-0001",
    "CASSINHO ITUITABA": "034996926999",
    "MARCO TULIO MT": "(015 34) 99976-1431",
    "RAFAEL AMIGO BEICIM ITBA": "99944-4764",
    "MATEUS MICHELE": "(34) 9341-3633",
    "YOSHI CATIGUA": "+553492767114",
    "JOAOZINHO PRETAO": "+553498081000",
    "VANDERLEI - AEROPORTO": "99142-8447",
    "SORRISO PEDRO": "99283-2823",
    "MAYRA MAE ARTUR": "99251-2393",
    "JOAO EDUARDO CASSIM ITBA": "034996602867",
    "CUPIM PROZA": "+553491098852",
    "DIOGO LEO CONTABILIDADE": "+5534991078115",
    "GABRIEL MARTINS BARBEIRO": "04134992446611",
    "GABY REPECAO BARBEARIA": "(041 34) 99149-1463",
    "Thalles Biringui": "+5534992215772",
    "BARBEIRO MARCUS": "+5534998450248",
    "GUSTAVO AMIGO RAFAEL": "+55 34 99649-4552",
    "MARCELO ESPETINHO GORDIN": "+55 34 99137-1028",
    "MATEUS MERCEDES": "+55 34 99930-2112",
    "PH OK MATEUS SUZI": "+55 34 99133-2313",
    "SAMUKA JD BRASILIA": "+55 15 99746-3524",
    "WELITON MIRELY": "+55 34 99296-7862"
  }

  let sucesso = 0
  let erro = 0
  const resultados = []

  for (const [nome, telefone] of Object.entries(telefones)) {
    try {
      const clientes = await base44.entities.Cliente.filter({ nome })
      if (clientes && clientes.length > 0) {
        const clienteId = clientes[0].id
        const telefoneLimpo = telefone.replace(/[^\d+]/g, '')
        await base44.entities.Cliente.update(clienteId, { telefone: telefoneLimpo })
        resultados.push({ nome, telefone, status: 'sucesso' })
        sucesso++
      } else {
        resultados.push({ nome, telefone, status: 'nao_encontrado' })
        erro++
      }
    } catch (err) {
      resultados.push({ nome, telefone, status: 'erro', erro: err.message })
      erro++
    }
  }

  return { sucesso, erro, total: Object.keys(telefones).length, resultados }
}

// Baixa manual — pra pagamento que não passa pelo Mercado Pago (dinheiro, PIX direto, etc).
export async function registrarPagamentoManual(parcelaId, { valorPago, formaPagamento, dataPagamento }) {
  try {
    const base44 = getClient()
    const parcela = await base44.entities.Parcela.get(parcelaId)
    if (!parcela) throw new Error('Parcela não encontrada')

    const novoValorPago = (parseFloat(parcela.valor_pago) || 0) + parseFloat(valorPago)
    const valorTotal = parseFloat(parcela.valor_atualizado) || parseFloat(parcela.valor_base) || 0
    const novoStatus = novoValorPago >= valorTotal ? 'pago' : 'parcial'

    // Passo crítico: se isso falhar, o pagamento não foi registrado — deve lançar erro.
    await base44.entities.Parcela.update(parcelaId, {
      valor_pago: novoValorPago,
      status: novoStatus,
      forma_pagamento: formaPagamento,
      data_pagamento: dataPagamento || new Date().toISOString().slice(0, 10),
    })

    // Passo secundário (log): já vale como pagamento salvo mesmo se isso falhar —
    // não deixamos um erro de log derrubar uma baixa que já aconteceu de verdade.
    try {
      await base44.entities.HistoricoAtividade.create({
        tipo: 'pagamento',
        cliente_nome: parcela.cliente_nome,
        cobranca_id: parcelaId,
        valor: parseFloat(valorPago),
        valor_anterior: String(parcela.valor_pago || 0),
        descricao: `Pagamento manual de R$ ${parseFloat(valorPago).toFixed(2)} registrado para ${parcela.cliente_nome} (forma: ${formaPagamento})`,
        detalhes: `Forma: ${formaPagamento} | Total pago: R$ ${novoValorPago.toFixed(2)}`,
      })
    } catch (logErr) {
      console.error('[registrarPagamentoManual] Pagamento salvo, mas log do histórico falhou:', logErr.message)
    }

    return { sucesso: true, novoStatus, novoValorPago }
  } catch (err) {
    console.error('[registrarPagamentoManual] Erro:', err.message)
    throw err
  }
}

export async function enviarMensagemManual({ clienteId, textoMensagem, requestId }) {
  try {
    const apiUrl = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' && window.location.origin)
    const endpoint = `${apiUrl}/api/system-tools?tool=mensagem-manual`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id: clienteId,
          texto_mensagem: textoMensagem,
          request_id: requestId,
        }),
        signal: controller.signal,
      })

      let json = null
      try {
        json = await res.json()
      } catch (_parseErr) {
        return { ok: false, error_code: 'resposta_invalida' }
      }

      if (!res.ok) {
        return { ok: false, error_code: json?.error_code || 'erro_http', httpStatus: res.status }
      }

      return { ok: true, json }
    } finally {
      clearTimeout(timeoutId)
    }
  } catch (err) {
    const errorCode = err.name === 'AbortError' ? 'timeout' : 'erro_rede'
    console.error('[enviarMensagemManual] Erro:', err.message)
    return { ok: false, error_code: errorCode }
  }
}

// --- Fase 1 (mensagem pronta com template) — listar_templates / previsualizar.
// Mesmo endpoint/proxy já validado (enviarMensagemManual acima, intocada) — só o
// `acao` no corpo muda. Nenhuma das duas envia mensagem nem cria LogNotificacao.
async function postMensagemManualTool(body) {
  try {
    const apiUrl = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' && window.location.origin)
    const endpoint = `${apiUrl}/api/system-tools?tool=mensagem-manual`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      let json = null
      try {
        json = await res.json()
      } catch (_parseErr) {
        return { ok: false, error_code: 'resposta_invalida' }
      }

      if (!res.ok) {
        return { ok: false, error_code: json?.error_code || 'erro_http', httpStatus: res.status }
      }

      return { ok: true, json }
    } finally {
      clearTimeout(timeoutId)
    }
  } catch (err) {
    const errorCode = err.name === 'AbortError' ? 'timeout' : 'erro_rede'
    console.error('[postMensagemManualTool] Erro:', err.message)
    return { ok: false, error_code: errorCode }
  }
}

export async function listarTemplatesWhatsapp() {
  return postMensagemManualTool({ acao: 'listar_templates' })
}

export async function previsualizarMensagemWhatsapp({ clienteId, parcelaId, templateKey }) {
  return postMensagemManualTool({
    acao: 'previsualizar',
    cliente_id: clienteId,
    parcela_id: parcelaId,
    template_key: templateKey,
  })
}

export async function getTotalizadores() {
  try {
    const cobrancas = await listarParcelasComTelefone()

    if (cobrancas.length === 0) {
      return { totalAtraso: 0, qtdAtrasados: 0, diasMedia: 0, totalReceber: 0, totalRecebido: 0, critico: 0, urgente: 0 }
    }

    const totalReceber = cobrancas.reduce((sum, c) => sum + (c.valorAberto || 0), 0)
    const atrasadas = cobrancas.filter(c => c.diasAtraso > 0)
    const totalAtraso = atrasadas.reduce((sum, c) => sum + c.valorAberto, 0)
    const clientesAtrasadosUnicos = new Set(atrasadas.map(c => c.nome)).size
    const diasMedia = atrasadas.length > 0
      ? Math.round(atrasadas.reduce((sum, c) => sum + c.diasAtraso, 0) / atrasadas.length)
      : 0
    const critico = cobrancas.filter(c => c.diasAtraso > 15).length
    const urgente = cobrancas.filter(c => c.diasAtraso >= 6 && c.diasAtraso <= 15).length
    const totalRecebido = cobrancas.reduce((sum, c) => sum + (c.valorPago || 0), 0)

    return { totalAtraso, qtdAtrasados: clientesAtrasadosUnicos, diasMedia, totalReceber, totalRecebido, critico, urgente }
  } catch (err) {
    console.error('[cobrancasService] Erro ao calcular totalizadores:', err.message)
    return { totalAtraso: 0, qtdAtrasados: 0, diasMedia: 0, totalReceber: 0, totalRecebido: 0, critico: 0, urgente: 0 }
  }
}
