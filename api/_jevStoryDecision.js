/**
 * JEV Story Decision Guard v1
 *
 * Escopo fechado: decisões de produto/contexto derivadas de Instagram Story.
 * Não gera texto para o cliente e não executa ações. Apenas retorna decisão
 * estruturada para o webhook aplicar uma política determinística.
 *
 * Modos:
 *   off    -> não chama JEV; comportamento legado intacto.
 *   shadow -> chama JEV e registra decisão, sem alterar o payload da Gaby.
 *   guard  -> aplica fail-closed: só libera produto quando a decisão é forte;
 *             dúvida/erro/indisponibilidade remove afirmações de produto.
 */

const JEV_ENDPOINT = 'https://openrouter.ai/api/alpha/decisions'
const JEV_MODEL = process.env.JEV_MODEL || 'typesafe/jev-1.13'
const JEV_TIMEOUT_MS = 2500
const DEFAULT_MIN_CONFIDENCE = 0.95
const VALID_MODES = new Set(['off', 'shadow', 'guard'])

export function getJevStoryMode() {
  // Story Guard homologado: Preview e Production usam GUARD.
  // Ambientes locais continuam OFF por padrão. A env JEV_STORY_MODE permite
  // rollback imediato para shadow/off sem alterar a política do restante.
  const env = String(process.env.VERCEL_ENV || '').toLowerCase()
  const defaultMode = (env === 'preview' || env === 'production') ? 'guard' : 'off'
  const mode = String(process.env.JEV_STORY_MODE || defaultMode).trim().toLowerCase()
  return VALID_MODES.has(mode) ? mode : defaultMode
}

export function isExplicitStoryReference(text) {
  const value = String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  // Somente referências explícitas: evita transformar qualquer pergunta curta
  // ("qual valor?", "tem 42?") em Story quando não há metadata suficiente.
  return /\b(story|stories|foto do story|foto que respondi|foto que eu respondi|da foto|nessa foto|nesta foto|esse story|essa story)\b/.test(value)
}

function minConfidence() {
  const raw = Number(process.env.JEV_STORY_MIN_CONFIDENCE)
  if (!Number.isFinite(raw) || raw < 0.5 || raw > 1) return DEFAULT_MIN_CONFIDENCE
  return raw
}

function sanitizeCandidate(product, index) {
  return {
    id: `C${index + 1}`,
    nome: String(product?.nome || '').slice(0, 180),
    categoria: String(product?.categoria || '').slice(0, 100),
    marca: String(product?.marca || '').slice(0, 100),
    score_catalogo: Number.isFinite(Number(product?.score)) ? Number(product.score) : null,
  }
}

function failClosed(reason, extra = {}) {
  return {
    status: 'unavailable',
    action: 'BLOCK_ASSERTION',
    selectedCandidateId: null,
    confidence: null,
    selectedProbability: null,
    reason,
    intent: 'UNKNOWN',
    intentConfidence: null,
    ...extra,
  }
}

