import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const ORIGINAL_ENV = { ...process.env }

describe('Story Video Smart Vision V1 — helpers', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV }
    delete process.env.STORY_VIDEO_SMART_VISION_MODE
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('Preview ativa LAB por padrão; Production continua OFF', async () => {
    process.env.VERCEL_ENV = 'preview'
    let mod = await import('../_visaoProduto.js')
    expect(mod.getStoryVideoSmartVisionMode()).toBe('lab')

    vi.resetModules()
    process.env = { ...ORIGINAL_ENV, VERCEL_ENV: 'production' }
    delete process.env.STORY_VIDEO_SMART_VISION_MODE
    mod = await import('../_visaoProduto.js')
    expect(mod.getStoryVideoSmartVisionMode()).toBe('off')
  })

  it('gera 25%, 50% e 75% para vídeo normal', async () => {
    const { calcularTimestampsSmartVision } = await import('../_visaoProduto.js')
    expect(calcularTimestampsSmartVision(16)).toEqual([4, 8, 12])
    expect(calcularTimestampsSmartVision(10)).toEqual([2.5, 5, 7.5])
  })

  it('vídeo muito curto usa apenas o meio', async () => {
    const { calcularTimestampsSmartVision } = await import('../_visaoProduto.js')
    expect(calcularTimestampsSmartVision(2)).toEqual([1])
  })

  it('duração inválida cai no frame legado de 1s', async () => {
    const { calcularTimestampsSmartVision } = await import('../_visaoProduto.js')
    expect(calcularTimestampsSmartVision(null)).toEqual([1])
    expect(calcularTimestampsSmartVision(NaN)).toEqual([1])
  })

  it('env explícita pode desligar LAB para rollback', async () => {
    process.env.VERCEL_ENV = 'preview'
    process.env.STORY_VIDEO_SMART_VISION_MODE = 'off'
    const { getStoryVideoSmartVisionMode } = await import('../_visaoProduto.js')
    expect(getStoryVideoSmartVisionMode()).toBe('off')
  })
})
