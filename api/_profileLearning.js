// Aprendizado automático de customer_profiles.size — Fase 2C.
// Chamado por api/onnewmessage.js somente quando role === "user" e o texto
// contém uma declaração explícita e não-ambígua de tamanho.
//
// Fluxo: extractSize() -> upsertIdentity() -> findProfile() -> RPC transacional
// (apply_profile_size_learning, migration 013). Nenhuma lógica de identidade é
// duplicada aqui — upsertIdentity() é importada de _profileIdentity.js (módulo
// não alterado) e continua sendo a única responsável por criar/reconciliar a
// linha básica do perfil. Esta função só decide E aplica o valor de size.
//
// Credencial: SUPABASE_SECRET_KEY (nova Secret key do Supabase, autentica como
// service_role) — única credencial usada neste arquivo, em toda leitura e na
// chamada da RPC. Nunca process.env.VITE_SUPABASE_KEY (anon) aqui.
//
// --- Sobre o timeout (leia antes de mexer neste arquivo) -------------------
// O AbortController abaixo cancela SOMENTE os fetches criados dentro deste
// arquivo (findByContextId, findByConvId, a chamada da RPC). Ele NÃO cancela
// os fetches internos de upsertIdentity() — esse módulo não aceita signal e
// não foi alterado. Se o timeout disparar durante upsertIdentity(), os
// fetches dela continuam rodando em segundo plano por conta própria; nós só
// paramos de esperar por eles no NOSSO lado, assim que ela retornar (ela
// sempre retorna, nunca rejeita — confirmado por leitura direta do módulo).
//
// Isso é seguro mesmo assim: uma conclusão tardia de upsertIdentity() só
// tocaria campos de identidade (telefone/last_seen/channel), nunca size — e
// mesmo que, por algum caminho futuro, uma chamada de RPC chegasse a
// acontecer depois do timeout já detectado (o que este desenho evita
// explicitamente, checando o abort entre cada etapa), o par
// UNIQUE(message_id, field) na tabela de auditoria torna uma conclusão
// tardia ou uma reentrega segura — nunca aplica a mesma mudança 2x.
//
// Nenhuma operação nova é iniciada depois que o abort é detectado — cada
// transição da cadeia checa signal.aborted antes de seguir adiante.
// -----------------------------------------------------------------------

import { createHash } from 'crypto'
import { upsertIdentity } from './_profileIdentity.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL   // não é segredo, mesma var já usada em todo api/
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY

const headers = {
  'apikey': SUPABASE_SECRET_KEY,
  'Content-Type': 'application/json',
}

const TIMEOUT_MS = 3000

function base() {
  return `${SUPABASE_URL}/rest/v1/customer_profiles`
}

// ===================== extractSize() — detecção de tamanho =====================

const THIRD_PARTY_EXCLUSION_PATTERN =
  /\b(?:meu\s+amigo|minha\s+amiga|meu\s+irmao|meu\s+irmão|minha\s+irma|minha\s+irmã|\bele\b|\bela\b|namorad[oa]|marido|esposa|filho|filha|presente|de\s+presente|(?:pra|para)\s+(?:ele|ela|meu|minha))\b/i

const QUESTION_OFFER_EXCLUSION_PATTERN =
  /\?|(?:\btem\b.*\bou\b)|(?:\bvoces?\s+tem\b)/i

// Padrões explícitos e separados — um por estrutura, sem tentar unificar
// numa única expressão complexa. Cada um exige uma âncora específica de
// tamanho ("tamanho"/"número"/verbo de calçar-vestir) — nunca um número
// solto sem contexto.
const DECLARATION_PATTERNS = [
  { name: 'tamanho_numero_declarado', re: /\bmeu\s+(?:tamanho|n[uú]mero)\s+(?:é|eh|e)\s+(\d{2})\b/i },
  { name: 'verbo_uso',                re: /\b(?:eu\s+|agora\s+(?:eu\s+)?)?uso\s+(\d{2})\b/i },
  { name: 'verbo_calco',              re: /\b(?:eu\s+|agora\s+(?:eu\s+)?)?cal[çc]o\s+(\d{2})\b/i },
  { name: 'verbo_visto',              re: /\b(?:eu\s+|agora\s+(?:eu\s+)?)?visto\s+(\d{2})\b/i },
  { name: 'verbo_mudei_para',         re: /\bmudei\s+(?:pra|para)\s+(?:o\s+)?(\d{2})\b/i },
]

