/**
 * api/_shadowContextService.js
 *
 * Camada de LEITURA experimental do BANCO VIRTUAL SOMBRA (Frente A). Lê
 * SOMENTE `shadow_products`/`shadow_product_variations` — nunca
 * `products`/`product_variations`, nunca escreve em nada, nunca chama a
 * Bagy/Dooca (o shadow já foi carregado antes, por `scripts/shadow-sync.mjs`).
 *
 * Reaproveita literalmente `formatarProdutoComercial` (a mesma função usada
 * em produção por `api/webhook.js`/`api/_toolConsultarProduto.js`) — a única
 * lógica nova aqui é a adaptação de 3 nomes de campo de parcelamento, porque
 * o shadow usa nomenclatura deliberadamente diferente da tabela `products`
 * (ver plano modo-planejar-merry-kite.md, PARTE 11 e PARTE 22). Nenhuma
 * regra de preço/PIX/tabela/parcelamento/estoque é recalculada aqui.
 *
 * Prefixo "_" — helper privado, mesmo padrão de _gabrielaContextService.js,
 * _bagySyncClient.js etc.
 */

import { formatarProdutoComercial } from './_gabrielaContextService.js'

/**
 * Só renomeia — nunca recalcula. O shadow usa `parcelamento_padrao_valor`,
 * `parcelamento_max_valor`, `parcelamento_max_com_juros`; formatarProdutoComercial
 * espera `parcelamento_padrao_valor_parcela`, `parcelamento_valor_parcela`,
 * `parcelamento_com_juros` (nomes herdados do schema de `products`). Se um
 * campo estiver ausente/null no shadow, continua ausente/null depois da
 * adaptação — nunca criamos um valor que não veio da fonte.
 */
export function adaptarShadowParaContratoComercial(shadowRow) {
  return {
    ...shadowRow,
    parcelamento_padrao_valor_parcela: shadowRow.parcelamento_padrao_valor,
    parcelamento_valor_parcela: shadowRow.parcelamento_max_valor,
    parcelamento_com_juros: shadowRow.parcelamento_max_com_juros,
  }
}

/**
 * Busca 1 produto no shadow por bagy_product_id, link ou nome (nesta ordem
 * de prioridade — o primeiro identificador informado vence). Lê também as
 * variações associadas. Retorna null se não encontrar — nunca inventa.
 */
export async function fetchShadowProduct({ bagyProductId, link, nome }, { supabaseConfig }) {
  const { baseUrl, headers } = supabaseConfig
  let filtro
  if (bagyProductId != null) filtro = `bagy_product_id=eq.${encodeURIComponent(bagyProductId)}`
  else if (link) filtro = `link=eq.${encodeURIComponent(link)}`
  else if (nome) filtro = `nome=ilike.${encodeURIComponent(`%${nome}%`)}`
  else throw new Error('fetchShadowProduct precisa de bagyProductId, link ou nome')

  const resProduto = await fetch(`${baseUrl}/rest/v1/shadow_products?${filtro}&limit=1`, { headers })
  if (!resProduto.ok) throw new Error(`shadow_products: ${resProduto.status} ${await resProduto.text()}`)
  const linhas = await resProduto.json()
  if (linhas.length === 0) return null
  const produto = linhas[0]

  const resVariacoes = await fetch(
    `${baseUrl}/rest/v1/shadow_product_variations?shadow_product_id=eq.${produto.id}`,
    { headers }
  )
  if (!resVariacoes.ok) throw new Error(`shadow_product_variations: ${resVariacoes.status} ${await resVariacoes.text()}`)
  const variacoes = await resVariacoes.json()

  return { produto, variacoes }
}

/**
 * Monta a resposta no mesmo formato comercial que a Gaby já recebe hoje
 * (via formatarProdutoComercial), mais `variacoes` (extra — não existe no
 * contrato de produção, mas não quebra nada por ser uma rota nova e aditiva).
 */
export function montarRespostaExperimental({ produto, variacoes }) {
  const adaptado = adaptarShadowParaContratoComercial(produto)
  return {
    nome: produto.nome,
    preco: produto.preco != null ? `R$ ${Number(produto.preco).toFixed(2).replace('.', ',')}` : null,
    imagem: produto.imagem_principal,
    link: produto.link,
    disponibilidade: 'SIM',
    ...formatarProdutoComercial(adaptado),
    variacoes: variacoes.map((v) => ({
      bagyVariationId: v.bagy_variation_id,
      atributos: v.attributes,
      estoque: v.stock_quantity,
      balanceRaw: v.balance_raw,
    })),
    _fonte: 'shadow_products/shadow_product_variations',
  }
}

/**
 * Orquestrador único chamado pelo case do system-tools.js. Nunca toca
 * products/product_variations, nunca escreve em nada.
 */
export async function consultarShadowExperimental(params, { supabaseConfig }) {
  const { bagyProductId, link, nome } = params || {}
  if (bagyProductId == null && !link && !nome) {
    return { httpStatus: 400, body: { sucesso: false, erro: 'Informe bagyProductId, link ou nome.' } }
  }

  const resultado = await fetchShadowProduct({ bagyProductId, link, nome }, { supabaseConfig })
  if (!resultado) {
    return { httpStatus: 200, body: { sucesso: true, encontrado: false, produto: null } }
  }

  return {
    httpStatus: 200,
    body: { sucesso: true, encontrado: true, produto: montarRespostaExperimental(resultado) },
  }
}
