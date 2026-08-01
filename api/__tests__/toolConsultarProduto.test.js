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

  it('R. nunca usa select=* — sempre a allowlist explícita de colunas', async () => {
    const fetchImpl = makeFetchImpl(PRODUTOS_FIXTURE)
    await consultarProduto({ query: 'cacau' }, { caller: 'prime_bridge' }, { supabaseConfig: SUPABASE_CONFIG, fetchImpl })
    const urlChamada = fetchImpl.mock.calls[0][0]
    expect(urlChamada).toContain('select=nome,preco,link,imagem')
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

  it('T. erro interno inesperado nunca vaza segredo/stack na resposta', async () => {
    // supabaseConfig ausente força um TypeError ao ler .baseUrl dentro do helper —
    // simula uma falha interna inesperada não coberta pelos tratamentos específicos.
    const fetchImpl = vi.fn()
    const resultado = await consultarProduto({ query: 'cacau' }, { caller: 'prime_bridge' }, { supabaseConfig: undefined, fetchImpl })
    expect(resultado.body.success).toBe(false)
    expect(resultado.body.error_code).toBe(ERROR_CODES.INTERNAL_ERROR)
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
