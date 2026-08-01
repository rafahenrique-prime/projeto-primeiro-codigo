// Testes permanentes da ferramenta consultar_produto (Fase 3, Etapa 3.4).
// 100% local — sem I/O, sem rede, sem Supabase, sem GPTMaker, sem ZAP-API.
// requestToolApi é sempre um mock injetado; nenhum teste toca fetch global.
import { describe, it, expect, vi } from 'vitest'
import { createConsultarProdutoTool } from '../tools/consultarProduto.js'
import { getRegisteredTools, createToolRegistry } from '../tools/index.js'

const toolSemApi = createConsultarProdutoTool()

describe('match — sinais conservadores (A-E)', () => {
  it('A. marca conhecida + intenção → matched', () => {
    const r = toolSemApi.match('Tem Nike aqui?', {})
    expect(r.matched).toBe(true)
    expect(r.confidence).toBeGreaterThan(0)
  })

  it('B. categoria conhecida + intenção → matched', () => {
    const r = toolSemApi.match('Quero um tenis', {})
    expect(r.matched).toBe(true)
  })

  it('C. saudação isolada → não matched', () => {
    const r = toolSemApi.match('Oi, tudo bem?', {})
    expect(r.matched).toBe(false)
  })

  it('D. "quanto custa?" isolado → não matched (sem marca/categoria)', () => {
    const r = toolSemApi.match('Quanto custa?', {})
    expect(r.matched).toBe(false)
  })

  it('E. "tem disponível?" isolado → não matched (sem marca/categoria)', () => {
    const r = toolSemApi.match('Tem disponível?', {})
    expect(r.matched).toBe(false)
  })
})

describe('match — extração de tamanho/cor (F-H)', () => {
  it('F. extração de tamanho', () => {
    const r = toolSemApi.match('Tem tênis Nike 42?', {})
    expect(r.matched).toBe(true)
    expect(r.params.requestedSize).toBe('42')
  })

  it('G. extração de cor', () => {
    const r = toolSemApi.match('Nike Dunk azul', {})
    expect(r.matched).toBe(true)
    expect(r.params.requestedColor).toBe('azul')
  })

  it('H. tamanho e cor nunca aparecem na query principal (exemplo do plano)', () => {
    const r = toolSemApi.match('Tem Nike Dunk Cacau 41 marrom?', {})
    expect(r.matched).toBe(true)
    expect(r.params.query).toBe('Nike Dunk Cacau')
    expect(r.params.requestedSize).toBe('41')
    expect(r.params.requestedColor).toBe('marrom')
    expect(r.params.query).not.toMatch(/41|marrom/i)
  })
})

describe('match — confidence, determinismo, pureza (I-K)', () => {
  it('I. confidence correta (marca+categoria > só marca > só categoria) e sempre ≤ 1', () => {
    const ambos = toolSemApi.match('Tem tênis Nike?', {})
    const soMarca = toolSemApi.match('Tem Nike aqui?', {})
    const soCategoria = toolSemApi.match('Quero um tenis', {})
    expect(ambos.confidence).toBeLessThanOrEqual(1)
    expect(soMarca.confidence).toBeLessThanOrEqual(1)
    expect(soCategoria.confidence).toBeLessThanOrEqual(1)
    expect(ambos.confidence).toBeGreaterThan(soMarca.confidence)
    expect(soMarca.confidence).toBeGreaterThan(soCategoria.confidence)
  })

  it('J. determinismo — mesma entrada produz sempre o mesmo resultado', () => {
    const texto = 'Tem Nike Dunk Cacau 41 marrom?'
    const r1 = toolSemApi.match(texto, {})
    const r2 = toolSemApi.match(texto, {})
    const r3 = toolSemApi.match(texto, {})
    expect(r1).toEqual(r2)
    expect(r2).toEqual(r3)
  })

  it('K. não modifica os argumentos recebidos', () => {
    const texto = 'Tem Nike Dunk Cacau 41 marrom?'
    const contexto = Object.freeze({ messageId: 'msg-1' })
    expect(() => toolSemApi.match(texto, contexto)).not.toThrow()
    expect(texto).toBe('Tem Nike Dunk Cacau 41 marrom?')
    expect(contexto).toEqual({ messageId: 'msg-1' })
  })
})

