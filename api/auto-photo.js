// Webhook serverless — detecta pedido de foto e envia automaticamente
// Roda 24/7 no Vercel, sem precisar do navegador aberto

const GPTMAKER_TOKEN = process.env.VITE_GPTMAKER_TOKEN
const GPTMAKER_WS = process.env.VITE_GPTMAKER_WORKSPACE
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY
const BASE = 'https://api.gptmaker.ai'

const PALAVRAS_GENERICAS = new Set([
  'tenis', 'camiseta', 'camisa', 'cueca', 'bermuda', 'calca', 'conjunto',
  'perfume', 'oculos', 'bone', 'blusa', 'moletom', 'masculino', 'feminino',
  'foto', 'imagem', 'produto', 'esse', 'essa', 'este', 'esta', 'dele', 'dela'
])

const CATALOG_FALLBACK = [
  { nome: "Tenis New Balance 9060 Creme C/ Cinza", preco: "R$ 549,00", imagem: "https://cdn.dooca.store/161486/products/photo-2026-05-05-21-57-11-xrm49_600x800+crop_center.jpg?v=1779812331", link: "https://www.primestoremen.com.br/tenis-new-balance-9060-creme-c-cinza" },
  { nome: "Nike Dunk Low Gray Premium", preco: "R$ 499,00", imagem: "https://cdn.dooca.store/161486/products/dunk-01-com7i_600x800+crop_center.jpeg?v=1778510673", link: "https://www.primestoremen.com.br/nike-dunk-low-gray-premium" },
  { nome: "Tenis New Balance 9060 Cinza Claro", preco: "R$ 499,00", imagem: "https://cdn.dooca.store/161486/products/9060-cinza-claro-03-fgbwb_600x800+crop_center.jpeg?v=1778506995", link: "https://www.primestoremen.com.br/new-balnce-9060-cinza-claro" },
  { nome: "Tenis New Balance 9060 Branco Solado Rosa", preco: "R$ 499,00", imagem: "https://cdn.dooca.store/161486/products/branco-com-rosa_600x800+crop_center.jpeg?v=1747773207", link: "https://www.primestoremen.com.br/new-balnce-9060-branco-c-detalhes-rosa" },
  { nome: "Plataforma Gucci Feminina - Marrom Escuro", preco: "R$ 499,00", imagem: "https://cdn.dooca.store/161486/products/marrom-escura-tpt1k_600x800+crop_center.jpeg?v=1778241694", link: "https://www.primestoremen.com.br/gucci-femina-marromescuro" },
  { nome: "Tenis New Balance 530 Rosa Cream", preco: "R$ 499,00", imagem: "https://cdn.dooca.store/161486/products/whatsapp-image-2026-05-07-at-015354-4-g16zi_600x800+crop_center.jpeg?v=1778179095", link: "https://www.primestoremen.com.br/new-balnce-530-rosa-cream" },
  { nome: "Tenis New Balance 530 Marron Claro", preco: "R$ 499,00", imagem: "https://cdn.dooca.store/161486/products/whatsapp-image-2026-05-07-at-015355-1-4scrm_600x800+crop_center.jpeg?v=1778179212", link: "https://www.primestoremen.com.br/new-balnce-530-marron-claro" },
  { nome: "Tenis New Balance 530 Branco", preco: "R$ 499,00", imagem: "https://cdn.dooca.store/161486/products/whatsapp-image-2026-05-07-at-015350-2-wojum_600x800+crop_center.jpeg?v=1778178476", link: "https://www.primestoremen.com.br/new-balnce-530-branco" },
  { nome: "Cueca Lup 009", preco: "R$ 79,00", imagem: "https://cdn.dooca.store/161486/products/cuecalupo00012-2qvvz_600x800+crop_center.jpg?v=1778160023", link: "https://www.primestoremen.com.br/cueca-lupo-009" },
  { nome: "Cueca Lup 007", preco: "R$ 79,00", imagem: "https://cdn.dooca.store/161486/products/cueca01232133-1l0sm_600x800+crop_center.jpg?v=1778159972", link: "https://www.primestoremen.com.br/cueca-lupo-007" },
  { nome: "Cueca Lup 006", preco: "R$ 79,00", imagem: "https://cdn.dooca.store/161486/products/cueca-lupo3322-12ks4_600x800+crop_center.png?v=1778159925", link: "https://www.primestoremen.com.br/cueca-lupo-006" },
  { nome: "Cueca Lup 005", preco: "R$ 79,00", imagem: "https://cdn.dooca.store/161486/products/cuecalupo99932-fjatc_600x800+crop_center.png?v=1778159900", link: "https://www.primestoremen.com.br/cueca-lupo-005" },
  { nome: "Cueca Lup 004", preco: "R$ 79,00", imagem: "https://cdn.dooca.store/161486/products/cuecalupo9392321-41vpr_600x800+crop_center.png?v=1778159879", link: "https://www.primestoremen.com.br/cueca-lupo-004" },
  { nome: "Cueca Lup 003", preco: "R$ 79,00", imagem: "https://cdn.dooca.store/161486/products/cuecalupo00001-at6to_600x800+crop_center.png?v=1778159846", link: "https://www.primestoremen.com.br/cueca-lupo-003" },
  { nome: "Cueca Lup 002", preco: "R$ 79,00", imagem: "https://cdn.dooca.store/161486/products/cuecalupo00012344-fkdce_600x800+crop_center.png?v=1778159808", link: "https://www.primestoremen.com.br/cueca-lupo-002" },
  { nome: "Cueca Lup 034", preco: "R$ 79,00", imagem: "https://cdn.dooca.store/161486/products/cuecalupo02-azje7_600x800+crop_center.jpeg?v=1778159482", link: "https://www.primestoremen.com.br/cueca-lupo" },
  { nome: "Tenis New Balance 9060 Off White C/ Verde Claro New", preco: "R$ 599,00", imagem: "https://cdn.dooca.store/161486/products/photo-2026-05-06-16-46-35-mxijt_600x800+crop_center.jpg?v=1778129468", link: "https://www.primestoremen.com.br/new-balance-9060-off-white-c-verde-claro-new" },
  { nome: "Tenis New Balance 9060 Marrom C/ Preto", preco: "R$ 599,00", imagem: "https://cdn.dooca.store/161486/products/9060-marorn-preto-sv3da_600x800+crop_center.jpeg?v=1778511917", link: "https://www.primestoremen.com.br/new-ballace-9060-marrom-c-preto" },
  { nome: "Tenis New Balance 9060 Marrom", preco: "R$ 599,00", imagem: "https://cdn.dooca.store/161486/products/9060-marrom01-k21t8_600x800+crop_center.jpeg?v=1778508824", link: "https://www.primestoremen.com.br/new-ballace-9060-marrom" },
  { nome: "Tenis New Balance 9060 Chumbo", preco: "R$ 599,00", imagem: "https://cdn.dooca.store/161486/products/9060-grafite-01-43o2g_600x800+crop_center.jpeg?v=1778508331", link: "https://www.primestoremen.com.br/new-ballace-9060-chumbo" },
  { nome: "Tenis New Balance 9060 Grey Cinza", preco: "R$ 599,00", imagem: "https://cdn.dooca.store/161486/products/photo-2026-04-24-10-39-02-annh1_600x800+crop_center.jpg?v=1778129316", link: "https://www.primestoremen.com.br/new-ballace-9060-grey-cinza" },
  { nome: "Boné Importado Diesel Preto", preco: "R$ 599,00", imagem: "https://cdn.dooca.store/161486/products/img-6455-e21mc_600x800+crop_center.jpg?v=1774305135", link: "https://www.primestoremen.com.br/bone-importado-diesel-preto" },
  { nome: "Bone Armani Importado", preco: "R$ 499,00", imagem: "https://cdn.dooca.store/161486/products/bone-armani-media-1yxxl_600x800+crop_center.jpeg?v=1774144457", link: "https://www.primestoremen.com.br/bone-louis-vitton-importado-lv-iii" },
  { nome: "Bone Louis Vitton Importado Lv Ii", preco: "R$ 499,00", imagem: "https://cdn.dooca.store/161486/products/bone-lv-media-ij5ik_600x800+crop_center.jpeg?v=1774144299", link: "https://www.primestoremen.com.br/bone-louuis-vitton-importado-lv-ii" },
  { nome: "Bone Balenciaga Importado", preco: "R$ 319,00", imagem: "https://cdn.dooca.store/161486/products/bone-balanciaga-media-gfpsz.jpeg?v=1774144231", link: "https://www.primestoremen.com.br/bone-balenciaga-importado" },
  { nome: "Bone Gucci Ii Importado", preco: "R$ 319,00", imagem: "https://cdn.dooca.store/161486/products/bone-gucci04-media-tvlxc.jpeg?v=1774144166", link: "https://www.primestoremen.com.br/bone-gucci-ii-importado" },
  { nome: "Bone Gucci Importado", preco: "R$ 319,00", imagem: "https://cdn.dooca.store/161486/products/bone-guccu01-media-sf1fu.jpeg?v=1774144134", link: "https://www.primestoremen.com.br/bone-gucci-importado" },
  { nome: "Bone Dior Importada", preco: "R$ 319,00", imagem: "https://cdn.dooca.store/161486/products/bone-dior-media-jnnpu.jpeg?v=1774144077", link: "https://www.primestoremen.com.br/bone-dior-importada" },
  { nome: "Bone Philipp Plein Camo", preco: "R$ 319,00", imagem: "https://cdn.dooca.store/161486/products/bone-phi-media-seypa.jpeg?v=1774143838", link: "https://www.primestoremen.com.br/bone-philipp-plein-importada-2" },
  { nome: "Bone Philipp Plein Caveira", preco: "R$ 319,00", imagem: "https://cdn.dooca.store/161486/products/bone-ph01-media-tyd82.jpeg?v=1774143815", link: "https://www.primestoremen.com.br/bone-philipp-plein-importada-1" },
  { nome: "Bone Philipp Plein Logo Pp", preco: "R$ 319,00", imagem: "https://cdn.dooca.store/161486/products/one-philp-media-hcdfu.jpeg?v=1774143756", link: "https://www.primestoremen.com.br/bone-philipp-plein-importada" },
  { nome: "Bone Boss Importada", preco: "R$ 319,00", imagem: "https://cdn.dooca.store/161486/products/bone-boss01-media-mekvg.jpeg?v=1774142964", link: "https://www.primestoremen.com.br/bone-boss-importada" },
  { nome: "Bone Burberry Importada", preco: "R$ 319,00", imagem: "https://cdn.dooca.store/161486/products/bone-burrb-media-zcpu9.jpeg?v=1774142863", link: "https://www.primestoremen.com.br/bone-burberry-importada" },
  { nome: "Bermuda Burberry Preta Importada Lv", preco: "R$ 319,00", imagem: "https://cdn.dooca.store/161486/products/bermuda-burby-x3ths.jpeg?v=1774142669", link: "https://www.primestoremen.com.br/bermuda-burberry-preta-importada-lv" },
  { nome: "Bermuda Louis Vitton Preta Importada Lv", preco: "R$ 319,00", imagem: "https://cdn.dooca.store/161486/products/bermuda-lv001-media-lixfc.jpeg?v=1774142553", link: "https://www.primestoremen.com.br/bermuda-louis-vitton-preta-importada-lv" },
  { nome: "Bermuda Louis Vitton Branca Importada Lv", preco: "R$ 319,00", imagem: "https://cdn.dooca.store/161486/products/bermuda-lv-branca01-media-tmflx.jpeg?v=1774142496", link: "https://www.primestoremen.com.br/bermuda-louis-vitton-branca-importada-lv" },
  { nome: "Bermuda Louis Vitton Importada Lv", preco: "R$ 319,00", imagem: "https://cdn.dooca.store/161486/products/bermuda-lv011-grande-cdcho.jpeg?v=1774142419", link: "https://www.primestoremen.com.br/bermuda-louis-vitton-importada-lv" },
  { nome: "Bermuda Dior Importada", preco: "R$ 319,00", imagem: "https://cdn.dooca.store/161486/products/bermuda-dior-xdtjf.jpeg?v=1774142342", link: "https://www.primestoremen.com.br/bermuda-dior-importada" },
  { nome: "Bermuda Fendi Importada", preco: "R$ 319,00", imagem: "https://cdn.dooca.store/161486/products/bermuda-fendi-qvmuh.jpeg?v=1774142268", link: "https://www.primestoremen.com.br/bermuda-fendi-importada" },
  { nome: "Bermuda Prado Importada", preco: "R$ 319,00", imagem: "https://cdn.dooca.store/161486/products/bermuda-prada-nemwf.jpeg?v=1774142208", link: "https://www.primestoremen.com.br/bermuda-prada-importada" },
  { nome: "Camisetas On Runing Treino - Cinza Claro", preco: "R$ 299,00", imagem: "https://cdn.dooca.store/161486/products/photo-2026-03-21-17-06-11-tqqkh.jpg?v=1774123661", link: "https://www.primestoremen.com.br/camisetas-on-runing-treino-cinza-claro" },
  { nome: "Camisetas On Runing Treino - Azul Marinho", preco: "R$ 299,00", imagem: "https://cdn.dooca.store/161486/products/on-brancanot-azzul-xoffw.jpeg?v=1774123112", link: "https://www.primestoremen.com.br/camisetas-on-runing-treino-azul-marinho" },
  { nome: "Camisetas On Runing Treino - Cinza", preco: "R$ 299,00", imagem: "https://cdn.dooca.store/161486/products/on-brancanot-cinza01-gnzgq.jpeg?v=1774122989", link: "https://www.primestoremen.com.br/camisetas-on-runing-treino-cinza" },
  { nome: "Camisetas On Runing Treino - Branca", preco: "R$ 299,00", imagem: "https://cdn.dooca.store/161486/products/on-brancanot-01-ikfwu.jpeg?v=1774122917", link: "https://www.primestoremen.com.br/camisetas-on-runing-treino-branca" },
  { nome: "Camisetas On Runing Treino - Preta", preco: "R$ 299,00", imagem: "https://cdn.dooca.store/161486/products/on-preta01-5f8wb.jpeg?v=1774122781", link: "https://www.primestoremen.com.br/camisetas-on-runing-treino-preta" },
  { nome: "Camisa Brasil Azul Feminina Jordan II 2026/27 Torcedor - Nike", preco: "R$ 499,00", imagem: "https://cdn.dooca.store/161486/products/img-6247-d9ti1.jpeg?v=1773925325", link: "https://www.primestoremen.com.br/feminina-camisa-do-brasil-ii-2627-torcedor-pro-copa-2026-nike-jordan-azul" },
  { nome: "Camisa Brasil Amarela Nike I 2026/27 Torcedor Masculina", preco: "R$ 499,00", imagem: "https://cdn.dooca.store/161486/products/img-6244-copia-cwmmr.png?v=1773956821", link: "https://www.primestoremen.com.br/camisa-do-brasil-ii-2627-torcedor-amarela-pro-masculina-nike-amarela-2026-copa" },
  { nome: "Camisa Brasil Amarela Nike I 2026/27 Jogador Masculina", preco: "R$ 499,00", imagem: "https://cdn.dooca.store/161486/products/img-6276-wfnbq.jpg?v=1773956685", link: "https://www.primestoremen.com.br/camisa-do-brasil-ii-2627-torcedor-pro-masculina-nike-amarela-2026-copa-1" },
]

