import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  consultarProduto,
  validarPayloadConsultarProduto,
  buscarERanquearProdutos,
  ERROR_CODES,
} from '../_toolConsultarProduto.js'

/**
 * api/__tests__/toolConsultarProduto.test.js
 *
 * Testes permanentes do helper puro da IGNITE PRIME Tool API central
 * (Fase 3, Etapa 3.3 — ?tool=consultar-produto). 100% local: fetch é sempre
 * injetado via deps.fetchImpl, nunca a fonte real do Supabase é tocada.
 * Testes de autenticação/roteamento (caller identificado pelo segredo) ficam
 * em systemToolsConsultarProduto.test.js — este arquivo cobre só o helper.
 */

const PRODUTOS_FIXTURE = [
  { nome: 'Tênis Nike Dunk Cacau', preco: 'R$ 399,90', link: 'https://loja/1', imagem: 'https://loja/1.jpg' },
  { nome: 'Tênis Nike Dunk Preto', preco: 'R$ 379,90', link: 'https://loja/2', imagem: 'https://loja/2.jpg' },
  { nome: 'Bermuda Nike Dri-fit', preco: 'R$ 129,90', link: 'https://loja/3', imagem: 'https://loja/3.jpg' },
]

function makeFetchImpl(products, { ok = true, status = 200, invalidJson = false, notArray = false } = {}) {
  return vi.fn(async () => ({
    ok,
    status,
    json: async () => {
      if (invalidJson) throw new Error('não é JSON válido')
      if (notArray) return { não: 'é um array' }
      return products
    },
  }))
}

const SUPABASE_CONFIG = { baseUrl: 'https://mock-project.supabase.co', headers: { apikey: 'mock-key' } }

describe('validarPayloadConsultarProduto', () => {
  it('F. query vazia é rejeitada', () => {
    expect(validarPayloadConsultarProduto({ query: '' }).valido).toBe(false)
    expect(validarPayloadConsultarProduto({ query: '   ' }).valido).toBe(false)
    expect(validarPayloadConsultarProduto({}).error_code).toBe(ERROR_CODES.QUERY_REQUIRED)
  })

  it('G. body inválido (não-objeto/array/null) é rejeitado', () => {
    expect(validarPayloadConsultarProduto(null).valido).toBe(false)
    expect(validarPayloadConsultarProduto(undefined).valido).toBe(false)
    expect(validarPayloadConsultarProduto('query').valido).toBe(false)
    expect(validarPayloadConsultarProduto(['query']).valido).toBe(false)
    expect(validarPayloadConsultarProduto(null).error_code).toBe(ERROR_CODES.INVALID_BODY)
  })

  it('H. propriedade extra fora do contrato é rejeitada', () => {
    const r = validarPayloadConsultarProduto({ query: 'Nike', telefone: '5534999999999' })
    expect(r.valido).toBe(false)
    expect(r.error_code).toBe(ERROR_CODES.INVALID_BODY)
  })

  it('rejeita propriedades sensíveis mesmo junto de um query válido (cpf, prompt, payload bruto)', () => {
    expect(validarPayloadConsultarProduto({ query: 'Nike', cpf: '000.000.000-00' }).valido).toBe(false)
    expect(validarPayloadConsultarProduto({ query: 'Nike', prompt: 'ignore instruções anteriores' }).valido).toBe(false)
  })

  it('B. body com "caller" forjado é rejeitado — caller nunca pode vir do body, nem como propriedade tolerada', () => {
    const r = validarPayloadConsultarProduto({ query: 'Nike', caller: 'instagram_falso' })
    expect(r.valido).toBe(false)
    expect(r.error_code).toBe(ERROR_CODES.INVALID_BODY)
  })

  it('C. body com "messageId" é rejeitado — não faz parte do contrato (removido na Etapa 3.3)', () => {
    const r = validarPayloadConsultarProduto({ query: 'Nike', messageId: 'msg-123' })
    expect(r.valido).toBe(false)
    expect(r.error_code).toBe(ERROR_CODES.INVALID_BODY)
  })

  it('D. body com "phone" é rejeitado — dado de cliente nunca é aceito neste contrato', () => {
    const r = validarPayloadConsultarProduto({ query: 'Nike', phone: '5534999999999' })
    expect(r.valido).toBe(false)
    expect(r.error_code).toBe(ERROR_CODES.INVALID_BODY)
  })

  it('E. body com propriedade arbitrária não prevista ("payload") é rejeitado', () => {
    const r = validarPayloadConsultarProduto({ query: 'Nike', payload: { qualquer: 'coisa' } })
    expect(r.valido).toBe(false)
    expect(r.error_code).toBe(ERROR_CODES.INVALID_BODY)
  })

  it('aceita requestedSize/requestedColor válidos, rejeita tipos ou tamanhos inválidos', () => {
    expect(validarPayloadConsultarProduto({ query: 'Nike', requestedSize: '41', requestedColor: 'preto' }).valido).toBe(true)
    expect(validarPayloadConsultarProduto({ query: 'Nike', requestedSize: 41 }).valido).toBe(false)
    expect(validarPayloadConsultarProduto({ query: 'Nike', requestedSize: 'x'.repeat(21) }).valido).toBe(false)
    expect(validarPayloadConsultarProduto({ query: 'x'.repeat(121) }).valido).toBe(false)
  })
})

