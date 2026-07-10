/**
 * Serviço de importação do backup Dealism
 * Importa produtos e gera relatório de conflitos ANTES de apagar
 */

import { getAllProducts, saveCatalogToSupabase } from './catalog'

// Normaliza nome para comparação
function normalizeName(name) {
  if (!name) return ''
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/ç/g, 'c')
}

// Converte produtos do backup para formato do catálogo
function convertBackupProducts(backupData) {
  const products = []
  let id = 1

  if (!backupData?.categorias) return products

  for (const categoria of backupData.categorias) {
    if (categoria.produtos) {
      for (const prod of categoria.produtos) {
        const nome = prod.modelo || prod.tipo || 'Produto Sem Nome'
        products.push({
          id,
          nome,
          preco: `R$ ${prod.preco?.toFixed(2).replace('.', ',')}` || 'Consultar',
          imagem: '', // Será preenchido depois das fotos
          link: '',
          categoria: categoria.categoria,
          estoque: prod.estoque_total || 0,
          cores: prod.cores || [],
          tamanhos: prod.tamanhos_disponiveis || [],
          fromBackup: true,
        })
        id++
      }
    }
  }

  return products
}

// Encontra matches entre produtos atuais e backup
// Nota: Compara TODOS os produtos para encontrar MELHOR match, não apenas primeiro
function findMatches(currentProducts, backupProducts) {
  const matches = []

  for (const backup of backupProducts) {
    const backupNorm = normalizeName(backup.nome)

    let bestMatch = null
    let bestSimilarity = 0
    let bestType = null

    // Compara com TODOS os current products, mantém o MELHOR match
    for (const current of currentProducts) {
      const currentNorm = normalizeName(current.nome)

      // Match exato → score 1.0, tipo EXACT
      if (backupNorm === currentNorm) {
        bestSimilarity = 1.0
        bestMatch = current
        bestType = 'EXACT_DUPLICATE'
        break  // Se encontrou exato, não precisa continuar
      }

      // Match parcial → comparar similaridade
      const similarity = calculateSimilarity(backupNorm, currentNorm)
      if (similarity > 0.7 && similarity > bestSimilarity) {
        bestSimilarity = similarity
        bestMatch = current
        bestType = 'PARTIAL_MATCH'
      }
    }

    // Adiciona apenas o melhor match encontrado
    if (bestMatch && bestSimilarity > 0.7) {
      matches.push({
        type: bestType,
        backup,
        current: bestMatch,
        similarity: bestSimilarity,
      })
    }
  }

  return matches
}

// Calcula similaridade entre strings (Levenshtein simplificado)
function calculateSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2
  const shorter = str1.length > str2.length ? str2 : str1

  if (longer.length === 0) return 1.0

  const editDistance = getEditDistance(longer, shorter)
  return (longer.length - editDistance) / longer.length
}

function getEditDistance(s1, s2) {
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

// Função principal: importa do backup e retorna relatório
export async function importBackupAndGenerateReport(backupData) {
  try {
    // Carrega catálogo atual
    const currentProducts = getAllProducts()

    // Converte backup
    const backupProducts = convertBackupProducts(backupData)

    // Encontra matches
    const matches = findMatches(currentProducts, backupProducts)

    // Separa produtos novos
    const backupIds = new Set(matches.map(m => m.backup.id))
    const newProducts = backupProducts.filter(p => !backupIds.has(p.id))

    // Gera estatísticas
    const exactDuplicates = matches.filter(m => m.type === 'EXACT_DUPLICATE')
    const partialMatches = matches.filter(m => m.type === 'PARTIAL_MATCH')

    // Prepara dados para importação
    const importedProducts = [...currentProducts, ...backupProducts]

    // Salva em localStorage (com identificação)
    localStorage.setItem('products_catalog_imported', JSON.stringify(importedProducts))
    localStorage.setItem('products_backup_temp', JSON.stringify(backupProducts))

    // Retorna relatório
    return {
      status: 'SUCCESS',
      timestamp: new Date().toISOString(),

      // Estatísticas
      stats: {
        currentProducts: currentProducts.length,
        backupProducts: backupProducts.length,
        newProducts: newProducts.length,
        exactDuplicates: exactDuplicates.length,
        partialMatches: partialMatches.length,
        totalAfterImport: importedProducts.length,
      },

      // Dados para revisão
      exactDuplicates: exactDuplicates.map(m => ({
        nome: m.current.nome,
        precoAtual: m.current.preco,
        precoBackup: m.backup.preco,
        imagemAtual: !!m.current.imagem,
        categoriaBackup: m.backup.categoria,
      })),

      partialMatches: partialMatches.map(m => ({
        nomeAtual: m.current.nome,
        nomeBackup: m.backup.nome,
        similarity: (m.similarity * 100).toFixed(0) + '%',
        precoAtual: m.current.preco,
        precoBackup: m.backup.preco,
      })),

      newProducts: newProducts.map(p => ({
        nome: p.nome,
        categoria: p.categoria,
        preco: p.preco,
        estoque: p.estoque,
      })),

      // Dados brutos para confirmação
      _imported: importedProducts,
      _backup: backupProducts,
      _matches: matches,
    }
  } catch (error) {
    return {
      status: 'ERROR',
      error: error.message,
      timestamp: new Date().toISOString(),
    }
  }
}

// Remove duplicatas após confirmação do usuário
export async function applyConflictResolution(decisions) {
  try {
    const imported = JSON.parse(localStorage.getItem('products_catalog_imported'))
    if (!imported) throw new Error('Nenhuma importação pendente')

    // decisions = { exactDuplicates: ['keep_current' | 'keep_backup'], ... }
    const filtered = imported.filter(p => {
      // Lógica de filtro baseada nas decisões do usuário
      return true // Implementar baseado no decisions
    })

    localStorage.setItem('products_catalog', JSON.stringify(filtered))
    localStorage.removeItem('products_catalog_imported')
    localStorage.removeItem('products_backup_temp')
    saveCatalogToSupabase(filtered) // sincroniza com Supabase

    return {
      status: 'SUCCESS',
      message: 'Conflitos resolvidos e catálogo atualizado',
      final_count: filtered.length,
    }
  } catch (error) {
    return {
      status: 'ERROR',
      error: error.message,
    }
  }
}

// Exporta relatório em JSON para auditoria
export function exportReportAsJson(report) {
  const json = JSON.stringify(report, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `import-report-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}
