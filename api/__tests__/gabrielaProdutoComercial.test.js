import { describe, it, expect } from 'vitest'
import { formatarProdutoComercial } from '../_gabrielaContextService.js'
import { formatarRespostaGPT } from '../webhook.js'
import { buscarERanquearProdutos } from '../_toolConsultarProduto.js'

// Fixtures baseadas nos valores reais já validados em produção (Fase 1/1.1):
// Boné Importado Diesel Preto — venda R$218, tabela R$599, PIX R$207,10,
// padrão 4x de R$54,50 sem juros, máximo 12x de R$21,63 com juros.
function baseProduto(overrides = {}) {
  return {
    id: 1,
    nome: 'Boné Importado Diesel Preto',
    categoria: 'Acessórios',
    preco: 'R$ 218,00',
    imagem: 'https://x/img.jpg',
    link: 'https://www.primestoremen.com.br/bone-importado-diesel-preto',
    codigo: 'BONE-DIESEL',
    ...overrides,
  }
}

describe('formatarProdutoComercial — Fase 2A', () => {
  it('Caso A — apenas preço de venda: nenhum campo comercial novo aparece', () => {
    const produto = baseProduto()
    expect(formatarProdutoComercial(produto)).toEqual({})
  })

  it('Caso B — promoção: precoTabela aparece, independente de preco', () => {
    const produto = baseProduto({ preco_tabela: 599 })
    const resultado = formatarProdutoComercial(produto)
    expect(resultado.precoTabela).toBe('R$ 599,00')
    expect(resultado).not.toHaveProperty('preco')
    expect(resultado).not.toHaveProperty('precoPix')
  })

  it('Caso C — PIX: precoPix correto, sem cálculo (não é percentual de preco)', () => {
    const produto = baseProduto({ preco_pix: 207.1 })
    const resultado = formatarProdutoComercial(produto)
    expect(resultado.precoPix).toBe('R$ 207,10')
  })

  it('Caso D — parcelamento padrão: quantidade, valor e juros corretos', () => {
    const produto = baseProduto({
      parcelamento_padrao_vezes: 4,
      parcelamento_padrao_valor_parcela: 54.5,
      parcelamento_padrao_com_juros: false,
    })
    const resultado = formatarProdutoComercial(produto)
    expect(resultado.parcelamentoPadraoVezes).toBe(4)
    expect(resultado.parcelamentoPadraoValor).toBe('R$ 54,50')
    expect(resultado.parcelamentoPadraoComJuros).toBe(false)
    expect(resultado).not.toHaveProperty('parcelamentoMaxVezes')
  })

  it('Caso E — parcelamento máximo: quantidade, valor e juros corretos', () => {
    const produto = baseProduto({
      parcelamento_max_vezes: 12,
      parcelamento_valor_parcela: 21.63,
      parcelamento_com_juros: true,
    })
    const resultado = formatarProdutoComercial(produto)
    expect(resultado.parcelamentoMaxVezes).toBe(12)
    expect(resultado.parcelamentoMaxValor).toBe('R$ 21,63')
    expect(resultado.parcelamentoMaxComJuros).toBe(true)
    expect(resultado).not.toHaveProperty('parcelamentoPadraoVezes')
  })

  it('Caso F — tudo simultâneo: tabela + PIX + padrão + máximo coexistem sem cruzamento', () => {
    const produto = baseProduto({
      preco_tabela: 599,
      preco_pix: 207.1,
      parcelamento_padrao_vezes: 4,
      parcelamento_padrao_valor_parcela: 54.5,
      parcelamento_padrao_com_juros: false,
      parcelamento_max_vezes: 12,
      parcelamento_valor_parcela: 21.63,
      parcelamento_com_juros: true,
    })
    const resultado = formatarProdutoComercial(produto)
    expect(resultado).toEqual({
      precoTabela: 'R$ 599,00',
      precoPix: 'R$ 207,10',
      parcelamentoPadraoVezes: 4,
      parcelamentoPadraoValor: 'R$ 54,50',
      parcelamentoPadraoComJuros: false,
      parcelamentoMaxVezes: 12,
      parcelamentoMaxValor: 'R$ 21,63',
      parcelamentoMaxComJuros: true,
    })
    // nenhuma das 4 grandezas pode ter vazado valor de outra
    const valores = [resultado.precoTabela, resultado.precoPix, resultado.parcelamentoPadraoValor, resultado.parcelamentoMaxValor]
    expect(new Set(valores).size).toBe(4)
  })

  it('Caso G — null: campos null/ausentes não aparecem no payload (nunca chave com valor null)', () => {
    const produto = baseProduto({
      preco_tabela: null,
      preco_pix: null,
      parcelamento_padrao_vezes: null,
      parcelamento_max_vezes: null,
    })
    const resultado = formatarProdutoComercial(produto)
    expect(resultado).toEqual({})
    expect(Object.values(resultado)).not.toContain(null)
  })

  it('Caso G — parcelamento parcialmente ausente (só vezes, sem valor): grupo inteiro fica de fora', () => {
    const produto = baseProduto({ parcelamento_padrao_vezes: 4 })
    const resultado = formatarProdutoComercial(produto)
    expect(resultado).not.toHaveProperty('parcelamentoPadraoVezes')
  })

  it('Caso H — mudança futura da Dooca (ex.: 6x em vez de 4x): reflete o valor recebido, prova ausência de hardcode', () => {
    const produto = baseProduto({
      parcelamento_padrao_vezes: 6,
      parcelamento_padrao_valor_parcela: 36.33,
      parcelamento_padrao_com_juros: false,
    })
    const resultado = formatarProdutoComercial(produto)
    expect(resultado.parcelamentoPadraoVezes).toBe(6)
    expect(resultado.parcelamentoPadraoValor).toBe('R$ 36,33')
  })

  it('produto ausente/undefined nunca lança — degrada para objeto vazio', () => {
    expect(() => formatarProdutoComercial(undefined)).not.toThrow()
    expect(formatarProdutoComercial(undefined)).toEqual({})
  })
})

