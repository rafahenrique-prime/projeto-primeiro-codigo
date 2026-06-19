/**
 * ORCHESTRADOR PRINCIPAL: Foto Recognition Flow
 *
 * Integra tudo:
 * 1. Foto → Recognition (Google Vision, OpenAI, etc)
 * 2. Analysis → Matching com Catálogo
 * 3. Resultado → Cache
 * 4. Tudo → Enviado ao GPT Maker para resposta
 *
 * INDEPENDENT DO GPT MAKER:
 * - Funciona sem GPT Maker
 * - GPT Maker é apenas para melhorar a resposta
 * - Fallback automático se GPT Maker cair
 */

import { recognizePhoto } from './photoRecognitionService'
import { matchPhotoToProducts } from './photoMatchingService'
import {
  getCachedAnalysis,
  setCachedAnalysis,
  getCacheStats,
} from './photoCacheService'
import { sendMessage } from './gptmaker'

// ==================== MÉTRICAS ====================

const metrics = {
  totalProcessed: 0,
  cacheHits: 0,
  averageTime: 0,
  errors: 0,
}

// ==================== FLUXO PRINCIPAL ====================

export async function processPhotoFlow(imageUrl, chatId = null) {
  const startTime = performance.now()

  try {
    console.log('[Photo Flow] Iniciando processamento de foto...')

    // Validações
    if (!imageUrl) {
      throw new Error('Image URL is required')
    }

    // ─── STEP 1: Verifica cache ───
    console.log('[Photo Flow] Verificando cache...')
    let analysisResult = await getCachedAnalysis(imageUrl)

    if (analysisResult) {
      metrics.cacheHits++
      console.log('[Photo Flow] Cache hit!')
    } else {
      // ─── STEP 2: Reconhecimento de foto ───
      console.log('[Photo Flow] Analisando foto com Vision API...')
      analysisResult = await recognizePhoto(imageUrl)

      // ─── STEP 3: Salva no cache ───
      await setCachedAnalysis(imageUrl, analysisResult)
    }

    // ─── STEP 4: Matching com catálogo ───
    console.log('[Photo Flow] Buscando produtos no catálogo...')
    const matchResult = await matchPhotoToProducts(analysisResult)

    // ─── STEP 5: Monta resposta ───
    const result = {
      success: true,
      imageUrl,
      analysis: {
        provider: analysisResult.provider,
        fromCache: analysisResult.fromCache || false,
      },
      matches: matchResult.matches,
      confidence: matchResult.confidence,
      processingTime: Math.round(performance.now() - startTime),
    }

    // ─── STEP 6: Envia para GPT Maker (opcional) ───
    if (chatId) {
      console.log('[Photo Flow] Enviando resultado ao GPT Maker...')
      await enrichWithGPTMaker(result, chatId)
    }

    // Atualiza métricas
    metrics.totalProcessed++
    updateAverageTime(result.processingTime)

    console.log('[Photo Flow] ✅ Concluído com sucesso!', result)
    return result
  } catch (err) {
    metrics.errors++
    console.error('[Photo Flow] ❌ Erro:', err)

    return {
      success: false,
      error: err.message,
      processingTime: Math.round(performance.now() - startTime),
    }
  }
}

// ==================== INTEGRAÇÃO COM GPT MAKER ====================

async function enrichWithGPTMaker(result, chatId) {
  try {
    if (!result.matches || result.matches.length === 0) {
      // Sem matches, apenas envia a foto para GPT Maker analisar
      console.log('[Photo Flow] Sem matches detectados, enviando foto para GPT Maker...')
      await sendMessage(
        chatId,
        'Recebi sua foto. Me descreva mais sobre o que está procurando para eu ajudar melhor!',
        result.imageUrl
      )
      return
    }

    // Com matches, envia resposta estruturada
    const topMatch = result.matches[0]
    const messageText = `
Encontrei ${result.matches.length} produto(s) similar(es):

🔝 Melhor match: *${topMatch.nome}*
💰 Preço: ${topMatch.preco}
✅ Confiança: ${topMatch.confidence}%

Quer saber mais sobre este produto ou prefere ver outras opções?
`.trim()

    console.log('[Photo Flow] Enviando matches para GPT Maker...')

    // Envia mensagem com a foto para contexto
    await sendMessage(chatId, messageText, result.imageUrl)

    // Adiciona aos treinamentos do agente (futura melhoria)
    // await addToAgentKnowledge(result.matches)
  } catch (err) {
    console.warn('[Photo Flow] Erro ao enviar para GPT Maker (não bloqueia):', err)
    // Continua mesmo que GPT Maker falhe
  }
}

// ==================== ANÁLISE DE PERFORMANCE ====================

function updateAverageTime(newTime) {
  const total = metrics.totalProcessed
  const oldAverage = metrics.averageTime
  metrics.averageTime = (oldAverage * (total - 1) + newTime) / total
}

export function getMetrics() {
  return {
    ...metrics,
    cacheHitRate: metrics.totalProcessed > 0
      ? Math.round((metrics.cacheHits / metrics.totalProcessed) * 100)
      : 0,
    errorRate: metrics.totalProcessed > 0
      ? Math.round((metrics.errors / metrics.totalProcessed) * 100)
      : 0,
    averageTimeMs: Math.round(metrics.averageTime),
    cacheStats: getCacheStats(),
  }
}

export function resetMetrics() {
  metrics.totalProcessed = 0
  metrics.cacheHits = 0
  metrics.averageTime = 0
  metrics.errors = 0
}

// ==================== MODO DEBUG ====================

export function enableDebugMode() {
  console.log('[Photo Flow] Debug mode ENABLED')
  console.log('Métricas:', getMetrics())
  console.log('Cache Stats:', getCacheStats())
}

// ==================== FLUXO INDEPENDENTE (FUTURO) ====================

/**
 * IMPORTANTE: Este é o ponto de partida para rodar INDEPENDENTE!
 *
 * Para desacoplar do GPT Maker:
 * 1. Remover a chamada await enrichWithGPTMaker()
 * 2. Implementar seu próprio LLM (Ollama, Llama.cpp, etc)
 * 3. Rodar em container Docker/Node.js puro
 *
 * O fluxo principal (processPhotoFlow) já é independente!
 */

export async function processPhotoFlowIndependent(imageUrl) {
  console.log('[Photo Flow] Modo INDEPENDENT (sem GPT Maker)')

  // Mesmo fluxo, mas sem GPT Maker
  const startTime = performance.now()

  try {
    let analysisResult = await getCachedAnalysis(imageUrl)

    if (!analysisResult) {
      analysisResult = await recognizePhoto(imageUrl)
      await setCachedAnalysis(imageUrl, analysisResult)
    }

    const matchResult = await matchPhotoToProducts(analysisResult)

    return {
      success: true,
      imageUrl,
      matches: matchResult.matches,
      confidence: matchResult.confidence,
      processingTime: Math.round(performance.now() - startTime),
      provider: analysisResult.provider,
    }
  } catch (err) {
    return {
      success: false,
      error: err.message,
      processingTime: Math.round(performance.now() - startTime),
    }
  }
}

console.log('[Photo Flow] Serviço carregado e pronto')
