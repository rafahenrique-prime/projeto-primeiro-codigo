import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * api/__tests__/systemToolsConsultarProduto.test.js
 *
 * Testes do dispatcher (default export real de system-tools.js) para
 * ?tool=consultar-produto (Fase 3, Etapa 3.3). Cobre só autenticação/
 * roteamento — a lógica de busca/scoring já tem sua própria suíte completa
 * em toolConsultarProduto.test.js. O helper é mockado aqui de propósito,
 * pelo mesmo motivo de systemToolsNex.test.js: isolar o teste do handler
 * (identificação do caller pelo segredo, códigos de status HTTP) da lógica
 * de negócio do helper.
 */

vi.mock('@base44/sdk', () => ({
  createClient: vi.fn(() => ({ entities: {} })),
}))

vi.mock('../_toolConsultarProduto.js', () => ({
  consultarProduto: vi.fn(async () => ({
    httpStatus: 200,
    body: { success: true, caller: 'prime_bridge', results: [] },
  })),
}))

const TEST_BRIDGE_SECRET = 'test-bridge-tools-secret-123'
const TEST_SUPABASE_URL = 'https://mock-project.supabase.co'
const TEST_SUPABASE_KEY = 'mock-supabase-anon-key'

let handler
let consultarProdutoMock

beforeEach(async () => {
  vi.resetModules()
  process.env.BRIDGE_TOOLS_SECRET = TEST_BRIDGE_SECRET
  process.env.VITE_SUPABASE_URL = TEST_SUPABASE_URL
  process.env.VITE_SUPABASE_KEY = TEST_SUPABASE_KEY

  const helperModule = await import('../_toolConsultarProduto.js')
  consultarProdutoMock = helperModule.consultarProduto
  consultarProdutoMock.mockClear()

  const systemTools = await import('../system-tools.js')
  handler = systemTools.default
})

function criarReq(overrides = {}) {
  return {
    method: 'POST',
    headers: {},
    query: { tool: 'consultar-produto' },
    body: { query: 'Nike Dunk' },
    socket: { remoteAddress: '192.168.1.1' },
    ...overrides,
  }
}

function criarRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(data) {
      this.body = data
      return this
    },
    setHeader() {
      return this
    },
    removeHeader() {
      return this
    },
  }
}

