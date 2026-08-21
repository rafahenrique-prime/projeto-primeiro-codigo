import { describe, it, expect } from 'vitest'
import { avaliarProduto, avaliarCatalogo } from '../qualidadeCatalogoRules.js'

function produto(overrides = {}) {
  return {
    id: 'uuid-1',
    bagy_product_id: 1,
    nome: 'Produto Padrão',
    marca: 'Marca X',
    categoria_nome: 'Categoria X',
    preco: 100,
    preco_pix: 95,
    link: 'https://www.primestoremen.com.br/produto-padrao',
    imagem_principal: 'https://cdn.dooca.store/img.jpg',
    ativo: true,
    ...overrides,
  }
}

function tipos(achados) {
  return achados.map((a) => a.tipo)
}

describe('avaliarProduto — FATOS', () => {
  it('produto bem formado com variação: zero achados', () => {
    const achados = avaliarProduto(produto(), [{ id: 'v1' }])
    expect(achados).toEqual([])
  })

  it('marca ausente', () => {
    const achados = avaliarProduto(produto({ marca: null }), [{ id: 'v1' }])
    expect(tipos(achados)).toContain('marca_ausente')
    expect(achados.find((a) => a.tipo === 'marca_ausente').classe).toBe('FATO')
  })

  it('marca ausente também dispara com string vazia/espaços', () => {
    expect(tipos(avaliarProduto(produto({ marca: '' }), [{ id: 'v1' }]))).toContain('marca_ausente')
    expect(tipos(avaliarProduto(produto({ marca: '   ' }), [{ id: 'v1' }]))).toContain('marca_ausente')
  })

  it('categoria ausente', () => {
    const achados = avaliarProduto(produto({ categoria_nome: null }), [{ id: 'v1' }])
    expect(tipos(achados)).toContain('categoria_ausente')
  })

  it('preço ausente', () => {
    expect(tipos(avaliarProduto(produto({ preco: null }), [{ id: 'v1' }]))).toContain('preco_ausente_ou_invalido')
  })

  it('preço zero ou negativo é inválido', () => {
    expect(tipos(avaliarProduto(produto({ preco: 0 }), [{ id: 'v1' }]))).toContain('preco_ausente_ou_invalido')
    expect(tipos(avaliarProduto(produto({ preco: -10 }), [{ id: 'v1' }]))).toContain('preco_ausente_ou_invalido')
  })

  it('PIX ausente', () => {
    expect(tipos(avaliarProduto(produto({ preco_pix: null }), [{ id: 'v1' }]))).toContain('pix_ausente')
  })

  it('PIX maior que preço', () => {
    const achados = avaliarProduto(produto({ preco: 100, preco_pix: 150 }), [{ id: 'v1' }])
    expect(tipos(achados)).toContain('pix_maior_que_preco')
    expect(tipos(achados)).not.toContain('pix_ausente')
  })

  it('link ausente', () => {
    expect(tipos(avaliarProduto(produto({ link: null }), [{ id: 'v1' }]))).toContain('link_ausente')
  })

  it('link com domínio inesperado', () => {
    const achados = avaliarProduto(produto({ link: 'https://outrosite.com/produto' }), [{ id: 'v1' }])
    expect(tipos(achados)).toContain('link_dominio_invalido')
  })

  it('imagem ausente', () => {
    expect(tipos(avaliarProduto(produto({ imagem_principal: null }), [{ id: 'v1' }]))).toContain('imagem_ausente')
  })

  it('imagem com URL inválida (não http)', () => {
    const achados = avaliarProduto(produto({ imagem_principal: 'nao-e-url' }), [{ id: 'v1' }])
    expect(tipos(achados)).toContain('imagem_invalida')
  })

  it('produto sem variações', () => {
    expect(tipos(avaliarProduto(produto(), []))).toContain('sem_variacoes')
    expect(tipos(avaliarProduto(produto(), undefined))).toContain('sem_variacoes')
  })

  it('cada achado retorna a estrutura completa exigida', () => {
    const achados = avaliarProduto(produto({ marca: null }), [{ id: 'v1' }])
    const a = achados.find((x) => x.tipo === 'marca_ausente')
    expect(a).toHaveProperty('tipo')
    expect(a).toHaveProperty('classe')
    expect(a).toHaveProperty('severidade')
    expect(a).toHaveProperty('mensagem')
    expect(a).toHaveProperty('encontrado')
    expect(a).toHaveProperty('esperado_sugerido')
    expect(a).toHaveProperty('porQue')
    expect(a).toHaveProperty('oQueConferir')
  })
})

