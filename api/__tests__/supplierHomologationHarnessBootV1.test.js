import { describe, it, expect, vi } from 'vitest'

import {
  isSupplierHomologationHarnessBootEnabled,
  parseSupplierHomologationHarnessBootInput,
  buildComparisonBootDiagnostics,
  buildVisionBootDiagnostics,
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

  it('usa proxy local quando baseUrl é fornecido no boot', async () => {
    const runHarnessFn = vi.fn(async () => ({
      ok: true,
      mode: 'vision',
      verdict: 'PASS',
      vision: {
        total: 1,
        ready: 1,
        review: 0,
        errors: 0,
        cost_usd: 0.0003,
        results: [],
      },
    }))

    await runSupplierHomologationHarnessBoot({
      env: {
        SUPPLIER_HOMOLOGATION_HARNESS_BOOT_ENABLED: 'true',
        SUPPLIER_HOMOLOGATION_HARNESS_BOOT_INPUT: JSON.stringify({
          run_key: 'local-proxy-v1',
          mode: 'vision',
          expected: {
            canonical_family: 'NEW_BALANCE_FUELCELL_REBEL_V4',
          },
          samples: [{
            supplier_key: 'VIVIAN',
            drive_file_id: 'secret-drive-id',
          }],
        }),
      },
      baseUrl: 'http://127.0.0.1:10000/',
      runHarnessFn,
      logger: { log: vi.fn() },
    })

    expect(runHarnessFn).toHaveBeenCalledTimes(1)
    expect(runHarnessFn.mock.calls[0][1]).toMatchObject({
      visionProxyUrl:
        'http://127.0.0.1:10000/api/supplier-harness-ocr-proxy',
    })
  })

  it('proxy explícito do ambiente tem prioridade sobre o fallback local', async () => {
    const runHarnessFn = vi.fn(async (_input, deps) => ({
      ok: true,
      mode: 'vision',
      verdict: 'PASS',
      vision: {
        total: 1,
        ready: 1,
        review: 0,
        errors: 0,
        cost_usd: 0.0003,
        results: [],
      },
      deps,
    }))

    await runSupplierHomologationHarnessBoot({
      env: {
        SUPPLIER_HOMOLOGATION_HARNESS_BOOT_ENABLED: 'true',
        SUPPLIER_HOMOLOGATION_HARNESS_VISION_PROXY_URL:
          'https://ignite-webhook.vercel.app/api/system-tools?tool=ocr-openrouter',
        SUPPLIER_HOMOLOGATION_HARNESS_BOOT_INPUT: JSON.stringify({
          run_key: 'env-proxy-v1',
          mode: 'vision',
          expected: {
            canonical_family: 'NEW_BALANCE_FUELCELL_REBEL_V4',
          },
          samples: [{
            supplier_key: 'VIVIAN',
            drive_file_id: 'secret-drive-id',
          }],
        }),
      },
      baseUrl: 'http://127.0.0.1:10000',
      runHarnessFn,
      logger: { log: vi.fn() },
    })

    const deps = runHarnessFn.mock.calls[0][1]
    expect(deps).not.toHaveProperty(
      'visionProxyUrl',
      'http://127.0.0.1:10000/api/supplier-harness-ocr-proxy',
    )
    expect(deps.env.SUPPLIER_HOMOLOGATION_HARNESS_VISION_PROXY_URL)
      .toContain('ignite-webhook.vercel.app')
  })

  it('resume diagnostics de Vision sem expor drive_file_id ou payload', () => {
    const diagnostics = buildVisionBootDiagnostics({
      vision: {
        results: [{
          index: 0,
          label: 'HEIF_1',
          drive_file_id: 'secret-drive-id',
          status: 'review',
          error_code: 'VISION_PROXY_HTTP_503',
          validation: {
            values: { vision_confidence: 0.72 },
          },
          usage: { cost_usd: 0.0004 },
          parsed: { raw: 'secret' },
        }],
      },
    })

    expect(diagnostics).toEqual([{
      index: 0,
      label: 'HEIF_1',
      status: 'review',
      error_code: 'VISION_PROXY_HTTP_503',
      confidence: 0.72,
      cost_usd: 0.0004,
    }])
    expect(diagnostics[0]).not.toHaveProperty('drive_file_id')
    expect(diagnostics[0]).not.toHaveProperty('parsed')
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
