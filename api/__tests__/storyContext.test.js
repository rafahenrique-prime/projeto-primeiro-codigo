// api/__tests__/storyContext.test.js
//
// Etapa 0B (Story Vision Trace) — prova que getStoryContext() classifica
// corretamente os 4 estados de story_context_status. Os testes originais
// (abaixo) provam que, quando a mensagem mais recente TEM sua própria
// metadata de Story, ela sempre vence (prioridade absoluta, nunca mudou).
//
// Correção #3 (2026-09-07, continuidade curta) — describe separado no final
// do arquivo — prova a NOVA regra: quando a mensagem mais recente NÃO tem
// metadata própria, mas é curta (1 a 3 palavras) e está a até 5 minutos de
// um Story anterior válido, reaproveita esse Story (o mais próximo, nunca um
// mais antigo se houver um mais recente também dentro da janela).

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

  it('FOUND — imagem reenviada pelo cliente vira contexto visual atual para Vision/JEV', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([
      { role: 'user', time: 100, text: 'Quanto esse?', metadata: { storyId: 'story-oculos', storyMediaUrl: 'https://gpt-files.com/story-oculos.jpg', storyMediaType: 'image/jpeg' } },
      { role: 'assistant', time: 150, text: 'Pode reenviar a foto?' },
      { role: 'user', time: 200, type: 'IMAGE', text: '', metadata: {}, imageUrl: 'https://gpt-files.com/foto-reenviada.jpg' },
    ])))

    const { getStoryContext } = await import('../_storyContext.js')
    const resultado = await getStoryContext('chat-image-reupload')

    expect(resultado).toEqual({
      status: 'FOUND',
      storyId: null,
      storyMediaUrl: 'https://gpt-files.com/foto-reenviada.jpg',
      storyMediaType: 'image',
      source: 'user_image',
    })
  })

  it('não aceita URL externa como imagem visual confiável', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([
      { role: 'user', time: 100, type: 'IMAGE', text: '', metadata: {}, imageUrl: 'https://example.com/foto.jpg' },
    ])))

    const { getStoryContext } = await import('../_storyContext.js')
    const resultado = await getStoryContext('chat-external-image')

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

