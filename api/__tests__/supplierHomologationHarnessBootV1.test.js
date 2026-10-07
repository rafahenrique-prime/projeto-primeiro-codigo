import { describe, it, expect, vi } from 'vitest'

import {
  isSupplierHomologationHarnessBootEnabled,
  parseSupplierHomologationHarnessBootInput,
  buildComparisonBootDiagnostics,
  runSupplierHomologationHarnessBoot,
} from '../_supplierHomologationHarnessBoot.js'

describe('Supplier Homologation Harness Boot V1', () => {
  it('fica OFF por padrão', () => {
    expect(isSupplierHomologationHarnessBootEnabled({})).toBe(false)
    expect(isSupplierHomologationHarnessBootEnabled({
      SUPPLIER_HOMOLOGATION_HARNESS_BOOT_ENABLED: 'false',
    })).toBe(false)
  })

  it('exige JSON válido e run_key', () => {
    expect(parseSupplierHomologationHarnessBootInput({}))
      .toMatchObject({ ok: false, error: 'HARNESS_BOOT_INPUT_MISSING' })

    expect(parseSupplierHomologationHarnessBootInput({
      SUPPLIER_HOMOLOGATION_HARNESS_BOOT_INPUT: '{bad',
    })).toMatchObject({
      ok: false,
      error: 'HARNESS_BOOT_INPUT_INVALID_JSON',
    })

    expect(parseSupplierHomologationHarnessBootInput({
      SUPPLIER_HOMOLOGATION_HARNESS_BOOT_INPUT: '{"mode":"vision"}',
    })).toMatchObject({
      ok: false,
      error: 'HARNESS_BOOT_RUN_KEY_REQUIRED',
    })
  })

  it('parseia input genérico com família e amostras', () => {
    const parsed = parseSupplierHomologationHarnessBootInput({
      SUPPLIER_HOMOLOGATION_HARNESS_BOOT_INPUT: JSON.stringify({
        run_key: 'aj3-mia-v1',
        mode: 'vision',
        expected: {
          canonical_family: 'NIKE_AIR_JORDAN_3',
        },
        samples: [{
          supplier_key: 'MIA',
          drive_file_id: 'drive-1',
        }],
      }),
    })

    expect(parsed.ok).toBe(true)
    expect(parsed.run_key).toBe('aj3-mia-v1')
    expect(parsed.input.expected.canonical_family)
      .toBe('NIKE_AIR_JORDAN_3')
  })

  it('não chama Harness quando boot está OFF', async () => {
    const runHarnessFn = vi.fn()
    const logger = { log: vi.fn() }

    const out = await runSupplierHomologationHarnessBoot({
      env: {},
      runHarnessFn,
      logger,
    })

    expect(out).toMatchObject({
      ok: true,
      skipped: true,
      reason: 'HARNESS_BOOT_DISABLED',
    })
    expect(runHarnessFn).not.toHaveBeenCalled()
    expect(logger.log).not.toHaveBeenCalled()
  })

  it('executa Harness genérico e registra resumo sem payload sensível', async () => {
    const runHarnessFn = vi.fn(async input => ({
      ok: true,
      mode: input.mode,
      verdict: 'PASS',
      vision: {
        total: 4,
        ready: 4,
        review: 0,
        errors: 0,
        cost_usd: 0.0012,
      },
      product_universe: null,
    }))
    const logger = { log: vi.fn() }

    const out = await runSupplierHomologationHarnessBoot({
      env: {
        SUPPLIER_HOMOLOGATION_HARNESS_BOOT_ENABLED: 'true',
        SUPPLIER_HOMOLOGATION_HARNESS_BOOT_INPUT: JSON.stringify({
          run_key: 'aj3-mia-v1',
          mode: 'vision',
          expected: {
            brand: 'Nike',
            canonical_family: 'NIKE_AIR_JORDAN_3',
            model: 'Nike Air Jordan 3',
            category: 'Tênis',
          },
          samples: [{
            supplier_key: 'MIA',
            drive_file_id: 'drive-secret-file-id',
          }],
        }),
      },
      runHarnessFn,
      logger,
    })

    expect(out.ok).toBe(true)
    expect(out.skipped).toBe(false)
    expect(out.run_key).toBe('aj3-mia-v1')
    expect(runHarnessFn).toHaveBeenCalledTimes(1)

    const logText = logger.log.mock.calls[0][0]
    const event = JSON.parse(logText)
    expect(event).toMatchObject({
      event: 'SUPPLIER_HOMOLOGATION_HARNESS_BOOT',
      run_key: 'aj3-mia-v1',
      ok: true,
      verdict: 'PASS',
      vision_total: 4,
      vision_ready: 4,
      vision_review: 0,
      vision_errors: 0,
    })
    expect(logText).not.toContain('drive-secret-file-id')
  })

  it('resume diagnostics de comparação com campos mínimos', () => {
    const diagnostics = buildComparisonBootDiagnostics({
      comparison: {
        results: [{
          index: 0,
          label: 'BOROUGH',
          drive_file_id: 'x',
          expected_family: 'NIKE_COURT_BOROUGH',
          chosen_family: null,
          confidence: null,
          error_code: 'VISION_COMPARE_INVALID_JSON',
          provider_status: 200,
          usage: { output_tokens: 650, cost_usd: 0.0017 },
          parsed: { raw: 'y' },
        }],
      },
    })

    expect(diagnostics).toEqual([{
      index: 0,
      label: 'BOROUGH',
      expected_family: 'NIKE_COURT_BOROUGH',
      chosen_family: null,
      confidence: null,
      error_code: 'VISION_COMPARE_INVALID_JSON',
      provider_status: 200,
      output_tokens: 650,
      cost_usd: 0.0017,
    }])
    expect(diagnostics[0]).not.toHaveProperty('drive_file_id')
    expect(diagnostics[0]).not.toHaveProperty('parsed')
  })

  it('erro do Harness vira evento controlado', async () => {
    const logger = { log: vi.fn() }
    const out = await runSupplierHomologationHarnessBoot({
      env: {
        SUPPLIER_HOMOLOGATION_HARNESS_BOOT_ENABLED: 'true',
        SUPPLIER_HOMOLOGATION_HARNESS_BOOT_INPUT: JSON.stringify({
          run_key: 'broken-run',
          mode: 'vision',
        }),
      },
      runHarnessFn: vi.fn(async () => {
        throw new Error('boom')
      }),
      logger,
    })

    expect(out.ok).toBe(false)
    expect(out.event.error).toBe('boom')
    expect(logger.log).toHaveBeenCalledTimes(1)
  })
})
