// Testes permanentes de integração da PRIME Bridge (Fase 3, Etapa 3.6).
// Roda contra o server.mjs REAL (handleIncoming importado diretamente, sem
// duplicar lógica em harness) — todo I/O externo (GPTMaker, ZAP-API,
// Supabase) é interceptado via mock de global.fetch; a IGNITE PRIME Tool API
// é sempre injetada via deps.requestToolApi (nunca rede real, nunca
// BRIDGE_TOOLS_SECRET real). LIVE_MODE=true é setado ANTES do import (lido
// uma vez, no topo do módulo).
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'

process.env.AGENT_ID = 'test-agent'
process.env.GPT_TOKEN = 'test-gpt-token'
process.env.ZAPI_INSTANCE_ID = 'test-instance'
process.env.ZAPI_TOKEN = 'test-zapi-token'
process.env.WEBHOOK_PATH_SECRET = 'test-webhook-secret'
process.env.PORT = '0'
process.env.LIVE_MODE = 'true'
process.env.SUPABASE_URL = 'https://mock-supabase.test'
process.env.SUPABASE_SECRET_KEY = 'mock-supabase-secret'
process.env.GPTMAKER_BASE_URL = 'https://mock-gptmaker.test'
process.env.ZAPI_BASE_URL = 'https://mock-zapi.test'
// Esta suíte inteira exercita o FLUXO COMPLICADO (Gatekeeper, Tool Router)
// — precisa do modo explícito desde a divergência por BRIDGE_MODE
// (isolamento de FLUXO SIMPLES coberto em bridgeMode.test.js).
process.env.BRIDGE_MODE = 'complicated'
// IGNITE_PRIME_URL/BRIDGE_TOOLS_SECRET propositalmente NÃO configuradas —
// todo teste que precisa da Tool API injeta deps.requestToolApi diretamente.

let handleIncoming
let server

beforeAll(async () => {
  const mod = await import('../server.mjs')
  handleIncoming = mod.handleIncoming
  server = mod.server
})

afterAll(() => {
  server?.close()
})

