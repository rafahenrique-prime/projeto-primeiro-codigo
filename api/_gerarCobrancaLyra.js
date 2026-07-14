// Helper privado (prefixo "_" — não vira Function pública, mesmo padrão já usado por
// _codexAlerts.js / _profileIdentity.js / _profileMemory.js / _profileLearning.js).
// Exporta só funções nomeadas, importadas por api/system-tools.js. Nenhum `export default`.
//
// FASE 2.2 — modo estritamente dry-run: consulta Parcela/Venda/Cliente no PRIME e Cliente
// na Lyra, calcula elegibilidade e monta o payload que a FASE 2.3 enviaria pra
// `criarCobranca` — mas não escreve nada, não chama a Lyra, não chama o Mercado Pago.
//
// Único dado aceito do chamador: parcela_id. Todo o resto (valor, vencimento, cliente,
// telefone, descrição) é sempre buscado no PRIME — nunca confiado do request.

import { createClient } from '@base44/sdk'

const BASE44_API_KEY = process.env.BASE44_API_KEY
const LYRA_APP_ID = '6a518d72335f3c31663dc63d'
const PRIME_APP_ID = '6a50402b2eeb1d1114312861'

function normalizePhone(phone) {
  return (phone || '').replace(/\D/g, '')
}

function mascararTelefone(phone) {
  const digitos = normalizePhone(phone)
  if (digitos.length < 4) return '****'
  return `${'*'.repeat(digitos.length - 4)}${digitos.slice(-4)}`
}

// Best-effort — Map em memória do processo. Em serverless isso reseta a cada cold start e
// não é compartilhado entre instâncias/regiões, então NÃO é uma trava distribuída confiável,
// só reduz abuso trivial de um mesmo IP batendo repetidamente na mesma instância quente.
const tentativasPorIp = new Map()
const RATE_LIMIT_JANELA_MS = 60 * 1000
const RATE_LIMIT_MAX_TENTATIVAS = 10

export function checarRateLimitBestEffort(ip) {
  const agora = Date.now()
  const chave = ip || 'desconhecido'
  const historico = (tentativasPorIp.get(chave) || []).filter(t => agora - t < RATE_LIMIT_JANELA_MS)
  historico.push(agora)
  tentativasPorIp.set(chave, historico)
  return historico.length <= RATE_LIMIT_MAX_TENTATIVAS
}

// Allowlist configurável via env (GERAR_COBRANCA_ALLOWED_ORIGINS, separado por vírgula).
// Não hardcoda nenhum domínio: os domínios reais do PRIME COBRANÇAS ainda não foram
// identificados/confirmados. Se a env não estiver configurada, a checagem é pulada (best-effort,
// registrada como pendência) em vez de bloquear tudo por um domínio adivinhado.
export function checarOrigemBestEffort(req) {
  const allowlistRaw = process.env.GERAR_COBRANCA_ALLOWED_ORIGINS
  if (!allowlistRaw) {
    return { ok: true, checado: false, motivo: 'GERAR_COBRANCA_ALLOWED_ORIGINS não configurada — checagem pulada (pendência)' }
  }
  const allowlist = allowlistRaw.split(',').map(s => s.trim()).filter(Boolean)
  const origem = req.headers.origin || req.headers.referer || ''
  const bate = allowlist.some(dominio => origem.startsWith(dominio))
  return { ok: bate, checado: true, motivo: bate ? null : 'Origin/Referer fora da allowlist' }
}

async function buscarClienteLyraPorTelefone(lyra, telefoneNormalizado) {
  const candidatos = await lyra.entities.Cliente.filter({ phone: telefoneNormalizado })
  return candidatos || []
}