describe('execute — mapeamento da resposta da Tool API (L-U)', () => {
  it('L. sucesso + produto encontrado', async () => {
    const requestToolApi = vi.fn(async () => ({
      success: true,
      foundInCatalog: true,
      availabilityStatus: 'unknown',
      requestedSize: '41',
      sizeConfirmed: false,
      requestedColor: 'marrom',
      colorConfirmed: false,
      results: [{ nome: 'Tênis Nike Dunk Cacau', preco: 'R$ 399,90', link: 'https://x/1', imagem: 'https://x/1.jpg' }],
      ambiguous: false,
      truncated: false,
    }))
    const tool = createConsultarProdutoTool({ requestToolApi })
    const result = await tool.execute({ query: 'Nike Dunk Cacau', requestedSize: '41', requestedColor: 'marrom' }, {})
    expect(result.ok).toBe(true)
    expect(result.found).toBe(true)
    expect(result.results).toHaveLength(1)
    expect(result.results[0]).toEqual({ nome: 'Tênis Nike Dunk Cacau', preco: 'R$ 399,90', link: 'https://x/1', imagem: 'https://x/1.jpg' })
  })

  it('M. sucesso + nenhum produto encontrado', async () => {
    const requestToolApi = vi.fn(async () => ({ success: true, foundInCatalog: false, results: [], ambiguous: false, truncated: false }))
    const tool = createConsultarProdutoTool({ requestToolApi })
    const result = await tool.execute({ query: 'Adidas' }, {})
    expect(result.ok).toBe(true)
    expect(result.found).toBe(false)
    expect(result.results).toEqual([])
  })

  it('N. múltiplos resultados', async () => {
    const requestToolApi = vi.fn(async () => ({
      success: true,
      foundInCatalog: true,
      results: [
        { nome: 'A', preco: '1', link: 'a', imagem: 'a.jpg' },
        { nome: 'B', preco: '2', link: 'b', imagem: 'b.jpg' },
      ],
      ambiguous: false,
      truncated: false,
    }))
    const tool = createConsultarProdutoTool({ requestToolApi })
    const result = await tool.execute({ query: 'Nike' }, {})
    expect(result.results).toHaveLength(2)
  })

  it('O. resposta ambígua', async () => {
    const requestToolApi = vi.fn(async () => ({ success: true, foundInCatalog: true, results: [], ambiguous: true, truncated: false }))
    const tool = createConsultarProdutoTool({ requestToolApi })
    const result = await tool.execute({ query: 'Nike' }, {})
    expect(result.ambiguous).toBe(true)
  })

  it('P. resposta inválida (formato inesperado) → erro estruturado, nunca lança', async () => {
    const casosInvalidos = [null, undefined, 'string crua', 42, [], {}, { success: 'sim' }]
    for (const resposta of casosInvalidos) {
      const requestToolApi = vi.fn(async () => resposta)
      const tool = createConsultarProdutoTool({ requestToolApi })
      const result = await tool.execute({ query: 'Nike' }, {})
      expect(result.ok).toBe(false)
      expect(result.error.code).toBe('invalid_response')
    }
  })

  it('Q. API retorna erro (success:false) → código de erro preservado', async () => {
    const requestToolApi = vi.fn(async () => ({ success: false, error_code: 'source_unavailable' }))
    const tool = createConsultarProdutoTool({ requestToolApi })
    const result = await tool.execute({ query: 'Nike' }, {})
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('source_unavailable')
  })

  it('R. requestToolApi lança → erro estruturado, nunca propaga a exceção', async () => {
    const requestToolApi = vi.fn(async () => {
      throw new Error('detalhe interno sensível, nunca deveria vazar')
    })
    const tool = createConsultarProdutoTool({ requestToolApi })
    const result = await tool.execute({ query: 'Nike' }, {})
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('request_failed')
    expect(JSON.stringify(result)).not.toContain('sensível')
  })

  it('F (timeout). AbortError → código próprio "timeout", nunca lança', async () => {
    const requestToolApi = vi.fn(async () => {
      const err = new Error('abortado')
      err.name = 'AbortError'
      throw err
    })
    const tool = createConsultarProdutoTool({ requestToolApi })
    await expect(tool.execute({ query: 'Nike' }, {})).resolves.not.toThrow()
    const result = await tool.execute({ query: 'Nike' }, {})
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('timeout')
    expect(JSON.stringify(result)).not.toMatch(/abortado|stack/i)
  })

  it('G (erro comum). Exceção sem AbortError → "request_failed", nunca "timeout"', async () => {
    const requestToolApi = vi.fn(async () => {
      throw new Error('falha de rede genérica')
    })
    const tool = createConsultarProdutoTool({ requestToolApi })
    const result = await tool.execute({ query: 'Nike' }, {})
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('request_failed')
  })

  it('T. allowlist preservada nos resultados', async () => {
    const requestToolApi = vi.fn(async () => ({
      success: true,
      foundInCatalog: true,
      results: [{ nome: 'A', preco: '1', link: 'a', imagem: 'a.jpg' }],
      ambiguous: false,
      truncated: false,
    }))
    const tool = createConsultarProdutoTool({ requestToolApi })
    const result = await tool.execute({ query: 'Nike' }, {})
    expect(Object.keys(result.results[0]).sort()).toEqual(['imagem', 'link', 'nome', 'preco'])
  })

  it('U. campos sensíveis/extras inesperados são descartados', async () => {
    const requestToolApi = vi.fn(async () => ({
      success: true,
      foundInCatalog: true,
      results: [{ nome: 'A', preco: '1', link: 'a', imagem: 'a.jpg', telefone: '5534999999999', headers: { Authorization: 'Bearer segredo' } }],
      ambiguous: false,
      truncated: false,
      debug: { stack: 'não deveria sobreviver' },
      caller: 'prime_bridge',
    }))
    const tool = createConsultarProdutoTool({ requestToolApi })
    const result = await tool.execute({ query: 'Nike' }, {})
    expect(Object.keys(result.results[0]).sort()).toEqual(['imagem', 'link', 'nome', 'preco'])
    expect(JSON.stringify(result)).not.toContain('5534999999999')
    expect(JSON.stringify(result)).not.toContain('segredo')
    expect(JSON.stringify(result)).not.toContain('não deveria sobreviver')
    expect(result).not.toHaveProperty('caller')
    expect(result).not.toHaveProperty('debug')
  })
})

