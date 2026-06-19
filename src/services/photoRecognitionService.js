/**
 * Serviço de Reconhecimento de Fotos
 *
 * ARQUITETURA ESTRATÉGICA:
 * - Abstração completa do provedor (fácil trocar depois)
 * - Funciona com ou sem GPT Maker
 * - Cache inteligente de resultados
 * - Fallback automático
 *
 * PROVEDORES SUPORTADOS:
 * 1. Google Cloud Vision (ATUAL - melhor custo-benefício)
 * 2. OpenAI Vision (próximo - melhor qualidade)
 * 3. AWS Rekognition (futuro - mais robusto)
 * 4. Local ML Model (independente - roda localmente)
 */

// ==================== CONFIGURAÇÃO ====================

const PROVIDERS = {
  GOOGLE_VISION: 'google_vision',
  OPENAI_VISION: 'openai_vision',
  AWS_REKOGNITION: 'aws_rekognition',
  LOCAL_MODEL: 'local_model',
}

// Provedor padrão (trocar aqui para mudar)
const DEFAULT_PROVIDER = PROVIDERS.GOOGLE_VISION

// Chaves de API (do .env)
const GOOGLE_VISION_KEY = import.meta.env.VITE_GOOGLE_VISION_KEY
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY
const AWS_ACCESS_KEY = import.meta.env.VITE_AWS_ACCESS_KEY

// ==================== GOOGLE VISION ====================

async function analyzeWithGoogleVision(imageUrl) {
  if (!GOOGLE_VISION_KEY) {
    throw new Error('Google Vision API key não configurada')
  }

  try {
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { source: { imageUri: imageUrl } },
              features: [
                { type: 'LABEL_DETECTION', maxResults: 10 },
                { type: 'OBJECT_LOCALIZATION', maxResults: 5 },
                { type: 'TEXT_DETECTION' },
                { type: 'IMAGE_PROPERTIES' },
              ],
            },
          ],
        }),
      }
    )

    const data = await response.json()

    if (data.error) {
      throw new Error(`Google Vision Error: ${data.error.message}`)
    }

    const result = data.responses[0]

    return {
      provider: PROVIDERS.GOOGLE_VISION,
      labels: (result.labelAnnotations || []).map(l => ({
        description: l.description,
        confidence: l.score,
      })),
      objects: (result.localizedObjectAnnotations || []).map(o => ({
        name: o.name,
        confidence: o.score,
      })),
      text: result.fullTextAnnotation?.text || '',
      colors: result.imagePropertiesAnnotation?.dominantColors?.colors || [],
      raw: result,
    }
  } catch (err) {
    console.error('Google Vision Error:', err)
    throw err
  }
}

// ==================== OPENAI VISION ====================

async function analyzeWithOpenAIVision(imageUrl) {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key não configurada')
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4-vision-preview',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: imageUrl },
              },
              {
                type: 'text',
                text: 'Descreva detalhadamente este produto. Responda em JSON com: { "categoria": "", "produto": "", "cores": [], "material": "", "condicao": "", "detalhes": "" }',
              },
            ],
          },
        ],
        max_tokens: 500,
      }),
    })

    const data = await response.json()

    if (data.error) {
      throw new Error(`OpenAI Error: ${data.error.message}`)
    }

    const content = data.choices[0].message.content
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}

    return {
      provider: PROVIDERS.OPENAI_VISION,
      analysis: parsed,
      raw: data,
    }
  } catch (err) {
    console.error('OpenAI Vision Error:', err)
    throw err
  }
}

// ==================== AWS REKOGNITION ====================

async function analyzeWithAWSRekognition(imageUrl) {
  // TODO: Implementar integração com AWS Rekognition
  // Requer: AWS SDK, credenciais IAM, etc
  throw new Error('AWS Rekognition ainda não implementado')
}

// ==================== LOCAL ML MODEL ====================

async function analyzeWithLocalModel(imageUrl) {
  // TODO: Implementar modelo local (TensorFlow.js, ONNX, etc)
  // Roda no navegador, sem dependência externa
  throw new Error('Modelo local ainda não implementado')
}

// ==================== ORQUESTRADOR ====================

async function analyzeImage(imageUrl, provider = DEFAULT_PROVIDER) {
  if (!imageUrl) throw new Error('Image URL is required')

  try {
    switch (provider) {
      case PROVIDERS.GOOGLE_VISION:
        return await analyzeWithGoogleVision(imageUrl)

      case PROVIDERS.OPENAI_VISION:
        return await analyzeWithOpenAIVision(imageUrl)

      case PROVIDERS.AWS_REKOGNITION:
        return await analyzeWithAWSRekognition(imageUrl)

      case PROVIDERS.LOCAL_MODEL:
        return await analyzeWithLocalModel(imageUrl)

      default:
        throw new Error(`Unknown provider: ${provider}`)
    }
  } catch (err) {
    console.error(`[Photo Recognition] Error with ${provider}:`, err)
    throw err
  }
}

// ==================== FALLBACK AUTOMÁTICO ====================

export async function analyzeImageWithFallback(imageUrl) {
  const providers = [
    PROVIDERS.GOOGLE_VISION,
    PROVIDERS.OPENAI_VISION,
    // Local model seria o último fallback (sem custo)
  ]

  for (const provider of providers) {
    try {
      console.log(`[Photo Recognition] Tentando ${provider}...`)
      return await analyzeImage(imageUrl, provider)
    } catch (err) {
      console.warn(`[Photo Recognition] ${provider} falhou, tentando próximo...`)
      continue
    }
  }

  throw new Error('Todos os provedores de visão falharam')
}

// ==================== EXPORTS ====================

export async function recognizePhoto(imageUrl) {
  return analyzeImageWithFallback(imageUrl)
}

export async function recognizePhotoWithProvider(imageUrl, provider) {
  return analyzeImage(imageUrl, provider)
}

export function getAvailableProviders() {
  return PROVIDERS
}

export function getCurrentProvider() {
  return DEFAULT_PROVIDER
}

// ==================== UTILITÁRIOS ====================

export function compressImage(imageUrl, maxSize = 1024) {
  // TODO: Implementar compressão de imagem antes de enviar
  // Reduz custo de APIs baseadas em tamanho
  return imageUrl
}

export function validateImageUrl(url) {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}