export async function gerarCobrancaLyraDryRun({ parcelaId, ip, req }) {
  if (!BASE44_API_KEY) {
    return { httpStatus: 500, body: { success: false, error: 'BASE44_API_KEY não configurado', escritas_realizadas: 0 } }
  }
  if (!parcelaId || typeof parcelaId !== 'string') {
    return { httpStatus: 400, body: { success: false, error: 'parcela_id é obrigatório', escritas_realizadas: 0 } }
  }

  const prime = createClient({ appId: PRIME_APP_ID, headers: { api_key: BASE44_API_KEY } })
  const lyra = createClient({ appId: LYRA_APP_ID, headers: { api_key: BASE44_API_KEY } })

  // --- 1. Parcela ---
  let parcela = null
  try {
    parcela = await prime.entities.Parcela.get(parcelaId)
  } catch (err) {
    console.error('[gerar-cobranca-lyra] Parcela não encontrada:', parcelaId, err.message)
  }
  if (!parcela) {
    return { httpStatus: 404, body: { success: false, error: 'Parcela não encontrada', dryRun: true, escritas_realizadas: 0 } }
  }

  // --- 2. Venda ---
  let venda = null
  if (parcela.venda_id) {
    try {
      venda = await prime.entities.Venda.get(parcela.venda_id)
    } catch (err) {
      console.error('[gerar-cobranca-lyra] Venda não encontrada:', parcela.venda_id, err.message)
    }
  }
  if (!venda) {
    return { httpStatus: 422, body: { success: false, error: 'Venda vinculada não encontrada', dryRun: true, escritas_realizadas: 0 } }
  }

  // --- 3. Cliente PRIME (campos reais: nome / telefone) ---
  let clientePrime = null
  if (parcela.cliente_id) {
    try {
      clientePrime = await prime.entities.Cliente.get(parcela.cliente_id)
    } catch (err) {
      console.error('[gerar-cobranca-lyra] Cliente PRIME não encontrado:', parcela.cliente_id, err.message)
    }
  }
  if (!clientePrime) {
    return { httpStatus: 422, body: { success: false, error: 'Cliente vinculado não encontrado', dryRun: true, escritas_realizadas: 0 } }
  }

  const telefoneNormalizado = normalizePhone(clientePrime.telefone)
  if (!telefoneNormalizado) {
    return { httpStatus: 422, body: { success: false, error: 'Cliente sem telefone válido', dryRun: true, escritas_realizadas: 0 } }
  }

  // --- 4. Elegibilidade da Parcela ---
  if (parcela.status === 'pago') {
    return { httpStatus: 422, body: { success: false, error: 'Parcela já está paga', dryRun: true, escritas_realizadas: 0 } }
  }
  if (parcela.lyra_cobranca_id) {
    return { httpStatus: 422, body: { success: false, error: 'Parcela já vinculada a uma Cobranca na Lyra', lyra_cobranca_id: parcela.lyra_cobranca_id, dryRun: true, escritas_realizadas: 0 } }
  }
  if (parcela.mp_preference_id) {
    return { httpStatus: 422, body: { success: false, error: 'Parcela já possui mp_preference_id — vínculo divergente ou incompleto, requer auditoria manual', mp_preference_id: parcela.mp_preference_id, dryRun: true, escritas_realizadas: 0 } }
  }

  // --- 5. Saldo oficial (mesma fórmula usada em cobrancasService.js:normalizarParcela) ---
  const origemValor = parcela.valor_atualizado ? 'valor_atualizado' : 'valor_base'
  const valorTotal = Number(parcela.valor_atualizado) || Number(parcela.valor_base) || 0
  const valorPago = Number(parcela.valor_pago) || 0
  const saldoOficial = valorTotal - valorPago

  if (saldoOficial <= 0) {
    return { httpStatus: 422, body: { success: false, error: 'Saldo oficial da Parcela é zero ou negativo', saldo_oficial: saldoOficial, dryRun: true, escritas_realizadas: 0 } }
  }

  // --- 6. Cliente Lyra (campos reais: name / phone) — só leitura, nunca cria nesta fase ---
  let clienteLyraCandidatos = []
  try {
    clienteLyraCandidatos = await buscarClienteLyraPorTelefone(lyra, telefoneNormalizado)
  } catch (err) {
    console.error('[gerar-cobranca-lyra] Erro ao consultar Cliente na Lyra:', err.message)
    return { httpStatus: 502, body: { success: false, error: 'Falha ao consultar Cliente na Lyra', detail: err.message, dryRun: true, escritas_realizadas: 0 } }
  }

  let clienteLyra
  if (clienteLyraCandidatos.length === 0) {
    clienteLyra = {
      acao: 'CRIARIA_CLIENTE',
      executado: false,
      dados_que_seriam_usados: { name: clientePrime.nome, phone_mascarado: mascararTelefone(clientePrime.telefone) },
    }
  } else if (clienteLyraCandidatos.length === 1) {
    clienteLyra = {
      acao: 'REUTILIZARIA_CLIENTE',
      executado: false,
      cliente_lyra_id: clienteLyraCandidatos[0].id,
    }
  } else {
    return {
      httpStatus: 409,
      body: {
        success: false,
        elegivel: false,
        error: 'Mais de um Cliente encontrado na Lyra para este telefone — requer auditoria manual',
        acao_cliente_lyra: 'CLIENTE_DUPLICADO',
        ids_encontrados: clienteLyraCandidatos.map(c => c.id),
        dryRun: true,
        escritas_realizadas: 0,
      },
    }
  }

  // --- 7. Payload simulado (nunca enviado nesta fase) ---
  const clienteIdSimulado = clienteLyra.acao === 'REUTILIZARIA_CLIENTE' ? clienteLyra.cliente_lyra_id : 'SIMULADO'
  const descricaoDeterministica = `Parcela ${parcela.numero || 1} - ${venda.descricao_itens || 'Venda PRIME'}`

  const payloadLyraSimulado = {
    cliente_id: clienteIdSimulado,
    cliente_nome: clientePrime.nome,
    valor: saldoOficial,
    vencimento: parcela.data_vencimento,
    descricao: descricaoDeterministica,
    prime_parcela_id: parcela.id,
  }

  return {
    httpStatus: 200,
    body: {
      success: true,
      dryRun: true,
      elegivel: true,
      parcela: {
        id: parcela.id,
        status: parcela.status,
        valor_total: valorTotal,
        valor_pago: valorPago,
        saldo_oficial: saldoOficial,
        origem_valor: origemValor,
        vencimento: parcela.data_vencimento,
      },
      cliente_prime: {
        id: clientePrime.id,
        nome: clientePrime.nome,
        telefone_mascarado: mascararTelefone(clientePrime.telefone),
      },
      cliente_lyra: clienteLyra,
      payload_lyra_simulado: payloadLyraSimulado,
      dependencias_pendentes: [],
      escritas_realizadas: 0,
    },
  }
}

