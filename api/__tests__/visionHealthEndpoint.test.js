// api/__tests__/visionHealthEndpoint.test.js
//
// Prova de integração do handler real de api/system-tools.js?tool=vision-health
// — sem tocar Supabase de verdade (fetch mockado). Confirma:
// 1. Passo 5A: autenticação Bearer <VISION_HEALTH_TOKEN> — sem token/token
//    errado → 401; token correto → 200; token nunca aparece na resposta;
// 2. funciona com tabela vazia (no_data), nunca 500;
// 3. READ ONLY — nenhuma chamada de escrita (POST/PATCH/DELETE) é feita;
// 4. só aceita GET (depois de autenticado);
// 5. resposta bate com o contrato (chaves top-level esperadas);
// 6. outras tools de system-tools.js não foram afetadas pela proteção nova.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const ORIGINAL_ENV = { ...process.env }
const TOKEN_VALIDO = 'fixture-vision-health-token-nao-real'

function makeRes() {
  const res = { statusCode: null, body: null, headers: {} }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (payload) => { res.body = payload; return res }
  res.setHeader = (k, v) => { res.headers[k] = v; return res }
  res.end = () => res
  return res
}

function makeReq(tool, { method = 'GET', bearer } = {}) {
  return {
    method,
    query: { tool },
    body: {},
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  }
}

