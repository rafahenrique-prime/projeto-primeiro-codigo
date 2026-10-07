import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  rotatedScopeKeys,
  runSupplierCatalogCycle,
} from '../_supplierCatalogCycle.js'

import {
  handleSupplierCatalogCycleRequest,
} from '../supplier-catalog-cycle-v1.js'

function mockRes() {
  const state = { status: null, payload: null, headers: {} }
  return {
    state,
    setHeader(name, value) {
      state.headers[name] = value
    },
    status(code) {
      state.status = code
      return {
        json(payload) {
          state.payload = payload
          return payload
        },
      }
    },
  }
}

const DEPS = {
  supabaseUrl: 'https://mock.supabase.co',
  publicKey: 'public-key',
  scannerToken: 'scanner-token',
  workerToken: 'worker-token',
  cycleToken: 'cycle-token',
}

describe('Supplier Catalog Cycle V1 — rotação e orçamento', () => {
  it('rotaciona a primeira pasta a cada dia', () => {
    const a = rotatedScopeKeys('supplier-cycle-v1:2026-10-05')
    const b = rotatedScopeKeys('supplier-cycle-v1:2026-10-06')

    expect(a).toHaveLength(44)
    expect(new Set(a).size).toBe(44)
    expect(b).toHaveLength(44)
    expect(new Set(b).size).toBe(44)
    expect(a[0]).not.toBe(b[0])
  })

  it('NB204L piloto fica fora da rotação diária e aceita ciclo manual', async () => {
    const daily = rotatedScopeKeys('supplier-cycle-v1:2026-10-05')
    expect(daily).not.toContain('VIVIAN_NEW_BALANCE_204L')

    const scannerFn = vi.fn(async ({
      scope_keys,
      preserve_ready_same_id,
    }) => {
      expect(scope_keys).toEqual(['VIVIAN_NEW_BALANCE_204L'])
      expect(preserve_ready_same_id).toBe(true)

      return {
        ok: true,
        scopes: [{
          key: scope_keys[0],
          status: 'completed',
          scanned: 3,
          new_count: 1,
          changed_count: 0,
          baseline_count: 0,
          unchanged_count: 2,
          reactivated_count: 0,
          selected_for_pending: 1,
          deferred_changes: 0,
          deactivated: 0,
          write_failures: 0,
        }],
      }
    })

    const out = await runSupplierCatalogCycle({
      cycle_key: 'supplier-cycle-homologation:nb204l-vivian-pilot',
      trigger: 'manual_homologation',
      max_changes: 1,
      scope_keys: ['VIVIAN_NEW_BALANCE_204L'],
    }, {
      ...DEPS,
      startFn: vi.fn(async () => ({
        ok: true,
        run_id: '15151515-1515-4151-8151-151515151515',
        accepted: true,
        status: 'running',
      })),
      finishFn: vi.fn(async () => ({ ok: true })),
      scannerFn,
      visionFn: vi.fn(async () => ({
        ok: true,
        queued: 1,
        processed: [{
          supplier: 'VIVIAN',
          family: 'NEW_BALANCE_204L',
          color: 'branco',
          confidence: 0.95,
          status: 'ready',
          persisted: true,
          error_code: null,
          usage: { cost_usd: 0.0003 },
        }],
      })),
    })

    expect(out.ok).toBe(true)
    expect(out.scope_order).toEqual(['VIVIAN_NEW_BALANCE_204L'])
    expect(out.totals.ready).toBe(1)
  })

  it('FuelCell Rebel V4 piloto fica fora da rotação diária e aceita ciclo manual', async () => {
    const daily = rotatedScopeKeys('supplier-cycle-v1:2026-10-05')
    expect(daily).not.toContain('VIVIAN_NEW_BALANCE_FUELCELL_REBEL_V4')

    const scannerFn = vi.fn(async ({
      scope_keys,
      preserve_ready_same_id,
    }) => {
      expect(scope_keys).toEqual([
        'VIVIAN_NEW_BALANCE_FUELCELL_REBEL_V4',
      ])
      expect(preserve_ready_same_id).toBe(true)

      return {
        ok: true,
        scopes: [{
          key: scope_keys[0],
          status: 'completed',
          scanned: 15,
          new_count: 1,
          changed_count: 0,
          baseline_count: 0,
          unchanged_count: 14,
          reactivated_count: 0,
          selected_for_pending: 1,
          deferred_changes: 0,
          deactivated: 0,
          write_failures: 0,
        }],
      }
    })

    const out = await runSupplierCatalogCycle({
      cycle_key: 'supplier-cycle-homologation:fuelcell-rebel-v4-vivian-pilot',
      trigger: 'manual_homologation',
      max_changes: 1,
      scope_keys: ['VIVIAN_NEW_BALANCE_FUELCELL_REBEL_V4'],
    }, {
      ...DEPS,
      startFn: vi.fn(async () => ({
        ok: true,
        run_id: '14141414-1414-4141-8141-141414141414',
        accepted: true,
        status: 'running',
      })),
      finishFn: vi.fn(async () => ({ ok: true })),
      scannerFn,
      visionFn: vi.fn(async () => ({
        ok: true,
        queued: 1,
        processed: [{
          supplier: 'VIVIAN',
          family: 'NEW_BALANCE_FUELCELL_REBEL_V4',
          color: 'preto',
          confidence: 0.95,
          status: 'ready',
          persisted: true,
          error_code: null,
          usage: { cost_usd: 0.0003 },
        }],
      })),
    })

    expect(out.ok).toBe(true)
    expect(out.scope_order).toEqual([
      'VIVIAN_NEW_BALANCE_FUELCELL_REBEL_V4',
    ])
    expect(out.totals.ready).toBe(1)
  })

  it('Court Borough piloto fica fora da rotação diária mas aceita promoção manual controlada', async () => {
    const daily = rotatedScopeKeys('supplier-cycle-v1:2026-10-05')
    expect(daily).not.toContain('VIVIAN_NIKE_COURT_BOROUGH')

    const scannerFn = vi.fn(async ({ scope_keys }) => ({
      ok: true,
      scopes: [{
        key: scope_keys[0],
        status: 'completed',
        scanned: 11,
        new_count: 1,
        changed_count: 0,
        baseline_count: 0,
        unchanged_count: 10,
        reactivated_count: 0,
        selected_for_pending: 1,
        deferred_changes: 0,
        deactivated: 0,
        write_failures: 0,
      }],
    }))

    const out = await runSupplierCatalogCycle({
      cycle_key: 'supplier-cycle-homologation:court-borough-vivian-pilot',
      trigger: 'manual_homologation',
      max_changes: 1,
      scope_keys: ['VIVIAN_NIKE_COURT_BOROUGH'],
    }, {
      ...DEPS,
      startFn: vi.fn(async () => ({
        ok: true,
        run_id: '99999999-9999-4999-8999-999999999999',
        accepted: true,
        status: 'running',
      })),
      finishFn: vi.fn(async () => ({ ok: true })),
      scannerFn,
      visionFn: vi.fn(async () => ({
        ok: true,
        queued: 1,
        processed: [{
          supplier: 'VIVIAN',
          family: 'NIKE_COURT_BOROUGH',
          color: 'branco',
          confidence: 0.92,
          status: 'ready',
          persisted: true,
          error_code: null,
          usage: { cost_usd: 0.0003 },
        }],
      })),
    })

    expect(out.ok).toBe(true)
    expect(out.scope_order).toEqual(['VIVIAN_NIKE_COURT_BOROUGH'])
    expect(out.totals.ready).toBe(1)
  })

  it('Court Borough em lote manual envia ao Vision somente os IDs exatos selecionados', async () => {
    const selectedIds = ['court-1', 'court-2', 'court-3']

    const scannerFn = vi.fn(async ({
      max_changes,
      scope_keys,
      preserve_ready_same_id,
    }) => {
      expect(max_changes).toBe(3)
      expect(scope_keys).toEqual(['VIVIAN_NIKE_COURT_BOROUGH'])
      expect(preserve_ready_same_id).toBe(true)

      return {
        ok: true,
        scopes: [{
          key: scope_keys[0],
          status: 'completed',
          scanned: 11,
          new_count: 9,
          changed_count: 0,
          baseline_count: 0,
          unchanged_count: 2,
          reactivated_count: 0,
          selected_for_pending: 3,
          deferred_changes: 6,
          deactivated: 0,
          write_failures: 0,
          _selected_drive_file_ids: selectedIds,
        }],
      }
    })

    const visionFn = vi.fn(async input => {
      expect(input).toEqual({
        limit: 3,
        dry_run: false,
        drive_file_ids: selectedIds,
      })

      return {
        ok: true,
        queued: 3,
        processed: selectedIds.map((id, index) => ({
          id,
          supplier: 'VIVIAN',
          family: 'NIKE_COURT_BOROUGH',
          color: index === 0 ? 'preto' : 'branco',
          confidence: 0.95,
          status: 'ready',
          persisted: true,
          error_code: null,
          usage: { cost_usd: 0.0003 },
        })),
      }
    })

    const out = await runSupplierCatalogCycle({
      cycle_key: 'supplier-cycle-homologation:court-borough-batch3',
      trigger: 'manual_homologation',
      max_changes: 3,
      scope_keys: ['VIVIAN_NIKE_COURT_BOROUGH'],
    }, {
      ...DEPS,
      startFn: vi.fn(async () => ({
        ok: true,
        run_id: '12121212-1212-4121-8121-121212121212',
        accepted: true,
        status: 'running',
      })),
      finishFn: vi.fn(async () => ({ ok: true })),
      scannerFn,
      visionFn,
    })

    expect(out.ok).toBe(true)
    expect(out.totals).toMatchObject({
      selected_for_pending: 3,
      ready: 3,
      review: 0,
      error: 0,
    })
    expect(visionFn).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(out.scanner)).not.toContain('court-1')
  })

  it('lote manual bloqueia Vision se perder correlação dos IDs selecionados', async () => {
    const visionFn = vi.fn()

    const out = await runSupplierCatalogCycle({
      cycle_key: 'supplier-cycle-homologation:court-borough-mismatch',
      trigger: 'manual_homologation',
      max_changes: 3,
      scope_keys: ['VIVIAN_NIKE_COURT_BOROUGH'],
    }, {
      ...DEPS,
      startFn: vi.fn(async () => ({
        ok: true,
        run_id: '13131313-1313-4131-8131-131313131313',
        accepted: true,
        status: 'running',
      })),
      finishFn: vi.fn(async () => ({ ok: true })),
      scannerFn: vi.fn(async () => ({
        ok: true,
        scopes: [{
          key: 'VIVIAN_NIKE_COURT_BOROUGH',
          status: 'completed',
          scanned: 11,
          new_count: 9,
          changed_count: 0,
          baseline_count: 0,
          unchanged_count: 2,
          reactivated_count: 0,
          selected_for_pending: 3,
          deferred_changes: 6,
          deactivated: 0,
          write_failures: 0,
          _selected_drive_file_ids: ['court-1', 'court-2'],
        }],
      })),
      visionFn,
    })

    expect(out.ok).toBe(false)
    expect(out.status).toBe('partial')
    expect(out.error_code).toBe('CYCLE_PARTIAL')
    expect(visionFn).not.toHaveBeenCalled()
  })

  it('McQueen homologado entra na rotação diária e continua aceitando execução manual', async () => {
    const daily = rotatedScopeKeys('supplier-cycle-v1:2026-10-05')

    expect(daily).toContain('VIVIAN_MCQUEEN')
    expect(daily).toContain('MIA_MCQUEEN')

    const scannerFn = vi.fn(async ({ scope_keys }) => ({
      ok: true,
      scopes: [{
        key: scope_keys[0],
        status: 'completed',
        scanned: 8,
        new_count: 1,
        changed_count: 0,
        baseline_count: 0,
        unchanged_count: 7,
        reactivated_count: 0,
        selected_for_pending: 1,
        deferred_changes: 0,
        deactivated: 0,
        write_failures: 0,
      }],
    }))

    const out = await runSupplierCatalogCycle({
      cycle_key: 'supplier-cycle-homologation:mcqueen-vivian',
      trigger: 'manual_homologation',
      max_changes: 1,
      scope_keys: ['VIVIAN_MCQUEEN'],
    }, {
      ...DEPS,
      startFn: vi.fn(async () => ({
        ok: true,
        run_id: '55555555-5555-4555-8555-555555555555',
        accepted: true,
        status: 'running',
      })),
      finishFn: vi.fn(async () => ({ ok: true })),
      scannerFn,
      visionFn: vi.fn(async () => ({
        ok: true,
        queued: 1,
        processed: [{
          supplier: 'VIVIAN',
          family: 'ALEXANDER_MCQUEEN_OVERSIZED',
          color: 'preto',
          confidence: 0.96,
          status: 'ready',
          persisted: true,
          error_code: null,
          usage: { cost_usd: 0.0003 },
        }],
      })),
    })

    expect(out.ok).toBe(true)
    expect(scannerFn).toHaveBeenCalledTimes(1)
    expect(out.scope_order).toEqual(['VIVIAN_MCQUEEN'])
    expect(out.totals.ready).toBe(1)
  })

  it('NB1000 homologado entra na rotação diária e continua aceitando ciclo manual', async () => {
    const daily = rotatedScopeKeys('supplier-cycle-v1:2026-10-05')
    expect(daily).toContain('VIVIAN_NB1000')
    expect(daily).toContain('MIA_NB1000')

    const scannerFn = vi.fn(async ({ scope_keys }) => ({
      ok: true,
      scopes: [{
        key: scope_keys[0],
        status: 'completed',
        scanned: 14,
        new_count: 1,
        changed_count: 0,
        baseline_count: 0,
        unchanged_count: 13,
        reactivated_count: 0,
        selected_for_pending: 1,
        deferred_changes: 0,
        deactivated: 0,
        write_failures: 0,
      }],
    }))

    const out = await runSupplierCatalogCycle({
      cycle_key: 'supplier-cycle-homologation:nb1000-vivian',
      trigger: 'manual_homologation',
      max_changes: 1,
      scope_keys: ['VIVIAN_NB1000'],
    }, {
      ...DEPS,
      startFn: vi.fn(async () => ({
        ok: true,
        run_id: '66666666-6666-4666-8666-666666666666',
        accepted: true,
        status: 'running',
      })),
      finishFn: vi.fn(async () => ({ ok: true })),
      scannerFn,
      visionFn: vi.fn(async () => ({
        ok: true,
        queued: 1,
        processed: [{
          supplier: 'VIVIAN',
          family: 'NEW_BALANCE_1000',
          color: 'preto',
          confidence: 0.97,
          status: 'ready',
          persisted: true,
          error_code: null,
          usage: { cost_usd: 0.0003 },
        }],
      })),
    })

    expect(out.ok).toBe(true)
    expect(out.scope_order).toEqual(['VIVIAN_NB1000'])
    expect(out.totals.ready).toBe(1)
  })

  it('NB2000 homologado entra na rotação diária e continua aceitando ciclo manual', async () => {
    const daily = rotatedScopeKeys('supplier-cycle-v1:2026-10-05')
    expect(daily).toContain('VIVIAN_NB2000')
    expect(daily).toContain('MIA_NB2000')

    const scannerFn = vi.fn(async ({ scope_keys }) => ({
      ok: true,
      scopes: [{
        key: scope_keys[0],
        status: 'completed',
        scanned: 6,
        new_count: 1,
        changed_count: 0,
        baseline_count: 0,
        unchanged_count: 5,
        reactivated_count: 0,
        selected_for_pending: 1,
        deferred_changes: 0,
        deactivated: 0,
        write_failures: 0,
      }],
    }))

    const out = await runSupplierCatalogCycle({
      cycle_key: 'supplier-cycle-homologation:nb2000-vivian',
      trigger: 'manual_homologation',
      max_changes: 1,
      scope_keys: ['VIVIAN_NB2000'],
    }, {
      ...DEPS,
      startFn: vi.fn(async () => ({
        ok: true,
        run_id: '77777777-7777-4777-8777-777777777777',
        accepted: true,
        status: 'running',
      })),
      finishFn: vi.fn(async () => ({ ok: true })),
      scannerFn,
      visionFn: vi.fn(async () => ({
        ok: true,
        queued: 1,
        processed: [{
          supplier: 'VIVIAN',
          family: 'NEW_BALANCE_2000',
          color: 'cinza',
          confidence: 0.97,
          status: 'ready',
          persisted: true,
          error_code: null,
          usage: { cost_usd: 0.0003 },
        }],
      })),
    })

    expect(out.ok).toBe(true)
    expect(out.scope_order).toEqual(['VIVIAN_NB2000'])
    expect(out.totals.ready).toBe(1)
  })

  it('NB530 homologado entra na rotação diária e continua aceitando ciclo manual', async () => {
    const daily = rotatedScopeKeys('supplier-cycle-v1:2026-10-05')
    expect(daily).toContain('VIVIAN_NB530')
    expect(daily).toContain('MIA_NB530')

    const scannerFn = vi.fn(async ({ scope_keys }) => ({
      ok: true,
      scopes: [{
        key: scope_keys[0],
        status: 'completed',
        scanned: 11,
        new_count: 1,
        changed_count: 0,
        baseline_count: 0,
        unchanged_count: 10,
        reactivated_count: 0,
        selected_for_pending: 1,
        deferred_changes: 0,
        deactivated: 0,
        write_failures: 0,
      }],
    }))

    const out = await runSupplierCatalogCycle({
      cycle_key: 'supplier-cycle-homologation:nb530-vivian',
      trigger: 'manual_homologation',
      max_changes: 1,
      scope_keys: ['VIVIAN_NB530'],
    }, {
      ...DEPS,
      startFn: vi.fn(async () => ({
        ok: true,
        run_id: '88888888-8888-4888-8888-888888888888',
        accepted: true,
        status: 'running',
      })),
      finishFn: vi.fn(async () => ({ ok: true })),
      scannerFn,
      visionFn: vi.fn(async () => ({
        ok: true,
        queued: 1,
        processed: [{
          supplier: 'VIVIAN',
          family: 'NEW_BALANCE_530',
          color: 'branco',
          confidence: 0.97,
          status: 'ready',
          persisted: true,
          error_code: null,
          usage: { cost_usd: 0.0003 },
        }],
      })),
    })

    expect(out.ok).toBe(true)
    expect(out.scope_order).toEqual(['VIVIAN_NB530'])
    expect(out.totals.ready).toBe(1)
  })

  it('Adidas Samba homologado entra na rotação diária e continua aceitando ciclo manual', async () => {
    const daily = rotatedScopeKeys('supplier-cycle-v1:2026-10-05')
    expect(daily).toContain('VIVIAN_ADIDAS_SAMBA')
    expect(daily).toContain('MIA_ADIDAS_SAMBA')

    const scannerFn = vi.fn(async ({ scope_keys }) => ({
      ok: true,
      scopes: [{
        key: scope_keys[0],
        status: 'completed',
        scanned: 15,
        new_count: 1,
        changed_count: 0,
        baseline_count: 0,
        unchanged_count: 14,
        reactivated_count: 0,
        selected_for_pending: 1,
        deferred_changes: 0,
        deactivated: 0,
        write_failures: 0,
      }],
    }))

    const out = await runSupplierCatalogCycle({
      cycle_key: 'supplier-cycle-homologation:adidas-samba-vivian',
      trigger: 'manual_homologation',
      max_changes: 1,
      scope_keys: ['VIVIAN_ADIDAS_SAMBA'],
    }, {
      ...DEPS,
      startFn: vi.fn(async () => ({
        ok: true,
        run_id: '99999999-9999-4999-8999-999999999999',
        accepted: true,
        status: 'running',
      })),
      finishFn: vi.fn(async () => ({ ok: true })),
      scannerFn,
      visionFn: vi.fn(async () => ({
        ok: true,
        queued: 1,
        processed: [{
          supplier: 'VIVIAN',
          family: 'ADIDAS_SAMBA',
          color: 'branco',
          confidence: 0.97,
          status: 'ready',
          persisted: true,
          error_code: null,
          usage: { cost_usd: 0.0003 },
        }],
      })),
    })

    expect(out.ok).toBe(true)
    expect(out.scope_order).toEqual(['VIVIAN_ADIDAS_SAMBA'])
    expect(out.totals.ready).toBe(1)
  })

  it('Adidas Adi 2000 homologado entra na rotação diária e continua aceitando ciclo manual', async () => {
    const daily = rotatedScopeKeys('supplier-cycle-v1:2026-10-05')
    expect(daily).toContain('VIVIAN_ADIDAS_ADI2000')
    expect(daily).toContain('MIA_ADIDAS_ADI2000')

    const scannerFn = vi.fn(async ({ scope_keys }) => ({
      ok: true,
      scopes: [{
        key: scope_keys[0],
        status: 'completed',
        scanned: 6,
        new_count: 1,
        changed_count: 0,
        baseline_count: 0,
        unchanged_count: 5,
        reactivated_count: 0,
        selected_for_pending: 1,
        deferred_changes: 0,
        deactivated: 0,
        write_failures: 0,
      }],
    }))

    const out = await runSupplierCatalogCycle({
      cycle_key: 'supplier-cycle-homologation:adidas-adi2000-vivian',
      trigger: 'manual_homologation',
      max_changes: 1,
      scope_keys: ['VIVIAN_ADIDAS_ADI2000'],
    }, {
      ...DEPS,
      startFn: vi.fn(async () => ({
        ok: true,
        run_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        accepted: true,
        status: 'running',
      })),
      finishFn: vi.fn(async () => ({ ok: true })),
      scannerFn,
      visionFn: vi.fn(async () => ({
        ok: true,
        queued: 1,
        processed: [{
          supplier: 'VIVIAN',
          family: 'ADIDAS_ADI_2000',
          color: 'preto',
          confidence: 0.97,
          status: 'ready',
          persisted: true,
          error_code: null,
          usage: { cost_usd: 0.0003 },
        }],
      })),
    })

    expect(out.ok).toBe(true)
    expect(out.scope_order).toEqual(['VIVIAN_ADIDAS_ADI2000'])
    expect(out.totals.ready).toBe(1)
  })

  it('Adidas Campus homologado entra na rotação diária e continua aceitando ciclo manual', async () => {
    const daily = rotatedScopeKeys('supplier-cycle-v1:2026-10-05')
    expect(daily).toContain('VIVIAN_ADIDAS_CAMPUS')
    expect(daily).toContain('MIA_ADIDAS_CAMPUS')

    const scannerFn = vi.fn(async ({ scope_keys }) => ({
      ok: true,
      scopes: [{
        key: scope_keys[0],
        status: 'completed',
        scanned: 13,
        new_count: 1,
        changed_count: 0,
        baseline_count: 0,
        unchanged_count: 12,
        reactivated_count: 0,
        selected_for_pending: 1,
        deferred_changes: 0,
        deactivated: 0,
        write_failures: 0,
      }],
    }))

    const out = await runSupplierCatalogCycle({
      cycle_key: 'supplier-cycle-homologation:adidas-campus-vivian',
      trigger: 'manual_homologation',
      max_changes: 1,
      scope_keys: ['VIVIAN_ADIDAS_CAMPUS'],
    }, {
      ...DEPS,
      startFn: vi.fn(async () => ({
        ok: true,
        run_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        accepted: true,
        status: 'running',
      })),
      finishFn: vi.fn(async () => ({ ok: true })),
      scannerFn,
      visionFn: vi.fn(async () => ({
        ok: true,
        queued: 1,
        processed: [{
          supplier: 'VIVIAN',
          family: 'ADIDAS_CAMPUS',
          color: 'bege',
          confidence: 0.97,
          status: 'ready',
          persisted: true,
          error_code: null,
          usage: { cost_usd: 0.0003 },
        }],
      })),
    })

    expect(out.ok).toBe(true)
    expect(out.scope_order).toEqual(['VIVIAN_ADIDAS_CAMPUS'])
    expect(out.totals.ready).toBe(1)
  })

  it('Mizuno Prophecy 14 homologado entra na rotação diária e continua aceitando ciclo manual', async () => {
    const daily = rotatedScopeKeys('supplier-cycle-v1:2026-10-05')
    expect(daily).toContain('VIVIAN_MIZUNO_PROPHECY14')
    expect(daily).toContain('MIA_MIZUNO_PROPHECY14')

    const scannerFn = vi.fn(async ({ scope_keys }) => ({
      ok: true,
      scopes: [{
        key: scope_keys[0],
        status: 'completed',
        scanned: 11,
        new_count: 1,
        changed_count: 0,
        baseline_count: 0,
        unchanged_count: 10,
        reactivated_count: 0,
        selected_for_pending: 1,
        deferred_changes: 0,
        deactivated: 0,
        write_failures: 0,
      }],
    }))

    const out = await runSupplierCatalogCycle({
      cycle_key: 'supplier-cycle-homologation:mizuno-prophecy14-vivian',
      trigger: 'manual_homologation',
      max_changes: 1,
      scope_keys: ['VIVIAN_MIZUNO_PROPHECY14'],
    }, {
      ...DEPS,
      startFn: vi.fn(async () => ({
        ok: true,
        run_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        accepted: true,
        status: 'running',
      })),
      finishFn: vi.fn(async () => ({ ok: true })),
      scannerFn,
      visionFn: vi.fn(async () => ({
        ok: true,
        queued: 1,
        processed: [{
          supplier: 'VIVIAN',
          family: 'MIZUNO_WAVE_PROPHECY_14',
          color: 'preto',
          confidence: 0.97,
          status: 'ready',
          persisted: true,
          error_code: null,
          usage: { cost_usd: 0.0003 },
        }],
      })),
    })

    expect(out.ok).toBe(true)
    expect(out.scope_order).toEqual(['VIVIAN_MIZUNO_PROPHECY14'])
    expect(out.totals.ready).toBe(1)
  })

  it('Nike Dunk homologado entra na rotação diária com VIVIAN e duas pastas MIA', async () => {
    const daily = rotatedScopeKeys('supplier-cycle-v1:2026-10-05')
    expect(daily).toContain('VIVIAN_NIKE_DUNK')
    expect(daily).toContain('MIA_NIKE_DUNK_1')
    expect(daily).toContain('MIA_NIKE_DUNK_2')

    const scannerFn = vi.fn(async ({ scope_keys }) => ({
      ok: true,
      scopes: [{
        key: scope_keys[0],
        status: 'completed',
        scanned: 12,
        new_count: 1,
        changed_count: 0,
        baseline_count: 0,
        unchanged_count: 11,
        reactivated_count: 0,
        selected_for_pending: 1,
        deferred_changes: 0,
        deactivated: 0,
        write_failures: 0,
      }],
    }))

    const out = await runSupplierCatalogCycle({
      cycle_key: 'supplier-cycle-homologation:nike-dunk-vivian',
      trigger: 'manual_homologation',
      max_changes: 1,
      scope_keys: ['VIVIAN_NIKE_DUNK'],
    }, {
      ...DEPS,
      startFn: vi.fn(async () => ({
        ok: true,
        run_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        accepted: true,
        status: 'running',
      })),
      finishFn: vi.fn(async () => ({ ok: true })),
      scannerFn,
      visionFn: vi.fn(async () => ({
        ok: true,
        queued: 1,
        processed: [{
          supplier: 'VIVIAN',
          family: 'NIKE_DUNK',
          color: 'verde',
          confidence: 0.97,
          status: 'ready',
          persisted: true,
          error_code: null,
          usage: { cost_usd: 0.0003 },
        }],
      })),
    })

    expect(out.ok).toBe(true)
    expect(out.scope_order).toEqual(['VIVIAN_NIKE_DUNK'])
    expect(out.totals.ready).toBe(1)
  })

  it('Nike Court Vision homologado entra na rotação diária e continua aceitando ciclo manual', async () => {
    const daily = rotatedScopeKeys('supplier-cycle-v1:2026-10-06')
    expect(daily).toContain('VIVIAN_NIKE_COURT_VISION')
    expect(daily).toContain('MIA_NIKE_COURT_VISION')

    const scannerFn = vi.fn(async ({ scope_keys }) => ({
      ok: true,
      scopes: [{
        key: scope_keys[0],
        status: 'completed',
        scanned: 6,
        new_count: 1,
        changed_count: 0,
        baseline_count: 0,
        unchanged_count: 5,
        reactivated_count: 0,
        selected_for_pending: 1,
        deferred_changes: 0,
        deactivated: 0,
        write_failures: 0,
      }],
    }))

    const out = await runSupplierCatalogCycle({
      cycle_key: 'supplier-cycle-homologation:nike-court-vision-vivian',
      trigger: 'manual_homologation',
      max_changes: 1,
      scope_keys: ['VIVIAN_NIKE_COURT_VISION'],
    }, {
      ...DEPS,
      startFn: vi.fn(async () => ({
        ok: true,
        run_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        accepted: true,
        status: 'running',
      })),
      finishFn: vi.fn(async () => ({ ok: true })),
      scannerFn,
      visionFn: vi.fn(async () => ({
        ok: true,
        queued: 1,
        processed: [{
          supplier: 'VIVIAN',
          family: 'NIKE_COURT_VISION',
          color: 'branco',
          confidence: 0.97,
          status: 'ready',
          persisted: true,
          error_code: null,
          usage: { cost_usd: 0.0003 },
        }],
      })),
    })

    expect(out.ok).toBe(true)
    expect(out.scope_order).toEqual(['VIVIAN_NIKE_COURT_VISION'])
    expect(out.totals.ready).toBe(1)
  })

  it('Nike Bailleli homologado entra na rotação diária e continua aceitando ciclo manual', async () => {
    const daily = rotatedScopeKeys('supplier-cycle-v1:2026-10-06')
    expect(daily).toContain('VIVIAN_NIKE_BAILLELI')
    expect(daily).toContain('MIA_NIKE_BAILLELI')

    const scannerFn = vi.fn(async ({ scope_keys }) => ({
      ok: true,
      scopes: [{
        key: scope_keys[0],
        status: 'completed',
        scanned: 15,
        new_count: 1,
        changed_count: 0,
        baseline_count: 0,
        unchanged_count: 14,
        reactivated_count: 0,
        selected_for_pending: 1,
        deferred_changes: 0,
        deactivated: 0,
        write_failures: 0,
      }],
    }))

    const out = await runSupplierCatalogCycle({
      cycle_key: 'supplier-cycle-homologation:nike-bailleli-vivian',
      trigger: 'manual_homologation',
      max_changes: 1,
      scope_keys: ['VIVIAN_NIKE_BAILLELI'],
    }, {
      ...DEPS,
      startFn: vi.fn(async () => ({
        ok: true,
        run_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        accepted: true,
        status: 'running',
      })),
      finishFn: vi.fn(async () => ({ ok: true })),
      scannerFn,
      visionFn: vi.fn(async () => ({
        ok: true,
        queued: 1,
        processed: [{
          supplier: 'VIVIAN',
          family: 'NIKE_BAILLELI',
          color: 'preto',
          confidence: 0.97,
          status: 'ready',
          persisted: true,
          error_code: null,
          usage: { cost_usd: 0.0003 },
        }],
      })),
    })

    expect(out.ok).toBe(true)
    expect(out.scope_order).toEqual(['VIVIAN_NIKE_BAILLELI'])
    expect(out.totals.ready).toBe(1)
  })

  it('Adidas Adizero homologado entra na rotação diária e continua aceitando ciclo manual', async () => {
    const daily = rotatedScopeKeys('supplier-cycle-v1:2026-10-06')
    expect(daily).toContain('VIVIAN_ADIDAS_ADIZERO')
    expect(daily).toContain('MIA_ADIDAS_ADIZERO_1')
    expect(daily).toContain('MIA_ADIDAS_ADIZERO_2')

    const scannerFn = vi.fn(async ({ scope_keys }) => ({
      ok: true,
      scopes: [{
        key: scope_keys[0],
        status: 'completed',
        scanned: 27,
        new_count: 1,
        changed_count: 0,
        baseline_count: 0,
        unchanged_count: 26,
        reactivated_count: 0,
        selected_for_pending: 1,
        deferred_changes: 0,
        deactivated: 0,
        write_failures: 0,
      }],
    }))

    const out = await runSupplierCatalogCycle({
      cycle_key: 'supplier-cycle-homologation:adidas-adizero-vivian',
      trigger: 'manual_homologation',
      max_changes: 1,
      scope_keys: ['VIVIAN_ADIDAS_ADIZERO'],
    }, {
      ...DEPS,
      startFn: vi.fn(async () => ({
        ok: true,
        run_id: 'abababab-abab-4bab-8bab-abababababab',
        accepted: true,
        status: 'running',
      })),
      finishFn: vi.fn(async () => ({ ok: true })),
      scannerFn,
      visionFn: vi.fn(async () => ({
        ok: true,
        queued: 1,
        processed: [{
          supplier: 'VIVIAN',
          family: 'ADIDAS_ADIZERO',
          color: 'amarelo',
          confidence: 0.97,
          status: 'ready',
          persisted: true,
          error_code: null,
          usage: { cost_usd: 0.0003 },
        }],
      })),
    })

    expect(out.ok).toBe(true)
    expect(out.scope_order).toEqual(['VIVIAN_ADIDAS_ADIZERO'])
    expect(out.totals.ready).toBe(1)
  })

  it('Nike Vomero homologado entra na rotação diária e continua aceitando ciclo manual', async () => {
    const daily = rotatedScopeKeys('supplier-cycle-v1:2026-10-06')
    expect(daily).toContain('VIVIAN_NIKE_VOMERO_ZOOMX')
    expect(daily).toContain('VIVIAN_NIKE_VOMERO_PREMIUM')
    expect(daily).toContain('MIA_NIKE_VOMERO')

    const scannerFn = vi.fn(async ({ scope_keys }) => ({
      ok: true,
      scopes: [{
        key: scope_keys[0],
        status: 'completed',
        scanned: 21,
        new_count: 1,
        changed_count: 0,
        baseline_count: 0,
        unchanged_count: 20,
        reactivated_count: 0,
        selected_for_pending: 1,
        deferred_changes: 0,
        deactivated: 0,
        write_failures: 0,
      }],
    }))

    const out = await runSupplierCatalogCycle({
      cycle_key: 'supplier-cycle-homologation:nike-vomero-vivian',
      trigger: 'manual_homologation',
      max_changes: 1,
      scope_keys: ['VIVIAN_NIKE_VOMERO_ZOOMX'],
    }, {
      ...DEPS,
      startFn: vi.fn(async () => ({
        ok: true,
        run_id: 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',
        accepted: true,
        status: 'running',
      })),
      finishFn: vi.fn(async () => ({ ok: true })),
      scannerFn,
      visionFn: vi.fn(async () => ({
        ok: true,
        queued: 1,
        processed: [{
          supplier: 'VIVIAN',
          family: 'NIKE_VOMERO',
          color: 'preto',
          confidence: 0.97,
          status: 'ready',
          persisted: true,
          error_code: null,
          usage: { cost_usd: 0.0003 },
        }],
      })),
    })

    expect(out.ok).toBe(true)
    expect(out.scope_order).toEqual(['VIVIAN_NIKE_VOMERO_ZOOMX'])
    expect(out.totals.ready).toBe(1)
  })

  it('Air Max DN MIA homologado entra na rotação diária e continua aceitando ciclo manual controlado', async () => {
    const daily = rotatedScopeKeys('supplier-cycle-v1:2026-10-06')
    expect(daily).toContain('MIA_NIKE_AIR_MAX_DN')

    const scannerFn = vi.fn(async ({ scope_keys }) => ({
      ok: true,
      scopes: [{
        key: scope_keys[0],
        status: 'completed',
        scanned: 13,
        new_count: 1,
        changed_count: 0,
        baseline_count: 0,
        unchanged_count: 12,
        reactivated_count: 0,
        selected_for_pending: 1,
        deferred_changes: 0,
        deactivated: 0,
        write_failures: 0,
      }],
    }))

    const out = await runSupplierCatalogCycle({
      cycle_key: 'supplier-cycle-homologation:air-max-dn-mia',
      trigger: 'manual_homologation',
      max_changes: 1,
      scope_keys: ['MIA_NIKE_AIR_MAX_DN'],
    }, {
      ...DEPS,
      startFn: vi.fn(async () => ({
        ok: true,
        run_id: 'd0d0d0d0-d0d0-40d0-80d0-d0d0d0d0d0d0',
        accepted: true,
        status: 'running',
      })),
      finishFn: vi.fn(async () => ({ ok: true })),
      scannerFn,
      visionFn: vi.fn(async () => ({
        ok: true,
        queued: 1,
        processed: [{
          supplier: 'MIA',
          family: 'NIKE_AIR_MAX_DN',
          color: 'preto',
          confidence: 0.98,
          status: 'ready',
          persisted: true,
          error_code: null,
          usage: { cost_usd: 0.0003 },
        }],
      })),
    })

    expect(out.ok).toBe(true)
    expect(out.scope_order).toEqual(['MIA_NIKE_AIR_MAX_DN'])
    expect(out.totals.ready).toBe(1)
  })

  it('Air Max 270 MIA homologado entra na rotação diária e continua aceitando ciclo manual controlado', async () => {
    const daily = rotatedScopeKeys('supplier-cycle-v1:2026-10-06')
    expect(daily).toContain('MIA_NIKE_AIR_MAX_270')

    const scannerFn = vi.fn(async ({ scope_keys }) => ({
      ok: true,
      scopes: [{
        key: scope_keys[0],
        status: 'completed',
        scanned: 7,
        new_count: 1,
        changed_count: 0,
        baseline_count: 0,
        unchanged_count: 6,
        reactivated_count: 0,
        selected_for_pending: 1,
        deferred_changes: 0,
        deactivated: 0,
        write_failures: 0,
      }],
    }))

    const out = await runSupplierCatalogCycle({
      cycle_key: 'supplier-cycle-homologation:air-max-270-mia',
      trigger: 'manual_homologation',
      max_changes: 1,
      scope_keys: ['MIA_NIKE_AIR_MAX_270'],
    }, {
      ...DEPS,
      startFn: vi.fn(async () => ({
        ok: true,
        run_id: '27027027-0270-4270-8270-270270270270',
        accepted: true,
        status: 'running',
      })),
      finishFn: vi.fn(async () => ({ ok: true })),
      scannerFn,
      visionFn: vi.fn(async () => ({
        ok: true,
        queued: 1,
        processed: [{
          supplier: 'MIA',
          family: 'NIKE_AIR_MAX_270',
          color: 'preto',
          confidence: 0.98,
          status: 'ready',
          persisted: true,
          error_code: null,
          usage: { cost_usd: 0.0003 },
        }],
      })),
    })

    expect(out.ok).toBe(true)
    expect(out.scope_order).toEqual(['MIA_NIKE_AIR_MAX_270'])
    expect(out.totals.ready).toBe(1)
  })

  it('Air Max 97 MIA homologado entra na rotação diária e continua aceitando ciclo manual controlado', async () => {
    const daily = rotatedScopeKeys('supplier-cycle-v1:2026-10-06')
    expect(daily).toContain('MIA_NIKE_AIR_MAX_97')

    const scannerFn = vi.fn(async ({ scope_keys }) => ({
      ok: true,
      scopes: [{
        key: scope_keys[0],
        status: 'completed',
        scanned: 7,
        new_count: 1,
        changed_count: 0,
        baseline_count: 0,
        unchanged_count: 6,
        reactivated_count: 0,
        selected_for_pending: 1,
        deferred_changes: 0,
        deactivated: 0,
        write_failures: 0,
      }],
    }))

    const out = await runSupplierCatalogCycle({
      cycle_key: 'supplier-cycle-homologation:air-max-97-mia',
      trigger: 'manual_homologation',
      max_changes: 1,
      scope_keys: ['MIA_NIKE_AIR_MAX_97'],
    }, {
      ...DEPS,
      startFn: vi.fn(async () => ({
        ok: true,
        run_id: '97979797-9797-4797-8797-979797979797',
        accepted: true,
        status: 'running',
      })),
      finishFn: vi.fn(async () => ({ ok: true })),
      scannerFn,
      visionFn: vi.fn(async () => ({
        ok: true,
        queued: 1,
        processed: [{
          supplier: 'MIA',
          family: 'NIKE_AIR_MAX_97',
          color: 'preto',
          confidence: 0.98,
          status: 'ready',
          persisted: true,
          error_code: null,
          usage: { cost_usd: 0.0003 },
        }],
      })),
    })

    expect(out.ok).toBe(true)
    expect(out.scope_order).toEqual(['MIA_NIKE_AIR_MAX_97'])
    expect(out.totals.ready).toBe(1)
  })

  it('Air Max 95 MIA homologado entra na rotação diária e continua aceitando ciclo manual controlado', async () => {
    const daily = rotatedScopeKeys('supplier-cycle-v1:2026-10-06')
    expect(daily).toContain('MIA_NIKE_AIR_MAX_95')

    const scannerFn = vi.fn(async ({ scope_keys }) => ({
      ok: true,
      scopes: [{
        key: scope_keys[0],
        status: 'completed',
        scanned: 26,
        new_count: 1,
        changed_count: 0,
        baseline_count: 0,
        unchanged_count: 25,
        reactivated_count: 0,
        selected_for_pending: 1,
        deferred_changes: 0,
        deactivated: 0,
        write_failures: 0,
      }],
    }))

    const out = await runSupplierCatalogCycle({
      cycle_key: 'supplier-cycle-homologation:air-max-95-mia',
      trigger: 'manual_homologation',
      max_changes: 1,
      scope_keys: ['MIA_NIKE_AIR_MAX_95'],
    }, {
      ...DEPS,
      startFn: vi.fn(async () => ({
        ok: true,
        run_id: '95959595-9595-4595-8595-959595959595',
        accepted: true,
        status: 'running',
      })),
      finishFn: vi.fn(async () => ({ ok: true })),
      scannerFn,
      visionFn: vi.fn(async () => ({
        ok: true,
        queued: 1,
        processed: [{
          supplier: 'MIA',
          family: 'NIKE_AIR_MAX_95',
          color: 'branco',
          confidence: 0.98,
          status: 'ready',
          persisted: true,
          error_code: null,
          usage: { cost_usd: 0.0003 },
        }],
      })),
    })

    expect(out.ok).toBe(true)
    expect(out.scope_order).toEqual(['MIA_NIKE_AIR_MAX_95'])
    expect(out.totals.ready).toBe(1)
  })

  it('Air Max 90 MIA homologado entra na rotação diária e continua aceitando ciclo manual controlado', async () => {
    const daily = rotatedScopeKeys('supplier-cycle-v1:2026-10-06')
    expect(daily).toContain('MIA_NIKE_AIR_MAX_90')

    const scannerFn = vi.fn(async ({ scope_keys }) => ({
      ok: true,
      scopes: [{
        key: scope_keys[0],
        status: 'completed',
        scanned: 25,
        new_count: 1,
        changed_count: 0,
        baseline_count: 0,
        unchanged_count: 24,
        reactivated_count: 0,
        selected_for_pending: 1,
        deferred_changes: 0,
        deactivated: 0,
        write_failures: 0,
      }],
    }))

    const out = await runSupplierCatalogCycle({
      cycle_key: 'supplier-cycle-homologation:air-max-90-mia',
      trigger: 'manual_homologation',
      max_changes: 1,
      scope_keys: ['MIA_NIKE_AIR_MAX_90'],
    }, {
      ...DEPS,
      startFn: vi.fn(async () => ({
        ok: true,
        run_id: '90909090-9090-4090-8090-909090909090',
        accepted: true,
        status: 'running',
      })),
      finishFn: vi.fn(async () => ({ ok: true })),
      scannerFn,
      visionFn: vi.fn(async () => ({
        ok: true,
        queued: 1,
        processed: [{
          supplier: 'MIA',
          family: 'NIKE_AIR_MAX_90',
          color: 'cinza / branco',
          confidence: 0.97,
          status: 'ready',
          persisted: true,
          error_code: null,
          usage: { cost_usd: 0.0003 },
        }],
      })),
    })

    expect(out.ok).toBe(true)
    expect(out.scope_order).toEqual(['MIA_NIKE_AIR_MAX_90'])
    expect(out.totals.ready).toBe(1)
  })

  it('Air Jordan 1 homologado entra na rotação diária e continua aceitando ciclo manual controlado', async () => {
    const daily = rotatedScopeKeys('supplier-cycle-v1:2026-10-06')
    for (const key of [
      'VIVIAN_NIKE_AIR_JORDAN_1_ALTO',
      'VIVIAN_NIKE_AIR_JORDAN_1_LOW',
      'MIA_NIKE_AIR_JORDAN_1_A',
      'MIA_NIKE_AIR_JORDAN_1_B',
    ]) {
      expect(daily).toContain(key)
    }

    const scannerFn = vi.fn(async ({ scope_keys }) => ({
      ok: true,
      scopes: [{
        key: scope_keys[0],
        status: 'completed',
        scanned: 27,
        new_count: 1,
        changed_count: 0,
        baseline_count: 0,
        unchanged_count: 26,
        reactivated_count: 0,
        selected_for_pending: 1,
        deferred_changes: 0,
        deactivated: 0,
        write_failures: 0,
      }],
    }))

    const out = await runSupplierCatalogCycle({
      cycle_key: 'supplier-cycle-homologation:air-jordan-1-vivian-alto',
      trigger: 'manual_homologation',
      max_changes: 1,
      scope_keys: ['VIVIAN_NIKE_AIR_JORDAN_1_ALTO'],
    }, {
      ...DEPS,
      startFn: vi.fn(async () => ({
        ok: true,
        run_id: 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1',
        accepted: true,
        status: 'running',
      })),
      finishFn: vi.fn(async () => ({ ok: true })),
      scannerFn,
      visionFn: vi.fn(async () => ({
        ok: true,
        queued: 1,
        processed: [{
          supplier: 'VIVIAN',
          family: 'NIKE_AIR_JORDAN_1',
          color: 'preto / azul',
          confidence: 0.95,
          status: 'ready',
          persisted: true,
          error_code: null,
          usage: { cost_usd: 0.0003 },
        }],
      })),
    })

    expect(out.ok).toBe(true)
    expect(out.scope_order).toEqual(['VIVIAN_NIKE_AIR_JORDAN_1_ALTO'])
    expect(out.totals.ready).toBe(1)
  })

  it('Air Jordan 3 MIA homologado entra na rotação diária e continua aceitando ciclo manual', async () => {
    const daily = rotatedScopeKeys('supplier-cycle-v1:2026-10-06')
    expect(daily).toContain('MIA_NIKE_AIR_JORDAN_3')

    const scannerFn = vi.fn(async ({ scope_keys }) => ({
      ok: true,
      scopes: [{
        key: scope_keys[0],
        status: 'completed',
        scanned: 7,
        new_count: 1,
        changed_count: 0,
        baseline_count: 0,
        unchanged_count: 6,
        reactivated_count: 0,
        selected_for_pending: 1,
        deferred_changes: 0,
        deactivated: 0,
        write_failures: 0,
      }],
    }))

    const out = await runSupplierCatalogCycle({
      cycle_key: 'supplier-cycle-homologation:air-jordan-3-mia',
      trigger: 'manual_homologation',
      max_changes: 1,
      scope_keys: ['MIA_NIKE_AIR_JORDAN_3'],
    }, {
      ...DEPS,
      startFn: vi.fn(async () => ({
        ok: true,
        run_id: 'a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3',
        accepted: true,
        status: 'running',
      })),
      finishFn: vi.fn(async () => ({ ok: true })),
      scannerFn,
      visionFn: vi.fn(async () => ({
        ok: true,
        queued: 1,
        processed: [{
          supplier: 'MIA',
          family: 'NIKE_AIR_JORDAN_3',
          color: 'branco / vermelho',
          confidence: 0.97,
          status: 'ready',
          persisted: true,
          error_code: null,
          usage: { cost_usd: 0.0003 },
        }],
      })),
    })

    expect(out.ok).toBe(true)
    expect(out.scope_order).toEqual(['MIA_NIKE_AIR_JORDAN_3'])
    expect(out.totals.ready).toBe(1)
  })

  it('Air Jordan 4 MIA-only homologado entra na rotação diária e continua aceitando ciclo manual', async () => {
    const daily = rotatedScopeKeys('supplier-cycle-v1:2026-10-06')
    expect(daily).toContain('MIA_NIKE_AIR_JORDAN_4')

    const scannerFn = vi.fn(async ({ scope_keys }) => ({
      ok: true,
      scopes: [{
        key: scope_keys[0],
        status: 'completed',
        scanned: 18,
        new_count: 1,
        changed_count: 0,
        baseline_count: 0,
        unchanged_count: 17,
        reactivated_count: 0,
        selected_for_pending: 1,
        deferred_changes: 0,
        deactivated: 0,
        write_failures: 0,
      }],
    }))

    const out = await runSupplierCatalogCycle({
      cycle_key: 'supplier-cycle-homologation:air-jordan-4-mia',
      trigger: 'manual_homologation',
      max_changes: 1,
      scope_keys: ['MIA_NIKE_AIR_JORDAN_4'],
    }, {
      ...DEPS,
      startFn: vi.fn(async () => ({
        ok: true,
        run_id: 'a4a4a4a4-a4a4-4a4a-8a4a-a4a4a4a4a4a4',
        accepted: true,
        status: 'running',
      })),
      finishFn: vi.fn(async () => ({ ok: true })),
      scannerFn,
      visionFn: vi.fn(async () => ({
        ok: true,
        queued: 1,
        processed: [{
          supplier: 'MIA',
          family: 'NIKE_AIR_JORDAN_4',
          color: 'branco',
          confidence: 0.98,
          status: 'ready',
          persisted: true,
          error_code: null,
          usage: { cost_usd: 0.0003 },
        }],
      })),
    })

    expect(out.ok).toBe(true)
    expect(out.scope_order).toEqual(['MIA_NIKE_AIR_JORDAN_4'])
    expect(out.totals.ready).toBe(1)
  })

  it('usa no máximo 3 mudanças e continua para outro scope se um não tiver delta', async () => {
    const startFn = vi.fn(async () => ({
      ok: true,
      run_id: '11111111-1111-4111-8111-111111111111',
      accepted: true,
      status: 'running',
    }))

    const finishFn = vi.fn(async () => ({
      ok: true,
      error_code: null,
    }))

    let scanIndex = 0
    const scannerFn = vi.fn(async ({ scope_keys }) => {
      scanIndex += 1
      const selected = scanIndex === 1 ? 0 : 1
      return {
        ok: true,
        scopes: [{
          key: scope_keys[0],
          status: 'completed',
          scanned: 10,
          new_count: selected,
          changed_count: 0,
          baseline_count: 1,
          unchanged_count: 8,
          reactivated_count: 0,
          selected_for_pending: selected,
          deferred_changes: 0,
          deactivated: 0,
          write_failures: 0,
        }],
      }
    })

    const visionFn = vi.fn(async ({ limit }) => {
      expect(limit).toBe(3)
      return {
        ok: true,
        queued: 3,
        processed: [
          {
            supplier: 'VIVIAN',
            family: 'NIKE_AIR_FORCE_1',
            color: 'preto',
            confidence: 0.96,
            status: 'ready',
            persisted: true,
            error_code: null,
            usage: { cost_usd: 0.0003 },
          },
          {
            supplier: 'VIVIAN',
            family: 'NEW_BALANCE_9060',
            color: 'cinza',
            confidence: 0.95,
            status: 'ready',
            persisted: true,
            error_code: null,
            usage: { cost_usd: 0.0003 },
          },
          {
            supplier: 'MIA',
            family: 'NIKE_AIR_FORCE_1',
            color: 'branco',
            confidence: 0.93,
            status: 'ready',
            persisted: true,
            error_code: null,
            usage: { cost_usd: 0.0003 },
          },
        ],
      }
    })

    const out = await runSupplierCatalogCycle({
      cycle_key: 'supplier-cycle-v1:2026-10-05',
      trigger: 'test',
      max_changes: 3,
    }, {
      ...DEPS,
      startFn,
      finishFn,
      scannerFn,
      visionFn,
    })

    expect(out.ok).toBe(true)
    expect(scannerFn).toHaveBeenCalledTimes(4)
    expect(out.totals.selected_for_pending).toBe(3)
    expect(out.totals.ready).toBe(3)
    expect(out.totals.review).toBe(0)
    expect(out.totals.error).toBe(0)
    expect(out.totals.cost_usd).toBeCloseTo(0.0009, 8)
    expect(out.side_effects).toEqual({
      supplier_shadow_write: true,
      vision_call: true,
      cycle_ledger_write: true,
      gptmaker_call: false,
      customer_message: false,
      gaby_official: false,
    })
    expect(finishFn).toHaveBeenCalledTimes(1)
  })

  it('cycle_key duplicada não roda scanner nem Vision', async () => {
    const scannerFn = vi.fn()
    const visionFn = vi.fn()
    const finishFn = vi.fn()

    const out = await runSupplierCatalogCycle({
      cycle_key: 'supplier-cycle-v1:2026-10-05',
      trigger: 'test',
      max_changes: 3,
    }, {
      ...DEPS,
      startFn: vi.fn(async () => ({
        ok: true,
        run_id: '22222222-2222-4222-8222-222222222222',
        accepted: false,
        status: 'completed',
      })),
      finishFn,
      scannerFn,
      visionFn,
    })

    expect(out.ok).toBe(true)
    expect(out.duplicate).toBe(true)
    expect(scannerFn).not.toHaveBeenCalled()
    expect(visionFn).not.toHaveBeenCalled()
    expect(finishFn).not.toHaveBeenCalled()
  })

  it('erro de provider Vision fecha o ciclo como partial', async () => {
    const out = await runSupplierCatalogCycle({
      cycle_key: 'supplier-cycle-v1:2026-10-07',
      trigger: 'test',
      max_changes: 1,
    }, {
      ...DEPS,
      startFn: vi.fn(async () => ({
        ok: true,
        run_id: '33333333-3333-4333-8333-333333333333',
        accepted: true,
        status: 'running',
      })),
      finishFn: vi.fn(async () => ({ ok: true })),
      scannerFn: vi.fn(async ({ scope_keys }) => ({
        ok: true,
        scopes: [{
          key: scope_keys[0],
          status: 'completed',
          scanned: 1,
          new_count: 1,
          changed_count: 0,
          baseline_count: 0,
          unchanged_count: 0,
          reactivated_count: 0,
          selected_for_pending: 1,
          deferred_changes: 0,
          deactivated: 0,
          write_failures: 0,
        }],
      })),
      visionFn: vi.fn(async () => ({
        ok: true,
        queued: 1,
        processed: [{
          supplier: 'MIA',
          family: 'NIKE_AIR_FORCE_1',
          status: 'error',
          persisted: false,
          error_code: 'VISION_PROVIDER_ERROR',
          usage: { cost_usd: null },
        }],
      })),
    })

    expect(out.ok).toBe(false)
    expect(out.status).toBe('partial')
    expect(out.totals.error).toBe(1)
    expect(out.error_code).toBe('CYCLE_PARTIAL')
  })
})

