// Testes permanentes de regressão da ferramenta MCP consultar_cep
// (api/_consultarCep.js). 100% mockado: nenhuma chamada real ao ViaCEP na suíte
// permanente (a validação manual controlada foi feita à parte, fora da suíte).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { consultarCep } from '../_consultarCep.js'

function mockFetchOnce(implementation) {
  global.fetch = vi.fn(implementation)
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('consultarCep — validação e normalização de entrada', () => {
  it('1. CEP válido sem hífen chega normalizado na URL do ViaCEP', async () => {
    mockFetchOnce(async (url) => {
      expect(url).toBe('https://viacep.com.br/ws/38408100/json/')
      return { ok: true, json: async () => ({ cep: '38408-100', logradouro: 'Rua X', bairro: 'Centro', localidade: 'Uberlândia', uf: 'MG', ibge: '3170206' }) }
    })
    const r = await consultarCep({ cep: '38408100' })
    expect(r.httpStatus).toBe(200)
    expect(r.body.status).toBe('encontrado')
  })

  it('2. CEP válido com hífen é normalizado corretamente', async () => {
    mockFetchOnce(async (url) => {
      expect(url).toBe('https://viacep.com.br/ws/38408100/json/')
      return { ok: true, json: async () => ({ localidade: 'Uberlândia', uf: 'MG' }) }
    })
    const r = await consultarCep({ cep: '38408-100' })
    expect(r.httpStatus).toBe(200)
    expect(r.body.endereco.cep).toBe('38408-100')
  })

  it('3. CEP com espaços externos é normalizado corretamente', async () => {
    mockFetchOnce(async (url) => {
      expect(url).toBe('https://viacep.com.br/ws/38408100/json/')
      return { ok: true, json: async () => ({ localidade: 'Uberlândia', uf: 'MG' }) }
    })
    const r = await consultarCep({ cep: '  38408-100  ' })
    expect(r.httpStatus).toBe(200)
  })

  it('4. normalização remove qualquer caractere não numérico (ex: letras coladas)', async () => {
    mockFetchOnce(async (url) => {
      expect(url).toBe('https://viacep.com.br/ws/38408100/json/')
      return { ok: true, json: async () => ({ localidade: 'Uberlândia', uf: 'MG' }) }
    })
    const r = await consultarCep({ cep: 'CEP 38408-100 favor' })
    expect(r.httpStatus).toBe(200)
  })

  it('5. CEP com menos de 8 dígitos -> cep_invalido, sem chamar o ViaCEP', async () => {
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy
    const r = await consultarCep({ cep: '3840810' })
    expect(r.httpStatus).toBe(400)
    expect(r.body.codigo).toBe('cep_invalido')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('6. CEP com mais de 8 dígitos -> cep_invalido, sem chamar o ViaCEP', async () => {
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy
    const r = await consultarCep({ cep: '384081000' })
    expect(r.httpStatus).toBe(400)
    expect(r.body.codigo).toBe('cep_invalido')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('7. CEP ausente -> cep_invalido, sem chamar o ViaCEP', async () => {
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy
    const r = await consultarCep({})
    expect(r.httpStatus).toBe(400)
    expect(r.body.codigo).toBe('cep_invalido')
    expect(fetchSpy).not.toHaveBeenCalled()

    const r2 = await consultarCep({ cep: '' })
    expect(r2.httpStatus).toBe(400)

    const r3 = await consultarCep({ cep: '   ' })
    expect(r3.httpStatus).toBe(400)
  })

  it('7b. cep com tipo diferente de string -> cep_invalido', async () => {
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy
    const r = await consultarCep({ cep: 38408100 })
    expect(r.httpStatus).toBe(400)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('consultarCep — respostas do ViaCEP', () => {
  it('8. CEP não encontrado (erro:true booleano do ViaCEP) -> nao_encontrado', async () => {
    mockFetchOnce(async () => ({ ok: true, json: async () => ({ erro: true }) }))
    const r = await consultarCep({ cep: '00000000' })
    expect(r.httpStatus).toBe(200)
    expect(r.body.status).toBe('nao_encontrado')
    expect(r.body.codigo).toBe('cep_nao_encontrado')
  })

  it('8b. CEP não encontrado (erro:"true" string do ViaCEP) -> nao_encontrado', async () => {
    mockFetchOnce(async () => ({ ok: true, json: async () => ({ erro: 'true' }) }))
    const r = await consultarCep({ cep: '00000000' })
    expect(r.httpStatus).toBe(200)
    expect(r.body.status).toBe('nao_encontrado')
    expect(r.body.codigo).toBe('cep_nao_encontrado')
  })

  it('9. sucesso com todos os campos presentes', async () => {
    mockFetchOnce(async () => ({
      ok: true,
      json: async () => ({
        cep: '01001-000', logradouro: 'Praça da Sé', complemento: 'lado ímpar',
        bairro: 'Sé', localidade: 'São Paulo', uf: 'SP', ibge: '3550308',
      }),
    }))
    const r = await consultarCep({ cep: '01001000' })
    expect(r.body).toEqual({
      status: 'encontrado',
      endereco: {
        cep: '01001-000', logradouro: 'Praça da Sé', complemento: 'lado ímpar',
        bairro: 'Sé', cidade: 'São Paulo', estado: 'SP', ibge: '3550308',
      },
      aviso: 'O número do imóvel e o complemento devem ser confirmados com o cliente.',
    })
  })

  it('10. sucesso com logradouro/bairro vazio (mantém string vazia, não inventa)', async () => {
    mockFetchOnce(async () => ({
      ok: true,
      json: async () => ({ logradouro: '', bairro: '', localidade: 'Uberlândia', uf: 'MG', ibge: '3170206' }),
    }))
    const r = await consultarCep({ cep: '38400000' })
    expect(r.body.endereco.logradouro).toBe('')
    expect(r.body.endereco.bairro).toBe('')
    expect(r.body.endereco.cidade).toBe('Uberlândia')
  })

  it('11. timeout (AbortError) -> servico_indisponivel, sem detalhe interno', async () => {
    global.fetch = vi.fn(() => {
      const err = new Error('The operation was aborted')
      err.name = 'AbortError'
      return Promise.reject(err)
    })
    const r = await consultarCep({ cep: '38408100' })
    expect(r.httpStatus).toBe(200)
    expect(r.body.status).toBe('erro')
    expect(r.body.codigo).toBe('servico_indisponivel')
    expect(JSON.stringify(r.body)).not.toContain('AbortError')
  })

  it('12. falha de rede (fetch rejeita) -> servico_indisponivel', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('network error, dns lookup failed at 10.0.0.5')))
    const r = await consultarCep({ cep: '38408100' })
    expect(r.httpStatus).toBe(200)
    expect(r.body.status).toBe('erro')
    expect(r.body.codigo).toBe('servico_indisponivel')
    expect(JSON.stringify(r.body)).not.toContain('10.0.0.5')
  })

  it('13. resposta JSON inválida -> servico_indisponivel, sem stack trace', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => { throw new SyntaxError('Unexpected token < in JSON at position 0') },
    }))
    const r = await consultarCep({ cep: '38408100' })
    expect(r.httpStatus).toBe(200)
    expect(r.body.status).toBe('erro')
    expect(JSON.stringify(r.body)).not.toContain('SyntaxError')
    expect(JSON.stringify(r.body)).not.toContain('Unexpected token')
  })

  it('14. status HTTP inesperado (5xx) -> servico_indisponivel', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 503 }))
    const r = await consultarCep({ cep: '38408100' })
    expect(r.httpStatus).toBe(200)
    expect(r.body.status).toBe('erro')
    expect(r.body.codigo).toBe('servico_indisponivel')
  })
})

describe('consultarCep — verificação estática de somente leitura', () => {
  it('19. o código-fonte do helper não contém nenhuma dependência interna nem chamada de escrita', async () => {
    const fs = await import('node:fs')
    const codigo = fs.readFileSync(new URL('../_consultarCep.js', import.meta.url), 'utf-8')
    expect(codigo).not.toMatch(/\.create\(/)
    expect(codigo).not.toMatch(/\.update\(/)
    expect(codigo).not.toMatch(/\.delete\(/)
    expect(codigo).not.toContain('@base44/sdk')
    expect(codigo).not.toContain('SUPABASE')
    expect(codigo).not.toContain('BASE44')
    expect(codigo).not.toContain('frenet')
    expect(codigo).not.toContain('bagy')
  })
})
