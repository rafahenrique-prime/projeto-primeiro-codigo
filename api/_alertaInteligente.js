// api/_alertaInteligente.js
//
// Helper privado (prefixo "_" — mesmo padrão de _toolConsultarProduto.js/
// _consultarCep.js: nunca vira Function pública própria, nunca `export
// default`). Implementa a lógica do Alerta Inteligente de handoff humano,
// consumida por api/system-tools.js via ?tool=alerta-inteligente.
//
// Migrado de api/alerta-inteligente.js (arquivo-rota independente) porque o
// Vercel Hobby limita a 12 Serverless Functions — como arquivo-rota próprio,
// este era o 13º e o deploy foi rejeitado. Nenhuma lógica mudou nesta
// migração, só onde ela roda (mesmo padrão já usado por qwen-health, ver
// comentário no topo de system-tools.js). Ainda NÃO ligado à intention
// "Alerta rafael" do GPT Maker; ver docs/backups/ + CLAUDE.md § GPT Maker
// antes de qualquer troca de URL na intention.
//
// Objetivo: dado um `telefone` (whatsappPhone) do cliente, localizar o chat
// real na API do GPT Maker, buscar o histórico de mensagens, gerar um resumo
// factual estruturado via Groq e enviar UMA mensagem enriquecida ao Telegram.
// Se qualquer etapa de resumo falhar, cai no alerta simples já existente hoje
// ("⚠️ RAFAEL, CLIENTE AGUARDANDO SEM RESPOSTA!") — o handoff nunca fica sem
// alerta. Falha do próprio envio ao Telegram é tratada como entrega NÃO
// concluída (distinta do fallback de resumo) e nunca é registrada como
// sucesso na deduplicação.
//
// ===== `contextId` NÃO é `chatId` (confirmado pelo GPT Maker) =====
// O `chat.id` real só existe na resposta de `GET /v2/workspace/{ws}/chats` —
// nunca é derivado do `contextId` recebido no request. `contextId`, quando
// presente, é usado só como metadado auxiliar (log), nunca como identificador
// de busca de mensagens.
//
// ===== Segurança =====
// Nunca logar: ALERTA_INTELIGENTE_SECRET, token do Telegram, token do GPT
// Maker, chave do Groq, query string completa, URL completa contendo secret,
// headers de Authorization, ou o payload bruto do request. Logs só com campos
// sanitizados (status, motivo, chatId, dedupKey).
//
// ===== Padrão de testabilidade =====
// Mesmo padrão de `api/_toolConsultarProduto.js`: toda função de I/O recebe
// `deps` (fetchImpl injetável, credenciais explícitas) em vez de ler
// `process.env`/`fetch` global diretamente — os testes nunca tocam rede real.
// A entrada única `processarAlertaInteligente(params, deps)` é chamada pelo
// `case 'alerta-inteligente'` de api/system-tools.js, que monta `deps` a
// partir das constantes de env já declaradas ali (mesmo padrão de
// `consultarProduto`/`case 'consultar-produto'`).

import crypto from 'crypto'

const GPT_BASE = 'https://api.gptmaker.ai'
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'meta-llama/llama-4-scout-17b-16e-instruct']
const GROQ_TIMEOUT_MS = 25000

const CHATS_PAGE_SIZE = 50
const CHATS_MAX_PAGES = 5 // limite de páginas ao listar chats do workspace — ver "Limitações conhecidas" no plano
const MAX_MESSAGES_FOR_SUMMARY = 40

const CLIENT_ROLES = ['user', 'client', 'human', 'customer']

export const FALLBACK_MESSAGE = '⚠️ RAFAEL, CLIENTE AGUARDANDO SEM RESPOSTA!'

const SUMMARY_FIELDS = ['motivo_transferencia', 'produto_mencionado', 'tamanho_mencionado', 'ultima_pergunta_cliente']

// ─── Secret (mesmo padrão de comparação em tempo constante de system-tools.js —
// duplicado aqui de propósito para não alterar arquivos existentes nesta etapa) ───
export function compararSegredoSeguro(fornecido, esperado) {
  if (typeof fornecido !== 'string' || typeof esperado !== 'string' || esperado.length === 0) return false
  const bufferFornecido = Buffer.from(fornecido)
  const bufferEsperado = Buffer.from(esperado)
  if (bufferFornecido.length !== bufferEsperado.length) return false
  return crypto.timingSafeEqual(bufferFornecido, bufferEsperado)
}

