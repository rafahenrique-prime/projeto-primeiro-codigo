// api/__tests__/storyContext.test.js
//
// Etapa 0B (Story Vision Trace) — prova que getStoryContext() classifica
// corretamente os 4 estados de story_context_status SEM mudar a seleção de
// mensagem existente (sempre a mensagem role=user de maior `time`). Nenhum
// destes testes corrige o comportamento "pega só a última mensagem" — só
// prova que a classificação de status é honesta em cada cenário.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const ORIGINAL_ENV = { ...process.env }

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => body,
  }
}

describe('api/_storyContext.js — story_context_status (Etapa 0B)', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV }
    process.env.VITE_GPTMAKER_TOKEN = 'fixture-token'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    process.env = { ...ORIGINAL_ENV }
  })

  it('NO_STORY_IN_LATEST_MESSAGE — última mensagem de usuário sem metadata de Story', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([
      { role: 'user', time: 100, metadata: null },
      { role: 'assistant', time: 150 },
      { role: 'user', time: 200, metadata: { foo: 'bar' } }, // mais recente, sem storyId/storyMediaUrl
    ])))

    const { getStoryContext } = await import('../_storyContext.js')
    const resultado = await getStoryContext('chat-fixture-1')

    expect(resultado).toEqual({ status: 'NO_STORY_IN_LATEST_MESSAGE' })
  })

  it('NO_STORY_IN_LATEST_MESSAGE — nenhuma mensagem de usuário na conversa', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([
      { role: 'assistant', time: 100 },
      { role: 'system', time: 200 },
    ])))

    const { getStoryContext } = await import('../_storyContext.js')
    const resultado = await getStoryContext('chat-fixture-2')

    expect(resultado).toEqual({ status: 'NO_STORY_IN_LATEST_MESSAGE' })
  })

  it('NO_STORY_IN_LATEST_MESSAGE — array de mensagens vazio', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([])))

    const { getStoryContext } = await import('../_storyContext.js')
    const resultado = await getStoryContext('chat-fixture-3')

    expect(resultado).toEqual({ status: 'NO_STORY_IN_LATEST_MESSAGE' })
  })

  it('FOUND — última mensagem de usuário tem storyId + storyMediaUrl (webhook decide depois se Vision teve sucesso ou falhou)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([
      { role: 'user', time: 100, metadata: { storyId: 'story-antigo', storyMediaUrl: 'https://gpt-files.com/antigo.jpg' } },
      { role: 'user', time: 200, metadata: { storyId: 'story-novo', storyMediaUrl: 'https://gpt-files.com/novo.jpg', storyMediaType: 'image' } },
    ])))

    const { getStoryContext } = await import('../_storyContext.js')
    const resultado = await getStoryContext('chat-fixture-4')

    // Prova que a seleção continua sendo a de MAIOR time (story-novo), nunca a mais antiga.
    expect(resultado).toEqual({
      status: 'FOUND',
      storyId: 'story-novo',
      storyMediaUrl: 'https://gpt-files.com/novo.jpg',
      storyMediaType: 'image',
    })
  })

  it('GPTMAKER_FETCH_ERROR — HTTP não-200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))

    const { getStoryContext } = await import('../_storyContext.js')
    const resultado = await getStoryContext('chat-fixture-5')

    expect(resultado).toEqual({ status: 'GPTMAKER_FETCH_ERROR' })
  })

  it('GPTMAKER_FETCH_ERROR — timeout (AbortError)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise((_resolve, reject) => {
      // Simula abort disparado pelo AbortController interno — nunca resolve por si.
      const err = new Error('The operation was aborted')
      err.name = 'AbortError'
      setTimeout(() => reject(err), 5)
    })))

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { getStoryContext } = await import('../_storyContext.js')
    const resultado = await getStoryContext('chat-fixture-6')

    expect(resultado).toEqual({ status: 'GPTMAKER_FETCH_ERROR' })
    expect(warnSpy).toHaveBeenCalled()
    // Nunca loga o token nem a URL/chatId na mensagem de warn.
    const mensagensLogadas = warnSpy.mock.calls.map((args) => JSON.stringify(args))
    expect(mensagensLogadas.join(' ')).not.toContain('fixture-token')
    expect(mensagensLogadas.join(' ')).not.toContain('chat-fixture-6')

    warnSpy.mockRestore()
  })

  it('GPTMAKER_FETCH_ERROR — resposta não é um array', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ erro: 'formato inesperado' })))

    const { getStoryContext } = await import('../_storyContext.js')
    const resultado = await getStoryContext('chat-fixture-7')

    expect(resultado).toEqual({ status: 'GPTMAKER_FETCH_ERROR' })
  })

  it('GPTMAKER_FETCH_ERROR — token do GPT Maker ausente', async () => {
    delete process.env.VITE_GPTMAKER_TOKEN
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const { getStoryContext } = await import('../_storyContext.js')
    const resultado = await getStoryContext('chat-fixture-8')

    expect(resultado).toEqual({ status: 'GPTMAKER_FETCH_ERROR' })
    expect(fetchSpy).not.toHaveBeenCalled() // nem tenta a chamada sem token
  })

  it('NO_STORY_IN_LATEST_MESSAGE — chatId ausente/inválido (defensivo; webhook.js já não chama aqui)', async () => {
    const { getStoryContext } = await import('../_storyContext.js')

    expect(await getStoryContext(null)).toEqual({ status: 'NO_STORY_IN_LATEST_MESSAGE' })
    expect(await getStoryContext('')).toEqual({ status: 'NO_STORY_IN_LATEST_MESSAGE' })
    expect(await getStoryContext(123)).toEqual({ status: 'NO_STORY_IN_LATEST_MESSAGE' })
  })
})
