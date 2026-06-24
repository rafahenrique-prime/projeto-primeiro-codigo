// Gerador de Knowledge Base com proteção contra duplicatas
// Sincroniza Supabase → MD estruturado → Tabela knowledge

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY

const sbHeaders = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

// Normaliza nome para evitar duplicatas (case, espaços, acentos)
function normalizarNome(nome) {
  if (!nome) return ''
  return nome
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')  // Remove espaços extras
    .normalize('NFD')       // Remove acentos
    .replace(/[̀-ͯ]/g, '')   // Remove diacríticos
}

// Remove duplicatas usando Set de nomes normalizados
function removeDuplicatas(produtos) {
  const seen = new Set()
  const unique = []
  const duplicatas = []

  produtos.forEach(p => {
    const key = normalizarNome(p.nome)

    if (seen.has(key)) {
      console.warn(`[Knowledge] ⏭️  Duplicata removida: "${p.nome}"`)
      duplicatas.push(p.nome)
    } else {
      seen.add(key)
      unique.push(p)
    }
  })

  return { unique, duplicatas, totalRemovidas: duplicatas.length }
}

// Agrupa produtos por categoria
function agruparPorCategoria(produtos) {
  const grouped = {}

  produtos.forEach(p => {
    const cat = (p.categoria || 'OUTROS').trim() || 'OUTROS'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(p)
  })

  return grouped
}

// Formata produtos em Markdown estruturado
function formatarMD(produtos) {
  const grouped = agruparPorCategoria(produtos)
  const agora = new Date().toLocaleString('pt-BR')

  let md = `# Base de Conhecimento — Prime Store (Auto-Sincronizado)\n\n`
  md += `> Sincronizado em ${agora}\n`
  md += `> Total: ${produtos.length} produtos\n`
  md += `> Categorias: ${Object.keys(grouped).length}\n\n`

  Object.keys(grouped).sort().forEach(categoria => {
    md += `## ${categoria}\n\n`

    grouped[categoria].forEach(p => {
      const nome = (p.nome || 'Sem Nome').toUpperCase()
      const preco = p.preco || 'Consultar'
      const imagem = p.imagem || 'Sem imagem'
      const link = p.link || '#'

      md += `### ${nome}\n`
      md += `**Categoria:** ${categoria}\n`
      md += `**Produto:** ${p.nome || 'N/A'}\n`
      md += `**Preço:** ${preco}\n`
      md += `**Imagem:** ${imagem}\n`
      md += `**Link:** ${link}\n`
      md += `**Disponível:** Sim\n`
      md += `**Código:** ${p.codigo || 'N/A'}\n\n`
    })
  })

  return md
}

// FUNÇÃO PRINCIPAL: Regenera Knowledge sem duplicatas
export async function regenerateKnowledgeUnico() {
  try {
    console.log('[KnowledgeGenerator] 🔄 Iniciando regeneração...')

    // 1. Query todos os produtos do Supabase
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/products?select=*`,
      { headers: sbHeaders }
    )

    if (!res.ok) {
      throw new Error(`Supabase error: ${res.status}`)
    }

    const allProducts = await res.json()
    console.log(`[KnowledgeGenerator] ✅ ${allProducts.length} produtos carregados`)

    if (!Array.isArray(allProducts) || allProducts.length === 0) {
      throw new Error('Nenhum produto encontrado no Supabase')
    }

    // 2. Remover duplicatas
    const { unique, duplicatas, totalRemovidas } = removeDuplicatas(allProducts)

    if (totalRemovidas > 0) {
      console.log(`[KnowledgeGenerator] ⚠️  ${totalRemovidas} duplicatas removidas:`, duplicatas)
    }

    // 3. Gerar Markdown
    const mdContent = formatarMD(unique)
    console.log(`[KnowledgeGenerator] 📝 Markdown gerado (${mdContent.length} caracteres)`)

    // 4. Salvar em Supabase knowledge (upsert)
    const knowledgeData = {
      title: 'knowledge_gabriela_supabase_completo',
      content: mdContent,
      category: 'PRODUTOS',
      source: 'MARKDOWN',
    }

    const upsertRes = await fetch(
      `${SUPABASE_URL}/rest/v1/knowledge?title=eq.knowledge_gabriela_supabase_completo`,
      {
        method: 'PATCH',
        headers: sbHeaders,
        body: JSON.stringify(knowledgeData),
      }
    )

    if (!upsertRes.ok) {
      // Se update não achou, tenta insert
      const insertRes = await fetch(
        `${SUPABASE_URL}/rest/v1/knowledge`,
        {
          method: 'POST',
          headers: sbHeaders,
          body: JSON.stringify(knowledgeData),
        }
      )

      if (!insertRes.ok) {
        throw new Error(`Knowledge error: ${insertRes.status}`)
      }
    }

    console.log('[KnowledgeGenerator] ✅ Knowledge Base sincronizado com sucesso!')

    return {
      ok: true,
      status: 'sucesso',
      totalProdutos: unique.length,
      duplicatasRemovidas: totalRemovidas,
      timestamp: new Date(),
      mensagem: `Knowledge Base atualizado: ${unique.length} produtos (${totalRemovidas} duplicatas removidas)`,
    }
  } catch (err) {
    console.error('[KnowledgeGenerator] 🔴 ERRO:', err.message)
    return {
      ok: false,
      status: 'erro',
      erro: err.message,
      timestamp: new Date(),
    }
  }
}

// Validação: checa se produto já existe (antes de inserir)
export async function validarProdutoUnico(nome) {
  try {
    if (!nome || nome.trim().length < 3) {
      return { existe: false, mensagem: 'Nome muito curto' }
    }

    const nomeLimpo = normalizarNome(nome)

    // Query: busca produto com nome normalizado similar
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/products?select=id,nome`,
      { headers: sbHeaders }
    )

    if (!res.ok) return { existe: false }

    const produtos = await res.json()
    const encontrado = produtos.find(p => normalizarNome(p.nome) === nomeLimpo)

    if (encontrado) {
      console.warn(`[Knowledge] ⚠️  Produto já existe: "${encontrado.nome}"`)
      return {
        existe: true,
        produtoExistente: encontrado.nome,
        mensagem: `Produto "${encontrado.nome}" já existe no catálogo`,
      }
    }

    return { existe: false, mensagem: 'Produto único (OK)' }
  } catch (err) {
    console.error('[Knowledge] Erro ao validar:', err.message)
    return { existe: false, erro: err.message }
  }
}

// Export também a função de normalização para uso externo
export { normalizarNome }