// ─── Telefone — normalização e comparação seguras (nunca inventa DDI) ───
export function normalizePhoneDigits(phone) {
  return String(phone ?? '').replace(/\D/g, '')
}

// Compara dois telefones já normalizados (só dígitos). Aceita a variante
// com/sem prefixo "55" apenas quando a correspondência é inequívoca (mesmo
// restante de dígitos) — nunca infere DDI que não veio no dado original.
export function phonesEquivalent(a, b) {
  if (!a || !b) return false
  if (a === b) return true
  if (a.startsWith('55') && a.slice(2) === b) return true
  if (b.startsWith('55') && b.slice(2) === a) return true
  return false
}

// Localiza o chat cujo whatsappPhone é equivalente ao telefone informado.
// Correspondência ambígua (mais de 1 candidato) NUNCA escolhe arbitrariamente
// — retorna ambiguous:true e deixa o chamador cair no fallback.
//
// `agentId` (opcional, 3º parâmetro): quando informado, telefone + agentId
// passam a formar uma identificação CONJUNTA — o candidato só é aceito se,
// depois de filtrar por telefone E por chat.agentId === agentId, sobrar
// EXATAMENTE 1 chat. Isso vale mesmo que o telefone sozinho já tivesse
// encontrado 1 único chat: se o agentId desse chat não bater com o agentId
// recebido, o resultado é rejeitado (não é "aceitar porque o telefone achou
// 1", é "aceitar porque telefone+agente juntos apontam pra 1 só"). Sem
// `agentId`, o comportamento é idêntico ao da V1 (telefone sozinho decide).
//
// Nunca escolhe por `time`/mais recente, por `agentName`, nem por
// `candidatos[0]` em caso de ambiguidade — em qualquer cenário que não feche
// em exatamente 1 candidato, o retorno é `chat: null` e quem decidiu foi a
// ausência de dado suficiente, nunca uma escolha arbitrária.
export function findChatByPhone(chats, telefoneNormalizado, agentId) {
  if (!telefoneNormalizado) {
    return { chat: null, ambiguous: false, candidatosTelefone: 0, candidatosAposAgentId: null }
  }

  const candidatosTelefone = (Array.isArray(chats) ? chats : []).filter((c) =>
    phonesEquivalent(normalizePhoneDigits(c?.whatsappPhone), telefoneNormalizado)
  )

  if (!agentId) {
    if (candidatosTelefone.length === 1) {
      return { chat: candidatosTelefone[0], ambiguous: false, candidatosTelefone: 1, candidatosAposAgentId: null }
    }
    return {
      chat: null,
      ambiguous: candidatosTelefone.length > 1,
      candidatosTelefone: candidatosTelefone.length,
      candidatosAposAgentId: null,
    }
  }

  const candidatosAposAgentId = candidatosTelefone.filter((c) => c?.agentId === agentId)
  if (candidatosAposAgentId.length === 1) {
    return {
      chat: candidatosAposAgentId[0],
      ambiguous: false,
      candidatosTelefone: candidatosTelefone.length,
      candidatosAposAgentId: 1,
    }
  }
  return {
    chat: null,
    ambiguous: candidatosAposAgentId.length > 1,
    candidatosTelefone: candidatosTelefone.length,
    candidatosAposAgentId: candidatosAposAgentId.length,
  }
}

// ─── GPT Maker — listagem paginada de chats + histórico de mensagens ───
export async function listAllChats(deps, { maxPages = CHATS_MAX_PAGES, pageSize = CHATS_PAGE_SIZE } = {}) {
  const fetchImpl = deps?.fetchImpl ?? fetch
  if (!deps?.workspace) return []
  let allChats = []
  for (let page = 1; page <= maxPages; page++) {
    try {
      const res = await fetchImpl(`${GPT_BASE}/v2/workspace/${deps.workspace}/chats?page=${page}&pageSize=${pageSize}`, {
        headers: { Authorization: `Bearer ${deps.gptmakerToken}` },
      })
      if (!res.ok) break
      const data = await res.json()
      const chats = Array.isArray(data) ? data : (data.data || [])
      if (chats.length === 0) break
      allChats = allChats.concat(chats)
      if (chats.length < pageSize) break // última página
    } catch {
      break
    }
  }
  return allChats
}

