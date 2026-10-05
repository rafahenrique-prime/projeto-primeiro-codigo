import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  fetchSupplierShadowProducts,
  supplierShadowRowToEvidence,
} from '../_supplierShadowAdapter.js'

function response(json, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => json,
  }
}

const SB = {
  baseUrl: 'https://mock.supabase.co',
  headers: {
    apikey: 'server-only',
    Authorization: 'Bearer server-only',
  },
}

describe('Supplier Shadow V1 — adapter read-only', () => {
  it('item VIVIAN active+ready vira evidência comercial sem preço/estoque local', () => {
    const out = supplierShadowRowToEvidence({
      id: 's1',
      supplier_key: 'VIVIAN',
      drive_file_id: 'drive-1',
      drive_url: 'https://drive.google.com/file/d/drive-1/view',
      file_name: 'air-force-preto.jpg',
      brand: 'Nike',
      canonical_family: 'NIKE_AIR_FORCE_1',
      detected_model: 'Nike Air Force 1',
      category: 'Tênis',
      visual_color: 'preto',
      vision_confidence: 0.96,
      analysis_status: 'ready',
      active: true,
    })

    expect(out).toMatchObject({
      source: 'VIVIAN',
      source_item_id: 's1',
      name: 'Nike Air Force 1',
      canonical_family: 'NIKE_AIR_FORCE_1',
      color: 'preto',
      price: null,
      price_pix: null,
      local_stock_confirmed: false,
      supplier_presence: true,
      requested_size_confirmed: false,
      confirmed_unavailable: false,
      photo_ref: 'https://drive.google.com/file/d/drive-1/view',
      product_link: null,
      confidence: 0.96,
    })
  })

  it('item MIA active+ready também é aceito', () => {
    const out = supplierShadowRowToEvidence({
      id: 'm1',
      supplier_key: 'MIA',
      file_name: 'nb9060-cinza.jpg',
      detected_model: 'New Balance 9060',
      canonical_family: 'NEW_BALANCE_9060',
      analysis_status: 'ready',
      active: true,
    })

    expect(out?.source).toBe('MIA')
    expect(out?.supplier_presence).toBe(true)
  })

  it('pending, review, error e inactive ficam fora da busca V1', () => {
    const base = {
      supplier_key: 'VIVIAN',
      file_name: 'produto.jpg',
    }

    for (const analysis_status of ['pending', 'review', 'error']) {
      expect(supplierShadowRowToEvidence({
        ...base,
        analysis_status,
        active: true,
      })).toBeNull()
    }

    expect(supplierShadowRowToEvidence({
      ...base,
      analysis_status: 'ready',
      active: false,
    })).toBeNull()
  })

  it('fornecedor fora do vocabulário V1 é rejeitado', () => {
    expect(supplierShadowRowToEvidence({
      supplier_key: 'OUTRO',
      file_name: 'produto.jpg',
      analysis_status: 'ready',
      active: true,
    })).toBeNull()
  })

  it('fetch é somente GET e filtra active=true + analysis_status=ready', async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      expect(init.method).toBe('GET')
      expect(url).toContain('/rest/v1/supplier_shadow_products?')
      expect(url).toContain('active=eq.true')
      expect(url).toContain('analysis_status=eq.ready')
      return response([{
        id: 'm2',
        supplier_key: 'MIA',
        file_name: 'air-force-preto.jpg',
        detected_model: 'Air Force 1',
        canonical_family: 'NIKE_AIR_FORCE_1',
        analysis_status: 'ready',
        active: true,
      }])
    })

    const out = await fetchSupplierShadowProducts({
      supabaseConfig: SB,
      fetchImpl,
    })

    expect(out.ok).toBe(true)
    expect(out.rows).toHaveLength(1)
    expect(out.evidence).toHaveLength(1)
    expect(out.evidence[0].source).toBe('MIA')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('falha da fonte não cria fallback nem evidência inventada', async () => {
    const fetchImpl = vi.fn(async () => response([], false, 503))

    const out = await fetchSupplierShadowProducts({
      supabaseConfig: SB,
      fetchImpl,
    })

    expect(out.ok).toBe(false)
    expect(out.error_code).toBe('SUPPLIER_SHADOW_UNAVAILABLE')
    expect(out.rows).toEqual([])
    expect(out.evidence).toEqual([])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('033_supplier_shadow_v1.sql — segurança estrutural', () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const sql = fs.readFileSync(
    path.resolve(here, '../../supabase/migrations/033_supplier_shadow_v1.sql'),
    'utf8'
  )

  it('cria fontes, ledger e shadow de fornecedores', () => {
    expect(sql).toContain('create table public.supplier_catalog_sources')
    expect(sql).toContain('create table public.supplier_shadow_sync_runs')
    expect(sql).toContain('create table public.supplier_shadow_products')
    expect(sql).toContain("('VIVIAN', '001-FORNECEDOR VIVIAN', 2")
    expect(sql).toContain("('MIA',    '002-FORNECEDOR MIA',    3")
  })

  it('mantém identidade estável por fornecedor + drive_file_id', () => {
    expect(sql).toContain('unique (supplier_key, drive_file_id)')
    expect(sql).toContain("analysis_status in ('pending', 'ready', 'review', 'error')")
  })

  it('RLS fica fechada e sem grant público', () => {
    expect(sql).toContain('alter table public.supplier_catalog_sources enable row level security')
    expect(sql).toContain('alter table public.supplier_shadow_sync_runs enable row level security')
    expect(sql).toContain('alter table public.supplier_shadow_products enable row level security')

    expect(sql).toContain(
      'revoke all on table public.supplier_catalog_sources from public, anon, authenticated'
    )
    expect(sql).toContain(
      'revoke all on table public.supplier_shadow_sync_runs from public, anon, authenticated'
    )
    expect(sql).toContain(
      'revoke all on table public.supplier_shadow_products from public, anon, authenticated'
    )

    expect(sql.toLowerCase()).not.toMatch(/grant\s+select[\s\S]*\bto\s+(anon|authenticated)/)
  })

  it('não altera tabelas oficiais PRIME já existentes', () => {
    expect(sql.toLowerCase()).not.toMatch(/alter\s+table\s+public\.shadow_products\b/)
    expect(sql.toLowerCase()).not.toMatch(/alter\s+table\s+public\.shadow_product_variations\b/)
    expect(sql.toLowerCase()).not.toMatch(/alter\s+table\s+public\.products\b/)
  })
})
