// Catálogo V1 — derivação de status (Fase 2)
//
// Função pura, sem I/O, sem React. Recebe 1 produto (já carregado por
// catalogV1Data.js) + o array de exceções abertas daquele link (pode ter
// mais de uma — ver catalogV1Data.js:buildExceptionsByLink) e devolve o
// status a exibir. bagy_product_id é o sinal principal de origem — nunca
// `source` sozinho (pode ficar desatualizado em edição manual de um
// produto já sincronizado).

/**
 * @param {object} product — linha de `products` (precisa de bagy_product_id)
 * @param {Array<{tipo: string}>} exceptionsForLink — todas as exceções
 *   abertas daquele link (0, 1 ou mais)
 * @returns {{status: string, label: string, severity: 'error'|'warning'|'success'|'neutral', reason: string}}
 */
export function derivarStatusCatalogo(product, exceptionsForLink = []) {
  const tipos = new Set(exceptionsForLink.map((e) => e.tipo))

  if (tipos.has('404')) {
    return { status: 'not_found', label: 'Não encontrado', severity: 'error', reason: '404 aberto na fila de exceções' }
  }
  if (tipos.has('duplicate_conflict')) {
    return { status: 'conflict', label: 'Conflito', severity: 'error', reason: 'duplicate_conflict aberto na fila de exceções' }
  }
  if (tipos.has('pagina_invalida')) {
    return { status: 'exception', label: 'Exceção', severity: 'warning', reason: 'pagina_invalida aberta na fila de exceções' }
  }
  if (exceptionsForLink.length > 0) {
    // qualquer outro tipo de exceção aberta não coberto acima
    return { status: 'exception', label: 'Exceção', severity: 'warning', reason: `exceção aberta (${[...tipos].join(', ')})` }
  }
  if (product?.bagy_product_id != null) {
    return { status: 'synced', label: 'Sincronizado', severity: 'success', reason: 'bagy_product_id preenchido, sem exceção aberta' }
  }
  return { status: 'manual', label: 'Manual', severity: 'neutral', reason: 'bagy_product_id ausente' }
}