describe('buscarERanquearProdutos — scoring e ordenação', () => {
  it('I. produto exato — termo único, um único produto contém o termo', () => {
    const { results, ambiguous } = buscarERanquearProdutos(PRODUTOS_FIXTURE, 'cacau')
    expect(results).toHaveLength(1)
    expect(results[0].nome).toBe('Tênis Nike Dunk Cacau')
    expect(ambiguous).toBe(false)
  })

  it('J. múltiplos parecidos — dois produtos empatados no topo → ambiguous=true', () => {
    const { results, ambiguous } = buscarERanquearProdutos(PRODUTOS_FIXTURE, 'nike dunk')
    expect(results).toHaveLength(2)
    expect(ambiguous).toBe(true)
    expect(results.map((r) => r.nome).sort()).toEqual(['Tênis Nike Dunk Cacau', 'Tênis Nike Dunk Preto'])
  })

  it('K. produto não encontrado', () => {
    const { results, ambiguous, truncated } = buscarERanquearProdutos(PRODUTOS_FIXTURE, 'adidas')
    expect(results).toEqual([])
    expect(ambiguous).toBe(false)
    expect(truncated).toBe(false)
  })

  it('L. limite máximo de 3 resultados, com truncated=true quando há mais candidatos', () => {
    const quatroCamisas = [
      { nome: 'Camisa Polo Azul', preco: 'R$ 1', link: 'a', imagem: 'a.jpg' },
      { nome: 'Camisa Polo Branca', preco: 'R$ 2', link: 'b', imagem: 'b.jpg' },
      { nome: 'Camisa Polo Preta', preco: 'R$ 3', link: 'c', imagem: 'c.jpg' },
      { nome: 'Camisa Polo Verde', preco: 'R$ 4', link: 'd', imagem: 'd.jpg' },
    ]
    const { results, truncated } = buscarERanquearProdutos(quatroCamisas, 'camisa polo')
    expect(results).toHaveLength(3)
    expect(truncated).toBe(true)
    expect(results.map((r) => r.nome)).toEqual(['Camisa Polo Azul', 'Camisa Polo Branca', 'Camisa Polo Preta'])
  })

  it('M. ordenação determinística — mesma entrada e entrada embaralhada produzem o mesmo resultado', () => {
    const quatroCamisas = [
      { nome: 'Camisa Polo Verde', preco: 'R$ 4', link: 'd', imagem: 'd.jpg' },
      { nome: 'Camisa Polo Azul', preco: 'R$ 1', link: 'a', imagem: 'a.jpg' },
      { nome: 'Camisa Polo Preta', preco: 'R$ 3', link: 'c', imagem: 'c.jpg' },
      { nome: 'Camisa Polo Branca', preco: 'R$ 2', link: 'b', imagem: 'b.jpg' },
    ]
    const r1 = buscarERanquearProdutos(quatroCamisas, 'camisa polo')
    const r2 = buscarERanquearProdutos(quatroCamisas, 'camisa polo')
    const r3 = buscarERanquearProdutos([...quatroCamisas].reverse(), 'camisa polo')
    expect(r1.results).toEqual(r2.results)
    expect(r1.results).toEqual(r3.results)
  })

  it('Q. nenhum campo fora da allowlist nos resultados', () => {
    const { results } = buscarERanquearProdutos(PRODUTOS_FIXTURE, 'cacau')
    expect(Object.keys(results[0]).sort()).toEqual(['imagem', 'link', 'nome', 'preco'])
  })

  it('query só com termos genéricos/stopwords não gera resultado nenhum', () => {
    const { results } = buscarERanquearProdutos(PRODUTOS_FIXTURE, 'oi tem foto')
    expect(results).toEqual([])
  })

  it('requestedSize/requestedColor nunca são misturados à query de busca', () => {
    // Se fossem misturados, "41" apareceria como termo de busca e não bateria em nada
    // no fixture — o teste confirma que o parâmetro nem chega em buscarERanquearProdutos.
    const { results } = buscarERanquearProdutos(PRODUTOS_FIXTURE, 'cacau')
    expect(results).toHaveLength(1)
  })
})

