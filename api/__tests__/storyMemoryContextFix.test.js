// api/__tests__/storyMemoryContextFix.test.js
//
// Correção #2 (Memória histórica × Story atual, 2026-09-06) — prova:
// A. formatMemoryBlock/getMemoryBlock (api/_profileMemory.js): suppressProductFields
//    omite interests/products_asked e preserva size; chamada antiga (sem opções)
//    continua idêntica ao comportamento pré-Correção #2 (retrocompatibilidade);
// B. api/webhook.js: hasCurrentStory é true assim que um Story ATUAL com mídia é
//    confirmado (api/_storyContext.js -> status FOUND + storyMediaUrl) — mesmo
//    que Vision falhe, o parser da query compacta não reconheça nada, ou o
//    matching não encontre candidato confiável (fallback). hasCurrentStory=false
//    quando não há Story nesta mensagem, ou getStoryContext lança erro.
// C. hasCurrentStory é repassado a getMemoryBlock(cliente_id, { suppressProductFields }),
//    nunca isStorySearch (que tem uma brecha: só fica true se a query compacta
//    foi extraída com sucesso — ver Correção #1).
// D. Nada da Correção #1 (extrairQueryCompactaDaVision, threshold, filtro,
//    fallback, busca direta) muda de comportamento.

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
  { id: 1, nome: 'Chinelo Slide Preto', categoria: 'chinelo', preco: 80, imagem: null, link: null },
  { id: 2, nome: 'Cueca Lup 002', categoria: 'cueca', preco: 59, imagem: null, link: null },
]

