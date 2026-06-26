// Webhook inteligente — Camada de conhecimento
// Processa perguntas do cliente e retorna dados do Supabase
// Integrado com GPT Maker

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY

const sbHeaders = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

// Stop words do português para remover da busca
const STOP_WORDS = new Set([
  'voce', 'você', 'tem', 'temos', 'tenho', 'quero', 'queria', 'queria',
  'preciso', 'precisa', 'busco', 'busca', 'procuro', 'procura', 'vende',
  'vender', 'vende', 'vendido', 'disponivel', 'disponível', 'ter',
  'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas',
  'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas',
  'por', 'para', 'com', 'se', 'me', 'te', 'ele', 'ela', 'eles', 'elas',
  'que', 'e', 'ou', 'mas', 'pra', 'pro', 'ai', 'ai', 'ja', 'já',
  'nao', 'não', 'sim', 'tipo', 'algum', 'alguma', 'vc', 'vcs', 'esse',
  'essa', 'esses', 'essas', 'isso', 'aqui', 'la', 'lá', 'ate', 'até',
  'mais', 'menos', 'muito', 'muita', 'pouco', 'pouca', 'seu', 'sua',
  'meu', 'minha', 'nos', 'agora', 'hoje', 'quando', 'como', 'qual', 'quais'
])

// Normaliza texto para busca
function normalizarBusca(texto) {
  if (!texto) return ''
  return texto
    .toLowerCase()
    .trim()
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[ç]/g, 'c')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Extrai keywords relevantes removendo stop words
function extrairKeywords(texto) {
  const normalizado = normalizarBusca(texto)
  const palavras = normalizado.split(' ').filter(p => p.length > 1 && !STOP_WORDS.has(p))
  return palavras.length > 0 ? palavras.join(' ') : normalizado
}

// Calcula score de similaridade
function calcularSimilaridade(texto1, texto2) {
  const t1 = normalizarBusca(texto1)
  const t2 = normalizarBusca(texto2)

  if (t1 === t2) return 100
  if (t2.includes(t1) || t1.includes(t2)) return 80

  const palavras1 = t1.split(' ')
  const palavras2 = t2.split(' ')
  const comuns = palavras1.filter(p => palavras2.includes(p)).length

  if (comuns > 0) {
    return Math.round((comuns / Math.max(palavras1.length, palavras2.length)) * 70)
  }

  return 0
}

// Busca produtos no Supabase
async function buscarProdutos(pergunta) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/products?select=id,nome,categoria,preco,imagem,link,codigo`,
      { headers: sbHeaders }
    )

    if (!res.ok) return []

    const produtos = await res.json()

    // Extrai keywords da pergunta para melhorar a busca
    const keywords = extrairKeywords(pergunta)
    console.log(`[Webhook] 🔑 Keywords extraídas: "${keywords}" (de: "${pergunta}")`)

    const produtosComScore = produtos
      .map(p => ({
        ...p,
        score: calcularSimilaridade(keywords, p.nome)
      }))
      .filter(p => p.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)

    return produtosComScore
  } catch (err) {
    console.error('[Webhook] Erro ao buscar produtos:', err.message)
    return []
  }
}

// Busca knowledge no Supabase
async function buscarKnowledge(pergunta) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/knowledge?title=eq.knowledge_gabriela_supabase_completo&select=title,content,category`,
      { headers: sbHeaders }
    )

    if (!res.ok) return null

    const knowledge = await res.json()
    if (!knowledge || knowledge.length === 0) return null

    return knowledge[0]
  } catch (err) {
    console.error('[Webhook] Erro ao buscar knowledge:', err.message)
    return null
  }
}

// Função de busca integrada
async function searchKnowledge(pergunta) {
  try {
    if (!pergunta || pergunta.trim().length < 3) {
      return {
        ok: false,
        erro: 'Pergunta muito curta',
        dados: null
      }
    }

    console.log(`[Webhook] 🔍 Buscando: "${pergunta}"`)

    const [produtos, knowledgeBase] = await Promise.all([
      buscarProdutos(pergunta),
      buscarKnowledge(pergunta)
    ])

    console.log(`[Webhook] ✅ Encontrados ${produtos.length} produtos`)

    const resposta = {
      ok: true,
      pergunta,
      timestamp: new Date().toISOString(),
      dados: {
        produtos: produtos.map(p => ({
          id: p.id,
          nome: p.nome,
          categoria: p.categoria,
          preco: p.preco,
          imagem: p.imagem,
          link: p.link,
          codigo: p.codigo,
          score: p.score
        })),
        knowledge: knowledgeBase ? {
          titulo: knowledgeBase.title,
          categoria: knowledgeBase.category,
          conteudo: knowledgeBase.content
        } : null,
        totalResultados: produtos.length
      }
    }

    return resposta
  } catch (err) {
    console.error('[Webhook] 🔴 ERRO em searchKnowledge:', err.message)
    return {
      ok: false,
      erro: err.message,
      dados: null
    }
  }
}