function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') return false
  if (url.includes('primestoremen.com.br')) return false
  return url.startsWith('http') && (
    /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url) ||
    url.includes('cdn.dooca.store') ||
    url.includes('supabase') ||
    url.includes('cdn.')
  )
}

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

function extractProductName(msg) {
  const m = (msg || '').toLowerCase()
  const patterns = [
    /(?:foto|imagem)\s+(?:do|da|de)\s+(.{3,50}?)(?:\?|$|,|\.)/i,
    /(?:manda|mostra|envia)\s+(?:a\s+)?(?:foto|imagem)\s+(?:do|da|de)?\s*(.{3,50}?)(?:\?|$|,|\.)/i,
    /\b(?:do|da|de)\b\s+(.{3,50}?)(?:\?|$|,|\.)/i,
  ]
  for (const p of patterns) {
    const match = m.match(p)
    if (match?.[1]) {
      const candidato = normalize(match[1].trim().replace(/^(do|da|de)\s+/i, '').trim())
      if (candidato.length >= 3 && !PALAVRAS_GENERICAS.has(candidato)) return candidato
    }
  }
  return null
}

function normalize(str) {
  // eslint-disable-next-line no-misleading-character-class
  return (str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function findProductInText(text, catalog) {
  if (!text) return null
  const lowerText = normalize(text)

  // Se a busca contém palavra de categoria (bone, tenis, cueca...), filtra só por essa categoria
  const queryWords = new Set(lowerText.split(/\s+/))
  const queryCategory = [...queryWords].find(w => PALAVRAS_GENERICAS.has(w) && w.length >= 4)

  const sorted = [...catalog].sort((a, b) => b.nome.length - a.nome.length)
  for (const p of sorted) {
    const nomeLower = normalize(p.nome)
    const words = nomeLower.split(/\s+/).filter(w => w.length >= 3)
    const pCategory = words.find(w => PALAVRAS_GENERICAS.has(w) && w.length >= 4)

    if (queryCategory && pCategory && pCategory !== queryCategory) continue

    if (lowerText.includes(nomeLower)) return p
    const nomeSimplificado = nomeLower.replace(/^(tenis|bone|camiseta|bermuda|cueca|camisa)\s+/, '')
    if (nomeSimplificado !== nomeLower && lowerText.includes(nomeSimplificado)) return p
  }

  let bestMatch = null, bestScore = 0, bestSpecific = 0
  for (const p of catalog) {
    if (!p.imagem) continue
    const words = normalize(p.nome).split(/\s+/).filter(w => w.length >= 3)
    const specificWords = words.filter(w => !PALAVRAS_GENERICAS.has(w))
    if (specificWords.length === 0) continue

    if (queryCategory) {
      const pCategory = words.find(w => PALAVRAS_GENERICAS.has(w) && w.length >= 4)
      if (pCategory && pCategory !== queryCategory) continue
    }

    const matches = specificWords.filter(w => lowerText.includes(w)).length
    if (matches >= 1) {
      const score = matches / specificWords.length
      if (matches > bestSpecific || (matches === bestSpecific && score > bestScore)) {
        bestSpecific = matches
        bestScore = score
        bestMatch = p
      }
    }
  }
  return bestSpecific >= 1 ? bestMatch : null
}

async function getCatalog() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/products?select=nome,preco,imagem,link&limit=500`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    )
    if (res.ok) {
      const data = await res.json()
      if (data.length > 0) return data
    }
  } catch {}
  return CATALOG_FALLBACK
}

async function getChatMessages(chatId) {
  try {
    const res = await fetch(`${BASE}/v2/chat/${chatId}/messages`, {
      headers: { 'Authorization': `Bearer ${GPTMAKER_TOKEN}` }
    })
    if (!res.ok) return []
    return res.json()
  } catch { return [] }
}

// Quando o GPT Maker não substitui as variáveis, busca o chat recente com pedido de foto
async function findRecentPhotoChat(catalog) {
  if (!GPTMAKER_WS) {
    console.warn('[auto-photo] GPTMAKER_WS não configurado')
    return null
  }
  try {
    const res = await fetch(`${BASE}/v2/workspace/${GPTMAKER_WS}/chats?page=1&pageSize=30`, {
      headers: { 'Authorization': `Bearer ${GPTMAKER_TOKEN}` }
    })
    if (!res.ok) {
      console.warn('[auto-photo] Erro ao listar chats:', res.status)
      return null
    }
    const data = await res.json()
    const chats = Array.isArray(data) ? data : (data.data || [])
    console.log('[auto-photo] Chats recentes encontrados:', chats.length)

    const cutoff = Date.now() - 5 * 60 * 1000 // últimos 5 minutos

    // Tenta usar lastMessage direto do chat list
    for (const chat of chats) {
      const lastMsg = chat.lastMessage || chat.last_message
      if (!lastMsg) continue
      const msgTime = new Date(lastMsg.createdAt || lastMsg.created_at || 0).getTime()
      const msgText = lastMsg.text || lastMsg.content || lastMsg.message || ''
      const msgRole = lastMsg.role || lastMsg.sender || ''

      if (
        msgTime > cutoff &&
        (msgRole === 'user' || msgRole === 'client' || !msgRole) &&
        detectProductRequest(msgText)
      ) {
        console.log('[auto-photo] Chat encontrado via lastMessage:', chat.id, '| msg:', msgText)
        return { chatId: chat.id, message: msgText }
      }
    }

    // Fallback: busca mensagens dos 5 chats mais recentes individualmente
    console.log('[auto-photo] Buscando mensagens dos 5 chats mais recentes...')
    for (const chat of chats.slice(0, 5)) {
      const msgs = await getChatMessages(chat.id)
      if (!msgs.length) continue

      // Pega a última mensagem do cliente
      const lastClientMsg = [...msgs].reverse().find(m =>
        m.role === 'user' || m.role === 'client'
      )
      if (!lastClientMsg) continue

      const msgTime = new Date(lastClientMsg.createdAt || lastClientMsg.created_at || 0).getTime()
      const msgText = lastClientMsg.text || lastClientMsg.content || lastClientMsg.message || ''

      if (msgTime > cutoff && detectProductRequest(msgText)) {
        console.log('[auto-photo] Chat encontrado via mensagens:', chat.id, '| msg:', msgText)
        // Também busca contexto do agente para identificar o produto
        const agentContext = msgs.slice(-10).filter(m => m.role !== 'user' && m.role !== 'client')
        return { chatId: chat.id, message: msgText, agentMsgs: agentContext, allMsgs: msgs }
      }
    }

    console.log('[auto-photo] Nenhum chat recente com pedido de foto encontrado')
    return null
  } catch (err) {
    console.error('[auto-photo] Erro em findRecentPhotoChat:', err.message)
    return null
  }
}

async function sendMessage(chatId, text, imageUrl = null) {
  const body = imageUrl ? { message: text, image: imageUrl } : { message: text, type: 'TEXT' }
  const res = await fetch(`${BASE}/v2/chat/${chatId}/send-message`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GPTMAKER_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' })

  const body = req.body || {}
  console.log('[auto-photo] Webhook recebido:', JSON.stringify(body).slice(0, 300))

  let message = body.message || body.text || body.content || body.userMessage || body.input || ''
  let chatId = body.chatId || body.chat_id || body.conversationId || body.conversation_id || body.id || ''
  const role = body.role || body.sender || ''

  if (role === 'agent' || role === 'assistant' || role === 'bot') {
    return res.status(200).json({ ok: true, skipped: 'agent message' })
  }

  const isLiteralVar = (val) => !val || val.startsWith('@') || val.startsWith('{{')
  const chatIdValid = chatId && !isLiteralVar(chatId)

  let allMsgs = []
  let agentMsgsFromSearch = []

  if (!chatIdValid) {
    // Sem chatId: busca em todos os chats recentes
    console.log('[auto-photo] Sem chatId válido — buscando chat recente...')
    const catalog = await getCatalog()
    const found = await findRecentPhotoChat(catalog)
    if (!found) {
      return res.status(200).json({ ok: true, skipped: 'no recent photo request found' })
    }
    chatId = found.chatId
    message = found.message
    allMsgs = found.allMsgs || []
    agentMsgsFromSearch = found.agentMsgs || []
  } else if (!message || isLiteralVar(message)) {
    // Temos chatId mas sem message — busca mensagens desse chat específico
    console.log('[auto-photo] chatId válido mas sem message — buscando mensagens do chat:', chatId)
    const msgs = await getChatMessages(chatId)
    allMsgs = msgs
    // Pega a última mensagem do cliente
    const lastClientMsg = [...msgs].reverse().find(m =>
      !m.role || m.role === 'user' || m.role === 'client' || m.role === 'human' || m.role === 'customer'
    )
    if (!lastClientMsg) {
      return res.status(200).json({ ok: true, skipped: 'no client message found in chat' })
    }
    message = lastClientMsg.text || lastClientMsg.content || lastClientMsg.message || ''
    console.log('[auto-photo] Última mensagem do cliente:', message?.slice(0, 100))
  }

  if (!detectProductRequest(message)) {
    return res.status(200).json({ ok: true, skipped: 'not a photo request', message: message?.slice(0, 50) })
  }

  console.log('[auto-photo] Pedido de foto detectado! chatId:', chatId, '| msg:', message)

  const [catalog, messages] = await Promise.all([
    getCatalog(),
    allMsgs.length > 0 ? Promise.resolve(allMsgs) : getChatMessages(chatId),
  ])

  // 1. Tenta extrair produto da mensagem atual
  const nomeProduto = extractProductName(message)
  let produto = null

  if (nomeProduto) {
    const nomeBusca = normalize(nomeProduto)
    produto = catalog.find(p => normalize(p.nome).includes(nomeBusca)) || null
    if (!produto) produto = findProductInText(nomeBusca, catalog)
    console.log('[auto-photo] Busca por nome "' + nomeProduto + '":', produto?.nome || 'não encontrado')
  }

  // 2. Se não achou, busca contexto nas mensagens recentes do agente
  if (!produto) {
    const agentMsgs = agentMsgsFromSearch.length > 0
      ? agentMsgsFromSearch
      : [...messages].reverse().filter(m => m.role !== 'user' && m.role !== 'client').slice(0, 10)

    for (const m of agentMsgs) {
      const texto = m.text || m.content || m.message || ''
      const found = findProductInText(texto, catalog)
      if (found) {
        produto = found
        console.log('[auto-photo] Produto encontrado no contexto:', produto.nome)
        break
      }
    }
  }

  if (!produto) {
    console.log('[auto-photo] Produto não encontrado para:', message)
    return res.status(200).json({ ok: true, skipped: 'product not found', message })
  }

  if (!isValidImageUrl(produto.imagem)) {
    console.log('[auto-photo] URL inválida:', produto.imagem)
    return res.status(200).json({ ok: true, skipped: 'invalid image url' })
  }

  console.log('[auto-photo] Enviando foto:', produto.nome, '| chatId:', chatId)

  try {
    await sendMessage(chatId, produto.nome, produto.imagem)
    await new Promise(r => setTimeout(r, 1000))
    await sendMessage(chatId, `${produto.preco}\n\n${produto.link}`)

    console.log('[auto-photo] ✅ Foto enviada com sucesso:', produto.nome)
    return res.status(200).json({ ok: true, produto: produto.nome, chatId })
  } catch (err) {
    console.error('[auto-photo] ❌ Erro ao enviar:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
