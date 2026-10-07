import { describe, it, expect, vi } from 'vitest'

import {
  SUPPLIER_HOMOLOGATION_HARNESS_VERSION,
  SUPPLIER_HOMOLOGATION_MAX_SAMPLES,
  buildVisionComparePrompt,
  handleSupplierHomologationHarnessRequest,
  runSupplierHomologationHarness,
} from '../supplier-homologation-harness-v1.js'

import {
  GABY_OFFICIAL_AGENT_ID,
} from '../gaby-lab-product-universe-v1.js'

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

function readyVision(row, color = 'preto / branco') {
  return {
    ok: true,
    stage: 'vision',
    parsed: {
      brand: row.brand,
      canonical_family: row.canonical_family,
      model: row.detected_model,
      category: row.category,
      color,
      confidence: 0.97,
      family_match: true,
    },
    validation: {
      status: 'ready',
      error_code: null,
      values: {
        brand: row.brand,
        canonical_family: row.canonical_family,
        detected_model: row.detected_model,
        category: row.category,
        visual_color: color,
        vision_confidence: 0.97,
      },
    },
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      total_tokens: 120,
      cost_usd: 0.0003,
    },
    image: {
      content_type: 'image/jpeg',
      bytes: 12345,
    },
  }
}

const AJ3_INPUT = {
  mode: 'vision',
  expected: {
    brand: 'Nike',
    canonical_family: 'NIKE_AIR_JORDAN_3',
    model: 'Nike Air Jordan 3',
    category: 'Tênis',
  },
  samples: [
    {
      label: 'VIVIAN_SAMPLE',
      supplier_key: 'VIVIAN',
      drive_file_id: 'drive-vivian-1',
    },
    {
      label: 'MIA_SAMPLE',
      supplier_key: 'MIA',
      drive_file_id: 'drive-mia-1',
    },
  ],
}