describe('Correção #2 — api/_profileMemory.js (formatMemoryBlock via getMemoryBlock)', () => {
  const CONTEXT_ID = 'ctx-abc-123'
  let fetchSpy

  beforeEach(() => {
    vi.resetModules()
    process.env.VITE_SUPABASE_URL = 'https://fixture.supabase.co'
    process.env.VITE_SUPABASE_KEY = 'fixture-anon-key'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function mockProfile(profile) {
    fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((url) => {
      if (String(url).includes('context_id=eq.')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(profile ? [profile] : []) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    })
  }

  it('sem opções (chamada antiga) — comportamento idêntico ao pré-Correção #2: size + interests + products_asked', async () => {
    mockProfile({ size: 'M', interests: ['cueca', 'nike'], products_asked: ['Cueca Lup 002'] })
    const { getMemoryBlock } = await import('../_profileMemory.js')

    const bloco = await getMemoryBlock(CONTEXT_ID)

    expect(bloco).toContain('tamanho: M')
    expect(bloco).toContain('interesses: cueca, nike')
    expect(bloco).toContain('produtos vistos: Cueca Lup 002')
  })

  it('suppressProductFields=true — omite interests e products_asked, mantém size', async () => {
    mockProfile({ size: 'M', interests: ['cueca', 'nike'], products_asked: ['Cueca Lup 002'] })
    const { getMemoryBlock } = await import('../_profileMemory.js')

    const bloco = await getMemoryBlock(CONTEXT_ID, { suppressProductFields: true })

    expect(bloco).toContain('tamanho: M')
    expect(bloco).not.toContain('interesses')
    expect(bloco).not.toContain('cueca')
    expect(bloco).not.toContain('produtos vistos')
    expect(bloco).not.toContain('Cueca Lup 002')
  })

  it('suppressProductFields=true + perfil só com interests/products_asked (sem size) — bloco fica vazio', async () => {
    mockProfile({ size: null, interests: ['cueca'], products_asked: ['Cueca Lup 002'] })
    const { getMemoryBlock } = await import('../_profileMemory.js')

    const bloco = await getMemoryBlock(CONTEXT_ID, { suppressProductFields: true })

    expect(bloco).toBe('')
  })

  it('suppressProductFields=false explícito — comportamento igual ao default', async () => {
    mockProfile({ size: 'G', interests: ['vans'], products_asked: [] })
    const { getMemoryBlock } = await import('../_profileMemory.js')

    const bloco = await getMemoryBlock(CONTEXT_ID, { suppressProductFields: false })

    expect(bloco).toContain('tamanho: G')
    expect(bloco).toContain('interesses: vans')
  })

  it('perfil inexistente — retorna string vazia com ou sem suppressProductFields', async () => {
    mockProfile(null)
    const { getMemoryBlock } = await import('../_profileMemory.js')

    expect(await getMemoryBlock(CONTEXT_ID)).toBe('')
    expect(await getMemoryBlock(CONTEXT_ID, { suppressProductFields: true })).toBe('')
  })

  it('contextId ausente/"desconhecido" — retorna vazio sem chamar fetch, com ou sem opções', async () => {
    fetchSpy = vi.spyOn(global, 'fetch')
    const { getMemoryBlock } = await import('../_profileMemory.js')

    expect(await getMemoryBlock(null)).toBe('')
    expect(await getMemoryBlock('desconhecido', { suppressProductFields: true })).toBe('')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('Correção #2 — comportamento end-to-end via api/webhook.js (hasCurrentStory)', () => {
  let memoryBlockSpy

  beforeEach(() => {
    vi.resetModules()
    process.env.VITE_SUPABASE_URL = 'https://fixture.supabase.co'
    process.env.VITE_SUPABASE_KEY = 'fixture-anon-key'

    vi.doMock('../_profileIdentity.js', () => ({ upsertIdentity: vi.fn(() => Promise.resolve()) }))
    vi.doMock('../_gabrielaContextService.js', () => ({
      fetchProductsCatalog: vi.fn(() => Promise.resolve({ ok: true, products: CATALOGO_FIXTURE })),
      fetchGabrielaKnowledge: vi.fn(() => Promise.resolve({ ok: true, knowledge: null })),
      formatarProdutoComercial: vi.fn(() => ({})),
    }))

    memoryBlockSpy = vi.fn(() => Promise.resolve(''))
    vi.doMock('../_profileMemory.js', () => ({ getMemoryBlock: memoryBlockSpy }))

    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.doUnmock('../_profileIdentity.js')
    vi.doUnmock('../_gabrielaContextService.js')
    vi.doUnmock('../_profileMemory.js')
    vi.doUnmock('../_storyContext.js')
    vi.doUnmock('../_visaoProduto.js')
    vi.restoreAllMocks()
  })

  it('CTX-MEM-01) Story atual + Vision success + parser OK → hasCurrentStory=true repassado a getMemoryBlock', async () => {
    vi.doMock('../_storyContext.js', () => ({
      getStoryContext: vi.fn(() => Promise.resolve({
        status: 'FOUND', storyId: 'story-1', storyMediaUrl: 'https://gpt-files.com/chinelo.jpg', storyMediaType: 'image',
      })),
    }))
    vi.doMock('../_visaoProduto.js', () => ({
      identificarProdutoPorImagem: vi.fn(() => Promise.resolve('## Chinelo Slide Preto\n**Tipo:** chinelo')),
    }))

    const { default: handler } = await import('../webhook.js')
    await handler(makeReq({ pergunta: 'Qual valor?', cliente_id: 'ctx-1', chat_id: 'chat-1' }), makeRes())

    expect(memoryBlockSpy).toHaveBeenCalledWith('ctx-1', { suppressProductFields: true })
  })

  it('CTX-MEM-01b) Story atual presente, mas Vision FALHA → hasCurrentStory continua true (gap identificado no gate)', async () => {
    vi.doMock('../_storyContext.js', () => ({
      getStoryContext: vi.fn(() => Promise.resolve({
        status: 'FOUND', storyId: 'story-2', storyMediaUrl: 'https://gpt-files.com/chinelo.jpg', storyMediaType: 'image',
      })),
    }))
    vi.doMock('../_visaoProduto.js', () => ({
      identificarProdutoPorImagem: vi.fn(() => Promise.resolve(null)), // Vision falhou
    }))

    const { default: handler } = await import('../webhook.js')
    await handler(makeReq({ pergunta: 'Qual valor?', cliente_id: 'ctx-2', chat_id: 'chat-2' }), makeRes())

    expect(memoryBlockSpy).toHaveBeenCalledWith('ctx-2', { suppressProductFields: true })
  }, 15000)

  it('CTX-MEM-01c) Story atual presente, parser não reconhece Nome/Tipo/Marca → hasCurrentStory continua true', async () => {
    vi.doMock('../_storyContext.js', () => ({
      getStoryContext: vi.fn(() => Promise.resolve({
        status: 'FOUND', storyId: 'story-3', storyMediaUrl: 'https://gpt-files.com/chinelo.jpg', storyMediaType: 'image',
      })),
    }))
    vi.doMock('../_visaoProduto.js', () => ({
      // Sem "## ", sem **Tipo:**, sem **Marca:** — extrairQueryCompactaDaVision() retorna ''
      identificarProdutoPorImagem: vi.fn(() => Promise.resolve('Não consegui identificar o produto nesta imagem.')),
    }))

    const { default: handler } = await import('../webhook.js')
    await handler(makeReq({ pergunta: 'Qual valor?', cliente_id: 'ctx-3', chat_id: 'chat-3' }), makeRes())

    expect(memoryBlockSpy).toHaveBeenCalledWith('ctx-3', { suppressProductFields: true })
  }, 15000)

  it('CTX-MEM-02) SEM Story nesta mensagem, cliente pergunta "tem cueca?" → hasCurrentStory=false, busca direta funciona normalmente', async () => {
    vi.doMock('../_storyContext.js', () => ({
      getStoryContext: vi.fn(() => Promise.resolve({ status: 'NO_STORY_IN_LATEST_MESSAGE', storyMediaUrl: null })),
    }))
    vi.doMock('../_visaoProduto.js', () => ({ identificarProdutoPorImagem: vi.fn() }))

    const { default: handler } = await import('../webhook.js')
    const res = makeRes()
    await handler(makeReq({ pergunta: 'tem cueca?', cliente_id: 'ctx-4', chat_id: 'chat-4' }), res)

    expect(memoryBlockSpy).toHaveBeenCalledWith('ctx-4', { suppressProductFields: false })
    expect(res.body.dados.produtos.some((p) => p.nome === 'Cueca Lup 002')).toBe(true)
  })

  it('CTX-MEM-03) SEM Story, continuação curta ("tem no 42?") → hasCurrentStory=false, memória permanece igual ao comportamento anterior', async () => {
    vi.doMock('../_storyContext.js', () => ({
      getStoryContext: vi.fn(() => Promise.resolve({ status: 'NO_STORY_IN_LATEST_MESSAGE', storyMediaUrl: null })),
    }))
    vi.doMock('../_visaoProduto.js', () => ({ identificarProdutoPorImagem: vi.fn() }))

    const { default: handler } = await import('../webhook.js')
    await handler(makeReq({ pergunta: 'tem no 42?', cliente_id: 'ctx-5', chat_id: 'chat-5' }), makeRes())

    expect(memoryBlockSpy).toHaveBeenCalledWith('ctx-5', { suppressProductFields: false })
  }, 15000)

  it('CTX-MEM-04) memória antiga de tênis + novo Story de chinelo → produto histórico suprimido, size preservado (por _profileMemory.js, já provado acima) — aqui confirma o sinal correto chega', async () => {
    vi.doMock('../_storyContext.js', () => ({
      getStoryContext: vi.fn(() => Promise.resolve({
        status: 'FOUND', storyId: 'story-6', storyMediaUrl: 'https://gpt-files.com/chinelo.jpg', storyMediaType: 'image',
      })),
    }))
    vi.doMock('../_visaoProduto.js', () => ({
      identificarProdutoPorImagem: vi.fn(() => Promise.resolve('## Chinelo Slide Preto\n**Tipo:** chinelo')),
    }))

    const { default: handler } = await import('../webhook.js')
    await handler(makeReq({ pergunta: 'Qual valor?', cliente_id: 'ctx-6', chat_id: 'chat-6' }), makeRes())

    expect(memoryBlockSpy).toHaveBeenCalledWith('ctx-6', { suppressProductFields: true })
  })

  it('CTX-MEM-05) getStoryContext lança erro (GPTMAKER_FETCH_ERROR) → hasCurrentStory=false, memória NÃO suprimida (conservador)', async () => {
    vi.doMock('../_storyContext.js', () => ({
      getStoryContext: vi.fn(() => Promise.reject(new Error('timeout'))),
    }))
    vi.doMock('../_visaoProduto.js', () => ({ identificarProdutoPorImagem: vi.fn() }))

    const { default: handler } = await import('../webhook.js')
    await handler(makeReq({ pergunta: 'Qual valor?', cliente_id: 'ctx-7', chat_id: 'chat-7' }), makeRes())

    expect(memoryBlockSpy).toHaveBeenCalledWith('ctx-7', { suppressProductFields: false })
  }, 15000)

  it('Sem chat_id (sem tentativa de Story) → hasCurrentStory=false, comportamento idêntico a antes', async () => {
    vi.doMock('../_storyContext.js', () => ({ getStoryContext: vi.fn() }))
    vi.doMock('../_visaoProduto.js', () => ({ identificarProdutoPorImagem: vi.fn() }))

    const { default: handler } = await import('../webhook.js')
    await handler(makeReq({ pergunta: 'tem chinelo?', cliente_id: 'ctx-8' }), makeRes())

    expect(memoryBlockSpy).toHaveBeenCalledWith('ctx-8', { suppressProductFields: false })
  })
})
