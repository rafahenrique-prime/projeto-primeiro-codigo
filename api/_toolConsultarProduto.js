/**
 * api/_toolConsultarProduto.js
 *
 * Helper privado (prefixo "_" — mesmo padrão de _consultarCep.js/_nexClientes.js,
 * nunca vira Function pública própria, nunca `export default`). Implementa a
 * ferramenta central e neutra de canal "consultar-produto" da IGNITE PRIME Tool
 * API (Fase 3, Etapa 3.3), consumida por api/system-tools.js via
 * ?tool=consultar-produto.
 *
 * ===== ACESSO AO SUPABASE =====
 * REST direto via fetch — mesmo padrão de api/_nexClientes.js: `supabaseConfig`
 * é um objeto simples `{ baseUrl, headers }`, nunca @supabase/supabase-js.
 * Consulta somente a tabela `products` já auditada (Fase 3, ajuste final do
 * plano) — nunca select=*, sempre a allowlist fixa nome,preco,link,imagem.
 * `fetchImpl` é injetável separadamente (default: global fetch) para permitir
 * testes locais sem tocar global.fetch, além do já suportado mock de
 * supabaseConfig/fetch global usado no resto do projeto.
 *
 * ===== DADO CRÍTICO DA AUDITORIA (Fase 3, ajuste final do plano) =====
 * A tabela `products` não tem coluna de estoque/disponibilidade/tamanho/cor —
 * `foundInCatalog: true` significa somente "produto cadastrado", nunca
 * "em estoque". `availabilityStatus` é sempre 'unknown' nesta v1;
 * `sizeConfirmed`/`colorConfirmed` são sempre `false` — nunca inferidos como
 * confirmados a partir do texto do nome do produto.
 *
 * ===== MINIMIZAÇÃO DE DADOS (avaliação desta etapa) =====
 * `messageId` foi avaliado e removido do contrato: esta ferramenta busca por
 * texto de produto, não precisa de nenhum identificador de mensagem/conversa
 * para funcionar. `query` foi avaliado e removido do corpo da RESPOSTA (o
 * consumidor já o enviou no request, ecoá-lo de volta é redundante e aumenta
 * exposição sem necessidade).
 */

const PRODUCTS_SELECT = 'nome,preco,link,imagem'
const SOURCE_REQUEST_TIMEOUT_MS = 8000
const MAX_RESULTS = 3
const QUERY_MAX_LENGTH = 120
const SIDE_FIELD_MAX_LENGTH = 20

export const ERROR_CODES = Object.freeze({
  INVALID_BODY: 'invalid_body',
  QUERY_REQUIRED: 'query_required',
  INVALID_FIELD: 'invalid_field',
  SOURCE_TIMEOUT: 'source_timeout',
  SOURCE_UNAVAILABLE: 'source_unavailable',
  SOURCE_INVALID_RESPONSE: 'source_invalid_response',
  INTERNAL_ERROR: 'internal_error',
})

// Vocabulário fechado de propriedades aceitas no body — qualquer propriedade
// fora desta lista rejeita o request inteiro (contrato fechado, mesmo padrão
// já usado em gerar-cobranca-lyra modo frontend).
const ALLOWED_BODY_KEYS = ['query', 'requestedSize', 'requestedColor']

// Termos genéricos/preenchimento removidos da query antes do scoring — evita
// que saudações, verbos de intenção ou palavras já cobertas por
// requestedSize/requestedColor produzam matches ruidosos. Pequeno e
// determinístico de propósito (v1) — cresce só quando um caso real exigir.
const STOPWORDS = new Set([
  'tem', 'tens', 'quero', 'queria', 'gostaria', 'voce', 'você', 'vc',
  'de', 'da', 'do', 'das', 'dos', 'um', 'uma', 'uns', 'umas',
  'para', 'pra', 'por', 'favor', 'com', 'sem', 'e', 'ou', 'o', 'a', 'os', 'as',
  'me', 'meu', 'minha', 'esse', 'essa', 'esse', 'aquele', 'aquela',
  'manda', 'mandar', 'envia', 'enviar', 'foto', 'fotos', 'imagem',
  'preco', 'preço', 'valor', 'quanto', 'custa',
  'tamanho', 'numero', 'número', 'cor',
  'oi', 'ola', 'olá', 'bom', 'dia', 'tarde', 'noite',
])

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorResponse(httpStatus, errorCode, message) {
  return { httpStatus, body: { success: false, error_code: errorCode, message } }
}

/**
 * Valida o body do request contra o contrato fechado. Função pura, sem I/O.
 */
