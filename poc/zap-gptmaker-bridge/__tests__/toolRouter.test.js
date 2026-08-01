// Testes permanentes do Tool Router (Fase 3, Etapa 3.2 + 3.4).
// 100% local — sem I/O, sem rede, sem Supabase, sem GPTMaker, sem ZAP-API.
// A maioria das ferramentas usadas aqui são fixtures de teste — a exceção é
// o bloco "Registry" abaixo, que passou a exercer a ferramenta real
// consultar_produto (registrada na Etapa 3.4, sem requestToolApi configurado,
// logo sem nenhum caminho de rede real).
import { describe, it, expect, vi } from 'vitest'
import { routeTools } from '../toolRouter.js'
import { getRegisteredTools, createToolRegistry } from '../tools/index.js'
import { isValidMatchResult, isValidToolResult, isValidToolDefinition } from '../tools/contract.js'

function makeTool(overrides = {}) {
  return {
    name: 'fake_tool',
    match: () => ({ matched: true, confidence: 0.9 }),
    execute: async () => ({ ok: true, found: true, results: [] }),
    ...overrides,
  }
}

describe('Registry — real, congelado (Etapa 3.4)', () => {
  it('createToolRegistry() sem deps devolve array congelado, contendo só consultar_produto', () => {
    const registry = createToolRegistry()
    expect(Array.isArray(registry)).toBe(true)
    expect(registry.length).toBe(1)
    expect(registry[0].name).toBe('consultar_produto')
    expect(Object.isFrozen(registry)).toBe(true)
  })

  it('getRegisteredTools() devolve um registry equivalente (mesma ferramenta, array próprio)', () => {
    const registry = getRegisteredTools()
    expect(registry).toHaveLength(1)
    expect(registry[0].name).toBe('consultar_produto')
    expect(Object.isFrozen(registry)).toBe(true)
  })
})

describe('A. registry vazio (array literal) → nenhuma ferramenta, hasContext=false', () => {
  it('routeTools com tools=[] devolve o resultado padrão', async () => {
    const result = await routeTools('Tem Nike Dunk?', { messageId: 'a1' }, [])
    expect(result.matchedTools).toEqual([])
    expect(result.skippedTools).toEqual([])
    expect(result.hasContext).toBe(false)
  })

  it('routeTools com o registry real (consultar_produto, sem requestToolApi configurado) — casa mas não tem contexto útil', async () => {
    const result = await routeTools('Tem Nike Dunk?', { messageId: 'a2' }, getRegisteredTools())
    expect(result.skippedTools).toEqual([])
    expect(result.matchedTools).toHaveLength(1)
    expect(result.matchedTools[0].name).toBe('consultar_produto')
    // Sem requestToolApi configurado (deliberado nesta etapa), execute()
    // sempre devolve ok:false/tool_not_configured — nunca uma chamada real.
    expect(result.matchedTools[0].result.ok).toBe(false)
    expect(result.matchedTools[0].result.error.code).toBe('tool_not_configured')
    expect(result.hasContext).toBe(false)
  })
})

describe('B. uma ferramenta casa e executa', () => {
  it('ferramenta com matched=true e confidence suficiente é executada', async () => {
    const tool = makeTool({
      name: 'produto_tool',
      match: () => ({ matched: true, confidence: 0.8, params: { query: 'nike' } }),
      execute: async (params) => ({ ok: true, found: true, results: [params.query] }),
    })
    const result = await routeTools('Tem Nike Dunk?', { messageId: 'b1' }, [tool])
    expect(result.matchedTools).toHaveLength(1)
    expect(result.matchedTools[0].name).toBe('produto_tool')
    expect(result.matchedTools[0].confidence).toBe(0.8)
    expect(result.matchedTools[0].params).toEqual({ query: 'nike' })
    expect(result.matchedTools[0].result).toEqual({ ok: true, found: true, results: ['nike'] })
    expect(result.hasContext).toBe(true)
    expect(result.skippedTools).toEqual([])
  })
})

describe('C. matched=false → não executa', () => {
  it('ferramenta descartada, execute nunca chamado', async () => {
    const execute = vi.fn()
    const tool = makeTool({ name: 'no_match_tool', match: () => ({ matched: false, confidence: 0 }), execute })
    const result = await routeTools('Oi', { messageId: 'c1' }, [tool])
    expect(execute).not.toHaveBeenCalled()
    expect(result.matchedTools).toEqual([])
    expect(result.skippedTools).toEqual([{ name: 'no_match_tool', reason: 'not_matched' }])
    expect(result.hasContext).toBe(false)
  })
})

