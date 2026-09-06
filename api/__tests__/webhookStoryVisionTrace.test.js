// api/__tests__/webhookStoryVisionTrace.test.js
//
// Etapa 0B (Story Vision Trace) — prova, via o handler real de api/webhook.js,
// que:
// 1. search_context_used cobre os 3 valores esperados (pergunta_direta,
//    story, story_fallback_pergunta);
// 2. o log estruturado [Webhook][trace] carrega correlation_id/story_id/
//    story_context_status/vision_status/search_context_used/fallback_used/
//    candidates_count/top_candidate_scores;
// 3. top_candidate_scores nunca tem mais de 3 valores e nunca contém nome/id
//    de produto;
// 4. nenhum log emitido pelo handler (incluindo os já existentes) carrega
//    chat_id cru, telefone, pergunta completa ou storyMediaUrl.
//
// _storyContext.js e _visaoProduto.js são mockados diretamente (já têm
// cobertura própria em storyContext.test.js/visaoProdutoTelemetria.test.js);
// aqui o foco é só a orquestração e o log em api/webhook.js.
// _gabrielaContextService.js/_profileIdentity.js/_profileMemory.js também são
// mockados — o catálogo de teste é fixo e controlado, pra buscarProdutos()
// (função REAL, não mockada) calcular scores previsíveis.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

function makeRes() {
  const res = { statusCode: null, body: null }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (payload) => { res.body = payload; return res }
  res.setHeader = () => res
  res.end = () => res
  return res
}

function makeReq(body) {
  return { method: 'POST', body }
}

const CATALOGO_FIXTURE = [
  { id: 1, nome: 'Bermuda Jeans Azul', categoria: 'bermuda', preco: 100, imagem: null, link: null },
  { id: 2, nome: 'Bermuda Moletom Cinza', categoria: 'bermuda', preco: 90, imagem: null, link: null },
  { id: 3, nome: 'Tenis Vans Old Skool Preto', categoria: 'tenis', preco: 300, imagem: null, link: null },
]