export async function decideStoryWithJev({
  question,
  visionQuery,
  visionEvidence = null,
  candidates,
  storyContextStatus,
  visionStatus,
}) {
  const mode = getJevStoryMode()
  if (mode === 'off') {
    return {
      status: 'disabled',
      action: 'BYPASS',
      selectedCandidateId: null,
      confidence: null,
      selectedProbability: null,
      reason: 'JEV_STORY_MODE_OFF',
    }
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return failClosed('OPENROUTER_NOT_CONFIGURED')

  const safeCandidates = (Array.isArray(candidates) ? candidates : [])
    .slice(0, 5)
    .map(sanitizeCandidate)

  if (safeCandidates.length === 0) return failClosed('NO_CANDIDATES')

  const criteria = Object.fromEntries([
    ...safeCandidates.map((candidate) => [
      candidate.id,
      [
        `Produto: ${candidate.nome || 'sem nome'}`,
        candidate.categoria ? `Categoria: ${candidate.categoria}` : '',
        candidate.marca ? `Marca: ${candidate.marca}` : '',
        candidate.score_catalogo != null ? `Score determinístico do catálogo: ${candidate.score_catalogo}` : '',
      ].filter(Boolean).join(' | '),
    ]),
    ['NONE', 'Nenhum candidato pode ser associado com segurança ao produto referenciado no Story.'],
  ])

  // Nenhum PII entra no state: só pergunta comercial, saída da Vision e
  // candidatos de catálogo.
  const state = {
    scope: 'instagram_story_product_resolution',
    customer_question: String(question || '').slice(0, 300),
    story_context_status: String(storyContextStatus || 'UNKNOWN').slice(0, 80),
    vision_status: String(visionStatus || 'UNKNOWN').slice(0, 80),
    vision_query: String(visionQuery || '').slice(0, 400),
    vision_evidence: visionEvidence && typeof visionEvidence === 'object' ? {
      nome: String(visionEvidence.nome || '').slice(0, 160),
      tipo: String(visionEvidence.tipo || '').slice(0, 120),
      marca: String(visionEvidence.marca || '').slice(0, 120),
      cor: String(visionEvidence.cor || '').slice(0, 120),
    } : null,
    candidates: safeCandidates,
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), JEV_TIMEOUT_MS)

  try {
    const response = await fetch(JEV_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: JEV_MODEL,
        state,
        questions: {
          product: {
            type: 'choice',
            instructions:
              'Escolha qual candidato do catálogo corresponde ao produto referenciado pelo cliente no Story atual. Use apenas as evidências do state. Se houver ambiguidade relevante, conflito ou evidência insuficiente, escolha NONE.',
            criteria,
          },
          intent: {
            type: 'choice',
            instructions:
              'Classifique a intenção principal da pergunta do cliente sobre o produto do Story.',
            criteria: {
              PRICE: 'Pergunta de preço, valor, promoção ou condição de pagamento.',
              SIZE_STOCK: 'Pergunta se tem determinado tamanho, numeração, estoque ou disponibilidade.',
              PHOTO: 'Pedido de foto, imagem ou para ver o produto.',
              COLOR_MODEL: 'Pergunta sobre cor, modelo, versão ou qual produto é.',
              OTHER: 'Outra intenção que não se encaixa nas anteriores.',
            },
          },
          route: {
            type: 'choice',
            instructions:
              'Decida a rota segura para este atendimento de Story. Nunca prefira automação quando o contexto ou o produto estiverem ambíguos.',
            criteria: {
              ALLOW_AUTO:
                'Há evidência consistente para usar um único produto candidato e continuar a resposta automática.',
              ASK_CLARIFY:
                'Há mais de uma interpretação plausível; deve perguntar ao cliente qual produto, cor ou modelo antes de afirmar.',
              BLOCK_ASSERTION:
                'Falta contexto crítico ou existe conflito; não deve afirmar produto, preço, tamanho ou disponibilidade.',
            },
          },
        },
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!response.ok) return failClosed(`JEV_HTTP_${response.status}`)

    const body = await response.json().catch(() => null)
    const product = body?.answers?.product
    const intent = body?.answers?.intent
    const route = body?.answers?.route

    if (product?.type !== 'choice' || intent?.type !== 'choice' || route?.type !== 'choice') {
      return failClosed('JEV_INVALID_RESPONSE')
    }

    const selectedCandidateId = typeof product.choice === 'string' ? product.choice : null
    const selectedProbability = selectedCandidateId
      ? Number(product.probabilities?.[selectedCandidateId] ?? 0)
      : 0
    const confidence = Number(product.confidence ?? 0)
    const intentChoice = typeof intent.choice === 'string' ? intent.choice : 'OTHER'
    const intentConfidence = Number(intent.confidence ?? 0)
    const threshold = minConfidence()

    let action = route.choice
    let reason = 'JEV_ROUTE'

    // A política final pertence ao código, não ao modelo.
    if (
      action === 'ALLOW_AUTO' &&
      selectedCandidateId !== 'NONE' &&
      selectedCandidateId &&
      confidence >= threshold &&
      selectedProbability >= threshold
    ) {
      action = 'ALLOW_AUTO'
      reason = 'JEV_STRONG_SINGLE_MATCH'
    } else if (action === 'BLOCK_ASSERTION') {
      action = 'BLOCK_ASSERTION'
      reason = 'JEV_BLOCK_ASSERTION'
    } else {
      action = 'ASK_CLARIFY'
      reason = 'JEV_AMBIGUOUS_OR_LOW_CONFIDENCE'
    }

    return {
      status: 'ok',
      action,
      selectedCandidateId: action === 'ALLOW_AUTO' ? selectedCandidateId : null,
      confidence: Number.isFinite(confidence) ? confidence : null,
      selectedProbability: Number.isFinite(selectedProbability) ? selectedProbability : null,
      reason,
      intent: intentChoice,
      intentConfidence: Number.isFinite(intentConfidence) ? intentConfidence : null,
      model: typeof body?.model === 'string' ? body.model.slice(0, 100) : JEV_MODEL,
      costUsd: typeof body?.usage?.cost === 'number' ? body.usage.cost : null,
    }
  } catch (error) {
    clearTimeout(timeout)
    return failClosed(error?.name === 'AbortError' ? 'JEV_TIMEOUT' : 'JEV_UNAVAILABLE')
  }
}
