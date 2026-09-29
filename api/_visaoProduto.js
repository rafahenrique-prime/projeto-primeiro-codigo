/**
 * api/_visaoProduto.js — identifica visualmente o produto de uma mídia de Story
 * (foto OU vídeo), reaproveitando a camada de visão compartilhada já homologada
 * (api/system-tools.js?tool=ocr-openrouter, google/gemini-2.5-flash-lite).
 *
 * Nenhuma chamada direta a provider de IA aqui — só busca segura da mídia e
 * repassa pra camada já existente, exatamente como o painel administrativo
 * (src/services/foto/ocrService.js) já faz do lado do browser.
 *
 * Story video/mp4 (foto+música do Instagram sempre chega assim, mesmo quando o
 * original era estático — comprovado empiricamente, não distinguível via API):
 * extrai 1 frame representativo em ~1s com ffmpeg-static antes de seguir pro
 * mesmo caminho de visão usado por foto — não é um segundo sistema de visão.
 *
 * Fail-safe: qualquer falha (mídia inválida, hostname não permitido, timeout,
 * tamanho excedido, frame não extraível, provider indisponível) retorna null —
 * nunca lança exceção. Nunca loga storyMediaUrl nem base64.
 */

import ffmpegPath from 'ffmpeg-static'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile, readFile, unlink } from 'node:fs/promises'
import crypto from 'node:crypto'
import { recordVisionUsageEvent } from './_visionTelemetry.js'

const execFileAsync = promisify(execFile)

const MEDIA_FETCH_TIMEOUT_MS = 4000
const VISION_CALL_TIMEOUT_MS = 8000
const MAX_MEDIA_BYTES = 8 * 1024 * 1024 // 8MB — folga generosa pra foto de Story
const MAX_VIDEO_BYTES = 20 * 1024 * 1024 // Stories em vídeo (foto+música do Instagram) chegam maiores
const ALLOWED_IMAGE_MIME_PREFIX = /^image\/(jpeg|png|webp|gif)/
const ALLOWED_VIDEO_MIME_PREFIX = /^video\/mp4/
const ALLOWED_STORY_MEDIA_HOSTS = new Set(['gpt-files.com']) // único domínio real observado em teste
const FFMPEG_TIMEOUT_MS = 15000
const SMART_VIDEO_MAX_FRAMES = 3
const SMART_VIDEO_VALID_MODES = new Set(['off', 'lab', 'guard'])

const VISION_PROXY_MODEL = 'google/gemini-2.5-flash-lite'
const VISION_PROVIDER = 'openrouter'

const PROMPT_IDENTIFICACAO = `Você é um especialista em identificação de produtos para lojas.

Analise esta foto e descreva o produto com detalhes para uma base de conhecimento:

Responda EXATAMENTE neste formato:
## [Nome do produto]
**Tipo:** (categoria do produto)
**Marca:** (se visível, senão "Não identificado")
**Cor:** (cores principais)
**Características:** (detalhes visuais únicos: material, design, tamanho estimado, etc)
**Ocasião/Uso:** (para que situações ou público serve)
**Descrição para venda:** (texto persuasivo de 2-3 linhas para usar no WhatsApp)

Identifique qualquer produto que apareça na imagem — roupa, tênis, perfume, acessório, bolsa, eletrônico, etc.
Se não conseguir identificar algum campo, escreva "Não identificado".`

const PROMPT_IDENTIFICACAO_MULTI_FRAME = `Você é um especialista em identificação de produtos para lojas.

Você receberá até 3 quadros (F1, F2, F3) do MESMO Story em vídeo.
Analise TODOS os quadros em conjunto. Use o quadro mais nítido e informativo para identificar o produto.
Se o Story mostrar vários produtos diferentes sem um único produto dominante, NÃO escolha um item arbitrariamente: descreva a categoria/conjunto e deixe a marca como "Não identificado" quando houver dúvida.

Responda EXATAMENTE neste formato:
## [Nome do produto]
**Tipo:** (categoria do produto)
**Marca:** (se visível e consistente, senão "Não identificado")
**Cor:** (cores principais)
**Características:** (detalhes visuais únicos: material, design, logos, formato, etc)
**Ocasião/Uso:** (para que situações ou público serve)
**Melhor frame:** (F1, F2 ou F3)
**Consistência:** (alta, média ou baixa)
**Descrição para venda:** (texto persuasivo de 2-3 linhas para usar no WhatsApp)

Identifique qualquer produto que apareça nos quadros — roupa, tênis, perfume, acessório, bolsa, eletrônico, etc.
Se não conseguir identificar algum campo, escreva "Não identificado".`