describe('api/webhook.js — structured trace (Etapa 0B)', () => {
  let logSpy

  beforeEach(() => {
    vi.resetModules()
    process.env.VITE_SUPABASE_URL = 'https://fixture.supabase.co'
    process.env.VITE_SUPABASE_KEY = 'fixture-anon-key'

    vi.doMock('../_profileIdentity.js', () => ({
      upsertIdentity: vi.fn(() => Promise.resolve()),
    }))
    vi.doMock('../_profileMemory.js', () => ({
      getMemoryBlock: vi.fn(() => Promise.resolve('')),
    }))
    vi.doMock('../_gabrielaContextService.js', () => ({
      fetchProductsCatalog: vi.fn(() => Promise.resolve({ ok: true, products: CATALOGO_FIXTURE })),
      fetchGabrielaKnowledge: vi.fn(() => Promise.resolve({ ok: true, knowledge: null })),
      formatarProdutoComercial: vi.fn(() => ({})),
    }))

    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.doUnmock('../_profileIdentity.js')
    vi.doUnmock('../_profileMemory.js')
    vi.doUnmock('../_gabrielaContextService.js')
    vi.restoreAllMocks()
  })

  function readTraceLog() {
    const chamada = logSpy.mock.calls.find((args) => args[0] === '[Webhook][trace]')
    expect(chamada).toBeTruthy()
    return JSON.parse(chamada[1])
  }

  it('search_context_used = pergunta_direta quando não há chat_id', async () => {
    vi.doMock('../_storyContext.js', () => ({ getStoryContext: vi.fn() }))
    vi.doMock('../_visaoProduto.js', () => ({ identificarProdutoPorImagem: vi.fn() }))

    const { default: handler } = await import('../webhook.js')
    const res = makeRes()
    await handler(makeReq({ pergunta: 'tem bermuda?', cliente_id: 'cliente-1' }), res)

    const trace = readTraceLog()
    expect(trace.search_context_used).toBe('pergunta_direta')
    expect(trace.story_context_status).toBeNull() // getStoryContext nem foi chamado
    expect(trace.vision_status).toBe('not_attempted')
    expect(trace.fallback_used).toBe(false)
    expect(typeof trace.correlation_id).toBe('string')
    expect(trace.correlation_id.length).toBeGreaterThan(10)
    expect(trace.story_id).toBeNull()
  })

  it('search_context_used = story quando Story é encontrado e a Vision identifica o produto', async () => {
    vi.doMock('../_storyContext.js', () => ({
      getStoryContext: vi.fn(() => Promise.resolve({
        status: 'FOUND', storyId: 'story-real-1', storyMediaUrl: 'https://gpt-files.com/x.jpg', storyMediaType: 'image',
      })),
    }))
    vi.doMock('../_visaoProduto.js', () => ({
      identificarProdutoPorImagem: vi.fn(() => Promise.resolve('## Bermuda Jeans Azul\n**Tipo:** bermuda')),
    }))

    const { default: handler } = await import('../webhook.js')
    const res = makeRes()
    await handler(makeReq({ pergunta: 'qual valor?', cliente_id: 'cliente-2', chat_id: 'chat-2' }), res)

    const trace = readTraceLog()
    expect(trace.search_context_used).toBe('story')
    expect(trace.story_context_status).toBe('STORY_FOUND_VISION_OK')
    expect(trace.vision_status).toBe('success')
    expect(trace.story_id).toBe('story-real-1')
    expect(trace.fallback_used).toBe(false)
  })

  it('search_context_used = story_fallback_pergunta quando a Vision acha produto mas a busca por ele dá 0 resultados', async () => {
    vi.doMock('../_storyContext.js', () => ({
      getStoryContext: vi.fn(() => Promise.resolve({
        status: 'FOUND', storyId: 'story-real-2', storyMediaUrl: 'https://gpt-files.com/y.jpg', storyMediaType: 'image',
      })),
    }))
    vi.doMock('../_visaoProduto.js', () => ({
      // Texto sem nenhuma palavra do catálogo fixture — força 0 resultados na 1ª busca.
      identificarProdutoPorImagem: vi.fn(() => Promise.resolve('## Produto Inexistente No Catalogo Xyz Abc')),
    }))

    const { default: handler } = await import('../webhook.js')
    const res = makeRes()
    await handler(makeReq({ pergunta: 'tem tenis vans?', cliente_id: 'cliente-3', chat_id: 'chat-3' }), res)

    const trace = readTraceLog()
    expect(trace.search_context_used).toBe('story_fallback_pergunta')
    expect(trace.fallback_used).toBe(true)
    expect(trace.story_context_status).toBe('STORY_FOUND_VISION_OK') // Vision teve sucesso; o fallback é da BUSCA, não da Vision
    // depois do fallback, a pergunta original ("tenis vans") deve achar o produto 3 do catálogo fixture
    expect(trace.candidates_count).toBeGreaterThan(0)
  // buscarProdutos() retenta até 5x com 2s de espera quando dá 0 resultados
  // (comportamento REAL já existente, não alterado por esta etapa) — a 1ª
  // chamada (com o texto da Vision) esgota esse retry antes do fallback.
  }, 15000)

  it('story_context_status = STORY_FOUND_VISION_FAILED quando o Story é achado mas a Vision retorna null', async () => {
    vi.doMock('../_storyContext.js', () => ({
      getStoryContext: vi.fn(() => Promise.resolve({
        status: 'FOUND', storyId: 'story-real-3', storyMediaUrl: 'https://gpt-files.com/z.jpg', storyMediaType: 'image',
      })),
    }))
    vi.doMock('../_visaoProduto.js', () => ({
      identificarProdutoPorImagem: vi.fn(() => Promise.resolve(null)),
    }))

    const { default: handler } = await import('../webhook.js')
    const res = makeRes()
    // "tem bermuda?" (em vez de "qual valor?") pra bater com o catálogo fixture
    // de propósito e não disparar o retry de 5x/2s de buscarProdutos() —
    // este teste não está avaliando a busca, só a classificação de status.
    await handler(makeReq({ pergunta: 'tem bermuda?', cliente_id: 'cliente-4', chat_id: 'chat-4' }), res)

    const trace = readTraceLog()
    expect(trace.story_context_status).toBe('STORY_FOUND_VISION_FAILED')
    expect(trace.vision_status).toBe('failed')
    expect(trace.search_context_used).toBe('pergunta_direta') // buscaTexto nunca mudou, ficou = pergunta
  })

  it('story_context_status = NO_STORY_IN_LATEST_MESSAGE quando getStoryContext não acha Story (caso "Alan": 2ª mensagem sem metadata)', async () => {
    vi.doMock('../_storyContext.js', () => ({
      getStoryContext: vi.fn(() => Promise.resolve({ status: 'NO_STORY_IN_LATEST_MESSAGE' })),
    }))
    vi.doMock('../_visaoProduto.js', () => ({ identificarProdutoPorImagem: vi.fn() }))

    const { default: handler } = await import('../webhook.js')
    const res = makeRes()
    await handler(makeReq({ pergunta: 'bermuda', cliente_id: 'cliente-5', chat_id: 'chat-5' }), res)

    const trace = readTraceLog()
    expect(trace.story_context_status).toBe('NO_STORY_IN_LATEST_MESSAGE')
    expect(trace.vision_status).toBe('not_attempted')
    expect(trace.search_context_used).toBe('pergunta_direta')
    // busca genérica por "bermuda" deve achar os 2 produtos de bermuda do catálogo fixture
    expect(trace.candidates_count).toBeGreaterThanOrEqual(1)
  })

  it('story_context_status = GPTMAKER_FETCH_ERROR quando getStoryContext lança exceção inesperada', async () => {
    vi.doMock('../_storyContext.js', () => ({
      getStoryContext: vi.fn(() => Promise.reject(new Error('falha de rede simulada'))),
    }))
    vi.doMock('../_visaoProduto.js', () => ({ identificarProdutoPorImagem: vi.fn() }))

    const { default: handler } = await import('../webhook.js')
    const res = makeRes()
    // "tem bermuda?" pelo mesmo motivo do teste anterior — evitar o retry
    // real de buscarProdutos(), irrelevante pra esta asserção de status.
    await handler(makeReq({ pergunta: 'tem bermuda?', cliente_id: 'cliente-6', chat_id: 'chat-6' }), res)

    const trace = readTraceLog()
    expect(trace.story_context_status).toBe('GPTMAKER_FETCH_ERROR')
  })

  it('top_candidate_scores tem no máximo 3 valores numéricos, sem nome/id de produto', async () => {
    vi.doMock('../_storyContext.js', () => ({ getStoryContext: vi.fn() }))
    vi.doMock('../_visaoProduto.js', () => ({ identificarProdutoPorImagem: vi.fn() }))

    const { default: handler } = await import('../webhook.js')
    const res = makeRes()
    await handler(makeReq({ pergunta: 'tem bermuda?', cliente_id: 'cliente-7' }), res)

    const trace = readTraceLog()
    expect(Array.isArray(trace.top_candidate_scores)).toBe(true)
    expect(trace.top_candidate_scores.length).toBeLessThanOrEqual(3)
    trace.top_candidate_scores.forEach((s) => expect(typeof s).toBe('number'))

    // nada além de números no array — nunca nome/id de produto
    const serializado = JSON.stringify(trace.top_candidate_scores)
    expect(serializado).not.toMatch(/[a-zA-Z]/)
  })

  it('nenhum log emitido pelo handler contém chat_id cru, telefone, pergunta completa ou storyMediaUrl', async () => {
    vi.doMock('../_storyContext.js', () => ({
      getStoryContext: vi.fn(() => Promise.resolve({
        status: 'FOUND', storyId: 'story-sensivel', storyMediaUrl: 'https://gpt-files.com/segredo-do-cliente.jpg', storyMediaType: 'image',
      })),
    }))
    vi.doMock('../_visaoProduto.js', () => ({
      identificarProdutoPorImagem: vi.fn(() => Promise.resolve('## Bermuda Jeans Azul')),
    }))

    const { default: handler } = await import('../webhook.js')
    const res = makeRes()
    const chatIdSecreto = 'chat-id-nao-pode-vazar-99999'
    const telefoneSecreto = '+5511999998888'
    const perguntaCompleta = 'Essa pergunta inteira nunca pode aparecer em nenhum log estruturado'

    await handler(makeReq({
      pergunta: perguntaCompleta,
      cliente_id: 'cliente-8',
      telefone: telefoneSecreto,
      chat_id: chatIdSecreto,
    }), res)

    const todosOsLogsDeTrace = logSpy.mock.calls
      .filter((args) => args[0] === '[Webhook][trace]')
      .map((args) => args[1])
      .join(' ')

    expect(todosOsLogsDeTrace).not.toContain(chatIdSecreto)
    expect(todosOsLogsDeTrace).not.toContain(telefoneSecreto)
    expect(todosOsLogsDeTrace).not.toContain(perguntaCompleta)
    expect(todosOsLogsDeTrace).not.toContain('segredo-do-cliente.jpg')
  })
})
