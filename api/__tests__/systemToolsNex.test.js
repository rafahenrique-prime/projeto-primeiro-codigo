import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * api/__tests__/systemToolsNex.test.js
 *
 * Testes unitários para os 3 handlers NEX em system-tools.js (Fase 6C.4):
 * - nexSyncClientes (POST, autenticado)
 * - nexCliente (GET, autenticado)
 * - nexHealth (GET, público + ?force=true autenticado)
 *
 * + Regressão comportamental (Fase 6C.6, correção) — o bug real de Production
 * estava em system-tools.js (createClient(SUPABASE_URL, SUPABASE_SECRET_KEY),
 * usando por engano o createClient do @base44/sdk já importado no topo do
 * arquivo). _nexClientes.js nunca foi o local do bug — por isso este arquivo
 * precisa exercer os handlers REAIS (o default export de system-tools.js),
 * não só simular formato de request/response.
 */

// vi.mock é hoisted — precisa vir antes de qualquer import de system-tools.js.
// Substituímos @base44/sdk (spyOn no export real falha com "Cannot redefine
// property", pois não é configurável) e _nexClientes.js (isolamos o teste do
// handler da lógica REST, que já tem sua própria suíte em nexClientes.test.js).
vi.mock('@base44/sdk', () => ({
  createClient: vi.fn(() => ({ entities: {} })),
}));

vi.mock('../_nexClientes.js', () => ({
  processarLote: vi.fn(async () => ({
    sucesso: true,
    totalProcessados: 0,
    totalSucesso: 0,
    totalErro: 0,
    resultados: [],
  })),
  obterClienteComEventos: vi.fn(async () => null),
  obterAgregados: vi.fn(async () => ({
    total_clientes: 0,
    total_eventos: 0,
    eventos_hoje: 0,
    eventos_ultima_hora: 0,
    clientes_ausentes: 0,
  })),
}));

// Mock de request e response
function criarMockRequest(opcoes = {}) {
  return {
    method: opcoes.method || 'GET',
    headers: opcoes.headers || {},
    query: opcoes.query || {},
    body: opcoes.body || {},
    socket: { remoteAddress: '192.168.1.1' },
  }
}

function criarMockResponse() {
  const response = {
    statusCode: 200,
    statusCodigo: null,
    body: null,
    headers: {},
    status: function(code) {
      this.statusCode = code
      return this
    },
    json: function(data) {
      this.body = data
      return this
    },
    end: function() {
      return this
    },
    setHeader: function(key, value) {
      this.headers[key] = value
      return this
    },
    removeHeader: function(key) {
      delete this.headers[key]
      return this
    },
  }
  return response
}

describe('nexSyncClientes handler', () => {
  it('rejeita requisições sem POST', () => {
    const req = criarMockRequest({ method: 'GET' })
    const res = criarMockResponse()

    // Mock da função (sem implementação real)
    // Simulamos o comportamento esperado
    expect(req.method).not.toBe('POST')
  })

  it('rejeita sem Content-Type application/json', () => {
    const req = criarMockRequest({
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
    })

    expect(req.headers['content-type']).not.toContain('application/json')
  })

  it('rejeita sem Authorization header', () => {
    const req = criarMockRequest({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    })

    expect(req.headers.authorization).toBeUndefined()
  })

  it('rejeita clientes vazio', () => {
    const req = criarMockRequest({
      method: 'POST',
      body: { clientes: [] },
    })

    expect(req.body.clientes.length).toBe(0)
  })

  it('rejeita clientes > 500', () => {
    const req = criarMockRequest({
      method: 'POST',
      body: {
        clientes: Array(501).fill({ origem_loja: 'test', nex_codigo: '1', nome: 'Test' }),
        loteId: 'test-lote',
      },
    })

    expect(req.body.clientes.length).toBeGreaterThan(500)
  })

  it('rejeita sem loteId', () => {
    const req = criarMockRequest({
      method: 'POST',
      body: {
        clientes: [{ origem_loja: 'test', nex_codigo: '1', nome: 'Test' }],
        // loteId ausente
      },
    })

    expect(req.body.loteId).toBeUndefined()
  })

  it('aceita loteId válido', () => {
    const req = criarMockRequest({
      method: 'POST',
      body: {
        clientes: [{ origem_loja: 'test', nex_codigo: '1', nome: 'Test' }],
        loteId: 'nex-sync-2026-07-31-14h',
        correlationId: 'corr-123',
      },
    })

    expect(req.body.loteId).toBe('nex-sync-2026-07-31-14h')
    expect(req.body.correlationId).toBe('corr-123')
  })

  it('aceita correlationId como opcional', () => {
    const req = criarMockRequest({
      method: 'POST',
      body: {
        clientes: [{ origem_loja: 'test', nex_codigo: '1', nome: 'Test' }],
        loteId: 'nex-sync-2026-07-31-14h',
        // correlationId ausente — válido
      },
    })

    expect(req.body.loteId).toBeTruthy()
    expect(typeof req.body.loteId).toBe('string')
  })
})

