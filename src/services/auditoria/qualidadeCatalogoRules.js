// src/services/auditoria/qualidadeCatalogoRules.js
//
// Motor PURO de auditoria de qualidade do Catálogo V2/Shadow. Nunca faz I/O
// (rede, Supabase, Bagy) — recebe dados já carregados (shadow_products +
// shadow_product_variations) e devolve achados. Nunca decide ativo/inativo
// (isso é `shadow-reconcile.mjs`) e nunca atualiza conteúdo (isso é
// `shadow-refresh.mjs`) — só lê e classifica.
//
// Cada achado é sempre um de três níveis, nunca misturados:
//   FATO     — campo vazio/nulo ou comparação numérica direta, zero inferência.
//   ALERTA   — evidência forte mas inferida por regra determinística sobre
//              texto conhecido (nunca afirma "está errado", sempre "confira").
//   SUGESTAO — heurística fraca (nomes muito parecidos), sempre com guarda-corpo
//              forte contra falso positivo (variantes legítimas de cor/modelo
//              NUNCA devem ser sinalizadas).
//
// Ver plano modo-planejar-merry-kite.md, PARTE 55, para o desenho completo.

// --- Marcas conhecidas para a heurística de ALERTA "marca citada no nome" ---
// Lista deliberadamente ampla mas finita — um nome sem nenhuma marca desta
// lista simplesmente não gera o alerta C (não é o mesmo que "sem problema",
// é "sem evidência suficiente para opinar").
const MARCAS_CONHECIDAS = [
  'Louis Vuitton', 'Gucci', 'Armani', 'Balenciaga', 'Boss', 'Hugo Boss', 'Fendi', 'Burberry',
  'Dior', 'Philipp Plein', 'Diesel', 'Tommy Hilfiger', 'Calvin Klein', 'Nike', 'Adidas',
  'New Balance', 'Off White', 'Prada', 'Versace', 'Chanel', 'Rolex', 'Cartier', 'Miu Miu',
  'Lupo', 'Vans', 'Mizuno', 'Alo', 'Ellus', 'Yves Saint Laurent', 'Paco Rabanne',
  'Elizabeth Arden', 'Al Wataniah',
]

// --- Termos de categoria claramente incompatíveis, por tipo de produto -----
// Guarda-corpo: só dispara quando o NOME cita um tipo de produto reconhecível
// E a categoria contém um termo de outro tipo claramente diferente. Nunca
// dispara por ausência de match — ausência de evidência não é achado.
const TIPO_PRODUTO_POR_PALAVRA_NOME = [
  { regex: /\bbon[eé]\b/i, tipo: 'boné' },
  { regex: /\bgorro\b/i, tipo: 'boné' },
  { regex: /\btenis\b|\btênis\b/i, tipo: 'calçado' },
  { regex: /\bchinelo\b|\bsapato\b|\bsandalia\b|\bsandália\b|\bpapete\b/i, tipo: 'calçado' },
  { regex: /\bbermuda(s)?\b/i, tipo: 'bermuda' },
  { regex: /\bcalça(s)?\b|\bcalca(s)?\b/i, tipo: 'calça' },
  { regex: /\bcamisa\b/i, tipo: 'camisa' },
  { regex: /\bcamiseta\b/i, tipo: 'camiseta' },
]

const CATEGORIA_INCOMPATIVEL_POR_TIPO = {
  boné: ['bermuda', 'calça', 'calca', 'camisa', 'tenis', 'tênis'],
  calçado: ['bermuda', 'calça', 'calca', 'bone', 'boné', 'camisa'],
  bermuda: ['bone', 'boné', 'tenis', 'tênis', 'camisa'],
  calça: ['bone', 'boné', 'tenis', 'tênis', 'camisa'],
}

// --- Padrões fortes de nome/link de teste -----------------------------------
const PADRAO_TESTE = /\bteste\b|\banuncio teste\b|\bteste oficial\b/i

