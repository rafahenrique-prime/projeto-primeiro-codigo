// Diagnóstico em lote — roda 1x/dia via Vercel Cron (vercel.json)
// Substitui o clique manual em "Run Diagnosis" no Lab IA: varre as conversas
// recentes, classifica estágio de funil, gera relatório via Groq e avisa o CODEX.

import { logCodexAlert } from './_codexAlerts.js'

const GPTMAKER_TOKEN = process.env.VITE_GPTMAKER_TOKEN
const GPTMAKER_WS = process.env.VITE_GPTMAKER_WORKSPACE
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY
const GROQ_API_KEY = process.env.VITE_GROQ_API_KEY

const GPT_BASE = 'https://api.gptmaker.ai'
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'meta-llama/llama-4-scout-17b-16e-instruct']

const CHATS_TO_ANALYZE = 30

// ─── Classificador de funil — cópia fiel de detectFunnelStage em src/services/groq.js ───
// (duplicado de propósito: aquele arquivo só roda no browser, depende de import.meta.env)
function detectFunnelStage(msgs = [], lastMsg = '') {
  const text = (msgs.map(m => m.text || m.content || '').join(' ') + ' ' + lastMsg).toLowerCase()

  const stages = {
    QUENTE_FECHAR: (/manda o link|me passa o link|me manda o link|como fa[cç]o o pedido|como (fa[cç]o |eu )?compro|quero comprar|vou levar|vou querer|vou ficar com|quero (esse|esse a[ií]|levar|pedir|ficar)|fecha(r)?( comigo| negócio)?|finalizar|confirma|pode mandar|manda pra mim|como (eu )?pago|como (eu )?finalizo|onde compro|bora fechar|tô dentro|t[oó] dentro|aceita cart[aã]o|aceita d[eé]bito|aceita transfer|como adquiro|faz o pedido/.test(text) ? 1 : 0),
    DECISAO_OBJECAO: (/aceita pix|quanto fica o frete|tem parcel|desconto|[cç]upom|promo[cç]|mais barato|caro|vi mais barato|consegue (baixar|diminuir|melhorar)|faz um desconto|tem desconto|[aà] vista|no cart[aã]o|no d[eé]bito|boleto|transfer[eê]ncia|frete gr[aá]tis|entrega gr[aá]tis|sem frete|isenta o frete/.test(text) ? 1 : 0),
    CONSIDERACAO: (/tem tamanho|tem (o )?n[uú]mero|tem em estoque|tem na cor|tem (foto|fotos)|me manda (foto|fotos)|disponiv|chega quando|prazo|qual o (material|caimento|tamanho)|[eé] original|[eé] leg[ií]timo|[eé] import|vale a pena|[eé] bom|como fica|tem (PP|GG|XG|XL|grade)|tem garantia|entrega em quanto/.test(text) ? 1 : 0),
    CURIOSIDADE: (/quanto custa|qual o pre[cç]o|valor|quanto [eé]|quanto (t[aá]|fica)|o pre[cç]o|me mostra|tem o modelo|voc[eê]s (t[eê]m|vendem|trabalha)|trabalha com|tem (esse|esse modelo|esse t[eê]nis)|existe (esse|esse modelo)/.test(text) ? 1 : 0),
  }

  const found = Object.entries(stages).filter(([_, score]) => score > 0)
  if (found.length === 0) return 'INDEFINIDO'
  if (found.length === 1) return found[0][0]

  const priority = { QUENTE_FECHAR: 4, DECISAO_OBJECAO: 3, CONSIDERACAO: 2, CURIOSIDADE: 1 }
  return found.sort((a, b) => priority[b[0]] - priority[a[0]])[0][0]
}