// ============================================================================
// FASE 2.3A — preparação da integração real. As funções abaixo são chamadas
// SOMENTE quando dryRun === false (nunca automaticamente). Reaproveitam o mesmo
// padrão de validação da FASE 2.2 (código duplicado de propósito, não um refactor
// compartilhado — pra não arriscar alterar o comportamento já validado do dry-run).
// ============================================================================

const LYRA_CRIAR_COBRANCA_URL = 'https://lyra-663dc63d.base44.app/functions/criarCobranca'
const CRIAR_COBRANCA_TIMEOUT_MS = 15000

// Releitura + validações básicas (existência/paga), idênticas em espírito às da FASE 2.2 —
// repetidas aqui (não uma chamada à função dry-run) porque o modo real precisa dos objetos
// completos (parcela/venda/clientePrime), não só do relatório formatado. NÃO bloqueia mais
// por lyra_cobranca_id/mp_preference_id/payment_link já preenchidos — isso agora é resolvido
// por resolverIdempotenciaExistente() (FASE 2.3B.1), rodado antes do cálculo de saldo.
async function coletarContextoBasico(prime, parcelaId) {
  let parcela = null
  try {
    parcela = await prime.entities.Parcela.get(parcelaId)
  } catch (err) {
    console.error('[gerar-cobranca-lyra:real] Parcela não encontrada:', parcelaId, err.message)
  }
  if (!parcela) return { erro: { httpStatus: 404, body: { success: false, error: 'Parcela não encontrada', dryRun: false, escritas_realizadas: 0 } } }

  let venda = null
  if (parcela.venda_id) {
    try {
      venda = await prime.entities.Venda.get(parcela.venda_id)
    } catch (err) {
      console.error('[gerar-cobranca-lyra:real] Venda não encontrada:', parcela.venda_id, err.message)
    }
  }
  if (!venda) return { erro: { httpStatus: 422, body: { success: false, error: 'Venda vinculada não encontrada', dryRun: false, escritas_realizadas: 0 } } }

  let clientePrime = null
  if (parcela.cliente_id) {
    try {
      clientePrime = await prime.entities.Cliente.get(parcela.cliente_id)
    } catch (err) {
      console.error('[gerar-cobranca-lyra:real] Cliente PRIME não encontrado:', parcela.cliente_id, err.message)
    }
  }
  if (!clientePrime) return { erro: { httpStatus: 422, body: { success: false, error: 'Cliente vinculado não encontrado', dryRun: false, escritas_realizadas: 0 } } }

  const telefoneNormalizado = normalizePhone(clientePrime.telefone)
  if (!telefoneNormalizado) return { erro: { httpStatus: 422, body: { success: false, error: 'Cliente sem telefone válido', dryRun: false, escritas_realizadas: 0 } } }

  if (parcela.status === 'pago') return { erro: { httpStatus: 422, body: { success: false, error: 'Parcela já está paga', dryRun: false, escritas_realizadas: 0 } } }

  return { contexto: { parcela, venda, clientePrime, telefoneNormalizado } }
}

