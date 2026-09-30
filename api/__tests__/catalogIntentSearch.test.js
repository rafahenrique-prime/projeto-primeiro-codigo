import { describe, it, expect, vi } from 'vitest'
import {
  normalizarBuscaCatalogo,
  extrairKeywordsCatalogo,
  extractRequestedColor,
  extractRequestedSize,
  extractRequestedBrand,
  productMatchesRequestedBrand,
  calcularSimilaridadeCatalogo,
  catalogIntentRequestsAvailability,
  formatarRespostaGPT,
} from '../webhook.js'
import { fetchShadowCatalogEvidence } from '../_gabrielaContextService.js'

const SUPABASE_CONFIG = {
  baseUrl: 'https://mock-project.supabase.co',
  headers: { apikey: 'mock-key' },
}

function response(json, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => json,
  }
}

describe('Catalog intent — normalização e filtros', () => {
  const pergunta = 'Vocês têm camisetas pretas tamanho M? Quais marcas, preços e opções estão disponíveis?'

  it('normaliza plural e gênero sem perder a intenção comercial', () => {
    expect(normalizarBuscaCatalogo('Camisetas Pretas')).toBe('camiseta preto')
  })

  it('remove palavras de intenção e tamanho do ranking textual', () => {
    expect(extrairKeywordsCatalogo(pergunta)).toBe('camiseta preto')
    expect(extractRequestedSize(pergunta)).toBe('M')
    expect(extractRequestedColor(pergunta)).toBe('preto')
    expect(catalogIntentRequestsAvailability(pergunta)).toBe(true)
  })

  it('prioriza camiseta preta direta sobre nome longo que só compartilha os mesmos termos', () => {
    const q = extrairKeywordsCatalogo(pergunta)
    const boss = calcularSimilaridadeCatalogo(q, 'Camiseta Boss Preta')
    const onRunning = calcularSimilaridadeCatalogo(q, 'Camisetas On Running Treino - Preta')

    expect(boss).toBeGreaterThan(onRunning)
  })


  it('marca explícita vira restrição estruturada e usa a marca mais específica', () => {
    const products = [
      { nome: 'Camiseta Boss Preta', marca: 'BOSS' },
      { nome: 'Camiseta Oversize Boss Preta', marca: 'HUGO' },
      { nome: 'Camiseta Calvin Klein Preta', marca: 'Calvin Klein' },
      { nome: 'Camisetas On Running Treino - Preta', marca: 'On Running' },
      { nome: 'Camiseta Diesel Preta', marca: 'Diesel' },
    ]

    expect(extractRequestedBrand(
      'Camiseta Calvin Klein preta tamanho M: disponibilidade confirmada e valor',
      products
    )).toBe('Calvin Klein')

    expect(extractRequestedBrand(
      'Camiseta On Running preta tamanho M: disponibilidade confirmada e preço',
      products
    )).toBe('On Running')

    expect(extractRequestedBrand(
      'Camiseta Boss Preta tamanho P: disponibilidade confirmada, preço, link e imagem',
      products
    )).toBe('BOSS')
  })

  it('filtro de marca aceita o nome da marca no título e rejeita outras marcas', () => {
    const requestedBrand = 'BOSS'

    expect(productMatchesRequestedBrand(
      { nome: 'Camiseta Boss Preta', marca: 'BOSS' },
      requestedBrand
    )).toBe(true)

    // Caso real: Oversize Boss está com marca HUGO, mas "Boss" está no nome.
    expect(productMatchesRequestedBrand(
      { nome: 'Camiseta Oversize Boss Preta', marca: 'HUGO' },
      requestedBrand
    )).toBe(true)

    expect(productMatchesRequestedBrand(
      { nome: 'Camiseta Básica Premium Calvin Klein', marca: 'Calvin Klein' },
      requestedBrand
    )).toBe(false)

    expect(productMatchesRequestedBrand(
      { nome: 'Camiseta Diesel Básica Premium', marca: 'Diesel' },
      requestedBrand
    )).toBe(false)
  })

  it('remove ruído acrescentado pela ação GPTMaker sem apagar produto/marca/cor', () => {
    expect(
      extrairKeywordsCatalogo(
        'Camiseta Boss Preta tamanho P: disponibilidade confirmada, preço, link e imagem'
      )
    ).toBe('camiseta boss preto')

    expect(
      extrairKeywordsCatalogo(
        'Listar camisetas Diesel disponíveis no tamanho M, com nomes e preços confirmados'
      )
    ).toBe('camiseta diesel')
  })
})

