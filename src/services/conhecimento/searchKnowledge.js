// Busca inteligente em conhecimento (Supabase)
// Consulta knowledge + catálogo para responder perguntas

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY

const sbHeaders = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

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
    .replace(/\s+/g, ' ')
}

// Calcula score de similaridade simples
function calcularSimilaridade(texto1, texto2) {
  const t1 = normalizarBusca(texto1)
  const t2 = normalizarBusca(texto2)

  // Busca exata
  if (t1 === t2) return 100

  // Se contém
  if (t2.includes(t1) || t1.includes(t2)) return 80

  // Score por palavras comuns
  const palavras1 = t1.split(' ')
  const palavras2 = t2.split(' ')
  const comuns = palavras1.filter(p => palavras2.includes(p)).length

  if (comuns > 0) {
    return Math.round((comuns / Math.max(palavras1.length, palavras2.length)) * 70)
  }

  return 0
}

// Busca produtos relevantes no catálogo
async function buscarProdutos(pergunta) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/products?select=id,nome,categoria,preco,imagem,link,codigo`,
      { headers: sbHeaders }
    )

    if (!res.ok) return []

    const produtos = await res.json()

    // Calcular score para cada produto
    const produtosComScore = produtos
      .map(p => ({
        ...p,
        score: calcularSimilaridade(pergunta, p.nome)
      }))
      .filter(p => p.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5) // Top 5 resultados

    return produtosComScore
  } catch (err) {
    console.error('[SearchKnowledge] Erro ao buscar produtos:', err.message)
    return []
  }
}

// Busca em knowledge (base de conhecimento)
async function buscarKnowledge(pergunta) {
  try {
    // Buscar o documento knowledge_gabriela_supabase_completo
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/knowledge?title=eq.knowledge_gabriela_supabase_completo&select=title,content,category`,
      { headers: sbHeaders }
    )

    if (!res.ok) return null

    const knowledge = await res.json()

    if (!knowledge || knowledge.length === 0) {
      return null
    }

    return knowledge[0]
  } catch (err) {
    console.error('[SearchKnowledge] Erro ao buscar knowledge:', err.message)
    return null
  }
}

// Função principal: Busca inteligente
export async function searchKnowledge(pergunta) {
  try {
    if (!pergunta || pergunta.trim().length < 3) {
      return {
        ok: false,
        erro: 'Pergunta muito curta',
        dados: null
      }
    }

    console.log(`[SearchKnowledge] 🔍 Buscando: "${pergunta}"`)

    // Buscar em paralelo
    const [produtos, knowledgeBase] = await Promise.all([
      buscarProdutos(pergunta),
      buscarKnowledge(pergunta)
    ])

    console.log(`[SearchKnowledge] ✅ Encontrados ${produtos.length} produtos`)

    // Formatar resposta
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
    console.error('[SearchKnowledge] 🔴 ERRO:', err.message)
    return {
      ok: false,
      erro: err.message,
      dados: null
    }
  }
}

// Função para buscar produto específico por nome
export async function buscarProdutoEspecifico(nomeProduto) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/products?nome=like.*${nomeProduto}*&select=*`,
      { headers: sbHeaders }
    )

    if (!res.ok) return null

    const produtos = await res.json()

    if (produtos.length === 0) return null

    // Retornar melhor match
    const melhorMatch = produtos.reduce((prev, curr) => {
      const scoreAtual = calcularSimilaridade(nomeProduto, curr.nome)
      const scoreAnterior = calcularSimilaridade(nomeProduto, prev.nome)
      return scoreAtual > scoreAnterior ? curr : prev
    })

    return {
      ...melhorMatch,
      score: calcularSimilaridade(nomeProduto, melhorMatch.nome)
    }
  } catch (err) {
    console.error('[SearchKnowledge] Erro ao buscar produto específico:', err.message)
    return null
  }
}

// Função para estatísticas de busca
export async function obterEstatisticasKnowledge() {
  try {
    const [resProducts, resKnowledge] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/products?select=count`, { headers: sbHeaders }),
      fetch(`${SUPABASE_URL}/rest/v1/knowledge?select=count`, { headers: sbHeaders })
    ])

    const countProducts = resProducts.ok ? await resProducts.json() : []
    const countKnowledge = resKnowledge.ok ? await resKnowledge.json() : []

    return {
      ok: true,
      produtos_total: countProducts[0]?.count || 0,
      documentos_knowledge: countKnowledge[0]?.count || 0,
      timestamp: new Date().toISOString()
    }
  } catch (err) {
    console.error('[SearchKnowledge] Erro ao obter estatísticas:', err.message)
    return {
      ok: false,
      erro: err.message
    }
  }
}