function calcularSaldoOficial(parcela) {
  const origemValor = parcela.valor_atualizado ? 'valor_atualizado' : 'valor_base'
  const valorTotal = Number(parcela.valor_atualizado) || Number(parcela.valor_base) || 0
  const valorPago = Number(parcela.valor_pago) || 0
  const saldoOficial = valorTotal - valorPago
  return { origemValor, valorTotal, valorPago, saldoOficial }
}

// FASE 2.3B.1 — quando a Parcela já tem lyra_cobranca_id/mp_preference_id/payment_link,
// localiza a Cobranca correspondente na Lyra e devolve um retorno idempotente consistente,
// SEM criar Cliente, SEM chamar criarCobranca/Mercado Pago, SEM atualizar a Parcela e SEM
// criar histórico novo. Qualquer inconsistência bloqueia pra auditoria manual, nunca escolhe
// sozinho nem sobrescreve.
async function resolverIdempotenciaExistente(lyra, parcela) {
  const ehCancelada = (status) => typeof status === 'string' && status.toLowerCase().includes('cancel')

  const bloqueio = (motivo, extra = {}) => ({
    httpStatus: 409,
    body: { success: false, error: motivo, prime_parcela_id: parcela.id, dryRun: false, escritas_realizadas: 0, ...extra },
  })

  // Busca pelas 3 fontes possíveis, na ordem de prioridade pedida — usadas também para
  // detectar divergência cruzada entre elas, não só para achar "a primeira que responder".
  let cobrancaPorId = null
  if (parcela.lyra_cobranca_id) {
    try {
      cobrancaPorId = await lyra.entities.Cobranca.get(parcela.lyra_cobranca_id)
    } catch (err) {
      console.error('[gerar-cobranca-lyra:real] lyra_cobranca_id da Parcela não encontrado na Lyra:', parcela.lyra_cobranca_id, err.message)
    }
  }

  let cobrancasPorParcela = []
  try {
    cobrancasPorParcela = await lyra.entities.Cobranca.filter({ prime_parcela_id: parcela.id })
  } catch (err) {
    console.error('[gerar-cobranca-lyra:real] Erro ao buscar Cobranca por prime_parcela_id:', err.message)
    return { httpStatus: 502, body: { success: false, error: 'Falha ao consultar Cobranca na Lyra', detail: err.message, dryRun: false, escritas_realizadas: 0 } }
  }
  if (cobrancasPorParcela.length > 1) {
    return bloqueio('Mais de uma Cobranca na Lyra corresponde a este prime_parcela_id — requer auditoria manual', { ids_encontrados: cobrancasPorParcela.map(c => c.id) })
  }

  let cobrancasPorPreference = []
  if (parcela.mp_preference_id) {
    try {
      cobrancasPorPreference = await lyra.entities.Cobranca.filter({ mp_preference_id: parcela.mp_preference_id })
    } catch (err) {
      console.error('[gerar-cobranca-lyra:real] Erro ao buscar Cobranca por mp_preference_id:', err.message)
      return { httpStatus: 502, body: { success: false, error: 'Falha ao consultar Cobranca na Lyra', detail: err.message, dryRun: false, escritas_realizadas: 0 } }
    }
    if (cobrancasPorPreference.length > 1) {
      return bloqueio('Mais de uma Cobranca na Lyra corresponde a este mp_preference_id — requer auditoria manual', { ids_encontrados: cobrancasPorPreference.map(c => c.id) })
    }
  }

  // --- Reconciliação: escolhe o candidato pela prioridade, mas valida que as outras
  // fontes (quando existirem) apontam pro MESMO registro. Qualquer divergência bloqueia. ---
  let candidato = null

  if (cobrancaPorId) {
    candidato = cobrancaPorId
    if (cobrancasPorParcela.length === 1 && cobrancasPorParcela[0].id !== candidato.id) {
      return bloqueio('lyra_cobranca_id aponta para uma Cobranca diferente da encontrada por prime_parcela_id — vínculo divergente', { lyra_cobranca_id: parcela.lyra_cobranca_id, encontrado_por_prime_parcela_id: cobrancasPorParcela[0].id })
    }
  } else if (cobrancasPorParcela.length === 1) {
    candidato = cobrancasPorParcela[0]
  } else if (cobrancasPorPreference.length === 1) {
    candidato = cobrancasPorPreference[0]
    if (candidato.prime_parcela_id && candidato.prime_parcela_id !== parcela.id) {
      return bloqueio('mp_preference_id aponta para uma Cobranca de outro prime_parcela_id — vínculo divergente', { mp_preference_id: parcela.mp_preference_id, cobranca_prime_parcela_id: candidato.prime_parcela_id })
    }
  }

  if (!candidato) {
    return bloqueio('Parcela possui identificador(es) de cobrança preenchido(s), mas nenhuma Cobranca correspondente foi encontrada na Lyra — requer auditoria manual', {
      lyra_cobranca_id: parcela.lyra_cobranca_id || null,
      mp_preference_id: parcela.mp_preference_id || null,
    })
  }

  if (parcela.mp_preference_id && candidato.mp_preference_id && parcela.mp_preference_id !== candidato.mp_preference_id) {
    return bloqueio('mp_preference_id da Parcela diverge do registro encontrado na Lyra — vínculo divergente', { parcela_mp_preference_id: parcela.mp_preference_id, cobranca_mp_preference_id: candidato.mp_preference_id })
  }
  if (parcela.payment_link && candidato.payment_link && parcela.payment_link !== candidato.payment_link) {
    return bloqueio('payment_link da Parcela diverge do registro encontrado na Lyra — vínculo divergente')
  }
  if (ehCancelada(candidato.status)) {
    return bloqueio('Cobranca correspondente está cancelada na Lyra — requer auditoria manual', { cobranca_id: candidato.id, status_atual: candidato.status })
  }

  return {
    httpStatus: 200,
    body: {
      success: true,
      dryRun: false,
      reutilizada: true,
      lyra_cobranca_id: candidato.id,
      mp_preference_id: candidato.mp_preference_id,
      payment_link: candidato.payment_link,
      prime_parcela_id: parcela.id,
      status_atual: candidato.status,
      historico_criado: false,
      escritas_realizadas: 0,
    },
  }
}

