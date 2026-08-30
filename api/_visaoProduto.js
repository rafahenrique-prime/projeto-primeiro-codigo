/**
 * api/_visaoProduto.js — identifica visualmente o produto de uma foto de Story,
 * reaproveitando a camada de visão compartilhada já homologada
 * (api/system-tools.js?tool=ocr-openrouter, google/gemini-2.5-flash-lite).
 *
 * Nenhuma chamada direta a provider de IA aqui — só busca segura da mídia e
 * repassa pra camada já existente, exatamente como o painel administrativo
 * (src/services/foto/ocrService.js) já faz do lado do browser.
 *
 * Fail-safe: qualquer falha (mídia inválida, hostname não permitido, timeout,
 * tamanho excedido, provider indisponível) retorna null — nunca lança exceção.
 * Nunca loga storyMediaUrl nem base64.
 */

const MEDIA_FETCH_TIMEOUT_MS = 4000
const VISION_CALL_TIMEOUT_MS = 8000
const MAX_MEDIA_BYTES = 8 * 1024 * 1024 // 8MB — folga generosa pra foto de Story
const ALLOWED_MIME_PREFIX = /^image\/(jpeg|png|webp|gif)/
const ALLOWED_STORY_MEDIA_HOSTS = new Set(['gpt-files.com']) // único domínio real observado em teste

const VISION_PROXY_MODEL = 'google/gemini-2.5-flash-lite'

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
    if (!ALLOWED_MIME_PREFIX.test(contentType)) return null

    const contentLength = Number(res.headers.get('content-length') || 0)
    if (contentLength > MAX_MEDIA_BYTES) return null

    const arrayBuffer = await res.arrayBuffer()
    if (arrayBuffer.byteLength > MAX_MEDIA_BYTES) return null // revalida pós-download

    return { buffer: Buffer.from(arrayBuffer), contentType }
  } catch {
    clearTimeout(timeout)
    return null // timeout, DNS, rede — nunca loga a URL
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
  const midia = await baixarStoryMediaSeguro(storyMediaUrl)
  if (!midia) return null

  const base = baseUrlDoDeployment()
  if (!base) return null

  const base64 = midia.buffer.toString('base64')

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
            { type: 'image_url', image_url: { url: `data:${midia.contentType};base64,${base64}` } },
          ],
        }],
        max_tokens: 800,
        temperature: 0.2,
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) return null

    const data = await res.json()
    const texto = data.choices?.[0]?.message?.content || ''
    return texto || null
  } catch {
    clearTimeout(timeout)
    // Nunca loga base64 nem storyMediaUrl.
    console.warn('[VisaoProduto] identificação indisponível, seguindo sem Story')
    return null
  }
}
