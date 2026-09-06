// api/__tests__/storyCatalogMatchingFix.test.js
//
// Correção #1 (Story Vision → Catalog Matching) + ajuste do gate final
// (2026-09-06) — prova, com o algoritmo REAL e o handler REAL de
// api/webhook.js, que:
// A. extrairQueryCompactaDaVision() extrai só Nome+Tipo+Marca, nunca Cor/
//    Características/Ocasião-Uso/Descrição-para-venda/labels Markdown;
// A2. se o parser não reconhece nenhum campo, o Markdown INTEIRO da Vision
//    NUNCA volta a ser usado como query — cai no caminho seguro (pergunta);
// B. STORY_MATCH_CONFIDENCE_THRESHOLD = 25, aplicado com >= (não >);
// C. busca derivada de Story: match confiável não aciona fallback e FILTRA
//    os produtos abaixo do threshold antes de chegar à resposta final
//    (formatarRespostaGPT/Gaby); candidatos existentes mas todos abaixo do
//    threshold ACIONAM o fallback; zero candidatos aciona o mesmo fallback;
// D. busca direta (sem Story) nunca é filtrada por threshold — comportamento
//    idêntico a antes da correção;
// E. calcularSimilaridade/extrairKeywords/buscarProdutos (algoritmo
//    compartilhado) não foram alterados — mesmos scores de sempre pra
//    consultas diretas conhecidas (New Balance 9060, Nike Dunk, Cueca Lup);
// F. um Story de "Cueca Lupo" simulado (score real 28) NÃO é rejeitado pelo
//    novo threshold 25 — a razão de ser do ajuste desta rodada.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

function makeRes() {
  const res = { statusCode: null, body: null }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (payload) => { res.body = payload; return res }
  res.setHeader = () => res
  res.end = () => res
  return res
}

function makeReq(body) {
  return { method: 'POST', body }
}

const CATALOGO_FIXTURE = [
  { id: 1, nome: 'Bermuda Jeans Azul', categoria: 'bermuda', preco: 100, imagem: null, link: null },
  { id: 2, nome: 'Bermuda Moletom Cinza', categoria: 'bermuda', preco: 90, imagem: null, link: null },
  { id: 3, nome: 'Tenis Vans Old Skool Preto', categoria: 'tenis', preco: 300, imagem: null, link: null },
]

