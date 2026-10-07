import { describe, it, expect, vi } from 'vitest'

import {
  isSupplierHomologationPromotionBootEnabled,
  parseSupplierHomologationPromotionBootInput,
  runSupplierHomologationPromotionBoot,
} from '../_supplierHomologationPromotionBoot.js'

describe('Supplier Homologation Promotion Gate V1', () => {
  it('fica OFF por padrão', () => {
    expect(isSupplierHomologationPromotionBootEnabled({})).toBe(false)
  })

  it('exige run_key e scope_key válidos', () => {
    expect(parseSupplierHomologationPromotionBootInput({}))
      .toMatchObject({ ok: false, error: 'PROMOTION_BOOT_INPUT_MISSING' })

    expect(parseSupplierHomologationPromotionBootInput({
      SUPPLIER_HOMOLOGATION_PROMOTION_BOOT_INPUT: '{"run_key":"aj3"}',
    })).toMatchObject({
      ok: false,
      error: 'PROMOTION_BOOT_SCOPE_KEY_REQUIRED',
    })

    const parsed = parseSupplierHomologationPromotionBootInput({
      SUPPLIER_HOMOLOGATION_PROMOTION_BOOT_INPUT: JSON.stringify({
        run_key: 'air-jordan-3-mia-gate1',
        scope_key: 'MIA_NIKE_AIR_JORDAN_3',
      }),
    })

    expect(parsed.ok).toBe(true)
    expect(parsed.input).toEqual({
      run_key: 'air-jordan-3-mia-gate1',
      scope_key: 'MIA_NIKE_AIR_JORDAN_3',
      max_changes: 1,
      cycle_key: 'supplier-cycle-homologation:air-jordan-3-mia-gate1',
    })

    expect(parseSupplierHomologationPromotionBootInput({
      SUPPLIER_HOMOLOGATION_PROMOTION_BOOT_INPUT: JSON.stringify({
        run_key: 'bad-batch',
        scope_key: 'MIA_NIKE_AIR_JORDAN_3',
        max_changes: 4,
      }),
    })).toMatchObject({
      ok: false,
      error: 'PROMOTION_BOOT_MAX_CHANGES_INVALID',
    })
  })

  it('não executa quando OFF', async () => {
    const fetchImpl = vi.fn()
    const logger = { log: vi.fn() }

    const out = await runSupplierHomologationPromotionBoot({
      env: {},
      fetchImpl,
      baseUrl: 'http://127.0.0.1:10000',
      logger,
    })

    expect(out).toMatchObject({
      ok: true,
      skipped: true,
      reason: 'PROMOTION_BOOT_DISABLED',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(logger.log).not.toHaveBeenCalled()
  })

  it('mantém max_changes=1 por padrão e um único scope', async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body)

      expect(init.headers['x-prime-cycle-token']).toBe('cycle-secret')
      expect(body).toEqual({
        confirm: 'SUPPLIER_CATALOG_CYCLE_LAB',
        cycle_key: 'supplier-cycle-homologation:air-jordan-3-mia-gate1',
        trigger: 'manual_homologation',
        max_changes: 1,
        scope_keys: ['MIA_NIKE_AIR_JORDAN_3'],
      })

      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          cycle_key: body.cycle_key,
          status: 'completed',
          totals: {
            selected_for_pending: 1,
            ready: 1,
            review: 0,
            error: 0,
            cost_usd: 0.0003,
          },
          duplicate: false,
        }),
      }
    })
    const logger = { log: vi.fn() }

    const out = await runSupplierHomologationPromotionBoot({
      env: {
        SUPPLIER_HOMOLOGATION_PROMOTION_BOOT_ENABLED: 'true',
        SUPPLIER_HOMOLOGATION_PROMOTION_BOOT_INPUT: JSON.stringify({
          run_key: 'air-jordan-3-mia-gate1',
          scope_key: 'MIA_NIKE_AIR_JORDAN_3',
        }),
        SUPPLIER_CATALOG_CYCLE_TOKEN: 'cycle-secret',
      },
      fetchImpl,
      baseUrl: 'http://127.0.0.1:10000',
      logger,
    })

    expect(out.ok).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(out.event).toMatchObject({
      ready: 1,
      review: 0,
      error_count: 0,
      duplicate: false,
    })

    const logText = logger.log.mock.calls[0][0]
    expect(logText).not.toContain('cycle-secret')
  })

  it('aceita lote explícito de até 3 e só aprova se todo selecionado ficar ready', async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body)

      expect(body).toEqual({
        confirm: 'SUPPLIER_CATALOG_CYCLE_LAB',
        cycle_key: 'supplier-cycle-homologation:court-borough-batch3',
        trigger: 'manual_homologation',
        max_changes: 3,
        scope_keys: ['VIVIAN_NIKE_COURT_BOROUGH'],
      })

      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          cycle_key: body.cycle_key,
          status: 'completed',
          totals: {
            selected_for_pending: 3,
            ready: 3,
            review: 0,
            error: 0,
            cost_usd: 0.0009,
          },
          duplicate: false,
        }),
      }
    })

    const out = await runSupplierHomologationPromotionBoot({
      env: {
        SUPPLIER_HOMOLOGATION_PROMOTION_BOOT_ENABLED: 'true',
        SUPPLIER_HOMOLOGATION_PROMOTION_BOOT_INPUT: JSON.stringify({
          run_key: 'court-borough-batch3',
          scope_key: 'VIVIAN_NIKE_COURT_BOROUGH',
          max_changes: 3,
        }),
        SUPPLIER_CATALOG_CYCLE_TOKEN: 'secret',
      },
      fetchImpl,
      baseUrl: 'http://127.0.0.1:10000',
      logger: { log: vi.fn() },
    })

    expect(out.ok).toBe(true)
    expect(out.max_changes).toBe(3)
    expect(out.event).toMatchObject({
      max_changes: 3,
      selected_for_pending: 3,
      ready: 3,
      review: 0,
      error_count: 0,
    })
  })

  it('cycle_key fixo permite tratar repetição como sucesso idempotente', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        cycle_key: 'supplier-cycle-homologation:aj3-gate1',
        status: 'completed',
        totals: {
          selected_for_pending: 0,
          ready: 0,
          review: 0,
          error: 0,
          cost_usd: 0,
        },
        duplicate: true,
      }),
    }))

    const out = await runSupplierHomologationPromotionBoot({
      env: {
        SUPPLIER_HOMOLOGATION_PROMOTION_BOOT_ENABLED: 'true',
        SUPPLIER_HOMOLOGATION_PROMOTION_BOOT_INPUT: JSON.stringify({
          run_key: 'aj3-gate1',
          scope_key: 'MIA_NIKE_AIR_JORDAN_3',
        }),
        SUPPLIER_CATALOG_CYCLE_TOKEN: 'secret',
      },
      fetchImpl,
      baseUrl: 'http://127.0.0.1:10000',
      logger: { log: vi.fn() },
    })

    expect(out.ok).toBe(true)
    expect(out.event.duplicate).toBe(true)
  })

  it('review não é promoção aprovada', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        status: 'completed',
        totals: {
          selected_for_pending: 1,
          ready: 0,
          review: 1,
          error: 0,
          cost_usd: 0.0003,
        },
        duplicate: false,
      }),
    }))

    const out = await runSupplierHomologationPromotionBoot({
      env: {
        SUPPLIER_HOMOLOGATION_PROMOTION_BOOT_ENABLED: 'true',
        SUPPLIER_HOMOLOGATION_PROMOTION_BOOT_INPUT: JSON.stringify({
          run_key: 'aj3-review',
          scope_key: 'MIA_NIKE_AIR_JORDAN_3',
        }),
        SUPPLIER_CATALOG_CYCLE_TOKEN: 'secret',
      },
      fetchImpl,
      baseUrl: 'http://127.0.0.1:10000',
      logger: { log: vi.fn() },
    })

    expect(out.ok).toBe(false)
    expect(out.event.ready).toBe(0)
    expect(out.event.review).toBe(1)
  })
})
