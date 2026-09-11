import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

function makeRes() {
  const res = { statusCode: null, body: null }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (payload) => { res.body = payload; return res }
  return res
}

function makeReq(body, labHeader = 'GABY-LAB-COMERCIAL-V1', labMode = 'story-shadow-v1') {
  return { method: 'POST', body, headers: { 'x-prime-lab': labHeader, 'x-prime-lab-mode': labMode } }
}

function shadowResponse(produtos, total = produtos.length) {
  return {
    sucesso: true,
    contexto: { pergunta: 'fixture', produtos_encontrados: produtos.length, tem_produtos: produtos.length > 0, total_variacoes: total, variacoes_restantes: Math.max(0, total - produtos.length), source: 'shadow_v2' },
    dados: { produtos, totalVariacoes: total, variacoesRestantes: Math.max(0, total - produtos.length), informacao_adicional: 'fixture' },
  }
}

function mockLabFetch(shadowResponder, { cacheUnavailable = false } = {}) {
  const cache = new Map()
  const shadowQueries = []
  const cacheOps = []

  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    const body = JSON.parse(options.body)
    const u = String(url)

    if (u.includes('gaby-lab-story-cache-v1')) {
      cacheOps.push({ action: body.action, story_id: body.story_id, query_compact: body.query_compact ?? null })
      if (cacheUnavailable) return { ok: false, status: 503, json: async () => ({ sucesso: false }) }
      if (body.action === 'cache_get') {
        const query = cache.get(body.story_id)
        return { ok: true, status: 200, json: async () => query
          ? ({ sucesso: true, cache_status: 'hit', query_compact: query })
          : ({ sucesso: true, cache_status: 'miss', query_compact: null }) }
      }
      if (body.action === 'cache_put') {
        cache.set(body.story_id, body.query_compact)
        return { ok: true, status: 200, json: async () => ({ sucesso: true, cache_status: 'stored' }) }
      }
    }

    if (u.includes('gaby-lab-shadow-catalog-v1')) {
      shadowQueries.push(body.pergunta)
      return { ok: true, status: 200, json: async () => shadowResponder(body.pergunta, shadowQueries.length) }
    }

    throw new Error(`unexpected fetch ${u}`)
  }))

  return { cache, shadowQueries, cacheOps }
}