export function validarPayloadConsultarProduto(body) {
  if (!isPlainObject(body)) {
    return { valido: false, error_code: ERROR_CODES.INVALID_BODY }
  }

  const chaves = Object.keys(body)
  const chavesInvalidas = chaves.filter((k) => !ALLOWED_BODY_KEYS.includes(k))
  if (chavesInvalidas.length > 0) {
    return { valido: false, error_code: ERROR_CODES.INVALID_BODY }
  }

  if (typeof body.query !== 'string' || body.query.trim().length === 0) {
    return { valido: false, error_code: ERROR_CODES.QUERY_REQUIRED }
  }
  const query = body.query.trim()
  if (query.length > QUERY_MAX_LENGTH) {
    return { valido: false, error_code: ERROR_CODES.INVALID_FIELD }
  }

  let requestedSize = null
  if ('requestedSize' in body && body.requestedSize !== undefined && body.requestedSize !== null) {
    if (typeof body.requestedSize !== 'string' || body.requestedSize.trim().length === 0 || body.requestedSize.trim().length > SIDE_FIELD_MAX_LENGTH) {
      return { valido: false, error_code: ERROR_CODES.INVALID_FIELD }
    }
    requestedSize = body.requestedSize.trim()
  }

  let requestedColor = null
  if ('requestedColor' in body && body.requestedColor !== undefined && body.requestedColor !== null) {
    if (typeof body.requestedColor !== 'string' || body.requestedColor.trim().length === 0 || body.requestedColor.trim().length > SIDE_FIELD_MAX_LENGTH) {
      return { valido: false, error_code: ERROR_CODES.INVALID_FIELD }
    }
    requestedColor = body.requestedColor.trim()
  }

  return { valido: true, query, requestedSize, requestedColor }
}

// Normalização de acentos e caixa — mesmo conceito já usado no restante do
// projeto (extractProductName em api/webhook.js), reimplementado aqui porque
// api/ não pode importar de src/services/.
function normalizeText(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

function extractQueryTerms(query) {
  return normalizeText(query)
    .split(/\s+/)
    .filter((term) => term.length >= 2 && !STOPWORDS.has(term))
}

// Regra de correspondência mínima: 1 termo exige match de palavra inteira
// (evita substring ruidosa tipo "ar" batendo em "bermuda"); 2+ termos exige
// pelo menos metade deles presentes (arredondado pra cima), com piso de 2 —
// mesmo espírito conservador já adotado no ajuste final do plano da Fase 3
// (evitar sinais fracos disparando consulta indevida).
function minimumMatchesRequired(termCount) {
  if (termCount <= 1) return 1
  return Math.max(2, Math.ceil(termCount / 2))
}

function scoreProductName(nomeNormalizado, queryTerms) {
  const nomeWords = nomeNormalizado.split(/\s+/)
  let matches = 0
  for (const term of queryTerms) {
    if (nomeWords.includes(term) || nomeNormalizado.includes(term)) matches++
  }
  return matches
}

/**
 * Busca e ranqueia produtos localmente (determinístico). Função pura sobre um
 * array já carregado — sem I/O. Nunca filtra por estoque (a fonte não tem essa
 * informação); requestedSize/requestedColor nunca são misturados à query.
 */
export function buscarERanquearProdutos(products, query) {
  const queryTerms = extractQueryTerms(query)
  if (queryTerms.length === 0) {
    return { results: [], ambiguous: false, truncated: false }
  }

  const minMatches = minimumMatchesRequired(queryTerms.length)

  const candidatos = (Array.isArray(products) ? products : [])
    .map((p) => {
      const nomeNormalizado = normalizeText(p?.nome)
      const score = scoreProductName(nomeNormalizado, queryTerms)
      return { produto: p, score }
    })
    .filter((c) => c.score >= minMatches)

  // Ordenação determinística: maior score primeiro; empate por nome em ordem
  // alfabética (nunca por ordem de chegada da fonte).
  candidatos.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return String(a.produto?.nome ?? '').localeCompare(String(b.produto?.nome ?? ''))
  })

  const topScore = candidatos[0]?.score ?? 0
  const empatadosNoTopo = candidatos.filter((c) => c.score === topScore).length
  const ambiguous = empatadosNoTopo > 1

  const truncated = candidatos.length > MAX_RESULTS
  const results = candidatos.slice(0, MAX_RESULTS).map((c) => ({
    nome: c.produto?.nome ?? '',
    preco: c.produto?.preco ?? '',
    link: c.produto?.link ?? '',
    imagem: c.produto?.imagem ?? '',
  }))

  return { results, ambiguous, truncated }
}

