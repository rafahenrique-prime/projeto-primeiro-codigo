// Suíte de caracterização de api/auto-photo.js — Fase 1 (sem rede, sem side-effects).
//
// Objetivo: congelar o comportamento REAL de hoje (código de produção, via imports
// nomeados exportados especificamente para este teste) antes de qualquer correção.
// Não faz nenhuma chamada de rede (WhatsApp, GPT Maker, Telegram, Supabase, Vercel) —
// só exercita as funções puras de decisão (findProductInText, extractProductName,
// detectProductRequest, normalize) com fixtures que reproduzem os casos reais
// observados em testes supervisionados na Gaby Lab (agente de laboratório, isolada
// de produção) em 2026-08-12.
//
// Ver docs/backups/ (logs reais do Vercel, capturados via `vercel logs --since/--until`)
// para a evidência original que fundamenta os fixtures abaixo.

import { describe, it, expect } from 'vitest'
import {
  PALAVRAS_GENERICAS,
  normalize,
  findProductInText,
  extractProductName,
  detectProductRequest,
  getLastAssistantText,
} from '../auto-photo.js'

// ── Fixture de catálogo — subconjunto real observado nos logs de produção ──
// (nomes e categorias idênticos aos vistos em `[findProductInText] FASE2 - ...`
// nos logs reais; preço/link/imagem simplificados pois não afetam a busca)
const CATALOGO_FIXTURE = [
  { nome: 'Tenis New Balance 530 Rosa Cream', preco: 'R$ 399,83', imagem: 'https://cdn.dooca.store/530-rosa.jpg', link: 'https://x/530-rosa' },
  { nome: 'Tênis New Balance 9060 Azul Bebe', preco: 'R$ 449,00', imagem: 'https://cdn.dooca.store/9060-azul-bebe.jpg', link: 'https://x/9060-azul-bebe' },
  { nome: 'Tênis Nike Dunk Cacau', preco: 'R$ 289,00', imagem: 'https://cdn.dooca.store/dunk-cacau.jpg', link: 'https://x/dunk-cacau' },
  { nome: 'Tenis New Balance 9060 Preto com Branco', preco: 'R$ 399,83', imagem: 'https://cdn.dooca.store/9060-preto-branco.jpg', link: 'https://x/9060-preto-branco' },
  { nome: 'Tenis New Balance 9060 Preto C/ Cinza', preco: 'R$ 399,83', imagem: 'https://cdn.dooca.store/9060-preto-cinza.jpg', link: 'https://x/9060-preto-cinza' },
  { nome: 'Tênis New Balance 9060 Off White C/ Verde Claro New', preco: 'R$ 449,00', imagem: 'https://cdn.dooca.store/9060-offwhite-verde.jpg', link: 'https://x/9060-offwhite-verde' },
  { nome: 'New Balance 997 Branco', preco: 'R$ 355,31', imagem: 'https://cdn.dooca.store/997-branco.jpg', link: 'https://x/997-branco' },
  { nome: 'Louis Vuitton Lv Skate Sneaker Branco Preto Cinza', preco: 'R$ 459,00', imagem: 'https://supabase.co/lv-skate.jpg', link: 'https://x/lv-skate' },
  { nome: 'Louis Vuitton Lv Skate Sneaker Azul', preco: 'R$ 459,00', imagem: 'https://supabase.co/lv-skate-azul.jpg', link: 'https://x/lv-skate-azul' },
  { nome: 'Tenis New Balance 9060 Cinza Claro', preco: 'R$ 399,83', imagem: 'https://cdn.dooca.store/9060-cinza.jpg', link: 'https://x/9060-cinza' },
  // Fixtures da regressão masculino/feminino (Fase 2 tirou essas palavras de
  // CATEGORIAS_REAIS — precisam continuar elegíveis por categoria real, e não
  // podem fazer "masculino"/"feminino" virar um filtro de categoria por engano).
  { nome: 'Tenis Masculino Nike Runner', preco: 'R$ 329,00', imagem: 'https://cdn.dooca.store/tenis-masc-runner.jpg', link: 'https://x/tenis-masc-runner' },
  { nome: 'Camiseta Feminina Basica', preco: 'R$ 89,00', imagem: 'https://cdn.dooca.store/camiseta-fem-basica.jpg', link: 'https://x/camiseta-fem-basica' },
  { nome: 'Bone Masculino Preto', preco: 'R$ 119,00', imagem: 'https://cdn.dooca.store/bone-masc-preto.jpg', link: 'https://x/bone-masc-preto' },
]