let msgCounter = 0
function nextMessageId() {
  msgCounter++
  return `test-msg-${msgCounter}`
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

// Mock único de global.fetch — dispatch por host. Qualquer URL fora dos 3
// hosts mockados (gptmaker/zapapi/supabase de teste) lança — barreira
// explícita contra qualquer chamada de rede real escapando do mock (item R/S).
function makeGlobalFetchMock(overrides = {}) {
  const chamadas = []
  const fn = vi.fn(async (url, options = {}) => {
    const urlStr = String(url)
    chamadas.push(urlStr)

    if (urlStr.startsWith('https://mock-supabase.test/rest/v1/rpc/process_bridge_message')) {
      const body = JSON.parse(options.body)
      const custom = overrides.supabaseRpc?.(body)
      if (custom) return custom
      return defaultSupabaseRpc(body)
    }
    if (urlStr.startsWith('https://mock-supabase.test/rest/v1/bridge_operation_logs')) {
      return { ok: true, status: 200, json: async () => ({}) }
    }
    if (urlStr.startsWith('https://mock-gptmaker.test/')) {
      if (overrides.gptmaker) return overrides.gptmaker(options)
      return { ok: true, status: 200, json: async () => ({ success: true, message: 'Resposta padrão da Gabi' }) }
    }
    if (urlStr.startsWith('https://mock-zapi.test/')) {
      if (overrides.zapApi) return overrides.zapApi(options)
      return { ok: true, status: 200, json: async () => ({ id: 'msg-sent-1' }) }
    }

    throw new Error(`fetch mock: URL inesperada/real detectada — ${urlStr}`)
  })
  fn.chamadas = chamadas
  return fn
}

let originalFetch
let fetchMock

beforeEach(() => {
  originalFetch = global.fetch
})

afterEach(() => {
  global.fetch = originalFetch
})

function useFetchMock(overrides) {
  fetchMock = makeGlobalFetchMock(overrides)
  global.fetch = fetchMock
  return fetchMock
}

function corpoDaChamada(mock, hostPrefix) {
  const chamada = mock.mock.calls.find(([url]) => String(url).startsWith(hostPrefix))
  return chamada ? JSON.parse(chamada[1].body) : null
}

describe('A-B. sem ferramenta vs. com ferramenta — Tool API só chamada quando necessário', () => {
  it('A. "Oi" → Gatekeeper CONTINUE, nenhuma Tool API, GPTMaker recebe exatamente "Oi"', async () => {
    const requestToolApi = vi.fn()
    useFetchMock()
    await handleIncoming(makePayload('Oi'), { requestToolApi })

    expect(requestToolApi).not.toHaveBeenCalled()
    const corpoGpt = corpoDaChamada(fetchMock, 'https://mock-gptmaker.test/')
    expect(corpoGpt.prompt).toBe('Oi')
  })

  it('B. pergunta de produto → Tool API chamada uma vez', async () => {
    const requestToolApi = vi.fn(async () => ({ success: true, foundInCatalog: true, results: [], ambiguous: false, truncated: false }))
    useFetchMock()
    await handleIncoming(makePayload('Tem Nike Dunk Cacau?'), { requestToolApi })

    expect(requestToolApi).toHaveBeenCalledTimes(1)
  })
})

describe('C-E. prompt enriquecido conforme o resultado da ferramenta', () => {
  it('C. produto encontrado → prompt enriquecido com dados do produto', async () => {
    const requestToolApi = vi.fn(async () => ({
      success: true,
      foundInCatalog: true,
      results: [{ nome: 'Tênis Nike Dunk Cacau', preco: 'R$ 399,90', link: 'https://loja/1', imagem: 'https://loja/1.jpg' }],
      ambiguous: false,
      truncated: false,
    }))
    useFetchMock()
    await handleIncoming(makePayload('Tem Nike Dunk Cacau?'), { requestToolApi })

    const corpoGpt = corpoDaChamada(fetchMock, 'https://mock-gptmaker.test/')
    expect(corpoGpt.prompt).toContain('[DADOS INTERNOS DAS FERRAMENTAS]')
    expect(corpoGpt.prompt).toContain('Tênis Nike Dunk Cacau')
  })

  it('D. não encontrado → prompt seguro, sem inventar produto', async () => {
    const requestToolApi = vi.fn(async () => ({ success: true, foundInCatalog: false, results: [], ambiguous: false, truncated: false }))
    useFetchMock()
    await handleIncoming(makePayload('Tem Adidas?'), { requestToolApi })

    const corpoGpt = corpoDaChamada(fetchMock, 'https://mock-gptmaker.test/')
    expect(corpoGpt.prompt).toContain('Nenhum produto correspondente foi encontrado')
  })

  it('E. ambíguo → prompt pede esclarecimento', async () => {
    const requestToolApi = vi.fn(async () => ({
      success: true,
      foundInCatalog: true,
      results: [
        { nome: 'A', preco: '1', link: 'a', imagem: 'a.jpg' },
        { nome: 'B', preco: '2', link: 'b', imagem: 'b.jpg' },
      ],
      ambiguous: true,
      truncated: false,
    }))
    useFetchMock()
    await handleIncoming(makePayload('Tem Nike Dunk?'), { requestToolApi })

    const corpoGpt = corpoDaChamada(fetchMock, 'https://mock-gptmaker.test/')
    expect(corpoGpt.prompt).toContain('não escolha um sozinho')
  })
})

describe('F-H. falhas da Tool API nunca derrubam o atendimento', () => {
  it('F. timeout da Tool API → GPTMaker ainda chamado, com instrução de segurança', async () => {
    const requestToolApi = vi.fn(async () => {
      const err = new Error('abortado')
      err.name = 'AbortError'
      throw err
    })
    useFetchMock()
    await handleIncoming(makePayload('Tem Nike Dunk?'), { requestToolApi })

    const corpoGpt = corpoDaChamada(fetchMock, 'https://mock-gptmaker.test/')
    expect(corpoGpt).not.toBeNull()
    expect(corpoGpt.prompt).toMatch(/demorou demais/)
    expect(corpoGpt.prompt).toMatch(/Não afirme dados de produto não confirmados/)
  })

  it('G. 401 da Tool API → GPTMaker ainda chamado, com instrução de segurança', async () => {
    const requestToolApi = vi.fn(async () => ({ success: false, error_code: 'unauthorized' }))
    useFetchMock()
    await handleIncoming(makePayload('Tem Nike Dunk?'), { requestToolApi })

    const corpoGpt = corpoDaChamada(fetchMock, 'https://mock-gptmaker.test/')
    expect(corpoGpt).not.toBeNull()
    expect(corpoGpt.prompt).toMatch(/Não afirme dados de produto não confirmados/)
  })

  it('H. JSON inválido da Tool API → GPTMaker ainda chamado, com instrução de segurança', async () => {
    const requestToolApi = vi.fn(async () => ({})) // sem "success" — formato inesperado
    useFetchMock()
    await handleIncoming(makePayload('Tem Nike Dunk?'), { requestToolApi })

    const corpoGpt = corpoDaChamada(fetchMock, 'https://mock-gptmaker.test/')
    expect(corpoGpt).not.toBeNull()
    expect(corpoGpt.prompt).toMatch(/resultado inesperado/)
  })
})

describe('I-J. Gatekeeper BLOCK/IGNORE — zero downstream, mark_completed', () => {
  it('I. BLOCK → zero Tool API/GPTMaker/ZAP-API, dedupe fechado com mark_completed', async () => {
    const requestToolApi = vi.fn()
    const gatekeeperDecide = vi.fn(() => ({ action: 'BLOCK', reason: 'teste' }))
    const mock = useFetchMock()
    await handleIncoming(makePayload('spam spam spam'), { requestToolApi, gatekeeperDecide })

    expect(requestToolApi).not.toHaveBeenCalled()
    expect(mock.chamadas.some((u) => u.startsWith('https://mock-gptmaker.test/'))).toBe(false)
    expect(mock.chamadas.some((u) => u.startsWith('https://mock-zapi.test/'))).toBe(false)
    const chamadaRpc = mock.mock.calls.find(([url, opts]) => {
      if (!String(url).includes('process_bridge_message')) return false
      const body = JSON.parse(opts.body)
      return body.p_action === 'mark_completed'
    })
    expect(chamadaRpc).toBeDefined()
  })

  it('J. IGNORE → zero Tool API/GPTMaker/ZAP-API, dedupe fechado com mark_completed', async () => {
    const requestToolApi = vi.fn()
    const gatekeeperDecide = vi.fn(() => ({ action: 'IGNORE', reason: 'teste' }))
    const mock = useFetchMock()
    await handleIncoming(makePayload('mensagem qualquer'), { requestToolApi, gatekeeperDecide })

    expect(requestToolApi).not.toHaveBeenCalled()
    expect(mock.chamadas.some((u) => u.startsWith('https://mock-gptmaker.test/'))).toBe(false)
    expect(mock.chamadas.some((u) => u.startsWith('https://mock-zapi.test/'))).toBe(false)
  })
})

describe('K-L. ANSWER_WITHOUT_GPTMAKER — sucesso e falha', () => {
  it('K. sucesso → ZAP-API chamada e mark_completed, zero GPTMaker', async () => {
    const gatekeeperDecide = vi.fn(() => ({ action: 'ANSWER_WITHOUT_GPTMAKER', reason: 'teste', localReply: 'Resposta local de teste' }))
    const mock = useFetchMock()
    await handleIncoming(makePayload('qualquer coisa'), { gatekeeperDecide })

    expect(mock.chamadas.some((u) => u.startsWith('https://mock-gptmaker.test/'))).toBe(false)
    const corpoZap = corpoDaChamada(mock, 'https://mock-zapi.test/')
    expect(corpoZap.body).toBe('Resposta local de teste')
    const chamadaMarkCompleted = mock.mock.calls.find(([url, opts]) => {
      if (!String(url).includes('process_bridge_message')) return false
      return JSON.parse(opts.body).p_action === 'mark_completed'
    })
    expect(chamadaMarkCompleted).toBeDefined()
  })

  it('L. falha no envio → mark_failed', async () => {
    const gatekeeperDecide = vi.fn(() => ({ action: 'ANSWER_WITHOUT_GPTMAKER', reason: 'teste', localReply: 'Resposta local' }))
    const mock = useFetchMock({ zapApi: () => ({ ok: false, status: 500, json: async () => ({}) }) })
    await handleIncoming(makePayload('qualquer coisa'), { gatekeeperDecide })

    const chamadaMarkFailed = mock.mock.calls.find(([url, opts]) => {
      if (!String(url).includes('process_bridge_message')) return false
      return JSON.parse(opts.body).p_action === 'mark_failed'
    })
    expect(chamadaMarkFailed).toBeDefined()
  })
})

describe('M-N. CONTINUE — falha de GPTMaker/ZAP-API → mark_failed', () => {
  it('M. GPTMaker falha → mark_failed, ZAP-API nunca chamada', async () => {
    const requestToolApi = vi.fn()
    const mock = useFetchMock({ gptmaker: () => ({ ok: false, status: 500, json: async () => ({}) }) })
    await handleIncoming(makePayload('Oi'), { requestToolApi })

    expect(mock.chamadas.some((u) => u.startsWith('https://mock-zapi.test/'))).toBe(false)
    const chamadaMarkFailed = mock.mock.calls.find(([url, opts]) => {
      if (!String(url).includes('process_bridge_message')) return false
      return JSON.parse(opts.body).p_action === 'mark_failed'
    })
    expect(chamadaMarkFailed).toBeDefined()
  })

  it('N. GPTMaker ok + ZAP-API falha → mark_failed', async () => {
    const requestToolApi = vi.fn()
    const mock = useFetchMock({ zapApi: () => ({ ok: false, status: 500, json: async () => ({}) }) })
    await handleIncoming(makePayload('Oi'), { requestToolApi })

    const chamadaMarkFailed = mock.mock.calls.find(([url, opts]) => {
      if (!String(url).includes('process_bridge_message')) return false
      return JSON.parse(opts.body).p_action === 'mark_failed'
    })
    expect(chamadaMarkFailed).toBeDefined()
  })
})

describe('O. retry de mark_completed nunca reenvia a mensagem', () => {
  it('provider aceitou + mark_completed falha uma vez e sucede na 2ª tentativa → ZAP-API chamada só 1 vez', async () => {
    let tentativas = 0
    const requestToolApi = vi.fn()
    const mock = useFetchMock({
      supabaseRpc: (body) => {
        if (body.p_action !== 'mark_completed') return null
        tentativas++
        if (tentativas < 2) return { ok: false, status: 500, json: async () => ({}) }
        return { ok: true, status: 200, json: async () => ({ result: 'completed' }) }
      },
    })
    await handleIncoming(makePayload('Oi'), { requestToolApi })

    const chamadasZap = mock.chamadas.filter((u) => u.startsWith('https://mock-zapi.test/'))
    expect(chamadasZap).toHaveLength(1)
    expect(tentativas).toBeGreaterThanOrEqual(2)
  }, 10000)
})

describe('P. duplicidade continua bloqueada', () => {
  it('mesmo messageId enviado duas vezes → GPTMaker chamado só uma vez', async () => {
    const requestToolApi = vi.fn()
    const mock = useFetchMock()
    const payload = makePayload('Oi')

    await handleIncoming(payload, { requestToolApi })
    await handleIncoming(payload, { requestToolApi }) // mesmo messageId, reenviado

    const chamadasGpt = mock.chamadas.filter((u) => u.startsWith('https://mock-gptmaker.test/'))
    expect(chamadasGpt).toHaveLength(1)
  })
})

describe('Q. LIVE_MODE=false → zero downstream', () => {
  it('nenhuma chamada de Gatekeeper/Router/Tool API/GPTMaker/ZAP-API', async () => {
    vi.resetModules()
    const envAnterior = { ...process.env }
    process.env.LIVE_MODE = 'false'
    process.env.PORT = '0'

    const mod = await import('../server.mjs')
    const gatekeeperDecide = vi.fn()
    const requestToolApi = vi.fn()
    const mock = useFetchMock()

    await mod.handleIncoming(makePayload('Oi'), { gatekeeperDecide, requestToolApi })

    expect(gatekeeperDecide).not.toHaveBeenCalled()
    expect(requestToolApi).not.toHaveBeenCalled()
    expect(mock.chamadas).toHaveLength(0)

    mod.server.close()
    process.env.LIVE_MODE = envAnterior.LIVE_MODE
  })
})

describe('R-S. zero rede real, zero Supabase real', () => {
  it('R. qualquer URL fora dos hosts mockados lança (barreira contra rede real)', async () => {
    const mock = makeGlobalFetchMock()
    await expect(mock('https://api.real-provider.example/x', {})).rejects.toThrow(/URL inesperada/)
  })

  it('S. nenhuma chamada usa o domínio real do Supabase (supabase.co)', async () => {
    const requestToolApi = vi.fn()
    const mock = useFetchMock()
    await handleIncoming(makePayload('Oi'), { requestToolApi })
    expect(mock.chamadas.some((u) => u.includes('.supabase.co'))).toBe(false)
  })
})

describe('T. nenhum segredo aparece em log', () => {
  it('console.log nunca contém o token/segredo de teste', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const requestToolApi = vi.fn(async () => ({ success: true, foundInCatalog: false, results: [] }))
      useFetchMock()
      await handleIncoming(makePayload('Tem Nike Dunk?'), { requestToolApi })

      const logsSerializados = consoleSpy.mock.calls.map((args) => JSON.stringify(args))
      for (const linha of logsSerializados) {
        expect(linha).not.toContain('test-gpt-token')
        expect(linha).not.toContain('test-zapi-token')
        expect(linha).not.toContain('mock-supabase-secret')
        expect(linha.toLowerCase()).not.toContain('authorization')
        expect(linha).not.toContain('Bearer')
      }
    } finally {
      consoleSpy.mockRestore()
    }
  })
})