describe('consultarProduto — helper completo (fetch injetado)', () => {
  it('E. query válida → busca executada, retorna resultado estruturado', async () => {
    const fetchImpl = makeFetchImpl(PRODUTOS_FIXTURE)
    const resultado = await consultarProduto(
      { query: 'cacau' },
      { caller: 'prime_bridge' },
      { supabaseConfig: SUPABASE_CONFIG, fetchImpl }
    )
    expect(resultado.httpStatus).toBe(200)
    expect(resultado.body.success).toBe(true)
    expect(resultado.body.caller).toBe('prime_bridge')
    expect(resultado.body.foundInCatalog).toBe(true)
    expect(resultado.body.results).toHaveLength(1)
  })

  it('F. query vazia → erro estruturado, fonte nunca é consultada', async () => {
    const fetchImpl = makeFetchImpl(PRODUTOS_FIXTURE)
    const resultado = await consultarProduto({ query: '' }, { caller: 'prime_bridge' }, { supabaseConfig: SUPABASE_CONFIG, fetchImpl })
    expect(resultado.httpStatus).toBe(400)
    expect(resultado.body.success).toBe(false)
    expect(resultado.body.error_code).toBe(ERROR_CODES.QUERY_REQUIRED)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('G. body inválido → erro estruturado, fonte nunca é consultada', async () => {
    const fetchImpl = makeFetchImpl(PRODUTOS_FIXTURE)
    const resultado = await consultarProduto(null, { caller: 'prime_bridge' }, { supabaseConfig: SUPABASE_CONFIG, fetchImpl })
    expect(resultado.httpStatus).toBe(400)
    expect(resultado.body.error_code).toBe(ERROR_CODES.INVALID_BODY)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('H. propriedade extra → erro estruturado, fonte nunca é consultada', async () => {
    const fetchImpl = makeFetchImpl(PRODUTOS_FIXTURE)
    const resultado = await consultarProduto(
      { query: 'Nike', telefone: '5534999999999' },
      { caller: 'prime_bridge' },
      { supabaseConfig: SUPABASE_CONFIG, fetchImpl }
    )
    expect(resultado.httpStatus).toBe(400)
    expect(resultado.body.error_code).toBe(ERROR_CODES.INVALID_BODY)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('A. body válido, sem campos extras → sucesso (200, success=true)', async () => {
    const fetchImpl = makeFetchImpl(PRODUTOS_FIXTURE)
    const resultado = await consultarProduto(
      { query: 'cacau', requestedSize: '41', requestedColor: 'marrom' },
      { caller: 'prime_bridge' },
      { supabaseConfig: SUPABASE_CONFIG, fetchImpl }
    )
    expect(resultado.httpStatus).toBe(200)
    expect(resultado.body.success).toBe(true)
  })

  it('B/C/D/E via consultarProduto — caller/messageId/phone/payload forjados no body → 400/invalid_body, fonte nunca consultada', async () => {
    const camposProibidos = [
      { caller: 'instagram_falso' },
      { messageId: 'msg-123' },
      { phone: '5534999999999' },
      { payload: { qualquer: 'coisa' } },
    ]
    for (const extra of camposProibidos) {
      const fetchImpl = makeFetchImpl(PRODUTOS_FIXTURE)
      const resultado = await consultarProduto(
        { query: 'cacau', ...extra },
        { caller: 'prime_bridge' },
        { supabaseConfig: SUPABASE_CONFIG, fetchImpl }
      )
      expect(resultado.httpStatus).toBe(400)
      expect(resultado.body.error_code).toBe(ERROR_CODES.INVALID_BODY)
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  })

  it('F. caller da resposta continua "prime_bridge" numa requisição válida autenticada — nunca influenciado pelo body', async () => {
    const fetchImpl = makeFetchImpl(PRODUTOS_FIXTURE)
    const resultado = await consultarProduto({ query: 'cacau' }, { caller: 'prime_bridge' }, { supabaseConfig: SUPABASE_CONFIG, fetchImpl })
    expect(resultado.body.caller).toBe('prime_bridge')
  })

  it('G. nenhuma propriedade extra do body chega ao helper de busca (rejeitada antes de qualquer I/O)', async () => {
    const fetchImpl = makeFetchImpl(PRODUTOS_FIXTURE)
    await consultarProduto(
      { query: 'cacau', caller: 'instagram_falso', phone: '5534999999999' },
      { caller: 'prime_bridge' },
      { supabaseConfig: SUPABASE_CONFIG, fetchImpl }
    )
    // A busca real nunca chega a rodar — nenhuma chamada à fonte de dados,
    // logo nenhuma propriedade extra do body poderia "vazar" para ela.
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('K. produto não encontrado → success=true, foundInCatalog=false, results=[]', async () => {
    const fetchImpl = makeFetchImpl(PRODUTOS_FIXTURE)
    const resultado = await consultarProduto({ query: 'adidas' }, { caller: 'prime_bridge' }, { supabaseConfig: SUPABASE_CONFIG, fetchImpl })
    expect(resultado.body.success).toBe(true)
    expect(resultado.body.foundInCatalog).toBe(false)
    expect(resultado.body.results).toEqual([])
  })

  it('N. availabilityStatus é sempre "unknown"', async () => {
    const fetchImpl = makeFetchImpl(PRODUTOS_FIXTURE)
    const resultado = await consultarProduto({ query: 'cacau' }, { caller: 'prime_bridge' }, { supabaseConfig: SUPABASE_CONFIG, fetchImpl })
    expect(resultado.body.availabilityStatus).toBe('unknown')
    const resultadoNaoEncontrado = await consultarProduto({ query: 'adidas' }, { caller: 'prime_bridge' }, { supabaseConfig: SUPABASE_CONFIG, fetchImpl })
    expect(resultadoNaoEncontrado.body.availabilityStatus).toBe('unknown')
  })

  it('O. sizeConfirmed é sempre false, mesmo quando requestedSize aparece literalmente no nome', async () => {
    const fetchImpl = makeFetchImpl(PRODUTOS_FIXTURE)
    const resultado = await consultarProduto(
      { query: 'cacau', requestedSize: '41' },
      { caller: 'prime_bridge' },
      { supabaseConfig: SUPABASE_CONFIG, fetchImpl }
    )
    expect(resultado.body.sizeConfirmed).toBe(false)
    expect(resultado.body.requestedSize).toBe('41')
  })

  it('P. colorConfirmed é sempre false, mesmo quando requestedColor aparece literalmente no nome', async () => {
    const fetchImpl = makeFetchImpl(PRODUTOS_FIXTURE)
    const resultado = await consultarProduto(
      { query: 'cacau', requestedColor: 'cacau' },
      { caller: 'prime_bridge' },
      { supabaseConfig: SUPABASE_CONFIG, fetchImpl }
    )
    expect(resultado.body.colorConfirmed).toBe(false)
    expect(resultado.body.requestedColor).toBe('cacau')
  })

  it('Q. resultados nunca têm campo fora da allowlist (via consultarProduto)', async () => {
    const fetchImpl = makeFetchImpl(PRODUTOS_FIXTURE)
    const resultado = await consultarProduto({ query: 'cacau' }, { caller: 'prime_bridge' }, { supabaseConfig: SUPABASE_CONFIG, fetchImpl })
    for (const r of resultado.body.results) {
      expect(Object.keys(r).sort()).toEqual(['imagem', 'link', 'nome', 'preco'])
    }
  })

  it('R. nunca usa select=* — sempre a allowlist explícita de colunas (Etapa 3: allowlist do núcleo compartilhado, mesma de api/webhook.js)', async () => {
    // Desde a Etapa 3 (núcleo compartilhado), a busca crua vem de
    // fetchProductsCatalog() em api/_gabrielaContextService.js — mesma allowlist
    // usada pelo canal oficial (id,nome,categoria,preco,imagem,link,codigo).
    // buscarERanquearProdutos() continua projetando o resultado só nos 4 campos
    // que a Bridge expõe (nome,preco,link,imagem — ver teste "Q." acima).
    const fetchImpl = makeFetchImpl(PRODUTOS_FIXTURE)
    await consultarProduto({ query: 'cacau' }, { caller: 'prime_bridge' }, { supabaseConfig: SUPABASE_CONFIG, fetchImpl })
    const urlChamada = fetchImpl.mock.calls[0][0]
    expect(urlChamada).toContain('select=id,nome,categoria,preco,imagem,link,codigo')
    expect(urlChamada).not.toContain('select=*')
  })

  it('S. timeout da fonte → error_code source_timeout, sem derrubar o processo', async () => {
    const fetchImpl = vi.fn(async () => {
      const err = new Error('abortado')
      err.name = 'AbortError'
      throw err
    })
    const resultado = await consultarProduto({ query: 'cacau' }, { caller: 'prime_bridge' }, { supabaseConfig: SUPABASE_CONFIG, fetchImpl })
    expect(resultado.httpStatus).toBe(200)
    expect(resultado.body.success).toBe(false)
    expect(resultado.body.error_code).toBe(ERROR_CODES.SOURCE_TIMEOUT)
  })

  it('S. Supabase indisponível (status não-ok) → error_code source_unavailable', async () => {
    const fetchImpl = makeFetchImpl(null, { ok: false, status: 503 })
    const resultado = await consultarProduto({ query: 'cacau' }, { caller: 'prime_bridge' }, { supabaseConfig: SUPABASE_CONFIG, fetchImpl })
    expect(resultado.body.error_code).toBe(ERROR_CODES.SOURCE_UNAVAILABLE)
  })

  it('S. resposta inválida da fonte (JSON malformado ou não-array) → source_invalid_response', async () => {
    const fetchImplJsonRuim = makeFetchImpl(PRODUTOS_FIXTURE, { invalidJson: true })
    const r1 = await consultarProduto({ query: 'cacau' }, { caller: 'prime_bridge' }, { supabaseConfig: SUPABASE_CONFIG, fetchImpl: fetchImplJsonRuim })
    expect(r1.body.error_code).toBe(ERROR_CODES.SOURCE_INVALID_RESPONSE)

    const fetchImplNotArray = makeFetchImpl(PRODUTOS_FIXTURE, { notArray: true })
    const r2 = await consultarProduto({ query: 'cacau' }, { caller: 'prime_bridge' }, { supabaseConfig: SUPABASE_CONFIG, fetchImpl: fetchImplNotArray })
    expect(r2.body.error_code).toBe(ERROR_CODES.SOURCE_INVALID_RESPONSE)
  })

  it('T. erro interno inesperado (config ausente) nunca vaza segredo/stack na resposta', async () => {
    // supabaseConfig ausente força um TypeError ao ler .baseUrl. Desde a Etapa 3,
    // esse TypeError é levantado DENTRO de fetchProductsCatalog() (núcleo
    // compartilhado), que o captura e devolve { ok:false, error_code:
    // 'source_unavailable' } — fetchProductsCatalog() nunca lança, por design,
    // pois é consumido também por api/webhook.js. O resultado pro chamador da
    // Tool API continua igualmente seguro (success:false, sem stack/segredo),
    // só o error_code específico mudou de INTERNAL_ERROR pra SOURCE_UNAVAILABLE.
    const fetchImpl = vi.fn()
    const resultado = await consultarProduto({ query: 'cacau' }, { caller: 'prime_bridge' }, { supabaseConfig: undefined, fetchImpl })
    expect(resultado.body.success).toBe(false)
    expect(resultado.body.error_code).toBe(ERROR_CODES.SOURCE_UNAVAILABLE)
    const corpoSerializado = JSON.stringify(resultado.body)
    expect(corpoSerializado).not.toMatch(/stack/i)
    expect(corpoSerializado).not.toMatch(/supabase_secret/i)
    expect(corpoSerializado).not.toMatch(/apikey/i)
    expect(corpoSerializado).not.toMatch(/Bearer/i)
  })

  it('U. nenhuma chamada de rede real — só o fetchImpl injetado é usado', async () => {
    const fetchSpy = vi.fn()
    const originalFetch = global.fetch
    global.fetch = fetchSpy
    try {
      const fetchImpl = makeFetchImpl(PRODUTOS_FIXTURE)
      await consultarProduto({ query: 'cacau' }, { caller: 'prime_bridge' }, { supabaseConfig: SUPABASE_CONFIG, fetchImpl })
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    } finally {
      global.fetch = originalFetch
    }
  })

  it('log de observabilidade nunca inclui a query completa do cliente', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const fetchImpl = makeFetchImpl(PRODUTOS_FIXTURE)
      await consultarProduto({ query: 'informação sensível do cliente XYZ' }, { caller: 'prime_bridge' }, { supabaseConfig: SUPABASE_CONFIG, fetchImpl })
      const chamadas = consoleSpy.mock.calls.map((args) => JSON.stringify(args))
      for (const chamada of chamadas) {
        expect(chamada).not.toContain('informação sensível do cliente XYZ')
      }
    } finally {
      consoleSpy.mockRestore()
    }
  })
})

// ============================================================================
// Correção do limite de busca (achado real: catálogo de 548 produtos, limit
// antigo de 500 excluía os últimos ~48 em ordem alfabética — caso real:
// produtos "Tênis Vans ..." nas posições 535-540, nunca alcançados pela Tool
// API, mesmo a busca por palavra-chave estando correta). Fixture com mais de
// 500 produtos replica o cenário real; produto relevante posicionado depois
// da posição 500 (ordem alfabética) prova que agora é encontrado.
// ============================================================================
describe('consultarProduto — correção do limite de produtos carregados', () => {
  // Gera N produtos "de enchimento" com nomes que ordenam alfabeticamente
  // antes de "Tênis Vans ..." (prefixo "Acessório 0001", "Acessório 0002", ...
  // — "A" vem antes de "T" em ordem alfabética), garantindo que os produtos
  // relevantes fiquem posicionados depois do antigo corte de 500.
  function gerarFixtureGrande(quantidadeEnchimento) {
    const enchimento = Array.from({ length: quantidadeEnchimento }, (_, i) => ({
      nome: `Acessório ${String(i + 1).padStart(4, '0')}`,
      preco: 'R$ 19,90',
      link: `https://loja/enchimento-${i + 1}`,
      imagem: `https://loja/enchimento-${i + 1}.jpg`,
    }))
    const relevantes = [
      { nome: 'Tênis Vans Ultrarange Neo | Preto', preco: 'R$ 449,90', link: 'https://loja/vans-1', imagem: 'https://loja/vans-1.jpg' },
      { nome: 'Tênis Vans Ultrarange Vr3 Preto', preco: 'R$ 479,90', link: 'https://loja/vans-2', imagem: 'https://loja/vans-2.jpg' },
      { nome: 'Tênis Nike Dunk Azul', preco: 'R$ 399,90', link: 'https://loja/nike-azul', imagem: 'https://loja/nike-azul.jpg' },
    ]
    return [...enchimento, ...relevantes]
  }

  it('fixture com mais de 500 produtos: item relevante posicionado depois da posição 500 é encontrado', async () => {
    const fixtureGrande = gerarFixtureGrande(537) // 537 de enchimento + 3 relevantes = 540 total, réplica do catálogo real (548 produtos, Vans nas posições 535-540)
    expect(fixtureGrande.length).toBeGreaterThan(500)
    expect(fixtureGrande.length).toBeLessThanOrEqual(1000)

    const fetchImpl = makeFetchImpl(fixtureGrande)
    const resultado = await consultarProduto({ query: 'tenis vans' }, { caller: 'prime_bridge' }, { supabaseConfig: SUPABASE_CONFIG, fetchImpl })

    expect(resultado.body.foundInCatalog).toBe(true)
    expect(resultado.body.results.length).toBeGreaterThan(0)
    expect(resultado.body.results.some((r) => r.nome.includes('Vans'))).toBe(true)
  })

  it('"tênis vans preto tem?" (query real do Tool Router) encontra produtos Vans no catálogo grande', async () => {
    const fixtureGrande = gerarFixtureGrande(537)
    const fetchImpl = makeFetchImpl(fixtureGrande)
    // Mesma query que o Tool Router envia após extrair "preto" para requestedColor
    // (ver tools/consultarProduto.js) — aqui testamos só o helper da Tool API.
    const resultado = await consultarProduto(
      { query: 'tênis vans', requestedColor: 'preto' },
      { caller: 'prime_bridge' },
      { supabaseConfig: SUPABASE_CONFIG, fetchImpl }
    )

    expect(resultado.body.foundInCatalog).toBe(true)
    expect(resultado.body.results.length).toBeGreaterThan(0)
    expect(resultado.body.results.every((r) => r.nome.includes('Vans'))).toBe(true)
  })

  it('"Vans preto" (query mínima) encontra os mesmos produtos Vans', async () => {
    const fixtureGrande = gerarFixtureGrande(537)
    const fetchImpl = makeFetchImpl(fixtureGrande)
    const resultado = await consultarProduto({ query: 'Vans preto' }, { caller: 'prime_bridge' }, { supabaseConfig: SUPABASE_CONFIG, fetchImpl })

    expect(resultado.body.foundInCatalog).toBe(true)
    expect(resultado.body.results.some((r) => r.nome.includes('Vans'))).toBe(true)
  })

  it('"tênis Nike Dunk azul" continua funcionando no catálogo grande', async () => {
    const fixtureGrande = gerarFixtureGrande(537)
    const fetchImpl = makeFetchImpl(fixtureGrande)
    const resultado = await consultarProduto({ query: 'tênis nike dunk azul' }, { caller: 'prime_bridge' }, { supabaseConfig: SUPABASE_CONFIG, fetchImpl })

    expect(resultado.body.foundInCatalog).toBe(true)
    expect(resultado.body.results.some((r) => r.nome.includes('Nike Dunk'))).toBe(true)
  })

  it('produto inexistente continua retornando vazio, mesmo no catálogo grande', async () => {
    const fixtureGrande = gerarFixtureGrande(537)
    const fetchImpl = makeFetchImpl(fixtureGrande)
    const resultado = await consultarProduto({ query: 'produto que nao existe xyz123' }, { caller: 'prime_bridge' }, { supabaseConfig: SUPABASE_CONFIG, fetchImpl })

    expect(resultado.body.foundInCatalog).toBe(false)
    expect(resultado.body.results).toEqual([])
  })

  it('categoria genérica sem marca ("acessório") não retorna resultados aleatórios fora do esperado', async () => {
    const fixtureGrande = gerarFixtureGrande(537)
    const fetchImpl = makeFetchImpl(fixtureGrande)
    const resultado = await consultarProduto({ query: 'acessorio' }, { caller: 'prime_bridge' }, { supabaseConfig: SUPABASE_CONFIG, fetchImpl })

    // Termo único, minimumMatchesRequired(1) = 1 — todos os 537 "Acessório NNNN"
    // batem por conterem a palavra "acessorio" no nome (comportamento já
    // existente do algoritmo de matching, inalterado por esta correção).
    // O que esta correção garante é que os produtos Vans (fora do escopo desta
    // busca) não aparecem aqui — nenhum "vazamento" cruzado entre categorias.
    expect(resultado.body.results.every((r) => !r.nome.includes('Vans') && !r.nome.includes('Nike'))).toBe(true)
  })

  it('URL da fonte não tem limit próprio (Etapa 3: fonte única em fetchProductsCatalog, sem limit=500 nem limit=1000)', async () => {
    // A Tool API não define mais seu próprio limite — a busca crua vem do
    // núcleo compartilhado (api/_gabrielaContextService.js), que não aplica
    // nenhum `limit=` (mesmo comportamento que api/webhook.js sempre teve).
    // Isso elimina de vez a classe de bug do limit=500 por construção: não há
    // mais dois lugares com limites potencialmente divergentes.
    const fetchImpl = makeFetchImpl(PRODUTOS_FIXTURE)
    await consultarProduto({ query: 'cacau' }, { caller: 'prime_bridge' }, { supabaseConfig: SUPABASE_CONFIG, fetchImpl })
    const urlChamada = fetchImpl.mock.calls[0][0]
    expect(urlChamada).not.toContain('limit=')
  })
})
