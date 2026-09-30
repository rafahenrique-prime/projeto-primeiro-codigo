import { describe, it, expect, vi } from 'vitest'
import { fetchProductsCatalog, formatarProdutoComercial, fetchShadowProductAvailability } from '../_gabrielaContextService.js'

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

describe('fetchProductsCatalog — Mirror/Shadow como fonte principal', () => {
  it('lê shadow_products ativos e normaliza o contrato para a Gaby', async () => {
    const fetchImpl = vi.fn(async (url) => {
      expect(url).toContain('/rest/v1/shadow_products?')
      expect(url).toContain('ativo=eq.true')
      expect(url).toContain('categoria_nome')
      expect(url).toContain('imagem_principal')
      return response([{
        id: 'shadow-1',
        bagy_product_id: 10601039,
        nome: 'Óculos Dolce Gabbana',
        categoria_nome: 'Óculos',
        marca: 'DOLCE GABBANA',
        preco: 199,
        preco_pix: 187.06,
        preco_tabela: 199,
        imagem_principal: 'https://img/oculos.jpg',
        link: 'https://loja/oculos-dolce-gabbana',
        codigo: 'DG-001',
        parcelamento_padrao_vezes: 4,
        parcelamento_padrao_valor: 49.75,
        parcelamento_padrao_com_juros: false,
      }])
    })

    const result = await fetchProductsCatalog({
      supabaseConfig: SUPABASE_CONFIG,
      fetchImpl,
    })

    expect(result.ok).toBe(true)
    expect(result.source).toBe('shadow_products')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(result.products[0]).toMatchObject({
      bagy_product_id: 10601039,
      nome: 'Óculos Dolce Gabbana',
      categoria: 'Óculos',
      marca: 'DOLCE GABBANA',
      preco: 'R$ 199,00',
      preco_pix: 187.06,
      imagem: 'https://img/oculos.jpg',
      parcelamento_padrao_valor_parcela: 49.75,
    })
    expect(formatarProdutoComercial(result.products[0])).toMatchObject({
      precoPix: 'R$ 187,06',
      parcelamentoPadraoVezes: 4,
      parcelamentoPadraoValor: 'R$ 49,75',
      parcelamentoPadraoComJuros: false,
    })
  })

  it('registra telemetria explícita catalog_source=shadow_products', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const fetchImpl = vi.fn(async () => response([]))

      await fetchProductsCatalog({
        supabaseConfig: SUPABASE_CONFIG,
        fetchImpl,
      })

      const serialized = logSpy.mock.calls.map((args) => args.join(' ')).join('\n')
      expect(serialized).toContain('[Catalog][source]')
      expect(serialized).toContain('"catalog_source":"shadow_products"')
      expect(serialized).toContain('"ok":true')
    } finally {
      logSpy.mockRestore()
    }
  })

  it('Mirror vazio é resposta válida e NÃO consulta products legado', async () => {
    const fetchImpl = vi.fn(async () => response([]))

    const result = await fetchProductsCatalog({
      supabaseConfig: SUPABASE_CONFIG,
      fetchImpl,
    })

    expect(result.ok).toBe(true)
    expect(result.source).toBe('shadow_products')
    expect(result.products).toEqual([])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('Mirror falhou: fail-closed e NUNCA consulta products legado', async () => {
    const fetchImpl = vi.fn(async (url) => {
      expect(url).toContain('/rest/v1/shadow_products?')
      expect(url).not.toContain('/rest/v1/products?')
      return response([], false, 503)
    })

    const result = await fetchProductsCatalog({
      supabaseConfig: SUPABASE_CONFIG,
      fetchImpl,
    })

    expect(result.ok).toBe(false)
    expect(result.source).toBe('shadow_products')
    expect(result.error_code).toBe('source_unavailable')
    expect(result.products).toEqual([])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})


describe('fetchShadowProductAvailability — fatos de estoque', () => {
  it('confirma AVAILABLE quando há variação com estoque positivo', async () => {
    const fetchImpl = vi.fn(async (url) => {
      expect(url).toContain('/rest/v1/shadow_product_variations?')
      expect(url).toContain('shadow_product_id=eq.shadow-1')
      return response([{ stock_quantity: 3, attributes: {}, selling_out_of_stock: null, balance_raw: null }])
    })

    const result = await fetchShadowProductAvailability(
      { shadowProductId: 'shadow-1' },
      { supabaseConfig: SUPABASE_CONFIG, fetchImpl }
    )

    expect(result).toMatchObject({
      status: 'AVAILABLE',
      reason: 'PRODUCT_IN_STOCK',
    })
  })

  it('confirma tamanho específico quando a variação correspondente tem estoque', async () => {
    const fetchImpl = vi.fn(async () => response([
      { stock_quantity: 0, attributes: { Tamanho: 'M' } },
      { stock_quantity: 2, attributes: { Tamanho: 'G' } },
    ]))

    const result = await fetchShadowProductAvailability(
      { shadowProductId: 'shadow-1', requestedSize: 'G' },
      { supabaseConfig: SUPABASE_CONFIG, fetchImpl }
    )

    expect(result).toMatchObject({
      status: 'AVAILABLE',
      reason: 'SIZE_IN_STOCK',
      requestedSize: 'G',
    })
  })

  it('não inventa disponibilidade quando o tamanho não existe', async () => {
    const fetchImpl = vi.fn(async () => response([
      { stock_quantity: 2, attributes: { Tamanho: 'M' } },
    ]))

    const result = await fetchShadowProductAvailability(
      { shadowProductId: 'shadow-1', requestedSize: 'GG' },
      { supabaseConfig: SUPABASE_CONFIG, fetchImpl }
    )

    expect(result).toMatchObject({
      status: 'UNKNOWN',
      reason: 'SIZE_NOT_FOUND',
      requestedSize: 'GG',
    })
  })
})