describe('avaliarProduto — ALERTAS (classe ALERTA, nunca FATO)', () => {
  it('marca citada no nome ≠ campo marca — caso real: Bone Boss, marca FENDI', () => {
    const achados = avaliarProduto(produto({ nome: 'Bone Boss Importada', marca: 'FENDI' }), [{ id: 'v1' }])
    const a = achados.find((x) => x.tipo === 'marca_incompativel')
    expect(a).toBeDefined()
    expect(a.classe).toBe('ALERTA')
    expect(a.severidade).toBe('CRITICO')
  })

  it('marca citada no nome BATE com o campo marca — nenhum alerta', () => {
    const achados = avaliarProduto(produto({ nome: 'Tenis Hugo Boss', marca: 'BOSS' }), [{ id: 'v1' }])
    expect(tipos(achados)).not.toContain('marca_incompativel')
  })

  it('marca com nome que não cita nenhuma marca conhecida — sem alerta (sem evidência)', () => {
    const achados = avaliarProduto(produto({ nome: 'Produto Genérico', marca: 'Qualquer Coisa' }), [{ id: 'v1' }])
    expect(tipos(achados)).not.toContain('marca_incompativel')
  })

  it('categoria incompatível — caso real: Boné classificado como Bermudas', () => {
    const achados = avaliarProduto(produto({ nome: 'Bone Dior Importada', categoria_nome: 'Bermudas' }), [{ id: 'v1' }])
    const a = achados.find((x) => x.tipo === 'categoria_incompativel')
    expect(a).toBeDefined()
    expect(a.classe).toBe('ALERTA')
    expect(a.severidade).toBe('CRITICO')
  })

  it('categoria compatível (Boné em Acessórios) — nenhum alerta', () => {
    const achados = avaliarProduto(produto({ nome: 'Bone Dior Importada', categoria_nome: 'Acessórios' }), [{ id: 'v1' }])
    expect(tipos(achados)).not.toContain('categoria_incompativel')
  })

  it('produto de teste — nome com "Anuncio Teste"', () => {
    const achados = avaliarProduto(produto({ nome: 'Regata Alo Feminina Importada Preta - Anuncio Teste' }), [{ id: 'v1' }])
    expect(tipos(achados)).toContain('suspeito_de_teste')
  })

  it('produto de teste — link com "teste-oficial"', () => {
    const achados = avaliarProduto(produto({ nome: 'Regata Branca', link: 'https://www.primestoremen.com.br/regata-branca-teste-oficial' }), [{ id: 'v1' }])
    expect(tipos(achados)).toContain('suspeito_de_teste')
  })
})

describe('avaliarCatalogo — nome duplicado exato (FATO)', () => {
  it('2 produtos ativos com nome idêntico: ambos recebem o achado', () => {
    const produtos = [
      produto({ id: 'a', bagy_product_id: 1, nome: 'Bermuda Diesel Verde' }),
      produto({ id: 'b', bagy_product_id: 2, nome: 'Bermuda Diesel Verde' }),
    ]
    const vars = new Map([['a', [{ id: 'v1' }]], ['b', [{ id: 'v2' }]]])
    const resultado = avaliarCatalogo(produtos, vars)
    const achadosA = resultado.resultados.find((r) => r.produto.id === 'a').achados
    const achadosB = resultado.resultados.find((r) => r.produto.id === 'b').achados
    expect(achadosA.map((x) => x.tipo)).toContain('nome_duplicado_exato')
    expect(achadosB.map((x) => x.tipo)).toContain('nome_duplicado_exato')
  })

  it('produto inativo com nome duplicado NÃO entra na análise (fora da fila ativa)', () => {
    const produtos = [
      produto({ id: 'a', bagy_product_id: 1, nome: 'Bermuda Diesel Verde', ativo: true }),
      produto({ id: 'b', bagy_product_id: 2, nome: 'Bermuda Diesel Verde', ativo: false }),
    ]
    const vars = new Map([['a', [{ id: 'v1' }]], ['b', [{ id: 'v2' }]]])
    const resultado = avaliarCatalogo(produtos, vars)
    expect(resultado.totalAtivosAnalisados).toBe(1)
    expect(resultado.resultados.find((r) => r.produto.id === 'b')).toBeUndefined()
  })
})