const ALL_NUMBERS_PATTERN = /\b(\d{2})\b/g
const SIZE_MIN = 33
const SIZE_MAX = 46

// Decide se o texto do cliente contém uma declaração explícita e não-ambígua
// de tamanho. Pura, síncrona, sem I/O. Retorna null em qualquer ambiguidade
// ou ausência de sinal — silêncio é sempre a opção mais segura.
export function extractSize(texto) {
  if (typeof texto !== 'string' || texto.trim().length === 0) return null
  if (THIRD_PARTY_EXCLUSION_PATTERN.test(texto)) return null
  if (QUESTION_OFFER_EXCLUSION_PATTERN.test(texto)) return null

  let declared = null
  let ruleMatched = null
  let matchCount = 0

  for (const { name, re } of DECLARATION_PATTERNS) {
    const m = re.exec(texto)
    if (m) {
      matchCount += 1
      declared = m[1]
      ruleMatched = name
    }
  }

  if (matchCount !== 1) return null // 0 = sem sinal; >1 = ambíguo entre padrões diferentes

  const n = parseInt(declared, 10)
  if (n < SIZE_MIN || n > SIZE_MAX) return null

  // Ambiguidade: todos os números plausíveis na MENSAGEM INTEIRA, não só o
  // trecho que o padrão de declaração capturou.
  const allNumbers = [...texto.matchAll(ALL_NUMBERS_PATTERN)].map(m => parseInt(m[1], 10))
  const plausible = new Set(allNumbers.filter(x => x >= SIZE_MIN && x <= SIZE_MAX))
  if (plausible.size !== 1) return null

  return { size: declared, ruleMatched }
}

// ===================== Sanitização de log =====================

function hashShort(value) {
  if (!value) return null
  return `h:${createHash('sha256').update(String(value)).digest('hex').slice(0, 10)}`
}

function log(level, event, details = {}) {
  const fn = level === 'error' ? console.error : level === 'warning' ? console.warn : console.log
  fn('[ProfileLearning]', JSON.stringify({ event, ...details }))
}

function normalizeChannel(raw) {
  if (typeof raw !== 'string') return null
  const upper = raw.trim().toUpperCase()
  return (upper === 'WHATSAPP' || upper === 'INSTAGRAM') ? upper : null
}

// ===================== Busca de perfil (context_id -> fallback conv_id) ========
// Duplicação intencional da mesma lógica já usada em _profileIdentity.js e
// _profileMemory.js — decisão já fechada (Fase 2C). Diferente delas, estas
// funções NÃO engolem erro internamente: precisamos que uma falha de rede
// (inclusive AbortError por timeout) se propague até o catch de
// learnSizeFromMessage, pra podermos diferenciar "abortado" de "perfil
// realmente não encontrado" nos logs.

async function findByContextId(contextId, signal) {
  const res = await fetch(
    `${base()}?context_id=eq.${encodeURIComponent(contextId)}&order=last_seen.desc&limit=1`,
    { headers, signal }
  )
  if (!res.ok) return null
  const data = await res.json()
  return data[0] || null
}

async function findByConvId(convId, signal) {
  const res = await fetch(
    `${base()}?conv_id=eq.${encodeURIComponent(convId)}&limit=1`,
    { headers, signal }
  )
  if (!res.ok) return null
  const data = await res.json()
  return data[0] || null
}

async function findProfile(contextId, signal) {
  const byContext = await findByContextId(contextId, signal)
  if (byContext) return byContext

  if (signal.aborted) return null // não inicia a 2ª consulta se o timeout já estourou

  const byConv = await findByConvId(contextId, signal)
  return byConv || null
}

// ===================== Chamada da RPC =====================

