import crypto from 'node:crypto'
import { getStoryContext } from '../api/_storyContext.js'
import { identificarProdutoPorImagem } from '../api/_visaoProduto.js'

const LAB_HEADER = 'GABY-LAB-COMERCIAL-V1'
const LAB_MODE = 'story-shadow-v1'
const STORY_MATCH_CONFIDENCE_THRESHOLD = 25
const SHADOW_TIMEOUT_MS = 15000
const CACHE_TIMEOUT_MS = 5000
const MULTI_CACHE_PREFIX = 'MULTI::'
const SINGLE_CACHE_PREFIX = 'UNICO::'
const TOKENS_PERGUNTA_GENERICOS = new Set([
  'qual', 'valor', 'preco', 'quanto', 'custa', 'tem', 'tamanho', 'numero', 'disponivel',
  'desse', 'dessa', 'deste', 'desta', 'dele', 'dela', 'me', 'fala', 'por', 'favor',
  'ai', 'aqui', 'quero', 'saber', 'modelo', 'produto', 'o', 'a', 'os', 'as', 'um', 'uma',
  'de', 'do', 'da', 'dos', 'das', 'e',
])

function readHeader(req, name) {
  const value = req?.headers?.[name]
  return Array.isArray(value) ? value[0] : value
}

export function isGabyLabStoryShadowRequest(req) {
  return readHeader(req, 'x-prime-lab') === LAB_HEADER &&
    readHeader(req, 'x-prime-lab-mode') === LAB_MODE
}

