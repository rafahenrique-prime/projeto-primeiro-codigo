/**
 * Serviço de Matching: Foto → Produto do Catálogo
 *
 * Toma os dados da análise de foto e encontra
 * o melhor match no catálogo local
 */

import { getAllProducts } from './catalog'

// ==================== ANÁLISE DE SIMILARIDADE ====================

function normalizeText(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/ç/g, 'c')
    .replace(/\s+/g, ' ')
}

function levenshteinDistance(str1, str2) {
  const s1 = normalizeText(str1)
  const s2 = normalizeText(str2)

  const costs = []
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j
      } else if (j > 0) {
        let newValue = costs[j - 1]
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1
        }
        costs[j - 1] = lastValue
        lastValue = newValue
      }
    }
    if (i > 0) costs[s2.length] = lastValue
  }
  return costs[s2.length]
}

function calculateSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2
  const shorter = str1.length > str2.length ? str2 : str1

  if (longer.length === 0) return 1.0

  const editDistance = levenshteinDistance(longer, shorter)
  return (longer.length - editDistance) / longer.length
}

// ==================== BUSCA NO CATÁLOGO ====================

function findProductsByLabels(labels = [], threshold = 0.6) {
  const catalog = getAllProducts()
  const matches = []

  for (const label of labels) {
    const labelText = label.description || label

    for (const product of catalog) {
      const similarity = calculateSimilarity(labelText, product.nome)

      if (similarity > threshold) {
        matches.push({
          product,
          label: labelText,
          similarity,
          score: similarity * (label.confidence || 1),
        })
      }
    }
  }

  // Remove duplicatas, mantém o melhor match
  const uniqueProducts = new Map()
  for (const match of matches) {
    const key = match.product.id
    if (!uniqueProducts.has(key) || match.similarity > uniqueProducts.get(key).similarity) {
      uniqueProducts.set(key, match)
    }
  }

  return Array.from(uniqueProducts.values()).sort((a, b) => b.score - a.score)
}

function findProductsByText(text, threshold = 0.65) {
  if (!text || text.length < 3) return []

  const catalog = getAllProducts()

  // Usa Levenshtein como em findProductsByLabels (mais confiável que word counting)
  const matches = catalog
    .map(product => {
      const similarity = calculateSimilarity(text, product.nome)
      return {
        product,
        similarity,
        score: similarity,
      }
    })
    .filter(m => m.similarity > threshold)  // Threshold 0.65 mais rigoroso que 0.5
    .sort((a, b) => b.similarity - a.similarity)

  return matches
}

// ==================== MATCHING INTELIGENTE ====================

export async function matchPhotoToProducts(photoAnalysis) {
  if (!photoAnalysis) {
    return {
      success: false,
      error: 'Photo analysis is required',
      matches: [],
    }
  }

  try {
    const matches = []

    // 1. Tenta match por labels (Google Vision)
    if (photoAnalysis.labels && photoAnalysis.labels.length > 0) {
      const labelMatches = findProductsByLabels(photoAnalysis.labels, 0.6)
      matches.push(...labelMatches)
    }

    // 2. Tenta match por text (OCR)
    if (photoAnalysis.text && photoAnalysis.text.length > 3) {
      const textMatches = findProductsByText(photoAnalysis.text, 0.5)
      matches.push(...textMatches)
    }

    // 3. Tenta match por objects (Google Vision)
    if (photoAnalysis.objects && photoAnalysis.objects.length > 0) {
      const objectMatches = findProductsByLabels(photoAnalysis.objects, 0.6)
      matches.push(...objectMatches)
    }

    // Remove duplicatas, mantém melhor score
    const uniqueMatches = new Map()
    for (const match of matches) {
      const key = match.product.id
      if (!uniqueMatches.has(key) || match.score > uniqueMatches.get(key).score) {
        uniqueMatches.set(key, match)
      }
    }

    const finalMatches = Array.from(uniqueMatches.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 5) // Top 5 resultados

    return {
      success: true,
      matches: finalMatches.map(m => ({
        id: m.product.id,
        nome: m.product.nome,
        preco: m.product.preco,
        imagem: m.product.imagem,
        link: m.product.link,
        confidence: Math.round(m.score * 100),
        matchedBy: m.label,
      })),
      confidence:
        finalMatches.length > 0
          ? Math.round((finalMatches[0].score / 1) * 100)
          : 0,
    }
  } catch (err) {
    console.error('[Photo Matching] Error:', err)
    return {
      success: false,
      error: err.message,
      matches: [],
    }
  }
}

// ==================== BUSCA MANUAL ====================

export function searchProductByName(query) {
  if (!query || query.length < 2) return []

  const matches = findProductsByText(query, 0.4)
  return matches.map(m => ({
    id: m.product.id,
    nome: m.product.nome,
    preco: m.product.preco,
    imagem: m.product.imagem,
    link: m.product.link,
    confidence: Math.round(m.score * 100),
  }))
}

// ==================== DEBUG ====================

export function debugPhotoAnalysis(photoAnalysis) {
  return {
    provider: photoAnalysis.provider,
    labelsCount: (photoAnalysis.labels || []).length,
    objectsCount: (photoAnalysis.objects || []).length,
    textLength: (photoAnalysis.text || '').length,
    colorsCount: (photoAnalysis.colors || []).length,
  }
}
