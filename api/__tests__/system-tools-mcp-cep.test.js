// Testes permanentes de integração da ferramenta consultar_cep dentro do
// protocolo MCP (api/system-tools.js, tool=mcp). Mocka fetch (ViaCEP) e o SDK
// Base44 (usado por consultar_cobrancas, só pra não quebrar o import do arquivo).
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

vi.mock('@base44/sdk', () => ({
  createClient: vi.fn(() => ({ entities: { Cliente: { filter: vi.fn(async () => []) }, Parcela: { filter: vi.fn(async () => []) } } })),
}))

let handler

beforeAll(async () => {
  process.env.MCP_LITE_SECRET = 'test-secret-nao-real'
  process.env.BASE44_API_KEY = 'test-base44-key-nao-real'
  const mod = await import('../system-tools.js')
  handler = mod.default
})

beforeEach(() => {
  vi.restoreAllMocks()
})

function mockRes() {
  return {
    _status: 200, _json: undefined, _ended: false,
    status(c) { this._status = c; return this },
    json(o) { this._json = o; return this },
    end() { this._ended = true; return this },
    setHeader() {}, removeHeader() {},
  }
}

async function call(opts = {}) {
  const req = {
    method: opts.method || 'POST',
    query: { tool: 'mcp' },
    headers: opts.headers || {},
    body: opts.body,
    socket: {},
  }
  const res = mockRes()
  await handler(req, res)
  return res
}

const auth = { authorization: 'Bearer test-secret-nao-real' }

describe('MCP — consultar_cep registrado e roteado corretamente', () => {
  it('15. tools/list contém consultar_cep (junto das outras duas)', async () => {
    const r = await call({ headers: auth, body: { jsonrpc: '2.0', id: 1, method: 'tools/list' } })
    const nomes = r._json.result.tools.map(t => t.name).sort()
    expect(nomes).toEqual(['consultar_cep', 'consultar_cobrancas', 'verificar_conexao'])
  })

  it('16. schema de consultar_cep exige "cep" como obrigatório', async () => {
    const r = await call({ headers: auth, body: { jsonrpc: '2.0', id: 2, method: 'tools/list' } })
    const cepTool = r._json.result.tools.find(t => t.name === 'consultar_cep')
    expect(cepTool.inputSchema.required).toEqual(['cep'])
    expect(cepTool.inputSchema.additionalProperties).toBe(false)
  })

  it('17. tools/call encaminha corretamente para consultar_cep e retorna o endereço', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ logradouro: 'Praça da Sé', bairro: 'Sé', localidade: 'São Paulo', uf: 'SP', ibge: '3550308' }),
    }))
    const r = await call({
      headers: auth,
      body: { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'consultar_cep', arguments: { cep: '01001-000' } } },
    })
    expect(r._status).toBe(200)
    expect(r._json.result.isError).toBe(false)
    expect(r._json.result.structuredContent.status).toBe('encontrado')
    expect(r._json.result.structuredContent.endereco.cidade).toBe('São Paulo')
    expect(r._json.id).toBe(3)
  })

  it('17b. CEP inválido via tools/call -> isError:true, protocolo não quebra', async () => {
    const r = await call({
      headers: auth,
      body: { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'consultar_cep', arguments: { cep: '123' } } },
    })
    expect(r._status).toBe(200)
    expect(r._json.result.isError).toBe(true)
  })

  it('19b. erro do ViaCEP não vaza detalhe interno via MCP', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('detalhe interno sensível de rede')))
    const r = await call({
      headers: auth,
      body: { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'consultar_cep', arguments: { cep: '38408100' } } },
    })
    expect(r._json.result.isError).toBe(true)
    expect(JSON.stringify(r._json)).not.toContain('detalhe interno sensível')
  })
})

describe('MCP — ferramentas anteriores continuam funcionando (regressão)', () => {
  it('18. verificar_conexao continua funcionando sem alteração de comportamento', async () => {
    const r = await call({ headers: auth, body: { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'verificar_conexao', arguments: {} } } })
    expect(r._json.result.isError).toBe(false)
    expect(r._json.result.content[0].text).toBe('IGNITE PRIME MCP Lite conectado com sucesso.')
  })

  it('18b. consultar_cobrancas continua roteando normalmente (sem interferência de consultar_cep)', async () => {
    const r = await call({
      headers: auth,
      body: { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'consultar_cobrancas', arguments: {} } },
    })
    // Mock do Base44 sempre retorna [] e nenhum nome/telefone foi passado -> erro de validação.
    expect(r._json.result.isError).toBe(true)
  })

  it('18c. initialize e notificações continuam com o comportamento já aprovado', async () => {
    const rInit = await call({ headers: auth, body: { jsonrpc: '2.0', id: 8, method: 'initialize' } })
    expect(rInit._json.result.serverInfo.name).toBe('ignite-prime-mcp-lite')

    const rNotif = await call({ headers: auth, body: { jsonrpc: '2.0', method: 'notifications/initialized' } })
    expect(rNotif._status).toBe(202)
    expect(rNotif._json).toBeUndefined()
  })
})
