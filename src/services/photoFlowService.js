/**
 * PHOTO RECOGNITION COM GPT MAKER
 *
 * Simples e integrado:
 * Foto → GPT Maker Vision → Análise → Cache → Pronto!
 *
 * Sem AWS, sem backends separados, sem trabalheira.
 */

import {
  getCachedAnalysis,
  setCachedAnalysis,
  getCacheStats,
} from './photoCacheService'

// Métricas
const metrics = {
  totalProcessed: 0,
  cacheHits: 0,
  averageTime: 0,
  errors: 0,
}

// ==================== FLUXO PRINCIPAL ====================

export async function processPhotoFlow(imageUrl) {
  const startTime = performance.now()
  metrics.totalProcessed++

  try {
    if (!imageUrl) throw new Error('URL da imagem é obrigatória')

    // STEP 1: Verifica cache
    let result = await getCachedAnalysis(imageUrl)

    if (result) {
      metrics.cacheHits++
      result.fromCache = true
    } else {
      // STEP 2: Analisa com GPT Maker Vision
      result = await analyzeWithGPTMaker(imageUrl)

      // STEP 3: Salva em cache
      await setCachedAnalysis(imageUrl, result)
    }

    // STEP 4: Monta resposta final
    const processingTime = Math.round(performance.now() - startTime)
    metrics.averageTime = (metrics.averageTime * (metrics.totalProcessed - 1) + processingTime) / metrics.totalProcessed

    return {
      success: true,
      imageUrl,
      matches: result.matches || [],
      analysis: result.analysis || {},
      confidence: result.confidence || 0,
      processingTime,
      fromCache: result.fromCache || false,
    }
  } catch (err) {
    metrics.errors++
    console.error('[Photo] Erro:', err.message)

    return {
      success: false,
      error: err.message,
      processingTime: Math.round(performance.now() - startTime),
    }
  }
}

// ==================== ANÁLISE COM GPT MAKER ====================

async function analyzeWithGPTMaker(imageUrl) {
  try {
    // Prepara prompt para GPT Maker
    const prompt = `
Analise esta imagem de produto e:
1. Identifique o tipo de produto (roupas, sapatos, acessórios, etc)
2. Descreva características principais (cor, estilo, marca aparente)
3. Sugira 3-5 produtos similares do nosso catálogo que combinariam

Responda em JSON estruturado:
{
  "tipo": "tipo do produto",
  "descricao": "características",
  "matches": [
    { "nome": "produto", "categoria": "categoria", "confidence": 85 }
  ]
}
`

    // Envia para GPT Maker via API
    const response = await fetch('/api/gptmaker/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl,
        prompt,
        vision: true // Ativa visão
      })
    })

    if (!response.ok) {
      throw new Error(`Erro GPT Maker: ${response.status}`)
    }

    const data = await response.json()

    // Extrai matches do catálogo
    const matches = extrairMatchesDoCatalogo(data.matches || [])

    return {
      analysis: {
        tipo: data.tipo,
        descricao: data.descricao,
      },
      matches,
      confidence: calculateConfidence(matches),
    }
  } catch (err) {
    console.error('[GPT Maker] Erro:', err)
    throw err
  }
}

// ==================== HELPERS ====================

function extrairMatchesDoCatalogo(sugestoes) {
  // Aqui você buscaria no catálogo real
  // Por enquanto, retorna as sugestões do GPT Maker
  return sugestoes.map(item => ({
    nome: item.nome,
    categoria: item.categoria,
    confidence: item.confidence || 75,
    link: `/catalogo/${item.nome.toLowerCase().replace(/\s+/g, '-')}`
  }))
}

function calculateConfidence(matches) {
  if (matches.length === 0) return 0
  const avg = matches.reduce((sum, m) => sum + m.confidence, 0) / matches.length
  return Math.round(avg)
}

// ==================== MÉTRICAS ====================

export function getMetrics() {
  return {
    totalProcessed: metrics.totalProcessed,
    cacheHits: metrics.cacheHits,
    cacheHitRate: metrics.totalProcessed > 0
      ? Math.round((metrics.cacheHits / metrics.totalProcessed) * 100)
      : 0,
    averageTime: Math.round(metrics.averageTime),
    errors: metrics.errors,
    errorRate: metrics.totalProcessed > 0
      ? Math.round((metrics.errors / metrics.totalProcessed) * 100)
      : 0,
    cacheStats: getCacheStats(),
  }
}

export function resetMetrics() {
  metrics.totalProcessed = 0
  metrics.cacheHits = 0
  metrics.averageTime = 0
  metrics.errors = 0
}