function normalizarTexto(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function extrairCampoVision(descricaoVisual, campo) {
  if (typeof descricaoVisual !== 'string' || !descricaoVisual.trim()) return ''
  const match = descricaoVisual.match(new RegExp(`\\*\\*${campo}:\\*\\*\\s*(.+)`, 'i'))
  return typeof match?.[1] === 'string' ? match[1].trim() : ''
}

function valorVisionUtil(valor) {
  const n = normalizarTexto(valor)
  return Boolean(n) && !['nao identificado', 'nao se aplica', 'indefinido'].includes(n)
}

function extrairCenarioDaVision(descricaoVisual) {
  const bruto = extrairCampoVision(descricaoVisual, 'Cenário') || extrairCampoVision(descricaoVisual, 'Cenario')
  const n = normalizarTexto(bruto)
  if (n.includes('multiplos')) return 'MULTIPLOS'
  if (n.includes('indefinido')) return 'INDEFINIDO'
  if (n.includes('unico')) return 'UNICO'
  return null // compatibilidade com respostas antigas/fixtures sem o campo novo
}

function extrairNomeVision(descricaoVisual) {
  if (typeof descricaoVisual !== 'string' || !descricaoVisual.trim()) return ''
  const match = descricaoVisual.match(/^##\s*(.+)$/m)
  return typeof match?.[1] === 'string' ? match[1].trim() : ''
}

function extrairQueryCompactaDaVision(descricaoVisual) {
  const nome = extrairNomeVision(descricaoVisual)
  const tipo = extrairCampoVision(descricaoVisual, 'Tipo')
  const marca = extrairCampoVision(descricaoVisual, 'Marca')
  return [nome, tipo, marca]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean)
    .join(' ')
}

function extrairContextoUnicoDaVision(descricaoVisual) {
  const nomeBruto = extrairNomeVision(descricaoVisual)
  const tipoBruto = extrairCampoVision(descricaoVisual, 'Tipo')
  const marcaBruta = extrairCampoVision(descricaoVisual, 'Marca')
  const corBruta = extrairCampoVision(descricaoVisual, 'Cor')
  return {
    nome: valorVisionUtil(nomeBruto) ? nomeBruto.slice(0, 140) : '',
    tipo: valorVisionUtil(tipoBruto) ? tipoBruto.slice(0, 100) : '',
    marca: valorVisionUtil(marcaBruta) ? marcaBruta.slice(0, 100) : '',
    cor: valorVisionUtil(corBruta) ? corBruta.slice(0, 100) : '',
  }
}

function codificarCacheUnico(contexto) {
  return `${SINGLE_CACHE_PREFIX}${JSON.stringify({
    nome: String(contexto?.nome || '').slice(0, 140),
    tipo: String(contexto?.tipo || '').slice(0, 100),
    marca: String(contexto?.marca || '').slice(0, 100),
    cor: String(contexto?.cor || '').slice(0, 100),
  })}`
}

function decodificarCacheUnico(query) {
  if (typeof query !== 'string' || !query.startsWith(SINGLE_CACHE_PREFIX)) return null
  try {
    const parsed = JSON.parse(query.slice(SINGLE_CACHE_PREFIX.length))
    const contexto = {
      nome: typeof parsed?.nome === 'string' ? parsed.nome.trim().slice(0, 140) : '',
      tipo: typeof parsed?.tipo === 'string' ? parsed.tipo.trim().slice(0, 100) : '',
      marca: typeof parsed?.marca === 'string' ? parsed.marca.trim().slice(0, 100) : '',
      cor: typeof parsed?.cor === 'string' ? parsed.cor.trim().slice(0, 100) : '',
    }
    return (contexto.nome || contexto.tipo || contexto.marca || contexto.cor) ? contexto : null
  } catch {
    return null
  }
}

function queryDoContextoUnico(contexto, pergunta = '') {
  const partes = []
  const nome = String(contexto?.nome || '').trim()
  const marca = String(contexto?.marca || '').trim()
  const cor = String(contexto?.cor || '').trim()
  if (nome) partes.push(nome)
  if (marca && !normalizarTexto(nome).includes(normalizarTexto(marca))) partes.push(marca)
  if (cor && !normalizarTexto(partes.join(' ')).includes(normalizarTexto(cor))) partes.push(cor)
  if (perguntaTemDiscriminador(pergunta)) partes.push(String(pergunta || '').trim())
  return partes.filter(Boolean).join(' ').slice(0, 300)
}

function extrairContextoMultiploDaVision(descricaoVisual) {
  const tipoBruto = extrairCampoVision(descricaoVisual, 'Tipo')
  const marcaBruta = extrairCampoVision(descricaoVisual, 'Marca')
  return {
    tipo: valorVisionUtil(tipoBruto) ? tipoBruto.slice(0, 100) : '',
    marca: valorVisionUtil(marcaBruta) ? marcaBruta.slice(0, 100) : '',
  }
}

function codificarCacheMultiplo(contexto) {
  return `${MULTI_CACHE_PREFIX}${JSON.stringify({
    tipo: String(contexto?.tipo || '').slice(0, 100),
    marca: String(contexto?.marca || '').slice(0, 100),
  })}`
}

function decodificarCacheMultiplo(query) {
  if (typeof query !== 'string' || !query.startsWith(MULTI_CACHE_PREFIX)) return null
  try {
    const parsed = JSON.parse(query.slice(MULTI_CACHE_PREFIX.length))
    const tipo = typeof parsed?.tipo === 'string' ? parsed.tipo.trim().slice(0, 100) : ''
    const marca = typeof parsed?.marca === 'string' ? parsed.marca.trim().slice(0, 100) : ''
    return (tipo || marca) ? { tipo, marca } : null
  } catch {
    return null
  }
}

function perguntaTemDiscriminador(pergunta) {
  return normalizarTexto(pergunta)
    .split(/\s+/)
    .filter(Boolean)
    .some((token) => token.length >= 3 && !TOKENS_PERGUNTA_GENERICOS.has(token))
}

function queryDoContextoMultiplo(contexto, pergunta = '') {
  return [contexto?.tipo, contexto?.marca, pergunta]
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 300)
}

export function __resetStoryLabCacheForTests() {}