// chatId aqui é SEMPRE o chat.id real vindo de listAllChats — nunca o contextId do request.
export async function getChatMessages(chatId, deps) {
  const fetchImpl = deps?.fetchImpl ?? fetch
  try {
    const res = await fetchImpl(`${GPT_BASE}/v2/chat/${chatId}/messages`, {
      headers: { Authorization: `Bearer ${deps?.gptmakerToken}` },
    })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

// ─── Groq — resumo estruturado, só fatos presentes no histórico ───
async function groqRequest(deps, body) {
  const apiKey = deps?.groqApiKey
  if (!apiKey) return null
  const fetchImpl = deps?.fetchImpl ?? fetch
  for (const model of GROQ_MODELS) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS)
    try {
      const res = await fetchImpl(GROQ_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, model }),
        signal: controller.signal,
      })
      clearTimeout(timeout)
      if (res.ok) {
        const data = await res.json()
        if (data?.choices?.length) return data
      }
    } catch {
      clearTimeout(timeout)
    }
  }
  return null
}

export function buildSummaryPrompt(messagesText) {
  return `Você vai analisar um trecho de conversa entre um cliente e a assistente virtual de uma loja (PRIME STORE). Responda ESTRITAMENTE com um JSON válido, sem nenhum texto antes ou depois, exatamente neste formato:

{"motivo_transferencia": null, "produto_mencionado": null, "tamanho_mencionado": null, "ultima_pergunta_cliente": null, "resumo_breve": ""}

REGRAS OBRIGATÓRIAS:
- Use SOMENTE fatos que estão literalmente presentes na conversa abaixo.
- NUNCA invente ou infira produto, estoque, preço, tamanho, cor, disponibilidade, motivo ou pedido do cliente.
- Se um campo não estiver claramente presente na conversa, retorne null para ele.
- "resumo_breve" tem no máximo 2 frases curtas, só com fatos observados (pode ser "" se não houver nada relevante).

Conversa:
${messagesText}`
}

