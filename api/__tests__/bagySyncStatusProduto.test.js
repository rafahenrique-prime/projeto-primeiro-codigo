/**
 * CONTRATO CATÁLOGO PRIME — Etapa 1: transições de products.status
 * (resolveStatusProduto, api/_bagySyncService.js) e contrato da leitura da
 * Gaby (fetchProductsCatalog com contratoV2).
 */
import { describe, it, expect } from 'vitest'
import { resolveStatusProduto } from '../_bagySyncService.js'
import { fetchProductsCatalog, fetchVariationsPorProdutos } from '../_gabrielaContextService.js'

describe('resolveStatusProduto', () => {
  it('404 confirmado em produto ativo → inactive (Etapa 0 APROVADA)', () => {
    expect(resolveStatusProduto({ bagyOk: false, bagyHttpStatus: 404, statusAtual: 'active' })).toBe('inactive')
    expect(resolveStatusProduto({ bagyOk: false, bagyHttpStatus: 404, statusAtual: 'Ativo' })).toBe('inactive')
  })
  it('404 em produto já inativo → null (não reescreve)', () => {
    expect(resolveStatusProduto({ bagyOk: false, bagyHttpStatus: 404, statusAtual: 'inactive' })).toBeNull()
  })
  it('200 em produto inativo → active (reativação, Etapa 0 APROVADA)', () => {
    expect(resolveStatusProduto({ bagyOk: true, bagyHttpStatus: 200, statusAtual: 'inactive' })).toBe('active')
    expect(resolveStatusProduto({ bagyOk: true, bagyHttpStatus: 200, statusAtual: 'inativo' })).toBe('active')
  })
  it('200 em produto ativo → null (não normaliza Ativo→active nesta etapa)', () => {
    expect(resolveStatusProduto({ bagyOk: true, bagyHttpStatus: 200, statusAtual: 'active' })).toBeNull()
    expect(resolveStatusProduto({ bagyOk: true, bagyHttpStatus: 200, statusAtual: 'Ativo' })).toBeNull()
  })
  it('outros erros (500, pagina_invalida) nunca tocam status', () => {
    expect(resolveStatusProduto({ bagyOk: false, bagyHttpStatus: 500, statusAtual: 'active' })).toBeNull()
    expect(resolveStatusProduto({ bagyOk: false, bagyHttpStatus: 200, statusAtual: 'active' })).toBeNull()
    expect(resolveStatusProduto({ bagyOk: false, bagyHttpStatus: null, statusAtual: 'active' })).toBeNull()
  })
})

describe('fetchProductsCatalog — contrato V2 atrás de flag', () => {
  const config = { baseUrl: 'https://x.supabase.co', headers: {} }
  const okFetch = async () => ({ ok: true, json: async () => [] })

  it('sem contratoV2: URL idêntica à de sempre (sem filtro de status, select original)', async () => {
    let url
    await fetchProductsCatalog({ supabaseConfig: config, fetchImpl: async (u) => { url = u; return okFetch() } })
    expect(url).toContain('select=id,nome,categoria,preco,imagem,link,codigo,')
    expect(url).not.toContain('status=in.')
    expect(url).not.toContain('marca')
  })

  it('com contratoV2: filtra ativos (whitelist dos vocabulários reais) e lê marca/status/sell_without_stock', async () => {
    let url
    await fetchProductsCatalog({ supabaseConfig: config, contratoV2: true, fetchImpl: async (u) => { url = u; return okFetch() } })
    expect(url).toContain('status=in.(active,Ativo,ativo)')
    expect(url).toContain('marca')
    expect(url).toContain('sell_without_stock')
  })
})

describe('fetchVariationsPorProdutos', () => {
  const config = { baseUrl: 'https://x.supabase.co', headers: {} }

  it('sem ids: ok vazio, nenhum fetch', async () => {
    const r = await fetchVariationsPorProdutos({ supabaseConfig: config, fetchImpl: async () => { throw new Error('não devia chamar') } }, [])
    expect(r).toEqual({ ok: true, variations: [] })
  })

  it('monta in.(...) com os ids e devolve as variações', async () => {
    let url
    const r = await fetchVariationsPorProdutos(
      { supabaseConfig: config, fetchImpl: async (u) => { url = u; return { ok: true, json: async () => [{ product_id: 'a', stock_real: 3, active: true }] } } },
      ['a', 'b']
    )
    expect(url).toContain('product_id=in.(a,b)')
    expect(url).toContain('stock_real')
    expect(url).toContain('active')
    expect(r.variations).toHaveLength(1)
  })

  it('falha (ex.: coluna inexistente em schema antigo) → ok:false, nunca inventa', async () => {
    const r = await fetchVariationsPorProdutos(
      { supabaseConfig: config, fetchImpl: async () => ({ ok: false }) },
      ['a']
    )
    expect(r.ok).toBe(false)
    expect(r.error_code).toBe('source_unavailable')
  })
})
