// PRIME Bridge — testes de whatsappFormatter.js (UX-2, v1 conservador)

import { describe, it, expect } from 'vitest'
import { formatarParaWhatsApp } from '../whatsappFormatter.js'

describe('formatarParaWhatsApp — v1 conservador', () => {
  it('1. saudação simples permanece idêntica', () => {
    const texto = 'Oi! Como posso te ajudar hoje? 😊'
    expect(formatarParaWhatsApp(texto)).toBe(texto)
  })

  it('2. lista de cores — separa a lista do texto ao redor, mas TEXT→TEXT nunca insere', () => {
    const entrada = [
      'Temos sim! 😊',
      'O New Balance 9060 está disponível nessas cores:',
      '1. Avelã — R$ 499,00',
      '2. Algodão Doce — R$ 449,00',
      '3. Azul — R$ 449,00',
      'Qual cor te agrada mais? Quer foto de alguma? 😊',
    ].join('\n')
    const esperado = [
      'Temos sim! 😊',
      'O New Balance 9060 está disponível nessas cores:',
      '',
      '1. Avelã — R$ 499,00',
      '2. Algodão Doce — R$ 449,00',
      '3. Azul — R$ 449,00',
      '',
      'Qual cor te agrada mais? Quer foto de alguma? 😊',
    ].join('\n')
    expect(formatarParaWhatsApp(entrada)).toBe(esperado)
  })

  it('3. lista seguida de pergunta', () => {
    const entrada = ['1. Camisa Polo Azul — R$ 129,00', '2. Camisa Polo Branca — R$ 129,00', 'Qual tamanho você usa?'].join('\n')
    const esperado = ['1. Camisa Polo Azul — R$ 129,00', '2. Camisa Polo Branca — R$ 129,00', '', 'Qual tamanho você usa?'].join('\n')
    expect(formatarParaWhatsApp(entrada)).toBe(esperado)
  })

  it('4. CEP em lista com marcadores — bullets ficam juntos, separados do texto acima', () => {
    const entrada = [
      '📍 *Encontrei o CEP!*',
      '• Logradouro: `Rua Coronel Antônio Alves`',
      '• Bairro: `Fundinho`',
      '• Cidade: `Uberlândia` - `MG`',
    ].join('\n')
    const esperado = [
      '📍 *Encontrei o CEP!*',
      '',
      '• Logradouro: `Rua Coronel Antônio Alves`',
      '• Bairro: `Fundinho`',
      '• Cidade: `Uberlândia` - `MG`',
    ].join('\n')
    expect(formatarParaWhatsApp(entrada)).toBe(esperado)
  })

  it('5. produto único com título, Cartão, PIX e link (revisão V1: título e preços agora também separados)', () => {
    const entrada = [
      'Perfeito! 😍',
      '*Tênis New Balance 9060 Algodão Doce*',
      '💳 Cartão: R$ 449,00 até 6x',
      '💰 PIX: R$ 427,55 (economiza R$ 21,45!)',
      '🔗 https://www.primestoremen.com.br/new-ballace-9060-algodao-doce',
      'Quer ver uma foto dele? 😊',
    ].join('\n')
    const esperado = [
      'Perfeito! 😍',
      '',
      '*Tênis New Balance 9060 Algodão Doce*',
      '',
      '💳 Cartão: R$ 449,00 até 6x',
      '',
      '💰 PIX: R$ 427,55 (economiza R$ 21,45!)',
      '',
      '🔗 https://www.primestoremen.com.br/new-ballace-9060-algodao-doce',
      '',
      'Quer ver uma foto dele? 😊',
    ].join('\n')
    expect(formatarParaWhatsApp(entrada)).toBe(esperado)
  })

  it('6. Cartão e PIX passam a ser separados por linha em branco (PRICE_LINE→PRICE_LINE, revisão V1)', () => {
    const entrada = ['💳 Cartão: R$ 199,00 até 3x', '💰 PIX: R$ 189,05'].join('\n')
    const esperado = ['💳 Cartão: R$ 199,00 até 3x', '', '💰 PIX: R$ 189,05'].join('\n')
    expect(formatarParaWhatsApp(entrada)).toBe(esperado)
  })

  it('7. link separado da pergunta final', () => {
    const entrada = ['🔗 https://www.primestoremen.com.br/new-balance-9060-avela', 'Gostou dessa cor? 😍'].join('\n')
    const esperado = ['🔗 https://www.primestoremen.com.br/new-balance-9060-avela', '', 'Gostou dessa cor? 😍'].join('\n')
    expect(formatarParaWhatsApp(entrada)).toBe(esperado)
  })

  it('8. duas linhas TEXT permanecem juntas (TEXT→TEXT nunca insere)', () => {
    const entrada = ['Boa escolha!', 'Esse modelo é um dos mais vendidos da loja.'].join('\n')
    expect(formatarParaWhatsApp(entrada)).toBe(entrada)
  })

  it('9. resposta já formatada permanece idêntica', () => {
    const entrada = [
      'Temos sim! 😊',
      'O New Balance 9060 está disponível nessas cores:',
      '',
      '1. Avelã — R$ 499,00',
      '2. Algodão Doce — R$ 449,00',
      '',
      'Qual cor te agrada mais? 😊',
    ].join('\n')
    expect(formatarParaWhatsApp(entrada)).toBe(entrada)
  })

  it('10. URL longa preservada byte a byte', () => {
    const url = 'https://www.primestoremen.com.br/colecao/tenis-esportivos-masculinos-linha-premium-2026?utm_source=whatsapp&utm_campaign=teste'
    const entrada = ['Segue o link completo do produto:', `🔗 ${url}`].join('\n')
    const resultado = formatarParaWhatsApp(entrada)
    const linhaDoLink = resultado.split('\n').find((l) => l.includes('http'))
    expect(linhaDoLink).toBe(`🔗 ${url}`)
  })

  it('11. três ou mais linhas vazias são normalizadas para uma única', () => {
    const entrada = ['Oi!', '', '', '', 'Tudo bem?'].join('\n')
    const esperado = ['Oi!', '', 'Tudo bem?'].join('\n')
    expect(formatarParaWhatsApp(entrada)).toBe(esperado)
  })

  it('11b. duas linhas vazias já existentes não são normalizadas (só 3+)', () => {
    const entrada = ['Oi!', '', '', 'Tudo bem?'].join('\n')
    expect(formatarParaWhatsApp(entrada)).toBe(entrada)
  })

  it('12. idempotência — formatar o resultado já formatado não muda nada', () => {
    const entrada = [
      'Temos sim! 😊',
      'O New Balance 9060 está disponível nessas cores:',
      '1. Avelã — R$ 499,00',
      '2. Algodão Doce — R$ 449,00',
      '3. Azul — R$ 449,00',
      'Qual cor te agrada mais? Quer foto de alguma? 😊',
    ].join('\n')
    const primeiraPassada = formatarParaWhatsApp(entrada)
    const segundaPassada = formatarParaWhatsApp(primeiraPassada)
    expect(segundaPassada).toBe(primeiraPassada)
  })

  it('13. texto vazio permanece vazio', () => {
    expect(formatarParaWhatsApp('')).toBe('')
  })

  it('14. valor não-string é devolvido sem alteração (nunca lança, nunca inventa conteúdo)', () => {
    expect(formatarParaWhatsApp(null)).toBe(null)
    expect(formatarParaWhatsApp(undefined)).toBe(undefined)
    expect(formatarParaWhatsApp(42)).toBe(42)
    expect(formatarParaWhatsApp({ a: 1 })).toEqual({ a: 1 })
  })

  it('15. PRICE_LINE→PRICE_LINE — separa Cartão e PIX adjacentes', () => {
    const entrada = ['💳 Cartão: R$ 136,00 em até 6x', '💰 PIX: R$ 136,00'].join('\n')
    const esperado = ['💳 Cartão: R$ 136,00 em até 6x', '', '💰 PIX: R$ 136,00'].join('\n')
    expect(formatarParaWhatsApp(entrada)).toBe(esperado)
  })

  it('16. TEXT→PRODUCT_TITLE — separa frase solta do título em negrito', () => {
    const entrada = ['Aqui está! 😊', '*Cinto Montblanc de Couro Marrom*'].join('\n')
    const esperado = ['Aqui está! 😊', '', '*Cinto Montblanc de Couro Marrom*'].join('\n')
    expect(formatarParaWhatsApp(entrada)).toBe(esperado)
  })

  it('17. PRODUCT_TITLE→PRICE_LINE — separa título do Cartão', () => {
    const entrada = ['*Cinto Montblanc de Couro Marrom*', '💳 Cartão: R$ 136,00 em até 6x'].join('\n')
    const esperado = ['*Cinto Montblanc de Couro Marrom*', '', '💳 Cartão: R$ 136,00 em até 6x'].join('\n')
    expect(formatarParaWhatsApp(entrada)).toBe(esperado)
  })

  it('18. LINK_LINE reconhece "Link: <url>" sem emoji', () => {
    const url = 'https://www.primestoremen.com.br/cinto-montblanc-de-couro-marrom'
    const entrada = ['💰 PIX: R$ 136,00', `Link: ${url}`].join('\n')
    const esperado = ['💰 PIX: R$ 136,00', '', `Link: ${url}`].join('\n')
    expect(formatarParaWhatsApp(entrada)).toBe(esperado)
  })

  it('19. LINK_LINE reconhece "🔗 Link: <url>" (caso real da Gaby)', () => {
    const url = 'https://www.primestoremen.com.br/cinto-montblanc-de-couro-marrom'
    const entrada = ['💰 PIX: R$ 136,00', `🔗 Link: ${url}`].join('\n')
    const esperado = ['💰 PIX: R$ 136,00', '', `🔗 Link: ${url}`].join('\n')
    expect(formatarParaWhatsApp(entrada)).toBe(esperado)
  })

  it('20. caso real completo — Cinto Montblanc com título, Cartão, PIX e 🔗 Link:', () => {
    const entrada = [
      'Aqui está! 😊',
      '*Cinto Montblanc de Couro Marrom*',
      '💳 Cartão: R$ 136,00 em até 6x',
      '💰 PIX: R$ 136,00',
      '🔗 Link: https://www.primestoremen.com.br/cinto-montblanc-de-couro-marrom',
      'Gostou? Quer que eu separe um para você? 😊',
    ].join('\n')
    const esperado = [
      'Aqui está! 😊',
      '',
      '*Cinto Montblanc de Couro Marrom*',
      '',
      '💳 Cartão: R$ 136,00 em até 6x',
      '',
      '💰 PIX: R$ 136,00',
      '',
      '🔗 Link: https://www.primestoremen.com.br/cinto-montblanc-de-couro-marrom',
      '',
      'Gostou? Quer que eu separe um para você? 😊',
    ].join('\n')
    const resultado = formatarParaWhatsApp(entrada)
    expect(resultado).toBe(esperado)

    // Invariante semântica (item 7 do plano): removendo só as linhas vazias
    // da saída, sobram exatamente as mesmas linhas não vazias da entrada,
    // na mesma ordem, byte a byte.
    const naoVaziasEntrada = entrada.split('\n').filter((l) => l.trim() !== '')
    const naoVaziasResultado = resultado.split('\n').filter((l) => l.trim() !== '')
    expect(naoVaziasResultado).toEqual(naoVaziasEntrada)
  })

  it('21. idempotência do caso real completo (Montblanc)', () => {
    const entrada = [
      'Aqui está! 😊',
      '*Cinto Montblanc de Couro Marrom*',
      '💳 Cartão: R$ 136,00 em até 6x',
      '💰 PIX: R$ 136,00',
      '🔗 Link: https://www.primestoremen.com.br/cinto-montblanc-de-couro-marrom',
      'Gostou? Quer que eu separe um para você? 😊',
    ].join('\n')
    const primeiraPassada = formatarParaWhatsApp(entrada)
    const segundaPassada = formatarParaWhatsApp(primeiraPassada)
    expect(segundaPassada).toBe(primeiraPassada)
  })

  it('22. caso real — lista com preço embutido no item (Conjunto Alo) continua LIST_ITEM, não PRICE_LINE', () => {
    const entrada = [
      'Encontrei o *Conjunto Alo Fitness* nas seguintes cores:',
      '1. ⚫ Preto — R$ 279',
      '2. 🔵 Azul — R$ 279',
      'Qual você prefere? 😊',
    ].join('\n')
    const esperado = [
      'Encontrei o *Conjunto Alo Fitness* nas seguintes cores:',
      '',
      '1. ⚫ Preto — R$ 279',
      '2. 🔵 Azul — R$ 279',
      '',
      'Qual você prefere? 😊',
    ].join('\n')
    expect(formatarParaWhatsApp(entrada)).toBe(esperado)
  })

  it('23. TEXT→TEXT continua nunca inserindo, mesmo com os novos tipos disponíveis', () => {
    const entrada = ['Boa escolha!', 'Esse modelo é um dos mais vendidos da loja.'].join('\n')
    expect(formatarParaWhatsApp(entrada)).toBe(entrada)
  })

  it('nunca altera nenhuma palavra/caractere de conteúdo — só espaçamento entre linhas', () => {
    const entrada = [
      'Perfeito! 😍',
      '*Tênis New Balance 9060 Algodão Doce*',
      '💳 Cartão: R$ 449,00 até 6x',
      '💰 PIX: R$ 427,55 (economiza R$ 21,45!)',
      '🔗 https://www.primestoremen.com.br/new-ballace-9060-algodao-doce',
      'Quer ver uma foto dele? 😊',
    ].join('\n')
    const resultado = formatarParaWhatsApp(entrada)
    const palavrasEntrada = entrada.split(/\s+/).filter(Boolean)
    const palavrasResultado = resultado.split(/\s+/).filter(Boolean)
    expect(palavrasResultado).toEqual(palavrasEntrada)
  })
})
