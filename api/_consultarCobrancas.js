// Helper privado (prefixo "_" — não vira Function pública, mesmo padrão de
// _gerarCobrancaLyra.js / _profileIdentity.js / _profileMemory.js / _customerScoring.js).
// Exporta só a função nomeada `consultarCobrancas`, importada por api/system-tools.js
// (tool=mcp, ferramenta consultar_cobrancas). Nenhum `export default`.
//
// Fase 2 do MCP Lite — estritamente somente leitura. Só usa filter()/get() do SDK
// Base44 — nunca métodos de escrita (create/update/delete). Fonte exclusiva: app PRIME
// (Cliente → Venda → Parcela). Nunca consulta a Lyra (Cobranca) nem o Supabase — dado
// de cobrança/parcela não existe no Supabase, é 100% Base44.
//
// Regra de segurança central (aprovada explicitamente): uma busca por nome_cliente,
// mesmo com 1 único resultado, NUNCA retorna dado financeiro — só nome + telefone
// mascarado, pedindo o telefone completo. Somente uma busca por telefone completo e
// exato pode retornar cobranças/parcelas.

import { createClient } from '@base44/sdk'

const BASE44_API_KEY = process.env.BASE44_API_KEY
const PRIME_APP_ID = '6a50402b2eeb1d1114312861'

const MAX_CANDIDATOS_NOME = 3
const MAX_LIMITE_PARCELAS = 10
const TELEFONE_MIN_DIGITOS = 10
const TELEFONE_MAX_DIGITOS = 15
const STATUS_VALIDOS = new Set(['aberta', 'vencida', 'paga', 'todas'])

function getPrimeClient() {
  return createClient({ appId: PRIME_APP_ID, headers: { api_key: BASE44_API_KEY } })
}

function normalizarTelefone(valor) {
  return String(valor || '').replace(/\D/g, '')
}

function normalizarNome(valor) {
  return String(valor || '').trim().toLowerCase()
}

// Mascaramento de tamanho FIXO (6 asteriscos, sempre) — diferente do
// mascararTelefone(...) de _gerarCobrancaLyra.js, que usa tamanho variável
// (comprimento total - 4). Aqui o resultado vai para uma resposta de IA que pode ser
// lida por qualquer pessoa na conversa do WhatsApp, então o comprimento fixo evita
// vazar até o número de dígitos do telefone real — só os 4 últimos ficam visíveis.
function mascararTelefoneFixo(telefoneDigitos) {
  const ultimos4 = telefoneDigitos.slice(-4).padStart(4, '*')
  return `******${ultimos4}`
}

// Portado literalmente de src/services/crm/cobrancasService.js:38-45 (mesma fórmula,
// incluindo a mesma imprecisão conhecida de fuso horário: `new Date('YYYY-MM-DD')` é
// interpretado como UTC-meia-noite, o que pode deslocar o dia em ±1 em fusos negativos
// como America/Sao_Paulo perto da virada do dia). Não corrigida aqui de propósito —
// portar exatamente a regra já em produção evita divergência entre o que o painel
// mostra e o que a ferramenta MCP responde; corrigir o fuso é fora do escopo desta fase.
function calcularDiasAtraso(vencimento) {
  if (!vencimento) return 0
  const vencDate = new Date(vencimento)
  const hoje = new Date()
  const diffMs = hoje - vencDate
  const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  return dias > 0 ? dias : 0
}

function arredondar(valor) {
  return Math.round((valor + Number.EPSILON) * 100) / 100
}

// Classificação aprovada: 'pago' vira 'paga'; 'pendente' com dias de atraso > 0 vira
// 'vencida'; 'pendente' sem atraso vira 'aberta'. Não existe status 'vencida'/'cancelada'
// gravado no Base44 — é sempre calculado a partir de data_vencimento (confirmado em
// api/system-tools.js:processarCobranca e em cobrancasService.js).
function classificarParcela(p) {
  const valorTotal = parseFloat(p.valor_atualizado) || parseFloat(p.valor_base) || 0
  const valorPago = parseFloat(p.valor_pago) || 0
  const valorAberto = Math.max(valorTotal - valorPago, 0)
  const diasAtrasoBruto = calcularDiasAtraso(p.data_vencimento)

  let statusCalculado
  if (p.status === 'pago') statusCalculado = 'paga'
  else if (diasAtrasoBruto > 0) statusCalculado = 'vencida'
  else statusCalculado = 'aberta'

  return {
    numero: p.numero || 1,
    valor: arredondar(valorTotal),
    valorAberto,
    vencimento: p.data_vencimento || null,
    statusCalculado,
    // dias_atraso é sempre 0 pra parcela já paga — o campo representa atraso atual
    // em aberto, não quantos dias ela ficou vencida antes de ser paga.
    diasAtraso: statusCalculado === 'paga' ? 0 : diasAtrasoBruto,
  }
}

