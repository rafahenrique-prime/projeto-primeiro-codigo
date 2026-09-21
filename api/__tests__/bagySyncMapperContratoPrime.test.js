/**
 * CONTRATO CATÁLOGO PRIME — Etapa 1: testes das regras novas do mapper
 * (stock_real sempre preservado; active derivado do valor de atributo).
 * Fixtures espelham shapes REAIS de window.dooca.product medidos em
 * 2026-09-21 (regata-alo-premium-branca, cueca-lupo-009, calça Diesel,
 * óculos sem grade).
 */
import { describe, it, expect } from 'vitest'
import {
  resolveEstoqueVariacao,
  resolveActiveVariacao,
  resolveAttributes,
  mapVariationRows,
  mapProductRow,
} from '../_bagySyncMapper.js'

// Shape real: produto com grade de tamanho (regata-alo-premium-branca,
// id 10490760) — variation.attribute traz active direto e o id casa com
// product.attribute.values[].id.
function produtoComGrade(overrides = {}) {
  return {
    id: 10490760,
    name: 'Regata Alo Feminina Importada Branca',
    selling_out_of_stock: false,
    attribute: {
      id: 164239,
      name: 'Tamanho ',
      values: [
        { id: 1142194, name: 'P', active: true },
        { id: 1142195, name: 'M', active: true },
        { id: 1142196, name: 'G', active: false },
      ],
    },
    variations: [],
    ...overrides,
  }
}

describe('resolveEstoqueVariacao — stock_real sempre preservado', () => {
  it('sell_without_stock=true do produto: stock_quantity null (legado) MAS stock_real preserva o balance', () => {
    const r = resolveEstoqueVariacao({ selling_out_of_stock: true }, { balance: 0, selling_out_of_stock: false })
    expect(r.stock_quantity).toBeNull()
    expect(r.stock_real).toBe(0)
    expect(r.anomalia).toBeNull()

    const r2 = resolveEstoqueVariacao({ selling_out_of_stock: true }, { balance: 24, selling_out_of_stock: true })
    expect(r2.stock_real).toBe(24)
  })

  it('balance=9999 com flag do produto ligado: sem-controle, stock_real=null, NÃO é anomalia bloqueante', () => {
    const r = resolveEstoqueVariacao({ selling_out_of_stock: true }, { balance: 9999, selling_out_of_stock: false })
    expect(r.stock_real).toBeNull()
    expect(r.semControle).toBe(true)
    expect(r.anomalia).toBeNull()
  })

  it('balance=9999 SEM o flag do produto: anomalia bloqueante preservada (salvaguarda antiga)', () => {
    const r = resolveEstoqueVariacao({ selling_out_of_stock: false }, { balance: 9999, selling_out_of_stock: false })
    expect(r.anomalia).toMatch(/9999/)
    expect(r.stock_real).toBeNull()
  })

  it('sem flag: 0 e positivo fluem como antes, com stock_real espelhando', () => {
    expect(resolveEstoqueVariacao({}, { balance: 0 }).stock_real).toBe(0)
    expect(resolveEstoqueVariacao({}, { balance: 6 }).stock_real).toBe(6)
  })

  it('balance inesperado (não-numérico): anomalia preservada, stock_real null', () => {
    const r = resolveEstoqueVariacao({}, { balance: 'abc' })
    expect(r.anomalia).toMatch(/inesperado/)
    expect(r.stock_real).toBeNull()
  })
})

