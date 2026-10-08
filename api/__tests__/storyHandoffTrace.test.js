import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildStoryHandoffTrace,
  emitStoryHandoffTrace,
  getStoryHandoffTraceMode,
  sha256Payload,
} from '../_storyHandoffTrace.js'

afterEach(() => {
  delete process.env.PRIME_STORY_HANDOFF_TRACE_MODE
  vi.restoreAllMocks()
})

describe('Story handoff trace V1.4B', () => {
  it('fica OFF por padrão e aceita shadow como alias de log', () => {
    expect(getStoryHandoffTraceMode()).toBe('off')
    process.env.PRIME_STORY_HANDOFF_TRACE_MODE = 'shadow'
    expect(getStoryHandoffTraceMode()).toBe('log')
  })

  it('gera somente metadados sanitizados e hash do payload', () => {
    const payload = {
      contexto: {
        decision_layer: { scope: 'story', action: 'ALLOW_AUTO', reason: 'JEV_ROUTE' },
        cliente: 'Lolo Oliveira',
      },
      dados: {
        pergunta: 'Valor',
        produtos: [
          { nome: 'Produto super secreto', preco: 389, link: 'https://example.test/private' },
        ],
      },
    }

    const trace = buildStoryHandoffTrace({
      correlationId: '4de8381a-65a2-4a56-807f-628b6447ba8c',
      storyId: '17959915749248721',
      storyContextStatus: 'STORY_FOUND_VISION_OK',
      visionStatus: 'success',
      catalogStageReached: true,
      searchContextUsed: 'story',
      fallbackUsed: false,
      candidateCount: 3,
      jevMode: 'guard',
      jevStatus: 'ok',
      jevAction: 'ALLOW_AUTO',
      jevReason: 'JEV_ROUTE',
      responsePayload: payload,
      requestStartedAtMs: Date.now() - 5,
    })

    expect(trace.payload_prepared).toBe(true)
    expect(trace.payload_product_count).toBe(1)
    expect(trace.decision_layer_action).toBe('ALLOW_AUTO')
    expect(trace.catalog_stage_reached).toBe(true)
    expect(trace.payload_sha256).toBe(sha256Payload(payload))
    expect(trace.payload_sha256).toMatch(/^[a-f0-9]{64}$/)

    const serialized = JSON.stringify(trace)
    expect(serialized).not.toContain('Lolo Oliveira')
    expect(serialized).not.toContain('Valor')
    expect(serialized).not.toContain('Produto super secreto')
    expect(serialized).not.toContain('389')
    expect(serialized).not.toContain('example.test')
  })

  it('não emite log quando está OFF e emite exatamente uma linha quando LOG', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const event = { event: 'STORY_GPTMAKER_HANDOFF_TRACE_V1' }

    expect(emitStoryHandoffTrace(event)).toBe(false)
    expect(spy).not.toHaveBeenCalled()

    process.env.PRIME_STORY_HANDOFF_TRACE_MODE = 'log'
    expect(emitStoryHandoffTrace(event)).toBe(true)
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
