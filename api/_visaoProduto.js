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

function baseUrlDoDeployment() {
  // VERCEL_URL é preenchido automaticamente pela Vercel em toda deployment
  // (Preview ou Production) — sempre aponta pro próprio deployment em execução,
  // nunca hardcoded.
  const host = process.env.VERCEL_URL
  return host ? `https://${host}` : null
}

export async function identificarProdutoPorImagem(storyMediaUrl) {
  const inicio = Date.now()

  const midia = await baixarStoryMediaSeguro(storyMediaUrl)
  // Falha de download acontece antes de sabermos o media_type real
  // (image/video) — media_type='unknown' (migration 031) cobre exatamente
  // este caso, sem precisar alterar a assinatura pública da função nem
  // tocar webhook.js.
  if (!midia) {
    recordVisionUsageEvent({
      source: 'story', mediaType: 'unknown', ffmpegUsed: false, model: VISION_PROXY_MODEL,
      provider: VISION_PROVIDER, success: false, latencyMs: Date.now() - inicio,
      errorCode: 'download_error',
    })
    return null
  }

  const mediaType = ALLOWED_VIDEO_MIME_PREFIX.test(midia.contentType) ? 'video' : 'image'

  const base = baseUrlDoDeployment()
  if (!base) {
    recordVisionUsageEvent({
      source: 'story', mediaType, ffmpegUsed: false, model: VISION_PROXY_MODEL,
      provider: VISION_PROVIDER, success: false, latencyMs: Date.now() - inicio,
      errorCode: 'provider_error',
    })
    return null
  }

  let bufferParaVisao = midia.buffer
  let contentTypeParaVisao = midia.contentType
  let ffmpegUsed = false
  let ffmpegMs = null

  if (ALLOWED_VIDEO_MIME_PREFIX.test(midia.contentType)) {
    ffmpegUsed = true
    const ffmpegInicio = Date.now()
    const frame = await extrairFrameDeVideo(midia.buffer)
    ffmpegMs = Date.now() - ffmpegInicio
    if (!frame) {
      // fail-safe: vídeo sem frame extraível, sem 2ª tentativa em V1
      recordVisionUsageEvent({
        source: 'story', mediaType, ffmpegUsed, ffmpegMs, model: VISION_PROXY_MODEL,
        provider: VISION_PROVIDER, success: false, latencyMs: Date.now() - inicio,
        errorCode: 'ffmpeg_error',
      })
      return null
    }
    bufferParaVisao = frame
    contentTypeParaVisao = 'image/jpeg'
  }

  const base64 = bufferParaVisao.toString('base64')

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
            { type: 'text', text: PROMPT_IDENTIFICACAO },
            { type: 'image_url', image_url: { url: `data:${contentTypeParaVisao};base64,${base64}` } },
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
        errorCode: 'provider_error',
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
    })
    return null
  }
}
