import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * api/__tests__/systemToolsQualidadeCatalogo.test.js
 *
 * Testes do dispatcher (default export real de system-tools.js) para
 * ?tool=catalog-quality-audit-run / catalog-quality-audit-summary /
 * catalog-quality-findings / catalog-quality-finding-status (Fase 2C).
 * Cobre só a cola HTTP (secret exigido nas rotas de escrita, método,
 * validação de status, contenção de exceção) — a lógica real (persistência,
 * ciclo de vida dos achados) já tem sua própria suíte completa em
 * scripts/__tests__/qualidade-catalogo-auditoria.test.js, porque vive em
 * api/_qualidadeCatalogoAuditoria.js (mockado aqui de propósito, mesmo
 * padrão de systemToolsAlertaInteligente.test.js).
 */

vi.mock('@base44/sdk', () => ({
  createClient: vi.fn(() => ({ entities: {} })),
}))

vi.mock('../_qualidadeCatalogoAuditoria.js', () => ({
  rodarAuditoriaQualidade: vi.fn(),
  buscarUltimaRun: vi.fn(),
  buscarHistoricoRuns: vi.fn(),
  buscarFindings: vi.fn(),
  atualizarStatusFindingManual: vi.fn(),
}))

const TEST_BAGY_UI_SECRET = 'test-bagy-ui-action-secret'
const TEST_SUPABASE_URL = 'https://mock-project.supabase.co'
const TEST_SUPABASE_KEY = 'mock-supabase-anon-key'
const TEST_SUPABASE_SECRET_KEY = 'mock-supabase-service-role-key'

let handler
let mod

beforeEach(async () => {
  vi.resetModules()
  process.env.BAGY_UI_ACTION_SECRET = TEST_BAGY_UI_SECRET
  process.env.VITE_SUPABASE_URL = TEST_SUPABASE_URL
  process.env.VITE_SUPABASE_KEY = TEST_SUPABASE_KEY
  process.env.SUPABASE_SECRET_KEY = TEST_SUPABASE_SECRET_KEY

  mod = await import('../_qualidadeCatalogoAuditoria.js')
  mod.rodarAuditoriaQualidade.mockReset()
  mod.buscarUltimaRun.mockReset()
  mod.buscarHistoricoRuns.mockReset()
  mod.buscarFindings.mockReset()
  mod.atualizarStatusFindingManual.mockReset()

  const systemTools = await import('../system-tools.js')
  handler = systemTools.default
})

function criarReq(overrides = {}) {
  return {
    method: 'GET',
    headers: {},
    query: {},
    body: {},
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
  }
}

describe('?tool=catalog-quality-audit-run', () => {
  it('POST sem actionSecret → 401, nunca chama rodarAuditoriaQualidade', async () => {
    const req = criarReq({ method: 'POST', query: { tool: 'catalog-quality-audit-run' }, body: {} })
    const res = criarRes()
    await handler(req, res)
    expect(res.statusCode).toBe(401)
    expect(mod.rodarAuditoriaQualidade).not.toHaveBeenCalled()
  })

  it('GET → 405, nunca chama rodarAuditoriaQualidade', async () => {
    const req = criarReq({ method: 'GET', query: { tool: 'catalog-quality-audit-run' } })
    const res = criarRes()
    await handler(req, res)
    expect(res.statusCode).toBe(405)
    expect(mod.rodarAuditoriaQualidade).not.toHaveBeenCalled()
  })

  it('POST com actionSecret correto → chama rodarAuditoriaQualidade e repassa o resultado (ok:true)', async () => {
    mod.rodarAuditoriaQualidade.mockResolvedValue({ ok: true, run: { id: 'run-1' }, resumo: { totalFindings: 3 } })
    const req = criarReq({ method: 'POST', query: { tool: 'catalog-quality-audit-run' }, body: { actionSecret: TEST_BAGY_UI_SECRET } })
    const res = criarRes()
    await handler(req, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ ok: true, run: { id: 'run-1' }, resumo: { totalFindings: 3 } })
    expect(mod.rodarAuditoriaQualidade).toHaveBeenCalledTimes(1)
    expect(mod.rodarAuditoriaQualidade).toHaveBeenCalledWith({ supabaseUrl: TEST_SUPABASE_URL, secretKey: TEST_SUPABASE_SECRET_KEY })
  })

  it('rodarAuditoriaQualidade devolve ok:false (run falha) → ainda assim 200, repassa o payload', async () => {
    mod.rodarAuditoriaQualidade.mockResolvedValue({ ok: false, run: { status: 'falha' }, motivo: 'Falha ao carregar dados do Catálogo V2: boom' })
    const req = criarReq({ method: 'POST', query: { tool: 'catalog-quality-audit-run' }, body: { actionSecret: TEST_BAGY_UI_SECRET } })
    const res = criarRes()
    await handler(req, res)
    expect(res.statusCode).toBe(200)
    expect(res.body.ok).toBe(false)
  })

  it('rodarAuditoriaQualidade lança exceção → contida, 500, não derruba o dispatcher', async () => {
    mod.rodarAuditoriaQualidade.mockRejectedValue(new Error('erro inesperado'))
    const req = criarReq({ method: 'POST', query: { tool: 'catalog-quality-audit-run' }, body: { actionSecret: TEST_BAGY_UI_SECRET } })
    const res = criarRes()
    await handler(req, res)
    expect(res.statusCode).toBe(500)
    expect(res.body.error).toBe('erro inesperado')
  })
})

