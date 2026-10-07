import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildDriveRenditionUrl,
  buildSupplierVisionPrompt,
  supplierVisionGuidance,
  parseVisionJson,
  validateVisionResult,
  runSupplierVisionWorker,
} from '../_supplierVisionWorker.js'

import {
  handleSupplierVisionWorkerRequest,
} from '../supplier-vision-worker-v1.js'

function jsonResponse(json, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => json,
    headers: { get: () => 'application/json' },
  }
}

function imageResponse(bytes = [1, 2, 3, 4], contentType = 'image/jpeg') {
  const arr = Uint8Array.from(bytes)
  return {
    ok: true,
    status: 200,
    headers: {
      get(name) {
        return String(name).toLowerCase() === 'content-type'
          ? contentType
          : null
      },
    },
    arrayBuffer: async () =>
      arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength),
  }
}

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

const ROW = {
  id: '00000000-0000-4000-8000-000000000001',
  supplier_key: 'VIVIAN',
  drive_file_id: 'drive-heif-1',
  drive_path: '/Nike/Nike Air Force/34 ao 39',
  drive_url: 'https://drive.google.com/file/d/drive-heif-1/view',
  file_name: '34 ao 39',
  mime_type: 'image/heif',
  brand: 'Nike',
  canonical_family: 'NIKE_AIR_FORCE_1',
  detected_model: 'Nike Air Force 1',
  category: 'Tênis',
  analysis_status: 'pending',
}