describe('dispatcher ?tool=consultar-produto', () => {
  it('A. autenticação correta → identifica caller=prime_bridge e delega ao helper', async () => {
    const req = criarReq({ headers: { authorization: `Bearer ${TEST_BRIDGE_SECRET}` } })
    const res = criarRes()

    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(consultarProdutoMock).toHaveBeenCalledTimes(1)
    const [bodyArg, identityArg, depsArg] = consultarProdutoMock.mock.calls[0]
    expect(bodyArg).toEqual({ query: 'Nike Dunk' })
    expect(identityArg).toEqual({ caller: 'prime_bridge' })
    expect(depsArg.supabaseConfig.baseUrl).toBe(TEST_SUPABASE_URL)
  })

  it('segredo ausente no header → 401, helper nunca chamado (ver também C)', async () => {
    const req = criarReq({ headers: {} })
    const res = criarRes()

    await handler(req, res)

    expect(res.statusCode).toBe(401)
    expect(res.body.success).toBe(false)
    expect(consultarProdutoMock).not.toHaveBeenCalled()
  })

  it('segredo incorreto (texto arbitrário) → 401, helper nunca chamado (ver também F/G)', async () => {
    const req = criarReq({ headers: { authorization: 'Bearer segredo-errado' } })
    const res = criarRes()

    await handler(req, res)

    expect(res.statusCode).toBe(401)
    expect(consultarProdutoMock).not.toHaveBeenCalled()
  })

  it('D. método incorreto (GET) → 405, helper nunca chamado', async () => {
    const req = criarReq({ method: 'GET', headers: { authorization: `Bearer ${TEST_BRIDGE_SECRET}` } })
    const res = criarRes()

    await handler(req, res)

    expect(res.statusCode).toBe(405)
    expect(consultarProdutoMock).not.toHaveBeenCalled()
  })

  it('B. BRIDGE_TOOLS_SECRET não configurado no servidor → 503/integration_not_configured, helper nunca chamado, segredo nunca mencionado', async () => {
    vi.resetModules()
    delete process.env.BRIDGE_TOOLS_SECRET
    process.env.VITE_SUPABASE_URL = TEST_SUPABASE_URL
    process.env.VITE_SUPABASE_KEY = TEST_SUPABASE_KEY

    const helperModule = await import('../_toolConsultarProduto.js')
    const localMock = helperModule.consultarProduto
    localMock.mockClear()
    const systemTools = await import('../system-tools.js')
    const localHandler = systemTools.default

    const req = criarReq({ headers: { authorization: 'Bearer qualquer-coisa' } })
    const res = criarRes()
    await localHandler(req, res)

    expect(res.statusCode).toBe(503)
    expect(res.body).toEqual({ success: false, error_code: 'integration_not_configured' })
    expect(JSON.stringify(res.body)).not.toMatch(/BRIDGE_TOOLS_SECRET/i)
    expect(localMock).not.toHaveBeenCalled()

    process.env.BRIDGE_TOOLS_SECRET = TEST_BRIDGE_SECRET
  })

  it('identity.caller vem só da autenticação (dispatcher nunca lê/deriva caller do body) — o helper mockado aqui só prova que o dispatcher não faz essa leitura; a REJEIÇÃO real de um body com "caller" (400/invalid_body) é do contrato fechado do helper, testada com o helper real em toolConsultarProduto.test.js (testes B/C/D/E)', async () => {
    const req = criarReq({
      headers: { authorization: `Bearer ${TEST_BRIDGE_SECRET}` },
      body: { query: 'Nike Dunk', caller: 'instagram_falso' },
    })
    const res = criarRes()

    await handler(req, res)

    const [, identityArg] = consultarProdutoMock.mock.calls[0]
    expect(identityArg.caller).toBe('prime_bridge')
  })

  it('C. Authorization ausente → 401/unauthorized', async () => {
    const req = criarReq({ headers: {} })
    const res = criarRes()
    await handler(req, res)
    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ success: false, error_code: 'unauthorized' })
    expect(consultarProdutoMock).not.toHaveBeenCalled()
  })

  it('D. esquema Basic em vez de Bearer → 401/unauthorized', async () => {
    const req = criarReq({ headers: { authorization: `Basic ${Buffer.from(`user:${TEST_BRIDGE_SECRET}`).toString('base64')}` } })
    const res = criarRes()
    await handler(req, res)
    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ success: false, error_code: 'unauthorized' })
    expect(consultarProdutoMock).not.toHaveBeenCalled()
  })

  it('E. Bearer sem valor (vazio ou só espaços) → 401/unauthorized', async () => {
    const resVazio = criarRes()
    await handler(criarReq({ headers: { authorization: 'Bearer ' } }), resVazio)
    expect(resVazio.statusCode).toBe(401)
    expect(resVazio.body).toEqual({ success: false, error_code: 'unauthorized' })

    const resEspacos = criarRes()
    await handler(criarReq({ headers: { authorization: 'Bearer    ' } }), resEspacos)
    expect(resEspacos.statusCode).toBe(401)
    expect(resEspacos.body).toEqual({ success: false, error_code: 'unauthorized' })

    expect(consultarProdutoMock).not.toHaveBeenCalled()
  })

  it('F. token incorreto de MESMO comprimento do segredo real → 401, sem exceção', async () => {
    const tokenErradoMesmoTamanho = 'x'.repeat(TEST_BRIDGE_SECRET.length)
    const req = criarReq({ headers: { authorization: `Bearer ${tokenErradoMesmoTamanho}` } })
    const res = criarRes()
    await expect(handler(req, res)).resolves.not.toThrow()
    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ success: false, error_code: 'unauthorized' })
    expect(consultarProdutoMock).not.toHaveBeenCalled()
  })

  it('G. token incorreto de comprimento DIFERENTE do segredo real → 401, sem exceção', async () => {
    const tokenCurto = 'ab'
    const tokenLongo = TEST_BRIDGE_SECRET + 'extra-bytes-a-mais-bem-maior'
    const resCurto = criarRes()
    await expect(handler(criarReq({ headers: { authorization: `Bearer ${tokenCurto}` } }), resCurto)).resolves.not.toThrow()
    expect(resCurto.statusCode).toBe(401)

    const resLongo = criarRes()
    await expect(handler(criarReq({ headers: { authorization: `Bearer ${tokenLongo}` } }), resLongo)).resolves.not.toThrow()
    expect(resLongo.statusCode).toBe(401)

    expect(consultarProdutoMock).not.toHaveBeenCalled()
  })

  it('I. B/C/D/E/F/G nunca diferenciam o motivo — sempre o mesmo status e o mesmo error_code', async () => {
    const cenarios = [
      {},
      { authorization: `Basic ${Buffer.from('user:pass').toString('base64')}` },
      { authorization: 'Bearer ' },
      { authorization: `Bearer ${'x'.repeat(TEST_BRIDGE_SECRET.length)}` },
      { authorization: 'Bearer ab' },
    ]
    for (const headers of cenarios) {
      const res = criarRes()
      await handler(criarReq({ headers }), res)
      expect(res.statusCode).toBe(401)
      expect(res.body).toEqual({ success: false, error_code: 'unauthorized' })
    }
  })

  it('J. o segredo nunca aparece em nenhuma resposta, em nenhum cenário testado', async () => {
    const cenarios = [
      { headers: {} },
      { headers: { authorization: 'Bearer segredo-errado' } },
      { headers: { authorization: `Bearer ${TEST_BRIDGE_SECRET}` } },
    ]
    for (const req of cenarios) {
      const res = criarRes()
      await handler(criarReq(req), res)
      expect(JSON.stringify(res.body)).not.toContain(TEST_BRIDGE_SECRET)
    }
  })
})