describe('api/system-tools.js?tool=vision-health', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV }
    process.env.VITE_SUPABASE_URL = 'https://fixture.supabase.co'
    process.env.SUPABASE_SECRET_KEY = 'fixture-secret-key'
    process.env.VISION_HEALTH_TOKEN = TOKEN_VALIDO
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    process.env = { ...ORIGINAL_ENV }
  })

  function stubFetchVazio() {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('vision_usage_events')) return { ok: true, status: 200, json: async () => [] }
      throw new Error(`fetch não mockado: ${url}`)
    }))
  }

  describe('[Passo 5A] autenticação Bearer', () => {
    it('sem Authorization → 401', async () => {
      stubFetchVazio()
      const { default: handler } = await import('../system-tools.js')
      const res = makeRes()
      await handler(makeReq('vision-health'), res) // sem bearer
      expect(res.statusCode).toBe(401)
    })

    it('Bearer incorreto → 401', async () => {
      stubFetchVazio()
      const { default: handler } = await import('../system-tools.js')
      const res = makeRes()
      await handler(makeReq('vision-health', { bearer: 'token-errado' }), res)
      expect(res.statusCode).toBe(401)
    })

    it('Bearer de comprimento igual mas conteúdo diferente → 401 (prova que não é só checagem de tamanho)', async () => {
      stubFetchVazio()
      const { default: handler } = await import('../system-tools.js')
      const res = makeRes()
      const tokenMesmoTamanho = 'x'.repeat(TOKEN_VALIDO.length)
      await handler(makeReq('vision-health', { bearer: tokenMesmoTamanho }), res)
      expect(res.statusCode).toBe(401)
    })

    it('Bearer correto → 200, contrato normal', async () => {
      stubFetchVazio()
      const { default: handler } = await import('../system-tools.js')
      const res = makeRes()
      await handler(makeReq('vision-health', { bearer: TOKEN_VALIDO }), res)
      expect(res.statusCode).toBe(200)
      expect(res.body.status).toBe('no_data')
    })

    it('VISION_HEALTH_TOKEN não configurado no servidor → 503 (falha fechado, nunca libera geral)', async () => {
      delete process.env.VISION_HEALTH_TOKEN
      stubFetchVazio()
      const { default: handler } = await import('../system-tools.js')
      const res = makeRes()
      await handler(makeReq('vision-health', { bearer: TOKEN_VALIDO }), res)
      expect(res.statusCode).toBe(503)
    })

    it('o token nunca aparece na resposta nem em nenhum console.* chamado', async () => {
      stubFetchVazio()
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const { default: handler } = await import('../system-tools.js')

      const resOk = makeRes()
      await handler(makeReq('vision-health', { bearer: TOKEN_VALIDO }), resOk)
      const resFail = makeRes()
      await handler(makeReq('vision-health', { bearer: 'errado' }), resFail)

      expect(JSON.stringify(resOk.body)).not.toContain(TOKEN_VALIDO)
      expect(JSON.stringify(resFail.body)).not.toContain(TOKEN_VALIDO)

      const todasChamadasDeLog = [...warnSpy.mock.calls, ...errorSpy.mock.calls, ...logSpy.mock.calls]
      for (const args of todasChamadasDeLog) {
        expect(JSON.stringify(args)).not.toContain(TOKEN_VALIDO)
      }

      warnSpy.mockRestore()
      errorSpy.mockRestore()
      logSpy.mockRestore()
    })
  })

  it('tabela vazia → 200, status=no_data, nunca 500', async () => {
    stubFetchVazio()
    const { default: handler } = await import('../system-tools.js')
    const res = makeRes()
    await handler(makeReq('vision-health', { bearer: TOKEN_VALIDO }), res)

    expect(res.statusCode).toBe(200)
    expect(res.body.status).toBe('no_data')
    expect(res.body.today.calls).toBe(0)
    expect(res.body.month.calls).toBe(0)
    expect(res.body.lifetime.cost_usd).toBe(0)
    expect(res.body.recent).toEqual([])
    expect(res.body.provider).toBe('openrouter')
    expect(res.body.model).toBe('google/gemini-2.5-flash-lite')
  })

  it('READ ONLY — nenhuma chamada de escrita a vision_usage_events (só GET implícito, nunca method POST/PATCH/DELETE)', async () => {
    const fetchMock = vi.fn(async (url, init) => {
      if (String(url).includes('vision_usage_events')) {
        const method = init?.method
        expect(method === undefined || method === 'GET').toBe(true)
        return { ok: true, status: 200, json: async () => [] }
      }
      throw new Error(`fetch não mockado: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const { default: handler } = await import('../system-tools.js')
    await handler(makeReq('vision-health', { bearer: TOKEN_VALIDO }), makeRes())

    // today, month, recent, lifetime — 4 leituras, nenhuma escrita.
    const chamadasVisionEvents = fetchMock.mock.calls.filter(([url]) => String(url).includes('vision_usage_events'))
    expect(chamadasVisionEvents).toHaveLength(4)
  })

  it('POST (já autenticado) é rejeitado com 405 (endpoint é GET-only)', async () => {
    stubFetchVazio()
    const { default: handler } = await import('../system-tools.js')
    const res = makeRes()
    await handler(makeReq('vision-health', { method: 'POST', bearer: TOKEN_VALIDO }), res)
    expect(res.statusCode).toBe(405)
  })

  it('com eventos reais mockados, contrato reflete os dados (status healthy, chaves top-level presentes)', async () => {
    const eventoHoje = {
      success: true, latency_ms: 900, input_tokens: 100, output_tokens: 20, total_tokens: 120,
      cost_usd: 0.0001, media_type: 'image', ffmpeg_used: false, error_code: null,
    }
    const eventoRecente = {
      created_at: '2026-08-31T12:00:00.000Z', source: 'story', media_type: 'image', ffmpeg_used: false,
      model: 'google/gemini-2.5-flash-lite', success: true, latency_ms: 900, total_tokens: 120,
      cost_usd: 0.0001, cost_source: 'real', error_code: null,
    }
    // Datasets distintos por query, pra provar que lifetime é independente
    // de today/month (não é o mesmo array reaproveitado por acidente).
    const fetchMock = vi.fn(async (url) => {
      const u = String(url)
      if (u.includes('order=created_at.desc')) return { ok: true, status: 200, json: async () => [eventoRecente] }
      if (u.includes('select=cost_usd') && !u.includes('created_at')) {
        // lifetime — sem filtro de data, só a coluna cost_usd
        return { ok: true, status: 200, json: async () => [{ cost_usd: 0.001 }, { cost_usd: 0.002 }, { cost_usd: null }] }
      }
      if (u.includes('vision_usage_events')) return { ok: true, status: 200, json: async () => [eventoHoje] }
      throw new Error(`fetch não mockado: ${u}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const { default: handler } = await import('../system-tools.js')
    const res = makeRes()
    await handler(makeReq('vision-health', { bearer: TOKEN_VALIDO }), res)

    expect(res.statusCode).toBe(200)
    expect(res.body.status).toBe('healthy')
    expect(res.body).toHaveProperty('today')
    expect(res.body).toHaveProperty('month')
    expect(res.body).toHaveProperty('lifetime')
    expect(res.body).toHaveProperty('media')
    expect(res.body).toHaveProperty('failures')
    expect(res.body).toHaveProperty('provider_health')
    expect(res.body).toHaveProperty('recent')
    expect(res.body).toHaveProperty('alerts')
    expect(res.body.recent[0].source).toBe('story')

    // lifetime.cost_usd = 0.001 + 0.002 (o null é ignorado) — independente
    // do cost_usd de today (0.0001), prova que a query não foi reaproveitada.
    expect(res.body.lifetime.cost_usd).toBeCloseTo(0.003, 6)
    expect(res.body.today.cost_usd).toBe(0.0001)
  })

  it('nenhum PII na resposta final serializada, mesmo com dados reais', async () => {
    const eventoRecente = {
      created_at: '2026-08-31T12:00:00.000Z', source: 'story', media_type: 'image', ffmpeg_used: false,
      model: 'google/gemini-2.5-flash-lite', success: true, latency_ms: 900, total_tokens: 120,
      cost_usd: 0.0001, cost_source: 'real', error_code: null,
    }
    const fetchMock = vi.fn(async (url) => {
      const u = String(url)
      if (u.includes('order=created_at.desc')) return { ok: true, status: 200, json: async () => [eventoRecente] }
      return { ok: true, status: 200, json: async () => [] }
    })
    vi.stubGlobal('fetch', fetchMock)

    const { default: handler } = await import('../system-tools.js')
    const res = makeRes()
    await handler(makeReq('vision-health', { bearer: TOKEN_VALIDO }), res)

    const serialized = JSON.stringify(res.body)
    for (const termo of ['chat_id', 'telefone', 'storyMediaUrl', 'gpt-files.com', 'base64']) {
      expect(serialized).not.toContain(termo)
    }
  })

  describe('[Passo 5A] outras tools não foram afetadas', () => {
    it('tool=vercel-status continua sem exigir Authorization (nenhum 401 novo)', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
      const { default: handler } = await import('../system-tools.js')
      const res = makeRes()
      // vercel-status não recebe bearer nenhum — se a proteção do vision-health
      // tivesse vazado pro dispatcher geral, isto retornaria 401.
      await handler({ method: 'GET', query: { tool: 'vercel-status' }, body: {}, headers: {} }, res)
      expect(res.statusCode).not.toBe(401)
    })

    it('tool inválida/ausente continua retornando 400, não 401 (proteção é só do vision-health)', async () => {
      const { default: handler } = await import('../system-tools.js')
      const res = makeRes()
      await handler({ method: 'GET', query: {}, body: {}, headers: {} }, res)
      expect(res.statusCode).toBe(400)
    })
  })
})