describe('?tool=catalog-quality-audit-summary', () => {
  it('GET sem ?historico → devolve última run, sem exigir secret', async () => {
    mod.buscarUltimaRun.mockResolvedValue({ id: 'run-1', status: 'completa' })
    const req = criarReq({ method: 'GET', query: { tool: 'catalog-quality-audit-summary' } })
    const res = criarRes()
    await handler(req, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ ultimaRun: { id: 'run-1', status: 'completa' } })
    expect(mod.buscarHistoricoRuns).not.toHaveBeenCalled()
  })

  it('GET ?historico=1 → devolve histórico paginado, repassa limit/offset', async () => {
    mod.buscarHistoricoRuns.mockResolvedValue([{ id: 'run-2' }, { id: 'run-1' }])
    const req = criarReq({ method: 'GET', query: { tool: 'catalog-quality-audit-summary', historico: '1', limit: '5', offset: '10' } })
    const res = criarRes()
    await handler(req, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ runs: [{ id: 'run-2' }, { id: 'run-1' }] })
    expect(mod.buscarHistoricoRuns).toHaveBeenCalledWith({ supabaseUrl: TEST_SUPABASE_URL, secretKey: TEST_SUPABASE_SECRET_KEY }, { limit: '5', offset: '10' })
  })

  it('POST → 405', async () => {
    const req = criarReq({ method: 'POST', query: { tool: 'catalog-quality-audit-summary' } })
    const res = criarRes()
    await handler(req, res)
    expect(res.statusCode).toBe(405)
  })
})

describe('?tool=catalog-quality-findings', () => {
  it('GET com filtros → repassa todos ao helper', async () => {
    mod.buscarFindings.mockResolvedValue([{ id: 'f-1' }])
    const req = criarReq({
      method: 'GET',
      query: {
        tool: 'catalog-quality-findings',
        status: 'aberto',
        severidade: 'CRITICO',
        classe: 'FATO',
        tipo: 'marca_ausente',
        bagyProductId: '12345',
        nome: 'Bermuda',
        limit: '10',
        offset: '0',
      },
    })
    const res = criarRes()
    await handler(req, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ findings: [{ id: 'f-1' }] })
    expect(mod.buscarFindings).toHaveBeenCalledWith(
      { supabaseUrl: TEST_SUPABASE_URL, secretKey: TEST_SUPABASE_SECRET_KEY },
      {
        status: 'aberto',
        severidade: 'CRITICO',
        classe: 'FATO',
        tipo: 'marca_ausente',
        bagyProductId: '12345',
        nome: 'Bermuda',
        limit: '10',
        offset: '0',
      }
    )
  })

  it('helper lança erro de validação (ex. status inválido) → 400, mensagem repassada', async () => {
    mod.buscarFindings.mockRejectedValue(new Error('status_invalido'))
    const req = criarReq({ method: 'GET', query: { tool: 'catalog-quality-findings', status: 'inexistente' } })
    const res = criarRes()
    await handler(req, res)
    expect(res.statusCode).toBe(400)
  })
})

