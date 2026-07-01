// Webhook para GPT Maker — Consultar base de conhecimento
// Gabriela chama este endpoint antes de responder ao cliente
// O retorno é injetado como contexto na resposta dela
// Busca híbrida: keyword (grátis) + semântica via Cohere (fallback quando keyword retorna 0)

import fs from 'fs'
import path from 'path'
import os from 'os'
import { logCodexAlert } from './_codexAlerts.js'
import { updateCustomerScore } from './_customerScoring.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY
const COHERE_API_KEY = process.env.COHERE_API_KEY
const GPTMAKER_TOKEN = process.env.VITE_GPTMAKER_TOKEN
const GPT_BASE = 'https://api.gptmaker.ai'

// Busca o histórico recente do chat e combina com a mensagem atual.
// Resolve o caso "cliente pede chinelo, 3 turnos depois responde só 'qualquer
// preço'" — sozinha essa mensagem não tem nenhuma keyword de produto.
async function buildSearchQuery(currentMessage, chatId) {
  if (!chatId || !GPTMAKER_TOKEN) return currentMessage
  try {
    const res = await fetch(`${GPT_BASE}/v2/chat/${chatId}/messages`, {
      headers: { 'Authorization': `Bearer ${GPTMAKER_TOKEN}` },
    })
    if (!res.ok) return currentMessage
    const msgs = await res.json()
    const recentClientMsgs = msgs
      .filter(m => m.role === 'user' || m.role === 'client')
      .slice(-4)
      .map(m => m.text || m.content || '')
      .filter(Boolean)
    if (recentClientMsgs.length === 0) return currentMessage
    return recentClientMsgs.join(' ')
  } catch {
    return currentMessage
  }
}

// Função para logar requisições — usa /tmp porque o resto do filesystem
// é read-only no Vercel (EROFS). Nunca deixa o log derrubar o webhook.
function logRequest(data) {
  try {
    const timestamp = new Date().toISOString()
    const logEntry = `\n[${timestamp}]\n${JSON.stringify(data, null, 2)}\n${'='.repeat(80)}\n`
    const logPath = path.join(os.tmpdir(), 'knowledge-requests.log')
    fs.appendFileSync(logPath, logEntry, 'utf8')
  } catch (err) {
    console.error('[knowledge] logRequest falhou (ignorado):', err.message)
  }
}


const SB_HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
}

async function generateQueryEmbedding(text) {
  if (!COHERE_API_KEY) return null
  try {
    const res = await fetch('https://api.cohere.com/v2/embed', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${COHERE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        texts: [text],
        model: 'embed-multilingual-v3.0',
        input_type: 'search_query',
        embedding_types: ['float'],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.embeddings?.float?.[0] || null
  } catch {
    return null
  }
}

async function searchKnowledgeSemantic(embedding) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_knowledge`, {
    method: 'POST',
    headers: { ...SB_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query_embedding: embedding, match_threshold: 0.55, match_count: 5 }),
  })
  if (!res.ok) return []
  return res.json()
}

const STOPWORDS_PT = new Set([
  'qual', 'quais', 'como', 'para', 'pra', 'tem', 'vai', 'com', 'uma', 'umas', 'uns',
  'que', 'sao', 'são', 'ser', 'esta', 'está', 'isso', 'aqui', 'voce', 'você', 'voces',
  'vocês', 'ele', 'ela', 'eles', 'elas', 'meu', 'minha', 'seu', 'sua', 'mais', 'menos',
  'muito', 'pelo', 'pela', 'mas', 'mesmo', 'ainda', 'todo', 'toda', 'todos', 'todas',
  'esse', 'essa', 'esses', 'essas', 'este', 'esta', 'estes', 'estas', 'sobre', 'onde',
  'quando', 'quem', 'porque', 'porquê', 'então', 'entao', 'assim', 'também', 'tambem',
])

async function searchKnowledge(message, conversationId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/knowledge?order=created_at.desc`, {
    headers: SB_HEADERS,
  })
  if (!res.ok) throw new Error(`Supabase erro: ${res.status}`)
  const entries = await res.json()

  if (!message || message.trim().length < 2) {
    return entries.slice(0, 5)
  }

  // Busca por keyword (grátis, sempre roda) — ignora stopwords pra não "achar" tudo com palavra comum
  const words = message.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !STOPWORDS_PT.has(w))
  const scored = words.length > 0
    ? entries.map(entry => {
        const score = words.reduce((acc, w) => {
          const titleHits = ((entry.title || '').toLowerCase().match(new RegExp(w, 'g')) || []).length * 3
          const contentHits = ((entry.content || '').toLowerCase().match(new RegExp(w, 'g')) || []).length
          return acc + titleHits + contentHits
        }, 0)
        return { ...entry, score }
      }).filter(e => e.score > 0).sort((a, b) => b.score - a.score)
    : []

  // Se keyword achou resultados, usa eles
  if (scored.length >= 2) {
    console.log(`[knowledge] keyword: ${scored.length} resultado(s)`)
    return scored.slice(0, 5)
  }

  // Fallback semântico via Cohere — só chama quando keyword falha
  console.log(`[knowledge] keyword sem resultado, tentando busca semântica...`)
  const embedding = await generateQueryEmbedding(message)
  if (embedding) {
    const semantic = await searchKnowledgeSemantic(embedding)
    if (semantic.length > 0) {
      console.log(`[knowledge] semântica: ${semantic.length} resultado(s)`)
      return semantic
    }
  }

  // Gap real: nem keyword nem semântica encontraram nada relevante.
  // O cliente perguntou algo que a base não cobre — sinal direto pro CODEX.
  console.log(`[knowledge] ⚠️  GAP DE CONHECIMENTO: nenhuma busca encontrou resultado para "${message}"`)
  logCodexAlert({
    type: 'gap_conhecimento',
    severity: 'atencao',
    conversationId,
    message: `Cliente perguntou algo sem resposta na base: "${message.slice(0, 200)}"`,
    data: { query: message },
  })

  // Fallback final: retorna entradas recentes
  return scored.length > 0 ? scored.slice(0, 5) : entries.slice(0, 3)
}

