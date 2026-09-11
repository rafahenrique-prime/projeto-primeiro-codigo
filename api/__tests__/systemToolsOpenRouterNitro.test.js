import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const ORIGINAL_ENV = { ...process.env }

function makeRes() {
  const res = { statusCode: null, body: null, headers: {} }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (payload) => { res.body = payload; return res }
  res.setHeader = (key, value) => { res.headers[key] = value; return res }
  res.end = () => res
  return res
}

function makeReq(tool, model) {
  return {
    method: 'POST',
    query: { tool },
    headers: {},
    body: {
      model,
      messages: [{ role: 'user', content: 'fixture' }],
      temperature: 0,
      max_tokens: 20,
    },
  }
}

function openRouterCatalog() {
  return {
    data: [{
      id: 'openrouter/free',
      name: 'OpenRouter Free',
      context_length: 131072,
      pricing: { prompt: '0', completion: '0' },
      architecture: { input_modalities: ['text'], output_modalities: ['text'] },
    }],
  }
}

function stubOpenRouterFetch(capturedBodies) {
  vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
    const u = String(url)
    if (u === 'https://openrouter.ai/api/v1/models') {
      return { ok: true, status: 200, json: async () => openRouterCatalog() }
    }
    if (u === 'https://openrouter.ai/api/v1/chat/completions') {
      capturedBodies.push(JSON.parse(init.body))
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
      }
    }
    throw new Error(`fetch não mockado: ${u}`)
  }))
}

describe('system-tools OpenRouter — roteamento rápido isolado na Vision', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV, OPENROUTER_API_KEY: 'fixture-openrouter-key' }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    process.env = { ...ORIGINAL_ENV }
  })

  it('ocr-openrouter prioriza o provedor de maior throughput sem trocar o modelo', async () => {
    const bodies = []
    stubOpenRouterFetch(bodies)
    const { default: handler } = await import('../system-tools.js')
    const res = makeRes()

    await handler(makeReq('ocr-openrouter', 'google/gemini-2.5-flash-lite'), res)

    expect(res.statusCode).toBe(200)
    expect(bodies).toHaveLength(1)
    expect(bodies[0].model).toBe('google/gemini-2.5-flash-lite')
    expect(bodies[0].provider).toEqual({ sort: 'throughput' })
  })

  it('codex-openrouter não recebe provider.sort — mudança fica isolada à Vision', async () => {
    const bodies = []
    stubOpenRouterFetch(bodies)
    const { default: handler } = await import('../system-tools.js')
    const res = makeRes()

    await handler(makeReq('codex-openrouter', 'openrouter/free'), res)

    expect(res.statusCode).toBe(200)
    expect(bodies).toHaveLength(1)
    expect(bodies[0]).not.toHaveProperty('provider')
  })
})
