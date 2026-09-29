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

  it('modo inválido em produção volta com segurança para SHADOW', async () => {
    process.env.VERCEL_ENV = 'production'
    process.env.STORY_VIDEO_SMART_VISION_MODE = 'valor-invalido'
    const { getStoryVideoSmartVisionMode } = await import('../_visaoProduto.js')
    expect(getStoryVideoSmartVisionMode()).toBe('shadow')
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


describe('Story Multi-Product Shadow V1 — normalização segura', () => {
  it('reconhece MULTI_PRODUCT e preserva múltiplos matches válidos', async () => {
    const { normalizarStorySceneDecision } = await import('../_visualMatchProduto.js')
    const result = normalizarStorySceneDecision({
      mode: 'MULTI_PRODUCT',
      matches: [
        { choice: 'C1', confidence: 0.98 },
        { choice: 'C3', confidence: 0.96 },
      ],
    }, ['C1', 'C2', 'C3'])

    expect(result.mode).toBe('MULTI_PRODUCT')
    expect(result.matches).toEqual([
      { choice: 'C1', confidence: 0.98 },
      { choice: 'C3', confidence: 0.96 },
    ])
  })

  it('remove candidato inválido, confiança inválida e duplicata', async () => {
    const { normalizarStorySceneDecision } = await import('../_visualMatchProduto.js')
    const result = normalizarStorySceneDecision({
      mode: 'MULTI_PRODUCT',
      matches: [
        { choice: 'C1', confidence: 0.97 },
        { choice: 'C1', confidence: 0.99 },
        { choice: 'C9', confidence: 0.99 },
        { choice: 'C2', confidence: 1.4 },
      ],
    }, ['C1', 'C2'])

    expect(result.matches).toEqual([{ choice: 'C1', confidence: 0.97 }])
  })

  it('modo desconhecido cai para UNCERTAIN, nunca para SINGLE_PRODUCT', async () => {
    const { normalizarStorySceneDecision } = await import('../_visualMatchProduto.js')
    const result = normalizarStorySceneDecision({
      mode: 'qualquer-coisa',
      matches: [{ choice: 'C1', confidence: 0.99 }],
    }, ['C1'])

    expect(result.mode).toBe('UNCERTAIN')
  })
})


describe('Story Item Inventory Shadow V1 — separação antes da busca', () => {
  it('extrai dois produtos distintos P1/P2 da Vision', async () => {
    const { extrairInventarioProdutosDaVision } = await import('../_visaoProduto.js')
    const result = extrairInventarioProdutosDaVision(`
**Cena:** MULTI_PRODUCT
**Quantidade distinta:** 2
**P1:** Chinelo Flat Branco | Calçado / Chinelo | Prada | Branco | parte superior
**P2:** Chinelo Flat Marrom | Calçado / Chinelo | Prada | Marrom | sendo usado nos pés

## Chinelo Flat Feminino
**Tipo:** Calçado / Chinelo
**Marca:** Prada
`)

    expect(result.sceneMode).toBe('MULTI_PRODUCT')
    expect(result.declaredCount).toBe(2)
    expect(result.items).toHaveLength(2)
    expect(result.items[0].id).toBe('P1')
    expect(result.items[1].id).toBe('P2')
  })

  it('monta query individual sem usar cor/posição como ruído obrigatório', async () => {
    const { montarQueryInventarioProduto } = await import('../_visaoProduto.js')
    expect(montarQueryInventarioProduto({
      nome: 'Chinelo Flat Branco',
      tipo: 'Calçado / Chinelo',
      marca: 'Prada',
      cor: 'Branco',
      posicao: 'parte superior',
    })).toBe('Chinelo Flat Branco Calçado / Chinelo Prada')
  })

  it('remove Não identificado da query individual', async () => {
    const { montarQueryInventarioProduto } = await import('../_visaoProduto.js')
    expect(montarQueryInventarioProduto({
      nome: 'Chinelo Flat Feminino',
      tipo: 'Calçado / Chinelo',
      marca: 'Não identificado',
    })).toBe('Chinelo Flat Feminino Calçado / Chinelo')
  })

  it('entende "Quais valores dos 2?" apenas como pista de quantidade', async () => {
    const { extractRequestedStoryProductCount } = await import('../webhook.js')
    expect(extractRequestedStoryProductCount('Quais valores dos 2?')).toBe(2)
    expect(extractRequestedStoryProductCount('Qual preço?')).toBeNull()
  })
})


describe('Story P1/P2 — caso real dos dois chinelos', () => {
  it('mantém candidatos de P1 e P2 intercalados mesmo quando P1 tem muitos resultados', async () => {
    const { intercalarResultadosInventario } = await import('../webhook.js')

    const p1 = [
      { bagy_product_id: 9730182, nome: 'Chinelo Sandália Plataforma Bege', marca: 'PRADA', score: 80 },
      { bagy_product_id: 9730204, nome: 'Chinelo Sandália Plataforma Palha', marca: 'PRADA', score: 70 },
      { bagy_product_id: 9730217, nome: 'Chinelo Sandália Plataforma Preta', marca: 'PRADA', score: 60 },
      { bagy_product_id: 7622418, nome: 'Chinelo Boss', marca: 'BOSS', score: 50 },
      { bagy_product_id: 7622329, nome: 'Chinelo Diesel Branco', marca: 'Diesel', score: 40 },
    ]

    const p2 = [
      { bagy_product_id: 7617068, nome: 'Chinelo Slide Boss - Branca', marca: 'BOSS', score: 79 },
      { bagy_product_id: 7622298, nome: 'Chinelo Diesel Creme', marca: 'Diesel', score: 69 },
    ]

    const result = intercalarResultadosInventario([
      { item: { id: 'P1' }, produtos: p1 },
      { item: { id: 'P2' }, produtos: p2 },
    ], 5)

    expect(result.map((p) => p.bagy_product_id)).toEqual([
      9730182,
      7617068,
      9730204,
      7622298,
      9730217,
    ])
    expect(result.some((p) => p.bagy_product_id === 7617068)).toBe(true)
    expect(result.some((p) => p.bagy_product_id === 7622298)).toBe(true)
  })

  it('deduplica o mesmo produto se P1 e P2 trouxerem o mesmo candidato', async () => {
    const { intercalarResultadosInventario } = await import('../webhook.js')
    const same = { bagy_product_id: 9730182, nome: 'Chinelo Sandália Plataforma Bege' }

    const result = intercalarResultadosInventario([
      { item: { id: 'P1' }, produtos: [same] },
      { item: { id: 'P2' }, produtos: [same, { bagy_product_id: 9730204, nome: 'Chinelo Sandália Plataforma Palha' }] },
    ], 5)

    expect(result.filter((p) => p.bagy_product_id === 9730182)).toHaveLength(1)
    expect(result.some((p) => p.bagy_product_id === 9730204)).toBe(true)
  })

  it('preserva P1/P2 antes de anexar fallback global', async () => {
    const { intercalarResultadosInventario, acrescentarCandidatosUnicos } = await import('../webhook.js')

    const itemCandidates = intercalarResultadosInventario([
      { produtos: [{ bagy_product_id: 'P1-A', nome: 'Produto P1' }] },
      { produtos: [{ bagy_product_id: 'P2-A', nome: 'Produto P2' }] },
    ], 5)

    const merged = acrescentarCandidatosUnicos(itemCandidates, [
      { bagy_product_id: 'GLOBAL-1', nome: 'Fallback global' },
      { bagy_product_id: 'GLOBAL-2', nome: 'Fallback global 2' },
    ], 5)

    expect(merged.slice(0, 2).map((p) => p.bagy_product_id)).toEqual(['P1-A', 'P2-A'])
  })
})
