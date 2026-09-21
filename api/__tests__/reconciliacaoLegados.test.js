/**
 * CONTRATO CATÁLOGO PRIME — Etapa 1: testes do preview SOMENTE LEITURA de
 * reconciliação dos legados sem bagy_product_id
 * (api/_reconciliacaoLegados.js). Fixtures espelham casos reais medidos no
 * catálogo em 2026-09-21 (inclusive link reciclado e legado sem link).
 */
import { describe, it, expect } from 'vitest'
import {
  normalizarLinkPuro,
  reconciliarLegadosPreview,
  CONFIANCA_RECONCILIACAO,
  RECOMENDACAO_RECONCILIACAO,
} from '../_reconciliacaoLegados.js'

const STORE = 'https://www.primestoremen.com.br'

describe('normalizarLinkPuro', () => {
  it('origem+path minúsculos, sem trailing slash, sem query/hash', () => {
    expect(normalizarLinkPuro('https://www.PrimestoreMen.com.br/Blusa-Diesel/?x=1#y', STORE))
      .toBe('https://www.primestoremen.com.br/blusa-diesel')
  })
  it('resolve link relativo contra a storeUrl explícita', () => {
    expect(normalizarLinkPuro('/blusa-diesel', STORE)).toBe('https://www.primestoremen.com.br/blusa-diesel')
    expect(normalizarLinkPuro('blusa-diesel', STORE)).toBe('https://www.primestoremen.com.br/blusa-diesel')
  })
  it('vazio/null → string vazia', () => {
    expect(normalizarLinkPuro(null, STORE)).toBe('')
    expect(normalizarLinkPuro('', STORE)).toBe('')
  })
})

describe('reconciliarLegadosPreview', () => {
  const candidatos = [
    { id: 'b1', bagy_product_id: 7447931, nome: 'Blusa Diesel', link: `${STORE}/blusa-diesel` },
    { id: 'b2', bagy_product_id: 9682509, nome: 'Perfume Lattafa', link: `${STORE}/perfume-lattafa` },
    { id: 'b3', bagy_product_id: 7622324, nome: 'Chinelo Diesel Vermelho', link: `${STORE}/chinelo-diesel-vermelho` },
    { id: 'b4', bagy_product_id: 111, nome: 'Boné X', link: `${STORE}/bone-x` },
    { id: 'b5', bagy_product_id: 222, nome: 'Boné X', link: `${STORE}/bone-x` },
  ]

  it('link exato + nome igual → alta / validar_vinculo_humano (caso real: Blusa Diesel)', () => {
    const [r] = reconciliarLegadosPreview(
      [{ id: 'l1', nome: 'Blusa Diesel', link: `${STORE}/blusa-diesel`, preco: 'R$ 199,00', imagem: 'i', status: 'active' }],
      candidatos
    )
    expect(r.confianca).toBe(CONFIANCA_RECONCILIACAO.ALTA)
    expect(r.recomendacao).toBe(RECOMENDACAO_RECONCILIACAO.VALIDAR_VINCULO_HUMANO)
    expect(r.conflito).toBe(false)
    expect(r.candidatos).toHaveLength(1)
    expect(r.candidatos[0].bagy_product_id).toBe(7447931)
    expect(r.candidatos[0].evidencias).toEqual(['link_exato', 'nome_exato'])
    expect(r.link_normalizado).toBe(`${STORE}/blusa-diesel`)
  })

  it('link exato com nome DIFERENTE → media / revisao_manual (link reciclado existe no catálogo real)', () => {
    const [r] = reconciliarLegadosPreview(
      [{ id: 'l2', nome: 'Tênis Dolce Gabana 099', link: `${STORE}/blusa-diesel` }],
      candidatos
    )
    expect(r.confianca).toBe(CONFIANCA_RECONCILIACAO.MEDIA)
    expect(r.recomendacao).toBe(RECOMENDACAO_RECONCILIACAO.REVISAO_MANUAL)
    expect(r.candidatos[0].evidencias).toEqual(['link_exato'])
  })

  it('>1 candidato no mesmo link → media + conflito / revisao_manual', () => {
    const [r] = reconciliarLegadosPreview([{ id: 'l3', nome: 'Boné X', link: `${STORE}/bone-x` }], candidatos)
    expect(r.confianca).toBe(CONFIANCA_RECONCILIACAO.MEDIA)
    expect(r.conflito).toBe(true)
    expect(r.candidatos).toHaveLength(2)
    expect(r.recomendacao).toBe(RECOMENDACAO_RECONCILIACAO.REVISAO_MANUAL)
  })

  it('sem link no legado, nome exato único → baixa / revisao_manual (caso real: Chinelo Diesel Vermelho)', () => {
    const [r] = reconciliarLegadosPreview([{ id: 'l4', nome: 'Chinelo Diesel Vermelho', link: null }], candidatos)
    expect(r.confianca).toBe(CONFIANCA_RECONCILIACAO.BAIXA)
    expect(r.conflito).toBe(false)
    expect(r.link_normalizado).toBeNull()
    expect(r.candidatos[0].bagy_product_id).toBe(7622324)
    expect(r.candidatos[0].evidencias).toEqual(['nome_exato'])
  })

  it('sem candidato nenhum → nenhuma / revisar_sem_candidato', () => {
    const [r] = reconciliarLegadosPreview([{ id: 'l5', nome: 'Produto Sumido', link: `${STORE}/produto-sumido` }], candidatos)
    expect(r.confianca).toBe(CONFIANCA_RECONCILIACAO.NENHUMA)
    expect(r.candidatos).toHaveLength(0)
    expect(r.recomendacao).toBe(RECOMENDACAO_RECONCILIACAO.REVISAR_SEM_CANDIDATO)
  })

  it('determinístico e sem mutação: mesma entrada → mesma saída, entradas intactas', () => {
    const legados = [{ id: 'l1', nome: 'Blusa Diesel', link: `${STORE}/blusa-diesel` }]
    const copiaLegados = JSON.parse(JSON.stringify(legados))
    const copiaCandidatos = JSON.parse(JSON.stringify(candidatos))
    const r1 = reconciliarLegadosPreview(legados, candidatos)
    const r2 = reconciliarLegadosPreview(legados, candidatos)
    expect(r1).toEqual(r2)
    expect(legados).toEqual(copiaLegados)
    expect(candidatos).toEqual(copiaCandidatos)
  })

  it('nunca vincula: saída não altera o legado nem escreve bagy_product_id nele', () => {
    const [r] = reconciliarLegadosPreview([{ id: 'l1', nome: 'Blusa Diesel', link: `${STORE}/blusa-diesel` }], candidatos)
    expect(r.legado).not.toHaveProperty('bagy_product_id')
    expect(r.legado.id).toBe('l1')
  })
})