describe('D. confidence abaixo do mínimo → não executa', () => {
  it('confidence 0.3 com limiar padrão 0.6 é descartada', async () => {
    const execute = vi.fn()
    const tool = makeTool({ name: 'low_conf_tool', match: () => ({ matched: true, confidence: 0.3 }), execute })
    const result = await routeTools('Oi', { messageId: 'd1' }, [tool])
    expect(execute).not.toHaveBeenCalled()
    expect(result.skippedTools).toEqual([{ name: 'low_conf_tool', reason: 'below_min_confidence' }])
  })
})

describe('E. minConfidence da ferramenta sobrescreve o padrão', () => {
  it('confidence 0.5 passa quando minConfidence da ferramenta é 0.4', async () => {
    const tool = makeTool({ name: 'custom_threshold_tool', minConfidence: 0.4, match: () => ({ matched: true, confidence: 0.5 }) })
    const result = await routeTools('Oi', { messageId: 'e1' }, [tool])
    expect(result.matchedTools).toHaveLength(1)
    expect(result.matchedTools[0].name).toBe('custom_threshold_tool')
  })

  it('confidence 0.5 é descartada quando minConfidence da ferramenta é 0.9', async () => {
    const tool = makeTool({ name: 'strict_tool', minConfidence: 0.9, match: () => ({ matched: true, confidence: 0.5 }) })
    const result = await routeTools('Oi', { messageId: 'e2' }, [tool])
    expect(result.skippedTools).toEqual([{ name: 'strict_tool', reason: 'below_min_confidence' }])
  })
})

describe('F. duas ferramentas de grupos diferentes → ambas executam', () => {
  it('sem conflito entre groups distintos', async () => {
    const toolA = makeTool({ name: 'tool_a', group: 'produto', match: () => ({ matched: true, confidence: 0.7 }) })
    const toolB = makeTool({ name: 'tool_b', group: 'frete', match: () => ({ matched: true, confidence: 0.7 }) })
    const result = await routeTools('Oi', { messageId: 'f1' }, [toolA, toolB])
    const names = result.matchedTools.map((t) => t.name).sort()
    expect(names).toEqual(['tool_a', 'tool_b'])
    expect(result.skippedTools).toEqual([])
  })
})

describe('G. duas do mesmo group → só maior confidence executa', () => {
  it('vence a de maior confidence, a outra é descartada com motivo', async () => {
    const toolA = makeTool({ name: 'tool_a', group: 'produto', match: () => ({ matched: true, confidence: 0.7 }) })
    const toolB = makeTool({ name: 'tool_b', group: 'produto', match: () => ({ matched: true, confidence: 0.95 }) })
    const result = await routeTools('Oi', { messageId: 'g1' }, [toolA, toolB])
    expect(result.matchedTools).toHaveLength(1)
    expect(result.matchedTools[0].name).toBe('tool_b')
    expect(result.skippedTools).toEqual([{ name: 'tool_a', reason: 'group_conflict_lost' }])
  })
})

describe('H. empate no mesmo group → regra determinística', () => {
  it('em confidence igual, vence o nome alfabeticamente menor, sempre', async () => {
    const toolZ = makeTool({ name: 'zebra_tool', group: 'produto', match: () => ({ matched: true, confidence: 0.8 }) })
    const toolA = makeTool({ name: 'abacaxi_tool', group: 'produto', match: () => ({ matched: true, confidence: 0.8 }) })
    const r1 = await routeTools('Oi', { messageId: 'h1' }, [toolZ, toolA])
    const r2 = await routeTools('Oi', { messageId: 'h2' }, [toolA, toolZ])
    expect(r1.matchedTools).toHaveLength(1)
    expect(r1.matchedTools[0].name).toBe('abacaxi_tool')
    expect(r2.matchedTools).toHaveLength(1)
    expect(r2.matchedTools[0].name).toBe('abacaxi_tool')
  })
})

describe('I. match lança → erro isolado, demais continuam', () => {
  it('ferramenta com match() que lança é descartada, outras seguem normalmente', async () => {
    const throwingTool = makeTool({
      name: 'throwing_tool',
      match: () => {
        throw new Error('boom')
      },
    })
    const okTool = makeTool({ name: 'ok_tool', match: () => ({ matched: true, confidence: 0.9 }) })
    const result = await routeTools('Oi', { messageId: 'i1' }, [throwingTool, okTool])
    expect(result.skippedTools).toContainEqual({ name: 'throwing_tool', reason: 'match_threw' })
    expect(result.matchedTools).toHaveLength(1)
    expect(result.matchedTools[0].name).toBe('ok_tool')
  })
})