function sanitizeSummaryField(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

// Parser tolerante e restrito: só aceita um objeto plano; qualquer coisa fora
// do esperado (JSON inválido, array, string solta) retorna null — isso força
// o chamador a cair no fallback simples em vez de mandar um resumo malformado.
export function parseSummaryJson(raw) {
  if (typeof raw !== 'string') return null
  const cleaned = raw.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim()
  let parsed
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null

  const resultado = { resumo_breve: typeof parsed.resumo_breve === 'string' ? parsed.resumo_breve.trim() : '' }
  for (const campo of SUMMARY_FIELDS) {
    resultado[campo] = sanitizeSummaryField(parsed[campo])
  }
  return resultado
}

function isClientMessage(m) {
  return CLIENT_ROLES.includes(m?.role)
}

export async function generateStructuredSummary(messages, deps) {
  if (!Array.isArray(messages) || messages.length === 0) return null

  const recorte = messages.slice(-MAX_MESSAGES_FOR_SUMMARY)
  const messagesText = recorte
    .map((m) => {
      const quem = isClientMessage(m) ? 'Cliente' : 'Atendente'
      const texto = (m?.text || m?.content || m?.message || '').toString().trim()
      return texto ? `${quem}: ${texto}` : null
    })
    .filter(Boolean)
    .join('\n')

  if (!messagesText) return null

  const prompt = buildSummaryPrompt(messagesText)
  const data = await groqRequest(deps, { messages: [{ role: 'user', content: prompt }], temperature: 0.2, max_tokens: 400 })
  const raw = data?.choices?.[0]?.message?.content
  return parseSummaryJson(raw)
}

// ─── Mensagem final ───
export function buildEnrichedMessage(summary, telefoneNormalizado) {
  const linhas = ['⚠️ <b>RAFAEL, CLIENTE PRECISA DE ATENDIMENTO</b>', '']
  if (telefoneNormalizado) linhas.push(`👤 Cliente: ${telefoneNormalizado}`)
  if (summary.produto_mencionado) linhas.push(`🛍️ Interesse: ${summary.produto_mencionado}`)
  if (summary.tamanho_mencionado) linhas.push(`📏 Tamanho: ${summary.tamanho_mencionado}`)
  if (summary.resumo_breve) linhas.push('', '📝 Resumo:', summary.resumo_breve)
  if (summary.motivo_transferencia) linhas.push('', '🎯 Pendência:', summary.motivo_transferencia)
  if (summary.ultima_pergunta_cliente) linhas.push('', '💬 Última mensagem:', summary.ultima_pergunta_cliente)
  return linhas.join('\n')
}

// ─── Telegram — nunca loga token/URL completa, só status/motivo sanitizados ───
export async function sendTelegram(texto, deps) {
  const fetchImpl = deps?.fetchImpl ?? fetch
  if (!deps?.telegramBotToken || !deps?.telegramChatId) {
    return { ok: false, reason: 'not_configured' }
  }
  try {
    const res = await fetchImpl(`https://api.telegram.org/bot${deps.telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: deps.telegramChatId, text: texto, parse_mode: 'HTML' }),
    })
    if (!res.ok) return { ok: false, reason: 'telegram_error', status: res.status }
    return { ok: true }
  } catch {
    return { ok: false, reason: 'network_error' }
  }
}

// ─── Deduplicação — chave = chat.id + identificador/timestamp da ÚLTIMA
// mensagem relevante do cliente (não só chat.id). Isso bloqueia repetir a
// MESMA situação sem impedir um novo handoff legítimo do mesmo cliente depois
// de uma nova mensagem. Reaproveita a tabela codex_alerts já existente
// (mesmo padrão de jaAlertadoRecenteStuck/registrarAlertaStuck em
// system-tools.js), só com type/conversation_id próprios — nenhuma tabela
// nova, nenhum arquivo existente alterado. ───
const DEDUP_ALERT_TYPE = 'handoff_inteligente'

export function buildDedupKey(chat, messages) {
  const clientMsgs = (Array.isArray(messages) ? messages : []).filter(isClientMessage)
  const last = clientMsgs[clientMsgs.length - 1]
  const identificador = last?.id ?? last?.messageId ?? last?.time ?? last?.createdAt ?? null
  return `${chat.id}:${identificador ?? 'sem-identificador'}`
}

export async function jaProcessadoDedup(dedupKey, deps) {
  const fetchImpl = deps?.fetchImpl ?? fetch
  if (!deps?.supabaseUrl || !deps?.supabaseKey) return false
  try {
    const res = await fetchImpl(
      `${deps.supabaseUrl}/rest/v1/codex_alerts?type=eq.${DEDUP_ALERT_TYPE}&conversation_id=eq.${encodeURIComponent(dedupKey)}&select=id&limit=1`,
      { headers: { apikey: deps.supabaseKey, Authorization: `Bearer ${deps.supabaseKey}` } }
    )
    if (!res.ok) return false
    const data = await res.json()
    return Array.isArray(data) && data.length > 0
  } catch {
    return false
  }
}

// Só deve ser chamada DEPOIS de confirmar sucesso no envio ao Telegram — a
// orquestração abaixo (processarAlertaInteligente) garante essa ordem.
export async function registrarDedup(dedupKey, mensagem, deps) {
  const fetchImpl = deps?.fetchImpl ?? fetch
  if (!deps?.supabaseUrl || !deps?.supabaseKey) return
  try {
    await fetchImpl(`${deps.supabaseUrl}/rest/v1/codex_alerts`, {
      method: 'POST',
      headers: {
        apikey: deps.supabaseKey,
        Authorization: `Bearer ${deps.supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ type: DEDUP_ALERT_TYPE, severity: 'critico', conversation_id: dedupKey, message: mensagem, data: null }),
    })
  } catch {
    // best-effort — falha aqui não deve derrubar a resposta já dada ao GPT Maker
  }
}