describe('GABY LAB Story + Shadow V2 — persistent Vision cache', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.VITE_SUPABASE_URL = 'https://fixture.supabase.co'
  })

  afterEach(() => {
    vi.doUnmock('../_storyContext.js')
    vi.doUnmock('../_visaoProduto.js')
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sem chat_id: consulta Shadow V2 direto e não chama Story/Vision/cache', async () => {
    const getStoryContext = vi.fn()
    const vision = vi.fn()
    vi.doMock('../_storyContext.js', () => ({ getStoryContext }))
    vi.doMock('../_visaoProduto.js', () => ({ identificarProdutoPorImagem: vision }))
    const io = mockLabFetch(() => shadowResponse([{ nome: 'Tenis New Balance 9060 Azul', relevancia: 172 }], 42))

    const { runGabyLabStoryShadow } = await import('../../lib/gabyLabStoryShadow.js')
    const res = makeRes()
    await runGabyLabStoryShadow(makeReq({ pergunta: 'New Balance 9060' }), res)

    expect(res.statusCode).toBe(200)
    expect(io.shadowQueries).toEqual(['New Balance 9060'])
    expect(io.cacheOps).toHaveLength(0)
    expect(getStoryContext).not.toHaveBeenCalled()
    expect(vision).not.toHaveBeenCalled()
  })

  it('primeiro turno do Story: cache miss → Vision → Shadow confiável → cache stored', async () => {
    vi.doMock('../_storyContext.js', () => ({ getStoryContext: vi.fn(() => Promise.resolve({ status: 'FOUND', storyId: 'story-diesel', storyMediaUrl: 'https://gpt-files.com/diesel.jpg', storyMediaType: 'image' })) }))
    const vision = vi.fn(() => Promise.resolve('## Calça Skinny com Elastano\n**Tipo:** Calça Jeans\n**Marca:** Diesel'))
    vi.doMock('../_visaoProduto.js', () => ({ identificarProdutoPorImagem: vision }))
    const io = mockLabFetch(() => shadowResponse([{ nome: 'Calça Jeans Diesel 009', relevancia: 57 }], 83))

    const { runGabyLabStoryShadow } = await import('../../lib/gabyLabStoryShadow.js')
    const res = makeRes()
    await runGabyLabStoryShadow(makeReq({ pergunta: 'qual valor?', chat_id: 'chat-diesel' }), res)

    expect(vision).toHaveBeenCalledTimes(1)
    expect(io.shadowQueries).toEqual(['Calça Skinny com Elastano Calça Jeans Diesel'])
    expect(io.cacheOps.map(x => x.action)).toEqual(['cache_get', 'cache_put'])
    expect(res.body.contexto.story_lab.cache_status).toBe('miss')
    expect(res.body.contexto.story_lab.cache_write_status).toBe('stored')
    expect(res.body.contexto.pergunta).toBe('qual valor?')
  })

  it('mesmo story_id: segundo turno usa cache persistente e Vision roda só 1 vez', async () => {
    vi.doMock('../_storyContext.js', () => ({ getStoryContext: vi.fn(() => Promise.resolve({ status: 'FOUND', storyId: 'story-mesmo', storyMediaUrl: 'https://gpt-files.com/bermuda.jpg', storyMediaType: 'image' })) }))
    const vision = vi.fn(() => Promise.resolve('## Bermuda Jeans Diesel\n**Tipo:** Bermuda\n**Marca:** Diesel'))
    vi.doMock('../_visaoProduto.js', () => ({ identificarProdutoPorImagem: vision }))
    const io = mockLabFetch(() => shadowResponse([{ nome: 'Bermuda Diesel Jeans', relevancia: 54 }], 39))

    const { runGabyLabStoryShadow } = await import('../../lib/gabyLabStoryShadow.js')
    const primeira = makeRes(); await runGabyLabStoryShadow(makeReq({ pergunta: 'qual valor?', chat_id: 'chat-1' }), primeira)
    const segunda = makeRes(); await runGabyLabStoryShadow(makeReq({ pergunta: 'tem M?', chat_id: 'chat-1' }), segunda)

    expect(vision).toHaveBeenCalledTimes(1)
    expect(segunda.body.contexto.story_lab.cache_status).toBe('hit')
    expect(segunda.body.contexto.story_lab.vision_status).toBe('cache_hit')
    expect(segunda.body.contexto.pergunta).toBe('tem M?')
    expect(io.cacheOps.map(x => x.action)).toEqual(['cache_get', 'cache_put', 'cache_get'])
  })

  it('story_id novo: não herda cache do Story anterior e Vision roda novamente', async () => {
    let storyId = 'story-A'
    vi.doMock('../_storyContext.js', () => ({ getStoryContext: vi.fn(() => Promise.resolve({ status: 'FOUND', storyId, storyMediaUrl: `https://gpt-files.com/${storyId}.jpg`, storyMediaType: 'image' })) }))
    const vision = vi.fn(() => Promise.resolve('## Bermuda Jeans Diesel\n**Tipo:** Bermuda\n**Marca:** Diesel'))
    vi.doMock('../_visaoProduto.js', () => ({ identificarProdutoPorImagem: vision }))
    const io = mockLabFetch(() => shadowResponse([{ nome: 'Bermuda Diesel Jeans', relevancia: 54 }], 39))

    const { runGabyLabStoryShadow } = await import('../../lib/gabyLabStoryShadow.js')
    await runGabyLabStoryShadow(makeReq({ pergunta: 'qual valor?', chat_id: 'chat-1' }), makeRes())
    storyId = 'story-B'
    const segundo = makeRes(); await runGabyLabStoryShadow(makeReq({ pergunta: 'qual valor?', chat_id: 'chat-1' }), segundo)

    expect(vision).toHaveBeenCalledTimes(2)
    expect(segundo.body.contexto.story_lab.cache_status).toBe('miss')
    expect(io.cacheOps.filter(x => x.action === 'cache_put').map(x => x.story_id)).toEqual(['story-A', 'story-B'])
  })

  it('match visual abaixo de 25 faz fallback e NÃO grava cache', async () => {
    vi.doMock('../_storyContext.js', () => ({ getStoryContext: vi.fn(() => Promise.resolve({ status: 'FOUND', storyId: 'story-fraco', storyMediaUrl: 'https://gpt-files.com/fraco.jpg', storyMediaType: 'image' })) }))
    const vision = vi.fn(() => Promise.resolve('## Produto Inexistente Xyz\n**Tipo:** Eletronico\n**Marca:** MarcaXyz'))
    vi.doMock('../_visaoProduto.js', () => ({ identificarProdutoPorImagem: vision }))
    const io = mockLabFetch((_q, n) => n % 2 === 1 ? shadowResponse([{ nome: 'Phantom', relevancia: 6 }], 1) : shadowResponse([{ nome: 'Bermuda Diesel', relevancia: 40 }], 1))

    const { runGabyLabStoryShadow } = await import('../../lib/gabyLabStoryShadow.js')
    const primeira = makeRes(); await runGabyLabStoryShadow(makeReq({ pergunta: 'bermuda diesel', chat_id: 'chat-fraco' }), primeira)
    const segunda = makeRes(); await runGabyLabStoryShadow(makeReq({ pergunta: 'bermuda diesel', chat_id: 'chat-fraco' }), segunda)

    expect(vision).toHaveBeenCalledTimes(2)
    expect(io.cacheOps.filter(x => x.action === 'cache_put')).toHaveLength(0)
    expect(primeira.body.contexto.story_lab.fallback_used).toBe(true)
  })

  it('cache indisponível é fail-open: Vision continua funcionando e não bloqueia Story', async () => {
    vi.doMock('../_storyContext.js', () => ({ getStoryContext: vi.fn(() => Promise.resolve({ status: 'FOUND', storyId: 'story-cache-down', storyMediaUrl: 'https://gpt-files.com/x.jpg', storyMediaType: 'image' })) }))
    const vision = vi.fn(() => Promise.resolve('## Bermuda Jeans Diesel\n**Tipo:** Bermuda\n**Marca:** Diesel'))
    vi.doMock('../_visaoProduto.js', () => ({ identificarProdutoPorImagem: vision }))
    mockLabFetch(() => shadowResponse([{ nome: 'Bermuda Diesel Jeans', relevancia: 54 }], 39), { cacheUnavailable: true })

    const { runGabyLabStoryShadow } = await import('../../lib/gabyLabStoryShadow.js')
    const res = makeRes(); await runGabyLabStoryShadow(makeReq({ pergunta: 'qual valor?', chat_id: 'chat-1' }), res)

    expect(res.statusCode).toBe(200)
    expect(vision).toHaveBeenCalledTimes(1)
    expect(res.body.contexto.story_lab.cache_status).toBe('unavailable')
    expect(res.body.contexto.story_lab.cache_write_status).toBe('unavailable')
  })

  it('[Correção #6] MULTIPLOS: não consulta catálogo, pede cor/modelo e grava contexto ambíguo no cache', async () => {
    vi.doMock('../_storyContext.js', () => ({ getStoryContext: vi.fn(() => Promise.resolve({ status: 'FOUND', storyId: 'story-multi', storyMediaUrl: 'https://gpt-files.com/multi.jpg', storyMediaType: 'image' })) }))
    const vision = vi.fn(() => Promise.resolve('**Cenário:** MULTIPLOS\n## Vários produtos\n**Tipo:** Bermuda\n**Marca:** Não identificado\n**Cor:** preta, verde, bege'))
    vi.doMock('../_visaoProduto.js', () => ({ identificarProdutoPorImagem: vision }))
    const io = mockLabFetch(() => shadowResponse([{ nome: 'NÃO DEVERIA SER CONSULTADO', relevancia: 99 }], 1))

    const { runGabyLabStoryShadow } = await import('../../lib/gabyLabStoryShadow.js')
    const res = makeRes(); await runGabyLabStoryShadow(makeReq({ pergunta: 'qual valor?', chat_id: 'chat-multi' }), res)

    expect(res.statusCode).toBe(200)
    expect(vision).toHaveBeenCalledTimes(1)
    expect(io.shadowQueries).toHaveLength(0)
    expect(res.body.contexto.produtos_encontrados).toBe(0)
    expect(res.body.contexto.clarificacao).toMatchObject({ necessaria: true, motivo: 'multiple_products', categoria: 'Bermuda' })
    expect(res.body.contexto.clarificacao.pergunta_sugerida).toContain('Qual cor ou modelo')
    expect(res.body.contexto.story_lab.visual_scene).toBe('MULTIPLOS')
    expect(res.body.contexto.story_lab.cache_write_status).toBe('stored')
    const put = io.cacheOps.find(x => x.action === 'cache_put')
    expect(put.query_compact).toContain('MULTI::')
    expect(put.query_compact).toContain('Bermuda')
  })

  it('[Correção #6] mesmo Story MULTIPLOS + pergunta genérica usa cache e não repete Vision nem catálogo', async () => {
    vi.doMock('../_storyContext.js', () => ({ getStoryContext: vi.fn(() => Promise.resolve({ status: 'FOUND', storyId: 'story-multi-cache', storyMediaUrl: 'https://gpt-files.com/multi.jpg', storyMediaType: 'image' })) }))
    const vision = vi.fn(() => Promise.resolve('**Cenário:** MULTIPLOS\n## Vários produtos\n**Tipo:** Bermuda\n**Marca:** Não identificado'))
    vi.doMock('../_visaoProduto.js', () => ({ identificarProdutoPorImagem: vision }))
    const io = mockLabFetch(() => shadowResponse([{ nome: 'NÃO DEVERIA SER CONSULTADO', relevancia: 99 }], 1))

    const { runGabyLabStoryShadow } = await import('../../lib/gabyLabStoryShadow.js')
    await runGabyLabStoryShadow(makeReq({ pergunta: 'qual valor?', chat_id: 'chat-multi' }), makeRes())
    const segunda = makeRes(); await runGabyLabStoryShadow(makeReq({ pergunta: 'tem M?', chat_id: 'chat-multi' }), segunda)

    expect(vision).toHaveBeenCalledTimes(1)
    expect(io.shadowQueries).toHaveLength(0)
    expect(segunda.body.contexto.story_lab.cache_status).toBe('hit')
    expect(segunda.body.contexto.story_lab.vision_status).toBe('cache_hit')
    expect(segunda.body.contexto.clarificacao.motivo).toBe('multiple_products')
  })

  it('[Correção #6] mesmo Story MULTIPLOS + "a preta" combina categoria e discriminador sem repetir Vision', async () => {
    vi.doMock('../_storyContext.js', () => ({ getStoryContext: vi.fn(() => Promise.resolve({ status: 'FOUND', storyId: 'story-multi-preta', storyMediaUrl: 'https://gpt-files.com/multi.jpg', storyMediaType: 'image' })) }))
    const vision = vi.fn(() => Promise.resolve('**Cenário:** MULTIPLOS\n## Vários produtos\n**Tipo:** Bermuda\n**Marca:** Diesel'))
    vi.doMock('../_visaoProduto.js', () => ({ identificarProdutoPorImagem: vision }))
    const io = mockLabFetch((q) => shadowResponse([{ nome: 'Bermuda Diesel Preta', relevancia: q.includes('preta') ? 60 : 0 }], 1))

    const { runGabyLabStoryShadow } = await import('../../lib/gabyLabStoryShadow.js')
    await runGabyLabStoryShadow(makeReq({ pergunta: 'qual valor?', chat_id: 'chat-multi' }), makeRes())
    const segunda = makeRes(); await runGabyLabStoryShadow(makeReq({ pergunta: 'a preta', chat_id: 'chat-multi' }), segunda)

    expect(vision).toHaveBeenCalledTimes(1)
    expect(io.shadowQueries).toEqual(['Bermuda Diesel a preta'])
    expect(segunda.body.contexto.produtos_encontrados).toBe(1)
    expect(segunda.body.contexto.story_lab.search_context_used).toBe('story_clarified')
    expect(segunda.body.contexto.story_lab.clarification_needed).toBe(false)
  })

  it('[Correção #6] INDEFINIDO: não consulta catálogo nem grava cache e pede identificação genérica', async () => {
    vi.doMock('../_storyContext.js', () => ({ getStoryContext: vi.fn(() => Promise.resolve({ status: 'FOUND', storyId: 'story-indef', storyMediaUrl: 'https://gpt-files.com/indef.jpg', storyMediaType: 'image' })) }))
    const vision = vi.fn(() => Promise.resolve('**Cenário:** INDEFINIDO\n## Produto não identificado\n**Tipo:** Não identificado\n**Marca:** Não identificado'))
    vi.doMock('../_visaoProduto.js', () => ({ identificarProdutoPorImagem: vision }))
    const io = mockLabFetch(() => shadowResponse([{ nome: 'NÃO DEVERIA SER CONSULTADO', relevancia: 99 }], 1))

    const { runGabyLabStoryShadow } = await import('../../lib/gabyLabStoryShadow.js')
    const res = makeRes(); await runGabyLabStoryShadow(makeReq({ pergunta: 'qual valor?', chat_id: 'chat-indef' }), res)

    expect(res.statusCode).toBe(200)
    expect(io.shadowQueries).toHaveLength(0)
    expect(io.cacheOps.filter(x => x.action === 'cache_put')).toHaveLength(0)
    expect(res.body.contexto.story_lab.visual_scene).toBe('INDEFINIDO')
    expect(res.body.contexto.clarificacao.motivo).toBe('visual_undefined')
  })

  it('qualquer falha nas duas travas LAB bloqueia antes de Story/Vision/fetch', async () => {
    const getStoryContext = vi.fn(); const vision = vi.fn(); const fetchSpy = vi.fn()
    vi.doMock('../_storyContext.js', () => ({ getStoryContext }))
    vi.doMock('../_visaoProduto.js', () => ({ identificarProdutoPorImagem: vision }))
    vi.stubGlobal('fetch', fetchSpy)

    const { runGabyLabStoryShadow } = await import('../../lib/gabyLabStoryShadow.js')
    const a = makeRes(); await runGabyLabStoryShadow(makeReq({ pergunta: 'NB 9060' }, 'invalido'), a)
    const b = makeRes(); await runGabyLabStoryShadow(makeReq({ pergunta: 'NB 9060' }, 'GABY-LAB-COMERCIAL-V1', 'invalido'), b)

    expect(a.statusCode).toBe(403); expect(b.statusCode).toBe(403)
    expect(getStoryContext).not.toHaveBeenCalled(); expect(vision).not.toHaveBeenCalled(); expect(fetchSpy).not.toHaveBeenCalled()
  })
})