describe('Caso I — consistência webhook × consultarProduto para o mesmo produto', () => {
  it('formatarRespostaGPT (webhook) e buscarERanquearProdutos (tool) entregam o mesmo subconjunto comercial', () => {
    const produtoBruto = baseProduto({
      score: 100,
      preco_tabela: 599,
      preco_pix: 207.1,
      parcelamento_padrao_vezes: 4,
      parcelamento_padrao_valor_parcela: 54.5,
      parcelamento_padrao_com_juros: false,
      parcelamento_max_vezes: 12,
      parcelamento_valor_parcela: 21.63,
      parcelamento_com_juros: true,
    })

    // Caminho webhook: dadosBusca.dados.produtos já no formato que
    // searchKnowledge produz hoje (spread do produto bruto).
    const dadosBusca = { pergunta: 'boné diesel', dados: { produtos: [produtoBruto] } }
    const respostaWebhook = formatarRespostaGPT(dadosBusca)
    const produtoWebhook = respostaWebhook.dados.produtos[0]

    // Caminho tool: buscarERanquearProdutos recebe o catálogo cru direto.
    const { results } = buscarERanquearProdutos([produtoBruto], 'boné diesel')
    const produtoTool = results[0]

    const camposComerciais = [
      'precoTabela', 'precoPix',
      'parcelamentoPadraoVezes', 'parcelamentoPadraoValor', 'parcelamentoPadraoComJuros',
      'parcelamentoMaxVezes', 'parcelamentoMaxValor', 'parcelamentoMaxComJuros',
    ]
    for (const campo of camposComerciais) {
      expect(produtoWebhook[campo]).toEqual(produtoTool[campo])
    }
    // preco (contrato antigo) também precisa bater, mesmo com fallbacks diferentes por design
    expect(produtoWebhook.preco).toBe(produtoBruto.preco)
    expect(produtoTool.preco).toBe(produtoBruto.preco)
  })

  it('produto sem nenhum dado comercial novo: os dois caminhos concordam em omitir os mesmos campos', () => {
    const produtoBruto = baseProduto({ score: 80 })
    const dadosBusca = { pergunta: 'boné diesel', dados: { produtos: [produtoBruto] } }
    const produtoWebhook = formatarRespostaGPT(dadosBusca).dados.produtos[0]
    const produtoTool = buscarERanquearProdutos([produtoBruto], 'boné diesel').results[0]

    for (const campo of ['precoTabela', 'precoPix', 'parcelamentoPadraoVezes', 'parcelamentoMaxVezes']) {
      expect(produtoWebhook).not.toHaveProperty(campo)
      expect(produtoTool).not.toHaveProperty(campo)
    }
  })
})