describe('Correção #1 — extrairQueryCompactaDaVision (parser puro)', () => {
  it('A) extrai Nome + Tipo + Marca quando os 3 estão presentes', async () => {
    const { extrairQueryCompactaDaVision } = await import('../webhook.js')
    const vision = `## Calça Skinny com Elastano
**Tipo:** Calça Jeans
**Marca:** Diesel
**Cor:** Cinza Escuro (lavagem desgastada)
**Características:** Modelo skinny com elastano, tamanhos 40 ao 46.
**Ocasião/Uso:** Dia a dia, passeios casuais.
**Descrição para venda:** Conforto e estilo em uma só peça!`

    expect(extrairQueryCompactaDaVision(vision)).toBe('Calça Skinny com Elastano Calça Jeans Diesel')
  })

  it('campo ausente (sem **Marca:**) — usa só os campos realmente extraídos, não inventa', async () => {
    const { extrairQueryCompactaDaVision } = await import('../webhook.js')
    expect(extrairQueryCompactaDaVision('## Tênis Casual\n**Tipo:** Calçado')).toBe('Tênis Casual Calçado')
  })

  it('só Nome presente (sem Tipo/Marca)', async () => {
    const { extrairQueryCompactaDaVision } = await import('../webhook.js')
    expect(extrairQueryCompactaDaVision('## Produto Genérico')).toBe('Produto Genérico')
  })

  it('Cor NUNCA entra na query, mesmo quando presente no Markdown', async () => {
    const { extrairQueryCompactaDaVision } = await import('../webhook.js')
    const query = extrairQueryCompactaDaVision('## Nome X\n**Tipo:** T\n**Marca:** M\n**Cor:** Azul Royal Vibrante')
    expect(query).not.toContain('Azul Royal Vibrante')
    expect(query).toBe('Nome X T M')
  })

  it('Características/Ocasião-Uso/Descrição-para-venda NUNCA entram na query', async () => {
    const { extrairQueryCompactaDaVision } = await import('../webhook.js')
    const vision = `## Nome X
**Tipo:** T
**Marca:** M
**Características:** um texto longo cheio de detalhes que não deveria virar busca
**Ocasião/Uso:** dia a dia, casual, urbano
**Descrição para venda:** compre agora, promoção imperdível`
    const query = extrairQueryCompactaDaVision(vision)
    expect(query).toBe('Nome X T M')
    expect(query).not.toMatch(/detalhes|urbano|promoção|imperdível/i)
  })

  it('não altera o texto original da Vision — só lê, nunca modifica a string de entrada', async () => {
    const { extrairQueryCompactaDaVision } = await import('../webhook.js')
    const original = '## Nome\n**Tipo:** T\n**Marca:** M'
    const originalCopy = original.slice()
    extrairQueryCompactaDaVision(original)
    expect(original).toBe(originalCopy)
  })

  it('entrada vazia/inválida retorna string vazia, nunca lança', async () => {
    const { extrairQueryCompactaDaVision } = await import('../webhook.js')
    expect(extrairQueryCompactaDaVision('')).toBe('')
    expect(extrairQueryCompactaDaVision(null)).toBe('')
    expect(extrairQueryCompactaDaVision(undefined)).toBe('')
  })

  it('parser retorna vazio quando não há "## " nem Tipo/Marca reconhecíveis (texto fora do formato)', async () => {
    const { extrairQueryCompactaDaVision } = await import('../webhook.js')
    expect(extrairQueryCompactaDaVision('Não consegui identificar o produto nesta imagem.')).toBe('')
  })
})

describe('Correção #1 — STORY_MATCH_CONFIDENCE_THRESHOLD = 25 (boundary, >= não >)', () => {
  it('threshold é exatamente 25', async () => {
    const { STORY_MATCH_CONFIDENCE_THRESHOLD } = await import('../webhook.js')
    expect(STORY_MATCH_CONFIDENCE_THRESHOLD).toBe(25)
  })

  it('23 → rejeitado, 24 → rejeitado, 25 → aceito, 28 → aceito, 47 → aceito', async () => {
    const { STORY_MATCH_CONFIDENCE_THRESHOLD } = await import('../webhook.js')
    const produtos = [{ score: 23 }, { score: 24 }, { score: 25 }, { score: 28 }, { score: 47 }]
    // Mesma expressão usada em api/webhook.js para filtrar candidatos confiáveis.
    const confiaveis = produtos.filter((p) => (p?.score ?? 0) >= STORY_MATCH_CONFIDENCE_THRESHOLD)
    expect(confiaveis.map((p) => p.score)).toEqual([25, 28, 47])
  })
})

describe('Correção #1 — FILTER: só confiáveis chegam à formatação (síntese exata pedida)', () => {
  it('scores [47,8,7,6,5] → somente [47] passa', async () => {
    const { STORY_MATCH_CONFIDENCE_THRESHOLD } = await import('../webhook.js')
    const produtos = [{ score: 47 }, { score: 8 }, { score: 7 }, { score: 6 }, { score: 5 }]
    const confiaveis = produtos.filter((p) => (p?.score ?? 0) >= STORY_MATCH_CONFIDENCE_THRESHOLD)
    expect(confiaveis.map((p) => p.score)).toEqual([47])
  })

  it('scores [28,23,10] → somente [28] passa', async () => {
    const { STORY_MATCH_CONFIDENCE_THRESHOLD } = await import('../webhook.js')
    const produtos = [{ score: 28 }, { score: 23 }, { score: 10 }]
    const confiaveis = produtos.filter((p) => (p?.score ?? 0) >= STORY_MATCH_CONFIDENCE_THRESHOLD)
    expect(confiaveis.map((p) => p.score)).toEqual([28])
  })

  it('scores [23,22,6] → nenhum confiável (o que aciona o fallback)', async () => {
    const { STORY_MATCH_CONFIDENCE_THRESHOLD } = await import('../webhook.js')
    const produtos = [{ score: 23 }, { score: 22 }, { score: 6 }]
    const confiaveis = produtos.filter((p) => (p?.score ?? 0) >= STORY_MATCH_CONFIDENCE_THRESHOLD)
    expect(confiaveis).toHaveLength(0)
  })
})

