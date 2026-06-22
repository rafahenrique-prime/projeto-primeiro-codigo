// Perfil de memória por cliente — Supabase
// Equivalente ao USER.md do Dealism original

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY
const TABLE = 'customer_profiles'

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
}

function base() {
  return `${SUPABASE_URL}/rest/v1/${TABLE}`
}

// Retorna o perfil de um cliente pelo ID da conversa
export async function getProfile(convId) {
  const res = await fetch(`${base()}?conv_id=eq.${encodeURIComponent(convId)}&limit=1`, { headers })
  if (!res.ok) return null
  const data = await res.json()
  return data[0] || null
}

// Cria ou atualiza o perfil de um cliente
// Extrai automaticamente dados das mensagens
export async function upsertProfile(conv, msgs) {
  const existing = await getProfile(conv.id)

  const extracted = extractFromMessages(msgs)

  const profile = {
    conv_id: conv.id,
    name: conv.name || existing?.name || null,
    channel: conv.channelLabel || existing?.channel || null,
    last_seen: new Date().toISOString(),
    message_count: msgs.length,
    // Merge de preferências: mantém o que já tinha + adiciona novo
    interests: mergeArray(existing?.interests, extracted.interests),
    products_asked: mergeArray(existing?.products_asked, extracted.products_asked),
    tags: mergeArray(existing?.tags, extracted.tags),
    // Dados coletados no diálogo
    cep: extracted.cep || existing?.cep || null,
    size: extracted.size || existing?.size || null,
    buy_score: extracted.buy_score ?? existing?.buy_score ?? 0,
    notes: existing?.notes || null,
  }

  if (existing) {
    const res = await fetch(`${base()}?conv_id=eq.${encodeURIComponent(conv.id)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(profile),
    })
    if (!res.ok) throw new Error(`upsertProfile PATCH: ${res.status}`)
  } else {
    const res = await fetch(base(), {
      method: 'POST',
      headers,
      body: JSON.stringify(profile),
    })
    if (!res.ok) throw new Error(`upsertProfile POST: ${res.status}`)
  }
}

// Adiciona uma nota manual ao perfil
export async function addNote(convId, note) {
  const existing = await getProfile(convId)
  if (!existing) return
  const notes = existing.notes ? `${existing.notes}\n${note}` : note
  const res = await fetch(`${base()}?conv_id=eq.${encodeURIComponent(convId)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ notes }),
  })
  if (!res.ok) throw new Error(`addNote: ${res.status}`)
}

