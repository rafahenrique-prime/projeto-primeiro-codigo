import { describe, it, expect, vi } from 'vitest'
import { createHash } from 'node:crypto'

import {
  resolveRenderLabVisionProxyUrl,
  runSupplierVisionWorker,
} from '../_supplierVisionWorker.js'
import {
  runSupplierHomologationHarness,
} from '../supplier-homologation-harness-v1.js'

const DRIVE_FILE_ID = 'puma-180-identity-test'
const PROXY_URL = resolveRenderLabVisionProxyUrl(10000)
const IMAGE_BYTES = [255, 216, 255, 217]
const ROW = {
  id: '00000000-0000-4000-8000-000000000180',
  supplier_key: 'MIA',
  drive_file_id: DRIVE_FILE_ID,
  brand: 'Puma',
  canonical_family: 'PUMA_180',
  detected_model: 'Puma 180',
  category: 'Tênis',
}

function jsonResponse(json, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => json,
    headers: { get: () => 'application/json' },
  }
}

function imageResponse(bytes = IMAGE_BYTES) {
  const arr = Uint8Array.from(bytes)
  return {
    ok: true,
    status: 200,
    headers: {
      get(name) {
        return String(name).toLowerCase() === 'content-type'
          ? 'image/jpeg'
          : null
      },
    },
    arrayBuffer: async () =>
      arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength),
  }
}

function makeFetch(calls) {
  return vi.fn(async (url, init = {}) => {
    calls.push({ url, init })
    if (String(url).includes('/rpc/lab_supplier_vision_queue_selected')) {
      return jsonResponse([ROW])
    }
    if (String(url).includes('lh3.googleusercontent.com')) {
      return imageResponse()
    }
    if (url === PROXY_URL) {
      const body = JSON.parse(init.body)
      return jsonResponse({
        model: body.model,
        choices: [{
          message: {
            content: JSON.stringify({
              brand: 'Puma',
              canonical_family: 'PUMA_180',
              model: 'Puma 180',
              category: 'Tênis',
              color: 'preto / branco',
              confidence: 0.96,
              family_match: true,
              access_token: 'ghp_12345678901234567890',
              note: 'ghp_12345678901234567890',
            }),
          },
        }],
        usage: { cost: 0.0003 },
      })
    }
    throw new Error('URL inesperada: ' + url)
  })
}

describe('Supplier Vision execution identity', () => {
  it('gate e worker produzem a mesma identidade para o mesmo arquivo e contexto MIA', async () => {
    const gateCalls = []
    const gate = await runSupplierHomologationHarness({
      mode: 'vision',
      expected: { canonical_family: 'PUMA_180' },
      samples: [{
        supplier_key: 'MIA',
        drive_file_id: DRIVE_FILE_ID,
      }],
    }, {
      visionProxyUrl: PROXY_URL,
      visionModel: 'google/gemini-2.5-flash-lite',
      visionProxySecret: 'lab-secret',
      fetchImpl: makeFetch(gateCalls),
    })

    const workerCalls = []
    const worker = await runSupplierVisionWorker({
      limit: 1,
      dry_run: true,
      drive_file_ids: [DRIVE_FILE_ID],
    }, {
      supabaseUrl: 'https://mock.supabase.co',
      publicKey: 'public-key',
      workerToken: 'worker-token',
      visionProxyUrl: PROXY_URL,
      visionModel: 'google/gemini-2.5-flash-lite',
      visionProxySecret: 'lab-secret',
      fetchImpl: makeFetch(workerCalls),
    })

    const gateAudit = gate.vision.results[0].audit
    const workerAudit = worker.processed[0].audit
    const imageSha256 = createHash('sha256')
      .update(Buffer.from(IMAGE_BYTES))
      .digest('hex')

    expect(gate.ok).toBe(true)
    expect(worker.ok).toBe(true)
    expect(gateAudit.context).toEqual({
      supplier: 'MIA',
      brand: 'Puma',
      canonical_family: 'PUMA_180',
      model: 'Puma 180',
      category: 'Tênis',
    })
    expect(workerAudit.context).toEqual(gateAudit.context)
    expect(gateAudit.image_sha256).toBe(imageSha256)
    expect(workerAudit.image_sha256).toBe(imageSha256)
    expect(gateAudit.execution_identity)
      .toEqual(workerAudit.execution_identity)
    expect(gateAudit.model_effective)
      .toBe('google/gemini-2.5-flash-lite')
    expect(workerAudit.model_effective)
      .toBe('google/gemini-2.5-flash-lite')
    expect(gateAudit.proxy_route).toBe(PROXY_URL)
    expect(workerAudit.proxy_route).toBe(PROXY_URL)
    expect(gateAudit.prompt_version).toBe(workerAudit.prompt_version)
    expect(gateAudit.prompt_sha256).toBe(workerAudit.prompt_sha256)
    expect(gateAudit.model_json).toEqual(workerAudit.model_json)
    expect(gateAudit.model_json).not.toHaveProperty('access_token')
    expect(gateAudit.model_json.note).toBe('[REDACTED]')
    expect(gateCalls.some(call => call.url === PROXY_URL)).toBe(true)
    expect(workerCalls.some(call => call.url === PROXY_URL)).toBe(true)
    expect(workerCalls.some(call =>
      String(call.url).includes('/rpc/lab_supplier_vision_queue_selected')
    )).toBe(true)
    expect(workerCalls.some(call =>
      String(call.url).endsWith('/rpc/lab_supplier_vision_queue')
    )).toBe(false)

    const gateBody = JSON.parse(
      gateCalls.find(call => call.url === PROXY_URL).init.body
    )
    const workerBody = JSON.parse(
      workerCalls.find(call => call.url === PROXY_URL).init.body
    )
    expect(gateBody.messages[0].content[0].text)
      .toBe(workerBody.messages[0].content[0].text)
    expect(gateBody.messages[0].content[1].image_url.url)
      .toBe(workerBody.messages[0].content[1].image_url.url)
  })
})