function supabaseBaseUrl() {
  return String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '')
}

async function chamarStoryCache(action, storyId, queryCompact = null) {
  const supabaseUrl = supabaseBaseUrl()
  if (!supabaseUrl || !storyId) return { status: 'unavailable', query: null }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CACHE_TIMEOUT_MS)
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/gaby-lab-story-cache-v1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-prime-lab': LAB_HEADER,
      },
      body: JSON.stringify({
        action,
        story_id: String(storyId),
        ...(queryCompact ? { query_compact: queryCompact } : {}),
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    const body = await response.json().catch(() => null)
    if (!response.ok || !body?.sucesso) return { status: 'unavailable', query: null }

    if (action === 'cache_get') {
      if (body.cache_status === 'hit' && typeof body.query_compact === 'string' && body.query_compact.trim()) {
        return { status: 'hit', query: body.query_compact.trim().slice(0, 300) }
      }
      return { status: 'miss', query: null }
    }

    return { status: body.cache_status === 'stored' ? 'stored' : 'unavailable', query: null }
  } catch {
    clearTimeout(timeout)
    return { status: 'unavailable', query: null }
  }
}

async function buscarShadow(pergunta) {
  const supabaseUrl = supabaseBaseUrl()
  if (!supabaseUrl) return { ok: false, status: 500, error: 'SUPABASE_URL_MISSING' }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SHADOW_TIMEOUT_MS)
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/gaby-lab-shadow-catalog-v1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-prime-lab': LAB_HEADER,
      },
      body: JSON.stringify({ pergunta }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    const body = await response.json().catch(() => null)
    if (!response.ok || !body?.sucesso) {
      return { ok: false, status: response.status || 502, error: body?.error || 'SHADOW_UNAVAILABLE' }
    }
    return { ok: true, status: 200, body }
  } catch (err) {
    clearTimeout(timeout)
    return {
      ok: false,
      status: 502,
      error: err?.name === 'AbortError' ? 'SHADOW_TIMEOUT' : 'SHADOW_UNAVAILABLE',
    }
  }
}

function produtosConfiaveis(catalogBody) {
  const produtos = Array.isArray(catalogBody?.dados?.produtos) ? catalogBody.dados.produtos : []
  return produtos.filter((p) => Number(p?.relevancia ?? 0) >= STORY_MATCH_CONFIDENCE_THRESHOLD)
}

function categoriaCanonica(valor) {
  const n = normalizarTexto(valor)
  if (!n) return ''
  if (/\b(bermuda|bermudas|short|shorts)\b/.test(n)) return 'bermuda'
  if (/\b(calca|calcas)\b/.test(n)) return 'calca'
  if (/\b(camiseta|camisetas|camisa|camisas)\b/.test(n)) return 'camiseta'
  if (/\b(tenis|sneaker|sneakers)\b/.test(n)) return 'tenis'
  if (/\b(oculos)\b/.test(n)) return 'oculos'
  return n
}

function produtoCombinaContextoMultiplo(produto, contexto) {
  const tipoEsperado = categoriaCanonica(contexto?.tipo)
  const marcaEsperada = normalizarTexto(contexto?.marca)

  const categoriaProduto = categoriaCanonica(produto?.categoria)
  const nomeProduto = normalizarTexto(produto?.nome)
  const marcaProduto = normalizarTexto(produto?.marca)

  const categoriaOk = !tipoEsperado || categoriaProduto === tipoEsperado || categoriaCanonica(nomeProduto) === tipoEsperado
  const marcaOk = !marcaEsperada || marcaProduto.includes(marcaEsperada) || marcaEsperada.includes(marcaProduto)
  return categoriaOk && marcaOk
}

const CATEGORIAS_CONHECIDAS = new Set(['bermuda', 'calca', 'camiseta', 'tenis', 'oculos'])