// ─── Motor de Objeções — classifica por categoria via regex (sem custo extra de LLM) ───
const OBJECTION_PATTERNS = {
  preco: /\b(caro|salgado|desconto|cupom|promo[cç][aã]o|mais barato|n[aã]o tenho dinheiro|sem dinheiro|t[aá] puxado|t[aá] alto)\b/i,
  frete: /\b(frete|entrega gr[aá]tis|quanto fica o frete|demora muito|prazo de entrega|frete caro)\b/i,
  confianca: /\b([eé] confi[aá]vel|golpe|site seguro|loja de verdade|tem garantia|original mesmo|[eé] confianca)\b/i,
  estoque_tamanho: /\b(n[aã]o tem (meu )?tamanho|esgotado|fora de estoque|n[aã]o tem n[uú]mero|sem estoque)\b/i,
  pagamento: /\b(n[aã]o aceita pix|n[aã]o aceita cart[aã]o|n[aã]o tem parcelamento|s[oó] [aà] vista)\b/i,
  concorrencia: /\b(vi mais barato|outro site|concorrente|outra loja|achei mais barato)\b/i,
}

function classifyObjections(clientText) {
  const found = []
  for (const [category, pattern] of Object.entries(OBJECTION_PATTERNS)) {
    if (pattern.test(clientText)) found.push(category)
  }
  return found
}

async function groqRequest(body) {
  if (!GROQ_API_KEY) return null
  for (const model of MODELS) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 25000)
    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, model }),
        signal: controller.signal,
      })
      clearTimeout(timeout)
      if (res.ok) {
        const data = await res.json()
        if (data.choices?.length) return data
      }
    } catch {
      clearTimeout(timeout)
    }
  }
  return null
}

async function getRecentChats(pageSize) {
  if (!GPTMAKER_WS) return []
  try {
    const res = await fetch(`${GPT_BASE}/v2/workspace/${GPTMAKER_WS}/chats?page=1&pageSize=${pageSize}`, {
      headers: { 'Authorization': `Bearer ${GPTMAKER_TOKEN}` },
    })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : (data.data || [])
  } catch {
    return []
  }
}