describe('api/_storyContext.js — Correção #3 (continuidade curta de Story)', () => {
  const BASE = 1_700_000_000_000 // qualquer epoch fixo, só precisa ser consistente entre os testes
  const MIN = 60_000

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV }
    process.env.VITE_GPTMAKER_TOKEN = 'fixture-token'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    process.env = { ...ORIGINAL_ENV }
  })

  it('exporta as constantes esperadas (janela 5min, máximo 3 palavras)', async () => {
    const { STORY_CONTINUATION_WINDOW_MS, STORY_CONTINUATION_MAX_WORDS } = await import('../_storyContext.js')
    expect(STORY_CONTINUATION_WINDOW_MS).toBe(5 * MIN)
    expect(STORY_CONTINUATION_MAX_WORDS).toBe(3)
  })

  it('CTX-STORY-01) Story Bermuda + "Qual valor?" + "Bermuda" (1 palavra) 4min depois → reutiliza o Story', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([
      { role: 'user', time: BASE, text: 'Qual valor?', metadata: { storyId: 'story-bermuda', storyMediaUrl: 'https://gpt-files.com/bermuda.jpg', storyMediaType: 'image' } },
      { role: 'assistant', time: BASE + 5_000 },
      { role: 'user', time: BASE + 4 * MIN, text: 'Bermuda', metadata: null },
    ])))

    const { getStoryContext } = await import('../_storyContext.js')
    const resultado = await getStoryContext('chat-ctx-story-01')

    expect(resultado).toEqual({
      status: 'FOUND',
      storyId: 'story-bermuda',
      storyMediaUrl: 'https://gpt-files.com/bermuda.jpg',
      storyMediaType: 'image',
    })
  })

  it('CTX-STORY-02) Story New Balance + "Qual valor?" + "cinza" (1 palavra) dentro da janela → reutiliza o Story', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([
      { role: 'user', time: BASE, text: 'Qual valor?', metadata: { storyId: 'story-nb', storyMediaUrl: 'https://gpt-files.com/nb.jpg', storyMediaType: 'image' } },
      { role: 'user', time: BASE + 2 * MIN, text: 'cinza', metadata: null },
    ])))

    const { getStoryContext } = await import('../_storyContext.js')
    const resultado = await getStoryContext('chat-ctx-story-02')

    expect(resultado.status).toBe('FOUND')
    expect(resultado.storyId).toBe('story-nb')
  })

  it('CTX-STORY-03) Story + "tem 42?" (2 palavras) dentro da janela → reutiliza o Story', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([
      { role: 'user', time: BASE, text: 'Manda foto', metadata: { storyId: 'story-tenis', storyMediaUrl: 'https://gpt-files.com/tenis.jpg', storyMediaType: 'image' } },
      { role: 'user', time: BASE + MIN, text: 'tem 42?', metadata: null },
    ])))

    const { getStoryContext } = await import('../_storyContext.js')
    const resultado = await getStoryContext('chat-ctx-story-03')

    expect(resultado.status).toBe('FOUND')
    expect(resultado.storyId).toBe('story-tenis')
  })

  it('CTX-STORY-04) Story + mensagem curta, mas mais de 5min depois → NÃO reutiliza', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([
      { role: 'user', time: BASE, text: 'Qual valor?', metadata: { storyId: 'story-bermuda', storyMediaUrl: 'https://gpt-files.com/bermuda.jpg' } },
      { role: 'user', time: BASE + 5 * MIN + 1_000, text: 'Bermuda', metadata: null }, // 5min01s depois
    ])))

    const { getStoryContext } = await import('../_storyContext.js')
    const resultado = await getStoryContext('chat-ctx-story-04')

    expect(resultado).toEqual({ status: 'NO_STORY_IN_LATEST_MESSAGE' })
  })

  it('CTX-STORY-05) Story antigo A, depois Story novo B, depois mensagem curta → usa B (o mais próximo), mesmo A estando bem mais longe no tempo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([
      { role: 'user', time: BASE, text: 'Qual valor?', metadata: { storyId: 'story-A-antigo', storyMediaUrl: 'https://gpt-files.com/a.jpg' } }, // bem no passado
      { role: 'user', time: BASE + 100 * MIN, text: 'Quanto custa?', metadata: { storyId: 'story-B-novo', storyMediaUrl: 'https://gpt-files.com/b.jpg', storyMediaType: 'image' } },
      { role: 'user', time: BASE + 100 * MIN + 2 * MIN, text: 'esse', metadata: null },
    ])))

    const { getStoryContext } = await import('../_storyContext.js')
    const resultado = await getStoryContext('chat-ctx-story-05')

    expect(resultado.status).toBe('FOUND')
    expect(resultado.storyId).toBe('story-B-novo')
  })

  it('CTX-STORY-06) sem Story em nenhuma mensagem → NO_STORY_IN_LATEST_MESSAGE, com ou sem mensagem curta', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([
      { role: 'user', time: BASE, text: 'oi', metadata: null },
      { role: 'user', time: BASE + MIN, text: 'tem bermuda?', metadata: null },
    ])))

    const { getStoryContext } = await import('../_storyContext.js')
    const resultado = await getStoryContext('chat-ctx-story-06')

    expect(resultado).toEqual({ status: 'NO_STORY_IN_LATEST_MESSAGE' })
  })

  it('CTX-STORY-07) Story + mensagem LONGA dentro da janela (>3 palavras) → NÃO reutiliza', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([
      { role: 'user', time: BASE, text: 'Qual valor?', metadata: { storyId: 'story-bermuda', storyMediaUrl: 'https://gpt-files.com/bermuda.jpg' } },
      { role: 'user', time: BASE + MIN, text: 'Vocês têm tênis Nike disponível hoje?', metadata: null }, // 6 palavras
    ])))

    const { getStoryContext } = await import('../_storyContext.js')
    const resultado = await getStoryContext('chat-ctx-story-07')

    expect(resultado).toEqual({ status: 'NO_STORY_IN_LATEST_MESSAGE' })
  })

  it('CTX-STORY-08) Story + texto vazio/ausente dentro da janela → NÃO reutiliza', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([
      { role: 'user', time: BASE, text: 'Qual valor?', metadata: { storyId: 'story-bermuda', storyMediaUrl: 'https://gpt-files.com/bermuda.jpg' } },
      { role: 'user', time: BASE + MIN, text: '', metadata: null },
    ])))
    const { getStoryContext } = await import('../_storyContext.js')
    expect(await getStoryContext('chat-ctx-story-08a')).toEqual({ status: 'NO_STORY_IN_LATEST_MESSAGE' })

    vi.resetModules()
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([
      { role: 'user', time: BASE, text: 'Qual valor?', metadata: { storyId: 'story-bermuda', storyMediaUrl: 'https://gpt-files.com/bermuda.jpg' } },
      { role: 'user', time: BASE + MIN, metadata: null }, // sem campo text nenhum
    ])))
    const { getStoryContext: getStoryContext2 } = await import('../_storyContext.js')
    expect(await getStoryContext2('chat-ctx-story-08b')).toEqual({ status: 'NO_STORY_IN_LATEST_MESSAGE' })
  })

  it('CTX-STORY-09) mensagem mais recente já tem metadata própria → usa o Story ATUAL imediatamente, independente da heurística de continuidade', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([
      { role: 'user', time: BASE, text: 'Qual valor?', metadata: { storyId: 'story-antigo', storyMediaUrl: 'https://gpt-files.com/antigo.jpg' } },
      // mensagem mais recente tem SUA PRÓPRIA metadata — mesmo sendo curta, prioridade absoluta é dela, nunca da anterior
      { role: 'user', time: BASE + MIN, text: 'oi', metadata: { storyId: 'story-atual', storyMediaUrl: 'https://gpt-files.com/atual.jpg', storyMediaType: 'image' } },
    ])))

    const { getStoryContext } = await import('../_storyContext.js')
    const resultado = await getStoryContext('chat-ctx-story-09')

    expect(resultado).toEqual({
      status: 'FOUND',
      storyId: 'story-atual',
      storyMediaUrl: 'https://gpt-files.com/atual.jpg',
      storyMediaType: 'image',
    })
  })

  it('CTX-STORY-10) dois Stories anteriores, AMBOS dentro da janela → usa o mais recente dos dois (B), não o mais antigo (A)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([
      { role: 'user', time: BASE, text: 'Qual valor?', metadata: { storyId: 'story-A', storyMediaUrl: 'https://gpt-files.com/a.jpg' } },
      { role: 'user', time: BASE + 4 * MIN, text: 'Qual valor?', metadata: { storyId: 'story-B', storyMediaUrl: 'https://gpt-files.com/b.jpg', storyMediaType: 'image' } },
      { role: 'user', time: BASE + 4 * MIN + 1 * MIN, text: 'esse', metadata: null }, // 1min depois de B, 5min depois de A — ambos tecnicamente <=5min de A e B respectivamente
    ])))

    const { getStoryContext } = await import('../_storyContext.js')
    const resultado = await getStoryContext('chat-ctx-story-10')

    expect(resultado.status).toBe('FOUND')
    expect(resultado.storyId).toBe('story-B')
  })

  // Reforço final (2026-09-07) — fecha as 3 lacunas de cobertura apontadas no
  // gate: boundary exato em ms, whitespace-only, e independência de ordem no
  // array. Nenhuma mudança de lógica de produção — só testes novos.

  it('BOUNDARY) gap de exatamente 300000ms (5min) → ainda reutiliza (limite é <=, não <)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([
      { role: 'user', time: BASE, text: 'Qual valor?', metadata: { storyId: 'story-boundary', storyMediaUrl: 'https://gpt-files.com/boundary.jpg', storyMediaType: 'image' } },
      { role: 'user', time: BASE + 300_000, text: 'Bermuda', metadata: null }, // exatamente 5*60*1000
    ])))

    const { getStoryContext } = await import('../_storyContext.js')
    const resultado = await getStoryContext('chat-ctx-story-boundary-exact')

    expect(resultado).toEqual({
      status: 'FOUND',
      storyId: 'story-boundary',
      storyMediaUrl: 'https://gpt-files.com/boundary.jpg',
      storyMediaType: 'image',
    })
  })

  it('BOUNDARY) gap de 300001ms (5min + 1ms) → NÃO reutiliza', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([
      { role: 'user', time: BASE, text: 'Qual valor?', metadata: { storyId: 'story-boundary', storyMediaUrl: 'https://gpt-files.com/boundary.jpg' } },
      { role: 'user', time: BASE + 300_001, text: 'Bermuda', metadata: null }, // 5*60*1000 + 1
    ])))

    const { getStoryContext } = await import('../_storyContext.js')
    const resultado = await getStoryContext('chat-ctx-story-boundary-over')

    expect(resultado).toEqual({ status: 'NO_STORY_IN_LATEST_MESSAGE' })
  })

  it('WHITESPACE) latest.text = "   " (só espaços) → 0 palavras, NÃO reutiliza', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([
      { role: 'user', time: BASE, text: 'Qual valor?', metadata: { storyId: 'story-bermuda', storyMediaUrl: 'https://gpt-files.com/bermuda.jpg' } },
      { role: 'user', time: BASE + MIN, text: '   ', metadata: null },
    ])))

    const { getStoryContext } = await import('../_storyContext.js')
    const resultado = await getStoryContext('chat-ctx-story-whitespace')

    expect(resultado).toEqual({ status: 'NO_STORY_IN_LATEST_MESSAGE' })
  })

  it('ORDEM) array retornado fora de ordem cronológica (latest, Story A, Story B) → seleção depende só de .time, nunca da posição — usa Story B (o mais recente)', async () => {
    const storyA = { role: 'user', time: BASE + 1_000, text: 'Qual valor?', metadata: { storyId: 'story-A', storyMediaUrl: 'https://gpt-files.com/a.jpg' } }
    const storyB = { role: 'user', time: BASE + 2_000, text: 'Qual valor?', metadata: { storyId: 'story-B', storyMediaUrl: 'https://gpt-files.com/b.jpg', storyMediaType: 'image' } }
    const latest = { role: 'user', time: BASE + 2_500, text: 'esse', metadata: null }

    // Propositalmente fora de ordem: latest primeiro, depois A, depois B —
    // se a seleção dependesse de índice/posição no array (ex.: pegar o
    // último elemento, ou o penúltimo), este teste pegaria isso.
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([latest, storyA, storyB])))

    const { getStoryContext } = await import('../_storyContext.js')
    const resultado = await getStoryContext('chat-ctx-story-out-of-order')

    expect(resultado.status).toBe('FOUND')
    expect(resultado.storyId).toBe('story-B')
    expect(resultado.storyMediaUrl).toBe('https://gpt-files.com/b.jpg')
  })
})