describe('avaliarCatalogo — quase-duplicidade (SUGESTAO, guarda-corpo forte)', () => {
  it('caso real: "Bermuda Diesel Vermelha" × "Bermudas Diesel Vermelha" (singular/plural) — sinaliza', () => {
    const produtos = [
      produto({ id: 'a', bagy_product_id: 1, nome: 'Bermuda Diesel Vermelha' }),
      produto({ id: 'b', bagy_product_id: 2, nome: 'Bermudas Diesel Vermelha' }),
    ]
    const vars = new Map([['a', [{ id: 'v1' }]], ['b', [{ id: 'v2' }]]])
    const resultado = avaliarCatalogo(produtos, vars)
    const achadosA = resultado.resultados.find((r) => r.produto.id === 'a').achados
    expect(achadosA.map((x) => x.tipo)).toContain('quase_duplicado')
    expect(achadosA.find((x) => x.tipo === 'quase_duplicado').classe).toBe('SUGESTAO')
  })

  it('caso real: sufixo numérico "Anuncio Teste 00002" × "Anuncio Teste" — sinaliza', () => {
    const produtos = [
      produto({ id: 'a', bagy_product_id: 1, nome: 'Regata Preta Anuncio Teste 00002' }),
      produto({ id: 'b', bagy_product_id: 2, nome: 'Regata Preta Anuncio Teste' }),
    ]
    const vars = new Map([['a', [{ id: 'v1' }]], ['b', [{ id: 'v2' }]]])
    const resultado = avaliarCatalogo(produtos, vars)
    const achadosA = resultado.resultados.find((r) => r.produto.id === 'a').achados
    expect(achadosA.map((x) => x.tipo)).toContain('quase_duplicado')
  })

  it('GUARDA-CORPO: variantes legítimas de cor NUNCA são sinalizadas como quase-duplicado', () => {
    const produtos = [
      produto({ id: 'a', bagy_product_id: 1, nome: 'Tenis New Balance 9060 Rosa com Branco' }),
      produto({ id: 'b', bagy_product_id: 2, nome: 'Tenis New Balance 9060 Preto com Branco' }),
    ]
    const vars = new Map([['a', [{ id: 'v1' }]], ['b', [{ id: 'v2' }]]])
    const resultado = avaliarCatalogo(produtos, vars)
    const achadosA = resultado.resultados.find((r) => r.produto.id === 'a').achados
    expect(achadosA.map((x) => x.tipo)).not.toContain('quase_duplicado')
  })

  it('CALIBRAÇÃO A) dois nomes com números finais DIFERENTES, mesma qtd de tokens — NÃO sinaliza (caso real: Cueca Lup 002 x Cueca Lup 009)', () => {
    const produtos = [
      produto({ id: 'a', bagy_product_id: 1, nome: 'Cueca Lup 002' }),
      produto({ id: 'b', bagy_product_id: 2, nome: 'Cueca Lup 009' }),
    ]
    const vars = new Map([['a', [{ id: 'v1' }]], ['b', [{ id: 'v2' }]]])
    const resultado = avaliarCatalogo(produtos, vars)
    const achadosA = resultado.resultados.find((r) => r.produto.id === 'a').achados
    expect(achadosA.map((x) => x.tipo)).not.toContain('quase_duplicado')
  })

  it('CALIBRAÇÃO A) caso real: Chinelo Diesel Model 001 x Model 002 — NÃO sinaliza', () => {
    const produtos = [
      produto({ id: 'a', bagy_product_id: 1, nome: 'Chinelo Diesel Model 001' }),
      produto({ id: 'b', bagy_product_id: 2, nome: 'Chinelo Diesel Model 002' }),
    ]
    const vars = new Map([['a', [{ id: 'v1' }]], ['b', [{ id: 'v2' }]]])
    const resultado = avaliarCatalogo(produtos, vars)
    const achadosA = resultado.resultados.find((r) => r.produto.id === 'a').achados
    expect(achadosA.map((x) => x.tipo)).not.toContain('quase_duplicado')
  })

  it('CALIBRAÇÃO B) 1 nome com sufixo numérico EXTRA (qtd de tokens diferente) — CONTINUA sinalizando (caso real: Anuncio Teste 00002 x Anuncio Teste)', () => {
    const produtos = [
      produto({ id: 'a', bagy_product_id: 1, nome: 'Regata Preta Anuncio Teste 00002' }),
      produto({ id: 'b', bagy_product_id: 2, nome: 'Regata Preta Anuncio Teste' }),
    ]
    const vars = new Map([['a', [{ id: 'v1' }]], ['b', [{ id: 'v2' }]]])
    const resultado = avaliarCatalogo(produtos, vars)
    const achadosA = resultado.resultados.find((r) => r.produto.id === 'a').achados
    expect(achadosA.map((x) => x.tipo)).toContain('quase_duplicado')
  })

  it('CALIBRAÇÃO C) singular/plural legítimo — CONTINUA sinalizando (caso real: Bermuda x Bermudas Diesel Vermelha)', () => {
    const produtos = [
      produto({ id: 'a', bagy_product_id: 1, nome: 'Bermuda Diesel Vermelha' }),
      produto({ id: 'b', bagy_product_id: 2, nome: 'Bermudas Diesel Vermelha' }),
    ]
    const vars = new Map([['a', [{ id: 'v1' }]], ['b', [{ id: 'v2' }]]])
    const resultado = avaliarCatalogo(produtos, vars)
    const achadosA = resultado.resultados.find((r) => r.produto.id === 'a').achados
    expect(achadosA.map((x) => x.tipo)).toContain('quase_duplicado')
  })

  it('CALIBRAÇÃO D) variantes de cor/modelo — continuam protegidas mesmo com números iguais em qtd de tokens', () => {
    const produtos = [
      produto({ id: 'a', bagy_product_id: 1, nome: 'Camiseta Off White Kaws Trio Branca 2' }),
      produto({ id: 'b', bagy_product_id: 2, nome: 'Camiseta Off White Kaws Trio Preta 3' }),
    ]
    const vars = new Map([['a', [{ id: 'v1' }]], ['b', [{ id: 'v2' }]]])
    const resultado = avaliarCatalogo(produtos, vars)
    const achadosA = resultado.resultados.find((r) => r.produto.id === 'a').achados
    expect(achadosA.map((x) => x.tipo)).not.toContain('quase_duplicado')
  })

  it('GUARDA-CORPO: nomes claramente diferentes (produtos distintos) nunca são sinalizados', () => {
    const produtos = [
      produto({ id: 'a', bagy_product_id: 1, nome: 'Boné Importado Diesel Preto' }),
      produto({ id: 'b', bagy_product_id: 2, nome: 'Necessaire Marrom Xadrez Unissex LV' }),
    ]
    const vars = new Map([['a', [{ id: 'v1' }]], ['b', [{ id: 'v2' }]]])
    const resultado = avaliarCatalogo(produtos, vars)
    const achadosA = resultado.resultados.find((r) => r.produto.id === 'a').achados
    expect(achadosA.map((x) => x.tipo)).not.toContain('quase_duplicado')
  })

  it('nomes idênticos não viram quase-duplicado (isso é duplicata EXATA, classe F)', () => {
    const produtos = [
      produto({ id: 'a', bagy_product_id: 1, nome: 'Bermuda Diesel Verde' }),
      produto({ id: 'b', bagy_product_id: 2, nome: 'Bermuda Diesel Verde' }),
    ]
    const vars = new Map([['a', [{ id: 'v1' }]], ['b', [{ id: 'v2' }]]])
    const resultado = avaliarCatalogo(produtos, vars)
    const achadosA = resultado.resultados.find((r) => r.produto.id === 'a').achados
    expect(achadosA.map((x) => x.tipo)).not.toContain('quase_duplicado')
    expect(achadosA.map((x) => x.tipo)).toContain('nome_duplicado_exato')
  })
})

describe('avaliarCatalogo — agregação', () => {
  it('conta corretamente total/com achados/sem achados', () => {
    const produtos = [
      produto({ id: 'a', bagy_product_id: 1, nome: 'Produto OK' }),
      produto({ id: 'b', bagy_product_id: 2, nome: 'Produto Sem Marca', marca: null }),
    ]
    const vars = new Map([['a', [{ id: 'v1' }]], ['b', [{ id: 'v2' }]]])
    const resultado = avaliarCatalogo(produtos, vars)
    expect(resultado.totalAtivosAnalisados).toBe(2)
    expect(resultado.semAchados).toBe(1)
    expect(resultado.comAchados).toBe(1)
  })
})