// ─── Orquestração principal (pura o suficiente para teste: só depende de `deps`) ───
async function enviarFallback(deps, meta) {
  // Log sanitizado — nunca contextId/agentId/telefone brutos, só motivo,
  // chatId (quando existir) e os contadores/booleano usados pra diagnosticar
  // desambiguação sem expor nenhum dado de identificação do cliente/agente.
  const logMeta = {
    motivo: meta.motivo,
    chatId: meta.chatId || null,
    agentIdPresente: meta.agentIdPresente ?? false,
    candidatosTelefone: meta.candidatosTelefone ?? null,
    candidatosAposAgentId: meta.candidatosAposAgentId ?? null,
  }

  const envio = await sendTelegram(FALLBACK_MESSAGE, deps)
  if (!envio.ok) {
    console.error('[alerta-inteligente] Falha ao enviar fallback via Telegram', { reason: envio.reason, status: envio.status, ...logMeta })
    return { status: 'telegram_failed', modo: 'fallback_simples', ...meta }
  }
  console.log('[alerta-inteligente] Fallback simples enviado', logMeta)
  return { status: 'sent', modo: 'fallback_simples', ...meta }
}

export async function processarAlertaInteligente(params, deps) {
  const secretFornecido = typeof params?.secret === 'string' ? params.secret : null
  if (!compararSegredoSeguro(secretFornecido, deps?.expectedSecret)) {
    return { status: 'unauthorized' }
  }

  const contextId = typeof params?.contextId === 'string' ? params.contextId : null // só metadado auxiliar/log — NUNCA usado como chatId
  const agentId = typeof params?.agentId === 'string' && params.agentId.trim().length > 0 ? params.agentId : null
  const telefoneNormalizado = normalizePhoneDigits(params?.telefone)

  if (!telefoneNormalizado) {
    return enviarFallback(deps, { motivo: 'telefone_ausente', contextId })
  }

  const chats = await listAllChats(deps)
  const { chat, ambiguous, candidatosTelefone, candidatosAposAgentId } = findChatByPhone(chats, telefoneNormalizado, agentId)

  if (!chat) {
    // agentId informado: telefone+agente juntos não fecharam em exatamente 1 —
    // motivo distingue "telefone não achou nada" de "achou, mas agente não confere"
    // de "ainda ambíguo mesmo depois de filtrar por agente" (sanitizado — nunca
    // loga o valor de agentId/telefone, só contadores e booleanos).
    let motivo
    if (candidatosTelefone === 0) {
      motivo = 'chat_nao_encontrado'
    } else if (agentId) {
      motivo = candidatosAposAgentId === 0 ? 'agente_nao_confere' : 'telefone_ambiguo'
    } else {
      motivo = ambiguous ? 'telefone_ambiguo' : 'chat_nao_encontrado'
    }
    return enviarFallback(deps, {
      motivo,
      contextId,
      agentIdPresente: Boolean(agentId),
      candidatosTelefone,
      candidatosAposAgentId,
    })
  }

  const messages = await getChatMessages(chat.id, deps)
  if (!Array.isArray(messages) || messages.length === 0) {
    return enviarFallback(deps, { motivo: 'sem_mensagens', chatId: chat.id, contextId })
  }

  const dedupKey = buildDedupKey(chat, messages)
  const jaProcessado = await jaProcessadoDedup(dedupKey, deps)
  if (jaProcessado) {
    console.log('[alerta-inteligente] Situação já alertada — dedup', { chatId: chat.id })
    return { status: 'dedup_skip', chatId: chat.id, dedupKey }
  }

  const summary = await generateStructuredSummary(messages, deps)
  const modo = summary ? 'inteligente' : 'fallback_resumo'
  const mensagemFinal = summary ? buildEnrichedMessage(summary, telefoneNormalizado) : FALLBACK_MESSAGE

  const envio = await sendTelegram(mensagemFinal, deps)
  if (!envio.ok) {
    console.error('[alerta-inteligente] Falha ao enviar Telegram', { reason: envio.reason, status: envio.status, chatId: chat.id, modo })
    return { status: 'telegram_failed', modo, chatId: chat.id, dedupKey }
  }

  // Registro do dedup só acontece aqui, DEPOIS da confirmação de sucesso acima.
  await registrarDedup(dedupKey, mensagemFinal, deps)

  console.log('[alerta-inteligente] Alerta enviado', { chatId: chat.id, modo })
  return { status: 'sent', modo, chatId: chat.id, dedupKey }
}
