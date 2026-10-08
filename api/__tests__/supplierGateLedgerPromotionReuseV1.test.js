import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_VISION_MODEL,
  SUPPLIER_VISION_PROMPT_VERSION,
  buildSupplierVisionRequestContext,
  buildVisionExecutionIdentity,
  resolveRenderLabVisionProxyUrl,
  runSupplierGateLedgerReuseWorker,
} from '../_supplierVisionWorker.js'
import { runSupplierCatalogCycle } from '../_supplierCatalogCycle.js'
import {
  parseSupplierHomologationPromotionBootInput,
  runSupplierHomologationPromotionBoot,
} from '../_supplierHomologationPromotionBoot.js'

const SUPABASE_URL = 'https://lab-project.supabase.co'
const PUBLIC_KEY = 'public-key'
const CYCLE_TOKEN = 'cycle-secret'
const WORKER_TOKEN = 'worker-secret'
const VISION_PROXY_URL = resolveRenderLabVisionProxyUrl(10000)
const SCOPE_KEY = 'MIA_NB1000'
const DRIVE_FILE_ID = '1MiaAuthorizedFile000000000000'
const OUTSIDE_DRIVE_FILE_ID = '1OutsideAuthorizedFile00000000'
const IMAGE_BYTES = [255, 216, 255, 217]
const SHADOW_ROW = {
  id: 'shadow-row-authorized',
  supplier_key: 'MIA',
  drive_file_id: DRIVE_FILE_ID,
  brand: 'New Balance',
  canonical_family: 'NEW_BALANCE_1000',
  detected_model: 'New Balance 1000',
  category: 'Tênis',
  analysis_status: 'pending',
}
const SCOPE_CONTEXT = {
  supplier: 'MIA',
  brand: 'New Balance',
  canonical_family: 'NEW_BALANCE_1000',
  model: 'New Balance 1000',
  category: 'Tênis',
}

function jsonResponse(json, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => json,
  }
}

function imageResponse(bytes = IMAGE_BYTES) {
  const array = Uint8Array.from(bytes)
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'image/jpeg' },
    arrayBuffer: async () =>
      array.buffer.slice(array.byteOffset, array.byteOffset + array.byteLength),
  }
}

function makeLedgerEntry(overrides = {}, bytes = IMAGE_BYTES) {
  const requestContext = buildSupplierVisionRequestContext(SHADOW_ROW, {
    visionProxyUrl: VISION_PROXY_URL,
    visionModel: DEFAULT_VISION_MODEL,
  })
  const imageSha = createHash('sha256')
    .update(Buffer.from(bytes))
    .digest('hex')
  const executionIdentity = buildVisionExecutionIdentity({
    drive_file_id: DRIVE_FILE_ID,
    context: requestContext.context,
    model: DEFAULT_VISION_MODEL,
    proxy_route: requestContext.proxyRoute,
    prompt_version: SUPPLIER_VISION_PROMPT_VERSION,
    prompt_sha256: requestContext.promptSha256,
    image_sha256: imageSha,
  })

  return {
    gate_ledger_id: '11111111-1111-4111-8111-111111111111',
    gate_run_key: 'supplier-gate-test',
    scope_key: SCOPE_KEY,
    supplier: 'MIA',
    drive_file_id: DRIVE_FILE_ID,
    image_sha256: imageSha,
    canonical_family: SCOPE_CONTEXT.canonical_family,
    brand: SCOPE_CONTEXT.brand,
    model: SCOPE_CONTEXT.model,
    category: SCOPE_CONTEXT.category,
    vision_model: DEFAULT_VISION_MODEL,
    vision_proxy_route: requestContext.proxyRoute,
    prompt_version: SUPPLIER_VISION_PROMPT_VERSION,
    prompt_sha256: requestContext.promptSha256,
    execution_identity_sha256: executionIdentity.sha256,
    model_json: {
      brand: 'New Balance',
      canonical_family: 'NEW_BALANCE_1000',
      model: 'New Balance 1000',
      category: 'Tênis',
      color: 'preto',
      confidence: 0.98,
      family_match: true,
    },
    validation_result: {
      status: 'READY',
      error_code: null,
      values: {
        brand: 'New Balance',
        canonical_family: 'NEW_BALANCE_1000',
        detected_model: 'New Balance 1000',
        category: 'Tênis',
        visual_color: 'preto',
        vision_confidence: 0.98,
      },
    },
    validation_status: 'READY',
    validation_error_code: null,
    confidence: 0.98,
    cost_usd: 0.0003,
    ...overrides,
  }
}