export function getStoryVideoSmartVisionMode() {
  const env = String(process.env.VERCEL_ENV || '').toLowerCase()
  const defaultMode = env === 'preview' ? 'lab' : 'off'
  const mode = String(process.env.STORY_VIDEO_SMART_VISION_MODE || defaultMode).trim().toLowerCase()
  return SMART_VIDEO_VALID_MODES.has(mode) ? mode : defaultMode
}

export function calcularTimestampsSmartVision(durationSec) {
  const d = Number(durationSec)
  if (!Number.isFinite(d) || d <= 0) return [1]
  if (d < 2.4) return [Math.max(0.1, Number((d * 0.5).toFixed(2)))]

  const raw = [d * 0.25, d * 0.5, d * 0.75]
  return [...new Set(raw.map((value) => {
    const safe = Math.min(Math.max(value, 0.1), Math.max(0.1, d - 0.1))
    return Number(safe.toFixed(2))
  }))]
}

function parseDurationFromFfmpeg(stderr = '') {
  const match = String(stderr).match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/)
  if (!match) return null
  const seconds = (Number(match[1]) * 3600) + (Number(match[2]) * 60) + Number(match[3])
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

async function obterDuracaoVideo(videoPath) {
  try {
    const result = await execFileAsync(ffmpegPath, [
      '-hide_banner',
      '-i', videoPath,
      '-t', '0.05',
      '-f', 'null',
      '-',
    ], { timeout: 5000 })
    return parseDurationFromFfmpeg(result?.stderr || '')
  } catch (err) {
    return parseDurationFromFfmpeg(err?.stderr || '')
  }
}

function dedupeFramesExatos(frames = []) {
  const seen = new Set()
  const unique = []
  for (const frame of frames) {
    if (!Buffer.isBuffer(frame?.buffer)) continue
    const hash = crypto.createHash('sha256').update(frame.buffer).digest('hex')
    if (seen.has(hash)) continue
    seen.add(hash)
    unique.push(frame)
  }
  return unique
}

async function extrairFramesInteligentesDeVideo(videoBuffer) {
  const videoPath = `/tmp/story-smart-${crypto.randomUUID()}.mp4`
  const framePaths = []
  const startedAt = Date.now()

  try {
    await writeFile(videoPath, videoBuffer)
    const durationSec = await obterDuracaoVideo(videoPath)
    const timestamps = calcularTimestampsSmartVision(durationSec).slice(0, SMART_VIDEO_MAX_FRAMES)

    const frames = []
    for (let index = 0; index < timestamps.length; index += 1) {
      const framePath = `/tmp/frame-smart-${crypto.randomUUID()}-${index + 1}.jpg`
      framePaths.push(framePath)
      try {
        await execFileAsync(ffmpegPath, [
          '-ss', String(timestamps[index]),
          '-i', videoPath,
          '-frames:v', '1',
          '-q:v', '2',
          '-y',
          framePath,
        ], { timeout: FFMPEG_TIMEOUT_MS })
        const buffer = await readFile(framePath)
        frames.push({ buffer, timestampSec: timestamps[index], label: `F${index + 1}` })
      } catch {
        // Um frame específico pode falhar; os demais ainda são úteis.
      }
    }

    const unique = dedupeFramesExatos(frames)
    return {
      frames: unique,
      durationSec,
      ffmpegMs: Date.now() - startedAt,
      collapsedStatic: unique.length === 1 && frames.length > 1,
    }
  } catch {
    return { frames: [], durationSec: null, ffmpegMs: Date.now() - startedAt, collapsedStatic: false }
  } finally {
    await unlink(videoPath).catch(() => {})
    await Promise.all(framePaths.map((path) => unlink(path).catch(() => {})))
  }
}

