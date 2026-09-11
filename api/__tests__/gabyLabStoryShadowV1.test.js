import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

function makeRes() {
  const res = { statusCode: null, body: null }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (payload) => { res.body = payload; return res }
  return res
}

function makeReq(body, labHeader = 'GABY-LAB-COMERCIAL-V1', labMode = 'story-shadow-v1') {
  return {
    method: 'POST',
    body,
    headers: { 'x-prime-lab': labHeader, 'x-prime-lab-mode': labMode },
  }
}

function shadowResponse(produtos, total = produtos.length) {
  return {
    sucesso: true,
    contexto: {
      pergunta: 'fixture',
      produtos_encontrados: produtos.length,
      tem_produtos: produtos.length > 0,
      total_variacoes: total,
      variacoes_restantes: Math.max(0, total - produtos.length),
      source: 'shadow_v2',
    },
    dados: {
      produtos,
      totalVariacoes: total,
      variacoesRestantes: Math.max(0, total - produtos.length),
      informacao_adicional: 'fixture',
    },
  }
}

function mockShadowFetch(responder) {
  const chamadas = []
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    const body = JSON.parse(options.body)
    chamadas.push(body.pergunta)
    const resposta = responder(body.pergunta, chamadas.length)
    return { ok: true, status: 200, json: async () => resposta }
  }))
  return chamadas
}

