// PRIME Bridge — ferramenta "consultar_produto", Fase 3, Etapa 3.4
//
// Primeira ToolDefinition real do Tool Router (contrato em ./contract.js).
// match() é puro/síncrono/sem I/O. execute() é assíncrono mas nunca toca rede
// real diretamente — delega a uma dependência injetada (requestToolApi), que
// nesta etapa não é conectada a nenhuma URL/segredo real (ver tools/index.js).
//
// Responsabilidade de execute(): chamar requestToolApi(params), validar o
// formato da resposta e converter para um ToolResult seguro — nunca lança,
// nunca repassa payload bruto/headers/segredo/stack trace ao chamador.

// --- Listas pequenas, explícitas, fáceis de manter (Fase 3, v1) ---------
// Não tentam cobrir todo o mercado — crescem só quando um caso real exigir.

const BRANDS = ['nike', 'adidas', 'puma', 'vans', 'converse', 'diesel', 'fila', 'olympikus', 'mizuno', 'asics']

const CATEGORIES = [
  'tenis', 'bermuda', 'camisa', 'camiseta', 'bone', 'cueca', 'vestido',
  'short', 'calca', 'jaqueta', 'regata', 'sandalia', 'chinelo', 'meia',
]

const COLORS = [
  'preto', 'branco', 'azul', 'vermelho', 'marrom', 'cinza', 'verde',
  'amarelo', 'rosa', 'roxo', 'bege', 'laranja', 'dourado', 'prateado', 'vinho',
]

// Verbos/termos de intenção genérica — nunca suficientes sozinhos para dar
// match (ver ALGORITMO DE MATCH abaixo); servem só para serem removidos da
// query final, nunca para contar como sinal de produto.
const INTENT_TERMS = new Set([
  'tem', 'tens', 'quero', 'queria', 'gostaria', 'manda', 'mandar', 'envia',
  'enviar', 'vende', 'vendem', 'custa', 'quanto', 'disponivel', 'voce', 'você',
  'vc', 'oi', 'ola', 'olá', 'por', 'favor', 'de', 'da', 'do', 'uma', 'um',
])

const LETTER_SIZES = new Set(['pp', 'p', 'm', 'g', 'gg', 'eg', 'xg', 'xgg'])

const NUMERIC_SIZE_RE = /^\d{2,3}$/

const DEFAULT_MIN_CONFIDENCE = 0.6
const DEFAULT_TIMEOUT_MS = 8000 // documentado: se requestToolApi já aplica seu próprio timeout (fetch injetado), este valor é só um teto declarado no contrato — nenhum timer real é criado aqui nesta etapa.

const RESULT_ALLOWLIST = ['nome', 'preco', 'link', 'imagem']