function validarStoryMediaUrl(urlStr) {
  let u
  try {
    u = new URL(urlStr)
  } catch {
    return false
  }
  if (u.protocol !== 'https:') return false
  if (!ALLOWED_STORY_MEDIA_HOSTS.has(u.hostname)) return false
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(u.hostname)) return false
  if (['localhost', '127.0.0.1', '0.0.0.0'].includes(u.hostname)) return false
  return true
}

async function baixarStoryMediaSeguro(storyMediaUrl) {
  if (!validarStoryMediaUrl(storyMediaUrl)) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), MEDIA_FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(storyMediaUrl, { signal: controller.signal, redirect: 'manual' })
    clearTimeout(timeout)

    // redirect: 'manual' — qualquer 3xx é rejeitado (nunca segue redirecionamento
    // pra um host fora da allowlist sem revalidar).
    if (res.status >= 300 && res.status < 400) return null
    if (!res.ok) return null

    const contentType = res.headers.get('content-type') || ''
    const ehImagem = ALLOWED_IMAGE_MIME_PREFIX.test(contentType)
    const ehVideo = ALLOWED_VIDEO_MIME_PREFIX.test(contentType)
    if (!ehImagem && !ehVideo) return null

    const limiteBytes = ehVideo ? MAX_VIDEO_BYTES : MAX_MEDIA_BYTES
    const contentLength = Number(res.headers.get('content-length') || 0)
    if (contentLength > limiteBytes) return null

    const arrayBuffer = await res.arrayBuffer()
    if (arrayBuffer.byteLength > limiteBytes) return null // revalida pós-download

    return { buffer: Buffer.from(arrayBuffer), contentType }
  } catch {
    clearTimeout(timeout)
    return null // timeout, DNS, rede — nunca loga a URL
  }
}

// Extrai 1 frame (~1s) de um vídeo MP4 de Story e devolve como JPEG.
// Comprovado via PoC isolado (branch poc/ffmpeg-story-frame, 2026-08-31) com o
// mesmo vídeo real de um Story foto+música do Instagram (Meta sempre entrega
// esse tipo de Story como video/mp4, mesmo quando o original era uma foto
// estática) — ffmpegMs ~400ms, frame 720x1280, identificado corretamente pela
// mesma camada de visão já homologada. Fail-safe: qualquer erro retorna null,
// nunca lança — o chamador cai para o fluxo sem Story.
async function extrairFrameDeVideo(videoBuffer) {
  const videoPath = `/tmp/story-${crypto.randomUUID()}.mp4`
  const framePath = `/tmp/frame-${crypto.randomUUID()}.jpg`
  try {
    await writeFile(videoPath, videoBuffer)
    await execFileAsync(ffmpegPath, [
      '-ss', '1',
      '-i', videoPath,
      '-frames:v', '1',
      '-q:v', '2',
      '-y',
      framePath,
    ], { timeout: FFMPEG_TIMEOUT_MS })
    const frameBuffer = await readFile(framePath)
    return frameBuffer
  } catch {
    // Nunca loga caminho/URL — só o tipo genérico da falha, sem detalhe do vídeo.
    console.warn('[VisaoProduto] extração de frame indisponível, seguindo sem Story')
    return null
  } finally {
    await unlink(videoPath).catch(() => {})
    await unlink(framePath).catch(() => {})
  }
}


