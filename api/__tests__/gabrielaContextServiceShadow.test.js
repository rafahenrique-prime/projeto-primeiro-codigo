import { describe, it, expect, vi } from 'vitest'
import { fetchProductsCatalog, formatarProdutoComercial } from '../_gabrielaContextService.js'

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

  it('só usa products como fallback quando o Mirror falha tecnicamente', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes('/shadow_products?')) {
        return response([], false, 503)
      }
      if (url.includes('/products?')) {
        return response([{
          id: 'legacy-1',
          nome: 'Produto Legado',
          categoria: 'Teste',
          preco: 'R$ 10,00',
          imagem: 'https://img/legacy.jpg',
          link: 'https://loja/legacy',
          codigo: 'LEG-1',
        }])
      }
      throw new Error('URL inesperada')
    })

    const result = await fetchProductsCatalog({
      supabaseConfig: SUPABASE_CONFIG,
      fetchImpl,
    })

    expect(result.ok).toBe(true)
    expect(result.source).toBe('products_fallback')
    expect(result.primary_error_code).toBe('source_unavailable')
    expect(result.products[0]).toMatchObject({
      nome: 'Produto Legado',
      categoria: 'Teste',
      preco: 'R$ 10,00',
      imagem: 'https://img/legacy.jpg',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