describe('Supplier Catalog Cycle endpoint — segurança', () => {
  it('fica OFF por padrão', async () => {
    const res = mockRes()

    await handleSupplierCatalogCycleRequest({
      method: 'POST',
      headers: {},
      body: {},
    }, res, { env: {} })

    expect(res.state.status).toBe(404)
    expect(res.state.payload.error).toBe('SUPPLIER_CATALOG_CYCLE_DISABLED')
  })

  it('token incorreto bloqueia antes de qualquer execução', async () => {
    const res = mockRes()
    const scannerFn = vi.fn()

    await handleSupplierCatalogCycleRequest({
      method: 'POST',
      headers: {
        'x-prime-cycle-token': 'wrong',
      },
      body: {
        confirm: 'SUPPLIER_CATALOG_CYCLE_LAB',
      },
    }, res, {
      env: {
        SUPPLIER_CATALOG_CYCLE_ENABLED: 'true',
        SUPPLIER_CATALOG_CYCLE_TOKEN: 'cycle-secret',
      },
      scannerFn,
    })

    expect(res.state.status).toBe(403)
    expect(res.state.payload.error).toBe('SUPPLIER_CYCLE_TOKEN_INVALID')
    expect(scannerFn).not.toHaveBeenCalled()
  })

  it('write real exige confirmação explícita', async () => {
    const res = mockRes()
    const scannerFn = vi.fn()

    await handleSupplierCatalogCycleRequest({
      method: 'POST',
      headers: {
        'x-prime-cycle-token': 'cycle-secret',
      },
      body: {},
    }, res, {
      env: {
        SUPPLIER_CATALOG_CYCLE_ENABLED: 'true',
        SUPPLIER_CATALOG_CYCLE_TOKEN: 'cycle-secret',
      },
      scannerFn,
    })

    expect(res.state.status).toBe(400)
    expect(res.state.payload.error).toBe('SUPPLIER_CYCLE_CONFIRMATION_REQUIRED')
    expect(scannerFn).not.toHaveBeenCalled()
  })

  it('endpoint autorizado executa ciclo injetado sem tocar GABY', async () => {
    const res = mockRes()

    await handleSupplierCatalogCycleRequest({
      method: 'POST',
      headers: {
        'x-prime-cycle-token': 'cycle-secret',
      },
      body: {
        confirm: 'SUPPLIER_CATALOG_CYCLE_LAB',
        cycle_key: 'supplier-cycle-test:2026-10-05',
        trigger: 'test',
        max_changes: 1,
      },
    }, res, {
      env: {
        SUPPLIER_CATALOG_CYCLE_ENABLED: 'true',
        SUPPLIER_CATALOG_CYCLE_TOKEN: 'cycle-secret',
        SUPABASE_URL: 'https://mock.supabase.co',
        VITE_SUPABASE_KEY: 'public-key',
        SUPPLIER_DRIVE_SCANNER_TOKEN: 'scanner-token',
        SUPPLIER_VISION_WORKER_TOKEN: 'worker-token',
      },
      startFn: vi.fn(async () => ({
        ok: true,
        run_id: '44444444-4444-4444-8444-444444444444',
        accepted: true,
        status: 'running',
      })),
      finishFn: vi.fn(async () => ({ ok: true })),
      scannerFn: vi.fn(async ({ scope_keys }) => ({
        ok: true,
        scopes: [{
          key: scope_keys[0],
          status: 'completed',
          scanned: 1,
          new_count: 1,
          changed_count: 0,
          baseline_count: 0,
          unchanged_count: 0,
          reactivated_count: 0,
          selected_for_pending: 1,
          deferred_changes: 0,
          deactivated: 0,
          write_failures: 0,
        }],
      })),
      visionFn: vi.fn(async () => ({
        ok: true,
        queued: 1,
        processed: [{
          supplier: 'VIVIAN',
          family: 'NIKE_AIR_FORCE_1',
          color: 'preto',
          confidence: 0.97,
          status: 'ready',
          persisted: true,
          error_code: null,
          usage: { cost_usd: 0.0003 },
        }],
      })),
    })

    expect(res.state.status).toBe(200)
    expect(res.state.payload.ok).toBe(true)
    expect(res.state.payload.side_effects.gaby_official).toBe(false)
    expect(res.state.payload.side_effects.customer_message).toBe(false)
  })
})

