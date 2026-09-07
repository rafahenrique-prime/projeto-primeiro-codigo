// api/__tests__/storyContinuationMemoryIntegration.test.js
//
// Correção #3 + Correção #2 (integração, 2026-09-07) — prova que um Story
// reaproveitado por continuidade curta (getStoryContext real, sem mock) é
// 100% transparente para api/webhook.js: ele recebe { status: 'FOUND', ... }
// exatamente como um Story próprio, então hasCurrentStory=true continua
// sendo setado (api/webhook.js:503-507) e a Correção #2 continua suprimindo
// interests/products_asked — SEM nenhuma alteração em webhook.js.

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
]

function jsonResponse(body) {
  return { ok: true, status: 200, json: async () => body }
}

describe('Correção #3 — continuidade curta de Story mantém hasCurrentStory=true (Correção #2)', () => {
  let memoryBlockSpy
  const BASE = 1_700_000_000_000
  const MIN = 60_000

  beforeEach(() => {
    vi.resetModules()
    process.env.VITE_SUPABASE_URL = 'https://fixture.supabase.co'
    process.env.VITE_SUPABASE_KEY = 'fixture-anon-key'
    process.env.VITE_GPTMAKER_TOKEN = 'fixture-gptmaker-token'

    vi.doMock('../_profileIdentity.js', () => ({ upsertIdentity: vi.fn(() => Promise.resolve()) }))
    vi.doMock('../_gabrielaContextService.js', () => ({
      fetchProductsCatalog: vi.fn(() => Promise.resolve({ ok: true, products: CATALOGO_FIXTURE })),
      fetchGabrielaKnowledge: vi.fn(() => Promise.resolve({ ok: true, knowledge: null })),
      formatarProdutoComercial: vi.fn(() => ({})),
    }))
    vi.doMock('../_visaoProduto.js', () => ({
      identificarProdutoPorImagem: vi.fn(() => Promise.resolve('## Bermuda Jeans Azul\n**Tipo:** bermuda')),
    }))

    memoryBlockSpy = vi.fn(() => Promise.resolve(''))
    vi.doMock('../_profileMemory.js', () => ({ getMemoryBlock: memoryBlockSpy }))

    // _storyContext.js NÃO é mockado — é o código real da Correção #3.
    // Só o fetch do GPT Maker (consumido por _storyContext.js) é stubado.
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('api.gptmaker.ai')) {
        return jsonResponse([
          { role: 'user', time: BASE, text: 'Qual valor?', metadata: { storyId: 'story-bermuda', storyMediaUrl: 'https://gpt-files.com/bermuda.jpg', storyMediaType: 'image' } },
          { role: 'user', time: BASE + 3 * MIN, text: 'Bermuda', metadata: null },
        ])
      }
      return jsonResponse([])
    }))

    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.doUnmock('../_profileIdentity.js')
    vi.doUnmock('../_gabrielaContextService.js')
    vi.doUnmock('../_visaoProduto.js')
    vi.doUnmock('../_profileMemory.js')
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('Story reaproveitado por continuidade (getStoryContext real) → hasCurrentStory=true → interests/products_asked suprimidos', async () => {
    const { default: handler } = await import('../webhook.js')
    await handler(makeReq({ pergunta: 'Bermuda', cliente_id: 'ctx-continuidade-1', chat_id: 'chat-continuidade-1' }), makeRes())

    // getStoryContext real reaproveitou o Story anterior (mesma mensagem "Qual
    // valor?" que carregava a metadata) — webhook.js não sabe (nem precisa
    // saber) que foi continuidade; trata como Story normal.
    expect(memoryBlockSpy).toHaveBeenCalledWith('ctx-continuidade-1', { suppressProductFields: true })
  })
})