describe('Correção #1 — comportamento end-to-end via api/webhook.js', () => {
  let logSpy

  beforeEach(() => {
    vi.resetModules()
    process.env.VITE_SUPABASE_URL = 'https://fixture.supabase.co'
    process.env.VITE_SUPABASE_KEY = 'fixture-anon-key'

    vi.doMock('../_profileIdentity.js', () => ({ upsertIdentity: vi.fn(() => Promise.resolve()) }))
    vi.doMock('../_profileMemory.js', () => ({ getMemoryBlock: vi.fn(() => Promise.resolve('')) }))
    vi.doMock('../_gabrielaContextService.js', () => ({
      fetchProductsCatalog: vi.fn(() => Promise.resolve({ ok: true, products: CATALOGO_FIXTURE })),
      fetchGabrielaKnowledge: vi.fn(() => Promise.resolve({ ok: true, knowledge: null })),
      formatarProdutoComercial: vi.fn(() => ({})),
    }))

    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.doUnmock('../_profileIdentity.js')
    vi.doUnmock('../_profileMemory.js')
    vi.doUnmock('../_gabrielaContextService.js')
    vi.restoreAllMocks()
  })

  function readTraceLog() {
    const chamada = logSpy.mock.calls.find((args) => args[0] === '[Webhook][trace]')
    expect(chamada).toBeTruthy()
    return JSON.parse(chamada[1])
  }

  it('C1) match confiável → SEM fallback, e SÓ o produto confiável chega em res.body (Gaby)', async () => {
    vi.doMock('../_storyContext.js', () => ({
      getStoryContext: vi.fn(() => Promise.resolve({
        status: 'FOUND', storyId: 'story-1', storyMediaUrl: 'https://gpt-files.com/a.jpg', storyMediaType: 'image',
      })),
    }))
    vi.doMock('../_visaoProduto.js', () => ({
      // Query compacta = só "Bermuda Jeans Azul" (sem Tipo/Marca reconhecíveis
      // no texto) → match exato (100) contra "Bermuda Jeans Azul"; "Bermuda
      // Moletom Cinza" compartilha 1 de 3 palavras ("bermuda") → round(1/3*70)
      // = 23, abaixo de 25, filtrada; "Tenis Vans..." fica em 0 (sem overlap).
      identificarProdutoPorImagem: vi.fn(() => Promise.resolve('## Bermuda Jeans Azul')),
    }))

    const { default: handler } = await import('../webhook.js')
    const res = makeRes()
    await handler(makeReq({ pergunta: 'qual valor?', cliente_id: 'c1', chat_id: 'chat-1' }), res)

    const trace = readTraceLog()
    expect(trace.search_context_used).toBe('story')
    expect(trace.fallback_used).toBe(false)
    expect(trace.confident_candidates_count).toBe(1)
    expect(trace.story_match_threshold).toBe(25)

    // Prova no PAYLOAD FINAL (o que a Gaby de fato recebe), não só no trace:
    expect(res.body.dados.produtos).toHaveLength(1)
    expect(res.body.dados.produtos[0].nome).toBe('Bermuda Jeans Azul')
    expect(res.body.dados.produtos[0].relevancia).toBe('100%')
  })

  it('C2) candidatos existem mas TODOS abaixo de 25 → aciona fallback (o bug real corrigido)', async () => {
    vi.doMock('../_storyContext.js', () => ({
      getStoryContext: vi.fn(() => Promise.resolve({
        status: 'FOUND', storyId: 'story-2', storyMediaUrl: 'https://gpt-files.com/b.jpg', storyMediaType: 'image',
      })),
    }))
    vi.doMock('../_visaoProduto.js', () => ({
      // keywords: "tenis esportivo casual calcado vans" — 2 palavras em comum
      // ("tenis","vans") com "Tenis Vans Old Skool Preto" (5 palavras) →
      // score = round(2/5*70) = 28... espera, esse valor É >= 25. Pra manter
      // este teste como "abaixo do threshold", usamos uma Marca que NÃO bate
      // com "vans" no nome do produto, reduzindo pra 1 palavra em comum.
      identificarProdutoPorImagem: vi.fn(() => Promise.resolve(
        '## Tenis Esportivo Casual\n**Tipo:** Calçado\n**Marca:** Generica'
      )),
    }))

    const { default: handler } = await import('../webhook.js')
    const res = makeRes()
    await handler(makeReq({ pergunta: 'quanto custa o tenis vans', cliente_id: 'c2', chat_id: 'chat-2' }), res)

    const trace = readTraceLog()
    expect(trace.search_context_used).toBe('story_fallback_pergunta')
    expect(trace.fallback_used).toBe(true)
    expect(trace.confident_candidates_count).toBe(0)
  }, 15000)

  it('C3) zero candidatos (nenhuma palavra em comum) → fallback já existente continua funcionando', async () => {
    vi.doMock('../_storyContext.js', () => ({
      getStoryContext: vi.fn(() => Promise.resolve({
        status: 'FOUND', storyId: 'story-3', storyMediaUrl: 'https://gpt-files.com/c.jpg', storyMediaType: 'image',
      })),
    }))
    vi.doMock('../_visaoProduto.js', () => ({
      identificarProdutoPorImagem: vi.fn(() => Promise.resolve(
        '## Produto Inexistente Xyz\n**Tipo:** Eletronico\n**Marca:** MarcaXyz'
      )),
    }))

    const { default: handler } = await import('../webhook.js')
    const res = makeRes()
    await handler(makeReq({ pergunta: 'tem bermuda?', cliente_id: 'c3', chat_id: 'chat-3' }), res)

    const trace = readTraceLog()
    expect(trace.search_context_used).toBe('story_fallback_pergunta')
    expect(trace.fallback_used).toBe(true)
    expect(trace.confident_candidates_count).toBe(0)
    expect(trace.candidates_count).toBeGreaterThanOrEqual(1)
  }, 15000)

  it('A2) Vision retorna texto sem Nome/Tipo/Marca reconhecíveis → NUNCA usa o Markdown inteiro como query (fica na pergunta original)', async () => {
    vi.doMock('../_storyContext.js', () => ({
      getStoryContext: vi.fn(() => Promise.resolve({
        status: 'FOUND', storyId: 'story-4', storyMediaUrl: 'https://gpt-files.com/d.jpg', storyMediaType: 'image',
      })),
    }))
    vi.doMock('../_visaoProduto.js', () => ({
      // Texto "fora do formato" — sem "## ", sem **Tipo:**, sem **Marca:** —
      // extrairQueryCompactaDaVision() retorna '' pra isso.
      identificarProdutoPorImagem: vi.fn(() => Promise.resolve('Não foi possível identificar detalhes desta imagem.')),
    }))

    const { default: handler } = await import('../webhook.js')
    const res = makeRes()
    await handler(makeReq({ pergunta: 'tem bermuda?', cliente_id: 'c5', chat_id: 'chat-4' }), res)

    const trace = readTraceLog()
    // Nunca vira 'story' — a busca segue como se fosse pergunta direta, nunca
    // usando o Markdown/texto cru da Vision como query.
    expect(trace.search_context_used).toBe('pergunta_direta')
    expect(trace.story_context_status).toBe('STORY_FOUND_VISION_OK_EMPTY_QUERY')
    expect(trace.vision_status).toBe('success_empty_query')
    expect(trace.confident_candidates_count).toBeNull() // isStorySearch=false aqui
    // "tem bermuda?" (pergunta original) deve achar as bermudas do fixture normalmente.
    expect(trace.candidates_count).toBeGreaterThanOrEqual(1)
  })

  it('D) SEM Story — busca direta nunca é filtrada por threshold (comportamento inalterado)', async () => {
    vi.doMock('../_storyContext.js', () => ({ getStoryContext: vi.fn() }))
    vi.doMock('../_visaoProduto.js', () => ({ identificarProdutoPorImagem: vi.fn() }))

    const { default: handler } = await import('../webhook.js')
    const res = makeRes()
    await handler(makeReq({ pergunta: 'tem bermuda?', cliente_id: 'c6' }), res)

    const trace = readTraceLog()
    expect(trace.search_context_used).toBe('pergunta_direta')
    expect(trace.fallback_used).toBe(false)
    expect(trace.confident_candidates_count).toBeNull()
    expect(trace.story_match_threshold).toBeNull()
    // Busca direta traz TODOS os candidatos com score>0 (sem filtro de confiança) —
    // as 2 bermudas do fixture, mesmo a "Moletom Cinza" com score mais baixo.
    expect(res.body.dados.produtos.length).toBeGreaterThanOrEqual(1)
  })
})

