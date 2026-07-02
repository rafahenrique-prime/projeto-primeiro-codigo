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

// ─── Inteligência Comercial — visão semanal agregada (roda só 1x/semana) ───
// O diagnóstico diário só enxerga o dia. Isso compara esta semana com a anterior pra
// responder "como estamos essa semana?" com dado real: objeção subindo, follow-up
// piorando, produto sem foto sendo pedido. Injetado no prompt do CODEX depois.
function getISOWeekStart(d = new Date()) {
  const date = new Date(d)
  const day = date.getUTCDay() || 7 // domingo=0 -> 7
  date.setUTCDate(date.getUTCDate() - day + 1) // segunda-feira
  date.setUTCHours(0, 0, 0, 0)
  return date.toISOString().split('T')[0]
}

async function weeklyInsightExists(weekStart) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/weekly_insights?week_start=eq.${weekStart}&select=id&limit=1`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
  })
  if (!res.ok) return false
  const data = await res.json()
  return data.length > 0
}

async function getObjectionCountsBetween(startIso, endIso) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/objections?select=category&created_at=gte.${startIso}&created_at=lt.${endIso}`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
  )
  if (!res.ok) return {}
  const rows = await res.json()
  const counts = {}
  for (const r of rows) counts[r.category] = (counts[r.category] || 0) + 1
  return counts
}

function buildTrend(thisWeekCounts, lastWeekCounts) {
  const categories = new Set([...Object.keys(thisWeekCounts), ...Object.keys(lastWeekCounts)])
  return [...categories].map(category => {
    const thisWeek = thisWeekCounts[category] || 0
    const lastWeek = lastWeekCounts[category] || 0
    const pctChange = lastWeek === 0 ? (thisWeek > 0 ? 100 : 0) : Math.round(((thisWeek - lastWeek) / lastWeek) * 100)
    return { category, thisWeek, lastWeek, pctChange }
  }).sort((a, b) => b.thisWeek - a.thisWeek)
}

async function getNoReplyTrend() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/diagnostics?select=no_reply,created_at&order=created_at.desc&limit=14`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
  })
  if (!res.ok) return null
  const rows = await res.json()
  if (rows.length < 2) return null
  const half = Math.ceil(rows.length / 2)
  const thisWeek = rows.slice(0, half)
  const lastWeek = rows.slice(half)
  const avg = arr => arr.length ? Math.round((arr.reduce((s, r) => s + (r.no_reply || 0), 0) / arr.length) * 10) / 10 : 0
  return { thisWeekAvg: avg(thisWeek), lastWeekAvg: avg(lastWeek) }
}

async function getProductsWithoutPhoto() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/products?select=id&or=(imagem.is.null,imagem.eq.)`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'count=exact' },
  })
  const total = parseInt(res.headers.get('content-range')?.split('/')[1] || '0')
  return total
}

async function generateWeeklySummary({ objectionTrend, noReplyTrend, productsWithoutPhoto }) {
  const topMovers = objectionTrend.filter(o => Math.abs(o.pctChange) >= 20).slice(0, 4)
  const prompt = `Resuma a semana comercial da PRIME STORE em 1 parágrafo curto e direto (máx 60 palavras), sem enrolação:

Objeções (esta semana vs anterior): ${topMovers.map(o => `${o.category} ${o.thisWeek}x (${o.pctChange >= 0 ? '+' : ''}${o.pctChange}%)`).join(', ') || 'sem mudança relevante'}
Sem resposta (média/dia): esta semana ${noReplyTrend?.thisWeekAvg ?? '?'} vs anterior ${noReplyTrend?.lastWeekAvg ?? '?'}
Produtos sem foto no catálogo: ${productsWithoutPhoto}

Aponte só o que mudou de verdade e uma ação prática.`

  const data = await groqRequest({ messages: [{ role: 'user', content: prompt }], temperature: 0.4, max_tokens: 150 })
  return data?.choices?.[0]?.message?.content || null
}

async function saveWeeklyInsight(row) {
  await fetch(`${SUPABASE_URL}/rest/v1/weekly_insights`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(row),
  })
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

// ─── Supervisor Comercial — audita a última resposta da Gabriela por conversa ───
// Rubrica fixa (0-10): respondeu a pergunta? tentou avançar a venda? não inventou dado
// fora de contexto? tom adequado? Cap de candidatos por rodada pra controlar custo/tempo.
const AUDIT_CAP = 15

async function auditAgentResponse({ clientMsg, agentMsg }) {
  const prompt = `Avalie esta resposta de uma vendedora IA (Gabriela) da PRIME STORE segundo a rubrica:
1. Respondeu diretamente à pergunta do cliente?
2. Tentou avançar a venda (ofereceu próximo passo, não deixou a conversa parada)?
3. Não inventou preço/estoque/prazo sem confirmação?
4. Tom adequado (natural, não robótico, não deselegante)?

CLIENTE: "${clientMsg}"
GABRIELA: "${agentMsg}"

Responda APENAS com JSON válido, sem texto antes ou depois:
{"score": 0-10, "issue": "falha principal em poucas palavras ou null se não houver", "strength": "ponto forte em poucas palavras ou null"}`

  const data = await groqRequest({ messages: [{ role: 'user', content: prompt }], temperature: 0.2, max_tokens: 150 })
  const raw = data?.choices?.[0]?.message?.content || ''
  try {
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}')
    if (typeof json.score !== 'number') return null
    return { score: Math.max(0, Math.min(10, Math.round(json.score))), issue: json.issue || null, strength: json.strength || null }
  } catch {
    return null
  }
}

