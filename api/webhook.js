// Webhook inteligente — Camada de conhecimento
// Processa perguntas do cliente e retorna dados do Supabase
// Integrado com GPT Maker

import { searchKnowledge, buscarProdutoEspecifico } from '../src/services/searchKnowledge.js'

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
      tem_conhecimento: !!knowledge
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

    // Validar request
    const validacao = validarRequest(req.body)
    if (!validacao.valido) {
      return res.status(400).json({
        sucesso: false,
        erro: validacao.erro
      })
    }

    const { pergunta, cliente_id, tipo_busca } = req.body

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