describe('J. match inválido → descartado com motivo', () => {
  it('match() devolve formato fora do contrato', async () => {
    const badTool = makeTool({ name: 'bad_match_tool', match: () => ({ matched: 'sim', confidence: '0.9' }) })
    const result = await routeTools('Oi', { messageId: 'j1' }, [badTool])
    expect(result.skippedTools).toEqual([{ name: 'bad_match_tool', reason: 'match_invalid_result' }])
    expect(isValidMatchResult({ matched: 'sim', confidence: '0.9' })).toBe(false)
  })
})

describe('K. execute lança → erro estruturado, sem derrubar as demais', () => {
  it('ferramenta cujo execute() lança devolve result.ok=false com código, outras seguem', async () => {
    const throwingExecTool = makeTool({
      name: 'throwing_exec_tool',
      execute: async () => {
        throw new Error('falha interna sensível, nunca deveria vazar')
      },
    })
    const okTool = makeTool({ name: 'ok_tool_2', match: () => ({ matched: true, confidence: 0.9 }) })
    const result = await routeTools('Oi', { messageId: 'k1' }, [throwingExecTool, okTool])
    const failed = result.matchedTools.find((t) => t.name === 'throwing_exec_tool')
    expect(failed.result.ok).toBe(false)
    expect(failed.result.error.code).toBe('execute_threw')
    expect(JSON.stringify(failed.result)).not.toContain('sensível')
    const okResult = result.matchedTools.find((t) => t.name === 'ok_tool_2')
    expect(okResult.result.ok).toBe(true)
  })
})

describe('L. execute retorna formato inválido → erro estruturado', () => {
  it('execute() devolve algo fora do contrato de ToolResult', async () => {
    const badResultTool = makeTool({ name: 'bad_result_tool', execute: async () => ({ ok: 'yes' }) })
    const result = await routeTools('Oi', { messageId: 'l1' }, [badResultTool])
    expect(result.matchedTools[0].result.ok).toBe(false)
    expect(result.matchedTools[0].result.error.code).toBe('execute_invalid_result')
    expect(isValidToolResult({ ok: 'yes' })).toBe(false)
  })
})

describe('M. params são preservados', () => {
  it('params de match() chegam intactos até o result final', async () => {
    const tool = makeTool({
      name: 'params_tool',
      match: () => ({ matched: true, confidence: 0.9, params: { size: '41', color: 'preto' } }),
      execute: async (params) => ({ ok: true, results: [params] }),
    })
    const result = await routeTools('Oi', { messageId: 'm1' }, [tool])
    expect(result.matchedTools[0].params).toEqual({ size: '41', color: 'preto' })
    expect(result.matchedTools[0].result.results[0]).toEqual({ size: '41', color: 'preto' })
  })
})

describe('N. inputs não são modificados', () => {
  it('messageText, context e a lista de tools não são mutados', async () => {
    const messageText = 'Tem Nike Dunk 41?'
    const context = Object.freeze({ messageId: 'n1' })
    const tool = Object.freeze(makeTool({ name: 'immutable_tool' }))
    const tools = Object.freeze([tool])
    await routeTools(messageText, context, tools)
    expect(messageText).toBe('Tem Nike Dunk 41?')
    expect(context).toEqual({ messageId: 'n1' })
    expect(tools).toEqual([tool])
  })
})

describe('O. mesma entrada produz seleção determinística', () => {
  it('três execuções seguidas produzem o mesmo resultado estrutural', async () => {
    const toolA = makeTool({ name: 'tool_a', group: 'produto', match: () => ({ matched: true, confidence: 0.7 }) })
    const toolB = makeTool({ name: 'tool_b', group: 'produto', match: () => ({ matched: true, confidence: 0.7 }) })
    const r1 = await routeTools('Oi', { messageId: 'o1' }, [toolA, toolB])
    const r2 = await routeTools('Oi', { messageId: 'o1' }, [toolA, toolB])
    const r3 = await routeTools('Oi', { messageId: 'o1' }, [toolA, toolB])
    expect(r1.matchedTools.map((t) => t.name)).toEqual(r2.matchedTools.map((t) => t.name))
    expect(r2.matchedTools.map((t) => t.name)).toEqual(r3.matchedTools.map((t) => t.name))
  })
})

