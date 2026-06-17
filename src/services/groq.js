const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

const MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'llama3-8b-8192']

async function groqRequest(body) {
  for (const model of MODELS) {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, model }),
    })
    if (res.ok) return res.json()
    const err = await res.json()
    const isRateLimit = res.status === 429 || err.error?.message?.includes('Rate limit')
    if (!isRateLimit) throw new Error(err.error?.message || 'Erro na API Groq')
    // rate limit → tenta próximo modelo
  }
  throw new Error('Todos os modelos atingiram o limite. Tente novamente em alguns minutos.')
}

function detectFunnelStage(msgs = [], lastMsg = '') {
  const text = (msgs.map(m => m.text || m.content || '').join(' ') + ' ' + lastMsg).toLowerCase()
  if (/manda o link|como fa[cç]o o pedido|quero comprar|vou levar|fecha|finalizar|confirma/.test(text)) return 'QUENTE_FECHAR'
  if (/aceita pix|quanto fica o frete|tem parcel|desconto|[cç]upom|promo[cç]|mais barato|caro/.test(text)) return 'DECISAO_OBJECAO'
  if (/tem tamanho|tem em estoque|tem na cor|disponivel|chega quando|prazo/.test(text)) return 'CONSIDERACAO'
  if (/quanto custa|qual o pre[cç]o|valor|quanto [eé]|me mostra|tem o modelo/.test(text)) return 'CURIOSIDADE'
  return 'INDEFINIDO'
}

function buildContext(conversations = []) {
  return conversations.map(c => {
    const msgs = c.fullMessages || []
    const stage = detectFunnelStage(msgs, c.lastMsg)
    const lastClientMsg = msgs.filter(m => m.role === 'user').slice(-1)[0]
    const lastAgentMsg = msgs.filter(m => m.role !== 'user').slice(-1)[0]

    const truncate = (t, n = 120) => (t || '').slice(0, n)
    return {
      id: c.id,
      cliente: c.name,
      canal: c.channelLabel,
      modo: c.mode,
      nao_lidas: c.unread,
      ultima_msg_cliente: truncate(lastClientMsg?.text || lastClientMsg?.content || c.lastMsg),
      estagio_funil: stage,
      historico: msgs.slice(-3).map(m => ({
        de: m.role === 'user' ? 'cliente' : 'agente',
        texto: truncate(m.text || m.content, 100),
      })),
    }
  })
}

function buildSystemPrompt(conversations) {
  const ctx = buildContext(conversations)

  const porCanal = { instagram: 0, whatsapp: 0 }
  conversations.forEach(c => { if (c.channel === 'instagram') porCanal.instagram++; else porCanal.whatsapp++ })

  const quentes     = ctx.filter(c => c.estagio_funil === 'QUENTE_FECHAR')
  const objecao     = ctx.filter(c => c.estagio_funil === 'DECISAO_OBJECAO')
  const consideracao= ctx.filter(c => c.estagio_funil === 'CONSIDERACAO')
  const curiosidade = ctx.filter(c => c.estagio_funil === 'CURIOSIDADE')
  const semResposta = ctx.filter(c => c.nao_lidas > 0)

  const priority = [
    ...ctx.filter(c => c.nao_lidas > 0 || c.estagio_funil === 'QUENTE_FECHAR'),
    ...ctx.filter(c => c.nao_lidas === 0 && c.estagio_funil !== 'QUENTE_FECHAR'),
  ].slice(0, 12)

  return `Você é o Deal Claude, Diretor Comercial IA da PRIME STORE (roupas e tênis premium).

═══ DADOS REAIS DISPONÍVEIS ═══
Total de conversas: ${ctx.length}
Instagram: ${porCanal.instagram} | WhatsApp: ${porCanal.whatsapp}
Não lidas (aguardando resposta): ${semResposta.length}
Funil → QUENTE_FECHAR: ${quentes.length} | DECISAO_OBJECAO: ${objecao.length} | CONSIDERACAO: ${consideracao.length} | CURIOSIDADE: ${curiosidade.length}

ESTÁGIOS detectados pela última mensagem:
QUENTE_FECHAR=pediu link/quer comprar | DECISAO_OBJECAO=objeção preço/frete/parcela | CONSIDERACAO=dúvida produto/estoque | CURIOSIDADE=perguntou preço/modelo | INDEFINIDO=sem dados claros

CONVERSAS (${priority.length} mais relevantes):
${JSON.stringify(priority)}

═══ REGRAS ABSOLUTAS ═══
1. RESPONDA APENAS O QUE FOI PERGUNTADO — não gere relatório completo se não pedido
2. BASE APENAS NOS DADOS ACIMA — nunca invente números, vendas, valores ou clientes
3. SE NÃO TIVER O DADO, diga: "Não tenho esse dado disponível no sistema"
4. Ao citar clientes, use os nomes reais da lista acima
5. Português BR | markdown simples | máx 250 palavras por resposta
6. Vendas realizadas, valores financeiros, pagamentos = não tenho acesso, informe isso`
}

