// PRIME Bridge — bridgeMode.test.js (reconstrução limpa, baseada no HEAD)
//
// Testes dedicados à divergência BRIDGE_MODE (FLUXO SIMPLES x FLUXO
// COMPLICADO) em bridgeCore.js. Não duplica a suíte funcional completa do
// modo complicated (já coberta por server.integration.test.js, que passa a
// rodar com BRIDGE_MODE=complicated) — aqui a prova é estrutural: no modo
// simple, nada de Gatekeeper/Tool Router é alcançado, e configuração
// inválida falha com segurança, nunca assumindo "complicated" por padrão.
//
// gatekeeper.js/toolRouter.js são mockados via vi.mock (hoisted) —
// bridgeCore.js os importa direto no topo do módulo (não são injetáveis via
// deps como requestToolApi/config), então mockar o módulo é a única forma
// de provar "nunca chamado" sem depender de efeito colateral indireto.
//
// Nesta reconstrução limpa (baseada exclusivamente no HEAD), bridgeCore.js
// não importa continuationDetector.js nem productContextStore.js — esses
// arquivos não existem neste corte. A ausência total deles já é a prova de
// que a continuidade de produto e o bridge_product_context não fazem parte
// do FLUXO SIMPLES nem do FLUXO COMPLICADO tal como está no HEAD.

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'

vi.mock('../gatekeeper.js', () => ({
  decide: vi.fn(() => ({ action: 'CONTINUE', reason: 'mocked_never_called_in_simple', observationOnly: true })),
}))
vi.mock('../toolRouter.js', () => ({
  routeTools: vi.fn(async () => ({ matchedTools: [] })),
}))

process.env.AGENT_ID = 'test-agent'
process.env.GPT_TOKEN = 'test-gpt-token'
process.env.ZAPI_INSTANCE_ID = 'test-instance'
process.env.ZAPI_TOKEN = 'test-zapi-token'
process.env.LIVE_MODE = 'true'
process.env.GPTMAKER_BASE_URL = 'https://mock-gptmaker.test'
process.env.ZAPI_BASE_URL = 'https://mock-zapi.test'
process.env.SUPABASE_URL = 'https://mock-supabase.test'
process.env.SUPABASE_SECRET_KEY = 'mock-supabase-secret'

let handleIncoming
let getBridgeConfig
let gatekeeperMod
let toolRouterMod

beforeAll(async () => {
  ;({ handleIncoming, getBridgeConfig } = await import('../bridgeCore.js'))
  gatekeeperMod = await import('../gatekeeper.js')
  toolRouterMod = await import('../toolRouter.js')
})

let msgCounter = 0
function nextMessageId() {
  msgCounter++
  return `bridge-mode-test-${msgCounter}`
}

function makePayload(text, overrides = {}) {
  return {
    event: 'message.received',
    data: {
      messageId: nextMessageId(),
      phone: '5534999999999',
      type: 'text',
      body: text,
      ...overrides,
    },
  }
}

function defaultSupabaseRpc(body) {
  const action = body.p_action
  if (action === 'check_or_start') return { ok: true, status: 200, json: async () => ({ result: 'process' }) }
  if (action === 'mark_completed') return { ok: true, status: 200, json: async () => ({ result: 'completed' }) }
  if (action === 'mark_failed') return { ok: true, status: 200, json: async () => ({ result: 'failed' }) }
  return { ok: true, status: 200, json: async () => ({ result: 'error' }) }
}

// Mock único de global.fetch — dispatch por host, mesmo espírito de
// server.integration.test.js. Qualquer URL fora dos hosts mockados lança —
// barreira explícita contra chamada de rede real escapando do mock.
function makeFetchMock({ gptmakerReply = 'Resposta da Gaby Teste' } = {}) {
  return vi.fn(async (url, options = {}) => {
    const urlStr = String(url)

    if (urlStr.startsWith('https://mock-supabase.test/rest/v1/rpc/process_bridge_message')) {
      const body = JSON.parse(options.body)
      return defaultSupabaseRpc(body)
    }
    if (urlStr.startsWith('https://mock-supabase.test/rest/v1/bridge_operation_logs')) {
      return { ok: true, status: 200, json: async () => ({}) }
    }
    if (urlStr.startsWith('https://mock-gptmaker.test/')) {
      return { ok: true, status: 200, json: async () => ({ success: true, message: gptmakerReply }) }
    }
    if (urlStr.startsWith('https://mock-zapi.test/')) {
      return { ok: true, status: 200, json: async () => ({ id: 'msg-sent-1' }) }
    }

    throw new Error(`fetch mock: URL inesperada/real detectada — ${urlStr}`)
  })
}

let originalFetch

