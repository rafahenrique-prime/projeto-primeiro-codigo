/**
 * Story Visual Match V2
 *
 * Compara a mídia real do Story com as imagens dos produtos candidatos do
 * Mirror/Shadow. Não decide preço/estoque e não fala com o cliente.
 * Retorna apenas um sinal visual estruturado para o JEV/política final.
 */

import { prepararStoryImageDataUrl } from './_visaoProduto.js'

const MODEL = process.env.STORY_VISUAL_MATCH_MODEL || 'google/gemini-2.5-flash-lite'
const TIMEOUT_MS = 9000
const MAX_CANDIDATES = 5
const DEFAULT_MIN_CONFIDENCE = 0.95
const VALID_MODES = new Set(['off', 'shadow', 'guard'])
const ALLOWED_CATALOG_IMAGE_HOSTS = new Set(['cdn.dooca.store'])


export function getStoryVisualMatchMode() {
  // V2 homologada: Preview e Production usam GUARD.
  // Fora da Vercel continua OFF. A env STORY_VISUAL_MATCH_MODE permite
  // rollback imediato para shadow/off sem alterar o restante do fluxo.
  const env = String(process.env.VERCEL_ENV || '').toLowerCase()
  const defaultMode = (env === 'preview' || env === 'production') ? 'guard' : 'off'
  const mode = String(process.env.STORY_VISUAL_MATCH_MODE || defaultMode).trim().toLowerCase()
  return VALID_MODES.has(mode) ? mode : defaultMode
}

export function getStoryVisualMatchMinConfidence() {
  const raw = Number(process.env.STORY_VISUAL_MATCH_MIN_CONFIDENCE)
  if (!Number.isFinite(raw) || raw < 0.5 || raw > 1) return DEFAULT_MIN_CONFIDENCE
  return raw
}

function baseUrlDoDeployment() {
  const host = process.env.VERCEL_URL
  return host ? `https://${host}` : null
}

function isAllowedCatalogImage(urlStr) {
  try {
    const u = new URL(urlStr)
    return u.protocol === 'https:' && ALLOWED_CATALOG_IMAGE_HOSTS.has(u.hostname)
  } catch {
    return false
  }
}

function parseJsonObject(text) {
  if (typeof text !== 'string') return null
  const clean = text.trim()
    .replace(/^\`\`\`(?:json)?\s*/i, '')
    .replace(/\s*\`\`\`$/i, '')
    .trim()
  try {
    return JSON.parse(clean)
  } catch {
    const match = clean.match(/\{[\s\S]*\}/)
    if (!match) return null
    try { return JSON.parse(match[0]) } catch { return null }
  }
}

function fail(reason, extra = {}) {
  return {
    status: 'unavailable',
    choice: 'NONE',
    confidence: null,
    reason,
    ...extra,
  }
}

export async function compararStoryComCandidatos(storyMediaUrl, candidates = [], options = {}) {
  const base = baseUrlDoDeployment()
  if (!base) return fail('NO_DEPLOYMENT_URL')

  const prepared = await prepararStoryImageDataUrl(storyMediaUrl, { smartVideo: options.smartVideo === true })
  if (!prepared?.dataUrl) return fail('STORY_IMAGE_UNAVAILABLE')

  const safeCandidates = (Array.isArray(candidates) ? candidates : [])
    .filter((p) => p?.imagem && isAllowedCatalogImage(p.imagem))
    .slice(0, MAX_CANDIDATES)
    .map((p, index) => ({
      id: `C${index + 1}`,
      nome: String(p.nome || '').slice(0, 180),
      marca: String(p.marca || '').slice(0, 100),
      imagem: p.imagem,
      originalIndex: candidates.indexOf(p),
    }))

  if (safeCandidates.length === 0) return fail('NO_CANDIDATE_IMAGES')

  const storyFrames = Array.isArray(prepared.dataUrls) && prepared.dataUrls.length > 0
    ? prepared.dataUrls.slice(0, 3)
    : [prepared.dataUrl]

  const prompt = [
    'Você é um comparador visual de produtos de moda.',
    storyFrames.length === 1
      ? 'A PRIMEIRA imagem é a referência do Story do cliente.'
      : `As PRIMEIRAS ${storyFrames.length} imagens (F1..${storyFrames.length}) são quadros do MESMO Story em vídeo.`,
    storyFrames.length === 1
      ? 'As imagens seguintes são candidatos do catálogo na ordem C1, C2, C3...'
      : 'Depois dos frames do Story vêm os candidatos do catálogo na ordem C1, C2, C3...',
    'Seu trabalho é decidir se algum candidato mostra o MESMO produto físico/modelo da referência.',
    'Compare formato, proporções, aro, lente, ponte, hastes, detalhes, pedraria, logo, acabamento e desenho.',
    'Ignore pessoa, fundo, pose, iluminação, escala e ângulo da foto.',
    'O mesmo produto pode estar fotografado em outro ângulo ou fora/no rosto.',
    'Nomes e marcas dos candidatos servem só como rótulos; NÃO use texto como prova visual.',
    'Se houver dúvida real entre candidatos ou se nenhuma foto corresponder, escolha NONE.',
    'Retorne SOMENTE JSON puro neste formato:',
    '{"choice":"C1|C2|C3|C4|C5|NONE","confidence":0.00,"reason":"frase curta"}',
    '',
    'Rótulos dos candidatos:',
    ...safeCandidates.map((c) => `${c.id}: ${c.nome}${c.marca ? ` | ${c.marca}` : ''}`),
  ].join('\n')

  const content = [
    { type: 'text', text: prompt },
    ...storyFrames.map((url) => ({
      type: 'image_url',
      image_url: { url },
    })),
    ...safeCandidates.map((c) => ({
      type: 'image_url',
      image_url: { url: c.imagem },
    })),
  ]

  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(`${base}/api/system-tools?tool=ocr-openrouter`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(bypassSecret ? { 'x-vercel-protection-bypass': bypassSecret } : {}),
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content }],
        max_tokens: 220,
        temperature: 0.1,
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) return fail(`VISION_HTTP_${res.status}`)

    const data = await res.json().catch(() => null)
    const raw = data?.choices?.[0]?.message?.content || ''
    const parsed = parseJsonObject(raw)
    if (!parsed) return fail('INVALID_JSON')

    const choice = typeof parsed.choice === 'string' ? parsed.choice.toUpperCase() : 'NONE'
    const confidence = Number(parsed.confidence)
    const validChoice = choice === 'NONE' || safeCandidates.some((c) => c.id === choice)
    if (!validChoice || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      return fail('INVALID_RESPONSE')
    }

    const selected = choice === 'NONE'
      ? null
      : safeCandidates.find((c) => c.id === choice)

    return {
      status: 'ok',
      choice,
      selectedOriginalIndex: selected?.originalIndex ?? null,
      confidence,
      reason: String(parsed.reason || '').slice(0, 180),
      model: typeof data?.model === 'string' ? data.model.slice(0, 120) : MODEL,
      costUsd: typeof data?.usage?.cost === 'number' ? data.usage.cost : null,
      sourceMediaType: prepared.sourceMediaType,
      storyFrameCount: storyFrames.length,
      smartVideoUsed: prepared.smartVideoUsed === true,
    }
  } catch (err) {
    clearTimeout(timeout)
    return fail(err?.name === 'AbortError' ? 'TIMEOUT' : 'UNAVAILABLE')
  }
}
