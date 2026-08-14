// Testes permanentes de integração da ferramenta consultar_frete dentro do
// protocolo MCP (api/system-tools.js, tool=mcp). Mocka fetch (Frenet) e o SDK
// Base44 (usado por consultar_cobrancas, só pra não quebrar o import do arquivo).
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

vi.mock('@base44/sdk', () => ({
  createClient: vi.fn(() => ({ entities: { Cliente: { filter: vi.fn(async () => []) }, Parcela: { filter: vi.fn(async () => []) } } })),
}))

let handler

beforeAll(async () => {
  process.env.MCP_LITE_SECRET = 'test-secret-nao-real'
  process.env.BASE44_API_KEY = 'test-base44-key-nao-real'
  process.env.FRENET_TOKEN = 'test-frenet-token-nao-real'
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

describe('MCP — consultar_frete registrado e roteado corretamente', () => {
  it('1. tools/list contém consultar_frete (junto das outras três)', async () => {
    const r = await call({ headers: auth, body: { jsonrpc: '2.0', id: 1, method: 'tools/list' } })
    const nomes = r._json.result.tools.map(t => t.name).sort()
    expect(nomes).toEqual(['consultar_cep', 'consultar_cobrancas', 'consultar_frete', 'verificar_conexao'])
  })

  it('2. schema de consultar_frete exige "cep_destino" como obrigatório', async () => {
    const r = await call({ headers: auth, body: { jsonrpc: '2.0', id: 2, method: 'tools/list' } })
    const freteTool = r._json.result.tools.find(t => t.name === 'consultar_frete')
    expect(freteTool.inputSchema.required).toEqual(['cep_destino'])
    expect(freteTool.inputSchema.additionalProperties).toBe(false)
  })

  it('3. tools/call encaminha corretamente para consultar_frete e retorna as opções', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ShippingSevicesArray: [
          { ServiceCode: '04510', ServiceDescription: 'PAC', ShippingPrice: '32.50', DeliveryTime: '7', Error: false },
        ],
      }),
    }))
    const r = await call({
      headers: auth,
      body: { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'consultar_frete', arguments: { cep_destino: '38401-216' } } },
    })
    expect(r._status).toBe(200)
    expect(r._json.result.isError).toBe(false)
    expect(r._json.result.structuredContent.status).toBe('ok')
    expect(r._json.result.structuredContent.opcoes[0].servico).toBe('PAC')
    expect(r._json.id).toBe(3)
  })

  it('3a. content[0].text resume valor e prazo pra Gaby ler', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ShippingSevicesArray: [
          { ServiceCode: '04510', ServiceDescription: 'PAC', ShippingPrice: '32.50', DeliveryTime: '7', Error: false },
        ],
      }),
    }))
    const r = await call({
      headers: auth,
      body: { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'consultar_frete', arguments: { cep_destino: '38401216' } } },
    })
    const texto = r._json.result.content[0].text
    expect(texto).toContain('38401-216')
    expect(texto).toContain('PAC')
    expect(texto).toContain('32.50')
    expect(texto).toContain('7 dia(s)')
  })

  it('4. cep_destino inválido via tools/call -> isError:true, protocolo não quebra', async () => {
    const r = await call({
      headers: auth,
      body: { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'consultar_frete', arguments: { cep_destino: '123' } } },
    })
    expect(r._status).toBe(200)
    expect(r._json.result.isError).toBe(true)
  })

  it('5. sem opções válidas (todas Error:true) -> isError:true', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ShippingSevicesArray: [{ ServiceCode: '04510', Error: true }] }),
    }))
    const r = await call({
      headers: auth,
      body: { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'consultar_frete', arguments: { cep_destino: '38401216' } } },
    })
    expect(r._json.result.isError).toBe(true)
    expect(r._json.result.structuredContent.status).toBe('sem_opcoes')
  })

  it('6. erro da Frenet não vaza detalhe interno via MCP', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('detalhe interno sensível de rede')))
    const r = await call({
      headers: auth,
      body: { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'consultar_frete', arguments: { cep_destino: '38401216' } } },
    })
    expect(r._json.result.isError).toBe(true)
    expect(JSON.stringify(r._json)).not.toContain('detalhe interno sensível')
  })

  it('7. token da Frenet nunca aparece em nenhuma resposta MCP', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ShippingSevicesArray: [
          { ServiceCode: '04510', ServiceDescription: 'PAC', ShippingPrice: '32.50', DeliveryTime: '7', Error: false },
        ],
      }),
    }))
    const r = await call({
      headers: auth,
      body: { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'consultar_frete', arguments: { cep_destino: '38401216' } } },
    })
    expect(JSON.stringify(r._json)).not.toContain('test-frenet-token-nao-real')
  })
})

describe('MCP — ferramentas anteriores continuam funcionando (regressão)', () => {
  it('8. verificar_conexao continua funcionando sem alteração de comportamento', async () => {
    const r = await call({ headers: auth, body: { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'verificar_conexao', arguments: {} } } })
    expect(r._json.result.isError).toBe(false)
  })

  it('9. consultar_cep continua roteando normalmente (sem interferência de consultar_frete)', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ logradouro: 'Praça da Sé', bairro: 'Sé', localidade: 'São Paulo', uf: 'SP', ibge: '3550308' }),
    }))
    const r = await call({
      headers: auth,
      body: { jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'consultar_cep', arguments: { cep: '01001-000' } } },
    })
    expect(r._json.result.isError).toBe(false)
    expect(r._json.result.structuredContent.status).toBe('encontrado')
  })

  it('10. consultar_cobrancas continua roteando normalmente', async () => {
    const r = await call({
      headers: auth,
      body: { jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'consultar_cobrancas', arguments: {} } },
    })
    expect(r._json.result.isError).toBe(true)
  })
})