// Prepara a mídia do Story como uma única imagem para outros fluxos de visão
// (ex.: Visual Match). Reusa exatamente a mesma allowlist/download/frame de
// identificarProdutoPorImagem(). Não registra telemetria própria — o chamador
// decide a telemetria da operação derivada.
export async function prepararStoryImageDataUrl(storyMediaUrl) {
  const midia = await baixarStoryMediaSeguro(storyMediaUrl)
  if (!midia) return null

  const sourceMediaType = ALLOWED_VIDEO_MIME_PREFIX.test(midia.contentType) ? 'video' : 'image'
  const smartMode = getStoryVideoSmartVisionMode()

  if (sourceMediaType === 'video') {
    if (smartMode !== 'off') {
      const smart = await extrairFramesInteligentesDeVideo(midia.buffer)
      if (smart.frames.length > 0) {
        const dataUrls = smart.frames.map((frame) =>
          `data:image/jpeg;base64,${frame.buffer.toString('base64')}`
        )
        console.log(`[VisaoProduto] Smart Video LAB: frames=${dataUrls.length} collapsed_static=${smart.collapsedStatic}`)
        return {
          dataUrl: dataUrls[0],
          dataUrls,
          sourceMediaType,
          smartVideoUsed: true,
          frameCount: dataUrls.length,
          durationSec: smart.durationSec,
          collapsedStatic: smart.collapsedStatic,
          ffmpegMs: smart.ffmpegMs,
        }
      }
    }

    const frame = await extrairFrameDeVideo(midia.buffer)
    if (!frame) return null
    const dataUrl = `data:image/jpeg;base64,${frame.toString('base64')}`
    return {
      dataUrl,
      dataUrls: [dataUrl],
      sourceMediaType,
      smartVideoUsed: false,
      frameCount: 1,
    }
  }

  const dataUrl = `data:${midia.contentType};base64,${midia.buffer.toString('base64')}`
  return {
    dataUrl,
    dataUrls: [dataUrl],
    sourceMediaType,
    smartVideoUsed: false,
    frameCount: 1,
  }
}

function baseUrlDoDeployment() {
  // VERCEL_URL é preenchido automaticamente pela Vercel em toda deployment
  // (Preview ou Production) — sempre aponta pro próprio deployment em execução,
  // nunca hardcoded.
  const host = process.env.VERCEL_URL
  return host ? `https://${host}` : null
}

