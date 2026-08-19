import { describe, it, expect, vi } from 'vitest'
import {
  adaptarShadowParaContratoComercial,
  fetchShadowProduct,
  montarRespostaExperimental,
  consultarShadowExperimental,
} from '../_shadowContextService.js'
import { formatarProdutoComercial } from '../_gabrielaContextService.js'

function shadowProdutoFixture(overrides = {}) {
  return {
    id: 'uuid-shadow-1',
    bagy_product_id: 10090946,
    nome: 'Boné Importado Diesel Preto',
    link: 'https://www.primestoremen.com.br/bone-importado-diesel-preto',
    preco: 218,
    preco_tabela: 599,
    preco_pix: 207.1,
    parcelamento_padrao_vezes: 4,
    parcelamento_padrao_valor: 54.5,
    parcelamento_padrao_com_juros: false,
    parcelamento_max_vezes: 12,
    parcelamento_max_valor: 21.63,
    parcelamento_max_com_juros: true,
    imagem_principal: 'https://cdn.dooca.store/img-1.jpg',
    ...overrides,
  }
}

describe('adaptarShadowParaContratoComercial — só renomeia, nunca recalcula', () => {
  it('os 3 campos de parcelamento chegam corretamente sob os nomes que formatarProdutoComercial espera', () => {
    const adaptado = adaptarShadowParaContratoComercial(shadowProdutoFixture())
    expect(adaptado.parcelamento_padrao_valor_parcela).toBe(54.5)
    expect(adaptado.parcelamento_valor_parcela).toBe(21.63)
    expect(adaptado.parcelamento_com_juros).toBe(true)
  })

  it('preserva os campos originais do shadow (não remove nada, só acrescenta os renomeados)', () => {
    const adaptado = adaptarShadowParaContratoComercial(shadowProdutoFixture())
    expect(adaptado.parcelamento_padrao_valor).toBe(54.5)
    expect(adaptado.parcelamento_max_valor).toBe(21.63)
    expect(adaptado.parcelamento_max_com_juros).toBe(true)
  })

  it('campo ausente no shadow continua ausente depois da adaptação — nunca cria fallback', () => {
    const row = shadowProdutoFixture({
      parcelamento_max_vezes: null,
      parcelamento_max_valor: null,
      parcelamento_max_com_juros: null,
    })
    const adaptado = adaptarShadowParaContratoComercial(row)
    expect(adaptado.parcelamento_valor_parcela).toBeNull()
    expect(adaptado.parcelamento_com_juros).toBeNull()
  })
})

describe('formatarProdutoComercial aplicada ao shadow adaptado — mesmo contrato da produção', () => {
  it('gera exatamente o mesmo formato que a produção gera para o mesmo produto real', () => {
    // Fixture de products (mesmo produto, nomes de campo do schema `products`)
    const produtoAtual = {
      preco_tabela: 599,
      preco_pix: 207.1,
      parcelamento_padrao_vezes: 4,
      parcelamento_padrao_valor_parcela: 54.5,
      parcelamento_padrao_com_juros: false,
      parcelamento_max_vezes: 12,
      parcelamento_valor_parcela: 21.63,
      parcelamento_com_juros: true,
    }
    const resultadoAtual = formatarProdutoComercial(produtoAtual)

    const shadowAdaptado = adaptarShadowParaContratoComercial(shadowProdutoFixture())
    const resultadoShadow = formatarProdutoComercial(shadowAdaptado)

    expect(resultadoShadow).toEqual(resultadoAtual)
  })

  it('sem parcelamento máximo no shadow: mesmo comportamento de omissão que a produção', () => {
    const row = shadowProdutoFixture({ parcelamento_max_vezes: null, parcelamento_max_valor: null, parcelamento_max_com_juros: null })
    const resultado = formatarProdutoComercial(adaptarShadowParaContratoComercial(row))
    expect(resultado).not.toHaveProperty('parcelamentoMaxVezes')
    expect(resultado).not.toHaveProperty('parcelamentoMaxValor')
  })
})

describe('fetchShadowProduct — acesso exclusivo às tabelas shadow_*', () => {
  it('nunca chama URL de products/product_variations, só shadow_products/shadow_product_variations', async () => {
    const calls = []
    const fetchMock = vi.fn(async (url) => {
      calls.push(String(url))
      if (String(url).includes('shadow_products?')) {
        return { ok: true, json: async () => [{ id: 'uuid-1', bagy_product_id: 10090946, nome: 'Boné' }] }
      }
      return { ok: true, json: async () => [{ id: 'v1', bagy_variation_id: 1, attributes: {}, stock_quantity: 3 }] }
    })
    global.fetch = fetchMock

    await fetchShadowProduct(
      { bagyProductId: 10090946 },
      { supabaseConfig: { baseUrl: 'https://fake.supabase.co', headers: {} } }
    )

    expect(calls).toHaveLength(2)
    for (const url of calls) {
      expect(url).toMatch(/\/shadow_product(s|_variations)\??/)
      expect(url).not.toMatch(/\/products\?/)
      expect(url).not.toMatch(/\/product_variations\?/)
    }
  })

  it('retorna null quando não encontra — nunca inventa produto', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => [] }))
    const resultado = await fetchShadowProduct(
      { bagyProductId: 999999999 },
      { supabaseConfig: { baseUrl: 'https://fake.supabase.co', headers: {} } }
    )
    expect(resultado).toBeNull()
  })
})

describe('montarRespostaExperimental — formato de saída', () => {
  it('inclui os campos comerciais + variações, sem inventar disponibilidade/estoque', () => {
    const resposta = montarRespostaExperimental({
      produto: shadowProdutoFixture(),
      variacoes: [{ bagy_variation_id: 1, attributes: { tamanho: 'M' }, stock_quantity: 3, balance_raw: 3 }],
    })
    expect(resposta.nome).toBe('Boné Importado Diesel Preto')
    expect(resposta.preco).toBe('R$ 218,00')
    expect(resposta.precoPix).toBe('R$ 207,10')
    expect(resposta.precoTabela).toBe('R$ 599,00')
    expect(resposta.parcelamentoPadraoVezes).toBe(4)
    expect(resposta.parcelamentoMaxVezes).toBe(12)
    expect(resposta.variacoes).toEqual([{ bagyVariationId: 1, atributos: { tamanho: 'M' }, estoque: 3, balanceRaw: 3 }])
    expect(resposta._fonte).toBe('shadow_products/shadow_product_variations')
  })
})

describe('consultarShadowExperimental — orquestrador, sempre via shadow', () => {
  it('encontrado=false quando o produto não existe no shadow, sem erro', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => [] }))
    const resultado = await consultarShadowExperimental(
      { bagyProductId: 1 },
      { supabaseConfig: { baseUrl: 'https://fake.supabase.co', headers: {} } }
    )
    expect(resultado.httpStatus).toBe(200)
    expect(resultado.body).toEqual({ sucesso: true, encontrado: false, produto: null })
  })

  it('400 quando nenhum identificador é informado', async () => {
    const resultado = await consultarShadowExperimental({}, { supabaseConfig: { baseUrl: 'x', headers: {} } })
    expect(resultado.httpStatus).toBe(400)
  })
})
