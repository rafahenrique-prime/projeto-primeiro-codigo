import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * api/__tests__/systemToolsAlertaInteligente.test.js
 *
 * Testes do dispatcher (default export real de system-tools.js) para
 * ?tool=alerta-inteligente. Cobre só roteamento/integração (secret → 401,
 * sucesso/fallback → 200, exceção do helper contida sem derrubar outras
 * tools, nenhum secret em log) — a lógica de negócio (telefone, ambiguidade,
 * paginação, Groq, dedup, fallback, sanitização de log dentro do helper) já
 * tem sua própria suíte completa em alertaInteligente.test.js. Mesmo padrão
 * de systemToolsConsultarProduto.test.js: o helper é mockado aqui de
 * propósito, pra isolar o teste da cola HTTP da lógica de negócio.
 */

vi.mock('@base44/sdk', () => ({
  createClient: vi.fn(() => ({ entities: {} })),
}))

vi.mock('../_alertaInteligente.js', () => ({
  processarAlertaInteligente: vi.fn(),
}))

const TEST_ALERTA_SECRET = 'test-alerta-inteligente-secret-123'
const TEST_GPTMAKER_TOKEN = 'test-gptmaker-token'
const TEST_GPTMAKER_WS = 'test-workspace-id'
const TEST_GROQ_KEY = 'test-groq-key'
const TEST_TELEGRAM_TOKEN = 'test-telegram-token'
const TEST_TELEGRAM_CHAT_ID = 'test-telegram-chat-id'
const TEST_SUPABASE_URL = 'https://mock-project.supabase.co'
const TEST_SUPABASE_KEY = 'mock-supabase-anon-key'

const SECRET_ENV_VALUES = [TEST_ALERTA_SECRET, TEST_GPTMAKER_TOKEN, TEST_GROQ_KEY, TEST_TELEGRAM_TOKEN, TEST_SUPABASE_KEY]

let handler
let processarAlertaInteligenteMock

beforeEach(async () => {
  vi.resetModules()
  process.env.ALERTA_INTELIGENTE_SECRET = TEST_ALERTA_SECRET
  process.env.VITE_GPTMAKER_TOKEN = TEST_GPTMAKER_TOKEN
  process.env.VITE_GPTMAKER_WORKSPACE = TEST_GPTMAKER_WS
  process.env.VITE_GROQ_API_KEY = TEST_GROQ_KEY
  process.env.TELEGRAM_BOT_TOKEN = TEST_TELEGRAM_TOKEN
  process.env.TELEGRAM_CHAT_ID = TEST_TELEGRAM_CHAT_ID
  process.env.VITE_SUPABASE_URL = TEST_SUPABASE_URL
  process.env.VITE_SUPABASE_KEY = TEST_SUPABASE_KEY

  const helperModule = await import('../_alertaInteligente.js')
  processarAlertaInteligenteMock = helperModule.processarAlertaInteligente
  processarAlertaInteligenteMock.mockReset()

  const systemTools = await import('../system-tools.js')
  handler = systemTools.default
})

function criarReq(overrides = {}) {
  return {
    method: 'GET',
    headers: {},
    query: { tool: 'alerta-inteligente', telefone: '34999998888', secret: TEST_ALERTA_SECRET },
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
    removeHeader() {
      return this
    },
  }
}