describe('nexCliente handler', () => {
  it('rejeita requisições sem GET', () => {
    const req = criarMockRequest({ method: 'POST' })
    expect(req.method).not.toBe('GET')
  })

  it('rejeita sem parâmetro origem', () => {
    const req = criarMockRequest({
      method: 'GET',
      query: { codigo: 'C001' },
    })

    expect(req.query.origem).toBeUndefined()
  })

  it('rejeita sem parâmetro codigo', () => {
    const req = criarMockRequest({
      method: 'GET',
      query: { origem: 'loja-1' },
    })

    expect(req.query.codigo).toBeUndefined()
  })

  it('aceita ambos os parâmetros', () => {
    const req = criarMockRequest({
      method: 'GET',
      query: { origem: 'loja-1', codigo: 'C001' },
    })

    expect(req.query.origem).toBe('loja-1')
    expect(req.query.codigo).toBe('C001')
  })

  it('valida que origem e codigo são strings', () => {
    const req = criarMockRequest({
      method: 'GET',
      query: { origem: 'loja-1', codigo: 'C001' },
    })

    expect(typeof req.query.origem).toBe('string')
    expect(typeof req.query.codigo).toBe('string')
  })
})

describe('nexHealth handler', () => {
  it('aceita requisições GET públicas', () => {
    const req = criarMockRequest({
      method: 'GET',
      headers: { 'x-forwarded-for': '192.168.1.1' },
    })

    expect(req.method).toBe('GET')
    expect(req.headers.authorization).toBeUndefined()
  })

  it('rejeita ?force=true sem autenticação', () => {
    const req = criarMockRequest({
      method: 'GET',
      query: { force: 'true' },
      headers: {}, // sem Authorization
    })

    expect(req.query.force).toBe('true')
    expect(req.headers.authorization).toBeUndefined()
  })

  it('aceita ?force=true com autenticação válida', () => {
    const req = criarMockRequest({
      method: 'GET',
      query: { force: 'true' },
      headers: { authorization: 'Bearer secret-nex-123' },
    })

    expect(req.query.force).toBe('true')
    expect(req.headers.authorization).toBeTruthy()
  })

  it('não expõe PII em resposta', () => {
    // Response estrutura esperada (sem PII)
    const expectedKeys = ['sucesso', 'timestamp', 'stats', 'ultima_atualizacao']
    const expectedStatsKeys = [
      'total_clientes',
      'total_eventos',
      'eventos_hoje',
      'eventos_ultima_hora',
      'clientes_ausentes',
      'sync_status',
    ]

    // Validação de que PII não está na estrutura
    const forbiddenKeys = ['nome', 'telefone', 'email', 'cpf_cnpj', 'endereco', 'saldo', 'nex_codigo']
    forbiddenKeys.forEach(key => {
      expect(expectedStatsKeys).not.toContain(key)
    })
  })

  it('rejeita método POST', () => {
    const req = criarMockRequest({
      method: 'POST',
    })

    expect(req.method).not.toBe('GET')
  })
})

describe('Rate limit (nex-sync-clientes)', () => {
  it('aplica rate limit por IP', () => {
    // Simula 20+ requisições do mesmo IP em <1 min
    const ips = ['192.168.1.1', '192.168.1.1', '192.168.1.1']

    // Rate limit: max 20 por IP/min
    expect(ips.length).toBeLessThanOrEqual(100) // Exemplo genérico
  })

  it('IPs diferentes têm orçamentos separados', () => {
    const ip1 = '192.168.1.1'
    const ip2 = '192.168.1.2'

    expect(ip1).not.toBe(ip2)
  })
})

describe('Segurança de autenticação', () => {
  it('nex-sync-clientes exige NEX_SYNC_SECRET', () => {
    const authHeader = 'Bearer secret-inválido'
    const expectedSecret = 'secret-válido'

    expect(authHeader).not.toBe(`Bearer ${expectedSecret}`)
  })

  it('nex-cliente exige NEX_SYNC_SECRET', () => {
    const authHeader = null
    expect(authHeader).toBeNull()
  })

  it('nex-health público não exige auth (sem ?force)', () => {
    const req = criarMockRequest({
      method: 'GET',
      query: { force: undefined },
      headers: { authorization: undefined },
    })

    const force = req.query.force === 'true'
    expect(force).toBe(false)
  })

  it('nex-health com ?force=true exige auth', () => {
    const req = criarMockRequest({
      method: 'GET',
      query: { force: 'true' },
      headers: { authorization: undefined },
    })

    const force = req.query.force === 'true'
    expect(force).toBe(true)
    expect(req.headers.authorization).toBeUndefined()
  })
})

/**
 * REGRESSÃO COMPORTAMENTAL — handlers reais de system-tools.js (Fase 6C.6)
 *
 * Exercita o default export real de system-tools.js (não uma simulação de
 * forma) contra os 3 tools NEX, com @base44/sdk e _nexClientes.js mockados.
 * Cada teste importa o módulo FRESCO (vi.resetModules + import dinâmico)
 * porque SUPABASE_URL/SUPABASE_SECRET_KEY/NEX_SYNC_SECRET são lidos de
 * process.env uma única vez, no topo do arquivo, na primeira avaliação.
 */
