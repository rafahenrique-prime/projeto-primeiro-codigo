/**
 * CONTRATO CATÁLOGO PRIME — Etapa 1: testes das regras puras de
 * disponibilidade, elegibilidade e deduplicação canônica
 * (api/_catalogoContratoPrime.js). Fixtures espelham shapes reais medidos
 * em window.dooca.product e no Supabase em 2026-09-21.
 */
import { describe, it, expect } from 'vitest'
import {
  normalizarChave,
  estoqueEfetivo,
  resolveDisponibilidade,
  avaliarElegibilidadeOferta,
  escolherLinhaCanonica,
  deduplicarPorLinhaCanonica,
} from '../_catalogoContratoPrime.js'

describe('estoqueEfetivo', () => {
  it('prefere stock_real quando existe', () => {
    expect(estoqueEfetivo({ stock_real: 0, stock_quantity: 6 })).toBe(0)
    expect(estoqueEfetivo({ stock_real: 6, stock_quantity: null })).toBe(6)
  })
  it('cai pro legado stock_quantity quando stock_real não existe', () => {
    expect(estoqueEfetivo({ stock_quantity: 3 })).toBe(3)
  })
  it('null quando ambos desconhecidos — nunca zero, nunca "tem estoque"', () => {
    expect(estoqueEfetivo({ stock_real: null, stock_quantity: null })).toBeNull()
    expect(estoqueEfetivo({})).toBeNull()
    expect(estoqueEfetivo(null)).toBeNull()
  })
})