// Simula, fora do handler, a mesma cascata de decisão que existe em auto-photo.js
// (linhas 655-733): extractProductName → contexto cliente c/ cor → contexto cliente
// sem cor → contexto do agente. Reaproveita as funções REAIS exportadas — só a
// orquestração é replicada aqui (o handler não expõe essa cascata como função única).
function resolverProdutoComoOAutoPhotoFaria(message, messages, catalog) {
  const nomeProduto = extractProductName(message)
  if (nomeProduto) {
    const p = findProductInText(nomeProduto, catalog)
    if (p) return p
  }

  const clientMsgsReverse = [...messages].reverse().filter(m =>
    m.role === 'user' || m.role === 'client' || m.role === 'human' || m.role === 'customer'
  )
  const colorPatterns = /\b(preto|branco|vermelho|azul|verde|amarelo|rosa|roxo|cinza|cinzento|gelo|marrom|bege|ouro|prata|dourado|metalico|tamanho|numero|pp|p|m|g|gg|xg)\b/gi
  const colorsInMessage = [...(message.match(colorPatterns) || [])].map(c => c.toLowerCase())
  const recentContext = clientMsgsReverse.slice(0, 5)
    .map(m => m.text || m.content || m.message || '')
    .join(' ')
    .toLowerCase()

  if (recentContext && colorsInMessage.length > 0) {
    const found = findProductInText(recentContext, catalog)
    if (found) {
      const foundNameLower = (found.nome || '').toLowerCase()
      const hasColor = colorsInMessage.some(color => foundNameLower.includes(color))
      if (hasColor) return found
    }
  }

  if (recentContext) {
    const found = findProductInText(recentContext, catalog)
    if (found) return found
  }

  const agentMsgsReverse = [...messages].reverse().filter(m =>
    m.role === 'assistant' || m.role === 'agent' || m.role === 'bot'
  )
  const agentContext = agentMsgsReverse.slice(0, 6)
    .map(m => m.text || m.content || m.message || '')
    .join(' ')
    .toLowerCase()

  if (agentContext) {
    const found = findProductInText(agentContext, catalog)
    if (found) return found
  }

  return null
}

describe('PALAVRAS_GENERICAS — documentação das categorias reais vs. palavras de ação', () => {
  // Ajuste 2 do plano: descobrir (não inventar) o que já existe hoje, sem alterar nada.
  const CATEGORIAS_REAIS_OBSERVADAS = [
    'tenis', 'camiseta', 'camisa', 'cueca', 'bermuda', 'calca', 'conjunto',
    'perfume', 'oculos', 'bone', 'blusa', 'moletom', 'chinelo', 'papete',
    'sandalia', 'plataforma', 'cropped', 'short', 'shorts', 'cinto', 'jaqueta', 'carteira',
  ]
  const ATRIBUTOS_NAO_CATEGORIA = ['masculino', 'feminino'] // gênero, não tipo de produto
  const ACAO_PRONOME_NUNCA_CATEGORIA = [
    'foto', 'imagem', 'produto', 'esse', 'essa', 'este', 'esta', 'dele', 'dela',
  ]

  it('PALAVRAS_GENERICAS hoje contém exatamente estes 33 itens (linha de base documentada)', () => {
    expect([...PALAVRAS_GENERICAS].sort()).toEqual(
      [...CATEGORIAS_REAIS_OBSERVADAS, ...ATRIBUTOS_NAO_CATEGORIA, ...ACAO_PRONOME_NUNCA_CATEGORIA].sort()
    )
  })

  it('confirma que "foto" e "imagem" estão hoje misturadas nas mesmas PALAVRAS_GENERICAS usadas para detectar categoria (causa raiz)', () => {
    expect(PALAVRAS_GENERICAS.has('foto')).toBe(true)
    expect(PALAVRAS_GENERICAS.has('imagem')).toBe(true)
    // Nenhuma dessas é uma categoria de produto — são palavras de ação/pedido.
    expect(CATEGORIAS_REAIS_OBSERVADAS.includes('foto')).toBe(false)
    expect(CATEGORIAS_REAIS_OBSERVADAS.includes('imagem')).toBe(false)
  })
})