describe('Supplier Vision Worker V1 — funções puras', () => {
  it('monta rendition Google em w1600 para normalizar HEIF/JPEG', () => {
    expect(buildDriveRenditionUrl('abc123')).toBe(
      'https://lh3.googleusercontent.com/d/abc123=w1600'
    )
  })

  it('Court Borough recebe guidance específico contra Court Vision sem afetar famílias normais', () => {
    const borough = {
      ...ROW,
      canonical_family: 'NIKE_COURT_BOROUGH',
      detected_model: 'Nike Court Borough',
    }

    const guidance = supplierVisionGuidance(borough)
    const prompt = buildSupplierVisionPrompt(borough)

    expect(guidance.length).toBeGreaterThan(0)
    expect(prompt).toContain('NIKE_COURT_BOROUGH_CONFIRMATION_V2')
    expect(prompt).toContain('Nike Court Vision')
    expect(prompt).toContain('pelo menos 2 sinais estruturais coerentes')
    expect(buildSupplierVisionPrompt(ROW))
      .not.toContain('NIKE_COURT_BOROUGH_CONFIRMATION_V2')
  })

  it('parseia JSON puro', () => {
    expect(parseVisionJson('{"color":"preto"}')).toEqual({ color: 'preto' })
  })

  it('family match + confiança >= 0.80 + cor => ready', () => {
    const out = validateVisionResult(ROW, {
      brand: 'Nike',
      canonical_family: 'NIKE_AIR_FORCE_1',
      model: 'Nike Air Force 1',
      category: 'Tênis',
      color: 'preto',
      confidence: 0.94,
      family_match: true,
    })

    expect(out.status).toBe('ready')
    expect(out.error_code).toBeNull()
    expect(out.values.visual_color).toBe('preto')
    expect(out.values.vision_confidence).toBe(0.94)
  })

  it('Nike Air Zoom Vomero é compatível com canonical NIKE_VOMERO', () => {
    const row = {
      ...ROW,
      brand: 'Nike',
      canonical_family: 'NIKE_VOMERO',
      detected_model: 'Nike Vomero',
    }

    const out = validateVisionResult(row, {
      brand: 'Nike',
      canonical_family: 'NIKE_AIR_ZOOM_VOMERO',
      model: 'Nike Air Zoom Vomero',
      category: 'Tênis',
      color: 'rosa / amarelo',
      confidence: 0.95,
      family_match: false,
    })

    expect(out.status).toBe('ready')
    expect(out.error_code).toBeNull()
    expect(out.values.canonical_family).toBe('NIKE_VOMERO')
  })

  it('Nike Air Max Vomero é compatível com canonical NIKE_VOMERO', () => {
    const row = {
      ...ROW,
      brand: 'Nike',
      canonical_family: 'NIKE_VOMERO',
      detected_model: 'Nike Vomero',
    }

    const out = validateVisionResult(row, {
      brand: 'Nike',
      canonical_family: 'NIKE_AIR_MAX_VOMERO',
      model: 'Nike Vomero',
      category: 'Tênis',
      color: 'laranja / marrom',
      confidence: 0.95,
      family_match: false,
    })

    expect(out.status).toBe('ready')
    expect(out.error_code).toBeNull()
    expect(out.values.canonical_family).toBe('NIKE_VOMERO')
  })

  it('NIKE_VOMERO não aceita outro modelo Nike sem token Vomero', () => {
    const row = {
      ...ROW,
      brand: 'Nike',
      canonical_family: 'NIKE_VOMERO',
      detected_model: 'Nike Vomero',
    }

    const out = validateVisionResult(row, {
      brand: 'Nike',
      canonical_family: 'NIKE_AIR_MAX_90',
      model: 'Nike Air Max 90',
      category: 'Tênis',
      color: 'preto',
      confidence: 0.99,
      family_match: false,
    })

    expect(out.status).toBe('review')
    expect(out.error_code).toBe('VISION_FAMILY_MISMATCH')
    expect(out.values.canonical_family).toBe('NIKE_VOMERO')
  })

  it('Air Max DN aceita label compatível e rejeita famílias Air Max numeradas', () => {
    const row = {
      ...ROW,
      brand: 'Nike',
      canonical_family: 'NIKE_AIR_MAX_DN',
      detected_model: 'Nike Air Max DN',
    }

    const ready = validateVisionResult(row, {
      brand: 'Nike',
      canonical_family: 'NIKE_AIR_MAX_DN',
      model: 'Nike Air Max DN',
      category: 'Tênis',
      color: 'preto',
      confidence: 0.98,
      family_match: false,
    })

    expect(ready.status).toBe('ready')
    expect(ready.error_code).toBeNull()
    expect(ready.values.canonical_family).toBe('NIKE_AIR_MAX_DN')

    for (const model of [
      'Nike Air Max 90',
      'Nike Air Max 95',
      'Nike Air Max 97',
      'Nike Air Max 270',
    ]) {
      const out = validateVisionResult(row, {
        brand: 'Nike',
        canonical_family: model.replaceAll(' ', '_').toUpperCase(),
        model,
        category: 'Tênis',
        color: 'preto',
        confidence: 0.99,
        family_match: false,
      })

      expect(out.status).toBe('review')
      expect(out.error_code).toBe('VISION_FAMILY_MISMATCH')
      expect(out.values.canonical_family).toBe('NIKE_AIR_MAX_DN')
    }
  })

  it('Air Max 270 aceita label compatível e rejeita 90/95/97', () => {
    const row = {
      ...ROW,
      brand: 'Nike',
      canonical_family: 'NIKE_AIR_MAX_270',
      detected_model: 'Nike Air Max 270',
    }

    const ready = validateVisionResult(row, {
      brand: 'Nike',
      canonical_family: 'NIKE_AIR_MAX_270',
      model: 'Nike Air Max 270',
      category: 'Tênis',
      color: 'preto',
      confidence: 0.98,
      family_match: false,
    })

    expect(ready.status).toBe('ready')
    expect(ready.error_code).toBeNull()
    expect(ready.values.canonical_family).toBe('NIKE_AIR_MAX_270')

    for (const model of [
      'Nike Air Max 90',
      'Nike Air Max 95',
      'Nike Air Max 97',
    ]) {
      const out = validateVisionResult(row, {
        brand: 'Nike',
        canonical_family: model.replaceAll(' ', '_').toUpperCase(),
        model,
        category: 'Tênis',
        color: 'preto',
        confidence: 0.99,
        family_match: false,
      })

      expect(out.status).toBe('review')
      expect(out.error_code).toBe('VISION_FAMILY_MISMATCH')
      expect(out.values.canonical_family).toBe('NIKE_AIR_MAX_270')
    }
  })

  it('Air Max 97 aceita label compatível e rejeita 90/95/270', () => {
    const row = {
      ...ROW,
      brand: 'Nike',
      canonical_family: 'NIKE_AIR_MAX_97',
      detected_model: 'Nike Air Max 97',
    }

    const ready = validateVisionResult(row, {
      brand: 'Nike',
      canonical_family: 'NIKE_AIR_MAX_97',
      model: 'Nike Air Max 97',
      category: 'Tênis',
      color: 'preto',
      confidence: 0.98,
      family_match: false,
    })

    expect(ready.status).toBe('ready')
    expect(ready.error_code).toBeNull()
    expect(ready.values.canonical_family).toBe('NIKE_AIR_MAX_97')

    for (const model of [
      'Nike Air Max 90',
      'Nike Air Max 95',
      'Nike Air Max 270',
    ]) {
      const out = validateVisionResult(row, {
        brand: 'Nike',
        canonical_family: model.replaceAll(' ', '_').toUpperCase(),
        model,
        category: 'Tênis',
        color: 'preto',
        confidence: 0.99,
        family_match: false,
      })

      expect(out.status).toBe('review')
      expect(out.error_code).toBe('VISION_FAMILY_MISMATCH')
      expect(out.values.canonical_family).toBe('NIKE_AIR_MAX_97')
    }
  })

  it('Air Max 95 aceita label compatível', () => {
    const row = {
      ...ROW,
      brand: 'Nike',
      canonical_family: 'NIKE_AIR_MAX_95',
      detected_model: 'Nike Air Max 95',
    }

    const out = validateVisionResult(row, {
      brand: 'Nike',
      canonical_family: 'NIKE_AIR_MAX_95',
      model: 'Nike Air Max 95',
      category: 'Tênis',
      color: 'branco',
      confidence: 0.98,
      family_match: false,
    })

    expect(out.status).toBe('ready')
    expect(out.error_code).toBeNull()
    expect(out.values.canonical_family).toBe('NIKE_AIR_MAX_95')
  })

  it('Air Max 90 aceita label compatível e rejeita 95/97/270', () => {
    const row = {
      ...ROW,
      brand: 'Nike',
      canonical_family: 'NIKE_AIR_MAX_90',
      detected_model: 'Nike Air Max 90',
    }

    const ready = validateVisionResult(row, {
      brand: 'Nike',
      canonical_family: 'NIKE_AIR_MAX_90',
      model: 'Nike Air Max 90',
      category: 'Tênis',
      color: 'cinza / branco',
      confidence: 0.97,
      family_match: false,
    })

    expect(ready.status).toBe('ready')
    expect(ready.error_code).toBeNull()
    expect(ready.values.canonical_family).toBe('NIKE_AIR_MAX_90')

    for (const model of [
      'Nike Air Max 95',
      'Nike Air Max 97',
      'Nike Air Max 270',
    ]) {
      const out = validateVisionResult(row, {
        brand: 'Nike',
        canonical_family: model.replaceAll(' ', '_').toUpperCase(),
        model,
        category: 'Tênis',
        color: 'preto',
        confidence: 0.99,
        family_match: false,
      })

      expect(out.status).toBe('review')
      expect(out.error_code).toBe('VISION_FAMILY_MISMATCH')
      expect(out.values.canonical_family).toBe('NIKE_AIR_MAX_90')
    }
  })

  it('Air Jordan 1 aceita subfamília Low sem aceitar Jordan genérico', () => {
    const row = {
      ...ROW,
      brand: 'Nike',
      canonical_family: 'NIKE_AIR_JORDAN_1',
      detected_model: 'Nike Air Jordan 1',
    }

    const out = validateVisionResult(row, {
      brand: 'Nike',
      canonical_family: 'NIKE_AIR_JORDAN_1_LOW',
      model: 'Nike Air Jordan 1 Low',
      category: 'Tênis',
      color: 'branco / cinza / preto',
      confidence: 0.97,
      family_match: false,
    })

    expect(out.status).toBe('ready')
    expect(out.error_code).toBeNull()
    expect(out.values.canonical_family).toBe('NIKE_AIR_JORDAN_1')
  })

  it('Air Jordan 1 não aceita Jordan 3 nem Jordan 4', () => {
    const row = {
      ...ROW,
      brand: 'Nike',
      canonical_family: 'NIKE_AIR_JORDAN_1',
      detected_model: 'Nike Air Jordan 1',
    }

    for (const model of ['Nike Air Jordan 3', 'Nike Air Jordan 4']) {
      const out = validateVisionResult(row, {
        brand: 'Nike',
        canonical_family: model.includes('3') ? 'NIKE_AIR_JORDAN_3' : 'NIKE_AIR_JORDAN_4',
        model,
        category: 'Tênis',
        color: 'branco',
        confidence: 0.99,
        family_match: false,
      })

      expect(out.status).toBe('review')
      expect(out.error_code).toBe('VISION_FAMILY_MISMATCH')
      expect(out.values.canonical_family).toBe('NIKE_AIR_JORDAN_1')
    }
  })

  it('Air Jordan 3 aceita label Retro e rejeita Jordan 1/4', () => {
    const row = {
      ...ROW,
      brand: 'Nike',
      canonical_family: 'NIKE_AIR_JORDAN_3',
      detected_model: 'Nike Air Jordan 3',
    }

    const ready = validateVisionResult(row, {
      brand: 'Nike',
      canonical_family: 'NIKE_JORDAN_3_RETRO',
      model: 'Nike Air Jordan 3 Retro',
      category: 'Tênis',
      color: 'branco / vermelho / cinza',
      confidence: 0.97,
      family_match: false,
    })

    expect(ready.status).toBe('ready')
    expect(ready.error_code).toBeNull()
    expect(ready.values.canonical_family).toBe('NIKE_AIR_JORDAN_3')

    for (const model of ['Nike Air Jordan 1', 'Nike Air Jordan 4']) {
      const out = validateVisionResult(row, {
        brand: 'Nike',
        canonical_family: model.includes('1') ? 'NIKE_AIR_JORDAN_1' : 'NIKE_AIR_JORDAN_4',
        model,
        category: 'Tênis',
        color: 'branco',
        confidence: 0.99,
        family_match: false,
      })

      expect(out.status).toBe('review')
      expect(out.error_code).toBe('VISION_FAMILY_MISMATCH')
      expect(out.values.canonical_family).toBe('NIKE_AIR_JORDAN_3')
    }
  })

  it('Air Jordan 4 aceita label de subfamília que contém Jordan 4', () => {
    const row = {
      ...ROW,
      brand: 'Nike',
      canonical_family: 'NIKE_AIR_JORDAN_4',
      detected_model: 'Nike Air Jordan 4',
    }

    const out = validateVisionResult(row, {
      brand: 'Nike',
      canonical_family: 'NIKE_JORDAN_4_RETRO',
      model: 'Nike Air Jordan 4 Retro',
      category: 'Tênis',
      color: 'branco / azul marinho / cinza',
      confidence: 0.95,
      family_match: false,
    })

    expect(out.status).toBe('ready')
    expect(out.error_code).toBeNull()
    expect(out.values.canonical_family).toBe('NIKE_AIR_JORDAN_4')
  })

  it('Air Jordan 4 não aceita Jordan 3', () => {
    const row = {
      ...ROW,
      brand: 'Nike',
      canonical_family: 'NIKE_AIR_JORDAN_4',
      detected_model: 'Nike Air Jordan 4',
    }

    const out = validateVisionResult(row, {
      brand: 'Nike',
      canonical_family: 'NIKE_AIR_JORDAN_3',
      model: 'Nike Air Jordan 3',
      category: 'Tênis',
      color: 'branco',
      confidence: 0.99,
      family_match: false,
    })

    expect(out.status).toBe('review')
    expect(out.error_code).toBe('VISION_FAMILY_MISMATCH')
    expect(out.values.canonical_family).toBe('NIKE_AIR_JORDAN_4')
  })

  it('família divergente vai para review e não troca canonical_family', () => {
    const out = validateVisionResult(ROW, {
      brand: 'Nike',
      canonical_family: 'NIKE_DUNK_LOW',
      model: 'Nike Dunk Low',
      category: 'Tênis',
      color: 'preto',
      confidence: 0.98,
      family_match: false,
    })

    expect(out.status).toBe('review')
    expect(out.error_code).toBe('VISION_FAMILY_MISMATCH')
    expect(out.values.canonical_family).toBe('NIKE_AIR_FORCE_1')
    expect(out.values.detected_model).toBe('Nike Air Force 1')
  })

  it('baixa imagem + chama Vision + grava somente via narrow RPC', async () => {
    const calls = []

    const fetchImpl = vi.fn(async (url, init) => {
      calls.push({ url, method: init?.method, body: init?.body })

      if (url.includes('/rpc/lab_supplier_vision_queue')) {
        return jsonResponse([ROW])
      }

      if (url.includes('lh3.googleusercontent.com')) {
        expect(init.method).toBe('GET')
        return imageResponse([255, 216, 255, 217], 'image/jpeg')
      }

      if (url.includes('tool=ocr-openrouter')) {
        const body = JSON.parse(init.body)
        expect(body.model).toBe('google/gemini-2.5-flash-lite')
        expect(body.messages[0].content[1].type).toBe('image_url')
        expect(body.messages[0].content[1].image_url.url).toMatch(
          /^data:image\/jpeg;base64,/
        )
        return jsonResponse({
          choices: [{
            message: {
              content: JSON.stringify({
                brand: 'Nike',
                canonical_family: 'NIKE_AIR_FORCE_1',
                model: 'Nike Air Force 1',
                category: 'Tênis',
                color: 'preto',
                confidence: 0.96,
                family_match: true,
              }),
            },
          }],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 20,
            total_tokens: 120,
            cost: 0.00012,
          },
        })
      }

      if (url.includes('/rpc/lab_supplier_vision_apply')) {
        const body = JSON.parse(init.body)
        expect(body.p_id).toBe(ROW.id)
        expect(body.p_visual_color).toBe('preto')
        expect(body.p_analysis_status).toBe('ready')
        expect(body.p_error_code).toBeNull()
        return jsonResponse([{
          id: ROW.id,
          supplier_key: 'VIVIAN',
          canonical_family: 'NIKE_AIR_FORCE_1',
          detected_model: 'Nike Air Force 1',
          visual_color: 'preto',
          vision_confidence: 0.96,
          analysis_status: 'ready',
          analysis_error_code: null,
        }])
      }

      throw new Error('URL inesperada: ' + url)
    })

    const out = await runSupplierVisionWorker({
      limit: 1,
      dry_run: false,
    }, {
      supabaseUrl: 'https://mock.supabase.co',
      publicKey: 'public-key',
      workerToken: 'worker-token',
      fetchImpl,
      visionProxyUrl:
        'https://ignite-webhook.vercel.app/api/system-tools?tool=ocr-openrouter',
    })

    expect(out.ok).toBe(true)
    expect(out.queued).toBe(1)
    expect(out.processed[0]).toMatchObject({
      supplier: 'VIVIAN',
      family: 'NIKE_AIR_FORCE_1',
      color: 'preto',
      confidence: 0.96,
      status: 'ready',
      persisted: true,
    })
    expect(out.side_effects).toEqual({
      supplier_shadow_write: true,
      gptmaker_call: false,
      customer_message: false,
      gaby_official: false,
    })
    expect(calls.some(x => x.url.includes('/rpc/lab_supplier_vision_apply'))).toBe(true)
  })

  it('dry-run nunca chama apply RPC', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes('/rpc/lab_supplier_vision_queue')) {
        return jsonResponse([ROW])
      }
      if (url.includes('lh3.googleusercontent.com')) {
        return imageResponse()
      }
      if (url.includes('tool=ocr-openrouter')) {
        return jsonResponse({
          choices: [{
            message: {
              content: JSON.stringify({
                brand: 'Nike',
                canonical_family: 'NIKE_AIR_FORCE_1',
                model: 'Nike Air Force 1',
                category: 'Tênis',
                color: 'preto',
                confidence: 0.91,
                family_match: true,
              }),
            },
          }],
        })
      }
      throw new Error('apply não deveria ser chamado')
    })

    const out = await runSupplierVisionWorker({
      limit: 1,
      dry_run: true,
    }, {
      supabaseUrl: 'https://mock.supabase.co',
      publicKey: 'public-key',
      workerToken: 'worker-token',
      fetchImpl,
    })

    expect(out.ok).toBe(true)
    expect(out.processed[0].persisted).toBe(false)
    expect(out.side_effects.supplier_shadow_write).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })
})

