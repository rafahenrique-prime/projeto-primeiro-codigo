// api/__tests__/visionTelemetryTrace.test.js
//
// Etapa 0B (Story Vision Trace) — prova que correlation_id/story_id:
// 1. são repassados de identificarProdutoPorImagem() até o INSERT em
//    vision_usage_events quando o chamador passa traceMeta;
// 2. são gravados como null quando o chamador não passa nada (evento antigo
//    / comportamento anterior à Etapa 0B continua funcionando idêntico);
// 3. continuam gerando exatamente 1 INSERT por execução de Vision (nenhuma
//    mudança no padrão fail-open/1-insert já existente).
//
// Mesmo padrão de mock de api/__tests__/visaoProdutoTelemetria.test.js —
// todo I/O externo mockado, nenhuma chamada real.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const ORIGINAL_ENV = { ...process.env }
const STORY_URL_IMAGE = 'https://gpt-files.com/story-fixture.jpg'

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    headers: { get: () => null },
    json: async () => body,
    arrayBuffer: async () => body,
  }
}

describe('Etapa 0B — correlation_id/story_id na telemetria', () => {
  let waitUntilMock
  let insertedRows

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV }
    process.env.VERCEL_URL = 'ignite-prime-fixture.vercel.app'
    process.env.VITE_SUPABASE_URL = 'https://fixture.supabase.co'
    process.env.SUPABASE_SECRET_KEY = 'fixture-secret-key'
    delete process.env.OPENROUTER_API_KEY

    insertedRows = []
    waitUntilMock = vi.fn((promise) => promise)
    vi.doMock('@vercel/functions', () => ({ waitUntil: waitUntilMock }))

    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      const u = String(url)
      if (u.startsWith('https://gpt-files.com/')) {
        return {
          ok: true,
          status: 200,
          headers: { get: (h) => (h === 'content-type' ? 'image/jpeg' : null) },
          arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        }
      }
      if (u.includes('/api/system-tools?tool=ocr-openrouter')) {
        return jsonResponse({
          id: 'gen-fixture-trace',
          choices: [{ message: { content: '## Produto Fixture' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        })
      }
      if (u.includes('fixture.supabase.co/rest/v1/vision_usage_events')) {
        insertedRows.push(JSON.parse(init?.body || '{}'))
        return { ok: true, status: 201 }
      }
      throw new Error(`fetch não mockado para: ${u}`)
    }))
  })

  afterEach(() => {
    vi.doUnmock('@vercel/functions')
    vi.unstubAllGlobals()
    process.env = { ...ORIGINAL_ENV }
  })

  it('repassa correlationId/storyId até o INSERT quando o chamador passa traceMeta', async () => {
    const { identificarProdutoPorImagem } = await import('../_visaoProduto.js')

    const resultado = await identificarProdutoPorImagem(STORY_URL_IMAGE, {
      correlationId: 'corr-abc-123',
      storyId: 'story-xyz-789',
    })

    expect(resultado).toBe('## Produto Fixture') // resultado comercial preservado
    await waitUntilMock.mock.calls[0][0]

    expect(insertedRows).toHaveLength(1)
    expect(insertedRows[0].correlation_id).toBe('corr-abc-123')
    expect(insertedRows[0].story_id).toBe('story-xyz-789')
  })

  it('grava correlation_id/story_id como null quando o chamador não passa traceMeta (compatibilidade retroativa)', async () => {
    const { identificarProdutoPorImagem } = await import('../_visaoProduto.js')

    const resultado = await identificarProdutoPorImagem(STORY_URL_IMAGE)

    expect(resultado).toBe('## Produto Fixture')
    await waitUntilMock.mock.calls[0][0]

    expect(insertedRows).toHaveLength(1)
    expect(insertedRows[0].correlation_id).toBeNull()
    expect(insertedRows[0].story_id).toBeNull()
  })

  it('continua gravando exatamente 1 INSERT por execução, com ou sem traceMeta', async () => {
    const { identificarProdutoPorImagem } = await import('../_visaoProduto.js')

    await identificarProdutoPorImagem(STORY_URL_IMAGE, { correlationId: 'corr-1', storyId: 'story-1' })
    await waitUntilMock.mock.calls[0][0]

    expect(insertedRows).toHaveLength(1)
    expect(waitUntilMock).toHaveBeenCalledTimes(1)
  })

  it('recordVisionUsageEvent aceita event sem correlationId/storyId sem lançar (chamador legado)', async () => {
    const { recordVisionUsageEvent } = await import('../_visionTelemetry.js')

    expect(() => recordVisionUsageEvent({
      source: 'story', mediaType: 'image', ffmpegUsed: false, model: 'x',
      provider: 'openrouter', success: true, latencyMs: 10,
    })).not.toThrow()

    await waitUntilMock.mock.calls[0][0]
    expect(insertedRows).toHaveLength(1)
    expect(insertedRows[0].correlation_id).toBeNull()
    expect(insertedRows[0].story_id).toBeNull()
  })
})