describe('resolveDisponibilidade', () => {
  const produtoBase = { preco: 'R$ 199,00', status: 'active', sell_without_stock: false }

  it('DISPONIVEL: variação active=true com estoque real > 0', () => {
    expect(resolveDisponibilidade(produtoBase, [{ active: true, stock_real: 6 }])).toBe('DISPONIVEL')
  })

  it('DISPONIVEL mesmo com sell_without_stock=true quando há estoque real confirmado (flag fica separado)', () => {
    expect(resolveDisponibilidade({ ...produtoBase, sell_without_stock: true }, [{ active: true, stock_real: 2 }])).toBe('DISPONIVEL')
  })

  it('ESGOTADO: sem venda sem estoque, todas as variações com estoque conhecido zerado', () => {
    expect(resolveDisponibilidade(produtoBase, [
      { active: true, stock_real: 0, attributes: { tamanho: 'P' } },
      { active: false, stock_real: 0, attributes: { tamanho: 'G' } },
    ])).toBe('ESGOTADO')
  })

  it('A_CONFIRMAR (não ESGOTADO) quando existe estoque desconhecido — null nunca confirma nem nega', () => {
    expect(resolveDisponibilidade(produtoBase, [
      { active: true, stock_real: 0, attributes: { tamanho: 'P' } },
      { active: null, stock_real: null, attributes: { tamanho: 'G' } },
    ])).toBe('A_CONFIRMAR')
  })

  it('A_CONFIRMAR quando produto COM grade tem active=null, mesmo com estoque positivo (active=null nunca confirma)', () => {
    expect(resolveDisponibilidade(produtoBase, [{ active: null, stock_real: 6, attributes: { tamanho: 'P' } }])).toBe('A_CONFIRMAR')
  })

  it('A_CONFIRMAR quando active=false com estoque positivo (tamanho inativo não sustenta oferta)', () => {
    expect(resolveDisponibilidade(produtoBase, [{ active: false, stock_real: 6, attributes: { tamanho: 'P' } }])).toBe('A_CONFIRMAR')
  })

  it('A_CONFIRMAR quando sell_without_stock=true sem estoque confirmado — nunca "sob encomenda" automático', () => {
    expect(resolveDisponibilidade({ ...produtoBase, sell_without_stock: true }, [{ active: true, stock_real: 0 }])).toBe('A_CONFIRMAR')
    expect(resolveDisponibilidade({ ...produtoBase, sell_without_stock: true }, [{ active: null, stock_real: null }])).toBe('A_CONFIRMAR')
  })

  it('A_CONFIRMAR quando o produto não tem variação nenhuma', () => {
    expect(resolveDisponibilidade(produtoBase, [])).toBe('A_CONFIRMAR')
  })

  // REGRA ADICIONAL APROVADA por Rafael em 2026-09-21: produto
  // comprovadamente SEM GRADE/SEM ATRIBUTO → active=null = "não se aplica".
  describe('regra de produto sem grade (aprovada 2026-09-21)', () => {
    it('sem grade + stock_real > 0 → DISPONIVEL', () => {
      expect(resolveDisponibilidade(produtoBase, [{ active: null, stock_real: 2, attributes: {} }])).toBe('DISPONIVEL')
      expect(resolveDisponibilidade(produtoBase, [
        { active: null, stock_real: 0, attributes: {} },
        { active: null, stock_real: 3, attributes: {} },
      ])).toBe('DISPONIVEL')
    })

    it('sem grade + estoque todo zerado + sell_without_stock=false → ESGOTADO', () => {
      expect(resolveDisponibilidade(produtoBase, [{ active: null, stock_real: 0, attributes: {} }])).toBe('ESGOTADO')
    })

    it('sem grade + estoque zerado ou não confirmado + sell_without_stock=true → A_CONFIRMAR', () => {
      const oos = { ...produtoBase, sell_without_stock: true }
      expect(resolveDisponibilidade(oos, [{ active: null, stock_real: 0, attributes: {} }])).toBe('A_CONFIRMAR')
      expect(resolveDisponibilidade(oos, [{ active: null, stock_real: null, attributes: {} }])).toBe('A_CONFIRMAR')
    })

    it('sem grade + estoque não confirmado + sell_without_stock=false → A_CONFIRMAR (null nunca é zero)', () => {
      expect(resolveDisponibilidade(produtoBase, [{ active: null, stock_real: null, attributes: {} }])).toBe('A_CONFIRMAR')
    })

    it('sem variações nenhuma → não é "comprovadamente sem grade" → A_CONFIRMAR', () => {
      expect(resolveDisponibilidade(produtoBase, [])).toBe('A_CONFIRMAR')
    })

    it('produto COM grade (alguma variação com atributo) continua na regra estrita', () => {
      expect(resolveDisponibilidade(produtoBase, [
        { active: null, stock_real: 6, attributes: {} },
        { active: null, stock_real: 6, attributes: { tamanho: 'P' } },
      ])).toBe('A_CONFIRMAR')
    })
  })

  it('INDISPONIVEL quando produto inativo (em qualquer vocabulário)', () => {
    expect(resolveDisponibilidade({ ...produtoBase, status: 'inactive' }, [{ active: true, stock_real: 6 }])).toBe('INDISPONIVEL')
    expect(resolveDisponibilidade({ ...produtoBase, status: 'inativo' }, [{ active: true, stock_real: 6 }])).toBe('INDISPONIVEL')
  })

  it('INDISPONIVEL quando sem preço (não é elegível pra oferta automática)', () => {
    expect(resolveDisponibilidade({ ...produtoBase, preco: null }, [{ active: true, stock_real: 6 }])).toBe('INDISPONIVEL')
    expect(resolveDisponibilidade({ ...produtoBase, preco: '  ' }, [{ active: true, stock_real: 6 }])).toBe('INDISPONIVEL')
  })
})

describe('avaliarElegibilidadeOferta', () => {
  it('sem preço → não elegível', () => {
    expect(avaliarElegibilidadeOferta({ preco: null, imagem: 'x' })).toEqual({ elegivel: false, motivo: 'sem_preco', sem_imagem: false })
  })
  it('sem imagem → elegível, mas marcada sem_imagem (nunca prometer foto inexistente)', () => {
    expect(avaliarElegibilidadeOferta({ preco: 'R$ 199,00', imagem: null })).toEqual({ elegivel: true, motivo: null, sem_imagem: true })
  })
  it('com preço e imagem → elegível sem marca', () => {
    expect(avaliarElegibilidadeOferta({ preco: 'R$ 199,00', imagem: 'https://x/y.jpg' })).toEqual({ elegivel: true, motivo: null, sem_imagem: false })
  })
})

