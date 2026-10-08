import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

import {
  buildGateLedgerRecord,
  createGateRunKey,
  isReusableSupplierGateLedgerEntry,
  persistSupplierGateLedger,
  readReusableSupplierGateLedger,
} from '../_supplierGateLedger.js'
import { handleSupplierHomologationHarnessRequest } from '../supplier-homologation-harness-v1.js'

const IMAGE_SHA = 'a'.repeat(64)
const PROMPT_SHA = 'b'.repeat(64)
const EXECUTION_SHA = 'c'.repeat(64)
const SUPABASE_URL = 'https://mbbgqasvssueirynnoyk.supabase.co'
const PUBLIC_KEY = 'test-anon-key'
const CYCLE_TOKEN = 'test-cycle-token'

function makeRecord(overrides = {}) {
  return buildGateLedgerRecord({
    gate_run_key: 'MIA-PUMA-180-GATE-TEST',
    scope_key: 'MIA_PUMA_180',
    supplier: 'MIA',
    drive_file_id: 'synthetic-mia-drive-001',
    canonical_family: 'PUMA_180',
    brand: 'Puma',
    model: 'Puma 180',
    category: 'Tênis',
    result: {
      status: 'ready',
      validation: {
        status: 'ready',
        error_code: null,
        values: {
          brand: 'Puma',
          canonical_family: 'PUMA_180',
          detected_model: 'Puma 180',
          category: 'Tênis',
          visual_color: 'preto / branco',
          vision_confidence: 0.96,
        },
      },
      usage: { cost_usd: 0.0003 },
      audit: {
        drive_file_id: 'synthetic-mia-drive-001',
        context: {
          supplier: 'MIA',
          brand: 'Puma',
          canonical_family: 'PUMA_180',
          model: 'Puma 180',
          category: 'Tênis',
        },
        model_effective: 'google/gemini-2.5-flash-lite',
        proxy_route: 'http://127.0.0.1:10000/api/supplier-harness-ocr-proxy',
        prompt_version: 'supplier-vision-prompt-v3',
        prompt_sha256: PROMPT_SHA,
        model_json: {
          brand: 'Puma',
          canonical_family: 'PUMA_180',
          model: 'Puma 180',
          category: 'Tênis',
          color: 'preto / branco',
          confidence: 0.96,
          family_match: true,
        },
        validation_status: 'ready',
        validation_error_code: null,
        confidence: 0.96,
        cost_usd: 0.0003,
        image_sha256: IMAGE_SHA,
        execution_identity: { sha256: EXECUTION_SHA },
      },
    },
    analyzed_at: '2026-10-08T12:00:00.000Z',
    ...overrides,
  })
}

function responseJson(rows, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => rows,
  }
}

