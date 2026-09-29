import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const ORIGINAL_ENV = { ...process.env }

describe('Story Video Smart Vision V1 — modo shadow seguro', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV }
    delete process.env.STORY_VIDEO_SMART_VISION_MODE
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('Preview usa LAB por padrão', async () => {
    process.env.VERCEL_ENV = 'preview'
    const { getStoryVideoSmartVisionMode } = await import('../_visaoProduto.js')
    expect(getStoryVideoSmartVisionMode()).toBe('lab')
  })

  it('Production usa SHADOW por padrão, sem promover Smart Video ao caminho comercial', async () => {
    process.env.VERCEL_ENV = 'production'
    const { getStoryVideoSmartVisionMode } = await import('../_visaoProduto.js')
    expect(getStoryVideoSmartVisionMode()).toBe('shadow')
  })

  it('rollback explícito OFF continua disponível', async () => {
    process.env.VERCEL_ENV = 'production'
    process.env.STORY_VIDEO_SMART_VISION_MODE = 'off'
    const { getStoryVideoSmartVisionMode } = await import('../_visaoProduto.js')
    expect(getStoryVideoSmartVisionMode()).toBe('off')
  })

  it('vídeo normal amostra 25%, 50% e 75%', async () => {
    const { calcularTimestampsSmartVision } = await import('../_visaoProduto.js')
    expect(calcularTimestampsSmartVision(16)).toEqual([4, 8, 12])
    expect(calcularTimestampsSmartVision(10)).toEqual([2.5, 5, 7.5])
  })

  it('vídeo curto usa apenas o frame central', async () => {
    const { calcularTimestampsSmartVision } = await import('../_visaoProduto.js')
    expect(calcularTimestampsSmartVision(2)).toEqual([1])
  })

  it('duração inválida preserva fallback legado de 1s', async () => {
    const { calcularTimestampsSmartVision } = await import('../_visaoProduto.js')
    expect(calcularTimestampsSmartVision(null)).toEqual([1])
    expect(calcularTimestampsSmartVision(NaN)).toEqual([1])
  })
})