describe('sem dependência injetada — nunca tenta rede real', () => {
  it('execute() sem requestToolApi devolve erro estruturado (tool_not_configured), nunca lança', async () => {
    const result = await toolSemApi.execute({ query: 'Nike' }, {})
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('tool_not_configured')
  })
})

describe('V/W. zero rede real, zero dependência de segredo/env', () => {
  it('V. nenhuma chamada de fetch real é feita pela ferramenta', async () => {
    const fetchSpy = vi.fn()
    const originalFetch = global.fetch
    global.fetch = fetchSpy
    try {
      toolSemApi.match('Tem Nike Dunk Cacau 41 marrom?', {})
      const requestToolApi = vi.fn(async () => ({ success: true, foundInCatalog: false, results: [] }))
      const tool = createConsultarProdutoTool({ requestToolApi })
      await tool.execute({ query: 'Nike' }, {})
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      global.fetch = originalFetch
    }
  })

  it('W. comportamento não depende de variável de ambiente/segredo', () => {
    const antes = toolSemApi.match('Tem Nike Dunk Cacau 41 marrom?', {})
    vi.stubEnv('BRIDGE_TOOLS_SECRET', 'qualquer-coisa')
    vi.stubEnv('SUPABASE_SECRET_KEY', 'qualquer-coisa')
    const depois = toolSemApi.match('Tem Nike Dunk Cacau 41 marrom?', {})
    vi.unstubAllEnvs()
    expect(depois).toEqual(antes)
  })
})

describe('registry — createToolRegistry (revisão da Etapa 3.4)', () => {
  it('A. sem dependência → ferramenta registrada, execute() devolve tool_not_configured', async () => {
    const registry = createToolRegistry()
    expect(registry).toHaveLength(1)
    expect(registry[0].name).toBe('consultar_produto')
    expect(registry[0].group).toBe('produto')
    expect(registry[0].minConfidence).toBe(0.6)
    const result = await registry[0].execute({ query: 'Nike' }, {})
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('tool_not_configured')
  })

  it('B. com requestToolApi mockado → a ferramenta usa exatamente a dependência injetada', async () => {
    const requestToolApi = vi.fn(async () => ({ success: true, foundInCatalog: true, results: [], ambiguous: false, truncated: false }))
    const registry = createToolRegistry({ requestToolApi })
    const result = await registry[0].execute({ query: 'Nike' }, {})
    expect(requestToolApi).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(true)
  })

  it('C. dois registries com dependências diferentes não compartilham estado', async () => {
    const requestToolApiA = vi.fn(async () => ({ success: true, foundInCatalog: true, results: [{ nome: 'A', preco: '1', link: 'a', imagem: 'a.jpg' }], ambiguous: false, truncated: false }))
    const requestToolApiB = vi.fn(async () => ({ success: false, error_code: 'source_unavailable' }))

    const registryA = createToolRegistry({ requestToolApi: requestToolApiA })
    const registryB = createToolRegistry({ requestToolApi: requestToolApiB })

    const resultA = await registryA[0].execute({ query: 'Nike' }, {})
    const resultB = await registryB[0].execute({ query: 'Nike' }, {})

    expect(resultA.ok).toBe(true)
    expect(resultB.ok).toBe(false)
    expect(requestToolApiA).toHaveBeenCalledTimes(1)
    expect(requestToolApiB).toHaveBeenCalledTimes(1)
    expect(registryA).not.toBe(registryB)
    expect(registryA[0]).not.toBe(registryB[0])
  })

  it('D. registry e a ferramenta registrada permanecem congelados', () => {
    const registry = createToolRegistry()
    expect(Object.isFrozen(registry)).toBe(true)
    expect(Object.isFrozen(registry[0])).toBe(true)
    expect(() => {
      registry.push({ name: 'outra' })
    }).toThrow()
  })

  it('E. nenhuma mutação dinâmica — chamadas repetidas de getRegisteredTools() são independentes e igualmente seguras', () => {
    const r1 = getRegisteredTools()
    const r2 = getRegisteredTools()
    expect(r1).not.toBe(r2) // arrays novos a cada chamada, não um singleton mutável
    expect(r1[0].name).toBe(r2[0].name)
    expect(Object.isFrozen(r1)).toBe(true)
    expect(Object.isFrozen(r2)).toBe(true)
  })
})
