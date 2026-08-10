/**
 * api/_bagySyncCompare.js
 *
 * Comparação pura entre o que já está no Supabase e o que o mapper propôs.
 * Não decide se escreve ou não — só descreve a diferença, campo a campo,
 * para o orquestrador (ou o dry-run) usar.
 */

const CAMPOS_COMPARAVEIS_PRODUCT = [
  'bagy_product_id', 'nome', 'link', 'categoria', 'categoria_breadcrumb',
  'bagy_category_id', 'preco', 'preco_pix', 'imagem', 'descricao', 'marca',
  'sell_without_stock', 'source',
]

export function diffProductFields(current, mapped) {
  const diffs = {}
  for (const campo of CAMPOS_COMPARAVEIS_PRODUCT) {
    if (!(campo in mapped)) continue
    const antes = current ? current[campo] : undefined
    const depois = mapped[campo]
    if (JSON.stringify(antes) !== JSON.stringify(depois)) {
      diffs[campo] = { antes, depois }
    }
  }
  return diffs
}

const CAMPOS_COMPARAVEIS_VARIATION = [
  'attributes', 'preco', 'preco_compare', 'stock_quantity', 'sell_without_stock', 'imagem_principal',
]

/**
 * Compara as variações mapeadas contra as já existentes no Supabase para o
 * mesmo produto, casando por bagy_variation_id (chave estável).
 */
export function diffVariations(existingRows, mappedRows) {
  const existingByBagyId = new Map(existingRows.map((r) => [r.bagy_variation_id, r]))
  const toInsert = []
  const toUpdate = []
  const unchanged = []

  for (const mapped of mappedRows) {
    const existing = existingByBagyId.get(mapped.bagy_variation_id)
    if (!existing) {
      toInsert.push(mapped)
      continue
    }
    const diffs = {}
    for (const campo of CAMPOS_COMPARAVEIS_VARIATION) {
      const antes = existing[campo]
      const depois = mapped[campo]
      if (JSON.stringify(antes) !== JSON.stringify(depois)) diffs[campo] = { antes, depois }
    }
    if (Object.keys(diffs).length > 0) toUpdate.push({ id: existing.id, bagy_variation_id: mapped.bagy_variation_id, diffs, mapped })
    else unchanged.push({ id: existing.id, bagy_variation_id: mapped.bagy_variation_id })
  }

  return { toInsert, toUpdate, unchanged }
}