function categoriaEsperadaUnico(contexto) {
  const peloNome = categoriaCanonica(contexto?.nome)
  if (CATEGORIAS_CONHECIDAS.has(peloNome)) return peloNome
  const peloTipo = categoriaCanonica(contexto?.tipo)
  return CATEGORIAS_CONHECIDAS.has(peloTipo) ? peloTipo : ''
}

function corCanonica(valor) {
  const n = normalizarTexto(valor)
  const regras = [
    ['branco', /\b(branco|branca|brancos|brancas)\b/],
    ['preto', /\b(preto|preta|pretos|pretas)\b/],
    ['azul', /\bazul\b/], ['verde', /\bverde\b/], ['bege', /\bbege\b/],
    ['marrom', /\b(marrom|marron)\b/], ['cinza', /\bcinza\b/], ['vermelho', /\b(vermelho|vermelha)\b/],
    ['rosa', /\brosa\b/], ['amarelo', /\b(amarelo|amarela)\b/], ['laranja', /\blaranja\b/], ['roxo', /\b(roxo|roxa)\b/],
  ]
  for (const [cor, re] of regras) if (re.test(n)) return cor
  return ''
}

function produtoCombinaContextoUnico(produto, contexto) {
  const categoriaEsperada = categoriaEsperadaUnico(contexto)
  const marcaEsperada = normalizarTexto(contexto?.marca)
  const categoriaProduto = categoriaCanonica(produto?.categoria)
  const nomeProduto = normalizarTexto(produto?.nome)
  const marcaProduto = normalizarTexto(produto?.marca)
  const categoriaOk = !categoriaEsperada || categoriaProduto === categoriaEsperada || categoriaCanonica(nomeProduto) === categoriaEsperada
  const marcaOk = !marcaEsperada || marcaProduto.includes(marcaEsperada) || marcaEsperada.includes(marcaProduto)
  return categoriaOk && marcaOk
}

function selecionarProdutoUnico(produtos, contexto) {
  let candidatos = produtos.filter((produto) => produtoCombinaContextoUnico(produto, contexto))
  candidatos = [...candidatos].sort((a, b) => Number(b?.relevancia ?? 0) - Number(a?.relevancia ?? 0))

  const nomeVision = normalizarTexto(contexto?.nome)
  const exato = nomeVision ? candidatos.find((produto) => normalizarTexto(produto?.nome) === nomeVision) : null

  if (!exato) {
    const corEsperada = corCanonica(contexto?.cor)
    if (corEsperada) {
      const pelaCor = candidatos.filter((produto) => corCanonica(produto?.nome) === corEsperada)
      if (pelaCor.length > 0) candidatos = pelaCor
    }
  }

  candidatos = [...candidatos].sort((a, b) => Number(b?.relevancia ?? 0) - Number(a?.relevancia ?? 0))
  const top = exato || candidatos[0] || null
  const ordenados = top ? [top, ...candidatos.filter((produto) => produto !== top)] : candidatos
  const segundo = ordenados[1] || null
  const topScore = Number(top?.relevancia ?? 0)
  const secondScore = Number(segundo?.relevancia ?? 0)

  if (!top) {
    return { status: 'no_match', confidence: 'LOW', produto: null, candidatos: [], shortlist: [], topScore, secondScore }
  }

  const gap = topScore - secondScore
  const ratio = secondScore > 0 ? topScore / secondScore : Number.POSITIVE_INFINITY
  const highConfidence = topScore >= 100 && (!segundo || gap >= 40 || ratio >= 1.5)

  if (highConfidence) {
    return {
      status: 'clear',
      confidence: 'HIGH',
      produto: top,
      candidatos: ordenados,
      shortlist: [top],
      topScore,
      secondScore,
    }
  }

  if (topScore >= 50) {
    const pisoPlausivel = Math.max(25, topScore * 0.65)
    const shortlist = ordenados.filter((produto) => Number(produto?.relevancia ?? 0) >= pisoPlausivel).slice(0, 3)
    return {
      status: 'ambiguous',
      confidence: 'MEDIUM',
      produto: null,
      candidatos: ordenados,
      shortlist: shortlist.length ? shortlist : [top],
      topScore,
      secondScore,
    }
  }

  return {
    status: 'ambiguous',
    confidence: 'LOW',
    produto: null,
    candidatos: ordenados,
    shortlist: [],
    topScore,
    secondScore,
  }
}