export async function identificarProdutoPorImagem(storyMediaUrl, traceMeta = {}) {
  const inicio = Date.now()
  // Etapa 0B (Story Vision Trace) — repassados só pra telemetria, nunca usados
  // em decisão de negócio nem logados em texto de conversa/prompt. Ambos
  // opcionais: chamador que não passar traceMeta mantém 100% do comportamento
  // anterior (correlation_id/story_id gravados como null).
  const { correlationId = null, storyId = null } = traceMeta || {}

  const midia = await baixarStoryMediaSeguro(storyMediaUrl)
  // Falha de download acontece antes de sabermos o media_type real
  // (image/video) — media_type='unknown' (migration 031) cobre exatamente
  // este caso, sem precisar alterar a assinatura pública da função nem
  // tocar webhook.js.
  if (!midia) {
    recordVisionUsageEvent({
      source: 'story', mediaType: 'unknown', ffmpegUsed: false, model: VISION_PROXY_MODEL,
      provider: VISION_PROVIDER, success: false, latencyMs: Date.now() - inicio,
      errorCode: 'download_error', correlationId, storyId,
    })
    return null
  }

  const mediaType = ALLOWED_VIDEO_MIME_PREFIX.test(midia.contentType) ? 'video' : 'image'

  const base = baseUrlDoDeployment()
  if (!base) {
    recordVisionUsageEvent({
      source: 'story', mediaType, ffmpegUsed: false, model: VISION_PROXY_MODEL,
      provider: VISION_PROVIDER, success: false, latencyMs: Date.now() - inicio,
      errorCode: 'provider_error', correlationId, storyId,
    })
    return null
  }

  let buffersParaVisao = [{ buffer: midia.buffer, contentType: midia.contentType, label: 'F1' }]
  let ffmpegUsed = false
  let ffmpegMs = null
  let smartVideoUsed = false

  if (ALLOWED_VIDEO_MIME_PREFIX.test(midia.contentType)) {
    ffmpegUsed = true
    const smartMode = getStoryVideoSmartVisionMode()

    if (smartMode !== 'off') {
      const smart = await extrairFramesInteligentesDeVideo(midia.buffer)
      ffmpegMs = smart.ffmpegMs
      if (smart.frames.length > 0) {
        smartVideoUsed = true
        buffersParaVisao = smart.frames.map((frame) => ({
          buffer: frame.buffer,
          contentType: 'image/jpeg',
          label: frame.label,
        }))
        console.log(`[VisaoProduto] Smart Video LAB: vision_frames=${buffersParaVisao.length} collapsed_static=${smart.collapsedStatic}`)
      }
    }

    if (!smartVideoUsed) {
      const ffmpegInicio = Date.now()
      const frame = await extrairFrameDeVideo(midia.buffer)
      ffmpegMs = Date.now() - ffmpegInicio
      if (!frame) {
        recordVisionUsageEvent({
          source: 'story', mediaType, ffmpegUsed, ffmpegMs, model: VISION_PROXY_MODEL,
          provider: VISION_PROVIDER, success: false, latencyMs: Date.now() - inicio,
          errorCode: 'ffmpeg_error', correlationId, storyId,
        })
        return null
      }
      buffersParaVisao = [{ buffer: frame, contentType: 'image/jpeg', label: 'F1' }]
    }
  }

  const visionPrompt = smartVideoUsed && buffersParaVisao.length > 1
    ? PROMPT_IDENTIFICACAO_MULTI_FRAME
    : PROMPT_IDENTIFICACAO

  // Em Preview, deployments ficam atrás do Vercel Deployment Protection (SSO) —
  // até chamadas internas servidor-a-servidor são bloqueadas sem esse header.
  // VERCEL_AUTOMATION_BYPASS_SECRET já existe como secret gerenciado pela própria
  // Vercel (Preview); em produção essa proteção não existe, então isso nunca
  // afeta produção (env var ausente = header simplesmente não é enviado).
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), VISION_CALL_TIMEOUT_MS)
  try {
    const res = await fetch(`${base}/api/system-tools?tool=ocr-openrouter`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(bypassSecret ? { 'x-vercel-protection-bypass': bypassSecret } : {}),
      },
      body: JSON.stringify({
        model: VISION_PROXY_MODEL,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: visionPrompt },
            ...buffersParaVisao.map((frame) => ({
              type: 'image_url',
              image_url: { url: `data:${frame.contentType};base64,${frame.buffer.toString('base64')}` },
            })),
          ],
        }],
        max_tokens: 800,
        temperature: 0.2,
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) {
      recordVisionUsageEvent({
        source: 'story', mediaType, ffmpegUsed, ffmpegMs, model: VISION_PROXY_MODEL,
        provider: VISION_PROVIDER, success: false, latencyMs: Date.now() - inicio,
        errorCode: 'provider_error', correlationId, storyId,
      })
      return null
    }

    const data = await res.json()
    const texto = data.choices?.[0]?.message?.content || ''

    recordVisionUsageEvent({
      source: 'story', mediaType, ffmpegUsed, ffmpegMs, model: VISION_PROXY_MODEL,
      provider: VISION_PROVIDER, success: !!texto, latencyMs: Date.now() - inicio,
      inputTokens: data.usage?.prompt_tokens ?? null,
      outputTokens: data.usage?.completion_tokens ?? null,
      totalTokens: data.usage?.total_tokens ?? null,
      // Confirmado empiricamente em 2026-08-31: a resposta principal do
      // OpenRouter já inclui usage.cost hoje, sem precisar de nenhum campo
      // extra no request nem de uma 2ª chamada — ver _visionTelemetry.js.
      costFromMainResponse: typeof data.usage?.cost === 'number' ? data.usage.cost : null,
      generationId: data.id ?? null,
      errorCode: texto ? null : 'vision_error',
      correlationId, storyId,
    })
    return texto || null
  } catch (err) {
    clearTimeout(timeout)
    // Nunca loga base64 nem storyMediaUrl.
    console.warn('[VisaoProduto] identificação indisponível, seguindo sem Story')
    recordVisionUsageEvent({
      source: 'story', mediaType, ffmpegUsed, ffmpegMs, model: VISION_PROXY_MODEL,
      provider: VISION_PROVIDER, success: false, latencyMs: Date.now() - inicio,
      errorCode: err?.name === 'AbortError' ? 'timeout' : 'vision_error',
      correlationId, storyId,
    })
    return null
  }
}