describe('038_supplier_catalog_cycle_v1.sql — retry + ledger', () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const sql = fs.readFileSync(
    path.resolve(
      here,
      '../../supabase/migrations/038_supplier_catalog_cycle_v1.sql'
    ),
    'utf8'
  )

  it('adiciona contador e horário da tentativa Vision', () => {
    expect(sql).toContain('vision_attempt_count integer not null default 0')
    expect(sql).toContain('last_vision_attempt_at timestamptz')
    expect(sql).toContain('vision_attempt_count = s.vision_attempt_count + 1')
    expect(sql).toContain('last_vision_attempt_at = now()')
  })

  it('review automático limita a 2 tentativas com intervalo de 24 horas', () => {
    expect(sql).toContain('s.vision_attempt_count < 2')
    expect(sql).toContain("s.last_vision_attempt_at <= now() - interval '24 hours'")
  })

  it('mudança para pending reseta contador de Vision', () => {
    expect(sql).toContain('new.vision_attempt_count := 0')
    expect(sql).toContain('new.last_vision_attempt_at := null')
    expect(sql).toContain('trg_supplier_vision_attempt_reset')
  })

  it('cria ledger do ciclo com cycle_key única e max 1..3', () => {
    expect(sql).toContain('create table if not exists public.supplier_catalog_cycle_runs')
    expect(sql).toContain('cycle_key text not null unique')
    expect(sql).toContain('check (max_changes between 1 and 3)')
  })

  it('duplicate cycle é bloqueado por start RPC idempotente', () => {
    expect(sql).toContain('on conflict (cycle_key) do nothing')
    expect(sql).toContain('accepted := false')
  })

  it('RLS permanece fechada e sem grant direto na tabela', () => {
    expect(sql).toContain(
      'alter table public.supplier_catalog_cycle_runs enable row level security'
    )
    expect(sql).toContain(
      'revoke all on table public.supplier_catalog_cycle_runs'
    )
    expect(sql.toLowerCase()).not.toContain(
      'grant select on table public.supplier_catalog_cycle_runs'
    )
    expect(sql.toLowerCase()).not.toContain(
      'grant insert on table public.supplier_catalog_cycle_runs'
    )
    expect(sql.toLowerCase()).not.toContain(
      'grant update on table public.supplier_catalog_cycle_runs'
    )
  })

  it('guarda apenas hash do token do ciclo', () => {
    expect(sql).toContain(
      'bd10d0ac064687a589531591e114671fdb37c1a37aa7fa64a506a1af05a8cd13'
    )
    expect(sql).not.toContain('IB9B03gStbI59SOD4KFneY0rm6L0EZzLv9KCy2mR8_M')
  })
})