describe('P. zero fetch/chamada externa', () => {
  it('nenhuma chamada de rede é feita pelo Tool Router', async () => {
    const fetchSpy = vi.fn()
    const originalFetch = global.fetch
    global.fetch = fetchSpy
    try {
      const tool = makeTool({ name: 'no_network_tool' })
      await routeTools('Tem Nike Dunk?', { messageId: 'p1' }, [tool])
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      global.fetch = originalFetch
    }
  })
})

describe('Q. nenhuma dependência de segredo/env', () => {
  it('resultado idêntico com env stubado vazio', async () => {
    const tool = makeTool({ name: 'env_independent_tool' })
    const before = await routeTools('Oi', { messageId: 'q1' }, [tool])
    vi.stubEnv('SUPABASE_SECRET_KEY', '')
    vi.stubEnv('GPT_TOKEN', '')
    const after = await routeTools('Oi', { messageId: 'q1' }, [tool])
    vi.unstubAllEnvs()
    expect(after.matchedTools.map((t) => t.name)).toEqual(before.matchedTools.map((t) => t.name))
  })
})

describe('Validação de definição de ferramenta inválida', () => {
  it('ferramenta sem name/match/execute válidos é descartada com motivo, não derruba as demais', async () => {
    const invalidTool = { name: '', match: () => {}, execute: async () => {} }
    const okTool = makeTool({ name: 'ok_tool_3' })
    const result = await routeTools('Oi', { messageId: 'inv1' }, [invalidTool, okTool])
    expect(result.skippedTools).toContainEqual({ name: 'invalid_tool', reason: 'tool_definition_invalid' })
    expect(result.matchedTools).toHaveLength(1)
    expect(result.matchedTools[0].name).toBe('ok_tool_3')
    expect(isValidToolDefinition(invalidTool)).toBe(false)
  })

  it('A. name ausente → invalid_tool', async () => {
    const tool = { match: () => {}, execute: async () => {} }
    const result = await routeTools('Oi', { messageId: 'name-a' }, [tool])
    expect(result.skippedTools).toEqual([{ name: 'invalid_tool', reason: 'tool_definition_invalid' }])
  })

  it('B. name null → invalid_tool', async () => {
    const tool = { name: null, match: () => {}, execute: async () => {} }
    const result = await routeTools('Oi', { messageId: 'name-b' }, [tool])
    expect(result.skippedTools).toEqual([{ name: 'invalid_tool', reason: 'tool_definition_invalid' }])
  })

  it('C. name numérico → invalid_tool', async () => {
    const tool = { name: 42, match: () => {}, execute: async () => {} }
    const result = await routeTools('Oi', { messageId: 'name-c' }, [tool])
    expect(result.skippedTools).toEqual([{ name: 'invalid_tool', reason: 'tool_definition_invalid' }])
  })

  it('D. name vazio → invalid_tool', async () => {
    const tool = { name: '', match: () => {}, execute: async () => {} }
    const result = await routeTools('Oi', { messageId: 'name-d' }, [tool])
    expect(result.skippedTools).toEqual([{ name: 'invalid_tool', reason: 'tool_definition_invalid' }])
  })

  it('E. name apenas com espaços → invalid_tool', async () => {
    const tool = { name: '   ', match: () => {}, execute: async () => {} }
    const result = await routeTools('Oi', { messageId: 'name-e' }, [tool])
    expect(result.skippedTools).toEqual([{ name: 'invalid_tool', reason: 'tool_definition_invalid' }])
  })

  it('F. name válido é preservado (inclusive após trim, sem alterar nomes corretos)', async () => {
    const tool = makeTool({ name: 'consultar_produto', match: () => ({ matched: true, confidence: 0.9 }) })
    const result = await routeTools('Oi', { messageId: 'name-f' }, [tool])
    expect(result.matchedTools).toHaveLength(1)
    expect(result.matchedTools[0].name).toBe('consultar_produto')
    expect(result.skippedTools).toEqual([])
  })

  it('F2. name válido com espaços nas bordas é preservado após trim', async () => {
    const tool = { name: '  consultar_produto  ', match: () => ({ matched: false, confidence: 0 }), execute: async () => ({ ok: true }) }
    const result = await routeTools('Oi', { messageId: 'name-f2' }, [tool])
    expect(result.skippedTools).toEqual([{ name: 'consultar_produto', reason: 'not_matched' }])
  })
})