afterEach(() => {
  global.fetch = originalFetch
  vi.clearAllMocks()
})

function simpleConfig(overrides = {}) {
  return { ...getBridgeConfig(process.env), BRIDGE_MODE: 'simple', ...overrides }
}

describe('BRIDGE_MODE=simple — isolamento estrutural', () => {
  it('1-2. Gatekeeper e Tool Router nunca são chamados', async () => {
    originalFetch = global.fetch
    global.fetch = makeFetchMock()

    await handleIncoming(makePayload('marrom'), { config: simpleConfig() })

    expect(gatekeeperMod.decide).not.toHaveBeenCalled()
    expect(toolRouterMod.routeTools).not.toHaveBeenCalled()
  })

  it('3. o prompt enviado a askGabi é EXATAMENTE o texto recebido, sem transformação', async () => {
    originalFetch = global.fetch
    const fetchMock = makeFetchMock()
    global.fetch = fetchMock

    const textoOriginal = 'Você tem cinto da Montblanc?'
    await handleIncoming(makePayload(textoOriginal), { config: simpleConfig() })

    const chamadaGpt = fetchMock.mock.calls.find(([url]) => String(url).startsWith('https://mock-gptmaker.test/'))
    expect(chamadaGpt).toBeDefined()
    const corpo = JSON.parse(chamadaGpt[1].body)
    expect(corpo.prompt).toBe(textoOriginal)
  })

  it('4. mesmo telefone gera o mesmo contextId em mensagens diferentes', async () => {
    originalFetch = global.fetch
    const fetchMock = makeFetchMock()
    global.fetch = fetchMock
    const config = simpleConfig()

    await handleIncoming(makePayload('Oi', { phone: '5534988887777' }), { config })
    await handleIncoming(makePayload('Tudo bem?', { phone: '5534988887777' }), { config })

    const chamadasGpt = fetchMock.mock.calls.filter(([url]) => String(url).startsWith('https://mock-gptmaker.test/'))
    expect(chamadasGpt).toHaveLength(2)
    const contextIds = chamadasGpt.map(([, options]) => JSON.parse(options.body).contextId)
    expect(contextIds[0]).toBe(contextIds[1])
    expect(contextIds[0]).toBe('5534988887777')
  })

  it('5. a resposta crua do GPT Maker é enviada à ZAP-API sem transformação', async () => {
    originalFetch = global.fetch
    const respostaCrua = 'Resposta crua, sem nenhuma formatação — deve ir exatamente assim.'
    const fetchMock = makeFetchMock({ gptmakerReply: respostaCrua })
    global.fetch = fetchMock

    await handleIncoming(makePayload('Oi'), { config: simpleConfig() })

    const chamadaZap = fetchMock.mock.calls.find(([url]) => String(url).startsWith('https://mock-zapi.test/'))
    expect(chamadaZap).toBeDefined()
    const corpo = JSON.parse(chamadaZap[1].body)
    expect(corpo.body).toBe(respostaCrua)
  })

  it('6. nenhuma chamada real de rede — toda URL passa pelo mock (senão o mock lança)', async () => {
    originalFetch = global.fetch
    const fetchMock = makeFetchMock()
    global.fetch = fetchMock

    await expect(handleIncoming(makePayload('Oi'), { config: simpleConfig() })).resolves.not.toThrow()
    expect(fetchMock).toHaveBeenCalled()
  })
})

describe('BRIDGE_MODE inválido — falha explícita e segura', () => {
  it('BRIDGE_MODE ausente: nunca assume "complicated", nunca chama GPTMaker/ZAP-API/Gatekeeper', async () => {
    originalFetch = global.fetch
    const fetchMock = makeFetchMock()
    global.fetch = fetchMock

    await handleIncoming(makePayload('Oi'), { config: simpleConfig({ BRIDGE_MODE: undefined }) })

    const chamadaGpt = fetchMock.mock.calls.find(([url]) => String(url).startsWith('https://mock-gptmaker.test/'))
    expect(chamadaGpt).toBeUndefined()
    expect(gatekeeperMod.decide).not.toHaveBeenCalled()
  })

  it('BRIDGE_MODE com valor arbitrário (typo): mesmo comportamento seguro, nunca cai em complicated', async () => {
    originalFetch = global.fetch
    const fetchMock = makeFetchMock()
    global.fetch = fetchMock

    await handleIncoming(makePayload('Oi'), { config: simpleConfig({ BRIDGE_MODE: 'Complicated' }) })

    const chamadaGpt = fetchMock.mock.calls.find(([url]) => String(url).startsWith('https://mock-gptmaker.test/'))
    expect(chamadaGpt).toBeUndefined()
    expect(gatekeeperMod.decide).not.toHaveBeenCalled()
  })
})