function normalizeText(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

// Remove pontuação básica sem destruir acentos/hífens úteis dentro de palavras.
function stripBasicPunctuation(text) {
  return String(text ?? '').replace(/[?!.,;:]/g, '')
}

function tokenize(messageText) {
  return stripBasicPunctuation(messageText)
    .split(/\s+/)
    .filter((t) => t.length > 0)
}

// ============================================================================
// ALGORITMO DE MATCH — determinístico, sem I/O, sem estado.
//
// Sinais aceitos (conservadores, aprovados na Fase 3):
//   - marca conhecida (BRANDS) presente na mensagem;
//   - categoria conhecida (CATEGORIES) presente na mensagem.
// Um verbo de intenção (INTENT_TERMS) nunca é sinal suficiente sozinho — ele
// só é removido da query final. "Quanto custa?"/"Tem disponível?" isolados
// (sem marca/categoria) sempre resultam em matched=false.
//
// requestedSize/requestedColor são extraídos e nunca entram na query
// principal (nem na checagem de marca/categoria).
// ============================================================================
function analisarMensagem(messageText) {
  const tokens = tokenize(messageText)

  let requestedSize
  let requestedColor
  let hasBrand = false
  let hasCategory = false
  const queryTokens = []

  for (const token of tokens) {
    const normalized = normalizeText(token)

    if (requestedSize === undefined && (NUMERIC_SIZE_RE.test(normalized) || LETTER_SIZES.has(normalized))) {
      requestedSize = token
      continue
    }

    if (requestedColor === undefined && COLORS.includes(normalized)) {
      requestedColor = token
      continue
    }

    if (INTENT_TERMS.has(normalized)) {
      continue
    }

    if (BRANDS.includes(normalized)) hasBrand = true
    if (CATEGORIES.includes(normalized)) hasCategory = true

    queryTokens.push(token)
  }

  return {
    query: queryTokens.join(' '),
    requestedSize,
    requestedColor,
    hasBrand,
    hasCategory,
  }
}

function calcularConfidence(hasBrand, hasCategory) {
  if (hasBrand && hasCategory) return 0.95
  if (hasBrand) return 0.75
  if (hasCategory) return 0.65
  return 0
}

/**
 * match() do contrato ToolDefinition — síncrono, sem I/O, sem env, sem fetch,
 * determinístico, nunca modifica messageText/context.
 */
function match(messageText, context) {
  if (typeof messageText !== 'string' || messageText.trim().length === 0) {
    return { matched: false, confidence: 0, reason: 'empty_or_invalid_message' }
  }

  const analise = analisarMensagem(messageText)

  if (!analise.hasBrand && !analise.hasCategory) {
    return { matched: false, confidence: 0, reason: 'no_known_brand_or_category' }
  }

  if (analise.query.trim().length === 0) {
    return { matched: false, confidence: 0, reason: 'no_query_text_after_extraction' }
  }

  const confidence = Math.min(1, calcularConfidence(analise.hasBrand, analise.hasCategory))

  const params = { query: analise.query }
  if (analise.requestedSize !== undefined) params.requestedSize = analise.requestedSize
  if (analise.requestedColor !== undefined) params.requestedColor = analise.requestedColor

  return { matched: true, confidence, params }
}

// --- Mapeamento da resposta da Tool API (Etapa 3.3) para ToolResult -------

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sanitizarResultados(results) {
  if (!Array.isArray(results)) return []
  return results.map((item) => {
    const limpo = {}
    for (const campo of RESULT_ALLOWLIST) {
      limpo[campo] = isPlainObject(item) && campo in item ? item[campo] : ''
    }
    return limpo
  })
}

function toolResultDeErro(code) {
  return { ok: false, error: { code } }
}

/**
 * Converte a resposta crua da Tool API (contrato da Etapa 3.3) num
 * ToolResult seguro. Nunca lança — qualquer formato inesperado vira
 * toolResultDeErro('invalid_response'), nunca propaga o payload bruto.
 */
function mapearRespostaParaToolResult(resposta) {
  if (!isPlainObject(resposta) || typeof resposta.success !== 'boolean') {
    return toolResultDeErro('invalid_response')
  }

  if (resposta.success === false) {
    const code = typeof resposta.error_code === 'string' && resposta.error_code.trim().length > 0
      ? resposta.error_code
      : 'api_error'
    return toolResultDeErro(code)
  }

  return {
    ok: true,
    found: resposta.foundInCatalog === true,
    results: sanitizarResultados(resposta.results),
    truncated: resposta.truncated === true,
    ambiguous: resposta.ambiguous === true,
    availabilityStatus: 'unknown',
    requestedSize: resposta.requestedSize ?? null,
    sizeConfirmed: false,
    requestedColor: resposta.requestedColor ?? null,
    colorConfirmed: false,
  }
}

/**
 * Fábrica da ToolDefinition — recebe a dependência de rede injetada
 * (requestToolApi). Se não for fornecida (caso do registry nesta etapa,
 * antes da integração real), execute() nunca tenta nenhuma chamada — só
 * devolve um ToolResult de erro estruturado, determinístico e seguro.
 *
 * @param {{ requestToolApi?: (params: {query: string, requestedSize?: string, requestedColor?: string}) => Promise<unknown> }} deps
 */
export function createConsultarProdutoTool(deps = {}) {
  const requestToolApi = deps.requestToolApi

  async function execute(input) {
    if (typeof requestToolApi !== 'function') {
      return toolResultDeErro('tool_not_configured')
    }

    let resposta
    try {
      resposta = await requestToolApi({
        query: input?.query,
        requestedSize: input?.requestedSize,
        requestedColor: input?.requestedColor,
      })
    } catch (err) {
      // Nunca repassa a mensagem de exceção crua (poderia conter URL/host/
      // detalhe interno) — só um código fechado. AbortError (timeout do
      // fetch injetado) ganha um código próprio; qualquer outra exceção
      // (rede, DNS, parsing, etc.) cai no genérico request_failed.
      if (err && err.name === 'AbortError') {
        return toolResultDeErro('timeout')
      }
      return toolResultDeErro('request_failed')
    }

    return mapearRespostaParaToolResult(resposta)
  }

  return Object.freeze({
    name: 'consultar_produto',
    group: 'produto',
    minConfidence: DEFAULT_MIN_CONFIDENCE,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    match,
    execute,
  })
}
