import { describe, it, expect, vi } from 'vitest'
import { handleSupplierHarnessOcrProxy } from '../_supplierHarnessOcrProxyRoute.js'

function mockRes() {
  const state = { status: null, payload: null }
  return {
    state,
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

describe('Supplier Harness OCR proxy route', () => {
  it('bloqueia quando o segredo LAB está ausente no servidor', async () => {
    const res = mockRes()
    const systemToolsFn = vi.fn()

    await handleSupplierHarnessOcrProxy(
      { method: 'POST', headers: {}, query: {} },
      res,
      { env: {}, systemToolsFn }
    )

    expect(res.state.status).toBe(503)
    expect(systemToolsFn).not.toHaveBeenCalled()
  })

  it('bloqueia segredo incorreto', async () => {
    const res = mockRes()
    const systemToolsFn = vi.fn()

    await handleSupplierHarnessOcrProxy(
      {
        method: 'POST',
        headers: { 'x-prime-lab-secret': 'errado' },
        query: {},
      },
      res,
      {
        env: { LAB_PRODUCT_UNIVERSE_API_SECRET: 'correto' },
        systemToolsFn,
      }
    )

    expect(res.state.status).toBe(401)
    expect(systemToolsFn).not.toHaveBeenCalled()
  })

  it('encaminha somente como ocr-openrouter quando autenticado', async () => {
    const res = mockRes()
    const systemToolsFn = vi.fn(async (req, outRes) => {
      expect(req.query.tool).toBe('ocr-openrouter')
      return outRes.status(200).json({ ok: true })
    })

    await handleSupplierHarnessOcrProxy(
      {
        method: 'POST',
        headers: { 'x-prime-lab-secret': 'lab-secret' },
        query: { tool: 'outra-coisa' },
      },
      res,
      {
        env: { LAB_PRODUCT_UNIVERSE_API_SECRET: 'lab-secret' },
        systemToolsFn,
      }
    )

    expect(res.state.status).toBe(200)
    expect(systemToolsFn).toHaveBeenCalledTimes(1)
  })
})
