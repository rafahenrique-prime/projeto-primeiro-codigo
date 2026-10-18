/**
 * Testes de knowledgeTimestamps — 100% isolados (localStorage em memória, sem rede).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { loadCreated, saveCreated, getCreatedAt, isNew } from '../conhecimento/knowledgeTimestamps.js'

const KEY = 'codex_created'
const NOW = new Date('2026-10-17T12:00:00Z').getTime()
const HOUR = 60 * 60 * 1000

function criarStorage() {
  const data = new Map()
  return {
    getItem: vi.fn(k => (data.has(k) ? data.get(k) : null)),
    setItem: vi.fn((k, v) => { data.set(k, String(v)) }),
    removeItem: vi.fn(k => { data.delete(k) }),
    clear: vi.fn(() => data.clear()),
  }
}

let errorSpy

beforeEach(() => {
  vi.stubGlobal('localStorage', criarStorage())
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  errorSpy.mockRestore()
})

describe('loadCreated', () => {
  it('retorna {} quando a chave não existe', () => {
    expect(loadCreated()).toEqual({})
  })

  it('preserva dados existentes na chave codex_created', () => {
    localStorage.setItem(KEY, JSON.stringify({ abc: NOW - HOUR }))
    expect(loadCreated()).toEqual({ abc: NOW - HOUR })
  })

  it.each(['null', '42', '"texto"', 'true', '[1,2]'])('retorna {} para JSON válido não-objeto: %s', raw => {
    localStorage.setItem(KEY, raw)
    expect(loadCreated()).toEqual({})
  })

  it('retorna {} e loga quando o JSON está corrompido', () => {
    localStorage.setItem(KEY, '{quebrado')
    expect(loadCreated()).toEqual({})
    expect(errorSpy).toHaveBeenCalled()
  })

  it('retorna {} e loga quando localStorage não está disponível', () => {
    vi.unstubAllGlobals()
    vi.stubGlobal('localStorage', undefined)
    expect(loadCreated()).toEqual({})
    expect(errorSpy).toHaveBeenCalled()
  })
})

describe('saveCreated', () => {
  it('grava Date.now() mantendo entradas anteriores', () => {
    localStorage.setItem(KEY, JSON.stringify({ old: 1 }))
    expect(saveCreated('novo')).toBe(true)
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual({ old: 1, novo: NOW })
  })

  it('recupera de cache "null" gravando um objeto novo', () => {
    localStorage.setItem(KEY, 'null')
    expect(saveCreated('x')).toBe(true)
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual({ x: NOW })
  })

  it('retorna false e loga quando setItem falha (cota cheia)', () => {
    localStorage.setItem.mockImplementation(() => { throw new Error('QuotaExceededError') })
    expect(saveCreated('x')).toBe(false)
    expect(errorSpy).toHaveBeenCalledWith('[saveCreated] Erro ao gravar cache de datas', expect.objectContaining({ message: 'QuotaExceededError' }))
  })

  it('ignora id ausente sem gravar', () => {
    expect(saveCreated(undefined)).toBe(false)
    expect(localStorage.setItem).not.toHaveBeenCalled()
  })
})

describe('getCreatedAt', () => {
  it('usa createdAt / created_at / dateCreated válidos da API (comportamento preservado)', () => {
    const iso = '2026-10-16T12:00:00Z'
    const ts = new Date(iso).getTime()
    expect(getCreatedAt({ id: 1, createdAt: iso })).toBe(ts)
    expect(getCreatedAt({ id: 1, created_at: iso })).toBe(ts)
    expect(getCreatedAt({ id: 1, dateCreated: iso })).toBe(ts)
    expect(getCreatedAt({ id: 1, createdAt: ts })).toBe(ts)
  })

  it('cai no cache local quando a data da API é inválida (nunca NaN)', () => {
    localStorage.setItem(KEY, JSON.stringify({ a: NOW - HOUR }))
    expect(getCreatedAt({ id: 'a', createdAt: 'não-é-data' })).toBe(NOW - HOUR)
    expect(getCreatedAt({ id: 'b', createdAt: 'não-é-data' })).toBe(0)
  })

  it('usa o cache quando não há data da API', () => {
    localStorage.setItem(KEY, JSON.stringify({ a: NOW - HOUR }))
    expect(getCreatedAt({ id: 'a' })).toBe(NOW - HOUR)
  })

  it('retorna 0 para valor inválido no cache e para cache "null"', () => {
    localStorage.setItem(KEY, JSON.stringify({ a: 'lixo' }))
    expect(getCreatedAt({ id: 'a' })).toBe(0)
    localStorage.setItem(KEY, 'null')
    expect(getCreatedAt({ id: 'a' })).toBe(0)
  })

  it('retorna 0 para item ausente', () => {
    expect(getCreatedAt(null)).toBe(0)
    expect(getCreatedAt(undefined)).toBe(0)
  })

  it('ordenação nunca recebe NaN com datas mistas', () => {
    const items = [{ id: 1, createdAt: 'xx' }, { id: 2, createdAt: NOW - HOUR }, { id: 3 }]
    const sorted = [...items].sort((a, b) => getCreatedAt(b) - getCreatedAt(a))
    expect(sorted[0].id).toBe(2)
    items.forEach(i => expect(Number.isNaN(getCreatedAt(i))).toBe(false))
  })
})

describe('ajustes residuais (revisão Codex)', () => {
  it('rejeita timestamps fora do intervalo de Date (API e cache)', () => {
    expect(getCreatedAt({ id: 1, createdAt: 1e20 })).toBe(0)
    expect(getCreatedAt({ id: 1, createdAt: 8.64e15 + 1 })).toBe(0)
    expect(getCreatedAt({ id: 1, createdAt: 8.64e15 })).toBe(8.64e15)
    localStorage.setItem(KEY, JSON.stringify({ a: 1e20 }))
    expect(getCreatedAt({ id: 'a' })).toBe(0)
  })

  it('não lança TypeError com valores estruturados inválidos no cache', () => {
    localStorage.setItem(KEY, JSON.stringify({ a: { toString: 'inválido' }, b: [1], c: { x: 1 }, d: true }))
    for (const id of ['a', 'b', 'c', 'd']) {
      expect(() => getCreatedAt({ id })).not.toThrow()
      expect(getCreatedAt({ id })).toBe(0)
      expect(isNew({ id })).toBe(false)
    }
  })

  it('não lança TypeError com valor estruturado inválido vindo da API', () => {
    expect(() => getCreatedAt({ id: 1, createdAt: { toString: 'x' } })).not.toThrow()
    expect(getCreatedAt({ id: 1, createdAt: { toString: 'x' } })).toBe(0)
  })

  it('precedência: data válida da API vence o cache', () => {
    localStorage.setItem(KEY, JSON.stringify({ a: NOW - 2 * HOUR }))
    expect(getCreatedAt({ id: 'a', createdAt: NOW - HOUR })).toBe(NOW - HOUR)
  })

  it('precedência: createdAt > created_at > dateCreated', () => {
    expect(getCreatedAt({ id: 1, createdAt: 3, created_at: 2, dateCreated: 1 })).toBe(3)
    expect(getCreatedAt({ id: 1, created_at: 2, dateCreated: 1 })).toBe(2)
  })

  it('retorna 0 e loga quando getItem lança erro', () => {
    localStorage.getItem.mockImplementation(() => { throw new Error('SecurityError') })
    expect(loadCreated()).toEqual({})
    expect(getCreatedAt({ id: 'a' })).toBe(0)
    expect(errorSpy).toHaveBeenCalledWith('[loadCreated] Erro ao ler cache de datas', expect.objectContaining({ message: 'SecurityError' }))
  })

  it.each([null, ''])('saveCreated ignora id %j sem gravar', id => {
    expect(saveCreated(id)).toBe(false)
    expect(localStorage.setItem).not.toHaveBeenCalled()
  })

  it('getCreatedAt com item sem id retorna 0', () => {
    localStorage.setItem(KEY, JSON.stringify({ a: NOW }))
    expect(getCreatedAt({})).toBe(0)
  })

  it('limite exato de 48h: 48h - 1ms é novo, 48h não é', () => {
    expect(isNew({ id: 1, createdAt: NOW - 48 * HOUR + 1 })).toBe(true)
    expect(isNew({ id: 1, createdAt: NOW - 48 * HOUR })).toBe(false)
  })
})

describe('getCreatedAt com ID nulo, indefinido ou vazio', () => {
  const idsAusentes = [
    ['null', null],
    ['undefined', undefined],
    ['""', ''],
  ]

  it.each(idsAusentes)('retorna 0 sem consultar o cache quando id é %s (mesmo com entradas antigas)', (_, id) => {
    localStorage.setItem(KEY, JSON.stringify({ null: NOW - HOUR, undefined: NOW - HOUR, '': NOW - HOUR }))
    localStorage.getItem.mockClear()
    expect(getCreatedAt({ id })).toBe(0)
    expect(localStorage.getItem).not.toHaveBeenCalled()
    expect(isNew({ id })).toBe(false)
  })

  it('retorna 0 sem consultar o cache quando a propriedade id não existe', () => {
    localStorage.setItem(KEY, JSON.stringify({ undefined: NOW - HOUR }))
    localStorage.getItem.mockClear()
    expect(getCreatedAt({})).toBe(0)
    expect(localStorage.getItem).not.toHaveBeenCalled()
  })

  it.each(idsAusentes)('retorna 0 sem cache quando id é %s e a data da API é inválida', (_, id) => {
    localStorage.setItem(KEY, JSON.stringify({ null: NOW - HOUR, undefined: NOW - HOUR, '': NOW - HOUR }))
    expect(getCreatedAt({ id, createdAt: 'não-é-data' })).toBe(0)
  })

  it.each(idsAusentes)('preserva a data válida da API quando id é %s (cache antigo ignorado)', (_, id) => {
    const ts = NOW - 2 * HOUR
    localStorage.setItem(KEY, JSON.stringify({ null: NOW - HOUR, undefined: NOW - HOUR, '': NOW - HOUR }))
    expect(getCreatedAt({ id, createdAt: ts })).toBe(ts)
    expect(isNew({ id, createdAt: ts })).toBe(true)
  })

  it('datas futuras continuam sem selo NOVO, mesmo com ID ausente', () => {
    expect(isNew({ id: null, createdAt: NOW + HOUR })).toBe(false)
    expect(isNew({ id: 'a', createdAt: NOW + HOUR })).toBe(false)
  })

  it('id 0 continua sendo um ID válido (consulta o cache)', () => {
    localStorage.setItem(KEY, JSON.stringify({ 0: NOW - HOUR }))
    expect(getCreatedAt({ id: 0 })).toBe(NOW - HOUR)
  })
})

describe('isNew', () => {
  it('true dentro de 48h', () => {
    expect(isNew({ id: 1, createdAt: NOW - HOUR })).toBe(true)
    expect(isNew({ id: 1, createdAt: NOW })).toBe(true)
  })

  it('false a partir de 48h', () => {
    expect(isNew({ id: 1, createdAt: NOW - 48 * HOUR })).toBe(false)
    expect(isNew({ id: 1, createdAt: NOW - 49 * HOUR })).toBe(false)
  })

  it('false para datas futuras', () => {
    expect(isNew({ id: 1, createdAt: NOW + HOUR })).toBe(false)
  })

  it('false sem data ou com data inválida', () => {
    expect(isNew({ id: 1 })).toBe(false)
    expect(isNew({ id: 1, createdAt: 'inválida' })).toBe(false)
  })
})