// Resolve o Cliente na Lyra pra escrita real: cria se não existir (com releitura
// imediatamente antes, reduzindo — não eliminando — risco de duplicar em corrida).
async function resolverOuCriarClienteLyra(lyra, clientePrime, telefoneNormalizado) {
  const candidatos = await buscarClienteLyraPorTelefone(lyra, telefoneNormalizado)
  if (candidatos.length > 1) {
    return { erro: { httpStatus: 409, body: { success: false, elegivel: false, error: 'Mais de um Cliente encontrado na Lyra para este telefone — requer auditoria manual', acao_cliente_lyra: 'CLIENTE_DUPLICADO', ids_encontrados: candidatos.map(c => c.id), dryRun: false, escritas_realizadas: 0 } } }
  }
  if (candidatos.length === 1) {
    return { clienteLyraId: candidatos[0].id, acao: 'REUTILIZOU_CLIENTE' }
  }

  // Releitura pontual antes de criar — mesmo padrão de encontrarParcelaCorrespondente/
  // processarCobranca em system-tools.js (reduz, sem eliminar, corrida entre chamadas).
  const releitura = await buscarClienteLyraPorTelefone(lyra, telefoneNormalizado)
  if (releitura.length === 1) return { clienteLyraId: releitura[0].id, acao: 'REUTILIZOU_CLIENTE' }
  if (releitura.length > 1) {
    return { erro: { httpStatus: 409, body: { success: false, elegivel: false, error: 'Mais de um Cliente encontrado na Lyra para este telefone (releitura) — requer auditoria manual', acao_cliente_lyra: 'CLIENTE_DUPLICADO', ids_encontrados: releitura.map(c => c.id), dryRun: false, escritas_realizadas: 0 } } }
  }

  const novoCliente = await lyra.entities.Cliente.create({ name: clientePrime.nome, phone: telefoneNormalizado })
  return { clienteLyraId: novoCliente.id, acao: 'CRIOU_CLIENTE' }
}