// --- Palavras que indicam variante legítima (cor/atributo) — nunca vira -----
// quase-duplicidade quando é a única diferença entre 2 nomes.
const PALAVRAS_VARIANTE_LEGITIMA = new Set([
  'branco', 'branca', 'preto', 'preta', 'azul', 'vermelho', 'vermelha', 'verde',
  'rosa', 'amarelo', 'amarela', 'cinza', 'dourado', 'dourada', 'prata', 'marrom',
  'bege', 'roxo', 'roxa', 'laranja', 'model', 'modelo', 'cor', 'tamanho',
  'claro', 'clara', 'escuro', 'escura', 'creme', 'cream', 'musgo', 'veludo',
])

const DOMINIO_ESPERADO = 'primestoremen.com.br'

function isBlank(v) {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
}

function norm(s) {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function normSemEspaco(s) {
  return (s || '').toLowerCase().replace(/\s+/g, '')
}

function achado({ tipo, classe, severidade, mensagem, encontrado, esperadoSugerido = null, porQue, oQueConferir }) {
  return { tipo, classe, severidade, mensagem, encontrado, esperado_sugerido: esperadoSugerido, porQue, oQueConferir }
}

// --- FATOS -------------------------------------------------------------------

function avaliarFatos(produto, variacoes) {
  const achados = []

  if (isBlank(produto.marca)) {
    achados.push(achado({
      tipo: 'marca_ausente',
      classe: 'FATO',
      severidade: 'REVISAR',
      mensagem: 'Marca ausente',
      encontrado: 'campo marca vazio',
      porQue: 'O produto não tem marca cadastrada.',
      oQueConferir: 'Verifique se o produto tem marca na Bagy e se ela está preenchida.',
    }))
  }

  if (isBlank(produto.categoria_nome)) {
    achados.push(achado({
      tipo: 'categoria_ausente',
      classe: 'FATO',
      severidade: 'REVISAR',
      mensagem: 'Categoria ausente',
      encontrado: 'campo categoria vazio',
      porQue: 'O produto não tem categoria cadastrada.',
      oQueConferir: 'Verifique a categoria principal do produto na Bagy.',
    }))
  }

  if (produto.preco === null || produto.preco === undefined || Number(produto.preco) <= 0) {
    achados.push(achado({
      tipo: 'preco_ausente_ou_invalido',
      classe: 'FATO',
      severidade: 'REVISAR',
      mensagem: 'Preço ausente ou inválido',
      encontrado: `preco = ${produto.preco ?? 'null'}`,
      porQue: 'O preço está ausente ou zerado/negativo — a Gabi não teria um valor real para informar.',
      oQueConferir: 'Verifique o preço de venda do produto na Bagy.',
    }))
  }

  if (isBlank(produto.preco_pix) && produto.preco_pix !== 0) {
    achados.push(achado({
      tipo: 'pix_ausente',
      classe: 'FATO',
      severidade: 'REVISAR',
      mensagem: 'PIX ausente',
      encontrado: 'campo preco_pix vazio',
      porQue: 'O produto não tem valor de PIX cadastrado.',
      oQueConferir: 'Verifique a condição de PIX do produto na Bagy.',
    }))
  } else if (produto.preco != null && produto.preco_pix != null && Number(produto.preco_pix) > Number(produto.preco)) {
    achados.push(achado({
      tipo: 'pix_maior_que_preco',
      classe: 'FATO',
      severidade: 'REVISAR',
      mensagem: 'PIX maior que o preço',
      encontrado: `preco_pix (${produto.preco_pix}) > preco (${produto.preco})`,
      porQue: 'PIX deveria ser igual ou menor que o preço de venda, nunca maior.',
      oQueConferir: 'Verifique os valores de preço e PIX do produto na Bagy.',
    }))
  }

  if (isBlank(produto.link)) {
    achados.push(achado({
      tipo: 'link_ausente',
      classe: 'FATO',
      severidade: 'IMPORTANTE',
      mensagem: 'Link ausente',
      encontrado: 'campo link vazio',
      porQue: 'A Gabi não teria como enviar o link do produto ao cliente.',
      oQueConferir: 'Verifique o link do produto.',
    }))
  } else if (!produto.link.includes(DOMINIO_ESPERADO)) {
    achados.push(achado({
      tipo: 'link_dominio_invalido',
      classe: 'FATO',
      severidade: 'IMPORTANTE',
      mensagem: 'Link com domínio inesperado',
      encontrado: produto.link,
      porQue: `O link não aponta para o domínio esperado (${DOMINIO_ESPERADO}).`,
      oQueConferir: 'Verifique se o link do produto está correto.',
    }))
  }

  if (isBlank(produto.imagem_principal)) {
    achados.push(achado({
      tipo: 'imagem_ausente',
      classe: 'FATO',
      severidade: 'REVISAR',
      mensagem: 'Imagem ausente',
      encontrado: 'campo imagem_principal vazio',
      porQue: 'O produto não tem imagem principal cadastrada.',
      oQueConferir: 'Verifique se o produto tem foto cadastrada na Bagy.',
    }))
  } else if (!/^https?:\/\//i.test(produto.imagem_principal)) {
    achados.push(achado({
      tipo: 'imagem_invalida',
      classe: 'FATO',
      severidade: 'REVISAR',
      mensagem: 'Imagem com URL inválida',
      encontrado: produto.imagem_principal,
      porQue: 'O valor cadastrado não parece uma URL de imagem válida.',
      oQueConferir: 'Verifique a imagem principal do produto na Bagy.',
    }))
  }

  if (!Array.isArray(variacoes) || variacoes.length === 0) {
    achados.push(achado({
      tipo: 'sem_variacoes',
      classe: 'FATO',
      severidade: 'REVISAR',
      mensagem: 'Produto sem variações',
      encontrado: '0 variações',
      porQue: 'O produto não tem nenhuma variação (tamanho/cor) cadastrada.',
      oQueConferir: 'Verifique se o produto tem variações reais na Bagy.',
    }))
  }

  return achados
}

// nome duplicado exato — precisa do contexto do catálogo inteiro (não é por
// produto isolado), calculado à parte em avaliarCatalogo.
function achadoNomeDuplicado(produto, outros) {
  return achado({
    tipo: 'nome_duplicado_exato',
    classe: 'FATO',
    severidade: 'IMPORTANTE',
    mensagem: 'Nome duplicado exato',
    encontrado: `mesmo nome de ${outros.length} outro(s) produto(s) ativo(s): ${outros.map((p) => p.bagy_product_id).join(', ')}`,
    porQue: 'Dois ou mais produtos ativos têm exatamente o mesmo nome — pode confundir o ranker e o cliente.',
    oQueConferir: 'Verifique se são produtos realmente diferentes; se forem, considere diferenciar o nome na Bagy.',
  })
}

// --- ALERTAS -------------------------------------------------------------------

function encontrarMarcasNoNome(nome) {
  const nomeL = (nome || '').toLowerCase()
  return MARCAS_CONHECIDAS.filter((m) => nomeL.includes(m.toLowerCase()))
}

function avaliarAlertas(produto) {
  const achados = []
  const nome = produto.nome || ''

  // C) marca citada no nome ≠ campo marca
  if (!isBlank(produto.marca)) {
    const marcasCitadas = encontrarMarcasNoNome(nome)
    if (marcasCitadas.length > 0) {
      const bate = marcasCitadas.some(
        (m) => normSemEspaco(m).includes(normSemEspaco(produto.marca)) || normSemEspaco(produto.marca).includes(normSemEspaco(m))
      )
      if (!bate) {
        achados.push(achado({
          tipo: 'marca_incompativel',
          classe: 'ALERTA',
          severidade: 'CRITICO',
          mensagem: 'Marca do campo não bate com a marca citada no nome',
          encontrado: `marca = "${produto.marca}"`,
          esperadoSugerido: marcasCitadas.join(' ou '),
          porQue: `O nome do produto cita "${marcasCitadas.join('/')}", mas o campo marca é "${produto.marca}" — pode fazer a Gabi informar a marca errada ao cliente.`,
          oQueConferir: 'Confira a marca correta do produto na Bagy — isto é uma sugestão para conferência, não uma correção automática.',
        }))
      }
    }
  }

  // E) categoria incompatível com tipo citado no nome
  if (!isBlank(produto.categoria_nome)) {
    const tipoEncontrado = TIPO_PRODUTO_POR_PALAVRA_NOME.find((t) => t.regex.test(nome))
    if (tipoEncontrado) {
      const termosRuins = CATEGORIA_INCOMPATIVEL_POR_TIPO[tipoEncontrado.tipo] || []
      const catL = produto.categoria_nome.toLowerCase()
      const termoRuim = termosRuins.find((t) => catL.includes(t))
      if (termoRuim) {
        achados.push(achado({
          tipo: 'categoria_incompativel',
          classe: 'ALERTA',
          severidade: 'CRITICO',
          mensagem: 'Categoria incompatível com o tipo de produto citado no nome',
          encontrado: `categoria = "${produto.categoria_nome}"`,
          porQue: `O nome indica um produto do tipo "${tipoEncontrado.tipo}", mas a categoria cadastrada é "${produto.categoria_nome}".`,
          oQueConferir: 'Verifique a categoria principal do produto na Bagy — isto é uma sugestão para conferência, não uma correção automática.',
        }))
      }
    }
  }

  // H) padrão forte de teste no nome/link
  if (PADRAO_TESTE.test(nome) || (produto.link && PADRAO_TESTE.test(produto.link))) {
    achados.push(achado({
      tipo: 'suspeito_de_teste',
      classe: 'ALERTA',
      severidade: 'IMPORTANTE',
      mensagem: 'Produto com padrão de nome/link de teste',
      encontrado: nome,
      porQue: 'O nome ou link contém um padrão típico de anúncio de teste ("teste", "anuncio teste", etc.).',
      oQueConferir: 'Confirme se este produto é real ou se foi esquecido ativo depois de um teste na Bagy.',
    }))
  }

  return achados
}

// --- SUGESTÃO — quase-duplicidade, com guarda-corpo forte -------------------

function ehVarianteLegitima(nome1, nome2) {
  const tokens1 = norm(nome1).split(' ')
  const tokens2 = norm(nome2).split(' ')
  const set1 = new Set(tokens1)
  const set2 = new Set(tokens2)
  const diferentes = [...set1].filter((t) => !set2.has(t)).concat([...set2].filter((t) => !set1.has(t)))
  return diferentes.some((t) => PALAVRAS_VARIANTE_LEGITIMA.has(t))
}

// Diferença mínima aceitável: só 1 token diferente, e esse token é sufixo
// numérico (ex. "002") OU é a mesma palavra com/sem "s" final (singular/plural).
function ehQuaseDuplicataRelevante(nome1, nome2) {
  const n1 = norm(nome1)
  const n2 = norm(nome2)
  if (n1 === n2) return false // isso é duplicata EXATA (classe F), não quase
  if (ehVarianteLegitima(n1, n2)) return false // guarda-corpo: nunca sinaliza variante de cor/modelo

  const t1 = n1.split(' ')
  const t2 = n2.split(' ')
  if (Math.abs(t1.length - t2.length) > 1) return false

  // Caso A: mesmo texto, um deles com sufixo numérico EXTRA no final (ex.
  // "Anuncio Teste 00002" x "Anuncio Teste") — só é tolerância legítima
  // quando as quantidades de tokens são DIFERENTES (só 1 lado tem o token
  // extra). Quando os dois nomes já têm a mesma quantidade de tokens e os
  // dois terminam em número (ex. "Cueca Lup 009" x "Cueca Lup 007"), o
  // número não é ruído a ignorar — é o código que diferencia os produtos.
  // Tirar o sufixo dos dois nesse caso geraria falso positivo (confirmado
  // em 29 pares reais na calibração desta frente).
  if (t1.length !== t2.length) {
    const semSufixoNumerico = (tokens) => {
      const ultimo = tokens[tokens.length - 1]
      return /^\d+$/.test(ultimo) ? tokens.slice(0, -1) : tokens
    }
    const base1 = semSufixoNumerico(t1).join(' ')
    const base2 = semSufixoNumerico(t2).join(' ')
    if (base1 === n2 || base2 === n1) return true
  }

  // Caso B: única diferença é 1 palavra que só difere por "s" final (singular/plural)
  if (t1.length === t2.length) {
    let diffs = 0
    let singularPlural = true
    for (let i = 0; i < t1.length; i++) {
      if (t1[i] !== t2[i]) {
        diffs++
        const a = t1[i], b = t2[i]
        const mesmoRadical = a === b + 's' || b === a + 's'
        if (!mesmoRadical) singularPlural = false
      }
    }
    if (diffs === 1 && singularPlural) return true
  }

  return false
}

function achadoQuaseDuplicado(produto, outro) {
  return achado({
    tipo: 'quase_duplicado',
    classe: 'SUGESTAO',
    severidade: 'IMPORTANTE',
    mensagem: 'Nome muito parecido com outro produto ativo',
    encontrado: `"${produto.nome}" muito parecido com "${outro.nome}" (bagy_product_id ${outro.bagy_product_id})`,
    porQue: 'Os nomes diferem só por um detalhe mínimo (singular/plural ou sufixo numérico) — pode ser o mesmo produto cadastrado 2x, ou pode ser uma variante legítima não identificada por esta heurística. Revisar com atenção antes de mexer.',
    oQueConferir: 'Confirme na Bagy se são realmente 2 produtos diferentes.',
  })
}

// --- Orquestração: 1 produto -------------------------------------------------
export function avaliarProduto(produto, variacoes, contexto = {}) {
  const achados = [
    ...avaliarFatos(produto, variacoes),
    ...avaliarAlertas(produto),
  ]

  if (contexto.duplicadosExatos && contexto.duplicadosExatos.has(produto.id)) {
    achados.push(achadoNomeDuplicado(produto, contexto.duplicadosExatos.get(produto.id)))
  }

  if (contexto.quaseDuplicados && contexto.quaseDuplicados.has(produto.id)) {
    for (const outro of contexto.quaseDuplicados.get(produto.id)) {
      achados.push(achadoQuaseDuplicado(produto, outro))
    }
  }

  return achados
}

// --- Orquestração: catálogo inteiro (só produtos ativo=true) ---------------
// `produtos` e `variationsByProductId` já vêm carregados (nenhum I/O aqui).
export function avaliarCatalogo(produtos, variationsByProductId) {
  const ativos = produtos.filter((p) => p.ativo !== false)

  // pré-computa duplicatas exatas e quase-duplicatas no catálogo ativo inteiro
  const porNomeNormalizado = new Map()
  for (const p of ativos) {
    const n = norm(p.nome)
    if (!porNomeNormalizado.has(n)) porNomeNormalizado.set(n, [])
    porNomeNormalizado.get(n).push(p)
  }
  const duplicadosExatos = new Map()
  for (const grupo of porNomeNormalizado.values()) {
    if (grupo.length > 1) {
      for (const p of grupo) {
        duplicadosExatos.set(p.id, grupo.filter((x) => x.id !== p.id))
      }
    }
  }

  const quaseDuplicados = new Map()
  for (let i = 0; i < ativos.length; i++) {
    for (let j = i + 1; j < ativos.length; j++) {
      const a = ativos[i]
      const b = ativos[j]
      if (ehQuaseDuplicataRelevante(a.nome, b.nome)) {
        if (!quaseDuplicados.has(a.id)) quaseDuplicados.set(a.id, [])
        if (!quaseDuplicados.has(b.id)) quaseDuplicados.set(b.id, [])
        quaseDuplicados.get(a.id).push(b)
        quaseDuplicados.get(b.id).push(a)
      }
    }
  }

  const contexto = { duplicadosExatos, quaseDuplicados }

  const resultados = ativos.map((p) => ({
    produto: p,
    achados: avaliarProduto(p, variationsByProductId.get(p.id) || [], contexto),
  }))

  return {
    totalAtivosAnalisados: ativos.length,
    comAchados: resultados.filter((r) => r.achados.length > 0).length,
    semAchados: resultados.filter((r) => r.achados.length === 0).length,
    resultados,
  }
}