describe('escolherLinhaCanonica', () => {
  const base = [
    { id: 'c-legado', nome: 'Tenis New Balance 530 Marrom Claro', bagy_product_id: null, source: 'bagy', preco: 'R$ 449,00', imagem: null },
    { id: 'a-sync', nome: 'Tenis New Balance 530 Marrom Claro', bagy_product_id: 10253293, source: 'bagy_sync', preco: 'R$ 449,00', imagem: 'https://x/y.jpg' },
    { id: 'b-legado', nome: 'Tenis New Balance 530 Marrom Claro', bagy_product_id: null, source: 'bagy', preco: null, imagem: 'https://x/z.jpg' },
  ]

  it('prefere vínculo Bagy validado (bagy_product_id) sobre qualquer legado', () => {
    expect(escolherLinhaCanonica(base).id).toBe('a-sync')
  })
  it('sem vínculo Bagy, prefere bagy_sync; desempata por preço, imagem e menor id', () => {
    const semVinculo = [
      { id: 'zzz', nome: 'X', bagy_product_id: null, source: 'bagy', preco: 'R$ 1,00', imagem: 'i' },
      { id: 'aaa', nome: 'X', bagy_product_id: null, source: 'bagy', preco: 'R$ 1,00', imagem: 'i' },
    ]
    expect(escolherLinhaCanonica(semVinculo).id).toBe('aaa')
  })
  it('nunca muta o array de entrada nem remove registros', () => {
    const copia = [...base]
    escolherLinhaCanonica(base)
    expect(base).toEqual(copia)
  })
})

describe('deduplicarPorLinhaCanonica', () => {
  it('1 linha por grupo de nome normalizado; grupos registrados pra auditoria, nada apagado', () => {
    const produtos = [
      { id: '1', nome: 'Tênis New Balance 530 Marrom Claro', bagy_product_id: 10253293, source: 'bagy_sync', preco: 'R$ 449,00' },
      { id: '2', nome: 'Tenis New Balance 530 Marrom Claro', bagy_product_id: null, source: 'bagy', preco: 'R$ 449,00' },
      { id: '3', nome: 'TENIS NEW BALANCE 530 MARROM CLARO', bagy_product_id: null, source: 'bagy', preco: null },
      { id: '4', nome: 'Óculos Prada', bagy_product_id: 1, source: 'bagy_sync', preco: 'R$ 199,00' },
    ]
    const { canonicas, grupos } = deduplicarPorLinhaCanonica(produtos)
    expect(canonicas).toHaveLength(2)
    expect(canonicas.map((c) => c.id)).toContain('1')
    expect(grupos).toHaveLength(1)
    expect(grupos[0].total).toBe(3)
    expect(grupos[0].ids).toHaveLength(3) // registro completo do grupo — nada excluído
    expect(grupos[0].canonicaId).toBe('1')
  })

  it('normalizarChave casa variações de acento/caso/pontuação', () => {
    expect(normalizarChave('Tênis Néw Bálance 530')).toBe(normalizarChave('tenis new balance 530'))
  })
})