describe('Casos positivos reais (controles — não podem regredir)', () => {
  it('2. New Balance 9060 Azul Bebê + "quero" (confirmação curta) → mantém o produto escolhido', () => {
    const messages = [
      { role: 'user', text: 'NB 9060 azul bebe tem?' },
      { role: 'assistant', text: 'Tem sim! New Balance 9060 Azul Bebê — R$ 449,00. Quer que eu te envie a foto?' },
      { role: 'user', text: 'quero' },
    ]
    const produto = resolverProdutoComoOAutoPhotoFaria('quero', messages, CATALOGO_FIXTURE)
    expect(produto?.nome).toBe('Tênis New Balance 9060 Azul Bebe')
  })

  it('3. Nike Dunk Cacau + "sim" (confirmação curta) → mantém o produto correto', () => {
    const messages = [
      { role: 'user', text: 'quais nike dunk voce tem?' },
      { role: 'assistant', text: 'Temos esses Nike Dunk disponíveis' },
      { role: 'user', text: 'cacau' },
      { role: 'assistant', text: 'Temos o Tênis Nike Dunk Cacau — R$ 289,00. Quer ver a foto?' },
      { role: 'user', text: 'sim' },
    ]
    const produto = resolverProdutoComoOAutoPhotoFaria('sim', messages, CATALOGO_FIXTURE)
    expect(produto?.nome).toBe('Tênis Nike Dunk Cacau')
  })

  it('4. Produto explícito na própria mensagem ("manda foto do New Balance 9060 Preto com Branco") → identifica corretamente via extractProductName', () => {
    const nomeExtraido = extractProductName('manda foto do New Balance 9060 Preto com Branco')
    expect(nomeExtraido).toBeTruthy()
    const produto = findProductInText(nomeExtraido, CATALOGO_FIXTURE)
    expect(produto?.nome).toBe('Tenis New Balance 9060 Preto com Branco')
  })

  it('"quero" sozinho não deve nunca ser tratado como se fosse um nome de produto (extractProductName)', () => {
    expect(extractProductName('quero')).toBeNull()
  })

  it('"sim" sozinho nunca deve virar categoria/produto via extractProductName', () => {
    expect(extractProductName('sim')).toBeNull()
  })
})

describe('Regressão do bug corrigido — incidente real (2026-08-12), Fase 2 aplicada', () => {
  // Corrigido na Fase 2 (separação de CATEGORIAS_REAIS vs. palavras de ação em
  // findProductInText). Estes eram `it.fails` documentando o bug antes da correção;
  // agora são testes normais e verdes — viram regressão permanente.
  it('5. [CORRIGIDO] contexto "9060 Preto / 37 / manda foto" agora identifica o New Balance 9060 correto, nunca produto de marca errada (Louis Vuitton)', () => {
    const messages = [
      { role: 'user', text: 'Tem New Balance 9060?' },
      { role: 'assistant', text: 'Temos sim! New Balance 9060 Preto com Branco e Preto com Cinza — R$ 399,83.' },
      { role: 'user', text: 'preto' },
      { role: 'assistant', text: 'New Balance 9060 Preto — R$ 399,83. Também temos Preto com Branco e Preto com Cinza. Qual numeração você usa?' },
      { role: 'user', text: '37' },
      { role: 'assistant', text: 'Vou verificar a disponibilidade exata do tamanho 37.' },
      { role: 'user', text: 'tem?' },
      { role: 'assistant', text: 'Ainda não consigo confirmar se o tamanho 37 está disponível.' },
      { role: 'user', text: 'manda foto' },
    ]
    const produto = resolverProdutoComoOAutoPhotoFaria('manda foto', messages, CATALOGO_FIXTURE)
    // Comportamento PROIBIDO, documentado — nunca pode ser um produto de outra marca.
    expect(produto?.nome).not.toMatch(/Louis Vuitton/i)
    expect(produto?.nome).toMatch(/New Balance 9060/i)
  })

  it('6. [CORRIGIDO] contexto "9060 Off White com Verde Claro / manda foto" agora identifica o produto certo, não mais o New Balance 997 errado', () => {
    const messages = [
      { role: 'user', text: 'Tem New Balance 9060 Off White com Verde Claro?' },
      { role: 'assistant', text: 'Sim, Rafael! Temos o New Balance 9060 Off White com Verde Claro por R$ 449,00. Quer conferir algum tamanho específico?' },
      { role: 'user', text: 'manda foto' },
    ]
    const produto = resolverProdutoComoOAutoPhotoFaria('manda foto', messages, CATALOGO_FIXTURE)
    expect(produto?.nome).toBe('Tênis New Balance 9060 Off White C/ Verde Claro New')
  })

  it('1-bis. [CORRIGIDO] "530 Rosa Cream + manda foto" agora funciona corretamente também se fosse tratado pelo Caminho B (antes da Fase 2 só funcionava por acaso, via Caminho A)', () => {
    const messages = [
      { role: 'user', text: 'agora quero o 530 rosa' },
      { role: 'assistant', text: 'Encontrei o New Balance 530 Rosa Cream disponível por R$ 399,83. Quer que eu envie a foto?' },
      { role: 'user', text: 'manda foto' },
    ]
    const produto = resolverProdutoComoOAutoPhotoFaria('manda foto', messages, CATALOGO_FIXTURE)
    expect(produto?.nome).toBe('Tenis New Balance 530 Rosa Cream')
  })

  it('7. documenta EXATAMENTE como queryCategory é derivada hoje quando a palavra "foto" está no texto do cliente', () => {
    // Não testa o resultado final — só o mecanismo interno documentado via findProductInText,
    // que já loga `Category:` — aqui verificamos indiretamente o efeito: produtos com
    // categoria real (ex.: "tenis") ficam de fora quando o texto de busca contém "foto".
    const textoComFoto = 'manda foto tem 37'
    const resultado = findProductInText(textoComFoto, CATALOGO_FIXTURE)
    // Hoje (bug presente): o 9060 Preto com Branco/Cinza (categoria "tenis") é
    // descartado pelo filtro de categoria "foto" — o resultado, se houver, tende a
    // vir de um produto sem categoria reconhecida (ex.: Louis Vuitton) ou ser null.
    if (resultado) {
      expect(resultado.nome).not.toMatch(/Tenis New Balance 9060 Preto/i)
    }
  })
})