async function callApplySizeLearningRPC(params, signal) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/apply_profile_size_learning`, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({
      p_conv_id: params.convId,
      p_context_id: params.contextId,
      p_message_id: params.messageId,
      p_channel: params.channel,
      p_new_size: params.newSize,
      p_source_text: params.sourceText.slice(0, 200),
      p_rule_matched: params.ruleMatched,
      p_confidence: 'high',
    }),
  })

  if (!res.ok) {
    return { status: 'error', reason: 'http_error' }
  }

  try {
    return await res.json()
  } catch {
    // Corpo vazio ou JSON inválido — não deixa a exceção de parse escapar
    // pro catch genérico do orquestrador (que a rotularia incorretamente
    // como 'network_error'); trata como um status conhecido da própria RPC.
    return { status: 'error', reason: 'invalid_json_response' }
  }
}

function handleRpcStatus(result, ctx) {
  if (!result || typeof result.status !== 'string') {
    // Nunca loga o objeto bruto retornado — se o formato vier inesperado
    // (ex.: corpo de erro de infraestrutura do PostgREST em vez do JSON
    // da nossa função), não sabemos o que ele contém, então não repassa.
    log('warning', 'rpc_unknown_status', { ...ctx, recognized: false })
    return
  }
  switch (result.status) {
    case 'applied':           log('info',    'rpc_applied', ctx); break
    case 'duplicate':         log('info',    'rpc_duplicate', ctx); break
    case 'unchanged':         log('info',    'rpc_unchanged', ctx); break
    case 'profile_not_found': log('warning', 'rpc_profile_not_found', ctx); break
    case 'invalid_input':     log('warning', 'rpc_invalid_input', { ...ctx, reason: result.reason }); break
    case 'error':             log('error',   'rpc_status_error', { ...ctx, reason: result.reason }); break
    default:                  log('warning', 'rpc_unknown_status', { ...ctx, status: result.status })
  }
}

// ===================== Orquestrador (único ponto de entrada) =====================

export async function learnSizeFromMessage({ contextId, telefone, channel, texto, messageId }) {
  const extracted = extractSize(texto)
  if (!extracted) return // sem sinal — nenhum I/O acontece

  // Falha segura de configuração — nunca tenta nenhum fetch sem credencial,
  // e nunca expõe o valor (ausente ou presente) em log.
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    log('warning', 'missing_config', {})
    return
  }

  const normalizedChannel = normalizeChannel(channel)
  const contextHash = hashShort(contextId)
  const messageHash = hashShort(messageId)

  const controller = new AbortController()
  let timeoutId
  const timeoutSignal = new Promise(resolve => {
    timeoutId = setTimeout(() => {
      controller.abort()
      resolve('__TIMEOUT__')
    }, TIMEOUT_MS)
  })

  try {
    // (1) upsertIdentity — SEM signal (módulo não aceita, não alterado), mas
    //     CORRIDA contra o mesmo timeout: como ela nunca rejeita e não é
    //     cancelável, um await direto poderia travar esta função por tempo
    //     indefinido se a rede dela travar. Promise.race garante que NÓS
    //     paramos de esperar no teto certo — a chamada abandonada continua
    //     rodando sozinha em segundo plano, sem afetar mais nada daqui.
    const upsertOutcome = await Promise.race([
      upsertIdentity({ contextId, telefone, canal: normalizedChannel })
        .then(() => '__DONE__')
        // Defesa extra: upsertIdentity() nunca deveria rejeitar (confirmado
        // por leitura direta do módulo), mas se esse contrato mudar no
        // futuro sem que este arquivo seja revisado junto, este .catch()
        // evita uma unhandled rejection na promise perdedora da corrida.
        .catch(() => '__DONE__'),
      timeoutSignal,
    ])

    if (upsertOutcome === '__TIMEOUT__' || controller.signal.aborted) {
      log('warning', 'timeout', { contextHash, messageHash, stage: 'durante_upsertIdentity' })
      return
    }

    // (2) findProfile — nossos próprios fetches, com signal
    const profile = await findProfile(contextId, controller.signal)

    if (controller.signal.aborted) {
      log('warning', 'timeout', { contextHash, messageHash, stage: 'apos_findProfile' })
      return
    }

    if (!profile) {
      log('warning', 'profile_not_found_after_identity', { contextHash, messageHash })
      return
    }

    // (3) RPC — com signal
    const result = await callApplySizeLearningRPC({
      convId: profile.conv_id,
      contextId,
      messageId,
      channel: normalizedChannel,
      newSize: extracted.size,
      sourceText: texto,
      ruleMatched: extracted.ruleMatched,
    }, controller.signal)

    handleRpcStatus(result, { contextHash, messageHash })

  } catch (err) {
    if (err.name === 'AbortError') {
      // Consequência esperada do timeout — nunca erro crítico
      log('warning', 'abort', { contextHash, messageHash, message: 'fetch abortado pelo timeout' })
    } else {
      log('warning', 'network_error', { contextHash, messageHash, message: err.message })
    }
  } finally {
    clearTimeout(timeoutId)
  }
}
