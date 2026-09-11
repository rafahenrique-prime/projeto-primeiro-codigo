import crypto from 'node:crypto'
import { getStoryContext } from '../api/_storyContext.js'
import { identificarProdutoPorImagem } from '../api/_visaoProduto.js'

const LAB_HEADER = 'GABY-LAB-COMERCIAL-V1'
const LAB_MODE = 'story-shadow-v1'
const STORY_MATCH_CONFIDENCE_THRESHOLD = 25
const SHADOW_TIMEOUT_MS = 15000
const CACHE_TIMEOUT_MS = 5000

function readHeader(req, name) {
  const value = req?.headers?.[name]
  return Array.isArray(value) ? value[0] : value
}

export function isGabyLabStoryShadowRequest(req) {
  return readHeader(req, 'x-prime-lab') === LAB_HEADER &&
    readHeader(req, 'x-prime-lab-mode') === LAB_MODE
}

function extrairQueryCompactaDaVision(descricaoVisual) {
  if (typeof descricaoVisual !== 'string' || !descricaoVisual.trim()) return ''
  const nomeMatch = descricaoVisual.match(/^##\s*(.+)$/m)
  const tipoMatch = descricaoVisual.match(/\*\*Tipo:\*\*\s*(.+)/i)
  const marcaMatch = descricaoVisual.match(/\*\*Marca:\*\*\s*(.+)/i)
  return [nomeMatch?.[1], tipoMatch?.[1], marcaMatch?.[1]]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean)
    .join(' ')
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
  }

  let buscaTexto = pergunta
  let queryNovaParaCache = null
  let storyId = null

  if (chatId) {
    try {
      const contextoStory = await getStoryContext(chatId)
      trace.story_context_status = contextoStory?.status || 'UNKNOWN'

      if (contextoStory?.status === 'FOUND' && contextoStory.storyMediaUrl) {
        storyId = contextoStory.storyId || null
        const cached = await chamarStoryCache('cache_get', storyId)

        if (cached.status === 'hit' && cached.query) {
          buscaTexto = cached.query
          trace.cache_status = 'hit'
          trace.vision_status = 'cache_hit'
          trace.search_context_used = 'story'
          trace.story_match_threshold = STORY_MATCH_CONFIDENCE_THRESHOLD
        } else {
          trace.cache_status = cached.status === 'miss' ? 'miss' : 'unavailable'
          const descricaoVisual = await identificarProdutoPorImagem(contextoStory.storyMediaUrl, {
            correlationId,
            storyId,
          })

          if (descricaoVisual) {
            const queryCompacta = extrairQueryCompactaDaVision(descricaoVisual)
            if (queryCompacta) {
              buscaTexto = queryCompacta
              queryNovaParaCache = queryCompacta
              trace.vision_status = 'success'
              trace.search_context_used = 'story'
              trace.story_context_status = 'STORY_FOUND_VISION_OK'
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

  if (trace.search_context_used === 'story') {
    const confiaveis = produtosConfiaveis(shadow.body)
    if (confiaveis.length === 0) {
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
