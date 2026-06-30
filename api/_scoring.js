// Lógica pura de extração/score — espelha src/services/customerProfileService.js
// Duplicado de propósito: customerProfileService.js roda no browser (import.meta.env),
// este roda em serverless (process.env). Se mudar a lógica de score, mudar nos dois.

export function extractCep(text) {
  const match = text.match(/\b\d{5}-?\d{3}\b/)
  return match ? match[0].replace('-', '') : null
}

export function extractSize(text) {
  const roupa = text.match(/\btamanho\s*(pp|p|m|gg|xg|g)\b/i)
    || text.match(/\bvisto\s*(pp|p|m|gg|xg|g)\b/i)
    || text.match(/\buso\s*(pp|p|m|gg|xg|g)\b/i)
    || text.match(/\bsou\s*(pp|p|m|gg|xg|g)\b/i)
    || text.match(/\b(pp|gg|xg)\b/i)
  if (roupa) return roupa[1].toUpperCase()

  const calcado = text.match(/\bnúmero\s*(3[89]|4[0-7])\b/i)
    || text.match(/\btamanho\s*(3[89]|4[0-7])\b/i)
    || text.match(/\b(3[89]|4[0-7])\b(?=\s*(,|\.|$| de calçado| de tênis| no pé))/)
  if (calcado) return calcado[1]

  return null
}

export function extractInterests(text) {
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

export function extractProducts(msgs) {
  return msgs
    .filter(m => m.role === 'agent' && m.image)
    .map(m => m.text || '')
    .filter(Boolean)
    .slice(-10)
}

export function calcBuyScore(text, msgCount) {
  let intentScore = 0
  let objectionScore = 0
  let engagementScore = 0

  if (/\b(vou levar|quero comprar|pode fechar|fecha pra mim|manda o pix|qual o pix)\b/i.test(text)) intentScore = 100
  else if (/\b(qual o link|manda o link|como faço o pedido|como compro)\b/i.test(text)) intentScore = 80
  else if (/\b(tem em estoque|tem disponível|aceita pix|parcela|cartão|frete|prazo)\b/i.test(text)) intentScore = 50
  else if (/\b(quero|tenho interesse|gostei|adorei|bonito|lindo|perfeito)\b/i.test(text)) intentScore = 30

  if (/\b(vou pensar|deixa eu ver|talvez|não sei)\b/i.test(text)) objectionScore = 70
  else if (/\b(caro|salgado|muito caro|não tenho|sem dinheiro|depois)\b/i.test(text)) objectionScore = 50

  engagementScore = Math.min(msgCount * 2, 100)

  const finalScore = (intentScore * 0.6) + (engagementScore * 0.2) - (objectionScore * 0.3)
  return Math.max(0, Math.min(100, Math.round(finalScore)))
}

export function extractTags(text, msgCount) {
  const tags = []

  if (msgCount >= 5) tags.push('Engajado')
  if (msgCount >= 20) tags.push('Alta Interação')

  if (/\b(vou levar|quero comprar|fecha|manda o pix|qual o pix|como compro)\b/i.test(text)) tags.push('🔥 Pronto pra Comprar')
  else if (/\b(quero|tenho interesse|gostei|quanto custa|tem em estoque|qual o link)\b/i.test(text)) tags.push('Intenção de Compra')

  if (/\b(caro|salgado|desconto|promoção|mais barato|tem desconto)\b/i.test(text)) tags.push('Sensível a Preço')
  if (/\b(importado|exclusiv|lançamento|limitad|vip|premium)\b/i.test(text)) tags.push('Interesse Premium')

  if (/new balance/i.test(text)) tags.push('Fã New Balance')
  if (/\bnike\b/i.test(text)) tags.push('Fã Nike')
  if (/\bgucci|armani|louis vuitton|dior|fendi|balenciaga\b/i.test(text)) tags.push('Interesse Luxo')

  const size = extractSize(text)
  if (size) tags.push(`Tamanho ${size}`)

  if (/\b(comprei antes|já comprei|última vez|voltei|de novo)\b/i.test(text)) tags.push('Cliente Recorrente')

  return tags
}

export function extractFromMessages(msgs) {
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