describe('039_supplier_catalog_cycle_schedule.sql — agendamento diário', () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const sql = fs.readFileSync(
    path.resolve(
      here,
      '../../supabase/migrations/039_supplier_catalog_cycle_schedule.sql'
    ),
    'utf8'
  )

  it('agenda uma vez ao dia às 07:00 UTC = 04:00 BRT', () => {
    expect(sql).toContain("'0 7 * * *'")
    expect(sql).toContain("timezone('America/Sao_Paulo', now())")
  })

  it('limita o ciclo automático a 3 mudanças', () => {
    expect(sql).toContain("'max_changes', 3")
  })

  it('usa Vault por nome e não grava token em plaintext', () => {
    expect(sql).toContain("prime_supplier_cycle_url")
    expect(sql).toContain("prime_supplier_cycle_token")
    expect(sql).not.toContain('IB9B03gStbI59SOD4KFneY0rm6L0EZzLv9KCy2mR8_M')
  })

  it('chama somente o endpoint LAB e mantém confirmação explícita', () => {
    expect(sql).toContain("'confirm', 'SUPPLIER_CATALOG_CYCLE_LAB'")
    expect(sql).toContain("'trigger', 'supabase_cron'")
    expect(sql).toContain('timeout_milliseconds := 240000')
  })

  it('remove agendamento anterior com o mesmo nome antes de recriar', () => {
    expect(sql).toContain("jobname = 'prime-supplier-catalog-cycle-v1'")
    expect(sql).toContain('cron.unschedule(v_job_id)')
    expect(sql).toContain("'prime-supplier-catalog-cycle-v1'")
  })
})