describe('Supplier Vision Worker endpoint — travas', () => {
  it('fica OFF por padrão', async () => {
    const res = mockRes()

    await handleSupplierVisionWorkerRequest({
      method: 'POST',
      headers: {},
      body: {},
    }, res, { env: {} })

    expect(res.state.status).toBe(404)
    expect(res.state.payload.error).toBe('SUPPLIER_VISION_WORKER_DISABLED')
  })

  it('write real exige confirmação explícita', async () => {
    const res = mockRes()
    const fetchImpl = vi.fn()

    await handleSupplierVisionWorkerRequest({
      method: 'POST',
      headers: {
        'x-prime-lab': 'GABY-LAB-COMERCIAL-V1',
        'x-prime-lab-secret': 'lab-secret',
      },
      body: { limit: 1, dry_run: false },
    }, res, {
      env: {
        SUPPLIER_VISION_WORKER_ENABLED: 'true',
        LAB_PRODUCT_UNIVERSE_API_SECRET: 'lab-secret',
      },
      fetchImpl,
    })

    expect(res.state.status).toBe(400)
    expect(res.state.payload.error).toBe('VISION_WRITE_CONFIRMATION_REQUIRED')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('segredo LAB incorreto bloqueia antes do provider/Supabase', async () => {
    const res = mockRes()
    const fetchImpl = vi.fn()

    await handleSupplierVisionWorkerRequest({
      method: 'POST',
      headers: {
        'x-prime-lab': 'GABY-LAB-COMERCIAL-V1',
        'x-prime-lab-secret': 'wrong',
      },
      body: { limit: 1 },
    }, res, {
      env: {
        SUPPLIER_VISION_WORKER_ENABLED: 'true',
        LAB_PRODUCT_UNIVERSE_API_SECRET: 'lab-secret',
      },
      fetchImpl,
    })

    expect(res.state.status).toBe(403)
    expect(res.state.payload.error).toBe('LAB_API_SECRET_INVALID')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('035_supplier_vision_worker_lab_rpc.sql — write gate estreito', () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const sql = fs.readFileSync(
    path.resolve(
      here,
      '../../supabase/migrations/035_supplier_vision_worker_lab_rpc.sql'
    ),
    'utf8'
  )

  it('cria queue e apply como SECURITY DEFINER com search_path fixo', () => {
    expect(sql).toContain('public.lab_supplier_vision_queue')
    expect(sql).toContain('public.lab_supplier_vision_apply')
    expect((sql.toLowerCase().match(/security definer/g) || []).length).toBe(2)
    expect((sql.toLowerCase().match(/set search_path = public, extensions/g) || []).length).toBe(2)
  })

  it('fila só expõe active + pending/review e limita no máximo 10', () => {
    expect(sql).toContain('s.active = true')
    expect(sql).toContain("s.analysis_status in ('pending', 'review')")
    expect(sql).toContain('least(coalesce(p_limit, 3), 10)')
  })

  it('apply só altera campos de análise e não concede SELECT/UPDATE direto', () => {
    expect(sql).toContain('update public.supplier_shadow_products s')
    expect(sql).toContain("p_analysis_status not in ('ready', 'review', 'error')")
    expect(sql.toLowerCase()).not.toContain(
      'grant update on table public.supplier_shadow_products'
    )
    expect(sql.toLowerCase()).not.toContain(
      'grant select on table public.supplier_shadow_products'
    )
  })

  it('migration guarda apenas hash do token, nunca plaintext', () => {
    expect(sql).toContain(
      '3718b30f28081b8323e645d895ad061f351f4e5efbf36d7b1254646281a0c737'
    )
    expect(sql).not.toContain('xbvyLx5JnlnPYfv4WQQCNFxd8j51-DA8Ge-kCknCSjs')
  })
})