describe('resolveActiveVariacao — derivação pelo valor de atributo', () => {
  it('evidência direta: variation.attribute.active booleano vence', () => {
    const p = produtoComGrade()
    expect(resolveActiveVariacao(p, { attribute: { id: 1142196, name: 'G', attribute_name: 'Tamanho ', active: false } })).toBe(false)
    expect(resolveActiveVariacao(p, { attribute: { id: 1142194, name: 'P', attribute_name: 'Tamanho ', active: true } })).toBe(true)
  })

  it('sem active direto: join variation.attribute.id → product.attribute.values[].active', () => {
    const p = produtoComGrade()
    // G (id 1142196) está active=false no produto
    expect(resolveActiveVariacao(p, { attribute: { id: 1142196, name: 'G', attribute_name: 'Tamanho ' } })).toBe(false)
    expect(resolveActiveVariacao(p, { attribute: { id: 1142194, name: 'P', attribute_name: 'Tamanho ' } })).toBe(true)
  })

  it('sem nenhuma evidência → null (desconhecido), nunca assume ativo', () => {
    const p = produtoComGrade()
    // variação sem atributo (shape real dos produtos SEM grade, ex.: óculos/boné)
    expect(resolveActiveVariacao(p, {})).toBeNull()
    expect(resolveActiveVariacao(p, { attribute: {} })).toBeNull()
    // id que não casa com nenhum valor conhecido
    expect(resolveActiveVariacao(p, { attribute: { id: 999999999, name: 'XX', attribute_name: 'Tamanho ' } })).toBeNull()
  })

  it('grade dupla (contrato preparado — não existe no catálogo real): AND das evidências', () => {
    const p = produtoComGrade({
      attribute_secondary: { id: 200, name: 'Cor', values: [{ id: 301, name: 'Preto', active: true }] },
    })
    const variacao = {
      attribute: { id: 1142194, name: 'P', attribute_name: 'Tamanho ', active: true },
      attribute_secondary: { id: 301, name: 'Preto', attribute_name: 'Cor' }, // sem active direto → join (true)
    }
    expect(resolveActiveVariacao(p, variacao)).toBe(true)

    const variacaoCorInativa = {
      attribute: { id: 1142194, name: 'P', attribute_name: 'Tamanho ', active: true },
      attribute_secondary: { id: 301, name: 'Preto', attribute_name: 'Cor', active: false },
    }
    expect(resolveActiveVariacao(p, variacaoCorInativa)).toBe(false)
  })
})

describe('resolveAttributes — atributo secundário', () => {
  it('sem secundário: comportamento atual bit a bit', () => {
    const r = resolveAttributes({ attribute: { name: 'P', attribute_name: 'Tamanho ' } })
    expect(r).toEqual({ attributes: { tamanho: 'P' }, fallback: false })
  })
  it('com secundário cor: entra como chave própria', () => {
    const r = resolveAttributes({
      attribute: { name: 'P', attribute_name: 'Tamanho ' },
      attribute_secondary: { name: 'Preto', attribute_name: 'Cor' },
    })
    expect(r.attributes).toEqual({ tamanho: 'P', cor: 'Preto' })
    expect(r.fallback).toBe(false)
  })
  it('choque de chave entre primário e secundário: secundário usa sufixo _2', () => {
    const r = resolveAttributes({
      attribute: { name: 'P', attribute_name: 'Tamanho' },
      attribute_secondary: { name: 'G', attribute_name: 'Tamanho Calça' },
    })
    expect(r.attributes).toEqual({ tamanho: 'P', tamanho_2: 'G' })
  })
})

describe('mapVariationRows / mapProductRow — novos campos', () => {
  it('mapVariationRows inclui stock_real e active derivado', () => {
    const p = produtoComGrade({
      variations: [
        { id: 30609816, balance: 6, selling_out_of_stock: false, price: 199, attribute: { id: 1142194, name: 'P', attribute_name: 'Tamanho ', active: true } },
        { id: 30609818, balance: 6, selling_out_of_stock: false, price: 199, attribute: { id: 1142196, name: 'G', attribute_name: 'Tamanho ' } },
      ],
    })
    const rows = mapVariationRows(p, 'uuid-1')
    expect(rows[0].stock_real).toBe(6)
    expect(rows[0].active).toBe(true)
    expect(rows[1].active).toBe(false) // via join: G está inactive no produto
    expect(rows[1].attributes).toEqual({ tamanho: 'G' })
  })

  it('mapProductRow sem status: campo ausente (nunca diff acidental)', () => {
    const row = mapProductRow({ id: 1, name: 'X', url: '/x', price: 10 })
    expect('status' in row).toBe(false)
  })
  it('mapProductRow com status: campo presente', () => {
    const row = mapProductRow({ id: 1, name: 'X', url: '/x', price: 10 }, { status: 'active' })
    expect(row.status).toBe('active')
  })
})
