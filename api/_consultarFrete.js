// Helper privado (prefixo "_" — mesmo padrão de _consultarCep.js/_consultarCobrancas.js).
// Exporta só a função nomeada `consultarFrete`, importada por api/system-tools.js
// (tool=mcp, ferramenta consultar_frete). Nenhum `export default`.
//
// Estritamente somente leitura — chama a API oficial da Frenet (POST
// /shipping/quote) pra pré-cotação de frete de uma conta já existente. Não toca
// Base44/Bagy/Supabase, não grava nada. Timeout + tratamento de erro seguem o
// mesmo padrão AbortController já usado em _consultarCep.js.
//
// V1: só `cep_destino` é variável (vem da Gaby). Origem, peso, dimensões e valor
// declarado são fixos — a Gaby nunca define peso/dimensões/CEP origem/preço/prazo,
// só informa o destino. FRENET_SHIPMENT_INVOICE_VALUE_PADRAO abaixo é o valor exato
// do teste real já validado contra a Frenet (SellerCEP 01030001 -> RecipientCEP
// 38401216, retornou HTTP 200 com Loggi/Jadlog/PAC/Sedex) — não alterar sem repetir
// a validação real.

const FRENET_BASE_URL = 'https://api.frenet.com.br'
const FRENET_REQUEST_TIMEOUT_MS = 8000
const CEP_DIGITOS = 8

const FRENET_SELLER_CEP_PADRAO = '01030001'
const FRENET_SHIPMENT_INVOICE_VALUE_PADRAO = 100.0
const FRENET_ITEM_PADRAO = { Weight: 1, Height: 10, Width: 20, Length: 25, Quantity: 1 }

function normalizarCep(valor) {
  return String(valor ?? '').replace(/\D/g, '')
}

function formatarCep(cepDigitos) {
  return `${cepDigitos.slice(0, 5)}-${cepDigitos.slice(5)}`
}

function respostaCepInvalido() {
  return {
    httpStatus: 400,
    body: { status: 'erro', codigo: 'cep_invalido', mensagem: 'Informe um CEP brasileiro válido com 8 dígitos.' },
  }
}

function respostaServicoIndisponivel() {
  return {
    httpStatus: 200,
    body: { status: 'erro', codigo: 'servico_indisponivel', mensagem: 'Não foi possível calcular o frete neste momento.' },
  }
}

function respostaSemOpcoes() {
  return {
    httpStatus: 200,
    body: { status: 'sem_opcoes', codigo: 'frete_sem_opcoes', mensagem: 'Nenhuma modalidade de frete disponível para este CEP.' },
  }
}

// Só repassa os campos que a Gaby precisa expor ao cliente — nunca o JSON bruto
// da Frenet (que traz campos internos como CarrierCode/OriginalShippingPrice).
function normalizarOpcao(servico) {
  return {
    codigo: servico.ServiceCode ?? null,
    servico: servico.ServiceDescription ?? servico.Carrier ?? 'Frete',
    valor: Number(servico.ShippingPrice),
    prazo_dias: Number(servico.DeliveryTime),
  }
}

export async function consultarFrete({ cep_destino } = {}) {
  if (typeof cep_destino !== 'string' || cep_destino.trim().length === 0) {
    return respostaCepInvalido()
  }

  const cepDestinoDigitos = normalizarCep(cep_destino)
  if (cepDestinoDigitos.length !== CEP_DIGITOS) {
    return respostaCepInvalido()
  }

  const FRENET_TOKEN = process.env.FRENET_TOKEN
  if (!FRENET_TOKEN) {
    console.error('[consultarFrete] Configuração ausente: FRENET_TOKEN não definida')
    return respostaServicoIndisponivel()
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FRENET_REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${FRENET_BASE_URL}/shipping/quote`, {
      method: 'POST',
      signal: controller.signal,
      headers: { token: FRENET_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        SellerCEP: FRENET_SELLER_CEP_PADRAO,
        RecipientCEP: cepDestinoDigitos,
        ShipmentInvoiceValue: FRENET_SHIPMENT_INVOICE_VALUE_PADRAO,
        ShippingItemArray: [FRENET_ITEM_PADRAO],
      }),
    })
    clearTimeout(timeout)

    if (!response.ok) {
      console.warn(`[consultarFrete] Frenet respondeu com status ${response.status}`)
      return respostaServicoIndisponivel()
    }

    let dados
    try {
      dados = await response.json()
    } catch (e) {
      console.error('[consultarFrete] Resposta da Frenet não é JSON válido:', e.message)
      return respostaServicoIndisponivel()
    }

    const servicos = Array.isArray(dados?.ShippingSevicesArray) ? dados.ShippingSevicesArray : []
    // Filtro Error=true: a Frenet devolve Error:true por serviço indisponível
    // (não é falha da chamada) — nunca repassar esses como opção válida pra Gaby.
    const opcoesValidas = servicos.filter(s => s?.Error !== true && s?.Error !== 'true')

    if (opcoesValidas.length === 0) {
      return respostaSemOpcoes()
    }

    return {
      httpStatus: 200,
      body: {
        status: 'ok',
        cep_destino: formatarCep(cepDestinoDigitos),
        opcoes: opcoesValidas.map(normalizarOpcao),
      },
    }
  } catch (e) {
    clearTimeout(timeout)
    const code = e.name === 'AbortError' ? 'timeout' : 'falha_rede'
    console.error(`[consultarFrete] Falha na consulta à Frenet: ${code}`)
    return respostaServicoIndisponivel()
  }
}
