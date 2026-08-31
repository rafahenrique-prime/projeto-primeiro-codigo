// api/__tests__/visaoProdutoTelemetria.test.js
//
// Prova controlada (fixture, sem cliente real) de que a instrumentação de
// telemetria em api/_visaoProduto.js:
// 1. não muda o resultado comercial (texto identificado) em nenhum cenário;
// 2. grava exatamente 1 evento em vision_usage_events por chamada;
// 3. classifica corretamente media_type/ffmpeg_used/ffmpeg_ms/tokens/erro;
// 4. nunca deixa uma falha de telemetria (Supabase indisponível) vazar pro
//    resultado retornado ao chamador (fail-open real, não simulado).
//
// Todo I/O externo é mockado (fetch global, ffmpeg via node:child_process,
// waitUntil do @vercel/functions) — nenhuma chamada real à OpenRouter,
// Supabase, GPT Maker ou FFmpeg de verdade.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const ORIGINAL_ENV = { ...process.env }
const STORY_URL_IMAGE = 'https://gpt-files.com/story-fixture.jpg'
const STORY_URL_VIDEO = 'https://gpt-files.com/story-fixture.mp4'

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    headers: { get: () => null },
    json: async () => body,
    arrayBuffer: async () => body,
  }
}

describe('api/_visaoProduto.js — telemetria fail-open (não altera resultado comercial)', () => {
  let waitUntilMock
  let insertedRows

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV }
    process.env.VERCEL_URL = 'ignite-prime-fixture.vercel.app'
    process.env.VITE_SUPABASE_URL = 'https://fixture.supabase.co'
    process.env.SUPABASE_SECRET_KEY = 'fixture-secret-key'
    delete process.env.OPENROUTER_API_KEY // custo real não testado aqui — cost_source deve ficar 'unavailable'

    insertedRows = []
    waitUntilMock = vi.fn((promise) => promise) // executa a task de telemetria de verdade, só sem sobreviver ao processo real da Vercel
    vi.doMock('@vercel/functions', () => ({ waitUntil: waitUntilMock }))
  })

  afterEach(() => {
    vi.doUnmock('@vercel/functions')
    vi.unstubAllGlobals()
    process.env = { ...ORIGINAL_ENV }
  })

  // Cada teste monta seu próprio fetch mock — a URL decide o comportamento
  // (media Story vs proxy de visão vs insert do Supabase) — assim conseguimos
  // afirmar exatamente 1 insert por chamada.
  function stubFetch({ mediaBuffer, mediaContentType, visionResponse, visionOk = true, insertOk = true }) {
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      const u = String(url)
      if (u.startsWith('https://gpt-files.com/')) {
        return {
          ok: true,
          status: 200,
          headers: { get: (h) => (h === 'content-type' ? mediaContentType : null) },
          arrayBuffer: async () => mediaBuffer,
        }
      }
      if (u.includes('/api/system-tools?tool=ocr-openrouter')) {
        return jsonResponse(visionResponse, { ok: visionOk, status: visionOk ? 200 : 502 })
      }
      if (u.includes('fixture.supabase.co/rest/v1/vision_usage_events')) {
        if (!insertOk) return { ok: false, status: 500 }
        insertedRows.push(JSON.parse(init?.body || '{}'))
        return { ok: true, status: 201 }
      }
      throw new Error(`fetch não mockado para: ${u}`)
    }))
  }

  it('A) JPEG — sucesso: resultado comercial preservado + 1 evento com media_type=image, ffmpeg_used=false, tokens capturados, cost_source=unavailable', async () => {
    stubFetch({
      mediaBuffer: new Uint8Array([1, 2, 3]).buffer,
      mediaContentType: 'image/jpeg',
      visionResponse: {
        id: 'gen-fixture-123',
        choices: [{ message: { content: '## Tênis Fixture\n**Tipo:** tênis' } }],
        usage: { prompt_tokens: 120, completion_tokens: 40, total_tokens: 160 },
      },
    })

    const { identificarProdutoPorImagem } = await import('../_visaoProduto.js')
    const resultado = await identificarProdutoPorImagem(STORY_URL_IMAGE)

    // 1. resultado comercial idêntico ao comportamento anterior (mesmo texto do provider)
    expect(resultado).toBe('## Tênis Fixture\n**Tipo:** tênis')
    await waitUntilMock.mock.calls[0][0]

    // 2. exatamente 1 evento gravado
    expect(insertedRows).toHaveLength(1)
    const row = insertedRows[0]
    expect(row.source).toBe('story')
    expect(row.media_type).toBe('image')
    expect(row.ffmpeg_used).toBe(false)
    expect(row.ffmpeg_ms).toBeNull()
    expect(row.model).toBe('google/gemini-2.5-flash-lite')
    expect(row.provider).toBe('openrouter')
    expect(row.success).toBe(true)
    expect(row.latency_ms).toBeGreaterThanOrEqual(0)
    expect(row.input_tokens).toBe(120)
    expect(row.output_tokens).toBe(40)
    expect(row.total_tokens).toBe(160)
    expect(row.cost_source).toBe('unavailable') // sem OPENROUTER_API_KEY neste teste — nunca inventa custo
    expect(row.cost_usd).toBeNull()
    expect(row.error_code).toBeNull()

    // nenhum dado pessoal/sensível em nenhum campo gravado
    const serialized = JSON.stringify(row)
    expect(serialized).not.toContain('gpt-files.com')
    expect(serialized).not.toContain('Tênis Fixture')
  })

  it('B) MP4 — sucesso via FFmpeg: resultado comercial preservado + evento com media_type=video, ffmpeg_used=true, ffmpeg_ms numérico', async () => {
    vi.doMock('node:child_process', () => ({
      execFile: (bin, args, opts, cb) => cb(null, '', ''), // promisify(execFile) exige a assinatura com callback
    }))
    vi.doMock('node:fs/promises', () => ({
      writeFile: vi.fn(async () => {}),
      readFile: vi.fn(async () => Buffer.from([9, 9, 9])), // frame extraído fictício
      unlink: vi.fn(async () => {}),
    }))

    stubFetch({
      mediaBuffer: new Uint8Array([4, 5, 6]).buffer,
      mediaContentType: 'video/mp4',
      visionResponse: {
        id: 'gen-fixture-456',
        choices: [{ message: { content: '## Boné Fixture' } }],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      },
    })

    const { identificarProdutoPorImagem } = await import('../_visaoProduto.js')
    const resultado = await identificarProdutoPorImagem(STORY_URL_VIDEO)

    expect(resultado).toBe('## Boné Fixture')
    await waitUntilMock.mock.calls[0][0]
    expect(insertedRows).toHaveLength(1)
    const row = insertedRows[0]
    expect(row.media_type).toBe('video')
    expect(row.ffmpeg_used).toBe(true)
    expect(typeof row.ffmpeg_ms).toBe('number')
    expect(row.ffmpeg_ms).toBeGreaterThanOrEqual(0)
    expect(row.success).toBe(true)

    vi.doUnmock('node:child_process')
    vi.doUnmock('node:fs/promises')
  })

  it('C) falha na gravação da telemetria (Supabase indisponível) não afeta o resultado comercial retornado', async () => {
    stubFetch({
      mediaBuffer: new Uint8Array([1, 2, 3]).buffer,
      mediaContentType: 'image/jpeg',
      visionResponse: {
        id: 'gen-fixture-789',
        choices: [{ message: { content: '## Produto OK mesmo com telemetria falhando' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      },
      insertOk: false, // simula Supabase fora do ar / 500
    })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { identificarProdutoPorImagem } = await import('../_visaoProduto.js')
    const resultado = await identificarProdutoPorImagem(STORY_URL_IMAGE)

    // resultado comercial idêntico — telemetria falhou, atendimento não é afetado
    expect(resultado).toBe('## Produto OK mesmo com telemetria falhando')

    // a task de telemetria roda em segundo plano (waitUntil) — aguarda ela
    // terminar antes de checar o efeito da falha, sem isso afetar o retorno
    // já obtido acima (prova de que o chamador NUNCA espera por isto).
    await waitUntilMock.mock.calls[0][0]

    expect(insertedRows).toHaveLength(0) // insert falhou, nada foi persistido
    // Falha vira só warn sanitizado, nunca exceção não tratada
    expect(warnSpy).toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it('D) waitUntil recebe a task de telemetria (mesmo mecanismo de api/_primeBridgeWebhook.js)', async () => {
    stubFetch({
      mediaBuffer: new Uint8Array([1]).buffer,
      mediaContentType: 'image/jpeg',
      visionResponse: { id: 'gen-x', choices: [{ message: { content: 'ok' } }], usage: {} },
    })

    const { identificarProdutoPorImagem } = await import('../_visaoProduto.js')
    await identificarProdutoPorImagem(STORY_URL_IMAGE)

    expect(waitUntilMock).toHaveBeenCalledTimes(1)
    expect(waitUntilMock.mock.calls[0][0]).toBeInstanceOf(Promise)
  })

  it('E) [GAP 1] falha de download — media_type=unknown, success=false, error_code=download_error, resultado comercial null (fail-safe preservado)', async () => {
    // Simula falha de download: host fora da allowlist (ALLOWED_STORY_MEDIA_HOSTS
    // só aceita gpt-files.com) — nunca chega a saber se seria imagem ou vídeo.
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      const u = String(url)
      if (u.includes('fixture.supabase.co/rest/v1/vision_usage_events')) {
        insertedRows.push(JSON.parse(init?.body || '{}'))
        return { ok: true, status: 201 }
      }
      throw new Error(`fetch não deveria ser chamado para: ${u}`)
    }))

    const { identificarProdutoPorImagem } = await import('../_visaoProduto.js')
    const resultado = await identificarProdutoPorImagem('https://host-nao-permitido.example.com/x.jpg')

    // fail-safe comercial preservado, idêntico ao comportamento anterior
    expect(resultado).toBeNull()

    expect(waitUntilMock).toHaveBeenCalledTimes(1)
    await waitUntilMock.mock.calls[0][0]

    expect(insertedRows).toHaveLength(1)
    const row = insertedRows[0]
    expect(row.media_type).toBe('unknown')
    expect(row.success).toBe(false)
    expect(row.error_code).toBe('download_error')
    expect(row.ffmpeg_used).toBe(false)
    expect(row.cost_source).toBe('unavailable')
  })

  it('F) [GAP 3] custo real já vem na resposta principal (usage.cost) — cost_source=real, sem 2ª chamada de rede', async () => {
    let chamadasGeneration = 0
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      const u = String(url)
      if (u.startsWith('https://gpt-files.com/')) {
        return {
          ok: true, status: 200,
          headers: { get: (h) => (h === 'content-type' ? 'image/jpeg' : null) },
          arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        }
      }
      if (u.includes('/api/system-tools?tool=ocr-openrouter')) {
        return jsonResponse({
          id: 'gen-cost-real-1',
          choices: [{ message: { content: 'produto identificado' } }],
          usage: { prompt_tokens: 267, completion_tokens: 9, total_tokens: 276, cost: 0.0000303 },
        })
      }
      if (u.startsWith('https://openrouter.ai/api/v1/generation')) {
        chamadasGeneration += 1
        return jsonResponse({ data: { total_cost: 0.999 } }) // se isto for usado, o teste falha abaixo
      }
      if (u.includes('fixture.supabase.co/rest/v1/vision_usage_events')) {
        insertedRows.push(JSON.parse(init?.body || '{}'))
        return { ok: true, status: 201 }
      }
      throw new Error(`fetch não mockado para: ${u}`)
    }))

    const { identificarProdutoPorImagem } = await import('../_visaoProduto.js')
    const resultado = await identificarProdutoPorImagem(STORY_URL_IMAGE)

    expect(resultado).toBe('produto identificado')
    await waitUntilMock.mock.calls[0][0]

    expect(insertedRows).toHaveLength(1)
    const row = insertedRows[0]
    expect(row.cost_source).toBe('real')
    expect(row.cost_usd).toBe(0.0000303) // veio da resposta principal, não do fallback fictício de 0.999
    expect(chamadasGeneration).toBe(0) // prova que a 2ª chamada (/generation) nunca foi necessária
  })
})