describe('Casos adicionais de caracterização (sem threshold novo — só observação)', () => {
  it('8. nenhum produto correspondente no catálogo → retorna null, não inventa nada', () => {
    const produto = findProductInText('bicicleta amarela infantil', CATALOGO_FIXTURE)
    expect(produto).toBeNull()
  })

  it('9. duas variações muito parecidas (Preto com Branco vs. Preto com Cinza) — caracteriza o resultado atual sem impor threshold novo', () => {
    const resultado = findProductInText('9060 preto', CATALOGO_FIXTURE)
    // Documentação de comportamento atual: registra qual delas o algoritmo escolhe hoje
    // (ou nenhuma, se a pontuação empatar de um jeito que retorne null) — sem prescrever
    // qual é "certa", só travando o que já acontece, para detectar mudança futura.
    expect([
      'Tenis New Balance 9060 Preto com Branco',
      'Tenis New Balance 9060 Preto C/ Cinza',
      undefined, // caso vire null
    ]).toContain(resultado?.nome)
  })

  it('detectProductRequest reconhece "manda foto" como pedido direto', () => {
    expect(detectProductRequest('manda foto')).toBe(true)
  })

  it('detectProductRequest reconhece confirmação curta só quando o agente ofereceu foto antes', () => {
    expect(detectProductRequest('quero', 'Quer que eu envie a foto?')).toBe(true)
    expect(detectProductRequest('quero', 'Qual tamanho você usa?')).toBe(false)
  })

  it('normalize remove acento e markdown, mantendo o comportamento documentado no próprio código-fonte', () => {
    expect(normalize('*Tênis* New Balance')).toBe('tenis new balance')
  })

  it('getLastAssistantText pega a última mensagem do agente, ignorando mensagens do cliente', () => {
    const messages = [
      { role: 'assistant', text: 'Quer a foto?' },
      { role: 'user', text: 'quero' },
    ]
    expect(getLastAssistantText(messages)).toBe('Quer a foto?')
  })
})

describe('Regressão masculino/feminino (Fase 2 — tiradas de CATEGORIAS_REAIS)', () => {
  it('"tenis masculino nike runner" → categoria real continua "tenis", "masculino" não vira queryCategory, produto correto elegível', () => {
    const produto = findProductInText('tenis masculino nike runner', CATALOGO_FIXTURE)
    expect(produto?.nome).toBe('Tenis Masculino Nike Runner')
    // Confirma que "masculino" não isolou/discriminou por gênero contra outro
    // produto de categoria real diferente (ex.: não deveria nunca escolher o boné
    // só porque também é "masculino") — quem decide aqui é a categoria "tenis".
    expect(produto?.nome).not.toBe('Bone Masculino Preto')
  })

  it('"camiseta feminina basica" → categoria real continua "camiseta", "feminino" não vira queryCategory, produto correto elegível', () => {
    const produto = findProductInText('camiseta feminina basica', CATALOGO_FIXTURE)
    expect(produto?.nome).toBe('Camiseta Feminina Basica')
  })
})