// Recuperação determinística: busca uma Cobranca na Lyra já vinculada a esta Parcela.
// Usada ANTES de chamar criarCobranca (retomada de execução anterior) e DEPOIS de uma
// falha na chamada (timeout/erro de rede/resposta inválida) — nunca confia em
// nome+valor+vencimento como primeira tentativa (esse fallback é só do sync-lyra legado).
async function buscarCobrancaLyraPorPrimeParcelaId(lyra, primeParcelaId) {
  const candidatos = await lyra.entities.Cobranca.filter({ prime_parcela_id: primeParcelaId })
  return candidatos || []
}

export function validarRespostaCriarCobranca(json) {
  if (!json || typeof json !== 'object') return { valido: false, motivo: 'Resposta não é um JSON válido' }
  if (json.success !== true) return { valido: false, motivo: 'Resposta indica success !== true' }
  if (!json.cobranca_id || !json.mp_preference_id || !json.payment_link) {
    return { valido: false, motivo: 'JSON incompleto — faltam cobranca_id/mp_preference_id/payment_link' }
  }
  return { valido: true }
}

// Chamada HTTP direta ao endpoint comprovado (não usa lyra.functions.invoke() — não há
// evidência de que o SDK atual ofereça o mesmo contrato pra chamadas externas de function).
export async function chamarCriarCobrancaLyra(payload) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), CRIAR_COBRANCA_TIMEOUT_MS)
  try {
    const resp = await fetch(LYRA_CRIAR_COBRANCA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', api_key: BASE44_API_KEY },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    let json = null
    try {
      json = await resp.json()
    } catch (parseErr) {
      return { ok: false, motivo: 'Resposta não pôde ser lida como JSON', httpStatusRecebido: resp.status }
    }
    if (!resp.ok) {
      return { ok: false, motivo: `HTTP ${resp.status} da Lyra`, httpStatusRecebido: resp.status, json }
    }
    const validacao = validarRespostaCriarCobranca(json)
    if (!validacao.valido) {
      return { ok: false, motivo: validacao.motivo, httpStatusRecebido: resp.status, json }
    }
    return { ok: true, json }
  } catch (err) {
    const motivo = err.name === 'AbortError' ? 'Timeout (15s) na chamada a criarCobranca' : `Erro de rede: ${err.message}`
    return { ok: false, motivo }
  } finally {
    clearTimeout(timeoutId)
  }
}

// Garante exatamente 1 HistoricoAtividade por Parcela pra este evento — mesmo padrão de
// marcador fixo (idempotência por conteúdo, não por texto/data variável) já usado em
// garantirHistoricoBaixaAutomatica (system-tools.js), reaproveitado aqui com tipo/marcador
// próprios: tipo 'criacao' (enum já existente, não inventa valor novo) + '[COBRANÇA ONLINE]'.
async function garantirHistoricoCobrancaOnline(prime, { parcelaId, clienteNome, valor, cobrancaId, dryRunFalse }) {
  const ehDesteEvento = h => h.tipo === 'criacao' && (h.descricao || '').startsWith('[COBRANÇA ONLINE]')

  const existentes = await prime.entities.HistoricoAtividade.filter({ cobranca_id: parcelaId })
  if (existentes.some(ehDesteEvento)) return { criado: false }

  const releitura = await prime.entities.HistoricoAtividade.filter({ cobranca_id: parcelaId })
  if (releitura.some(ehDesteEvento)) return { criado: false, nota: 'detectado na releitura de concorrência' }

  await prime.entities.HistoricoAtividade.create({
    cobranca_id: parcelaId,
    tipo: 'criacao',
    cliente_nome: clienteNome,
    valor,
    detalhes: `[COBRANÇA ONLINE] Cobrança gerada via Lyra/Mercado Pago em ${new Date().toISOString()} (cobranca_id: ${cobrancaId}).`,
    descricao: `[COBRANÇA ONLINE] Cobrança de R$ ${Number(valor).toFixed(2)} gerada para ${clienteNome}`,
  })
  return { criado: true }
}

