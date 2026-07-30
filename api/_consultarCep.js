// Helper privado (prefixo "_" — não vira Function pública, mesmo padrão de
// _consultarCobrancas.js / _gerarCobrancaLyra.js). Exporta só a função nomeada
// `consultarCep`, importada por api/system-tools.js (tool=mcp, ferramenta
// consultar_cep). Nenhum `export default`.
//
// Estritamente somente leitura, sem nenhuma dependência interna — não toca
// Base44/Bagy/Frenet/Supabase, não grava nada. Só chama a API pública do ViaCEP
// (sem autenticação, sem segredo). Timeout + tratamento de erro seguem o mesmo
// padrão AbortController já usado em openrouterUsage/perplexityHealth dentro de
// api/system-tools.js.

const VIACEP_BASE_URL = 'https://viacep.com.br/ws'
const VIACEP_REQUEST_TIMEOUT_MS = 8000
const CEP_DIGITOS = 8

function normalizarCep(valor) {
  return String(valor ?? '').replace(/\D/g, '')
}

function respostaCepInvalido() {
  return {
    httpStatus: 400,
    body: { status: 'erro', codigo: 'cep_invalido', mensagem: 'Informe um CEP brasileiro válido com 8 dígitos.' },
  }
}

function respostaNaoEncontrado() {
  return {
    httpStatus: 200,
    body: { status: 'nao_encontrado', codigo: 'cep_nao_encontrado', mensagem: 'O CEP informado não foi encontrado.' },
  }
}

function respostaServicoIndisponivel() {
  return {
    httpStatus: 200,
    body: { status: 'erro', codigo: 'servico_indisponivel', mensagem: 'Não foi possível consultar o CEP neste momento.' },
  }
}

function formatarCep(cepDigitos) {
  return `${cepDigitos.slice(0, 5)}-${cepDigitos.slice(5)}`
}

// Campos vazios do ViaCEP já vêm como string vazia (nunca null/undefined) — mantidos
// como o ViaCEP devolve, sem inventar nem converter pra null.
function mapearEndereco(cepDigitos, dadosViaCep) {
  return {
    cep: formatarCep(cepDigitos),
    logradouro: dadosViaCep.logradouro ?? '',
    complemento: dadosViaCep.complemento ?? '',
    bairro: dadosViaCep.bairro ?? '',
    cidade: dadosViaCep.localidade ?? '',
    estado: dadosViaCep.uf ?? '',
    ibge: dadosViaCep.ibge ?? '',
  }
}

// Entrada única do helper. Espelha o inputSchema da ferramenta MCP — validação
// própria aqui é defesa em profundidade, não confia só no schema que o cliente MCP
// declarou seguir.
export async function consultarCep({ cep } = {}) {
  if (typeof cep !== 'string' || cep.trim().length === 0) {
    return respostaCepInvalido()
  }

  const cepNormalizado = normalizarCep(cep)
  if (cepNormalizado.length !== CEP_DIGITOS) {
    return respostaCepInvalido()
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), VIACEP_REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${VIACEP_BASE_URL}/${cepNormalizado}/json/`, { signal: controller.signal })
    clearTimeout(timeout)

    if (!response.ok) {
      console.warn(`[consultarCep] ViaCEP respondeu com status ${response.status}`)
      return respostaServicoIndisponivel()
    }

    let dados
    try {
      dados = await response.json()
    } catch (e) {
      console.error('[consultarCep] Resposta do ViaCEP não é JSON válido:', e.message)
      return respostaServicoIndisponivel()
    }

    // ViaCEP devolve `{ erro: true }` (sem os demais campos) pra CEP inexistente —
    // não é uma falha de rede/serviço, é uma resposta válida de "não encontrado".
    if (dados?.erro === true) {
      return respostaNaoEncontrado()
    }

    return {
      httpStatus: 200,
      body: {
        status: 'encontrado',
        endereco: mapearEndereco(cepNormalizado, dados || {}),
        aviso: 'O número do imóvel e o complemento devem ser confirmados com o cliente.',
      },
    }
  } catch (e) {
    clearTimeout(timeout)
    const code = e.name === 'AbortError' ? 'timeout' : 'falha_rede'
    console.error(`[consultarCep] Falha na consulta ao ViaCEP: ${code}`)
    return respostaServicoIndisponivel()
  }
}
