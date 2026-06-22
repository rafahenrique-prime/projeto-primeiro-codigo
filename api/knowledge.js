// Webhook para GPT Maker — Consultar base de conhecimento
// Gabriela chama este endpoint antes de responder ao cliente
// O retorno é injetado como contexto na resposta dela

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY
const GPTMAKER_TOKEN = process.env.VITE_GPTMAKER_TOKEN
const BASE = 'https://api.gptmaker.ai'

function detectProductRequest(msg) {
  const m = (msg || '').toLowerCase()
  return [
    /mand[ae].*foto/,
    /me manda (a |uma )?foto/,
    /mostra.*foto/,
    /envia.*foto/,
    /quero ver (a |uma )?foto/,
    /tem foto/,
    /manda (a |uma )?imagem/,
  ].some(p => p.test(m))
}

async function sendImage(chatId, nomeProduto, imageUrl, preco, link) {
  const body1 = { message: nomeProduto, image: imageUrl }
  const r1 = await fetch(`${BASE}/v2/chat/${chatId}/send-message`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GPTMAKER_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body1),
  })
  if (!r1.ok) {
    const err = await r1.json().catch(() => ({}))
    console.error('[knowledge] ❌ Erro ao enviar imagem:', r1.status, err)
    return false
  }
  await new Promise(r => setTimeout(r, 1000))
  const body2 = { message: `${preco}\n\n${link}`, type: 'TEXT' }
  await fetch(`${BASE}/v2/chat/${chatId}/send-message`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GPTMAKER_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body2),
  })
  return true
}

async function searchKnowledge(message) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/knowledge?order=created_at.desc`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
  })
  if (!res.ok) throw new Error(`Supabase erro: ${res.status}`)
  const entries = await res.json()

  if (!message || message.trim().length < 2) {
    return entries.slice(0, 5)
  }

  const words = message.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  if (words.length === 0) return entries.slice(0, 5)

  const scored = entries.map(entry => {
    const score = words.reduce((acc, w) => {
      const titleHits = ((entry.title || '').toLowerCase().match(new RegExp(w, 'g')) || []).length * 3
      const contentHits = ((entry.content || '').toLowerCase().match(new RegExp(w, 'g')) || []).length
      return acc + titleHits + contentHits
    }, 0)
    return { ...entry, score }
  }).filter(e => e.score > 0).sort((a, b) => b.score - a.score)

  return scored.length > 0 ? scored.slice(0, 5) : entries.slice(0, 3)
}

async function searchProducts(message) {
  if (!message || message.trim().length < 2) return []

  const words = message.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  if (words.length === 0) return []

  // Busca produtos no Supabase por nome — usa * como wildcard (% precisa de encoding na URL)
  const orFilter = words.map(w => `nome.ilike.*${w}*`).join(',')
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/products?or=(${orFilter})&limit=5&select=nome,preco,imagem,link`,
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

    // Log completo para descobrir quais campos o GPT Maker envia
    console.log('[knowledge] Body recebido:', JSON.stringify(body).slice(0, 500))

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

    console.log('[knowledge] message:', message?.slice(0, 100), '| chatId:', chatId)

    // Se for pedido de foto e tiver chatId válido, envia imagem diretamente
    const chatIdValid = chatId && !chatId.startsWith('@') && !chatId.startsWith('{{')
    if (chatIdValid && detectProductRequest(message)) {
      console.log('[knowledge] 📸 Pedido de foto detectado! Tentando enviar imagem...')
    }

    const [knowledgeEntries, products] = await Promise.all([
      searchKnowledge(message),
      searchProducts(message),
    ])

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
        sections.push(line)
      }
    }

    const context = sections.join('\n\n')

    const firstProduct = products[0] || null

    // Se pediu foto E temos chatId E temos produto com imagem → envia imagem diretamente
    if (chatIdValid && detectProductRequest(message) && firstProduct?.imagem) {
      console.log('[knowledge] 📸 Enviando imagem via API:', firstProduct.nome, '| chatId:', chatId)
      sendImage(chatId, firstProduct.nome, firstProduct.imagem, firstProduct.preco, firstProduct.link)
        .then(ok => console.log('[knowledge] Imagem enviada:', ok))
        .catch(err => console.error('[knowledge] Erro ao enviar imagem:', err.message))
    }

    return res.status(200).json({
      output: context || 'Nenhuma informação encontrada na base de conhecimento para esta mensagem.',
      context,
      knowledge_count: knowledgeEntries.length,
      products_count: products.length,
      // Campos individuais do produto para uso em variáveis do contato (GPT Maker)
      imageUrl: firstProduct?.imagem || '',
      productName: firstProduct?.nome || '',
      productPrice: firstProduct?.preco || '',
      productLink: firstProduct?.link || '',
    })
  } catch (err) {
    console.error('[knowledge webhook] Erro:', err)
    return res.status(500).json({ error: err.message })
  }
}