function makeWorkerHarness({
  queueRows = [SHADOW_ROW],
  ledgerRows = [makeLedgerEntry()],
  imageBytes = IMAGE_BYTES,
  ledgerOk = true,
} = {}) {
  const calls = []
  const applyBodies = []
  let proxyCalls = 0
  const fetchImpl = vi.fn(async (url, init = {}) => {
    const parsedBody = init.body ? JSON.parse(init.body) : null
    calls.push({ url: String(url), body: parsedBody })

    if (String(url).endsWith('/rpc/lab_supplier_vision_queue_selected')) {
      return jsonResponse(queueRows)
    }
    if (String(url).endsWith('/rpc/lab_supplier_gate_ledger_find_reusable')) {
      return jsonResponse(ledgerRows, ledgerOk, ledgerOk ? 200 : 503)
    }
    if (String(url).endsWith('/rpc/lab_supplier_vision_apply')) {
      applyBodies.push(parsedBody)
      return jsonResponse([{
        id: parsedBody.p_id,
        analysis_status: parsedBody.p_analysis_status,
      }])
    }
    if (String(url).startsWith('https://lh3.googleusercontent.com/')) {
      return imageResponse(imageBytes)
    }
    if (String(url).includes('/api/supplier-harness-ocr-proxy')) {
      proxyCalls += 1
      return jsonResponse({ error: 'Gemini must not be called in this test' }, false, 500)
    }
    throw new Error('unexpected test URL: ' + url)
  })

  const run = (driveFileIds = [DRIVE_FILE_ID]) =>
    runSupplierGateLedgerReuseWorker({
      limit: driveFileIds.length,
      dry_run: false,
      drive_file_ids: driveFileIds,
      scope_key: SCOPE_KEY,
      scope_context: SCOPE_CONTEXT,
    }, {
      supabaseUrl: SUPABASE_URL,
      publicKey: PUBLIC_KEY,
      workerToken: WORKER_TOKEN,
      cycleToken: CYCLE_TOKEN,
      fetchImpl,
      visionProxyUrl: VISION_PROXY_URL,
      visionModel: DEFAULT_VISION_MODEL,
      visionTimeoutMs: 2000,
      rpcTimeoutMs: 2000,
    })

  return {
    calls,
    applyBodies,
    fetchImpl,
    run,
    get proxyCalls() { return proxyCalls },
  }
}

