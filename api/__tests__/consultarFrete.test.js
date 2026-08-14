// Testes permanentes de regressão da ferramenta MCP consultar_frete
// (api/_consultarFrete.js). 100% mockado: nenhuma chamada real à Frenet na suíte
// permanente (a validação manual controlada foi feita à parte, fora da suíte).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { consultarFrete } from '../_consultarFrete.js'

function mockFetchOnce(implementation) {
  global.fetch = vi.fn(implementation)
}

beforeEach(() => {
  vi.restoreAllMocks()
  process.env.FRENET_TOKEN = 'test-frenet-token-nao-real'
})

describe('consultarFrete — validação e normalização de entrada', () => {
  it('1. cep_destino válido sem hífen chega normalizado no payload, com ShipmentInvoiceValue=100 (valor do teste real validado)', async () => {
    mockFetchOnce(async (url, opts) => {
      const body = JSON.parse(opts.body)
      expect(body.RecipientCEP).toBe('38401216')
      expect(body.SellerCEP).toBe('01030001')
      expect(body.ShipmentInvoiceValue).toBe(100)
      expect(body.ShippingItemArray).toEqual([{ Weight: 1, Height: 10, Width: 20, Length: 25, Quantity: 1 }])
      return { ok: true, json: async () => ({ ShippingSevicesArray: [] }) }
    })
    await consultarFrete({ cep_destino: '38401216' })
  })

  it('2. cep_destino com hífen é normalizado corretamente', async () => {
    mockFetchOnce(async (url, opts) => {
      const body = JSON.parse(opts.body)
      expect(body.RecipientCEP).toBe('38401216')
      return { ok: true, json: async () => ({ ShippingSevicesArray: [] }) }
    })
    await consultarFrete({ cep_destino: '38401-216' })
  })

  it('3. envia header token e Content-Type corretos', async () => {
    mockFetchOnce(async (url, opts) => {
      expect(url).toBe('https://api.frenet.com.br/shipping/quote')
      expect(opts.method).toBe('POST')
      expect(opts.headers.token).toBe('test-frenet-token-nao-real')
      expect(opts.headers['Content-Type']).toBe('application/json')
      return { ok: true, json: async () => ({ ShippingSevicesArray: [] }) }
    })
    await consultarFrete({ cep_destino: '38401216' })
  })

  it('4. cep_destino com menos de 8 dígitos -> cep_invalido, sem chamar a Frenet', async () => {
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy
    const r = await consultarFrete({ cep_destino: '3840121' })
    expect(r.httpStatus).toBe(400)
    expect(r.body.codigo).toBe('cep_invalido')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('5. cep_destino com mais de 8 dígitos -> cep_invalido, sem chamar a Frenet', async () => {
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy
    const r = await consultarFrete({ cep_destino: '384012160' })
    expect(r.httpStatus).toBe(400)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('6. cep_destino ausente/vazio -> cep_invalido, sem chamar a Frenet', async () => {
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy
    const r = await consultarFrete({})
    expect(r.httpStatus).toBe(400)
    expect(fetchSpy).not.toHaveBeenCalled()

    const r2 = await consultarFrete({ cep_destino: '' })
    expect(r2.httpStatus).toBe(400)

    const r3 = await consultarFrete({ cep_destino: '   ' })
    expect(r3.httpStatus).toBe(400)
  })

  it('6b. cep_destino com tipo diferente de string -> cep_invalido', async () => {
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy
    const r = await consultarFrete({ cep_destino: 38401216 })
    expect(r.httpStatus).toBe(400)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('consultarFrete — configuração', () => {
  it('7. FRENET_TOKEN ausente -> servico_indisponivel, sem chamar a Frenet', async () => {
    delete process.env.FRENET_TOKEN
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy
    const r = await consultarFrete({ cep_destino: '38401216' })
    expect(r.httpStatus).toBe(200)
    expect(r.body.codigo).toBe('servico_indisponivel')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('consultarFrete — respostas da Frenet', () => {
  it('8. sucesso com 1 modalidade válida', async () => {
    mockFetchOnce(async () => ({
      ok: true,
      json: async () => ({
        ShippingSevicesArray: [
          { Carrier: 'Correios', ServiceCode: '04510', ServiceDescription: 'PAC', ShippingPrice: '32.50', DeliveryTime: '7', Error: false },
        ],
      }),
    }))
    const r = await consultarFrete({ cep_destino: '38401216' })
    expect(r.httpStatus).toBe(200)
    expect(r.body.status).toBe('ok')
    expect(r.body.cep_destino).toBe('38401-216')
    expect(r.body.opcoes).toEqual([{ codigo: '04510', servico: 'PAC', valor: 32.5, prazo_dias: 7 }])
  })

  it('9. sucesso com múltiplas modalidades válidas', async () => {
    mockFetchOnce(async () => ({
      ok: true,
      json: async () => ({
        ShippingSevicesArray: [
          { ServiceCode: '04510', ServiceDescription: 'PAC', ShippingPrice: '32.50', DeliveryTime: '7', Error: false },
          { ServiceCode: '04014', ServiceDescription: 'SEDEX', ShippingPrice: '55.00', DeliveryTime: '2', Error: false },
        ],
      }),
    }))
    const r = await consultarFrete({ cep_destino: '38401216' })
    expect(r.body.opcoes).toHaveLength(2)
  })

  it('10. filtra modalidades com Error:true, mantendo só as válidas', async () => {
    mockFetchOnce(async () => ({
      ok: true,
      json: async () => ({
        ShippingSevicesArray: [
          { ServiceCode: '04510', ServiceDescription: 'PAC', ShippingPrice: '32.50', DeliveryTime: '7', Error: false },
          { ServiceCode: '04014', ServiceDescription: 'SEDEX', Error: true, Msg: 'Serviço indisponível para este CEP' },
        ],
      }),
    }))
    const r = await consultarFrete({ cep_destino: '38401216' })
    expect(r.body.opcoes).toHaveLength(1)
    expect(r.body.opcoes[0].codigo).toBe('04510')
  })

  it('10b. filtra modalidades com Error:"true" (string)', async () => {
    mockFetchOnce(async () => ({
      ok: true,
      json: async () => ({
        ShippingSevicesArray: [
          { ServiceCode: '04510', ServiceDescription: 'PAC', ShippingPrice: '32.50', DeliveryTime: '7', Error: 'true' },
        ],
      }),
    }))
    const r = await consultarFrete({ cep_destino: '38401216' })
    expect(r.body.status).toBe('sem_opcoes')
  })

  it('11. todas as modalidades com Error:true -> sem_opcoes', async () => {
    mockFetchOnce(async () => ({
      ok: true,
      json: async () => ({
        ShippingSevicesArray: [{ ServiceCode: '04510', Error: true, Msg: 'indisponível' }],
      }),
    }))
    const r = await consultarFrete({ cep_destino: '38401216' })
    expect(r.httpStatus).toBe(200)
    expect(r.body.status).toBe('sem_opcoes')
    expect(r.body.codigo).toBe('frete_sem_opcoes')
  })

  it('12. array vazio -> sem_opcoes', async () => {
    mockFetchOnce(async () => ({ ok: true, json: async () => ({ ShippingSevicesArray: [] }) }))
    const r = await consultarFrete({ cep_destino: '38401216' })
    expect(r.body.status).toBe('sem_opcoes')
  })

  it('13. ShippingSevicesArray ausente -> sem_opcoes, sem quebrar', async () => {
    mockFetchOnce(async () => ({ ok: true, json: async () => ({}) }))
    const r = await consultarFrete({ cep_destino: '38401216' })
    expect(r.body.status).toBe('sem_opcoes')
  })

  it('14. timeout (AbortError) -> servico_indisponivel, sem detalhe interno', async () => {
    global.fetch = vi.fn(() => {
      const err = new Error('The operation was aborted')
      err.name = 'AbortError'
      return Promise.reject(err)
    })
    const r = await consultarFrete({ cep_destino: '38401216' })
    expect(r.httpStatus).toBe(200)
    expect(r.body.codigo).toBe('servico_indisponivel')
    expect(JSON.stringify(r.body)).not.toContain('AbortError')
  })

  it('15. falha de rede (fetch rejeita) -> servico_indisponivel, sem vazar detalhe', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('network error, dns lookup failed at 10.0.0.5')))
    const r = await consultarFrete({ cep_destino: '38401216' })
    expect(r.httpStatus).toBe(200)
    expect(r.body.codigo).toBe('servico_indisponivel')
    expect(JSON.stringify(r.body)).not.toContain('10.0.0.5')
  })

  it('16. resposta JSON inválida -> servico_indisponivel, sem stack trace', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => { throw new SyntaxError('Unexpected token < in JSON at position 0') },
    }))
    const r = await consultarFrete({ cep_destino: '38401216' })
    expect(r.httpStatus).toBe(200)
    expect(JSON.stringify(r.body)).not.toContain('SyntaxError')
  })

  it('17. status HTTP inesperado (5xx) -> servico_indisponivel', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 503 }))
    const r = await consultarFrete({ cep_destino: '38401216' })
    expect(r.httpStatus).toBe(200)
    expect(r.body.codigo).toBe('servico_indisponivel')
  })

  it('18. status HTTP 401 (token inválido) -> servico_indisponivel, sem vazar o token', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 401 }))
    const r = await consultarFrete({ cep_destino: '38401216' })
    expect(r.httpStatus).toBe(200)
    expect(r.body.codigo).toBe('servico_indisponivel')
    expect(JSON.stringify(r.body)).not.toContain('test-frenet-token-nao-real')
  })
})

describe('consultarFrete — verificação estática de somente leitura', () => {
  it('19. o código-fonte do helper não contém nenhuma dependência interna nem chamada de escrita', async () => {
    const fs = await import('node:fs')
    const codigo = fs.readFileSync(new URL('../_consultarFrete.js', import.meta.url), 'utf-8')
    expect(codigo).not.toMatch(/\.create\(/)
    expect(codigo).not.toMatch(/\.update\(/)
    expect(codigo).not.toMatch(/\.delete\(/)
    expect(codigo).not.toContain('@base44/sdk')
    expect(codigo).not.toContain('SUPABASE')
    expect(codigo).not.toContain('BASE44')
    expect(codigo).not.toContain('bagy')
  })
})
