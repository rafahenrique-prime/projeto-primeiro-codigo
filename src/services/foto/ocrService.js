// OCR de imagens usando Groq Vision
// Extrai texto de fotos, catálogos, tabelas de preço, prints de tela

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const VISION_MODELS = ['meta-llama/llama-4-scout-17b-16e-instruct', 'llama-3.2-90b-vision-preview', 'llama-3.2-11b-vision-preview']

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function extractTextFromImage(file, onProgress) {
  const log = msg => onProgress?.({ msg })

  log('Lendo imagem...')
  const base64 = await fileToBase64(file)
  const mimeType = file.type || 'image/jpeg'

  log('Enviando para análise de visão...')

  const prompt = `Você é um sistema OCR especializado em catálogos de produtos de moda e lojas de roupas/tênis.

Analise esta imagem e extraia TODO o texto visível, especialmente:
- Nomes de produtos
- Preços (R$, valores)
- Tamanhos disponíveis
- Códigos de produto
- Descrições
- Políticas (troca, entrega, etc.)
- Tabelas de preços
- Qualquer texto informativo

Se for um catálogo ou lista de produtos, formate assim:
## [PRODUTO] Nome do Produto
**Preço:** R$ XX,XX
**Tamanhos:** P, M, G, GG
**Descrição:** ...

Se for texto geral, extraia fielmente como aparece na imagem.
Não invente informações — extraia apenas o que estiver visível.`

  let lastError = null
  for (const model of VISION_MODELS) {
    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
            ],
          }],
          max_tokens: 1500,
          temperature: 0.1,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        lastError = err.error?.message || `Erro ${res.status}`
        if (res.status === 429) continue
        throw new Error(lastError)
      }

      const data = await res.json()
      const text = data.choices?.[0]?.message?.content || ''
      log('Texto extraído com sucesso!')
      return { text, model }
    } catch (e) {
      lastError = e.message
      if (!e.message.includes('429') && !e.message.includes('Rate limit')) throw e
    }
  }

  throw new Error(lastError || 'Nenhum modelo de visão disponível. Tente novamente.')
}

// Pacote 2 — fallback de visão migrado pro server-side (api/system-tools.js?tool=ocr-openrouter).
// Lista de modelos buscada do servidor (nunca hardcoded aqui) — o servidor já cura até 3
// modelos de visão gratuitos a partir do catálogo oficial do OpenRouter (cache 12h + último
// snapshot válido como fallback). Cache client-side (1h) só evita refetch a cada foto.
const OR_PROXY_URL = '/api/system-tools?tool=ocr-openrouter'

let orVisionModelsCache = null
let orVisionModelsCachedAt = 0
const OR_VISION_MODELS_CLIENT_CACHE_MS = 60 * 60 * 1000

async function fetchOrVisionModels() {
  const now = Date.now()
  if (orVisionModelsCache && (now - orVisionModelsCachedAt) < OR_VISION_MODELS_CLIENT_CACHE_MS) {
    return orVisionModelsCache
  }
  try {
    const res = await fetch(OR_PROXY_URL)
    if (!res.ok) return orVisionModelsCache || []
    const { models } = await res.json()
    orVisionModelsCache = (models || []).map(m => m.id)
    orVisionModelsCachedAt = now
    return orVisionModelsCache
  } catch (e) {
    console.error('[ocrService] Erro ao buscar modelos de visão OpenRouter:', e.message)
    return orVisionModelsCache || []
  }
}

export async function identifyProductFromPhoto(file, onProgress) {
  const log = msg => onProgress?.({ msg })
  log('Lendo imagem...')
  const base64 = await fileToBase64(file)
  const mimeType = file.type || 'image/jpeg'

  const prompt = `Você é um especialista em identificação de produtos para lojas.

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

  // Tenta Groq Vision primeiro (mais rápido)
  const groqVisionModels = ['meta-llama/llama-4-scout-17b-16e-instruct', 'llama-3.2-90b-vision-preview', 'llama-3.2-11b-vision-preview']
  for (const model of groqVisionModels) {
    try {
      log(`Identificando produto com ${model.split('/').pop()}...`)
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
          ]}],
          max_tokens: 800,
          temperature: 0.2,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        if (res.status === 429 || res.status === 503) continue
        throw new Error(err.error?.message || `Erro ${res.status}`)
      }
      const data = await res.json()
      const text = data.choices?.[0]?.message?.content || ''
      log('Produto identificado via Groq!')
      return { text, model }
    } catch (e) {
      if (!e.message.includes('429') && !e.message.includes('Rate') && !e.message.includes('503')) throw e
    }
  }

  // Fallback: OpenRouter Vision (Pacote 2 — via proxy server-side, sem chave no frontend).
  // Lista dinâmica: se vier vazia (catálogo indisponível e sem fallback nenhum), não quebra
  // o app — só pula direto pro erro amigável já existente abaixo.
  const orVisionModels = await fetchOrVisionModels()
  for (const model of orVisionModels) {
    try {
      log(`Tentando via OpenRouter (${model.split('/').pop()})...`)
      const res = await fetch(OR_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
          ]}],
          max_tokens: 800,
          temperature: 0.2,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        // 404/400 = modelo saiu do catálogo do OpenRouter entre o cache e esta chamada
        // (não é garantia absoluta de disponibilidade só porque o preço é zero) — tenta o
        // próximo da lista em vez de quebrar o fluxo inteiro, igual já fazia com 429.
        if (res.status === 429 || res.status === 404 || res.status === 400) continue
        throw new Error(err.error?.message || `Erro ${res.status}`)
      }
      const data = await res.json()
      const text = data.choices?.[0]?.message?.content || ''
      if (!text) continue
      log('Produto identificado via OpenRouter!')
      return { text, model }
    } catch (e) {
      if (!e.message.includes('429')) throw e
    }
  }

  throw new Error('Nenhum modelo de visão disponível no momento. Tente novamente.')
}

export function detectContentCategory(text) {
  const t = text.toLowerCase()
  if (/preço|r\$|valor|desconto|parcel|pix/.test(t)) return 'PRECO'
  if (/troca|devolv|frete|entrega|prazo|garanti/.test(t)) return 'POLITICA'
  if (/tênis|tenis|camis|calça|berm|boné|bone|jaqueta|moletom/.test(t)) return 'PRODUTO'
  if (/como|guia|instru|manual|tabela de medid/.test(t)) return 'GUIA'
  return 'PRODUTO'
}
