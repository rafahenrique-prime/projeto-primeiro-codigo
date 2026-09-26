import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const ORIGINAL_ENV = { ...process.env }

function decisionResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

describe('api/_jevStoryDecision.js — Story Guard V1', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV }
    process.env.OPENROUTER_API_KEY = 'fixture-openrouter-key'
    process.env.JEV_STORY_MIN_CONFIDENCE = '0.95'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    process.env = { ...ORIGINAL_ENV }
  })

  it('fica completamente desligado quando JEV_STORY_MODE=off', async () => {
    process.env.JEV_STORY_MODE = 'off'
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { decideStoryWithJev } = await import('../_jevStoryDecision.js')
    const result = await decideStoryWithJev({
      question: 'qual valor?',
      visionQuery: 'New Balance 9060',
      candidates: [{ nome: 'New Balance 9060 Bege', score: 80 }],
      storyContextStatus: 'STORY_FOUND_VISION_OK',
      visionStatus: 'success',
    })

    expect(result.action).toBe('BYPASS')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reconhece somente referência explícita de Story/foto', async () => {
    const { isExplicitStoryReference } = await import('../_jevStoryDecision.js')

    expect(isExplicitStoryReference('É na cor da foto que respondi o story')).toBe(true)
    expect(isExplicitStoryReference('Nessa foto tem 37?')).toBe(true)
    expect(isExplicitStoryReference('Qual valor?')).toBe(false)
    expect(isExplicitStoryReference('Tem 42?')).toBe(false)
  })

  it('libera automação somente com candidato único forte e rota ALLOW_AUTO', async () => {
    process.env.JEV_STORY_MODE = 'guard'
    vi.stubGlobal('fetch', vi.fn(async () => decisionResponse({
      model: 'typesafe/jev-1.13-20260917',
      answers: {
        product: {
          type: 'choice',
          choice: 'C1',
          probabilities: { C1: 0.99, C2: 0.01, NONE: 0 },
          confidence: 0.99,
        },
        route: {
          type: 'choice',
          choice: 'ALLOW_AUTO',
          probabilities: { ALLOW_AUTO: 0.99, ASK_CLARIFY: 0.01, BLOCK_ASSERTION: 0 },
          confidence: 0.99,
        },
      },
      usage: { cost: 0.00001 },
    })))

    const { decideStoryWithJev } = await import('../_jevStoryDecision.js')
    const result = await decideStoryWithJev({
      question: 'quanto essa?',
      visionQuery: 'New Balance 9060 Bege',
      candidates: [
        { nome: 'New Balance 9060 Bege', categoria: 'Tênis', score: 80 },
        { nome: 'New Balance 9060 Gelo', categoria: 'Tênis', score: 47 },
      ],
      storyContextStatus: 'STORY_FOUND_VISION_OK',
      visionStatus: 'success',
    })

    expect(result.action).toBe('ALLOW_AUTO')
    expect(result.selectedCandidateId).toBe('C1')
    expect(result.confidence).toBe(0.99)
  })

  it('rebaixa ALLOW_AUTO para ASK_CLARIFY quando confiança não atinge o gate', async () => {
    process.env.JEV_STORY_MODE = 'guard'
    vi.stubGlobal('fetch', vi.fn(async () => decisionResponse({
      answers: {
        product: {
          type: 'choice',
          choice: 'C1',
          probabilities: { C1: 0.72, C2: 0.28, NONE: 0 },
          confidence: 0.70,
        },
        route: {
          type: 'choice',
          choice: 'ALLOW_AUTO',
          probabilities: { ALLOW_AUTO: 0.7, ASK_CLARIFY: 0.3, BLOCK_ASSERTION: 0 },
          confidence: 0.60,
        },
      },
      usage: { cost: 0.00001 },
    })))

    const { decideStoryWithJev } = await import('../_jevStoryDecision.js')
    const result = await decideStoryWithJev({
      question: 'quanto o cinza?',
      visionQuery: 'New Balance cinza',
      candidates: [
        { nome: 'New Balance 9060 Cinza', score: 50 },
        { nome: 'Nike Dunk Cinza', score: 47 },
      ],
      storyContextStatus: 'STORY_FOUND_VISION_OK',
      visionStatus: 'success',
    })

    expect(result.action).toBe('ASK_CLARIFY')
    expect(result.selectedCandidateId).toBe(null)
  })

  it('falha fechado quando OpenRouter/JEV está indisponível', async () => {
    process.env.JEV_STORY_MODE = 'guard'
    vi.stubGlobal('fetch', vi.fn(async () => decisionResponse({}, 503)))

    const { decideStoryWithJev } = await import('../_jevStoryDecision.js')
    const result = await decideStoryWithJev({
      question: 'qual valor?',
      visionQuery: 'Produto do Story',
      candidates: [{ nome: 'Produto A', score: 80 }],
      storyContextStatus: 'STORY_FOUND_VISION_OK',
      visionStatus: 'success',
    })

    expect(result.action).toBe('BLOCK_ASSERTION')
    expect(result.reason).toBe('JEV_HTTP_503')
  })
})