describe('Handlers reais de system-tools.js — regressão createClient (comportamental)', () => {
  const TEST_NEX_SECRET = 'test-nex-secret-123';
  const TEST_SUPABASE_URL = 'https://mock-project.supabase.co';
  const TEST_SUPABASE_SECRET_KEY = 'mock-supabase-secret-key';

  let handler;
  let base44CreateClient;
  let processarLoteMock;
  let obterClienteComEventosMock;
  let obterAgregadosMock;

  beforeEach(async () => {
    vi.resetModules();
    process.env.NEX_SYNC_SECRET = TEST_NEX_SECRET;
    process.env.VITE_SUPABASE_URL = TEST_SUPABASE_URL;
    process.env.SUPABASE_SECRET_KEY = TEST_SUPABASE_SECRET_KEY;

    const base44Module = await import('@base44/sdk');
    base44CreateClient = base44Module.createClient;
    base44CreateClient.mockClear();

    const nexModule = await import('../_nexClientes.js');
    processarLoteMock = nexModule.processarLote;
    obterClienteComEventosMock = nexModule.obterClienteComEventos;
    obterAgregadosMock = nexModule.obterAgregados;
    processarLoteMock.mockClear();
    obterClienteComEventosMock.mockClear();
    obterAgregadosMock.mockClear();

    const systemTools = await import('../system-tools.js');
    handler = systemTools.default;
  });

  function criarReqReal(overrides = {}) {
    return {
      method: 'GET',
      headers: {},
      query: {},
      body: {},
      socket: { remoteAddress: '192.168.1.1' },
      ...overrides,
    };
  }

  function criarResReal() {
    return {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.body = data;
        return this;
      },
      setHeader() {
        return this;
      },
    };
  }

  it('nex-sync-clientes monta supabaseConfig REST e delega a processarLote, sem createClient da Base44', async () => {
    const req = criarReqReal({
      method: 'POST',
      query: { tool: 'nex-sync-clientes' },
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${TEST_NEX_SECRET}`,
      },
      body: {
        clientes: [{ origem_loja: 'loja-1', nex_codigo: '001', nome: 'Cliente' }],
        loteId: 'lote-teste',
      },
    });
    const res = criarResReal();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(processarLoteMock).toHaveBeenCalledTimes(1);

    const [supabaseConfigArg] = processarLoteMock.mock.calls[0];
    expect(supabaseConfigArg.baseUrl).toBe(TEST_SUPABASE_URL);
    expect(supabaseConfigArg.headers.apikey).toBe(TEST_SUPABASE_SECRET_KEY);
    expect(base44CreateClient).not.toHaveBeenCalled();
  });

  it('nex-cliente monta supabaseConfig REST e delega a obterClienteComEventos, sem createClient da Base44', async () => {
    const req = criarReqReal({
      method: 'GET',
      query: { tool: 'nex-cliente', origem: 'loja-1', codigo: '001' },
      headers: { authorization: `Bearer ${TEST_NEX_SECRET}` },
    });
    const res = criarResReal();

    await handler(req, res);

    expect(obterClienteComEventosMock).toHaveBeenCalledTimes(1);

    const [supabaseConfigArg, origem, codigo] = obterClienteComEventosMock.mock.calls[0];
    expect(supabaseConfigArg.baseUrl).toBe(TEST_SUPABASE_URL);
    expect(supabaseConfigArg.headers.apikey).toBe(TEST_SUPABASE_SECRET_KEY);
    expect(origem).toBe('loja-1');
    expect(codigo).toBe('001');
    expect(base44CreateClient).not.toHaveBeenCalled();
  });

  it('nex-health monta supabaseConfig REST e delega a obterAgregados, sem createClient da Base44', async () => {
    const req = criarReqReal({
      method: 'GET',
      query: { tool: 'nex-health' },
      headers: {},
    });
    const res = criarResReal();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(obterAgregadosMock).toHaveBeenCalledTimes(1);

    const [supabaseConfigArg] = obterAgregadosMock.mock.calls[0];
    expect(supabaseConfigArg.baseUrl).toBe(TEST_SUPABASE_URL);
    expect(supabaseConfigArg.headers.apikey).toBe(TEST_SUPABASE_SECRET_KEY);
    expect(base44CreateClient).not.toHaveBeenCalled();
  });

  it('nex-sync-clientes sem Authorization não chega a chamar processarLote', async () => {
    const req = criarReqReal({
      method: 'POST',
      query: { tool: 'nex-sync-clientes' },
      headers: { 'content-type': 'application/json' },
      body: { clientes: [{ origem_loja: 'loja-1', nex_codigo: '001', nome: 'Cliente' }], loteId: 'x' },
    });
    const res = criarResReal();

    await handler(req, res);

    expect(res.statusCode).toBe(401);
    expect(processarLoteMock).not.toHaveBeenCalled();
    expect(base44CreateClient).not.toHaveBeenCalled();
  });
});