function respostaClarificacao(pergunta, trace, { motivo, categoria = null, marca = null, cor = null } = {}) {
  const ehMultiplo = motivo === 'multiple_products' || motivo === 'clarification_not_resolved'
  const ehUnicoBaixaConfianca = motivo === 'single_product_low_confidence'
  const ehUnicoAmbiguo = motivo === 'single_product_ambiguous' || ehUnicoBaixaConfianca || motivo === 'single_product_not_found'
  const categoriaTexto = categoria ? ` de ${categoria}` : ''
  const detalheUnico = [categoria, marca, cor].filter(Boolean).join(' ')
  const perguntaSugerida = ehMultiplo
    ? `Vi que o Story mostra vários itens${categoriaTexto}. Qual cor ou modelo você quer consultar?`
    : ehUnicoBaixaConfianca
      ? `Parece ser ${detalheUnico || 'o produto do Story'}, mas não consegui confirmar o modelo com segurança. Você consegue confirmar o modelo ou algum detalhe?`
      : ehUnicoAmbiguo
        ? `Identifiquei ${detalheUnico || 'o produto do Story'}, mas encontrei mais de um modelo parecido. Você consegue confirmar o modelo ou algum detalhe?`
        : 'Não consegui identificar com segurança qual produto do Story você quer consultar. Qual produto é?'

  return {
    sucesso: true,
    contexto: {
      pergunta,
      produtos_encontrados: 0,
      tem_produtos: false,
      total_variacoes: 0,
      variacoes_restantes: 0,
      source: 'shadow_v2_story_lab',
      story_lab: trace,
      clarificacao: {
        necessaria: true,
        motivo: motivo || 'visual_undefined',
        categoria,
        marca,
        cor,
        pergunta_sugerida: perguntaSugerida,
      },
    },
    dados: {
      produtos: [],
      informacao_adicional: ehMultiplo
        ? 'Story com múltiplos produtos: necessário desambiguar antes de consultar preço/estoque.'
        : ehUnicoAmbiguo
          ? 'Story com produto único, mas catálogo ainda ambíguo: necessário confirmar modelo antes de preço/estoque.'
          : 'Story sem identificação visual segura: necessário pedir o produto ao cliente.',
      totalVariacoes: 0,
      variacoesRestantes: 0,
    },
  }
}

function respostaComPerguntaOriginal(catalogBody, pergunta, trace, produtosOverride = null) {
  const produtos = produtosOverride ?? (Array.isArray(catalogBody?.dados?.produtos) ? catalogBody.dados.produtos : [])
  const dados = { ...catalogBody.dados, produtos }

  if (produtosOverride) {
    dados.totalVariacoes = produtos.length
    dados.variacoesRestantes = 0
    dados.informacao_adicional = `Fonte: Shadow V2 / Story LAB. ${produtos.length} produto(s) com match visual confiável.`
  }

  return {
    ...catalogBody,
    contexto: {
      ...catalogBody.contexto,
      pergunta,
      produtos_encontrados: produtos.length,
      tem_produtos: produtos.length > 0,
      total_variacoes: produtosOverride ? produtos.length : catalogBody?.contexto?.total_variacoes ?? produtos.length,
      variacoes_restantes: produtosOverride ? 0 : catalogBody?.contexto?.variacoes_restantes ?? 0,
      source: 'shadow_v2_story_lab',
      story_lab: trace,
    },
    dados,
  }
}