async function getChatMessages(chatId) {
  try {
    const res = await fetch(`${GPT_BASE}/v2/chat/${chatId}/messages`, {
      headers: { 'Authorization': `Bearer ${GPTMAKER_TOKEN}` },
    })
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

async function saveObjections(rows) {
  if (!rows.length) return
  await fetch(`${SUPABASE_URL}/rest/v1/objections`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(rows),
  })
}

async function getObjectionRankingLast7Days() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/objections?select=category&created_at=gte.${since}`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
  )
  if (!res.ok) return []
  const rows = await res.json()
  const counts = {}
  for (const r of rows) counts[r.category] = (counts[r.category] || 0) + 1
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([category, count]) => ({ category, count }))
}

async function saveDiagnostic(report, stats) {
  await fetch(`${SUPABASE_URL}/rest/v1/diagnostics`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({
      report,
      hot_leads: stats.hot_leads || 0,
      no_reply: stats.no_reply || 0,
    }),
  })
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  if (!GPTMAKER_TOKEN || !GPTMAKER_WS || !SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ ok: false, error: 'Variáveis de ambiente faltando' })
  }

  try {
    const chats = await getRecentChats(CHATS_TO_ANALYZE)
    if (chats.length === 0) {
      return res.status(200).json({ ok: true, analyzed: 0, skipped: 'nenhuma conversa encontrada' })
    }

    const ctx = []
    const objectionRows = []
    for (const chat of chats) {
      const msgs = await getChatMessages(chat.id)
      if (!msgs.length) continue
      const lastClientMsg = [...msgs].reverse().find(m => m.role === 'user' || m.role === 'client')
      const lastMsgText = lastClientMsg?.text || lastClientMsg?.content || ''
      const stage = detectFunnelStage(msgs, lastMsgText)
      const lastFromAgent = [...msgs].reverse().find(m => m.role !== 'user' && m.role !== 'client')
      const naoLida = lastClientMsg && lastFromAgent
        ? new Date(lastClientMsg.createdAt || 0).getTime() > new Date(lastFromAgent.createdAt || 0).getTime()
        : !!lastClientMsg

      const clientText = msgs
        .filter(m => m.role === 'user' || m.role === 'client')
        .map(m => m.text || m.content || '')
        .join(' ')
      const objections = classifyObjections(clientText)
      for (const category of objections) {
        objectionRows.push({
          category,
          conversation_id: chat.id,
          channel: chat.channel || null,
          raw_excerpt: clientText.slice(0, 300),
        })
      }

      ctx.push({
        cliente: chat.name || chat.lead?.name || chat.id,
        chat_id: chat.id,
        estagio_funil: stage,
        nao_lida: naoLida,
        total_msgs: msgs.length,
        objections,
      })
    }

    await saveObjections(objectionRows)
    const ranking7d = await getObjectionRankingLast7Days()

    const quentes = ctx.filter(c => c.estagio_funil === 'QUENTE_FECHAR')
    const objecao = ctx.filter(c => c.estagio_funil === 'DECISAO_OBJECAO')
    const semResposta = ctx.filter(c => c.nao_lida)

    const prompt = `Você é o CODEX, supervisor de vendas da PRIME STORE. Analise o diagnóstico diário abaixo e seja direto e brutal:

Total de conversas analisadas: ${ctx.length}
🔥 QUENTE (prontos pra fechar): ${quentes.length} → ${quentes.slice(0, 5).map(c => c.cliente).join(', ') || 'nenhum'}
💸 OBJEÇÃO (preço/frete): ${objecao.length} → ${objecao.slice(0, 5).map(c => c.cliente).join(', ') || 'nenhum'}
📭 SEM RESPOSTA (cliente esperando): ${semResposta.length} → ${semResposta.slice(0, 5).map(c => c.cliente).join(', ') || 'nenhum'}
📊 RANKING DE OBJEÇÕES (últimos 7 dias): ${ranking7d.map(r => `${r.category}=${r.count}`).join(', ') || 'sem dados ainda'}

Monte um relatório curto (máx 200 palavras):
1. Maior risco de perda agora (nomeie clientes reais se houver)
2. Qual categoria de objeção está mais recorrente nos últimos 7 dias e o que isso sugere fazer
3. Uma ação concreta e imediata pro Rafael fazer agora
Emojis generosos, sem rodeios.`

    const data = await groqRequest({ messages: [{ role: 'user', content: prompt }], temperature: 0.5, max_tokens: 500 })
    const report = data?.choices?.[0]?.message?.content
      || `Diagnóstico automático: ${quentes.length} lead(s) quente(s), ${semResposta.length} sem resposta, ${objecao.length} com objeção ativa.`

    await saveDiagnostic(report, { hot_leads: quentes.length, no_reply: semResposta.length })

    await logCodexAlert({
      type: 'diagnostico_pronto',
      severity: semResposta.length > 0 || quentes.length > 0 ? 'atencao' : 'info',
      message: `Diagnóstico diário pronto: ${quentes.length} lead(s) quente(s), ${semResposta.length} sem resposta, ${objecao.length} em objeção.`,
      data: { hot_leads: quentes.length, no_reply: semResposta.length, objecao: objecao.length, analyzed: ctx.length },
    })

    const OBJECTION_RECURRING_THRESHOLD = 5
    const topObjection = ranking7d[0]
    if (topObjection && topObjection.count >= OBJECTION_RECURRING_THRESHOLD) {
      await logCodexAlert({
        type: 'objecao_recorrente',
        severity: 'atencao',
        message: `Objeção recorrente nos últimos 7 dias: "${topObjection.category}" apareceu ${topObjection.count}x. Pode valer revisar a base de conhecimento ou a estratégia de venda pra isso.`,
        data: { ranking: ranking7d },
      })
    }

    return res.status(200).json({
      ok: true,
      analyzed: ctx.length,
      hot_leads: quentes.length,
      no_reply: semResposta.length,
      objecao: objecao.length,
      objection_ranking_7d: ranking7d,
    })
  } catch (err) {
    console.error('[cron-diagnosis] Erro:', err.message)
    return res.status(500).json({ ok: false, error: err.message })
  }
}