async function saveAudits(rows) {
  if (!rows.length) return
  await fetch(`${SUPABASE_URL}/rest/v1/agent_audits`, {
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

// ─── Score Híbrido — refina à noite o buy_score calculado por regex em tempo real ───
// O regex (calcBuyScore) é rápido e roda a cada mensagem, mas só reconhece frases
// decoradas — erra em ironia, educação sem intenção real, ou intenção sem palavra-chave.
// 1x/dia a IA relê a conversa e corrige o score só quando a diferença é grande (evita
// custo e "achatismo": pequenas divergências de opinião não valem reescrever o dado).
const SCORE_REFINE_CAP = 20
const SCORE_DIFF_THRESHOLD = 25

async function refineScore({ clientText, stage, regexScore }) {
  const prompt = `Um sistema de palavras-chave deu nota ${regexScore}/100 de intenção de COMPRA (não de simpatia,
não de bom humor, não de engajamento) pra este cliente (estágio: ${stage}).

REGRA DE OURO: tom simpático, brincadeira, educação ou resposta curta NÃO é intenção de compra.
Só suba a nota se houver sinal CONCRETO de que o cliente quer fechar pedido agora ou está avaliando
seriamente comprar (pedir preço/pix/link/parcelamento/tamanho pra fechar, dizer que vai levar, etc).
Na dúvida, mantenha a nota baixa — é melhor perder um lead morno do que gerar alerta falso.

ÂNCORAS (use como referência):
0-20: sem interesse, off-topic, brincadeira, spam, só "oi"
20-40: curiosidade vaga ("quanto custa", "tem esse modelo")
40-60: considerando, mas sem confirmar (perguntou detalhe, sumiu)
60-80: objeção ativa que pode fechar se resolvida (preço, frete) OU pediu confirmação de estoque/tamanho pra decidir
80-100: pediu link/PIX/forma de pagamento, confirmou que vai levar, ou perguntou "como faço o pedido"

MENSAGENS DO CLIENTE: "${clientText.slice(0, 600)}"

Responda APENAS com JSON válido, sem texto antes ou depois. "evidence" deve ser uma citação literal
das mensagens do cliente que comprova a nota, ou null se a nota for baixa por falta de sinal:
{"score": 0-100, "reasoning": "motivo em poucas palavras", "evidence": "citação literal ou null"}`

  const data = await groqRequest({ messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 150 })
  const raw = data?.choices?.[0]?.message?.content || ''
  try {
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}')
    if (typeof json.score !== 'number') return null
    const score = Math.max(0, Math.min(100, Math.round(json.score)))
    const evidence = (json.evidence || '').trim()
    // Trava de segurança: nota alta sem citação literal do cliente no texto = modelo "chutando".
    // Descarta em vez de arriscar inflar o score (evita alertas falsos de lead quente).
    if (score >= 60 && (!evidence || !clientText.toLowerCase().includes(evidence.toLowerCase().slice(0, 30)))) return null
    return { score, reasoning: json.reasoning || null }
  } catch {
    return null
  }
}

async function getCustomerProfile(convId) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/customer_profiles?conv_id=eq.${encodeURIComponent(convId)}&limit=1`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data[0] || null
  } catch {
    return null
  }
}

async function patchCustomerScore(convId, score) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/customer_profiles?conv_id=eq.${encodeURIComponent(convId)}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ buy_score: score }),
  })
  return res.ok
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
    const auditCandidates = []
    for (const chat of chats) {
      const msgs = await getChatMessages(chat.id)
      if (!msgs.length) continue
      const lastClientMsg = [...msgs].reverse().find(m => m.role === 'user' || m.role === 'client')
      const lastMsgText = lastClientMsg?.text || lastClientMsg?.content || ''
      const stage = detectFunnelStage(msgs, lastMsgText)
      const lastFromAgent = [...msgs].reverse().find(m => m.role !== 'user' && m.role !== 'client')
      // Pra auditoria: só resposta de texto real da assistente (pula system/notification
      // e mensagens de mídia sem legenda, que ficariam com "Gabriela: " vazio)
      const lastAgentTextMsg = [...msgs].reverse().find(m => m.role === 'assistant' && (m.text || m.content || '').trim())
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

      // Candidato à auditoria: só quando o agente já respondeu com texto real (troca de verdade, não silêncio/mídia)
      if (lastAgentTextMsg && lastClientMsg) {
        auditCandidates.push({
          chat_id: chat.id,
          cliente: chat.name || chat.lead?.name || chat.id,
          channel: chat.channel || null,
          clientMsg: lastMsgText.slice(0, 500),
          agentMsg: (lastAgentTextMsg.text || lastAgentTextMsg.content || '').slice(0, 500),
        })
      }

      ctx.push({
        cliente: chat.name || chat.lead?.name || chat.id,
        chat_id: chat.id,
        estagio_funil: stage,
        nao_lida: naoLida,
        total_msgs: msgs.length,
        objections,
        clientText,
      })
    }

    await saveObjections(objectionRows)
    const ranking7d = await getObjectionRankingLast7Days()

    // Score Híbrido: relê até SCORE_REFINE_CAP conversas com texto real do cliente e
    // corrige o buy_score (calculado por regex em tempo real) quando a IA discordar muito
    const scoreCandidates = ctx.filter(c => c.clientText && c.clientText.trim().length > 10).slice(0, SCORE_REFINE_CAP)
    const scoreCorrections = []
    for (const cand of scoreCandidates) {
      const profile = await getCustomerProfile(cand.chat_id)
      if (!profile || typeof profile.buy_score !== 'number') continue
      const refined = await refineScore({ clientText: cand.clientText, stage: cand.estagio_funil, regexScore: profile.buy_score })
      if (!refined) continue
      const diff = refined.score - profile.buy_score
      if (Math.abs(diff) < SCORE_DIFF_THRESHOLD) continue
      const patched = await patchCustomerScore(cand.chat_id, refined.score)
      if (!patched) continue
      scoreCorrections.push({ cliente: cand.cliente, from: profile.buy_score, to: refined.score, reasoning: refined.reasoning })
    }

    const upgradedLeads = scoreCorrections.filter(c => c.to - c.from >= SCORE_DIFF_THRESHOLD && c.to >= 70)
    if (upgradedLeads.length > 0) {
      await logCodexAlert({
        type: 'score_corrigido',
        severity: 'atencao',
        message: `Score corrigido pela IA: ${upgradedLeads.map(l => `${l.cliente} (${l.from}→${l.to})`).join(', ')}. O robô de palavras-chave estava subestimando esses leads.`,
        data: { corrections: upgradedLeads },
      })
    }

    // Supervisor Comercial: audita até AUDIT_CAP conversas com troca real (sequencial, controla custo)
    const auditRows = []
    for (const cand of auditCandidates.slice(0, AUDIT_CAP)) {
      const result = await auditAgentResponse(cand)
      if (!result) continue
      auditRows.push({
        conversation_id: cand.chat_id,
        client_name: cand.cliente,
        channel: cand.channel,
        score: result.score,
        issue: result.issue,
        strength: result.strength,
        excerpt: `Cliente: ${cand.clientMsg.slice(0, 150)} | Gabriela: ${cand.agentMsg.slice(0, 150)}`,
      })
    }
    await saveAudits(auditRows)
    const avgScore = auditRows.length ? Math.round((auditRows.reduce((s, r) => s + r.score, 0) / auditRows.length) * 10) / 10 : null
    const lowScoreRows = auditRows.filter(r => r.score <= 4)

    if (avgScore !== null && avgScore < 6) {
      await logCodexAlert({
        type: 'auditoria_baixa',
        severity: 'atencao',
        message: `Nota média da Gabriela hoje: ${avgScore}/10 (${lowScoreRows.length} resposta(s) fraca(s) de ${auditRows.length} avaliadas). Vale revisar o comportamento do agente.`,
        data: { avgScore, lowScoreCount: lowScoreRows.length, total: auditRows.length },
      })
    }

    // Inteligência Comercial: roda só 1x/semana (checa se já existe insight pra semana atual)
    const weekStart = getISOWeekStart()
    let weeklyInsight = null
    if (!(await weeklyInsightExists(weekStart))) {
      const now = new Date()
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
      const [thisWeekObj, lastWeekObj, noReplyTrend, productsWithoutPhoto] = await Promise.all([
        getObjectionCountsBetween(weekAgo.toISOString(), now.toISOString()),
        getObjectionCountsBetween(twoWeeksAgo.toISOString(), weekAgo.toISOString()),
        getNoReplyTrend(),
        getProductsWithoutPhoto(),
      ])
      const objectionTrend = buildTrend(thisWeekObj, lastWeekObj)
      const summary = await generateWeeklySummary({ objectionTrend, noReplyTrend, productsWithoutPhoto })
      weeklyInsight = { week_start: weekStart, objection_trend: objectionTrend, no_reply_trend: noReplyTrend, products_without_photo: productsWithoutPhoto, summary }
      await saveWeeklyInsight(weeklyInsight)
      if (summary) {
        await logCodexAlert({
          type: 'insight_semanal',
          severity: 'info',
          message: `📊 Resumo da semana: ${summary}`,
          data: weeklyInsight,
        })
      }
    }

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
      agent_audits: { count: auditRows.length, avg_score: avgScore, low_score: lowScoreRows.length },
      score_hybrid: { checked: scoreCandidates.length, corrected: scoreCorrections.length, corrections: scoreCorrections },
      weekly_insight: weeklyInsight,
    })
  } catch (err) {
    console.error('[cron-diagnosis] Erro:', err.message)
    return res.status(500).json({ ok: false, error: err.message })
  }
}