describe('GABY LAB Story + Shadow V2 — helper privado', () => {
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

  it('sem chat_id: consulta Shadow V2 com a pergunta original e não chama Vision', async () => {
    const getStoryContext = vi.fn()
    const identificarProdutoPorImagem = vi.fn()
    vi.doMock('../_storyContext.js', () => ({ getStoryContext }))
    vi.doMock('../_visaoProduto.js', () => ({ identificarProdutoPorImagem }))
    const chamadas = mockShadowFetch(() => shadowResponse([{ nome: 'Tenis New Balance 9060 Azul', relevancia: 172 }], 42))

    const { runGabyLabStoryShadow, __resetStoryLabCacheForTests } = await import('../../lib/gabyLabStoryShadow.js')
    __resetStoryLabCacheForTests()
    const res = makeRes()
    await runGabyLabStoryShadow(makeReq({ pergunta: 'New Balance 9060' }), res)

    expect(res.statusCode).toBe(200)
    expect(chamadas).toEqual(['New Balance 9060'])
    expect(getStoryContext).not.toHaveBeenCalled()
    expect(identificarProdutoPorImagem).not.toHaveBeenCalled()
    expect(res.body.contexto.source).toBe('shadow_v2_story_lab')
  })

  it('Story: Vision vira query compacta, consulta Shadow V2 e preserva a pergunta literal do cliente', async () => {
    vi.doMock('../_storyContext.js', () => ({
      getStoryContext: vi.fn(() => Promise.resolve({
        status: 'FOUND', storyId: 'story-diesel', storyMediaUrl: 'https://gpt-files.com/diesel.jpg', storyMediaType: 'image',
      })),
    }))
    const vision = vi.fn(() => Promise.resolve(
      '## Calça Skinny com Elastano\n**Tipo:** Calça Jeans\n**Marca:** Diesel\n**Cor:** Cinza Escuro'
    ))
    vi.doMock('../_visaoProduto.js', () => ({ identificarProdutoPorImagem: vision }))
    const chamadas = mockShadowFetch(() => shadowResponse([{ nome: 'Calça Jeans Diesel 009', relevancia: 57 }], 83))

    const { runGabyLabStoryShadow, __resetStoryLabCacheForTests } = await import('../../lib/gabyLabStoryShadow.js')
    __resetStoryLabCacheForTests()
    const res = makeRes()
    await runGabyLabStoryShadow(makeReq({ pergunta: 'qual valor?', chat_id: 'chat-diesel' }), res)

    expect(res.statusCode).toBe(200)
    expect(chamadas).toEqual(['Calça Skinny com Elastano Calça Jeans Diesel'])
    expect(vision).toHaveBeenCalledTimes(1)
    expect(res.body.contexto.pergunta).toBe('qual valor?')
    expect(res.body.contexto.story_lab.search_context_used).toBe('story')
    expect(res.body.contexto.story_lab.story_match_threshold).toBe(25)
    expect(res.body.dados.produtos).toHaveLength(1)
  })

  it('continuação do mesmo story_id reaproveita cache e chama Vision só uma vez', async () => {
    vi.doMock('../_storyContext.js', () => ({
      getStoryContext: vi.fn(() => Promise.resolve({
        status: 'FOUND', storyId: 'story-mesmo', storyMediaUrl: 'https://gpt-files.com/bermuda.jpg', storyMediaType: 'image',
      })),
    }))
    const vision = vi.fn(() => Promise.resolve('## Bermuda Jeans Diesel\n**Tipo:** Bermuda\n**Marca:** Diesel'))
    vi.doMock('../_visaoProduto.js', () => ({ identificarProdutoPorImagem: vision }))
    const chamadas = mockShadowFetch(() => shadowResponse([{ nome: 'Bermuda Diesel Jeans', relevancia: 54 }], 39))

    const { runGabyLabStoryShadow, __resetStoryLabCacheForTests } = await import('../../lib/gabyLabStoryShadow.js')
    __resetStoryLabCacheForTests()

    const primeira = makeRes()
    await runGabyLabStoryShadow(makeReq({ pergunta: 'qual valor?', chat_id: 'chat-1' }), primeira)
    const segunda = makeRes()
    await runGabyLabStoryShadow(makeReq({ pergunta: 'tem 42?', chat_id: 'chat-1' }), segunda)

    expect(vision).toHaveBeenCalledTimes(1)
    expect(chamadas).toHaveLength(2)
    expect(segunda.body.contexto.story_lab.cache_status).toBe('hit')
    expect(segunda.body.contexto.story_lab.vision_status).toBe('cache_hit')
    expect(segunda.body.contexto.pergunta).toBe('tem 42?')
  })

  it('match visual abaixo de 25 faz fallback e não cacheia o erro', async () => {
    vi.doMock('../_storyContext.js', () => ({
      getStoryContext: vi.fn(() => Promise.resolve({
        status: 'FOUND', storyId: 'story-fraco', storyMediaUrl: 'https://gpt-files.com/fraco.jpg', storyMediaType: 'image',
      })),
    }))
    const vision = vi.fn(() => Promise.resolve('## Produto Inexistente Xyz\n**Tipo:** Eletronico\n**Marca:** MarcaXyz'))
    vi.doMock('../_visaoProduto.js', () => ({ identificarProdutoPorImagem: vision }))
    const chamadas = mockShadowFetch((_query, numero) => numero % 2 === 1
      ? shadowResponse([{ nome: 'Phantom Parfum 100ml', relevancia: 6 }], 1)
      : shadowResponse([{ nome: 'Bermuda Diesel Jeans', relevancia: 40 }], 1))

    const { runGabyLabStoryShadow, __resetStoryLabCacheForTests } = await import('../../lib/gabyLabStoryShadow.js')
    __resetStoryLabCacheForTests()

    const primeira = makeRes()
    await runGabyLabStoryShadow(makeReq({ pergunta: 'bermuda diesel', chat_id: 'chat-fraco' }), primeira)
    const segunda = makeRes()
    await runGabyLabStoryShadow(makeReq({ pergunta: 'bermuda diesel', chat_id: 'chat-fraco' }), segunda)

    expect(chamadas).toEqual([
      'Produto Inexistente Xyz Eletronico MarcaXyz', 'bermuda diesel',
      'Produto Inexistente Xyz Eletronico MarcaXyz', 'bermuda diesel',
    ])
    expect(vision).toHaveBeenCalledTimes(2)
    expect(primeira.body.contexto.story_lab.fallback_used).toBe(true)
    expect(primeira.body.contexto.story_lab.search_context_used).toBe('story_fallback_pergunta')
  })

  it('qualquer falha em uma das duas travas LAB bloqueia antes de Story/Vision/Shadow', async () => {
    const getStoryContext = vi.fn()
    const identificarProdutoPorImagem = vi.fn()
    vi.doMock('../_storyContext.js', () => ({ getStoryContext }))
    vi.doMock('../_visaoProduto.js', () => ({ identificarProdutoPorImagem }))
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const { runGabyLabStoryShadow } = await import('../../lib/gabyLabStoryShadow.js')

    const headerErrado = makeRes()
    await runGabyLabStoryShadow(makeReq({ pergunta: 'New Balance 9060' }, 'header-invalido'), headerErrado)
    expect(headerErrado.statusCode).toBe(403)

    const modoErrado = makeRes()
    await runGabyLabStoryShadow(makeReq({ pergunta: 'New Balance 9060' }, 'GABY-LAB-COMERCIAL-V1', 'modo-invalido'), modoErrado)
    expect(modoErrado.statusCode).toBe(403)

    expect(getStoryContext).not.toHaveBeenCalled()
    expect(identificarProdutoPorImagem).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