describe('?tool=catalog-quality-finding-status', () => {
  it('POST sem actionSecret → 401, nunca chama atualizarStatusFindingManual', async () => {
    const req = criarReq({ method: 'POST', query: { tool: 'catalog-quality-finding-status' }, body: { id: 'f-1', status: 'ignorado' } })
    const res = criarRes()
    await handler(req, res)
    expect(res.statusCode).toBe(401)
    expect(mod.atualizarStatusFindingManual).not.toHaveBeenCalled()
  })

  it('POST com secret + status=ignorado → 200, chama atualizarStatusFindingManual', async () => {
    mod.atualizarStatusFindingManual.mockResolvedValue({ id: 'f-1', status: 'ignorado' })
    const req = criarReq({
      method: 'POST',
      query: { tool: 'catalog-quality-finding-status' },
      body: { actionSecret: TEST_BAGY_UI_SECRET, id: 'f-1', status: 'ignorado' },
    })
    const res = criarRes()
    await handler(req, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ success: true, finding: { id: 'f-1', status: 'ignorado' } })
    expect(mod.atualizarStatusFindingManual).toHaveBeenCalledWith(
      { supabaseUrl: TEST_SUPABASE_URL, secretKey: TEST_SUPABASE_SECRET_KEY },
      'f-1',
      'ignorado'
    )
  })

  it('POST com secret + status=aberto (reativar) → 200', async () => {
    mod.atualizarStatusFindingManual.mockResolvedValue({ id: 'f-1', status: 'aberto' })
    const req = criarReq({
      method: 'POST',
      query: { tool: 'catalog-quality-finding-status' },
      body: { actionSecret: TEST_BAGY_UI_SECRET, id: 'f-1', status: 'aberto' },
    })
    const res = criarRes()
    await handler(req, res)
    expect(res.statusCode).toBe(200)
  })

  it('POST com secret + status=resolvido → 400, nunca aceita marcação manual de resolvido', async () => {
    mod.atualizarStatusFindingManual.mockRejectedValue(new Error('status_invalido'))
    const req = criarReq({
      method: 'POST',
      query: { tool: 'catalog-quality-finding-status' },
      body: { actionSecret: TEST_BAGY_UI_SECRET, id: 'f-1', status: 'resolvido' },
    })
    const res = criarRes()
    await handler(req, res)
    expect(res.statusCode).toBe(400)
    expect(res.body.error).toMatch(/resolvido nunca é manual/)
  })

  it('POST sem id → 400, nunca chama o helper', async () => {
    const req = criarReq({
      method: 'POST',
      query: { tool: 'catalog-quality-finding-status' },
      body: { actionSecret: TEST_BAGY_UI_SECRET, status: 'ignorado' },
    })
    const res = criarRes()
    await handler(req, res)
    expect(res.statusCode).toBe(400)
    expect(mod.atualizarStatusFindingManual).not.toHaveBeenCalled()
  })

  it('finding não encontrado (helper devolve null) → 404', async () => {
    mod.atualizarStatusFindingManual.mockResolvedValue(null)
    const req = criarReq({
      method: 'POST',
      query: { tool: 'catalog-quality-finding-status' },
      body: { actionSecret: TEST_BAGY_UI_SECRET, id: 'f-inexistente', status: 'ignorado' },
    })
    const res = criarRes()
    await handler(req, res)
    expect(res.statusCode).toBe(404)
  })

  it('GET → 405', async () => {
    const req = criarReq({ method: 'GET', query: { tool: 'catalog-quality-finding-status' } })
    const res = criarRes()
    await handler(req, res)
    expect(res.statusCode).toBe(405)
  })
})