describe('Supplier Shadow Gate Ledger LAB', () => {
  it('não persiste run_key bruto que possa conter um token', () => {
    const key = createGateRunKey('raw-cycle-secret-value')
    expect(key).toMatch(/^supplier-gate-[a-f0-9]{64}$/)
    expect(key).not.toContain('raw-cycle-secret-value')
  })

  it('faz insert idempotente por gate_run_key, arquivo e identidade', async () => {
    const stored = new Map()
    const fetchImpl = vi.fn(async (_url, options) => {
      const payload = JSON.parse(options.body)
      const key = [
        payload.p_gate_run_key,
        payload.p_drive_file_id,
        payload.p_execution_identity_sha256 || 'NULL',
      ].join('|')
      const existing = stored.get(key)
      if (existing) {
        return responseJson([{
          gate_ledger_id: existing.id,
          inserted: false,
          validation_status: existing.validation_status,
          created_at: existing.created_at,
        }])
      }

      const row = {
        id: 'ledger-row-1',
        validation_status: payload.p_validation_status,
        created_at: payload.p_analyzed_at,
      }
      stored.set(key, row)
      return responseJson([{
        gate_ledger_id: row.id,
        inserted: true,
        validation_status: row.validation_status,
        created_at: row.created_at,
      }])
    })
    const config = {
      supabaseUrl: SUPABASE_URL,
      publicKey: PUBLIC_KEY,
      cycleToken: CYCLE_TOKEN,
      fetchImpl,
    }

    const first = await persistSupplierGateLedger([makeRecord()], config)
    const retry = await persistSupplierGateLedger([makeRecord()], config)

    expect(first).toMatchObject({
      ok: true,
      status: 'persisted',
      attempted: 1,
      inserted: 1,
      existing: 0,
      failed: 0,
    })
    expect(retry).toMatchObject({
      ok: true,
      status: 'persisted',
      attempted: 1,
      inserted: 0,
      existing: 1,
      failed: 0,
    })
    expect(stored.size).toBe(1)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(fetchImpl.mock.calls[0][0]).toBe(
      SUPABASE_URL + '/rest/v1/rpc/lab_supplier_gate_ledger_record',
    )
  })

  it('não reutiliza resultado quando image_sha256 muda', () => {
    const stored = makeRecord()
    expect(isReusableSupplierGateLedgerEntry(stored, stored)).toBe(true)
    expect(isReusableSupplierGateLedgerEntry(stored, {
      ...stored,
      image_sha256: 'd'.repeat(64),
    })).toBe(false)
  })

  it('nunca reutiliza REVIEW ou ERROR', () => {
    const ready = makeRecord()
    expect(isReusableSupplierGateLedgerEntry(
      { ...ready, validation_status: 'REVIEW' },
      ready,
    )).toBe(false)
    expect(isReusableSupplierGateLedgerEntry(
      { ...ready, validation_status: 'ERROR' },
      ready,
    )).toBe(false)
  })

  it('invalida reutilização quando família, prompt ou modelo mudam', () => {
    const ready = makeRecord()
    for (const field of ['canonical_family', 'prompt_version', 'vision_model']) {
      expect(isReusableSupplierGateLedgerEntry(ready, {
        ...ready,
        [field]: ready[field] + '-changed',
      })).toBe(false)
    }
  })

  it('lê somente por drive_file_id e identidade completa, aceitando apenas READY', async () => {
    const expected = makeRecord()
    const fetchImpl = vi.fn(async (url, options) => {
      expect(url).toBe(
        SUPABASE_URL + '/rest/v1/rpc/lab_supplier_gate_ledger_find_reusable',
      )
      const payload = JSON.parse(options.body)
      expect(payload.p_drive_file_id).toBe(expected.drive_file_id)
      expect(payload.p_image_sha256).toBe(expected.image_sha256)
      expect(payload.p_execution_identity_sha256).toBe(
        expected.execution_identity_sha256,
      )
      return responseJson([{ ...expected, gate_ledger_id: 'ledger-row-1' }])
    })

    const result = await readReusableSupplierGateLedger(expected, {
      supabaseUrl: SUPABASE_URL,
      publicKey: PUBLIC_KEY,
      cycleToken: CYCLE_TOKEN,
      fetchImpl,
    })

    expect(result.ok).toBe(true)
    expect(result.row).toMatchObject({
      gate_ledger_id: 'ledger-row-1',
      validation_status: 'READY',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('remove chaves e valores com aparência de segredo do JSON persistido', () => {
    const result = makeRecord()
    const unsafe = buildGateLedgerRecord({
      gate_run_key: result.gate_run_key,
      scope_key: result.scope_key,
      supplier: result.supplier,
      drive_file_id: result.drive_file_id,
      canonical_family: result.canonical_family,
      brand: result.brand,
      model: result.model,
      category: result.category,
      result: {
        ...result,
        audit: {
          ...result,
          validation_status: 'ready',
          model_json: {
            brand: 'Puma',
            canonical_family: 'PUMA_180',
            model: 'Puma 180',
            category: 'Tênis',
            color: 'Bearer super-secret-value',
            confidence: 0.96,
            family_match: true,
            api_key: 'sk-live-abcdefghijklmnopqrstuvwxyz012345',
            access_token: 'eyJabcdefghijk.abcdefghijk.abcdefghijk',
            extra: { password: 'never-store-this' },
          },
        },
      },
    })

    expect(unsafe.model_json).toEqual({
      brand: 'Puma',
      canonical_family: 'PUMA_180',
      model: 'Puma 180',
      category: 'Tênis',
      color: '[REDACTED]',
      confidence: 0.96,
      family_match: true,
    })
    expect(JSON.stringify(unsafe)).not.toContain('super-secret-value')
    expect(JSON.stringify(unsafe)).not.toContain('never-store-this')
    expect(JSON.stringify(unsafe)).not.toContain('sk-live')
    expect(unsafe).not.toHaveProperty('token')
    expect(unsafe).not.toHaveProperty('authorization')
  })

  it('usa somente as RPCs estreitas do Gate Ledger e não toca o catálogo Shadow', async () => {
    const urls = []
    const fetchImpl = vi.fn(async (url, options) => {
      urls.push(String(url))
      if (String(url).endsWith('/lab_supplier_gate_ledger_record')) {
        const payload = JSON.parse(options.body)
        return responseJson([{
          gate_ledger_id: 'ledger-row-1',
          inserted: true,
          validation_status: payload.p_validation_status,
          created_at: payload.p_analyzed_at,
        }])
      }
      return responseJson([makeRecord()])
    })

    await persistSupplierGateLedger([makeRecord()], {
      supabaseUrl: SUPABASE_URL,
      publicKey: PUBLIC_KEY,
      cycleToken: CYCLE_TOKEN,
      fetchImpl,
    })
    await readReusableSupplierGateLedger(makeRecord(), {
      supabaseUrl: SUPABASE_URL,
      publicKey: PUBLIC_KEY,
      cycleToken: CYCLE_TOKEN,
      fetchImpl,
    })

    expect(urls).toEqual([
      SUPABASE_URL + '/rest/v1/rpc/lab_supplier_gate_ledger_record',
      SUPABASE_URL + '/rest/v1/rpc/lab_supplier_gate_ledger_find_reusable',
    ])
    expect(urls.some(url => /supplier_shadow_products|vision_apply|vision_queue/i.test(url))).toBe(false)

    const migration = readFileSync(
      new URL('../../supabase/migrations/044_supplier_shadow_gate_ledger.sql', import.meta.url),
      'utf8',
    )
    expect(migration).not.toMatch(/\bsupplier_shadow_products\b/i)
    expect(migration).toContain('alter table public.supplier_shadow_gate_ledger enable row level security')
    expect(migration).toContain('unique nulls not distinct')
  })

  it('registra gate manual em ledger sem chamar promoção, fila ou catálogo Shadow', async () => {
    const resState = { status: null, payload: null }
    const res = {
      setHeader() {},
      status(code) {
        resState.status = code
        return { json(payload) { resState.payload = payload; return payload } }
      },
    }
    const writes = []
    const fetchImpl = vi.fn(async (url, options) => {
      writes.push({ url: String(url), body: JSON.parse(options.body) })
      return responseJson([{
        gate_ledger_id: 'ledger-row-gate-smoke',
        inserted: true,
        validation_status: 'READY',
        created_at: '2026-10-08T12:00:00.000Z',
      }])
    })
    const analyzeFn = vi.fn(async row => ({
      ok: true,
      stage: 'vision',
      status: 'ready',
      validation: {
        status: 'ready',
        error_code: null,
        values: {
          brand: row.brand,
          canonical_family: row.canonical_family,
          detected_model: row.detected_model,
          category: row.category,
          visual_color: 'preto / branco',
          vision_confidence: 0.96,
        },
      },
      usage: { cost_usd: 0.0003 },
      audit: {
        drive_file_id: row.drive_file_id,
        context: {
          supplier: row.supplier_key,
          brand: row.brand,
          canonical_family: row.canonical_family,
          model: row.detected_model,
          category: row.category,
        },
        model_effective: 'google/gemini-2.5-flash-lite',
        proxy_route: 'http://127.0.0.1:10000/api/supplier-harness-ocr-proxy',
        prompt_version: 'supplier-vision-prompt-v3',
        prompt_sha256: PROMPT_SHA,
        model_json: {
          brand: 'Puma',
          canonical_family: 'PUMA_180',
          model: 'Puma 180',
          category: 'Tênis',
          color: 'preto / branco',
          confidence: 0.96,
          family_match: true,
        },
        validation_status: 'ready',
        validation_error_code: null,
        confidence: 0.96,
        cost_usd: 0.0003,
        image_sha256: IMAGE_SHA,
        execution_identity: { sha256: EXECUTION_SHA },
      },
    }))
    const logger = { log: vi.fn() }

    await handleSupplierHomologationHarnessRequest({
      method: 'POST',
      headers: {
        'x-prime-lab': 'GABY-LAB-COMERCIAL-V1',
        'x-prime-lab-secret': 'lab-secret',
      },
      body: {
        mode: 'vision',
        run_key: 'MIA-PUMA-180-GATE-TEST',
        expected: {
          brand: 'Puma',
          canonical_family: 'PUMA_180',
          model: 'Puma 180',
          category: 'Tênis',
        },
        samples: [{
          supplier_key: 'MIA',
          drive_file_id: 'synthetic-mia-drive-gate-test',
        }],
      },
    }, res, {
      env: {
        SUPABASE_URL,
        VITE_SUPABASE_KEY: PUBLIC_KEY,
        SUPPLIER_CATALOG_CYCLE_TOKEN: CYCLE_TOKEN,
      },
      labApiSecret: 'lab-secret',
      analyzeFn,
      fetchImpl,
      logger,
    })

    expect(resState.status).toBe(200)
    expect(resState.payload.verdict).toBe('PASS')
    expect(resState.payload.gate_ledger).toMatchObject({
      status: 'persisted',
      attempted: 1,
      inserted: 1,
      failed: 0,
    })
    expect(analyzeFn).toHaveBeenCalledTimes(1)
    expect(writes).toHaveLength(1)
    expect(writes[0].url).toBe(
      SUPABASE_URL + '/rest/v1/rpc/lab_supplier_gate_ledger_record',
    )
    expect(writes[0].body.p_drive_file_id).toBe(
      'synthetic-mia-drive-gate-test',
    )
    expect(writes[0].body.p_scope_key).toBe('MIA_PUMA_180')
    expect(writes[0].url).not.toMatch(/promotion|vision_queue|supplier_shadow_products/i)
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain(CYCLE_TOKEN)
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain('lab-secret')
  })
})
