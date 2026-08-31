// api/__tests__/visaoProdutoFfmpegReal.test.js
//
// [GAP 2] Prova controlada com o binário REAL do ffmpeg-static (sem mock de
// node:child_process nem node:fs/promises) — só a chamada ao modelo de visão
// e a gravação no Supabase são mockadas, exatamente como autorizado.
//
// Fixture: MP4 sintético gerado NO PRÓPRIO teste (beforeAll), com o mesmo
// binário ffmpeg-static já usado em produção (testsrc, 3s, 320x240) — nenhum
// conteúdo de Story real, nenhum dado pessoal, nenhum arquivo binário
// versionado no repositório. Gerado em os.tmpdir() e removido no afterAll.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { readFile as readFileReal } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import ffmpegPath from 'ffmpeg-static'

const ORIGINAL_ENV = { ...process.env }
const STORY_URL_VIDEO = 'https://gpt-files.com/story-fixture-real.mp4'
const FIXTURE_PATH = path.join(os.tmpdir(), 'vision-telemetry-test-fixture.mp4')

describe('api/_visaoProduto.js — [GAP 2] FFmpeg real (ffmpeg-static), sem mock de child_process/fs', () => {
  let waitUntilMock
  let insertedRows

  beforeAll(() => {
    // Gera o MP4 de teste com o binário REAL do ffmpeg-static — mesmo
    // binário que api/_visaoProduto.js usa em produção. 3s de duração
    // (não 1s) porque -ss 1 precisa de margem real após o seek.
    execFileSync(ffmpegPath, [
      '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=5:duration=3',
      '-pix_fmt', 'yuv420p', FIXTURE_PATH,
    ])
  })

  afterAll(() => {
    unlinkSync(FIXTURE_PATH)
  })

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
  })

  afterEach(() => {
    vi.doUnmock('@vercel/functions')
    vi.unstubAllGlobals()
    process.env = { ...ORIGINAL_ENV }
  })

  it('MP4 real → ffmpeg-static real → frame JPEG real extraído → caminho normal da função (modelo mockado)', async () => {
    expect(existsSync(FIXTURE_PATH), `fixture MP4 ausente em ${FIXTURE_PATH} — gerar antes de rodar este teste`).toBe(true)
    const videoBuffer = await readFileReal(FIXTURE_PATH)

    // /tmp antes da execução — usado só pra confirmar que o cleanup (unlink
    // no finally de extrairFrameDeVideo) realmente rodou depois.
    const tmpAntes = readdirSync('/tmp').filter((f) => f.startsWith('story-') || f.startsWith('frame-'))

    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      const u = String(url)
      if (u.startsWith('https://gpt-files.com/')) {
        return {
          ok: true, status: 200,
          headers: { get: (h) => (h === 'content-type' ? 'video/mp4' : null) },
          arrayBuffer: async () => videoBuffer.buffer.slice(videoBuffer.byteOffset, videoBuffer.byteOffset + videoBuffer.byteLength),
        }
      }
      if (u.includes('/api/system-tools?tool=ocr-openrouter')) {
        // Modelo mockado de propósito (Gap 2 pede isolar o FFmpeg, não o provider) —
        // isto NÃO é uma chamada real à OpenRouter.
        return {
          ok: true, status: 200,
          headers: { get: () => null },
          json: async () => ({
            id: 'gen-ffmpeg-real-1',
            choices: [{ message: { content: 'produto identificado a partir do frame real' } }],
            usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60, cost: 0.00001 },
          }),
        }
      }
      if (u.includes('fixture.supabase.co/rest/v1/vision_usage_events')) {
        insertedRows.push(JSON.parse(init?.body || '{}'))
        return { ok: true, status: 201 }
      }
      throw new Error(`fetch não mockado para: ${u}`)
    }))

    const { identificarProdutoPorImagem } = await import('../_visaoProduto.js')
    const resultado = await identificarProdutoPorImagem(STORY_URL_VIDEO)

    // Caminho normal da função — resultado do "modelo" (mockado) chega íntegro
    expect(resultado).toBe('produto identificado a partir do frame real')

    await waitUntilMock.mock.calls[0][0]
    expect(insertedRows).toHaveLength(1)
    const row = insertedRows[0]

    expect(row.media_type).toBe('video')
    expect(row.ffmpeg_used).toBe(true)
    // ffmpeg_ms real — precisa ser um número plausível (FFmpeg real rodou de verdade)
    expect(typeof row.ffmpeg_ms).toBe('number')
    expect(row.ffmpeg_ms).toBeGreaterThan(0)
    expect(row.ffmpeg_ms).toBeLessThan(15000) // FFMPEG_TIMEOUT_MS do próprio arquivo
    expect(row.success).toBe(true)
    expect(row.cost_source).toBe('real')
    expect(row.cost_usd).toBe(0.00001)

    // cleanup de /tmp: extrairFrameDeVideo sempre remove seus próprios
    // arquivos temporários no finally — confirma que não sobrou nada novo.
    const tmpDepois = readdirSync('/tmp').filter((f) => f.startsWith('story-') || f.startsWith('frame-'))
    expect(tmpDepois).toEqual(tmpAntes)
  })
})