describe('filtros da Fase 2 (regressão — primeira cobertura automatizada)', () => {
  // Filtros já existentes (Fase 1/2) continuam registrando um log
  // "filtered_*" fire-and-forget em bridge_operation_logs (comportamento
  // pré-existente, não introduzido nesta etapa) — o que nunca pode acontecer
  // é chegar a Gatekeeper/Tool API/GPTMaker/ZAP-API.
  function semDownstreamRelevante(mock) {
    expect(mock.chamadas.some((u) => u.startsWith('https://mock-gptmaker.test/'))).toBe(false)
    expect(mock.chamadas.some((u) => u.startsWith('https://mock-zapi.test/'))).toBe(false)
    expect(mock.chamadas.some((u) => u.includes('process_bridge_message'))).toBe(false)
  }

  it('evento diferente de message.received é ignorado, zero downstream relevante', async () => {
    const requestToolApi = vi.fn()
    const mock = useFetchMock()
    await handleIncoming({ event: 'message.sent', data: { messageId: nextMessageId() } }, { requestToolApi })
    semDownstreamRelevante(mock)
    expect(requestToolApi).not.toHaveBeenCalled()
  })

  it('fromMe=true é ignorado, zero downstream relevante', async () => {
    const requestToolApi = vi.fn()
    const mock = useFetchMock()
    await handleIncoming(makePayload('Oi', { fromMe: true }), { requestToolApi })
    semDownstreamRelevante(mock)
    expect(requestToolApi).not.toHaveBeenCalled()
  })

  it('mensagem não-texto é ignorada, zero downstream relevante', async () => {
    const requestToolApi = vi.fn()
    const mock = useFetchMock()
    await handleIncoming(makePayload(undefined, { type: 'image', body: undefined }), { requestToolApi })
    semDownstreamRelevante(mock)
    expect(requestToolApi).not.toHaveBeenCalled()
  })

  it('payload sem telefone é ignorado, zero downstream relevante', async () => {
    const requestToolApi = vi.fn()
    const mock = useFetchMock()
    await handleIncoming(makePayload('Oi', { phone: undefined }), { requestToolApi })
    semDownstreamRelevante(mock)
    expect(requestToolApi).not.toHaveBeenCalled()
  })

  it('telefone inválido após normalização é ignorado, zero downstream relevante', async () => {
    const requestToolApi = vi.fn()
    const mock = useFetchMock()
    await handleIncoming(makePayload('Oi', { phone: '123' }), { requestToolApi })
    semDownstreamRelevante(mock)
    expect(requestToolApi).not.toHaveBeenCalled()
  })
})