describe('dispatcher ?tool=alerta-inteligente', () => {
  it('tool correta chega ao helper com params e deps montados a partir do env', async () => {
    processarAlertaInteligenteMock.mockResolvedValue({ status: 'sent', modo: 'inteligente', chatId: 'chat-1' })
    const req = criarReq()
    const res = criarRes()

    await handler(req, res)

    expect(processarAlertaInteligenteMock).toHaveBeenCalledTimes(1)
    const [paramsArg, depsArg] = processarAlertaInteligenteMock.mock.calls[0]
    expect(paramsArg).toEqual({ tool: 'alerta-inteligente', telefone: '34999998888', secret: TEST_ALERTA_SECRET })
    expect(depsArg.expectedSecret).toBe(TEST_ALERTA_SECRET)
    expect(depsArg.gptmakerToken).toBe(TEST_GPTMAKER_TOKEN)
    expect(depsArg.workspace).toBe(TEST_GPTMAKER_WS)
    expect(depsArg.groqApiKey).toBe(TEST_GROQ_KEY)
    expect(depsArg.telegramBotToken).toBe(TEST_TELEGRAM_TOKEN)
    expect(depsArg.telegramChatId).toBe(TEST_TELEGRAM_CHAT_ID)
    expect(depsArg.supabaseUrl).toBe(TEST_SUPABASE_URL)
    expect(depsArg.supabaseKey).toBe(TEST_SUPABASE_KEY)
  })

  it('agentId do req.query chega intacto ao helper (correção de desambiguação Gaby Lab)', async () => {
    processarAlertaInteligenteMock.mockResolvedValue({ status: 'sent', modo: 'inteligente', chatId: 'chat-1' })
    const req = criarReq({
      query: { tool: 'alerta-inteligente', telefone: '34999998888', agentId: 'agent-gaby-lab-123', contextId: 'ctx-1', secret: TEST_ALERTA_SECRET },
    })
    const res = criarRes()

    await handler(req, res)

    const [paramsArg] = processarAlertaInteligenteMock.mock.calls[0]
    expect(paramsArg.agentId).toBe('agent-gaby-lab-123')
    expect(paramsArg.contextId).toBe('ctx-1')
  })

  it('helper devolve status "unauthorized" (secret inválido/ausente) → HTTP 401', async () => {
    processarAlertaInteligenteMock.mockResolvedValue({ status: 'unauthorized' })
    const req = criarReq({ query: { tool: 'alerta-inteligente', telefone: '34999998888', secret: 'errado' } })
    const res = criarRes()

    await handler(req, res)

    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ ok: false, erro: 'Não autorizado' })
  })

  it('helper devolve status "sent" (resumo inteligente) → HTTP 200', async () => {
    processarAlertaInteligenteMock.mockResolvedValue({ status: 'sent', modo: 'inteligente', chatId: 'chat-1' })
    const req = criarReq()
    const res = criarRes()

    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ ok: true, status: 'sent', modo: 'inteligente' })
  })

  it('helper devolve status "sent" com modo "fallback_simples" → HTTP 200', async () => {
    processarAlertaInteligenteMock.mockResolvedValue({ status: 'sent', modo: 'fallback_simples', motivo: 'chat_nao_encontrado' })
    const req = criarReq()
    const res = criarRes()

    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ ok: true, status: 'sent', modo: 'fallback_simples' })
  })

  it('helper devolve status "telegram_failed" → ainda HTTP 200 (handoff nunca trava por causa deste endpoint)', async () => {
    processarAlertaInteligenteMock.mockResolvedValue({ status: 'telegram_failed', modo: 'inteligente', chatId: 'chat-1' })
    const req = criarReq()
    const res = criarRes()

    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body.status).toBe('telegram_failed')
  })

  it('exceção lançada pelo helper é contida pelo case (não derruba o roteador) → HTTP 200 internal_error', async () => {
    processarAlertaInteligenteMock.mockRejectedValue(new Error('falha inesperada de rede'))
    const req = criarReq()
    const res = criarRes()

    await expect(handler(req, res)).resolves.not.toThrow()
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ ok: true, status: 'internal_error' })
  })

  it('nenhuma outra tool do system-tools.js é afetada depois de uma exceção em alerta-inteligente', async () => {
    processarAlertaInteligenteMock.mockRejectedValue(new Error('falha inesperada de rede'))
    const resErro = criarRes()
    await handler(criarReq(), resErro)
    expect(resErro.statusCode).toBe(200)

    // Roteador continua respondendo normalmente pra outras tools (ou tool
    // desconhecida) depois do erro — prova que a exceção não vazou pro switch.
    const resOutraTool = criarRes()
    await handler(criarReq({ query: { tool: 'tool-que-nao-existe' } }), resOutraTool)
    expect(resOutraTool.statusCode).toBe(400)
  })

  it('nenhum secret aparece em logs, mesmo no caminho de erro', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    processarAlertaInteligenteMock.mockRejectedValue(new Error('falha inesperada de rede'))
    await handler(criarReq(), criarRes())

    processarAlertaInteligenteMock.mockResolvedValue({ status: 'sent', modo: 'inteligente', chatId: 'chat-1' })
    await handler(criarReq(), criarRes())

    const todasChamadas = [...logSpy.mock.calls, ...errorSpy.mock.calls, ...warnSpy.mock.calls]
    const textoCompleto = todasChamadas.map((args) => args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')).join('\n')
    for (const segredo of SECRET_ENV_VALUES) {
      expect(textoCompleto).not.toContain(segredo)
    }

    logSpy.mockRestore()
    errorSpy.mockRestore()
    warnSpy.mockRestore()
  })
})