export async function runGabyLabStoryShadow(req, res) {
  if (!isGabyLabStoryShadowRequest(req)) {
    return res.status(403).json({ sucesso: false, error: 'FORBIDDEN_LAB_ONLY' })
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ sucesso: false, error: 'METHOD_NOT_ALLOWED' })
  }

  const pergunta = String(req.body?.pergunta ?? req.body?.prompt ?? '').trim().slice(0, 300)
  const chatId = typeof req.body?.chat_id === 'string' ? req.body.chat_id.trim() : ''
  if (pergunta.length < 2) {
    return res.status(400).json( { sucesso: false, error: 'PERGUNTA_REQUIRED' })
  }

  const correlationId = crypto.randomUUID()
  const trace = {
    correlation_id: correlationId,
    story_context_status: chatId ? null : 'NO_CHAT_ID',
    vision_status: 'not_attempted',
    search_context_used: 'pergunta_direta',
    fallback_used: false,
    cache_status: 'not_attempted',
    cache_write_status: 'not_attempted',
    cache_backend: 'supabase_persistent',
    story_match_threshold: null,
    visual_scene: null,
    clarification_needed: false,
    clarification_reason: null,
    detected_category: null,
    detected_brand: null,
    detected_color: null,
    single_match_status: null,
    single_match_confidence: null,
    presentation_mode: null,
    confirmation_recommended: false,
    single_top_score: null,
    single_second_score: null,
  }

  let buscaTexto = pergunta
  let queryNovaParaCache = null
  let storyId = null
  let contextoMultiplo = null
  let contextoUnico = null

  if (chatId) {
    try {
      const contextoStory = await getStoryContext(chatId)
      trace.story_context_status = contextoStory?.status || 'UNKNOWN'

      if (contextoStory?.status === 'FOUND' && contextoStory.storyMediaUrl) {
        storyId = contextoStory.storyId || null
        const cached = await chamarStoryCache('cache_get', storyId)

        if (cached.status === 'hit' && cached.query) {
          const multiCached = decodificarCacheMultiplo(cached.query)
          if (multiCached) {
            contextoMultiplo = multiCached
            trace.cache_status = 'hit'
            trace.vision_status = 'cache_hit'
            trace.visual_scene = 'MULTIPLOS'
            trace.detected_category = multiCached.tipo || null
            trace.detected_brand = multiCached.marca || null
            trace.story_match_threshold = STORY_MATCH_CONFIDENCE_THRESHOLD

            if (!perguntaTemDiscriminador(pergunta)) {
              trace.clarification_needed = true
              trace.clarification_reason = 'multiple_products'
              trace.search_context_used = 'story_clarification'
              return res.status(200).json(respostaClarificacao(pergunta, trace, {
                motivo: 'multiple_products',
                categoria: multiCached.tipo || null,
                marca: multiCached.marca || null,
              }))
            }

            buscaTexto = queryDoContextoMultiplo(multiCached, pergunta)
            trace.search_context_used = 'story_clarified'
          } else {
            const unicoCached = decodificarCacheUnico(cached.query)
            if (unicoCached) {
              contextoUnico = unicoCached
              buscaTexto = queryDoContextoUnico(unicoCached, pergunta)
              trace.cache_status = 'hit'
              trace.vision_status = 'cache_hit'
              trace.visual_scene = 'UNICO'
              trace.detected_category = unicoCached.tipo || null
              trace.detected_brand = unicoCached.marca || null
              trace.detected_color = unicoCached.cor || null
              trace.search_context_used = 'story_single'
              trace.story_match_threshold = STORY_MATCH_CONFIDENCE_THRESHOLD
            } else {
              buscaTexto = cached.query
              trace.cache_status = 'hit'
              trace.vision_status = 'cache_hit'
              trace.search_context_used = 'story'
              trace.story_match_threshold = STORY_MATCH_CONFIDENCE_THRESHOLD
            }
          }
        } else {
          trace.cache_status = cached.status === 'miss' ? 'miss' : 'unavailable'
          const descricaoVisual = await identificarProdutoPorImagem(contextoStory.storyMediaUrl, {
            correlationId,
            storyId,
          })

          if (descricaoVisual) {
            const cenario = extrairCenarioDaVision(descricaoVisual)
            trace.visual_scene = cenario
            trace.vision_status = 'success'
            trace.story_context_status = 'STORY_FOUND_VISION_OK'

            if (cenario === 'MULTIPLOS') {
              contextoMultiplo = extrairContextoMultiploDaVision(descricaoVisual)
              trace.detected_category = contextoMultiplo.tipo || null
              trace.detected_brand = contextoMultiplo.marca || null
              trace.clarification_needed = true
              trace.clarification_reason = 'multiple_products'
              trace.search_context_used = 'story_clarification'

              if ((contextoMultiplo.tipo || contextoMultiplo.marca) && storyId) {
                const stored = await chamarStoryCache('cache_put', storyId, codificarCacheMultiplo(contextoMultiplo))
                trace.cache_write_status = stored.status
              }

              return res.status(200).json(respostaClarificacao(pergunta, trace, {
                motivo: 'multiple_products',
                categoria: contextoMultiplo.tipo || null,
                marca: contextoMultiplo.marca || null,
              }))
            }

            if (cenario === 'INDEFINIDO') {
              trace.clarification_needed = true
              trace.clarification_reason = 'visual_undefined'
              trace.search_context_used = 'story_clarification'
              return res.status(200).json(respostaClarificacao(pergunta, trace, { motivo: 'visual_undefined' }))
            }

            if (cenario === 'UNICO') {
              contextoUnico = extrairContextoUnicoDaVision(descricaoVisual)
              trace.detected_category = contextoUnico.tipo || null
              trace.detected_brand = contextoUnico.marca || null
              trace.detected_color = contextoUnico.cor || null
              const queryUnica = queryDoContextoUnico(contextoUnico, pergunta)
              if (queryUnica) {
                buscaTexto = queryUnica
                queryNovaParaCache = codificarCacheUnico(contextoUnico)
                trace.search_context_used = 'story_single'
                trace.story_match_threshold = STORY_MATCH_CONFIDENCE_THRESHOLD
              } else {
                trace.vision_status = 'success_empty_query'
                trace.story_context_status = 'STORY_FOUND_VISION_OK_EMPTY_QUERY'
              }
            } else {
              const queryCompacta = extrairQueryCompactaDaVision(descricaoVisual)
              if (queryCompacta) {
                buscaTexto = queryCompacta
                queryNovaParaCache = queryCompacta
                trace.search_context_used = 'story'
                trace.story_match_threshold = STORY_MATCH_CONFIDENCE_THRESHOLD
              } else {
                trace.vision_status = 'success_empty_query'
                trace.story_context_status = 'STORY_FOUND_VISION_OK_EMPTY_QUERY'
              }
            }
          } else {
            trace.vision_status = 'failed'
            trace.story_context_status = 'STORY_FOUND_VISION_FAILED'
          }
        }
      }
    } catch {
      trace.story_context_status = 'GPTMAKER_FETCH_ERROR'
    }
  }

  let shadow = await buscarShadow(buscaTexto)
  if (!shadow.ok) {
    return res.status(shadow.status).json( { sucesso: false, error: shadow.error })
  }

  if (trace.search_context_used === 'story' || trace.search_context_used === 'story_clarified' || trace.search_context_used === 'story_single') {
    let confiaveis = produtosConfiaveis(shadow.body)
    if (trace.search_context_used === 'story_clarified' && contextoMultiplo) {
      confiaveis = confiaveis.filter((produto) => produtoCombinaContextoMultiplo(produto, contextoMultiplo))
    }
    if (trace.search_context_used === 'story_single' && contextoUnico) {
      const selecao = selecionarProdutoUnico(confiaveis, contextoUnico)
      trace.single_match_status = selecao.status
      trace.single_match_confidence = selecao.confidence
      trace.single_top_score = selecao.topScore
      trace.single_second_score = selecao.secondScore

      if (queryNovaParaCache && storyId) {
        const stored = await chamarStoryCache('cache_put', storyId, queryNovaParaCache)
        trace.cache_write_status = stored.status
      }

      if (selecao.confidence === 'HIGH' && selecao.produto) {
        trace.presentation_mode = 'primary'
        const resposta = respostaComPerguntaOriginal(shadow.body, pergunta, trace, [selecao.produto])
        resposta.contexto.apresentacao = {
          modo: 'primary',
          confianca: 'HIGH',
          linguagem: 'probabilistica',
          frase_sugerida: 'Pela foto, o mais provável é este modelo:',
        }
        resposta.dados.informacao_adicional = 'Confiança HIGH: apresente este como o produto mais provável da foto, sem afirmar certeza visual absoluta. Ex.: "Pela foto, o mais provável é...".'
        return res.status(200).json(resposta)
      }

      if (selecao.confidence === 'MEDIUM' && selecao.shortlist?.length) {
        trace.presentation_mode = 'shortlist'
        trace.confirmation_recommended = true
        const resposta = respostaComPerguntaOriginal(shadow.body, pergunta, trace, selecao.shortlist)
        resposta.contexto.apresentacao = {
          modo: 'shortlist',
          confianca: 'MEDIUM',
          max_opcoes: 3,
          linguagem: 'comparativa',
        }
        resposta.contexto.confirmacao = {
          recomendada: true,
          motivo: 'medium_confidence',
          pergunta_sugerida: 'Encontrei estes modelos como os mais parecidos com a foto. É algum desses?',
        }
        resposta.dados.informacao_adicional = 'Confiança MEDIUM: mostre somente estas opções mais parecidas (máximo 3) e peça confirmação. Não afirme que uma delas é o produto exato antes da confirmação.'
        return res.status(200).json(resposta)
      }

      trace.presentation_mode = 'clarify'
      trace.clarification_needed = true
      trace.clarification_reason = selecao.status === 'no_match' ? 'single_product_not_found' : 'single_product_low_confidence'
      trace.search_context_used = 'story_clarification'
      return res.status(200).json(respostaClarificacao(pergunta, trace, {
        motivo: trace.clarification_reason,
        categoria: contextoUnico.tipo || null,
        marca: contextoUnico.marca || null,
        cor: contextoUnico.cor || null,
      }))
    }
    if (confiaveis.length === 0) {
      if (trace.search_context_used === 'story_clarified' && contextoMultiplo) {
        trace.clarification_needed = true
        trace.clarification_reason = 'clarification_not_resolved'
        trace.search_context_used = 'story_clarification'
        return res.status(200).json(respostaClarificacao(pergunta, trace, {
          motivo: 'clarification_not_resolved',
          categoria: contextoMultiplo.tipo || null,
          marca: contextoMultiplo.marca || null,
        }))
      }

      trace.search_context_used = 'story_fallback_pergunta'
      trace.fallback_used = true
      queryNovaParaCache = null
      shadow = await buscarShadow(pergunta)
      if (!shadow.ok) {
        return res.status(shadow.status).json( { sucesso: false, error: shadow.error })
      }
    } else {
      if (queryNovaParaCache && storyId) {
        const stored = await chamarStoryCache('cache_put', storyId, queryNovaParaCache)
        trace.cache_write_status = stored.status
      }
      return res.status(200).json(respostaComPerguntaOriginal(shadow.body, pergunta, trace, confiaveis))
    }
  }

  return res.status(200).json(respostaComPerguntaOriginal(shadow.body, pergunta, trace))
}
