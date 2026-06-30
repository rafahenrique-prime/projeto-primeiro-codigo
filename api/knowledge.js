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

  const words = message.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  if (words.length === 0) return []

  // Busca produtos no Supabase por nome — usa * como wildcard (% precisa de encoding na URL)
  const orFilter = words.map(w => `nome.ilike.*${w}*`).join(',')
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/products?or=(${orFilter})&status=eq.active&limit=200&select=nome,preco,imagem,link`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    }
  )
  if (!res.ok) return []
  return res.json()
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

    const [knowledgeEntries, products] = await Promise.all([
      searchKnowledge(message, chatId),
      searchProducts(message),
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
      sections.push('\n=== PRODUTOS ENCONTRADOS ===')
      for (const p of products) {
        let line = `• ${p.nome}`
        if (p.preco) line += ` — ${p.preco}`
        if (p.link) line += `\n  Link: ${p.link}`
        if (p.imagem) line += `\n  Foto: ${p.imagem}`
        sections.push(line)
      }
    }

    const context = sections.join('\n\n')

    return res.status(200).json({
      output: context || 'Nenhuma informação encontrada na base de conhecimento para esta mensagem.',
      context,
      knowledge_count: knowledgeEntries.length,
      products_count: products.length,
    })
  } catch (err) {
    console.error('[knowledge webhook] Erro:', err)
    return res.status(500).json({ error: err.message })
  }
}