describe('duplicate_group declarado (ajuste final Etapa 1, 2026-09-21)', () => {
  const par = [
    { id: 'cinza', nome: 'Camisetas On Runing Treino - Cinza', bagy_product_id: 10084131, source: 'bagy_sync', preco: 'R$ 99,00' },
    { id: 'cinza-claro', nome: 'Camisetas On Runing Treino - Cinza Claro', bagy_product_id: 10084148, source: 'bagy_sync', preco: 'R$ 99,00' },
  ]

  it('agrupa duplicidades conhecidas de nomes DIFERENTES ("Cinza Claro / Cinza")', () => {
    const { canonicas, grupos } = deduplicarPorLinhaCanonica(par)
    expect(canonicas).toHaveLength(1)
    expect(grupos).toHaveLength(1)
    expect(grupos[0].duplicate_group).toBe('declarado:camisetas-on-running-treino-cinza')
    expect(grupos[0].origem).toBe('grupo_declarado')
    expect(grupos[0].total).toBe(2)
    expect(grupos[0].ids).toEqual(expect.arrayContaining(['cinza', 'cinza-claro']))
    expect(grupos[0].chaves).toEqual(['camisetas on runing treino cinza', 'camisetas on runing treino cinza claro'])
  })

  it('auditável: canônica anotada com duplicate_group e nada é excluído nem mesclado', () => {
    const { canonicas, grupos } = deduplicarPorLinhaCanonica(par)
    expect(canonicas[0].duplicate_group).toBe('declarado:camisetas-on-running-treino-cinza')
    expect(grupos[0].ids).toHaveLength(2) // as duas linhas continuam registradas
    expect(par).toHaveLength(2) // entrada intacta
    expect(par[0]).not.toHaveProperty('duplicate_group') // sem mutação das linhas originais
  })

  it('determinístico: mesma entrada → mesma canônica e mesmo grupo, sempre', () => {
    const r1 = deduplicarPorLinhaCanonica(par)
    const r2 = deduplicarPorLinhaCanonica([...par].reverse())
    expect(r1.grupos[0].canonicaId).toBe(r2.grupos[0].canonicaId)
    expect(r1).toEqual(r2)
  })

  it('grupo declarado mistura com igualdade exata: 3 linhas (2 nomes, 1 repetido) viram 1 grupo', () => {
    const tres = [...par, { id: 'cinza-2', nome: 'Camisetas On Runing Treino - Cinza', bagy_product_id: null, source: 'bagy', preco: 'R$ 99,00' }]
    const { canonicas, grupos } = deduplicarPorLinhaCanonica(tres)
    expect(canonicas).toHaveLength(1)
    expect(grupos).toHaveLength(1)
    expect(grupos[0].total).toBe(3)
    expect(grupos[0].canonicaId).toBe('cinza') // vínculo Bagy validado vence
  })

  it('produto fora da tabela declarada segue na regra de nome exato (origem nome_exato)', () => {
    const produtos = [
      { id: 'a', nome: 'Tênis Igual', bagy_product_id: 1, source: 'bagy_sync', preco: 'R$ 1,00' },
      { id: 'b', nome: 'Tenis Igual', bagy_product_id: null, source: 'bagy', preco: 'R$ 1,00' },
    ]
    const { grupos } = deduplicarPorLinhaCanonica(produtos)
    expect(grupos[0].origem).toBe('nome_exato')
    expect(grupos[0].duplicate_group).toBe('nome:tenis igual')
  })

  it('conflito de declaração: primeiro grupo vence e o conflito é reportado (nunca silenciado)', () => {
    const declaracao = [
      { grupo: 'g1', motivo: 't', nomes: ['Mesmo Nome'] },
      { grupo: 'g2', motivo: 't', nomes: ['mesmo nome'] },
    ]
    const { grupos, conflitosDeclaracao } = deduplicarPorLinhaCanonica(
      [{ id: 'x', nome: 'Mesmo Nome', bagy_product_id: 1, source: 'bagy_sync', preco: 'R$ 1,00' },
       { id: 'y', nome: 'Mesmo Nome', bagy_product_id: 2, source: 'bagy_sync', preco: 'R$ 1,00' }],
      { gruposConhecidos: declaracao }
    )
    expect(conflitosDeclaracao).toEqual([{ chave: 'mesmo nome', grupos: ['g1', 'g2'] }])
    expect(grupos[0].duplicate_group).toBe('declarado:g1')
  })

  it('tabela declarada sem efeito quando os nomes não estão no catálogo', () => {
    const { canonicas, grupos } = deduplicarPorLinhaCanonica([
      { id: 'solo', nome: 'Produto Único', bagy_product_id: 1, source: 'bagy_sync', preco: 'R$ 1,00' },
    ])
    expect(canonicas).toHaveLength(1)
    expect(grupos).toHaveLength(0)
    expect(canonicas[0]).not.toHaveProperty('duplicate_group')
  })
})