// Ordenação determinística aprovada: vencidas (mais atrasada primeiro) → abertas
// (vencimento mais próximo primeiro) → pagas (mais recente primeiro). data_vencimento
// é sempre 'YYYY-MM-DD' (data pura, sem hora) — comparação lexicográfica de string
// já é cronologicamente correta nesse formato, sem precisar de Date/fuso.
function compararParcelas(a, b) {
  const ordem = { vencida: 0, aberta: 1, paga: 2 }
  const diffOrdem = ordem[a.statusCalculado] - ordem[b.statusCalculado]
  if (diffOrdem !== 0) return diffOrdem
  if (a.statusCalculado === 'vencida') return b.diasAtraso - a.diasAtraso
  if (a.statusCalculado === 'aberta') return (a.vencimento || '').localeCompare(b.vencimento || '')
  return (b.vencimento || '').localeCompare(a.vencimento || '')
}

function respostaNaoEncontrado() {
  return { httpStatus: 200, body: { status: 'nao_encontrado', mensagem: 'Nenhum cliente encontrado com esses dados.' } }
}

function respostaErro(mensagem = 'Erro ao consultar. Tente novamente.') {
  return { httpStatus: 200, body: { status: 'erro', mensagem } }
}

// Busca só localiza candidato(s) — NUNCA consulta Parcela/Venda aqui. Reconfirma
// igualdade normalizada e exata no nosso próprio código, não confia cegamente no
// comportamento de Cliente.filter({ nome }) do SDK Base44 (case/whitespace-sensitivity
// não documentada) — limitação conhecida: se o filtro do SDK for mais estrito que
// "contém" e não devolver candidatos que só divergem em maiúscula/espaço, essa
// segunda checagem não tem como recuperá-los; precisa validar contra dado real.
async function consultarPorNome(prime, nomeClienteBruto) {
  try {
    const nomeNormalizado = normalizarNome(nomeClienteBruto)
    const brutos = await prime.entities.Cliente.filter({ nome: nomeClienteBruto })
    const candidatos = (brutos || []).filter(c => normalizarNome(c.nome) === nomeNormalizado)

    if (candidatos.length === 0) return respostaNaoEncontrado()

    return {
      httpStatus: 200,
      body: {
        status: 'confirmacao_necessaria',
        candidatos: candidatos.slice(0, MAX_CANDIDATOS_NOME).map(c => ({
          nome: c.nome,
          telefone_mascarado: mascararTelefoneFixo(normalizarTelefone(c.telefone)),
        })),
        mensagem: 'Informe o telefone completo para consultar as cobranças.',
      },
    }
  } catch (e) {
    console.error('[consultarCobrancas:nome] Erro na consulta:', e.message)
    return respostaErro()
  }
}