async function fetchProductsFromSource({ supabaseConfig, fetchImpl }) {
  const url = `${supabaseConfig.baseUrl}/rest/v1/products?select=${PRODUCTS_SELECT}&order=nome.asc&limit=500`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SOURCE_REQUEST_TIMEOUT_MS)

  try {
    const response = await fetchImpl(url, { headers: supabaseConfig.headers, signal: controller.signal })
    clearTimeout(timeout)

    if (!response.ok) {
      return { ok: false, error_code: ERROR_CODES.SOURCE_UNAVAILABLE }
    }

    let data
    try {
      data = await response.json()
    } catch {
      return { ok: false, error_code: ERROR_CODES.SOURCE_INVALID_RESPONSE }
    }

    if (!Array.isArray(data)) {
      return { ok: false, error_code: ERROR_CODES.SOURCE_INVALID_RESPONSE }
    }

    return { ok: true, products: data }
  } catch (e) {
    clearTimeout(timeout)
    const code = e.name === 'AbortError' ? ERROR_CODES.SOURCE_TIMEOUT : ERROR_CODES.SOURCE_UNAVAILABLE
    return { ok: false, error_code: code }
  }
}

/**
 * Entrada única do helper — chamada por api/system-tools.js (tool=consultar-produto)
 * já com o caller identificado pelo segredo validado (nunca por campo autodeclarado
 * no body). `deps.supabaseConfig` = { baseUrl, headers } (mesmo padrão de
 * _nexClientes.js); `deps.fetchImpl` é opcional (default: global fetch).
 *
 * @param {unknown} body
 * @param {{ caller: string }} identity
 * @param {{ supabaseConfig: {baseUrl: string, headers: object}, fetchImpl?: Function }} deps
 */
export async function consultarProduto(body, identity, deps) {
  const validacao = validarPayloadConsultarProduto(body)
  if (!validacao.valido) {
    const status = validacao.error_code === ERROR_CODES.INVALID_BODY ? 400 : 400
    return errorResponse(status, validacao.error_code, 'Request inválido para consultar-produto.')
  }

  const { query, requestedSize, requestedColor } = validacao
  const caller = identity?.caller ?? 'unknown'
  const fetchImpl = deps?.fetchImpl ?? fetch

  // Log de observabilidade — nunca a query completa (pode conter texto livre
  // do cliente final, via Bridge/GPTMaker). Só metadados agregados.
  console.log('[toolConsultarProduto] busca recebida', {
    caller,
    queryLength: query.length,
    termCount: extractQueryTerms(query).length,
  })

  try {
    const fonte = await fetchProductsFromSource({ supabaseConfig: deps?.supabaseConfig, fetchImpl })
    if (!fonte.ok) {
      console.warn('[toolConsultarProduto] Falha ao consultar a fonte de produtos', { caller, error_code: fonte.error_code })
      return {
        httpStatus: 200,
        body: {
          success: false,
          caller,
          error_code: fonte.error_code,
          foundInCatalog: false,
          availabilityStatus: 'unknown',
          requestedSize,
          sizeConfirmed: false,
          requestedColor,
          colorConfirmed: false,
          results: [],
          ambiguous: false,
          truncated: false,
        },
      }
    }

    const { results, ambiguous, truncated } = buscarERanquearProdutos(fonte.products, query)

    console.log('[toolConsultarProduto] busca concluída', {
      caller,
      found: results.length > 0,
      resultCount: results.length,
    })

    return {
      httpStatus: 200,
      body: {
        success: true,
        caller,
        foundInCatalog: results.length > 0,
        availabilityStatus: 'unknown',
        requestedSize,
        sizeConfirmed: false,
        requestedColor,
        colorConfirmed: false,
        results,
        ambiguous,
        truncated,
      },
    }
  } catch (e) {
    // e.message nunca é exposto ao consumidor — só logado internamente, e
    // mesmo aqui não deve conter segredo/payload bruto (erros esperados desta
    // função são só de parsing/rede, já tratados em fetchProductsFromSource).
    console.error('[toolConsultarProduto] Erro interno inesperado:', e.message)
    return {
      httpStatus: 200,
      body: {
        success: false,
        caller,
        error_code: ERROR_CODES.INTERNAL_ERROR,
        foundInCatalog: false,
        availabilityStatus: 'unknown',
        requestedSize,
        sizeConfirmed: false,
        requestedColor,
        colorConfirmed: false,
        results: [],
        ambiguous: false,
        truncated: false,
      },
    }
  }
}