// Validar request
function validarRequest(body) {
  if (!body) return { valido: false, erro: 'Body vazio' }
  if (!body.pergunta) return { valido: false, erro: 'Campo "pergunta" obrigatório' }

  return { valido: true }
}

// Formatar resposta para GPT Maker
function formatarRespostaGPT(dadosBusca) {
  const { produtos, knowledge } = dadosBusca.dados || {}

  let resposta = {
    sucesso: true,
    timestamp: new Date().toISOString(),
    contexto: {
      pergunta: dadosBusca.pergunta,
      produtos_encontrados: produtos?.length || 0,
      tem_produtos: (produtos?.length || 0) > 0,
      tem_base_conhecimento: !!knowledge
    },
    dados: {
      produtos: [],
      informacao_adicional: ''
    }
  }

  // Adicionar produtos encontrados
  if (produtos && produtos.length > 0) {
    resposta.dados.produtos = produtos.map(p => ({
      nome: p.nome,
      categoria: p.categoria,
      preco: p.preco,
      imagem: p.imagem,
      link: p.link,
      disponibilidade: 'SIM',
      relevancia: `${p.score}%`
    }))
  }

  // Adicionar informação da knowledge base
  if (knowledge && knowledge.conteudo) {
    resposta.dados.informacao_adicional = `
Informação da Base de Conhecimento:
${knowledge.conteudo.substring(0, 500)}...
    `.trim()
  }

  return resposta
}

// Handler principal
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' })
  }

  try {
    console.log('[Webhook] 📨 Requisição recebida:', req.body)

    // Extrair pergunta de várias formas possíveis
    let pergunta = req.body?.pergunta ||
                   req.body?.message ||
                   req.body?.text ||
                   req.body?.input ||
                   req.body?.msg ||
                   req.body?.content ||
                   req.body?.query ||
                   req.body?.body ||
                   req.body?.prompt ||
                   null

    // Se ainda não tem, tenta pegar do contexto
    if (!pergunta && req.body?.conversas) {
      const ultima = req.body.conversas[req.body.conversas.length - 1]
      pergunta = ultima?.texto || ultima?.message || null
    }

    // Se ainda não tem, tenta pegar de qualquer chave que parece ser texto longo
    if (!pergunta) {
      for (const [chave, valor] of Object.entries(req.body || {})) {
        if (typeof valor === 'string' && valor.length > 3 && valor.length < 500) {
          pergunta = valor
          break
        }
      }
    }

    // Validar que temos uma pergunta
    if (!pergunta || pergunta.trim().length < 3) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Não consegui encontrar a pergunta no payload',
        debug: {
          body_recebido: req.body,
          chaves_disponiveis: Object.keys(req.body || {})
        }
      })
    }

    console.log(`[Webhook] 🔍 Pergunta extraída: "${pergunta}"`)

    const cliente_id = req.body?.cliente_id || 'desconhecido'
    const tipo_busca = req.body?.tipo_busca || 'auto'

    console.log(`[Webhook] 🔍 Buscando: "${pergunta}"`)

    // Executar busca
    const resultado = await searchKnowledge(pergunta)

    if (!resultado.ok) {
      return res.status(400).json({
        sucesso: false,
        erro: resultado.erro
      })
    }

    // Formatar para GPT Maker
    const respostaGPT = formatarRespostaGPT(resultado)

    console.log(`[Webhook] ✅ Encontrados ${respostaGPT.contexto.produtos_encontrados} produtos`)

    return res.status(200).json(respostaGPT)

  } catch (err) {
    console.error('[Webhook] 🔴 ERRO:', err.message)
    return res.status(500).json({
      sucesso: false,
      erro: err.message
    })
  }
}
