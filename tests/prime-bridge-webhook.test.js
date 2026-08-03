// tests/prime-bridge-webhook.test.js
//
// Teste definitivo (não descartável, substitui as POCs) de
// api/_primeBridgeWebhook.js — o handler real do webhook da PRIME Bridge
// na Vercel. Fora de api/ de propósito (mesmo motivo já usado em todas as
// POCs anteriores: não contar como Function/rota no deploy).
//
// Todo I/O externo é mockado via global.fetch — nenhuma chamada real ao
// Supabase, GPT Maker, ZAP-API ou WhatsApp. handleIncoming real é exercido
// (não mockado) porque é exatamente isso que este teste precisa provar:
// o handler encaminha o payload corretamente para a lógica já validada do
// núcleo.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const WEBHOOK_SECRET = 'segredo-de-teste-nao-e-real'

function makeRes() {
  const res = {
    statusCode: null,
    body: null,
    ended: false,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
    end() {
      this.ended = true
      return this
    },
  }
  return res
}

function makeReq({ method = 'POST', secret, body = {} } = {}) {
  return {
    method,
    query: secret === undefined ? {} : { secret },
    body,
  }
}

describe('api/_primeBridgeWebhook.js — handler real do webhook', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.WEBHOOK_PATH_SECRET = WEBHOOK_SECRET
    // BRIDGE_MODE precisa ser válido para o handler aceitar o request (ver
    // validateBridgeMode em bridgeCore.js) — 'complicated' aqui só porque é
    // o modo já em uso hoje; os testes existentes não dependem de qual modo,
    // já que testam camadas anteriores a essa divergência (secret, 404, etc.)
    // ou eventos que são ignorados nos dois modos (message.sent).
    process.env.BRIDGE_MODE = 'complicated'
    // Config real da Bridge (AGENT_ID etc.) fica ausente de propósito na
    // maioria dos testes — LIVE_MODE também ausente (default false), então
    // handleIncoming nunca tenta rede real mesmo que o secret bata.
    for (const key of ['LIVE_MODE', 'AGENT_ID', 'GPT_TOKEN', 'ZAPI_INSTANCE_ID', 'ZAPI_TOKEN', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY']) {
      delete process.env[key]
    }
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('1. GET retorna 404 e não chama handleIncoming (zero fetch)', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { runPrimeBridgeWebhook } = await import('../api/_primeBridgeWebhook.js')

    const res = makeRes()
    await runPrimeBridgeWebhook(makeReq({ method: 'GET', secret: WEBHOOK_SECRET }), res)

    expect(res.statusCode).toBe(404)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('2. POST sem secret retorna 404', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { runPrimeBridgeWebhook } = await import('../api/_primeBridgeWebhook.js')

    const res = makeRes()
    await runPrimeBridgeWebhook(makeReq({ secret: undefined }), res)

    expect(res.statusCode).toBe(404)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('3. POST com secret errado retorna 404', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { runPrimeBridgeWebhook } = await import('../api/_primeBridgeWebhook.js')

    const res = makeRes()
    await runPrimeBridgeWebhook(makeReq({ secret: 'segredo-errado-mas-mesmo-tamanho' }), res)

    expect(res.statusCode).toBe(404)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('4. POST com secret correto responde 200', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const { runPrimeBridgeWebhook } = await import('../api/_primeBridgeWebhook.js')

    const res = makeRes()
    await runPrimeBridgeWebhook(
      makeReq({ secret: WEBHOOK_SECRET, body: { event: 'message.sent', data: {} } }),
      res
    )

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('5. payload é encaminhado corretamente para handleIncoming (evento diferente de message.received é ignorado, mas processado)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn())
    const { runPrimeBridgeWebhook } = await import('../api/_primeBridgeWebhook.js')

    const res = makeRes()
    const payload = { event: 'message.sent', data: { messageId: 'x' } }
    await runPrimeBridgeWebhook(makeReq({ secret: WEBHOOK_SECRET, body: payload }), res)

    // waitUntil roda a promise; aguardamos um tick para o log interno aparecer
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Ignorado (evento não é message.received)'),
      expect.objectContaining({ event: 'message.sent' })
    )

    logSpy.mockRestore()
  })

  it('6. waitUntil recebe a Promise de handleIncoming', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const waitUntilMock = vi.fn()
    vi.doMock('@vercel/functions', () => ({ waitUntil: waitUntilMock }))
    vi.resetModules()

    const { runPrimeBridgeWebhook } = await import('../api/_primeBridgeWebhook.js')
    const res = makeRes()
    await runPrimeBridgeWebhook(makeReq({ secret: WEBHOOK_SECRET, body: { event: 'message.sent', data: {} } }), res)

    expect(waitUntilMock).toHaveBeenCalledTimes(1)
    expect(waitUntilMock.mock.calls[0][0]).toBeInstanceOf(Promise)

    vi.doUnmock('@vercel/functions')
    vi.resetModules()
  })

  it('7. getBridgeConfig é lida no momento da requisição, não capturada antes (LIVE_MODE reflete process.env atual)', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { runPrimeBridgeWebhook } = await import('../api/_primeBridgeWebhook.js')

    // Primeira chamada: LIVE_MODE ausente (false)
    let res = makeRes()
    await runPrimeBridgeWebhook(
      makeReq({ secret: WEBHOOK_SECRET, body: { event: 'message.received', data: { messageId: 'a', phone: '5599999999999', type: 'text', body: 'oi' } } }),
      res
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('LIVE_MODE inativo'), '')

    logSpy.mockClear()

    // Segunda chamada, MESMO processo, env mudou entre as duas chamadas —
    // prova que a config não ficou presa a um valor lido uma única vez.
    process.env.LIVE_MODE = 'true'
    process.env.AGENT_ID = 'a'
    process.env.GPT_TOKEN = 'b'
    process.env.ZAPI_INSTANCE_ID = 'c'
    process.env.ZAPI_TOKEN = 'd'
    process.env.SUPABASE_URL = 'https://mock.supabase.test'
    process.env.SUPABASE_SECRET_KEY = 'mock-key'

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ result: 'process' }) })))

    res = makeRes()
    await runPrimeBridgeWebhook(
      makeReq({ secret: WEBHOOK_SECRET, body: { event: 'message.received', data: { messageId: 'b', phone: '5599999999999', type: 'text', body: 'oi' } } }),
      res
    )
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('LIVE_MODE inativo'))

    logSpy.mockRestore()
  })

  it('8. nenhum segredo aparece em logs ou na resposta JSON', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn())
    const { runPrimeBridgeWebhook } = await import('../api/_primeBridgeWebhook.js')

    const res = makeRes()
    await runPrimeBridgeWebhook(makeReq({ secret: WEBHOOK_SECRET, body: { event: 'message.sent', data: {} } }), res)
    await new Promise((resolve) => setTimeout(resolve, 0))

    const allLogText = logSpy.mock.calls.map((args) => args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')).join('\n')
    expect(allLogText).not.toContain(WEBHOOK_SECRET)
    expect(JSON.stringify(res.body)).not.toContain(WEBHOOK_SECRET)

    logSpy.mockRestore()
  })

  it('9. nenhuma chamada externa real acontece nestes testes (fetch sempre mockado, nunca domínio real sem mock)', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchSpy)
    const { runPrimeBridgeWebhook } = await import('../api/_primeBridgeWebhook.js')

    const res = makeRes()
    await runPrimeBridgeWebhook(makeReq({ secret: 'errado' }), res)

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('10. BRIDGE_MODE ausente recusa o processamento com segurança (404, sem waitUntil, sem 200)', async () => {
    delete process.env.BRIDGE_MODE
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { runPrimeBridgeWebhook } = await import('../api/_primeBridgeWebhook.js')

    const res = makeRes()
    await runPrimeBridgeWebhook(
      makeReq({ secret: WEBHOOK_SECRET, body: { event: 'message.sent', data: {} } }),
      res
    )

    expect(res.statusCode).toBe(404)
    expect(res.body).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('11. BRIDGE_MODE com valor inválido (typo) recusa o processamento com segurança, nunca assume "complicated"', async () => {
    process.env.BRIDGE_MODE = 'Simple' // maiúscula errada — nunca aceito
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { runPrimeBridgeWebhook } = await import('../api/_primeBridgeWebhook.js')

    const res = makeRes()
    await runPrimeBridgeWebhook(
      makeReq({ secret: WEBHOOK_SECRET, body: { event: 'message.sent', data: {} } }),
      res
    )

    expect(res.statusCode).toBe(404)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