// Única via que pode retornar dado financeiro. Telefone precisa bater exatamente
// (após normalização) com 1 único Cliente — mais de 1 é tratado como anomalia de
// cadastro e vira "não encontrado" por segurança, nunca escolha automática.
async function consultarPorTelefone(prime, telefoneNormalizado, statusFiltro, limite) {
  try {
    const brutos = await prime.entities.Cliente.filter({ telefone: telefoneNormalizado })
    const candidatos = (brutos || []).filter(c => normalizarTelefone(c.telefone) === telefoneNormalizado)

    if (candidatos.length === 0) return respostaNaoEncontrado()
    if (candidatos.length > 1) {
      console.warn('[consultarCobrancas:telefone] Telefone associado a mais de 1 Cliente — tratado como não encontrado')
      return respostaNaoEncontrado()
    }

    const cliente = candidatos[0]
    const parcelasBrutas = await prime.entities.Parcela.filter({ cliente_id: cliente.id })
    const parcelasClassificadas = (parcelasBrutas || []).map(classificarParcela)

    // Regra revisada (evita resposta contraditória pro GPT Maker): o `resumo` é
    // calculado sobre o MESMO conjunto definido pelo filtro `status`, ANTES do
    // `limite`. Ex.: status=vencida com 8 parcelas vencidas e limite=5 -> resumo
    // reflete as 8, a lista exibida mostra só as 5 primeiras após ordenar. Só o
    // `limite` corta a lista exibida; nunca corta o que o resumo soma. Pra
    // status='todas' o comportamento não muda (filtradas === todas as parcelas).
    const filtradas = statusFiltro && statusFiltro !== 'todas'
      ? parcelasClassificadas.filter(p => p.statusCalculado === statusFiltro)
      : parcelasClassificadas

    const naoPagas = filtradas.filter(p => p.statusCalculado !== 'paga')
    const resumo = {
      total_parcelas_abertas: naoPagas.length,
      total_em_aberto: arredondar(naoPagas.reduce((s, p) => s + p.valorAberto, 0)),
      total_vencido: arredondar(
        filtradas.filter(p => p.statusCalculado === 'vencida').reduce((s, p) => s + p.valorAberto, 0)
      ),
    }

    const limitadas = [...filtradas].sort(compararParcelas).slice(0, limite)

    return {
      httpStatus: 200,
      body: {
        status: 'ok',
        // Nunca o telefone completo na resposta — nem mesmo o que o próprio
        // chamador acabou de enviar como entrada (item 5 da revisão: reduz
        // superfície de repetição de dado sensível no corpo da resposta).
        cliente: { nome: cliente.nome, telefone_mascarado: mascararTelefoneFixo(telefoneNormalizado) },
        resumo,
        parcelas: limitadas.map(p => ({
          numero: p.numero,
          valor: p.valor,
          vencimento: p.vencimento,
          status: p.statusCalculado,
          dias_atraso: p.diasAtraso,
        })),
        aviso: 'Dados sincronizados do PRIME — cobranças criadas há pouco na Lyra podem ainda não aparecer aqui.',
      },
    }
  } catch (e) {
    console.error('[consultarCobrancas:telefone] Erro na consulta:', e.message)
    return respostaErro()
  }
}

// Entrada única do helper. Espelha o inputSchema da ferramenta MCP — validação própria
// aqui é defesa em profundidade, não confia só no schema que o cliente MCP declarou
// seguir. Telefone tem prioridade total sobre nome_cliente quando ambos vêm
// preenchidos: a consulta roda só por telefone, nome_cliente é ignorado.
export async function consultarCobrancas({ nome_cliente, telefone, status = 'todas', limite = 5 } = {}) {
  if (!BASE44_API_KEY) {
    console.error('[consultarCobrancas] Configuração ausente: BASE44_API_KEY não definida')
    return { httpStatus: 500, body: { status: 'erro', mensagem: 'BASE44_API_KEY não configurado' } }
  }

  const temNome = typeof nome_cliente === 'string' && nome_cliente.trim().length > 0
  const temTelefone = typeof telefone === 'string' && telefone.trim().length > 0

  if (!temNome && !temTelefone) {
    return { httpStatus: 400, body: { status: 'erro', mensagem: 'Informe nome_cliente ou telefone.' } }
  }

  const statusFiltro = status === undefined ? 'todas' : status
  if (!STATUS_VALIDOS.has(statusFiltro)) {
    return { httpStatus: 400, body: { status: 'erro', mensagem: 'status inválido. Use: aberta, vencida, paga ou todas.' } }
  }

  const limiteNumero = limite === undefined ? 5 : limite
  if (typeof limiteNumero !== 'number' || !Number.isInteger(limiteNumero) || limiteNumero < 1 || limiteNumero > MAX_LIMITE_PARCELAS) {
    return { httpStatus: 400, body: { status: 'erro', mensagem: `limite deve ser um inteiro entre 1 e ${MAX_LIMITE_PARCELAS}.` } }
  }

  const prime = getPrimeClient()

  if (temTelefone) {
    const telefoneNormalizado = normalizarTelefone(telefone)
    if (telefoneNormalizado.length < TELEFONE_MIN_DIGITOS || telefoneNormalizado.length > TELEFONE_MAX_DIGITOS) {
      return {
        httpStatus: 400,
        body: { status: 'erro', mensagem: `telefone deve ter entre ${TELEFONE_MIN_DIGITOS} e ${TELEFONE_MAX_DIGITOS} dígitos.` },
      }
    }
    return consultarPorTelefone(prime, telefoneNormalizado, statusFiltro, limiteNumero)
  }

  if (nome_cliente.trim().length < 3 || nome_cliente.trim().length > 120) {
    return { httpStatus: 400, body: { status: 'erro', mensagem: 'nome_cliente deve ter entre 3 e 120 caracteres.' } }
  }
  return consultarPorNome(prime, nome_cliente)
}
