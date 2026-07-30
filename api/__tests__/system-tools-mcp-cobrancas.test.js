// Testes permanentes de integração da ferramenta consultar_cobrancas dentro do
// protocolo MCP (api/system-tools.js, tool=mcp). Mocka o SDK Base44 por completo:
// nenhuma chamada real, nenhum dado real, nenhuma escrita.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

vi.mock('@base44/sdk', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@base44/sdk'

let handler

beforeAll(async () => {
  process.env.MCP_LITE_SECRET = 'test-secret-nao-real'
  process.env.BASE44_API_KEY = 'test-base44-key-nao-real'
  const mod = await import('../system-tools.js')
  handler = mod.default
})

function fakePrimeClient({ clientes = [], parcelas = [] } = {}) {
  return {
    entities: {
      Cliente: { filter: vi.fn(async () => clientes) },
      Parcela: { filter: vi.fn(async () => parcelas) },
    },
  }
}

beforeEach(() => {
  createClient.mockReset()
  createClient.mockReturnValue(fakePrimeClient())
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

describe('MCP — regressão de handshake', () => {
  it('1. initialize continua funcionando', async () => {
    const r = await call({ headers: auth, body: { jsonrpc: '2.0', id: 1, method: 'initialize' } })
    expect(r._status).toBe(200)
    expect(r._json.result.serverInfo.name).toBe('ignite-prime-mcp-lite')
  })

  it('2. notifications/initialized continua funcionando (sem corpo, 202)', async () => {
    const r = await call({ headers: auth, body: { jsonrpc: '2.0', method: 'notifications/initialized' } })
    expect(r._status).toBe(202)
    expect(r._json).toBeUndefined()
  })

  it('3. tools/list retorna exatamente verificar_conexao e consultar_cobrancas', async () => {
    const r = await call({ headers: auth, body: { jsonrpc: '2.0', id: 2, method: 'tools/list' } })
    expect(r._status).toBe(200)
    const nomes = r._json.result.tools.map(t => t.name).sort()
    expect(nomes).toEqual(['consultar_cobrancas', 'verificar_conexao'])
  })

  it('4. verificar_conexao continua funcionando', async () => {
    const r = await call({ headers: auth, body: { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'verificar_conexao', arguments: {} } } })
    expect(r._status).toBe(200)
    expect(r._json.result.isError).toBe(false)
    expect(r._json.result.content[0].text).toBe('IGNITE PRIME MCP Lite conectado com sucesso.')
  })
})

describe('MCP — tools/call consultar_cobrancas', () => {
  it('5. busca por nome via tools/call -> confirmacao_necessaria, sem financeiro', async () => {
    createClient.mockReturnValue(fakePrimeClient({ clientes: [{ id: 'c1', nome: 'Rafael Teste', telefone: '34999997499' }] }))
    const r = await call({
      headers: auth,
      body: { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'consultar_cobrancas', arguments: { nome_cliente: 'Rafael Teste' } } },
    })
    expect(r._status).toBe(200)
    expect(r._json.result.isError).toBe(false)
    expect(r._json.result.structuredContent.status).toBe('confirmacao_necessaria')
    expect(r._json.result.structuredContent.candidatos[0].telefone_mascarado).toBe('******7499')
  })

  it('6. busca por telefone via tools/call -> retorna financeiro dentro do structuredContent', async () => {
    createClient.mockReturnValue(fakePrimeClient({
      clientes: [{ id: 'c1', nome: 'Rafael Teste', telefone: '34999997499' }],
      parcelas: [{ id: 'p1', cliente_id: 'c1', numero: 1, valor_base: 150, status: 'pendente', data_vencimento: '2020-01-01' }],
    }))
    const r = await call({
      headers: auth,
      body: { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'consultar_cobrancas', arguments: { telefone: '34999997499' } } },
    })
    expect(r._status).toBe(200)
    expect(r._json.result.structuredContent.status).toBe('ok')
    expect(r._json.result.structuredContent.parcelas).toHaveLength(1)
    expect(r._json.result.structuredContent.parcelas[0].status).toBe('vencida')
  })

  it('7. resposta de erro controlado (sem nome nem telefone) -> isError:true, protocolo não quebra', async () => {
    const r = await call({
      headers: auth,
      body: { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'consultar_cobrancas', arguments: {} } },
    })
    expect(r._status).toBe(200)
    expect(r._json.result.isError).toBe(true)
  })

  it('8. id JSON-RPC continua preservado em toda resposta de consultar_cobrancas', async () => {
    createClient.mockReturnValue(fakePrimeClient({ clientes: [] }))
    const r = await call({
      headers: auth,
      body: { jsonrpc: '2.0', id: 'abc-123', method: 'tools/call', params: { name: 'consultar_cobrancas', arguments: { nome_cliente: 'Alguem' } } },
    })
    expect(r._json.id).toBe('abc-123')
  })

  it('9. batch JSON-RPC continua suportado com consultar_cobrancas dentro do lote', async () => {
    createClient.mockReturnValue(fakePrimeClient({ clientes: [] }))
    const req = {
      method: 'POST',
      query: { tool: 'mcp' },
      headers: auth,
      body: [
        { jsonrpc: '2.0', id: 1, method: 'tools/list' },
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'consultar_cobrancas', arguments: { nome_cliente: 'Alguem' } } },
      ],
      socket: {},
    }
    const res = mockRes()
    await handler(req, res)
    expect(res._status).toBe(200)
    expect(Array.isArray(res._json)).toBe(true)
    expect(res._json).toHaveLength(2)
    expect(res._json[1].result.structuredContent.status).toBe('nao_encontrado')
  })

  it('10. telefone completo não aparece em nenhum lugar do conteúdo final enviado pelo MCP', async () => {
    createClient.mockReturnValue(fakePrimeClient({
      clientes: [{ id: 'c1', nome: 'Rafael Teste', telefone: '34999997499' }],
      parcelas: [{ id: 'p1', cliente_id: 'c1', numero: 1, valor_base: 150, status: 'pendente', data_vencimento: '2020-01-01' }],
    }))
    const r = await call({
      headers: auth,
      body: { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'consultar_cobrancas', arguments: { telefone: '34999997499' } } },
    })
    expect(JSON.stringify(r._json)).not.toContain('34999997499')
  })
})

