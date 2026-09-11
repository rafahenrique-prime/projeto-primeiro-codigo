import crypto from 'node:crypto'
import { getStoryContext } from '../api/_storyContext.js'
import { identificarProdutoPorImagem } from '../api/_visaoProduto.js'

const LAB_HEADER = 'GABY-LAB-COMERCIAL-V1'
const LAB_MODE = 'story-shadow-v1'
const STORY_MATCH_CONFIDENCE_THRESHOLD = 25
const SHADOW_TIMEOUT_MS = 15000
const CACHE_TIMEOUT_MS = 5000
const MULTI_CACHE_PREFIX = 'MULTI::'
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

function extrairQueryCompactaDaVision(descricaoVisual) {
  if (typeof descricaoVisual !== 'string' || !descricaoVisual.trim()) return ''
  const nomeMatch = descricaoVisual.match(/^##\s*(.+)$/m)
  const tipo = extrairCampoVision(descricaoVisual, 'Tipo')
  const marca = extrairCampoVision(descricaoVisual, 'Marca')
  return [nomeMatch?.[1], tipo, marca]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean)
    .join(' ')
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

// Compatibilidade com a bateria antiga: o cache agora é persistente no Supabase,
// portanto não existe estado local de instância para limpar.
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

function respostaClarificacao(pergunta, trace, { motivo, categoria = null, marca = null } = {}) {
  const ehMultiplo = motivo === 'multiple_products' || motivo === 'clarification_not_resolved'
  const categoriaTexto = categoria ? ` de ${categoria}` : ''
  const perguntaSugerida = ehMultiplo
    ? `Vi que o Story mostra vários itens${categoriaTexto}. Qual cor ou modelo você quer consultar?`
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
        pergunta_sugerida: perguntaSugerida,
      },
    },
    dados: {
      produtos: [],
      informacao_adicional: ehMultiplo
        ? 'Story com múltiplos produtos: necessário desambiguar antes de consultar preço/estoque.'
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
  }

  let buscaTexto = pergunta
  let queryNovaParaCache = null
  let storyId = null
  let contextoMultiplo = null

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
            buscaTexto = cached.query
            trace.cache_status = 'hit'
            trace.vision_status = 'cache_hit'
            trace.search_context_used = 'story'
            trace.story_match_threshold = STORY_MATCH_CONFIDENCE_THRESHOLD
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

  if (trace.search_context_used === 'story' || trace.search_context_used === 'story_clarified') {
    const confiaveis = produtosConfiaveis(shadow.body)
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