export async function getRespostaRecomendada(conv, messages = []) {
  const historico = messages.slice(-12).map(m => {
    const role = m.role === 'user' ? 'Cliente' : m.role === 'assistant' ? 'IA' : 'Atendente'
    return `${role}: ${m.text || m.content || ''}`
  }).join('\n')

  const prompt = `Você é um especialista em vendas da PRIME STORE — loja de roupas e tênis premium (Armani, New Balance, etc).

CONVERSA COM ${conv.name?.toUpperCase()} (${conv.channelLabel}):
${historico || `Última mensagem: ${conv.lastMsg || 'sem mensagens'}`}

Com base nessa conversa, gere:
1. Uma resposta ideal para enviar agora (máx 2 frases, tom vendedor e humano, em português brasileiro)
2. O nome da estratégia usada (ex: "Urgência", "Prova social", "Desconto PIX", "Follow-up gentil", "Contorno de objeção", "Fechar pedido")
3. Um resumo do cliente em 1-2 frases: o que ele quer, onde está no processo de compra, algum detalhe importante (produto, tamanho, objeção)

Responda EXATAMENTE neste formato JSON:
{"resposta": "texto da resposta aqui", "estrategia": "nome da estrategia", "resumo": "resumo do cliente aqui"}`

  const data = await groqRequest({
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.5,
    max_tokens: 200,
  })
  const text = data.choices[0].message.content
  try {
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}')
    return { resposta: json.resposta || '', estrategia: json.estrategia || '', resumo: json.resumo || '' }
  } catch {
    return { resposta: text, estrategia: '', resumo: '' }
  }
}

export async function askDealOnca(userMessage, history = [], conversations = []) {
  const systemPrompt = buildSystemPrompt(conversations)

  const messages = [
    ...history.slice(-6).map(h => ({ role: h.from === 'user' ? 'user' : 'assistant', content: h.text })),
    { role: 'user', content: userMessage },
  ]

  const data = await groqRequest({
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    temperature: 0.4,
    max_tokens: 800,
  })
  return data.choices[0].message.content
}

// Detecta se cliente está pedindo para ver/enviar foto de um produto (pattern matching)
export function detectProductRequest(userMessage) {
  const msg = userMessage.toLowerCase()

  // Padrões que indicam pedido de foto/imagem
  const fotoPadroes = [
    /mand[ae].*foto|manda.*imagem|mostra.*foto|envia.*foto|qual.*foto|como é|tem.*foto|vê.*foto|quer.*foto|mostra como|foto d[oa]|imagem d[oa]/,
    /foto|imagem|mostra|como ficou|qual é|como é|se parece/
  ]

  const temFoto = fotoPadroes.some(p => p.test(msg))

  if (!temFoto) {
    return { temPedidoFoto: false, nomeProduto: null }
  }

  // Extrai o nome do produto (após "do", "da", "de", etc)
  const patterns = [
    /(?:do|da|de|manda foto\s+)(.{3,40}?)(?:\?|$|\.)/i,
    /foto\s+(?:do|da|de)?\s*(.{3,40}?)(?:\?|$|\.)/i,
    /(?:manda|mostra|envia)\s+(?:a\s+)?(?:foto\s+)?(?:do|da|de)?\s*(.{3,40}?)(?:\?|$|\.)/i,
  ]

  let nomeProduto = null
  for (const pattern of patterns) {
    const match = msg.match(pattern)
    if (match && match[1]) {
      nomeProduto = match[1].trim().slice(0, 50)
      break
    }
  }

  // Se não encontrou nome específico, tenta extrair palavras-chave
  if (!nomeProduto) {
    const keywords = msg.match(/(?:nike|new balance|armani|gucci|diesel|louis vitton|louis vuitton|cueca|tênis|tenis|camiseta|bermuda|bone|bné|calça|bermuda)/gi)
    if (keywords && keywords.length > 0) {
      nomeProduto = keywords.join(' ').slice(0, 50)
    }
  }

  return {
    temPedidoFoto: temFoto,
    nomeProduto: nomeProduto || null
  }
}