// Adiciona tag ao perfil
export async function addTag(convId, tag) {
  const existing = await getProfile(convId)
  if (!existing) return
  const tags = mergeArray(existing.tags, [tag])
  const res = await fetch(`${base()}?conv_id=eq.${encodeURIComponent(convId)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ tags }),
  })
  if (!res.ok) throw new Error(`addTag: ${res.status}`)
}

// Lista todos os perfis (para tela de contatos)
export async function getAllProfiles() {
  const res = await fetch(`${base()}?order=last_seen.desc`, { headers })
  if (!res.ok) throw new Error(`getAllProfiles: ${res.status}`)
  return res.json()
}

// Busca perfis por nome ou tag
export async function searchProfiles(query) {
  if (!query || query.trim().length < 2) return []
  const res = await fetch(`${base()}?name=ilike.*${encodeURIComponent(query)}*&order=last_seen.desc`, { headers })
  if (!res.ok) return []
  return res.json()
}

// ─── Extração automática de dados das mensagens ───────────────────────────────

function extractFromMessages(msgs) {
  const clientMsgs = msgs
    .filter(m => m.role === 'user')
    .map(m => (m.text || m.content || '').toLowerCase())

  const allText = clientMsgs.join(' ')

  return {
    cep: extractCep(allText),
    size: extractSize(allText),
    interests: extractInterests(allText),
    products_asked: extractProducts(msgs),
    tags: extractTags(allText, msgs.length),
    buy_score: calcBuyScore(allText, msgs.length),
  }
}

function extractCep(text) {
  const match = text.match(/\b\d{5}-?\d{3}\b/)
  return match ? match[0].replace('-', '') : null
}

function extractSize(text) {
  // Roupas: P, M, G, GG, XG, PP
  const roupa = text.match(/\btamanho\s*(pp|p|m|gg|xg|g)\b/i)
    || text.match(/\bvisto\s*(pp|p|m|gg|xg|g)\b/i)
    || text.match(/\buso\s*(pp|p|m|gg|xg|g)\b/i)
    || text.match(/\bsou\s*(pp|p|m|gg|xg|g)\b/i)
    || text.match(/\b(pp|gg|xg)\b/i) // só detecta os incomuns sem contexto pra evitar falso positivo
  if (roupa) return roupa[1].toUpperCase()

  // Calçados: número 38-47
  const calcado = text.match(/\bnúmero\s*(3[89]|4[0-7])\b/i)
    || text.match(/\btamanho\s*(3[89]|4[0-7])\b/i)
    || text.match(/\b(3[89]|4[0-7])\b(?=\s*(,|\.|$| de calçado| de tênis| no pé))/)
  if (calcado) return calcado[1]

  return null
}

function extractInterests(text) {
  const brands = [
    'nike', 'adidas', 'off white', 'off-white', 'stussy', 'new balance',
    'vans', 'supreme', 'jordan', 'puma', 'fila', 'gucci', 'armani',
    'balenciaga', 'louis vuitton', 'lv', 'dior', 'fendi', 'boss',
    'burberry', 'diesel', 'philipp plein', 'on running', 'on cloud',
    'asics', 'reebok', 'converse', 'lacoste', 'ralph lauren',
  ]
  const categories = [
    'camiseta', 'moletom', 'calça', 'tênis', 'bermuda', 'jaqueta',
    'boné', 'meia', 'shorts', 'cueca', 'camisa', 'casaco', 'blusa',
    'polo', 'regata', 'agasalho', 'plataforma',
  ]
  const found = []
  ;[...brands, ...categories].forEach(term => {
    if (text.includes(term)) found.push(term)
  })
  return found
}

function extractProducts(msgs) {
  return msgs
    .filter(m => m.role === 'agent' && m.image)
    .map(m => m.text || '')
    .filter(Boolean)
    .slice(-10)
}

function calcBuyScore(text, msgCount) {
  // Score por categoria (0-100 cada) em vez de somar direto
  let intentScore = 0     // Intenção de compra (60% do peso final)
  let objectionScore = 0  // Objeções (reduz 30%)
  let engagementScore = 0 // Engajamento (20% do peso final)

  // INTENÇÃO DE COMPRA (0-100)
  if (/\b(vou levar|quero comprar|pode fechar|fecha pra mim|manda o pix|qual o pix)\b/i.test(text)) intentScore = 100
  else if (/\b(qual o link|manda o link|como faço o pedido|como compro)\b/i.test(text)) intentScore = 80
  else if (/\b(tem em estoque|tem disponível|aceita pix|parcela|cartão|frete|prazo)\b/i.test(text)) intentScore = 50
  else if (/\b(quero|tenho interesse|gostei|adorei|bonito|lindo|perfeito)\b/i.test(text)) intentScore = 30

  // OBJEÇÕES (0-100, vai REDUZIR score final)
  if (/\b(vou pensar|deixa eu ver|talvez|não sei)\b/i.test(text)) objectionScore = 70  // Indecisão forte
  else if (/\b(caro|salgado|muito caro|não tenho|sem dinheiro|depois)\b/i.test(text)) objectionScore = 50  // Objeção real

  // ENGAJAMENTO (0-100 baseado em msgCount)
  engagementScore = Math.min(msgCount * 2, 100)  // 1 msg = 2 pts, 50 msgs = 100 pts

  // Score final: weighted average
  // Intenção 60% + Engajamento 20% - Objeções 30%
  const finalScore = (intentScore * 0.6) + (engagementScore * 0.2) - (objectionScore * 0.3)

  return Math.max(0, Math.min(100, Math.round(finalScore)))
}

function extractTags(text, msgCount) {
  const tags = []

  // Engajamento
  if (msgCount >= 5) tags.push('Engajado')
  if (msgCount >= 20) tags.push('Alta Interação')

  // Intenção de compra
  if (/\b(vou levar|quero comprar|fecha|manda o pix|qual o pix|como compro)\b/i.test(text)) tags.push('🔥 Pronto pra Comprar')
  else if (/\b(quero|tenho interesse|gostei|quanto custa|tem em estoque|qual o link)\b/i.test(text)) tags.push('Intenção de Compra')

  // Comportamento de preço
  if (/\b(caro|salgado|desconto|promoção|mais barato|tem desconto)\b/i.test(text)) tags.push('Sensível a Preço')

  // Perfil premium
  if (/\b(importado|exclusiv|lançamento|limitad|vip|premium)\b/i.test(text)) tags.push('Interesse Premium')

  // Marcas específicas detectadas
  if (/new balance/i.test(text)) tags.push('Fã New Balance')
  if (/\bnike\b/i.test(text)) tags.push('Fã Nike')
  if (/\bgucci|armani|louis vuitton|dior|fendi|balenciaga\b/i.test(text)) tags.push('Interesse Luxo')

  // Tamanho detectado
  const size = extractSize(text)
  if (size) tags.push(`Tamanho ${size}`)

  // Retorno
  if (/\b(comprei antes|já comprei|última vez|voltei|de novo)\b/i.test(text)) tags.push('Cliente Recorrente')

  return tags
}

function mergeArray(existing, newItems) {
  const base = Array.isArray(existing) ? existing : []
  const add = Array.isArray(newItems) ? newItems : []
  return [...new Set([...base, ...add])]
}
