// Catálogo V1 — helpers de apresentação (Fase 3). Funções pequenas e puras,
// sem React, sem I/O — só formatam valores já carregados por catalogV1Data.js.

/**
 * "Hoje, 01:35" / "Ontem, 20:10" / "06/08, 13:02" / "—" se `syncedAt` for
 * nulo/inválido (produto nunca sincronizado pelo pipeline Bagy).
 */
export function formatCatalogSyncDate(syncedAt) {
  if (!syncedAt) return '—'
  const data = new Date(syncedAt)
  if (isNaN(data.getTime())) return '—'

  const agora = new Date()
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  const ontem = new Date(hoje.getTime() - 24 * 60 * 60 * 1000)
  const diaDaData = new Date(data.getFullYear(), data.getMonth(), data.getDate())

  const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  if (diaDaData.getTime() === hoje.getTime()) return `Hoje, ${hora}`
  if (diaDaData.getTime() === ontem.getTime()) return `Ontem, ${hora}`
  const dataCurta = data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return `${dataCurta}, ${hora}`
}

/** "PIX R$ 422,06" ou null se precoPix for nulo/indefinido. */
export function formatPixLabel(precoPix) {
  if (precoPix === null || precoPix === undefined) return null
  const valor = Number(precoPix)
  if (Number.isNaN(valor)) return null
  return `PIX ${valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
}

/**
 * Resumo compacto de variações + estoque, respeitando a mesma precedência já
 * validada no sincronizador: sell_without_stock (nível produto) manda sobre
 * a soma de stock_quantity; 0 é estoque real, não ausência de dado; nunca
 * interpreta 9999 (nunca é gravado no Supabase — ver docs/integrations/BAGY-SYNC.md).
 *
 * @param {boolean|null} sellWithoutStock — products.sell_without_stock
 * @param {{variationCount: number, stockTotal: number, hasStockData: boolean}|undefined} aggregate — de variationAggregates.get(productId)
 * @returns {{variationsLine: string, stockLine: string}}
 */
export function formatStockSummary(sellWithoutStock, aggregate) {
  if (!aggregate || aggregate.variationCount === 0) {
    return { variationsLine: 'Sem variações', stockLine: '—' }
  }

  const variationsLine = aggregate.variationCount === 1 ? '1 variação' : `${aggregate.variationCount} variações`

  if (sellWithoutStock === true) {
    return { variationsLine, stockLine: 'Venda sem estoque' }
  }

  return { variationsLine, stockLine: `${aggregate.stockTotal} un.` }
}