async function searchProducts(message) {
  if (!message || message.trim().length < 2) return []

  // Stopwords que não ajudam na busca de produto
  const STOPWORDS = new Set([
    'tem', 'voce', 'você', 'qual', 'quero', 'ver', 'foto', 'imagem', 'manda',
    'mostra', 'envia', 'quais', 'sao', 'são', 'como', 'que', 'para', 'por',
    'com', 'uma', 'uns', 'umas', 'isso', 'esse', 'essa', 'este', 'esta',
    'dele', 'dela', 'mais', 'alguma', 'algum', 'sim', 'nao', 'não'
  ])

  const words = message.toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w))

  if (words.length === 0) return []

  // Estratégia AND via PostgREST: usa `and=(filtro1,filtro2)` para exigir todas as palavras
  // Isso evita retornar "Cinto Marrom" quando o cliente pediu "New Balance 9060 Marrom"
  let results = []

  if (words.length >= 2) {
    // AND nativo do PostgREST: and=(nome.ilike.*new*,nome.ilike.*balance*,...)
    const andFilter = words.map(w => `nome.ilike.*${w}*`).join(',')
    const resAnd = await fetch(
      `${SUPABASE_URL}/rest/v1/products?and=(${andFilter})&status=eq.active&limit=50&select=nome,preco,imagem,link`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    )
    if (resAnd.ok) results = await resAnd.json()
    console.log(`[knowledge] searchProducts AND: ${results.length} resultado(s) para "${words.join(' ')}"`)
  }

  // Fallback: OR se AND não encontrou nada (busca mais ampla)
  if (results.length === 0) {
    const orFilter = words.map(w => `nome.ilike.*${w}*`).join(',')
    const resOr = await fetch(
      `${SUPABASE_URL}/rest/v1/products?or=(${orFilter})&status=eq.active&limit=200&select=nome,preco,imagem,link`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    )
    if (resOr.ok) results = await resOr.json()
    console.log(`[knowledge] searchProducts OR (fallback): ${results.length} resultado(s)`)
  }

  return results
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' })
  }

  try {
    const body = req.body || {}

    // Log COMPLETO para descobrir como GPT Maker identifica agente
    const logData = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: body,
      allFields: Object.keys(body)
    }

    logRequest(logData)
    console.log('[CONHECIMENTO] Requisição registrada em knowledge-requests.log')

    // GPT Maker pode enviar a mensagem em vários campos
    const message =
      body.message ||
      body.text ||
      body.content ||
      body.userMessage ||
      body.input ||
      body.query ||
      (typeof body === 'string' ? body : '') ||
      ''

    const chatId =
      body.chatId ||
      body.chat_id ||
      body.conversationId ||
      body.conversation_id ||
      body.id ||
      ''

    const searchQuery = await buildSearchQuery(message, chatId)

    const [knowledgeEntries, products] = await Promise.all([
      searchKnowledge(searchQuery, chatId),
      searchProducts(searchQuery),
    ])

    // Score dinâmico em background — não atrasa a resposta da Gabriela.
    // Recalcula buy_score do lead e dispara alerta lead_quente se cruzar o threshold.
    if (chatId) updateCustomerScore(chatId).catch(() => {})

    // Formata o contexto para a Gabriela usar na resposta
    const sections = []

    if (knowledgeEntries.length > 0) {
      sections.push('=== BASE DE CONHECIMENTO PRIME STORE ===')
      for (const e of knowledgeEntries) {
        sections.push(`[${e.category || 'GERAL'}] ${e.title}:\n${e.content}`)
      }
    }

    if (products.length > 0) {
      if (products.length > 1) {
        console.log(`[knowledge] ⚠️  MÚLTIPLAS OPÇÕES detectadas: ${products.length} produtos — agrupando por cor`)

        // Extrai a "cor base" do nome do produto para agrupar variações
        // Ex: "Tenis New Balance 9060 Marrom Black" → cor base "Marrom"
        const COLOR_KEYWORDS = [
          'marrom', 'preto', 'branco', 'azul', 'cinza', 'chumbo', 'gelo', 'rosa',
          'caramelo', 'bege', 'verde', 'vermelho', 'roxo', 'laranja', 'amarelo',
          'ouro', 'prata', 'dourado', 'creme', 'nude', 'vinho', 'bordo', 'lilás',
          'lilas', 'salmao', 'salmão', 'menta', 'sage', 'shadow', 'castlerock',
          'off white', 'off-white', 'grey', 'gray', 'algodao', 'algodão',
        ]

        function extractColorGroup(nome) {
          const lower = nome.toLowerCase()
          for (const color of COLOR_KEYWORDS) {
            if (lower.includes(color)) return color.charAt(0).toUpperCase() + color.slice(1)
          }
          return 'Outros'
        }

        // Agrupa produtos por cor
        const groups = {}
        for (const p of products) {
          const cor = extractColorGroup(p.nome)
          if (!groups[cor]) groups[cor] = []
          groups[cor].push(p)
        }

        const colorEntries = Object.entries(groups)
        const totalColors = colorEntries.length

        sections.push('\n=== MÚLTIPLAS OPÇÕES ENCONTRADAS ===')

        // Se há só 1 cor (ex: 4 variações de Marrom) → lista direto os produtos
        if (totalColors === 1) {
          const [cor, items] = colorEntries[0]
          sections.push(`Encontrei ${items.length} variações de ${cor}:\n`)
          items.forEach((p, i) => {
            sections.push(`${i + 1}️⃣ ${p.nome} — ${p.preco}`)
            if (p.link) sections.push(`   🔗 ${p.link}`)
          })
          sections.push('\n📋 Instrução: Liste as variações acima e pergunte qual o cliente quer ver.')

        } else {
          // Múltiplas cores → agrupa por cor, mostra contagem de variações
          sections.push(`Encontrei ${products.length} modelos em ${totalColors} cores disponíveis:\n`)
          colorEntries.forEach(([cor, items], i) => {
            const variacoes = items.length > 1 ? ` (${items.length} variações)` : ''
            sections.push(`${i + 1}️⃣ ${cor}${variacoes} — ${items[0].preco}`)
          })
          sections.push('\n📋 Instrução: Liste as cores acima e pergunte qual cor o cliente prefere.')
          sections.push('Após o cliente escolher a cor, mostre as variações dessa cor específica.')

          // Inclui detalhes de cada cor para Gabriela poder responder quando cliente escolher
          sections.push('\n--- DETALHES POR COR (usar quando cliente escolher) ---')
          colorEntries.forEach(([cor, items]) => {
            sections.push(`\n[${cor.toUpperCase()}]`)
            items.forEach(p => {
              sections.push(`• ${p.nome} — ${p.preco}`)
              if (p.link) sections.push(`  🔗 ${p.link}`)
            })
          })
        }

        sections.push('\nAguarde a escolha do cliente antes de enviar foto/preço de um produto específico.')
      } else {
        // Uma única opção — responde normalmente
        sections.push('\n=== PRODUTOS ENCONTRADOS ===')
        const p = products[0]
        let line = `• ${p.nome}`
        if (p.preco) line += ` — ${p.preco}`
        if (p.link) line += `\n  Link: ${p.link}`
        if (p.imagem) line += `\n  Foto: ${p.imagem}`
        sections.push(line)
      }
    }

    const context = sections.join('\n\n')
    const hasMultipleOptions = products.length > 1

    // Estrutura a lista de opções para auto-photo.js usar quando cliente pedir múltiplas fotos
    const optionsList = products.slice(0, 5).map(p => ({
      nome: p.nome,
      preco: p.preco,
      link: p.link,
      imagem: p.imagem,
    }))

    return res.status(200).json({
      output: context || 'Nenhuma informação encontrada na base de conhecimento para esta mensagem.',
      context,
      knowledge_count: knowledgeEntries.length,
      products_count: products.length,
      has_multiple_options: hasMultipleOptions,
      multiple_options_count: hasMultipleOptions ? products.length : 0,
      options: hasMultipleOptions ? optionsList : [],
    })
  } catch (err) {
    console.error('[knowledge webhook] Erro:', err)
    return res.status(500).json({ error: err.message })
  }
}