describe('Catalog evidence — tamanho, cor e disponibilidade', () => {
  const products = [
    { id: 'boss', nome: 'Camiseta Boss Preta', selling_out_of_stock: false },
    { id: 'on', nome: 'Camisetas On Running Treino - Preta', selling_out_of_stock: true },
    { id: 'white', nome: 'Camiseta Boss Branca', selling_out_of_stock: false },
    { id: 'no-m', nome: 'Camiseta Diesel Preta', selling_out_of_stock: false },
  ]

  it('confirma fatos por variação e respeita selling_out_of_stock', async () => {
    const fetchImpl = vi.fn(async (url) => {
      expect(url).toContain('/rest/v1/shadow_product_variations?')
      expect(url).toContain('shadow_product_id=in.')
      return response([
        { shadow_product_id: 'boss', stock_quantity: 5, attributes: { tamanho: 'M' } },
        { shadow_product_id: 'boss', stock_quantity: 4, attributes: { tamanho: 'G' } },
        { shadow_product_id: 'on', stock_quantity: null, attributes: { tamanho: 'M' } },
        { shadow_product_id: 'white', stock_quantity: 3, attributes: { tamanho: 'M' } },
        { shadow_product_id: 'no-m', stock_quantity: 2, attributes: { tamanho: 'G' } },
      ])
    })

    const result = await fetchShadowCatalogEvidence(
      {
        products,
        requestedSize: 'M',
        requestedColor: 'preto',
      },
      {
        supabaseConfig: SUPABASE_CONFIG,
        fetchImpl,
      }
    )

    expect(result.ok).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    expect(result.facts.boss).toMatchObject({
      status: 'AVAILABLE',
      reason: 'SIZE_IN_STOCK',
      sizeConfirmed: true,
      colorConfirmed: true,
    })

    expect(result.facts.on).toMatchObject({
      status: 'UNKNOWN',
      reason: 'STOCK_NOT_DETERMINISTIC',
      sizeConfirmed: true,
      colorConfirmed: true,
    })

    expect(result.facts.white).toMatchObject({
      status: 'UNKNOWN',
      reason: 'COLOR_NOT_FOUND',
      sizeConfirmed: true,
      colorConfirmed: false,
    })

    expect(result.facts['no-m']).toMatchObject({
      status: 'UNKNOWN',
      reason: 'SIZE_NOT_FOUND',
      sizeConfirmed: false,
      colorConfirmed: true,
    })
  })

  it('falha fechada quando a evidência de variação não pode ser consultada', async () => {
    const fetchImpl = vi.fn(async () => response([], false, 503))

    const result = await fetchShadowCatalogEvidence(
      { products, requestedSize: 'M', requestedColor: 'preto' },
      { supabaseConfig: SUPABASE_CONFIG, fetchImpl }
    )

    expect(result.ok).toBe(false)
    expect(result.error_code).toBe('source_unavailable')
    expect(result.facts).toEqual({})
  })
})

describe('GPT payload — disponibilidade nunca é inventada', () => {
  it('UNKNOWN vira NÃO CONFIRMADA', () => {
    const payload = formatarRespostaGPT({
      pergunta: 'camiseta preta',
      dados: {
        produtos: [{
          nome: 'Camiseta Teste Preta',
          categoria: 'Camisetas',
          preco: 'R$ 100,00',
          imagem: null,
          link: null,
          score: 80,
          availabilityStatus: 'UNKNOWN',
          availabilityReason: 'STOCK_NOT_DETERMINISTIC',
        }],
        knowledge: null,
        totalVariacoes: 1,
        variacoesRestantes: 0,
      },
    })

    expect(payload.dados.produtos[0].disponibilidade).toBe('NÃO CONFIRMADA')
    expect(payload.dados.informacao_adicional).toContain('REGRA DE DISPONIBILIDADE')
  })
})