describe('Supplier Shadow Gate Ledger promotion reuse', () => {
  it('READY com identidade exata aplica o resultado salvo e não chama o proxy', async () => {
    const harness = makeWorkerHarness()
    const out = await harness.run()

    expect(out).toMatchObject({
      ok: true,
      queued: 1,
      processed: [{
        id: SHADOW_ROW.id,
        drive_file_id: DRIVE_FILE_ID,
        status: 'ready',
        persisted: true,
        source: 'gate_ledger',
        reused: true,
        gate_ledger_id: '11111111-1111-4111-8111-111111111111',
        validation_status: 'READY',
        original_gate_cost_usd: 0.0003,
        current_vision_cost_usd: 0,
        usage: { cost_usd: 0 },
      }],
      side_effects: { vision_call: false },
    })
    expect(harness.proxyCalls).toBe(0)
    expect(harness.calls.map(call => call.url)).toContain(
      SUPABASE_URL + '/rest/v1/rpc/lab_supplier_vision_queue_selected',
    )
    expect(harness.calls.map(call => call.url)).not.toContain(
      SUPABASE_URL + '/rest/v1/rpc/lab_supplier_vision_queue',
    )
    expect(harness.calls.map(call => call.url)).not.toContain(
      SUPABASE_URL + '/rest/v1/rpc/lab_supplier_gate_ledger_record',
    )
    expect(harness.applyBodies).toHaveLength(1)
    expect(harness.applyBodies[0]).toMatchObject({
      p_id: SHADOW_ROW.id,
      p_analysis_status: 'ready',
      p_brand: 'New Balance',
      p_canonical_family: 'NEW_BALANCE_1000',
      p_detected_model: 'New Balance 1000',
      p_category: 'Tênis',
      p_visual_color: 'preto',
      p_vision_confidence: 0.98,
    })
    expect(harness.calls.find(call =>
      call.url.endsWith('/rpc/lab_supplier_gate_ledger_find_reusable'),
    )?.body).toMatchObject({
      p_token: CYCLE_TOKEN,
      p_supplier: 'MIA',
      p_scope_key: SCOPE_KEY,
      p_drive_file_id: DRIVE_FILE_ID,
      p_image_sha256: makeLedgerEntry().image_sha256,
      p_canonical_family: SCOPE_CONTEXT.canonical_family,
      p_brand: SCOPE_CONTEXT.brand,
      p_model: SCOPE_CONTEXT.model,
      p_category: SCOPE_CONTEXT.category,
      p_vision_model: DEFAULT_VISION_MODEL,
      p_vision_proxy_route:
        'http://127.0.0.1:10000/api/supplier-harness-ocr-proxy',
      p_prompt_version: SUPPLIER_VISION_PROMPT_VERSION,
      p_prompt_sha256: makeLedgerEntry().prompt_sha256,
      p_execution_identity_sha256: makeLedgerEntry().execution_identity_sha256,
    })

    const serialized = JSON.stringify(out)
    expect(serialized).not.toContain(CYCLE_TOKEN)
    expect(serialized).not.toContain(WORKER_TOKEN)
    expect(serialized).not.toContain('lab-secret')
  })

  it.each(['REVIEW', 'ERROR'])(
    '%s nunca é reutilizável',
    async status => {
      const ledgerEntry = makeLedgerEntry({
        validation_status: status,
        validation_result: {
          status,
          error_code: status === 'REVIEW' ? 'VISION_REVIEW' : 'VISION_ERROR',
          values: {},
        },
      })
      const harness = makeWorkerHarness({ ledgerRows: [ledgerEntry] })
      const out = await harness.run()

      expect(out.ok).toBe(false)
      expect(out.processed[0].error_code).toBe('GATE_LEDGER_REUSE_MISS')
      expect(harness.applyBodies).toHaveLength(0)
      expect(harness.proxyCalls).toBe(0)
    },
  )

  it('imagem com SHA-256 atual diferente falha fechada', async () => {
    const harness = makeWorkerHarness({
      ledgerRows: [makeLedgerEntry()],
      imageBytes: [255, 216, 0, 217],
    })
    const out = await harness.run()

    expect(out.ok).toBe(false)
    expect(out.processed[0].error_code).toBe('GATE_LEDGER_REUSE_MISS')
    expect(harness.applyBodies).toHaveLength(0)
    expect(harness.proxyCalls).toBe(0)
  })

  it('falha fechada se qualquer campo da identidade do ledger divergir', async () => {
    const mismatches = {
      supplier: 'VIVIAN',
      scope_key: 'MIA_OTHER_SCOPE',
      drive_file_id: '1DifferentAuthorizedFile0000000',
      canonical_family: 'NEW_BALANCE_204L',
      brand: 'Other Brand',
      model: 'Other Model',
      category: 'Other Category',
      vision_model: 'google/other-model',
      vision_proxy_route: 'http://127.0.0.1:10001/api/supplier-harness-ocr-proxy',
      prompt_version: 'supplier-vision-prompt-v9',
      prompt_sha256: 'a'.repeat(64),
      execution_identity_sha256: 'b'.repeat(64),
    }

    for (const [field, value] of Object.entries(mismatches)) {
      const harness = makeWorkerHarness({
        ledgerRows: [makeLedgerEntry({ [field]: value })],
      })
      const out = await harness.run()
      expect(out.ok, field).toBe(false)
      expect(out.processed[0].error_code, field).toBe('GATE_LEDGER_REUSE_MISS')
      expect(harness.applyBodies, field).toHaveLength(0)
      expect(harness.proxyCalls, field).toBe(0)
    }
  })

  it('ausência ou falha de leitura do ledger nunca chama Gemini como fallback', async () => {
    for (const scenario of [
      { ledgerRows: [], ledgerOk: true, expected: 'GATE_LEDGER_REUSE_MISS' },
      { ledgerRows: [], ledgerOk: false, expected: 'GATE_LEDGER_REUSE_LOOKUP_FAILED' },
    ]) {
      const harness = makeWorkerHarness(scenario)
      const out = await harness.run()

      expect(out.ok).toBe(false)
      expect(out.processed[0].error_code).toBe(scenario.expected)
      expect(harness.applyBodies).toHaveLength(0)
      expect(harness.proxyCalls).toBe(0)
    }
  })

  it('ID fora da lista explícita provoca falha fechada e nunca recebe apply', async () => {
    const outsideRow = {
      ...SHADOW_ROW,
      id: 'shadow-row-outside',
      drive_file_id: OUTSIDE_DRIVE_FILE_ID,
    }
    const harness = makeWorkerHarness({
      queueRows: [SHADOW_ROW, outsideRow],
    })
    const out = await harness.run([DRIVE_FILE_ID])

    expect(out.ok).toBe(false)
    expect(out.error_code).toBe('GATE_LEDGER_REUSE_QUEUE_ID_MISMATCH')
    expect(out.processed.map(item => item.drive_file_id)).toEqual([DRIVE_FILE_ID])
    expect(harness.applyBodies).toHaveLength(0)
    expect(harness.proxyCalls).toBe(0)
    const selectedQueueCall = harness.calls.find(call =>
      call.url.endsWith('/rpc/lab_supplier_vision_queue_selected'),
    )
    expect(selectedQueueCall).toBeDefined()
    expect(selectedQueueCall.body.p_drive_file_ids).toEqual([DRIVE_FILE_ID])
  })

  it('limita cada apply ao registro Shadow do drive_file_id autorizado', async () => {
    const harness = makeWorkerHarness()
    const out = await harness.run([DRIVE_FILE_ID])

    expect(out.ok).toBe(true)
    expect(harness.applyBodies.map(body => body.p_id)).toEqual([SHADOW_ROW.id])
    expect(harness.applyBodies).toHaveLength(1)
  })

  it('não grava tokens nem chama a RPC de gravação do Gate Ledger', async () => {
    const harness = makeWorkerHarness()
    const out = await harness.run()
    const serialized = JSON.stringify(out)

    expect(serialized).not.toContain(CYCLE_TOKEN)
    expect(serialized).not.toContain(WORKER_TOKEN)
    expect(serialized).not.toContain('lab-secret')
    expect(harness.calls.some(call =>
      call.url.endsWith('/rpc/lab_supplier_gate_ledger_record'),
    )).toBe(false)
  })

  it('Promo Boot exige a flag explícita e IDs antes de ativar reuse', async () => {
    expect(parseSupplierHomologationPromotionBootInput({
      SUPPLIER_HOMOLOGATION_PROMOTION_BOOT_INPUT: JSON.stringify({
        run_key: 'mia-gate-reuse-no-ids',
        scope_key: SCOPE_KEY,
        reuse_gate_ledger: true,
      }),
    })).toMatchObject({
      ok: false,
      error: 'PROMOTION_BOOT_GATE_LEDGER_REUSE_IDS_REQUIRED',
    })

    const driveFileIds = [DRIVE_FILE_ID]
    const parsed = parseSupplierHomologationPromotionBootInput({
      SUPPLIER_HOMOLOGATION_PROMOTION_BOOT_INPUT: JSON.stringify({
        run_key: 'mia-gate-reuse',
        scope_key: SCOPE_KEY,
        max_changes: 1,
        drive_file_ids: driveFileIds,
        reuse_gate_ledger: true,
      }),
    })
    expect(parsed).toMatchObject({
      ok: true,
      input: { reuse_gate_ledger: true, drive_file_ids: driveFileIds },
    })

    const fetchImpl = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body)
      expect(body).toEqual({
        confirm: 'SUPPLIER_CATALOG_CYCLE_LAB',
        cycle_key: 'supplier-cycle-homologation:mia-gate-reuse',
        trigger: 'manual_homologation',
        max_changes: 1,
        scope_keys: [SCOPE_KEY],
        drive_file_ids: driveFileIds,
        reuse_gate_ledger: true,
      })
      return jsonResponse({
        ok: true,
        cycle_key: body.cycle_key,
        status: 'completed',
        totals: { selected_for_pending: 1, ready: 1, review: 0, error: 0, cost_usd: 0 },
        duplicate: false,
      })
    })
    const logger = { log: vi.fn() }
    const out = await runSupplierHomologationPromotionBoot({
      env: {
        SUPPLIER_HOMOLOGATION_PROMOTION_BOOT_ENABLED: 'true',
        SUPPLIER_HOMOLOGATION_PROMOTION_BOOT_INPUT: JSON.stringify({
          run_key: 'mia-gate-reuse',
          scope_key: SCOPE_KEY,
          max_changes: 1,
          drive_file_ids: driveFileIds,
          reuse_gate_ledger: true,
        }),
        SUPPLIER_CATALOG_CYCLE_TOKEN: CYCLE_TOKEN,
      },
      fetchImpl,
      baseUrl: 'http://127.0.0.1:10000',
      logger,
    })
    expect(out.ok).toBe(true)
    expect(out.event.reuse_gate_ledger).toBe(true)
    expect(logger.log.mock.calls.flat().join('\n')).not.toContain(CYCLE_TOKEN)
  })

  it('rejeita reuse direto fora de manual_homologation, scope único ou IDs exatos', async () => {
    const cases = [
      { trigger: 'supabase_cron', scope_keys: [SCOPE_KEY], drive_file_ids: [DRIVE_FILE_ID] },
      { trigger: 'manual_homologation', scope_keys: [SCOPE_KEY, 'MIA_NB2000'], drive_file_ids: [DRIVE_FILE_ID] },
      { trigger: 'manual_homologation', scope_keys: [SCOPE_KEY] },
      {
        trigger: 'manual_homologation',
        scope_keys: [SCOPE_KEY],
        max_changes: 1,
        drive_file_ids: [DRIVE_FILE_ID, OUTSIDE_DRIVE_FILE_ID],
      },
    ]
    for (const input of cases) {
      const startFn = vi.fn()
      const scannerFn = vi.fn()
      const gateLedgerReuseFn = vi.fn()
      const visionFn = vi.fn()
      const out = await runSupplierCatalogCycle({
        cycle_key: 'reuse-validation-test',
        max_changes: 2,
        reuse_gate_ledger: true,
        ...input,
      }, {
        supabaseUrl: SUPABASE_URL,
        publicKey: PUBLIC_KEY,
        scannerToken: 'scanner-token',
        workerToken: WORKER_TOKEN,
        cycleToken: CYCLE_TOKEN,
        startFn,
        scannerFn,
        gateLedgerReuseFn,
        visionFn,
      })
      expect(out.ok).toBe(false)
      expect(out.error_code)
        .toBe('CYCLE_GATE_LEDGER_REUSE_REQUIRES_MANUAL_SCOPE_AND_EXPLICIT_IDS')
      expect(startFn).not.toHaveBeenCalled()
      expect(scannerFn).not.toHaveBeenCalled()
      expect(gateLedgerReuseFn).not.toHaveBeenCalled()
      expect(visionFn).not.toHaveBeenCalled()
    }
  })



  it('rejeita max_changes inválido no modo reuse antes de iniciar o ciclo', async () => {
    const startFn = vi.fn()
    const out = await runSupplierCatalogCycle({
      cycle_key: 'reuse-max-changes-test',
      trigger: 'manual_homologation',
      max_changes: 4,
      scope_keys: [SCOPE_KEY],
      drive_file_ids: [DRIVE_FILE_ID],
      reuse_gate_ledger: true,
    }, {
      supabaseUrl: SUPABASE_URL,
      publicKey: PUBLIC_KEY,
      scannerToken: 'scanner-token',
      workerToken: WORKER_TOKEN,
      cycleToken: CYCLE_TOKEN,
      startFn,
    })

    expect(out.ok).toBe(false)
    expect(out.error_code).toBe('CYCLE_GATE_LEDGER_REUSE_MAX_CHANGES_INVALID')
    expect(startFn).not.toHaveBeenCalled()
  })

  it('não chama scanner nem grava Shadow quando o preflight do ledger falha', async () => {
    const scannerFn = vi.fn()
    const gateLedgerReuseFn = vi.fn()
    const visionFn = vi.fn()
    const finishFn = vi.fn(async (_runId, summary) => {
      expect(summary.vision.processed[0].error_code)
        .toBe('GATE_LEDGER_REUSE_MISS')
      return { ok: true }
    })
    const out = await runSupplierCatalogCycle({
      cycle_key: 'reuse-preflight-miss-test',
      trigger: 'manual_homologation',
      max_changes: 1,
      scope_keys: [SCOPE_KEY],
      drive_file_ids: [DRIVE_FILE_ID],
      reuse_gate_ledger: true,
    }, {
      supabaseUrl: SUPABASE_URL,
      publicKey: PUBLIC_KEY,
      scannerToken: 'scanner-token',
      workerToken: WORKER_TOKEN,
      cycleToken: CYCLE_TOKEN,
      startFn: vi.fn(async () => ({ ok: true, accepted: true, run_id: 'run-miss' })),
      finishFn,
      scannerFn,
      gateLedgerPreflightFn: vi.fn(async () => ({
        ok: false,
        prepared: [],
        processed: [{
          drive_file_id: DRIVE_FILE_ID,
          status: 'error',
          persisted: false,
          error_code: 'GATE_LEDGER_REUSE_MISS',
          source: 'gate_ledger',
          reused: false,
          current_vision_cost_usd: 0,
          usage: { cost_usd: 0 },
          audit: {
            drive_file_id: DRIVE_FILE_ID,
            validation_status: 'ERROR',
            validation_error_code: 'GATE_LEDGER_REUSE_MISS',
            cost_usd: 0,
            source: 'gate_ledger',
            reused: false,
            current_vision_cost_usd: 0,
          },
        }],
        error_code: 'GATE_LEDGER_REUSE_INCOMPLETE',
      })),
      gateLedgerReuseFn,
      visionFn,
    })

    expect(out.ok).toBe(false)
    expect(out.totals).toMatchObject({ ready: 0, error: 1, cost_usd: 0 })
    expect(out.side_effects).toMatchObject({
      supplier_shadow_write: false,
      vision_call: false,
    })
    expect(scannerFn).not.toHaveBeenCalled()
    expect(gateLedgerReuseFn).not.toHaveBeenCalled()
    expect(visionFn).not.toHaveBeenCalled()
  })

  it('registra reuse, ID do ledger e custo visual zero no cycle ledger', async () => {
    const finishFn = vi.fn(async (_runId, summary) => {
      expect(summary.vision.processed[0]).toMatchObject({
        source: 'gate_ledger',
        reused: true,
        gate_ledger_id: '11111111-1111-4111-8111-111111111111',
        drive_file_id: DRIVE_FILE_ID,
        image_sha256: 'c'.repeat(64),
        execution_identity_sha256: 'd'.repeat(64),
        validation_status: 'READY',
        confidence: 0.98,
        original_gate_cost_usd: 0.0003,
        current_vision_cost_usd: 0,
        cost_usd: 0,
      })
      expect(summary.vision_cost_usd).toBe(0)
      return { ok: true }
    })
    const gateLedgerReuseFn = vi.fn(async input => {
      expect(input.drive_file_ids).toEqual([DRIVE_FILE_ID])
      expect(input.scope_key).toBe(SCOPE_KEY)
      return {
        ok: true,
        queued: 1,
        processed: [{
          id: SHADOW_ROW.id,
          drive_file_id: DRIVE_FILE_ID,
          supplier: 'MIA',
          family: SCOPE_CONTEXT.canonical_family,
          confidence: 0.98,
          status: 'ready',
          persisted: true,
          source: 'gate_ledger',
          reused: true,
          gate_ledger_id: '11111111-1111-4111-8111-111111111111',
          image_sha256: 'c'.repeat(64),
          execution_identity_sha256: 'd'.repeat(64),
          validation_status: 'READY',
          original_gate_cost_usd: 0.0003,
          current_vision_cost_usd: 0,
          usage: { cost_usd: 0 },
          audit: {
            drive_file_id: DRIVE_FILE_ID,
            image_sha256: 'c'.repeat(64),
            execution_identity: { sha256: 'd'.repeat(64) },
            validation_status: 'READY',
            confidence: 0.98,
            cost_usd: 0,
            source: 'gate_ledger',
            reused: true,
            gate_ledger_id: '11111111-1111-4111-8111-111111111111',
            original_gate_cost_usd: 0.0003,
            current_vision_cost_usd: 0,
          },
        }],
      }
    })
    const visionFn = vi.fn()

    const out = await runSupplierCatalogCycle({
      cycle_key: 'reuse-cycle-ledger-test',
      trigger: 'manual_homologation',
      max_changes: 1,
      scope_keys: [SCOPE_KEY],
      drive_file_ids: [DRIVE_FILE_ID],
      reuse_gate_ledger: true,
    }, {
      supabaseUrl: SUPABASE_URL,
      publicKey: PUBLIC_KEY,
      scannerToken: 'scanner-token',
      workerToken: WORKER_TOKEN,
      cycleToken: CYCLE_TOKEN,
      startFn: vi.fn(async () => ({ ok: true, accepted: true, run_id: 'run-1' })),
      finishFn,
      scannerFn: vi.fn(async () => ({
        ok: true,
        scopes: [{
          key: SCOPE_KEY,
          status: 'completed',
          selected_for_pending: 1,
          _selected_drive_file_ids: [DRIVE_FILE_ID],
        }],
      })),
      gateLedgerPreflightFn: vi.fn(async input => {
        expect(input.drive_file_ids).toEqual([DRIVE_FILE_ID])
        return {
          ok: true,
          prepared: [{
            drive_file_id: DRIVE_FILE_ID,
            expected_identity: {},
            entry: {},
          }],
          processed: [],
        }
      }),
      gateLedgerReuseFn,
      visionFn,
    })

    expect(out.ok).toBe(true)
    expect(out.totals).toMatchObject({ ready: 1, review: 0, error: 0, cost_usd: 0 })
    expect(out.side_effects).toMatchObject({
      vision_call: false,
      gate_ledger_reuse: true,
      gaby_official: false,
    })
    expect(gateLedgerReuseFn).toHaveBeenCalledTimes(1)
    expect(visionFn).not.toHaveBeenCalled()
  })

  it('mantém o fluxo normal quando a opção de reuse não é solicitada', async () => {
    const visionFn = vi.fn(async () => ({
      ok: true,
      queued: 1,
      processed: [{
        id: SHADOW_ROW.id,
        drive_file_id: DRIVE_FILE_ID,
        status: 'ready',
        persisted: true,
        usage: { cost_usd: 0.0003 },
      }],
    }))
    const gateLedgerReuseFn = vi.fn()
    const out = await runSupplierCatalogCycle({
      cycle_key: 'normal-cycle-test',
      trigger: 'manual_homologation',
      max_changes: 1,
      scope_keys: [SCOPE_KEY],
      drive_file_ids: [DRIVE_FILE_ID],
    }, {
      supabaseUrl: SUPABASE_URL,
      publicKey: PUBLIC_KEY,
      scannerToken: 'scanner-token',
      workerToken: WORKER_TOKEN,
      cycleToken: CYCLE_TOKEN,
      startFn: vi.fn(async () => ({ ok: true, accepted: true, run_id: 'run-normal' })),
      finishFn: vi.fn(async () => ({ ok: true })),
      scannerFn: vi.fn(async () => ({
        ok: true,
        scopes: [{
          key: SCOPE_KEY,
          status: 'completed',
          selected_for_pending: 1,
          _selected_drive_file_ids: [DRIVE_FILE_ID],
        }],
      })),
      gateLedgerReuseFn,
      visionFn,
    })

    expect(out.ok).toBe(true)
    expect(visionFn).toHaveBeenCalledTimes(1)
    expect(gateLedgerReuseFn).not.toHaveBeenCalled()
    expect(out.side_effects.vision_call).toBe(true)
    expect(out.vision.processed[0]).not.toHaveProperty('source')
  })
})