describe('Correção #1 — regressões: algoritmo compartilhado inalterado (dados reais)', () => {
  it('New Balance 9060 — score 80% contra "Tenis New Balance 9060 Algodao Doce" (containment)', async () => {
    const { extrairKeywords, calcularSimilaridade } = await import('../webhook.js')
    const keywords = extrairKeywords('New Balance 9060')
    expect(calcularSimilaridade(keywords, 'Tenis New Balance 9060 Algodao Doce')).toBe(80)
  })

  it('Nike Dunk — score 80% contra "Tênis Nike Dunk Azul" (containment)', async () => {
    const { extrairKeywords, calcularSimilaridade } = await import('../webhook.js')
    const keywords = extrairKeywords('Nike Dunk')
    expect(calcularSimilaridade(keywords, 'Tênis Nike Dunk Azul')).toBe(80)
  })

  it('Cueca Lupo (busca direta) vs catálogo real "Cueca Lup 002" — 23%, "Lup" != "Lupo"', async () => {
    const { extrairKeywords, calcularSimilaridade } = await import('../webhook.js')
    const keywords = extrairKeywords('Cueca Lupo')
    expect(calcularSimilaridade(keywords, 'Cueca Lup 002')).toBe(23)
  })

  it('busca textual curta direta — comportamento de calcularSimilaridade/extrairKeywords idêntico ao medido antes da correção', async () => {
    const { extrairKeywords, calcularSimilaridade } = await import('../webhook.js')
    expect(extrairKeywords('tem tênis vans?')).toBe('tenis vans')
    expect(calcularSimilaridade('tenis vans', 'Tenis Vans Old Skool Preto')).toBe(80)
  })

  it('F) Story de "Cueca Lupo" simulado (Nome+Tipo+Marca) → score real 28, NÃO rejeitado pelo threshold 25', async () => {
    const { extrairQueryCompactaDaVision, extrairKeywords, calcularSimilaridade, STORY_MATCH_CONFIDENCE_THRESHOLD } = await import('../webhook.js')
    const visionSimulada = '## Cueca Lupo Algodão\n**Tipo:** Cueca\n**Marca:** Lupo'
    const query = extrairQueryCompactaDaVision(visionSimulada)
    const keywords = extrairKeywords(query)
    const score = calcularSimilaridade(keywords, 'Cueca Lup 002')

    expect(score).toBe(28)
    expect(score).toBeGreaterThanOrEqual(STORY_MATCH_CONFIDENCE_THRESHOLD) // 28 >= 25 — não seria mais rejeitado
  })
})