// Orquestrador do modo real. Chamado só quando dryRun === false. Nunca é acionado
// automaticamente pelo dispatcher — exige o parâmetro explícito no body da requisição.
export async function gerarCobrancaLyraReal({ parcelaId }) {
  const prime = createClient({ appId: PRIME_APP_ID, headers: { api_key: BASE44_API_KEY } })
  const lyra = createClient({ appId: LYRA_APP_ID, headers: { api_key: BASE44_API_KEY } })

  const { erro: erroContexto, contexto } = await coletarContextoBasico(prime, parcelaId)
  if (erroContexto) return erroContexto
  const { parcela, venda, clientePrime, telefoneNormalizado } = contexto

  // --- FASE 2.3B.1: se a Parcela já tem qualquer um dos 3 identificadores, não cria nada
  // de novo — só localiza e devolve a Cobranca existente, de forma idempotente. ---
  if (parcela.lyra_cobranca_id || parcela.mp_preference_id || parcela.payment_link) {
    return await resolverIdempotenciaExistente(lyra, parcela)
  }

  const { saldoOficial } = calcularSaldoOficial(parcela)
  if (saldoOficial <= 0) {
    return { httpStatus: 422, body: { success: false, error: 'Saldo oficial da Parcela é zero ou negativo', saldo_oficial: saldoOficial, dryRun: false, escritas_realizadas: 0 } }
  }

  // --- Recuperação-primeiro: talvez uma execução anterior já tenha criado a Cobranca
  // na Lyra e só o update do PRIME tenha falhado (Parcela ainda sem nenhum dos 3 campos).
  // Nunca reprocessa criarCobranca sem checar isso antes. ---
  let cobrancasExistentes
  try {
    cobrancasExistentes = await buscarCobrancaLyraPorPrimeParcelaId(lyra, parcela.id)
  } catch (err) {
    console.error('[gerar-cobranca-lyra:real] Erro ao checar recuperação por prime_parcela_id:', err.message)
    return { httpStatus: 502, body: { success: false, error: 'Falha ao consultar Cobranca existente na Lyra', detail: err.message, dryRun: false, escritas_realizadas: 0 } }
  }
  if (cobrancasExistentes.length > 1) {
    return { httpStatus: 409, body: { success: false, error: 'Mais de uma Cobranca na Lyra vinculada a este prime_parcela_id — requer auditoria manual', ids_encontrados: cobrancasExistentes.map(c => c.id), dryRun: false, escritas_realizadas: 0 } }
  }

  let cobrancaFinal = null
  let acaoCliente = null

  if (cobrancasExistentes.length === 1) {
    // Recuperação de execução anterior — não chama criarCobranca de novo.
    const c = cobrancasExistentes[0]
    cobrancaFinal = { cobranca_id: c.id, mp_preference_id: c.mp_preference_id, payment_link: c.payment_link, reutilizada: true }
    console.log('[gerar-cobranca-lyra:real] Recuperado via prime_parcela_id, sem nova chamada à Lyra', { parcela_id: parcela.id, cobranca_id: c.id })
  } else {
    // --- Resolve/cria Cliente na Lyra ---
    let resolucaoCliente
    try {
      resolucaoCliente = await resolverOuCriarClienteLyra(lyra, clientePrime, telefoneNormalizado)
    } catch (err) {
      console.error('[gerar-cobranca-lyra:real] Erro ao resolver Cliente na Lyra:', err.message)
      return { httpStatus: 502, body: { success: false, error: 'Falha ao resolver Cliente na Lyra', detail: err.message, dryRun: false, escritas_realizadas: 0 } }
    }
    if (resolucaoCliente.erro) return resolucaoCliente.erro
    acaoCliente = resolucaoCliente.acao

    const descricaoDeterministica = `Parcela ${parcela.numero || 1} - ${venda.descricao_itens || 'Venda PRIME'}`
    const payload = {
      cliente_id: resolucaoCliente.clienteLyraId,
      cliente_nome: clientePrime.nome,
      valor: saldoOficial,
      vencimento: parcela.data_vencimento,
      descricao: descricaoDeterministica,
      prime_parcela_id: parcela.id,
    }

    const resultadoChamada = await chamarCriarCobrancaLyra(payload)

    if (!resultadoChamada.ok) {
      console.error('[gerar-cobranca-lyra:real] Falha na chamada a criarCobranca:', resultadoChamada.motivo, { parcela_id: parcela.id })
      // Falha na chamada (timeout, rede, JSON inválido, HTTP não-2xx) — antes de desistir,
      // checa se a Lyra criou a Cobranca mesmo assim (não fazemos retry cego).
      let recuperacaoPosFalha
      try {
        recuperacaoPosFalha = await buscarCobrancaLyraPorPrimeParcelaId(lyra, parcela.id)
      } catch (err) {
        recuperacaoPosFalha = []
      }
      if (recuperacaoPosFalha.length === 1) {
        const c = recuperacaoPosFalha[0]
        cobrancaFinal = { cobranca_id: c.id, mp_preference_id: c.mp_preference_id, payment_link: c.payment_link, reutilizada: true }
        console.log('[gerar-cobranca-lyra:real] Recuperado após falha na chamada — Cobranca existia na Lyra', { parcela_id: parcela.id, cobranca_id: c.id })
      } else if (recuperacaoPosFalha.length > 1) {
        return { httpStatus: 409, body: { success: false, error: 'Falha na chamada e mais de uma Cobranca encontrada na recuperação — requer auditoria manual', parcela_id: parcela.id, dryRun: false, escritas_realizadas: 0 } }
      } else {
        return { httpStatus: 502, body: { success: false, error: 'Falha ao chamar criarCobranca na Lyra e nenhuma Cobranca recuperável encontrada', motivo: resultadoChamada.motivo, parcela_id: parcela.id, dryRun: false, escritas_realizadas: 0 } }
      }
    } else {
      const j = resultadoChamada.json
      cobrancaFinal = { cobranca_id: j.cobranca_id, mp_preference_id: j.mp_preference_id, payment_link: j.payment_link, reutilizada: Boolean(j.reutilizada) }
    }
  }

  // --- Atualiza a Parcela (releitura pontual antes, mesmo padrão de processarCobranca) ---
  let parcelaAtual
  try {
    parcelaAtual = await prime.entities.Parcela.get(parcela.id)
  } catch (err) {
    console.error('[gerar-cobranca-lyra:real] Cobrança criada na Lyra, mas releitura da Parcela falhou — recuperável na próxima chamada', { parcela_id: parcela.id, cobranca_id: cobrancaFinal.cobranca_id })
    return { httpStatus: 500, body: { success: false, error: 'Cobrança gerada na Lyra, mas falha ao reler a Parcela antes do update — recuperável na próxima chamada via prime_parcela_id', prime_parcela_id: parcela.id, dryRun: false, escritas_realizadas: 0 } }
  }

  if (!parcelaAtual.lyra_cobranca_id) {
    try {
      await prime.entities.Parcela.update(parcela.id, {
        lyra_cobranca_id: cobrancaFinal.cobranca_id,
        mp_preference_id: cobrancaFinal.mp_preference_id,
        payment_link: cobrancaFinal.payment_link,
      })
    } catch (err) {
      console.error('[gerar-cobranca-lyra:real] Cobrança existe na Lyra, mas update da Parcela falhou — recuperável na próxima chamada', { parcela_id: parcela.id, cobranca_id: cobrancaFinal.cobranca_id, erro: err.message })
      return { httpStatus: 500, body: { success: false, error: 'Cobrança gerada na Lyra, mas falha ao atualizar a Parcela — recuperável na próxima chamada via prime_parcela_id', prime_parcela_id: parcela.id, dryRun: false, escritas_realizadas: 0 } }
    }
  }

  // --- Histórico idempotente ---
  let historico = { criado: false }
  try {
    historico = await garantirHistoricoCobrancaOnline(prime, {
      parcelaId: parcela.id,
      clienteNome: clientePrime.nome,
      valor: saldoOficial,
      cobrancaId: cobrancaFinal.cobranca_id,
    })
  } catch (err) {
    console.error('[gerar-cobranca-lyra:real] Falha ao registrar HistoricoAtividade (não bloqueia a resposta):', err.message)
  }

  return {
    httpStatus: 200,
    body: {
      success: true,
      dryRun: false,
      lyra_cobranca_id: cobrancaFinal.cobranca_id,
      mp_preference_id: cobrancaFinal.mp_preference_id,
      payment_link: cobrancaFinal.payment_link,
      reutilizada: cobrancaFinal.reutilizada,
      acao_cliente_lyra: acaoCliente,
      historico_criado: historico.criado,
      escritas_realizadas: 1,
    },
  }
}
