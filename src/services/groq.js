const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

const MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it']

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
  const quentes = ctx.filter(c => c.estagio_funil === 'QUENTE_FECHAR')
  const semResposta = ctx.filter(c => c.nao_lidas > 0)

  // Prioriza: não lidas + quentes primeiro, depois recentes, limite 12 conversas
  const priority = [
    ...ctx.filter(c => c.nao_lidas > 0 || c.estagio_funil === 'QUENTE_FECHAR'),
    ...ctx.filter(c => c.nao_lidas === 0 && c.estagio_funil !== 'QUENTE_FECHAR'),
  ].slice(0, 12)

  return `Você é o Deal Claude, Diretor Comercial IA da PRIME STORE (roupas e tênis premium).

RESUMO: ${ctx.length} conversas | ${quentes.length} quentes | ${semResposta.length} sem resposta

ESTÁGIOS: QUENTE_FECHAR=pronto pra fechar | DECISAO_OBJECAO=objeção preço/frete | CONSIDERACAO=dúvida produto | CURIOSIDADE=explorando | INDEFINIDO=sem dados

CONVERSAS (${priority.length} mais relevantes):
${JSON.stringify(priority)}

REGRAS: português BR | direto | cite nomes reais | markdown simples | máx 300 palavras`
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