describe('MCP — rate limit isolado de consultar_cobrancas', () => {
  it('11. verificar_conexao não consome o orçamento de consultar_cobrancas (chamadas ilimitadas de verificar_conexao não afetam o limite da outra ferramenta)', async () => {
    // 100 chamadas de verificar_conexao — bem acima do teto de consultar_cobrancas (60) —
    // não devem, por si só, esgotar nada relacionado a consultar_cobrancas.
    for (let i = 0; i < 100; i++) {
      const r = await call({ headers: auth, body: { jsonrpc: '2.0', id: i, method: 'tools/call', params: { name: 'verificar_conexao', arguments: {} } } })
      expect(r._json.result.isError).toBe(false)
    }
    createClient.mockReturnValue(fakePrimeClient({ clientes: [] }))
    const r = await call({
      headers: auth,
      body: { jsonrpc: '2.0', id: 999, method: 'tools/call', params: { name: 'consultar_cobrancas', arguments: { nome_cliente: 'Alguem' } } },
    })
    // Ainda deve funcionar normalmente — sem isError por rate limit.
    expect(r._json.result.structuredContent).toBeDefined()
  })

  it('12. ao atingir o limite de consultar_cobrancas, a resposta permanece JSON-RPC válida com isError:true, sem HTTP bruto nem dado interno', async () => {
    createClient.mockReturnValue(fakePrimeClient({ clientes: [] }))
    let ultimaResposta
    // Usa um IP fixo (via x-forwarded-for) pra garantir que todas as chamadas caiam
    // no mesmo balde do rate limiter — 61 chamadas pra estourar o teto de 60/min.
    for (let i = 0; i < 61; i++) {
      ultimaResposta = await call({
        headers: { ...auth, 'x-forwarded-for': '203.0.113.10' },
        body: { jsonrpc: '2.0', id: i, method: 'tools/call', params: { name: 'consultar_cobrancas', arguments: { nome_cliente: 'Alguem' } } },
      })
    }
    expect(ultimaResposta._status).toBe(200) // continua HTTP 200 — nunca 429 bruto
    expect(ultimaResposta._json.jsonrpc).toBe('2.0')
    expect(ultimaResposta._json.result.isError).toBe(true)
    expect(ultimaResposta._json.result.content[0].text).toMatch(/aguarde|tente novamente/i)
    expect(JSON.stringify(ultimaResposta._json)).not.toContain('BASE44_API_KEY')
  })
})

describe('MCP — configuração do rate limit', () => {
  it('13. constante de rate limit de consultar_cobrancas está configurada em 60/min', async () => {
    const fs = await import('node:fs')
    const codigo = fs.readFileSync(new URL('../system-tools.js', import.meta.url), 'utf-8')
    expect(codigo).toMatch(/CONSULTAR_COBRANCAS_RATE_LIMIT_MAX_POR_IP\s*=\s*60/)
  })
})