describe('Supplier Homologation Harness V1 — read-only orchestration', () => {
  it('roda múltiplas amostras Vision e retorna PASS sem writes', async () => {
    const analyzeFn = vi.fn(async row => readyVision(row))

    const out = await runSupplierHomologationHarness(AJ3_INPUT, {
      analyzeFn,
    })

    expect(out.ok).toBe(true)
    expect(out.harness_version).toBe(SUPPLIER_HOMOLOGATION_HARNESS_VERSION)
    expect(out.mode).toBe('vision')
    expect(out.verdict).toBe('PASS')
    expect(out.vision.total).toBe(2)
    expect(out.vision.ready).toBe(2)
    expect(out.vision.review).toBe(0)
    expect(out.vision.errors).toBe(0)
    expect(out.vision.cost_usd).toBe(0.0006)
    expect(analyzeFn).toHaveBeenCalledTimes(2)

    expect(out.side_effects).toEqual({
      supplier_shadow_write: false,
      catalog_prime_write: false,
      gptmaker_call: false,
      customer_message: false,
      gaby_official_call: false,
      cron_activation: false,
    })
  })

  it('família divergente vira REVIEW sem tentar corrigir ou gravar', async () => {
    const analyzeFn = vi.fn(async row => ({
      ...readyVision(row),
      validation: {
        status: 'review',
        error_code: 'VISION_FAMILY_MISMATCH',
        values: {
          brand: row.brand,
          canonical_family: row.canonical_family,
          detected_model: row.detected_model,
          category: row.category,
          visual_color: 'branco',
          vision_confidence: 0.98,
        },
      },
    }))

    const out = await runSupplierHomologationHarness({
      ...AJ3_INPUT,
      samples: [AJ3_INPUT.samples[0]],
    }, { analyzeFn })

    expect(out.ok).toBe(true)
    expect(out.verdict).toBe('REVIEW')
    expect(out.vision.ready).toBe(0)
    expect(out.vision.review).toBe(1)
    expect(out.vision.results[0].error_code).toBe('VISION_FAMILY_MISMATCH')
    expect(out.side_effects.supplier_shadow_write).toBe(false)
  })

  it('vision_compare compara famílias sem vazar a resposta esperada no prompt', async () => {
    const compare = {
      brand: 'Nike',
      category: 'Tênis',
      candidates: [
        {
          canonical_family: 'NIKE_COURT_BOROUGH',
          model: 'Nike Court Borough',
        },
        {
          canonical_family: 'NIKE_COURT_VISION',
          model: 'Nike Court Vision',
        },
      ],
    }

    const prompt = buildVisionComparePrompt(compare)
    expect(prompt).toContain('NIKE_COURT_BOROUGH')
    expect(prompt).toContain('NIKE_COURT_VISION')
    expect(prompt).not.toContain('expected_family')

    const compareAnalyzeFn = vi.fn(async sample => ({
      ok: true,
      chosen_family: sample.expected_family,
      chosen_model:
        sample.expected_family === 'NIKE_COURT_BOROUGH'
          ? 'Nike Court Borough'
          : 'Nike Court Vision',
      confidence: 0.96,
      color: 'branco / preto',
      error_code: null,
      usage: { cost_usd: 0.0003 },
      image: { content_type: 'image/jpeg', bytes: 12345 },
    }))

    const out = await runSupplierHomologationHarness({
      mode: 'vision_compare',
      compare,
      samples: [
        {
          label: 'BOROUGH',
          supplier_key: 'VIVIAN',
          drive_file_id: 'borough-1',
          expected_family: 'NIKE_COURT_BOROUGH',
        },
        {
          label: 'VISION',
          supplier_key: 'MIA',
          drive_file_id: 'vision-1',
          expected_family: 'NIKE_COURT_VISION',
        },
      ],
    }, { compareAnalyzeFn })

    expect(out.ok).toBe(true)
    expect(out.verdict).toBe('PASS')
    expect(out.comparison.total).toBe(2)
    expect(out.comparison.matched).toBe(2)
    expect(out.comparison.review).toBe(0)
    expect(out.comparison.pass).toBe(true)
    expect(compareAnalyzeFn).toHaveBeenCalledTimes(2)
  })

  it('vision_compare vira REVIEW quando escolhe a família concorrente', async () => {
    const compareAnalyzeFn = vi.fn(async () => ({
      ok: true,
      chosen_family: 'NIKE_COURT_VISION',
      chosen_model: 'Nike Court Vision',
      confidence: 0.97,
      color: 'branco',
      error_code: null,
      usage: { cost_usd: 0.0003 },
    }))

    const out = await runSupplierHomologationHarness({
      mode: 'vision_compare',
      compare: {
        brand: 'Nike',
        category: 'Tênis',
        candidates: [
          {
            canonical_family: 'NIKE_COURT_BOROUGH',
            model: 'Nike Court Borough',
          },
          {
            canonical_family: 'NIKE_COURT_VISION',
            model: 'Nike Court Vision',
          },
        ],
      },
      samples: [{
        supplier_key: 'VIVIAN',
        drive_file_id: 'borough-1',
        expected_family: 'NIKE_COURT_BOROUGH',
      }],
    }, { compareAnalyzeFn })

    expect(out.ok).toBe(true)
    expect(out.verdict).toBe('REVIEW')
    expect(out.comparison.matched).toBe(0)
    expect(out.comparison.review).toBe(1)
    expect(out.comparison.results[0]).toMatchObject({
      expected_family: 'NIKE_COURT_BOROUGH',
      chosen_family: 'NIKE_COURT_VISION',
      match: false,
      status: 'review',
      error_code: 'VISION_COMPARE_MISMATCH',
    })
  })

  it('vision_compare exige ao menos duas famílias e expected_family válida', async () => {
    const out = await runSupplierHomologationHarness({
      mode: 'vision_compare',
      compare: {
        candidates: [{
          canonical_family: 'NIKE_COURT_BOROUGH',
          model: 'Nike Court Borough',
        }],
      },
      samples: [{
        supplier_key: 'VIVIAN',
        drive_file_id: 'borough-1',
        expected_family: 'NIKE_COURT_BOROUGH',
      }],
    }, { compareAnalyzeFn: vi.fn() })

    expect(out.ok).toBe(false)
    expect(out.error).toBe('HARNESS_COMPARE_CANDIDATES_REQUIRED')
  })

  it('modo full valida Vision + expectativas do Product Universe', async () => {
    const analyzeFn = vi.fn(async row => readyVision(row, 'branco / vermelho'))
    const productUniverseFn = vi.fn(async () => ({
      ok: true,
      http_status: 200,
      payload: {
        ok: true,
        decision: {
          canonical_family: 'NIKE_AIR_JORDAN_3',
          commercial: {
            action: 'CONTINUE_SALE',
            product_state: 'OFFERABLE',
          },
          best_match: {
            source: 'MIA',
            color: 'branco / vermelho',
            match_type: 'EXACT',
          },
          coverage: {
            supplier_count: 2,
          },
          price: {
            state: 'UNKNOWN',
            amount: null,
          },
          size: {
            state: 'OFFERABLE',
          },
        },
        source_status: {
          PRIME: { ok: true },
          VIVIAN: { mode: 'REAL_SHADOW_RPC' },
          MIA: { mode: 'REAL_SHADOW_RPC' },
        },
      },
    }))

    const out = await runSupplierHomologationHarness({
      ...AJ3_INPUT,
      mode: 'full',
      samples: [AJ3_INPUT.samples[0]],
      product_universe: {
        requested: {
          brand: 'Nike',
          model: 'Nike Air Jordan 3',
          color: 'branco / vermelho',
          size: '42',
        },
        expect: {
          canonical_family: 'NIKE_AIR_JORDAN_3',
          action: 'CONTINUE_SALE',
          product_state: 'OFFERABLE',
          price_state: 'UNKNOWN',
          price_amount_null: true,
          size_state: 'OFFERABLE',
          best_match_type: 'EXACT',
          min_supplier_count: 2,
        },
      },
    }, {
      analyzeFn,
      productUniverseFn,
    })

    expect(out.ok).toBe(true)
    expect(out.verdict).toBe('PASS')
    expect(out.product_universe.pass).toBe(true)
    expect(out.product_universe.decision.canonical_family)
      .toBe('NIKE_AIR_JORDAN_3')
    expect(out.product_universe.checks.every(check => check.pass)).toBe(true)
  })

  it('expectativa errada no Product Universe não mascara o problema', async () => {
    const productUniverseFn = vi.fn(async () => ({
      ok: true,
      http_status: 200,
      payload: {
        ok: true,
        decision: {
          canonical_family: 'NIKE_AIR_JORDAN_4',
          commercial: {
            action: 'CONTINUE_SALE',
            product_state: 'OFFERABLE',
          },
          best_match: {
            source: 'MIA',
            color: 'branco',
            match_type: 'EXACT',
          },
          coverage: { supplier_count: 1 },
          price: { state: 'UNKNOWN', amount: null },
          size: { state: 'OFFERABLE' },
        },
      },
    }))

    const out = await runSupplierHomologationHarness({
      mode: 'product_universe',
      product_universe: {
        requested: {
          brand: 'Nike',
          model: 'Nike Air Jordan 3',
          color: 'branco',
          size: '42',
        },
        expect: {
          canonical_family: 'NIKE_AIR_JORDAN_3',
        },
      },
    }, {
      productUniverseFn,
    })

    expect(out.ok).toBe(true)
    expect(out.verdict).toBe('REVIEW')
    expect(out.product_universe.pass).toBe(false)
    expect(out.product_universe.checks[0]).toMatchObject({
      name: 'canonical_family',
      expected: 'NIKE_AIR_JORDAN_3',
      actual: 'NIKE_AIR_JORDAN_4',
      pass: false,
    })
  })

  it('limita a quantidade de imagens por execução', async () => {
    const samples = Array.from(
      { length: SUPPLIER_HOMOLOGATION_MAX_SAMPLES + 1 },
      (_, index) => ({
        supplier_key: 'MIA',
        drive_file_id: `drive-${index}`,
      })
    )

    const out = await runSupplierHomologationHarness({
      mode: 'vision',
      expected: AJ3_INPUT.expected,
      samples,
    }, {
      analyzeFn: vi.fn(),
    })

    expect(out.ok).toBe(false)
    expect(out.error).toBe('HARNESS_SAMPLE_LIMIT_EXCEEDED')
  })

  it('endpoint exige autenticação LAB e bloqueia a GABY OFICIAL', async () => {
    const noHeader = mockRes()
    await handleSupplierHomologationHarnessRequest({
      method: 'POST',
      headers: {},
      body: AJ3_INPUT,
    }, noHeader, {
      labApiSecret: 'lab-secret',
      analyzeFn: vi.fn(),
    })

    expect(noHeader.state.status).toBe(403)
    expect(noHeader.state.payload.error).toBe('LAB_HEADER_REQUIRED')

    const official = mockRes()
    await handleSupplierHomologationHarnessRequest({
      method: 'POST',
      headers: {
        'x-prime-lab': 'GABY-LAB-COMERCIAL-V1',
        'x-prime-lab-secret': 'lab-secret',
      },
      body: {
        ...AJ3_INPUT,
        agent_id: GABY_OFFICIAL_AGENT_ID,
      },
    }, official, {
      labApiSecret: 'lab-secret',
      analyzeFn: vi.fn(),
    })

    expect(official.state.status).toBe(403)
    expect(official.state.payload.error).toBe('GABY_OFFICIAL_BLOCKED')
  })

  it('endpoint válido retorna 200 e nunca exige confirmação de write', async () => {
    const res = mockRes()
    const analyzeFn = vi.fn(async row => readyVision(row))

    await handleSupplierHomologationHarnessRequest({
      method: 'POST',
      headers: {
        'x-prime-lab': 'GABY-LAB-COMERCIAL-V1',
        'x-prime-lab-secret': 'lab-secret',
      },
      body: {
        ...AJ3_INPUT,
        samples: [AJ3_INPUT.samples[0]],
      },
    }, res, {
      labApiSecret: 'lab-secret',
      analyzeFn,
    })

    expect(res.state.status).toBe(200)
    expect(res.state.payload.ok).toBe(true)
    expect(res.state.payload.verdict).toBe('PASS')
    expect(res.state.payload.side_effects.supplier_shadow_write).toBe(false)
  })
})
