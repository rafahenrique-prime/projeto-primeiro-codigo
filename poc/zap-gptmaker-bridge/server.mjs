// POC isolada — ponte ZAP-API Trial (zap-api.tech) <-> GPTMaker Conversation API (Gabi teste).
// Não depende de nenhum arquivo do projeto principal. Sem dependências externas (só Node built-in).
// Uso: veja README.md nesta pasta.

import http from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { decide as gatekeeperDecide } from './gatekeeper.js'
import { routeTools } from './toolRouter.js'
import { createToolRegistry } from './tools/index.js'
import { buildContext } from './contextBuilder.js'

const PORT = process.env.PORT || 3344

const AGENT_ID = process.env.AGENT_ID
const GPT_TOKEN = process.env.GPT_TOKEN
const ZAPI_INSTANCE_ID = process.env.ZAPI_INSTANCE_ID
const ZAPI_TOKEN = process.env.ZAPI_TOKEN
const ZAPI_BASE_URL = process.env.ZAPI_BASE_URL || 'https://api.zap-api.tech/v1'
// Só para testabilidade local (Fase 2B.5) — comportamento padrão idêntico ao
// anterior, sem essa variável. Nunca documentado como uso de produção.
const GPTMAKER_BASE_URL = process.env.GPTMAKER_BASE_URL || 'https://api.gptmaker.ai'

// --- IGNITE PRIME Tool API (Fase 3, Etapa 3.6) ---
// IGNITE_PRIME_URL / BRIDGE_TOOLS_SECRET / IGNITE_TOOLS_TIMEOUT_MS só são
// exigidas quando LIVE_MODE=true E quando uma ferramenta (ex.: consultar_produto)
// realmente precisar chamar a Tool API — nunca lidas/exigidas no boot do
// processo (sem process.exit por falta delas), e nunca antes do LIVE_MODE já
// ter sido confirmado dentro de handleIncoming (ver buildRequestToolApi()).
// IGNITE_PRIME_URL tem fallback só para NEXT_PUBLIC_VERCEL_URL — convenção já
// existente no projeto (ver CLAUDE.md raiz, ignite-webhook.vercel.app) —
// nunca um domínio inventado aqui.
const DEFAULT_IGNITE_TOOLS_TIMEOUT_MS = 8000

// --- Segredo de path do webhook (proteção temporária, Fase 2B.1) ---
// Obrigatório. Sem ele o servidor não inicia — nunca aceita webhook desprotegido por padrão.
const WEBHOOK_PATH_SECRET = process.env.WEBHOOK_PATH_SECRET
if (!WEBHOOK_PATH_SECRET) {
  console.error('❌ Falta variável de ambiente: WEBHOOK_PATH_SECRET')
  process.exit(1)
}

// Comparação de tempo constante — evita vazar, via timing, quanto do segredo bate.
// timingSafeEqual exige buffers do mesmo tamanho, por isso o guard de comprimento antes.
function isValidWebhookSecret(candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0) return false
  const expected = Buffer.from(WEBHOOK_PATH_SECRET)
  const received = Buffer.from(candidate)
  if (expected.length !== received.length) return false
  return timingSafeEqual(expected, received)
}

// --- LIVE_MODE seguro por padrão ---
// Ausência da variável, ou qualquer valor diferente de "true", mantém o modo seguro (sem chamadas reais).
// Substitui o antigo DRY_RUN (que tinha "real" como padrão inseguro quando a variável estava ausente).
function parseBooleanEnv(raw) {
  if (!raw || typeof raw !== 'string') return false
  return raw.trim().toLowerCase() === 'true'
}
const LIVE_MODE = parseBooleanEnv(process.env.LIVE_MODE)

// --- Timeout configurável para chamadas externas (GPTMaker, ZAP-API, Supabase) ---
const DEFAULT_EXTERNAL_TIMEOUT_MS = 10000
const DEFAULT_SUPABASE_TIMEOUT_MS = 3000
function parseTimeoutEnv(raw, defaultMs, varName) {
  if (!raw) return defaultMs
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`❌ ${varName} inválido (${raw}) — usando padrão de ${defaultMs}ms`)
    return defaultMs
  }
  return n
}
const EXTERNAL_TIMEOUT_MS = parseTimeoutEnv(process.env.EXTERNAL_TIMEOUT_MS, DEFAULT_EXTERNAL_TIMEOUT_MS, 'EXTERNAL_TIMEOUT_MS')
const SUPABASE_TIMEOUT_MS = parseTimeoutEnv(process.env.SUPABASE_TIMEOUT_MS, DEFAULT_SUPABASE_TIMEOUT_MS, 'SUPABASE_TIMEOUT_MS')

// --- Dedupe persistente (Supabase, Fase 2B.3) ---
// SUPABASE_URL não é segredo (mesma URL já usada em todo o projeto);
// SUPABASE_SECRET_KEY é a Secret key (service_role) — nunca a anon key,
// nunca logada. Ambas só são exigidas quando LIVE_MODE=true, já que em modo
// seguro nenhuma chamada ao Supabase acontece.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY

const required = { AGENT_ID, GPT_TOKEN, ZAPI_INSTANCE_ID, ZAPI_TOKEN }
for (const [key, value] of Object.entries(required)) {
  if (!value) {
    console.error(`❌ Falta variável de ambiente: ${key}`)
    process.exit(1)
  }
}

if (LIVE_MODE && !SUPABASE_URL) {
  console.error('❌ Falta variável de ambiente: SUPABASE_URL (ou VITE_SUPABASE_URL) — obrigatória quando LIVE_MODE=true')
  process.exit(1)
}
if (LIVE_MODE && !SUPABASE_SECRET_KEY) {
  console.error('❌ Falta variável de ambiente: SUPABASE_SECRET_KEY — obrigatória quando LIVE_MODE=true')
  process.exit(1)
}

// Dedupe em memória — some quando o processo é encerrado (POC descartável)
const seenMessageIds = new Set()

function log(step, data) {
  const ts = new Date().toISOString()
  console.log(`[${ts}] ${step}`, data ?? '')
}

// --- Normalização de telefone (adaptado de base44/functions/whatsappProvider/main.ts) ---
function normalizePhone(raw) {
  if (!raw || typeof raw !== 'string') return null
  let digits = raw.replace(/\D/g, '')
  if (!digits) return null

  if (digits.startsWith('00')) digits = digits.slice(2)
  if (!digits.startsWith('55')) digits = '55' + digits

  if (digits.length !== 12 && digits.length !== 13) return null

  const ddd = digits.substring(2, 4)
  const validDDDs = ['11','12','13','14','15','16','17','18','19','21','22','24','27','28','31','32','33','34','35','37','38','41','42','43','44','45','46','47','48','49','51','53','54','55','61','62','63','64','65','66','67','68','69','71','73','74','75','77','79','81','82','83','84','85','86','87','88','89','91','92','93','94','95','96','97','98','99']
  if (!validDDDs.includes(ddd)) return null

  return digits
}

// --- Mascaramento de telefone em logs (adaptado de whatsappProvider/main.ts) ---
function maskPhone(phone) {
  if (!phone || typeof phone !== 'string' || phone.length < 6) return '***'
  return phone.substring(0, 2) + '*'.repeat(phone.length - 6) + phone.substring(phone.length - 4)
}

// --- Taxonomia de erros estruturada ---
// error_code: timeout | invalid_phone | invalid_payload | authentication_error | rate_limit
//             | provider_unavailable | provider_bad_request | invalid_provider_response | internal_error
// source: gptmaker | zap_api | bridge
function bridgeError(errorCode, source, extra) {
  return { errorCode, source, ...extra }
}

function errorCodeFromHttpStatus(status) {
  if (status === 400) return 'provider_bad_request'
  if (status === 401 || status === 403) return 'authentication_error'
  if (status === 429) return 'rate_limit'
  if (status >= 500) return 'provider_unavailable'
  return 'invalid_provider_response'
}

// Redige telefone de um payload de webhook antes de logar (data.phone / data.from)
function redactPayloadForLog(payload) {
  if (!payload || typeof payload !== 'object') return payload
  const data = payload.data
  if (!data || typeof data !== 'object') return payload
  const redactedData = { ...data }
  if (typeof redactedData.phone === 'string') redactedData.phone = maskPhone(normalizePhone(redactedData.phone) || redactedData.phone)
  if (typeof redactedData.from === 'string') redactedData.from = maskPhone(normalizePhone(redactedData.from) || redactedData.from)
  return { ...payload, data: redactedData }
}

async function fetchWithTimeout(url, options, timeoutMs = EXTERNAL_TIMEOUT_MS) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// --- Cliente HTTP da IGNITE PRIME Tool API (Fase 3, Etapa 3.6) ---
// Único ponto de chamada a POST /api/system-tools?tool=consultar-produto.
// Nunca loga request/response completos, nunca loga headers, nunca loga o
// segredo — só o error_code mapeado. Sem retry automático nesta primeira
// integração (mesma decisão já registrada no plano da Etapa 3.6). O formato
// de retorno ({success, ...} | {success:false, error_code}) é exatamente o
// que tools/consultarProduto.js (Etapa 3.4) já sabe interpretar.
async function requestConsultarProdutoTool(igniteUrl, bridgeSecret, timeoutMs, params) {
  const url = `${igniteUrl.replace(/\/$/, '')}/api/system-tools?tool=consultar-produto`
  const body = { query: params?.query }
  if (params?.requestedSize !== undefined) body.requestedSize = params.requestedSize
  if (params?.requestedColor !== undefined) body.requestedColor = params.requestedColor

  let res
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bridgeSecret}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      },
      timeoutMs
    )
  } catch (err) {
    if (err?.name === 'AbortError') return { success: false, error_code: 'timeout' }
    return { success: false, error_code: 'http_error' }
  }

  // Mapeamento fechado de status HTTP — nunca repassa o corpo/headers crus
  // da resposta de erro (poderiam conter detalhe interno do dispatcher).
  if (res.status === 401) return { success: false, error_code: 'unauthorized' }
  if (res.status === 503) return { success: false, error_code: 'integration_not_configured' }
  if (!res.ok) return { success: false, error_code: 'http_error' }

  const json = await res.json().catch(() => null)
  if (!json || typeof json.success !== 'boolean') return { success: false, error_code: 'invalid_response' }
  return json
}

// Constrói o requestToolApi real só quando IGNITE_PRIME_URL e BRIDGE_TOOLS_SECRET
// estão configurados — nunca lança, nunca exige nada no boot do processo.
// Chamado só de dentro do caminho CONTINUE de handleIncoming, sempre depois
// do LIVE_MODE já ter sido confirmado. Sem as duas variáveis, devolve
// undefined — a ferramenta cai no caminho tool_not_configured já definido na
// Etapa 3.4, sem impedir GPTMaker/ZAP-API de funcionarem normalmente.
function buildRequestToolApi() {
  const igniteUrl = process.env.IGNITE_PRIME_URL || process.env.NEXT_PUBLIC_VERCEL_URL || null
  const bridgeSecret = process.env.BRIDGE_TOOLS_SECRET
  if (!igniteUrl || !bridgeSecret) return undefined

  const timeoutMs = parseTimeoutEnv(process.env.IGNITE_TOOLS_TIMEOUT_MS, DEFAULT_IGNITE_TOOLS_TIMEOUT_MS, 'IGNITE_TOOLS_TIMEOUT_MS')
  return (params) => requestConsultarProdutoTool(igniteUrl, bridgeSecret, timeoutMs, params)
}

// Fecha o dedupe persistente em 'failed' e limpa o Set em memória — usado
// tanto pelo caminho CONTINUE (GPTMaker/ZAP-API) quanto por
// ANSWER_WITHOUT_GPTMAKER (ZAP-API), nunca duplicado entre os dois.
async function markFailedAndCleanup(messageId, errInfo) {
  if (!messageId) return
  seenMessageIds.delete(messageId) // defensivo — no-op se nunca esteve lá
  const failResult = await processBridgeMessage('mark_failed', messageId, errInfo.errorCode)
  if (!failResult.ok) {
    log('⚠️  Falha ao registrar mark_failed no Supabase (indisponibilidade)', { messageId })
  }
  logToSupabase('warning', 'processing_failed', { messageId, errorCode: errInfo.errorCode, source: errInfo.source })
}

// --- Dedupe persistente (Supabase) ---
// Único ponto de contato com o Supabase: chama a RPC process_bridge_message
// (migration 017). Nunca usa Authorization: Bearer — apikey sozinho já
// autentica como service_role (confirmado em docs/SUPABASE.md §3.5).
// Retorna sempre { ok, result?, reason? } — nunca lança exceção — para que o
// chamador decida o fallback sem precisar de try/catch.
async function processBridgeMessage(action, messageId, errorCode) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/process_bridge_message`
  let res
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_SECRET_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_action: action, p_message_id: messageId, p_error_code: errorCode ?? null }),
      },
      SUPABASE_TIMEOUT_MS
    )
  } catch (err) {
    return { ok: false, reason: err?.name === 'AbortError' ? 'timeout' : 'network_error' }
  }

  if (!res.ok) {
    return { ok: false, reason: `http_${res.status}` }
  }

  const json = await res.json().catch(() => null)
  if (!json || typeof json.result !== 'string') {
    return { ok: false, reason: 'invalid_response' }
  }

  return { ok: true, result: json.result, reason: json.reason }
}

// Retry curto e limitado de mark_completed — só chamado depois que a ZAP-API
// já aceitou o envio (2xx). A partir daqui nunca marca failed nem reenvia.
async function confirmCompletion(messageId) {
  const backoffsMs = [300, 600, 1200]
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await processBridgeMessage('mark_completed', messageId)

    if (result.ok && result.result === 'completed') {
      seenMessageIds.add(messageId)
      log('✅ mark_completed confirmado', { messageId })
      logToSupabase('info', 'completed', { messageId })
      return
    }

    if (result.ok && result.result === 'not_found_or_invalid_state') {
      seenMessageIds.add(messageId)
      log('❌ mark_completed retornou not_found_or_invalid_state — messageId protegido no Set', { messageId })
      return
    }

    // Timeout, erro de rede, HTTP inválido ou result='error' — tenta de novo
    if (attempt < backoffsMs.length) {
      await sleep(backoffsMs[attempt])
    }
  }

  seenMessageIds.add(messageId)
  log('🔴 mark_completed falhou em todas as tentativas — messageId permanece protegido no Set, sem novo envio', { messageId })
}

// --- Logging persistente (Supabase, Fase 2B.4) ---
// Fire-and-forget: nunca aguardada no caminho crítico, nunca lança (toda
// rejeição é tratada internamente via .catch), nunca chama a si mesma em
// caso de erro (sem recursão). Só grava quando LIVE_MODE=true e as
// variáveis do Supabase estão configuradas — em qualquer outro caso, é um
// no-op silencioso (o log local via log() continua sendo a fonte de verdade
// em tempo real, sempre).
const MAX_PENDING_SUPABASE_LOGS = 5
let pendingSupabaseLogs = 0
let lastLogWarningAt = 0
const LOG_WARNING_INTERVAL_MS = 60000

function warnLogUnavailable(reason) {
  const now = Date.now()
  if (now - lastLogWarningAt < LOG_WARNING_INTERVAL_MS) return
  lastLogWarningAt = now
  log('⚠️  Log persistente indisponível (aviso limitado a 1x/60s)', { reason })
}

// Campos aceitos: level, event, error_code, source, http_status, duration_ms,
// message_id — nunca telefone, texto, prompt, resposta da IA, token, IDs de
// agente/instância, Authorization, segredo do webhook ou payload bruto.
function logToSupabase(level, event, details = {}) {
  if (!LIVE_MODE || !SUPABASE_URL || !SUPABASE_SECRET_KEY) return

  if (pendingSupabaseLogs >= MAX_PENDING_SUPABASE_LOGS) {
    warnLogUnavailable('limite_de_concorrencia_atingido')
    return
  }

  pendingSupabaseLogs++
  const body = {
    level,
    event,
    error_code: details.errorCode ?? null,
    source: details.source ?? null,
    http_status: details.httpStatus ?? null,
    duration_ms: details.durationMs ?? null,
    message_id: details.messageId ?? null,
  }

  fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/bridge_operation_logs`,
    {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SECRET_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
    },
    SUPABASE_TIMEOUT_MS
  )
    .then((res) => {
      if (!res.ok) warnLogUnavailable(`http_${res.status}`)
    })
    .catch((err) => {
      warnLogUnavailable(err?.name === 'AbortError' ? 'timeout' : 'network_error')
    })
    .finally(() => {
      pendingSupabaseLogs--
    })
}

async function askGabi(phone, prompt) {
  const url = `${GPTMAKER_BASE_URL}/v2/agent/${AGENT_ID}/conversation`
  let res
  try {
    res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GPT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ contextId: phone, prompt }),
    })
  } catch (err) {
    if (err.name === 'AbortError') {
      throw bridgeError('timeout', 'gptmaker', { message: `sem resposta em ${EXTERNAL_TIMEOUT_MS}ms` })
    }
    throw bridgeError('internal_error', 'gptmaker', { message: err.message })
  }

  const json = await res.json().catch(() => null)
  if (!res.ok || json?.success === false) {
    throw bridgeError(errorCodeFromHttpStatus(res.status), 'gptmaker', { status: res.status })
  }
  if (!json || typeof json.message !== 'string') {
    throw bridgeError('invalid_provider_response', 'gptmaker', { status: res.status })
  }
  return json.message
}

async function replyOnWhatsApp(phone, message) {
  const url = `${ZAPI_BASE_URL}/instances/${ZAPI_INSTANCE_ID}/send`
  let res
  try {
    res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ZAPI_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone, type: 'text', body: message }),
    })
  } catch (err) {
    if (err.name === 'AbortError') {
      throw bridgeError('timeout', 'zap_api', { message: `sem resposta em ${EXTERNAL_TIMEOUT_MS}ms` })
    }
    throw bridgeError('internal_error', 'zap_api', { message: err.message })
  }

  const json = await res.json().catch(() => null)
  if (!res.ok) {
    throw bridgeError(errorCodeFromHttpStatus(res.status), 'zap_api', { status: res.status })
  }
  return json
}

// A ZAP-API separa eventos de entrada ("message.received") e saída ("message.sent").
// Como só tratamos "message.received", a nossa própria resposta (que gera "message.sent")
// nunca é reprocessada — não existe risco de loop por construção.
//
// `deps` (Fase 3, Etapa 3.6) — só para testabilidade, nunca usado em produção
// real (o handler HTTP no fim deste arquivo chama handleIncoming(payload) sem
// segundo argumento, reproduzindo exatamente o comportamento padrão):
//   - deps.gatekeeperDecide: substitui decide() do gatekeeper.js real;
//   - deps.requestToolApi: substitui buildRequestToolApi() (evita rede real
//     e leitura de env/segredo real nos testes).
async function handleIncoming(payload, deps = {}) {
  const start = performance.now()
  const { event, data } = payload

  if (event !== 'message.received') {
    log('⏭️  Ignorado (evento não é message.received)', { event })
    logToSupabase('info', 'filtered_wrong_event')
    return
  }

  const { messageId, phone: phoneField, from, type, body: text } = data || {}

  if (data?.fromMe === true) {
    log('⏭️  Ignorado (fromMe=true — mensagem própria)', { messageId, event })
    logToSupabase('info', 'filtered_from_me', { messageId })
    return
  }

  if (type !== 'text' || !text) {
    log('⏭️  Ignorado (não é mensagem de texto)', { messageId, event, type })
    logToSupabase('info', 'filtered_not_text', { messageId })
    return
  }

  const rawPhone = phoneField || from

  if (!rawPhone) {
    log('⏭️  Ignorado (payload sem telefone — sem data.phone nem data.from)', { messageId })
    logToSupabase('warning', 'filtered_no_phone', { messageId })
    return
  }

  const phone = normalizePhone(rawPhone)
  if (!phone) {
    log('⏭️  Ignorado (telefone inválido após normalização)', { messageId, errorCode: 'invalid_phone', source: 'bridge' })
    logToSupabase('warning', 'filtered_invalid_phone', { messageId, errorCode: 'invalid_phone', source: 'bridge' })
    return
  }

  log('📩 Mensagem recebida', { messageId, phone: maskPhone(phone) })
  logToSupabase('info', 'received', { messageId })

  if (!LIVE_MODE) {
    log('🧪 LIVE_MODE inativo — não vai chamar GPTMaker nem responder no WhatsApp')
    return
  }

  // Dedupe em memória — segunda camada rápida, não a fonte de verdade.
  // Só é alcançada em LIVE_MODE=true (testes em modo seguro nunca tocam o Set).
  if (messageId && seenMessageIds.has(messageId)) {
    log('⏭️  Ignorado (messageId já em processamento nesta execução)', { messageId })
    logToSupabase('info', 'filtered_duplicate', { messageId })
    return
  }

  if (messageId) {
    const checkResult = await processBridgeMessage('check_or_start', messageId)

    if (checkResult.ok && (checkResult.result === 'process' || checkResult.result === 'retry_failed' || checkResult.result === 'retry_stale')) {
      log('▶️  Dedupe persistente autorizou processamento', { messageId, result: checkResult.result })
      logToSupabase('info', 'processing_started', { messageId })
      // Não adiciona ao Set ainda — só depois de mark_completed confirmado,
      // ou imediatamente removido (defensivo) se GPTMaker/ZAP-API falharem.
    } else if (checkResult.ok && checkResult.result === 'already_processing') {
      log('⏭️  Ignorado (already_processing — outra tentativa em andamento)', { messageId })
      logToSupabase('info', 'filtered_duplicate', { messageId })
      return
    } else if (checkResult.ok && checkResult.result === 'duplicate_completed') {
      seenMessageIds.add(messageId)
      log('⏭️  Ignorado (duplicate_completed)', { messageId })
      logToSupabase('info', 'filtered_duplicate', { messageId })
      return
    } else {
      // RPC indisponível ou erro funcional inesperado — fallback ao Set em
      // memória, mesmo comportamento da Fase 1/2A para esta ocorrência.
      log('⚠️  Dedupe persistente indisponível — usando fallback em memória', {
        messageId,
        reason: checkResult.ok ? checkResult.result : checkResult.reason,
      })
      seenMessageIds.add(messageId)
    }
  }

  // --- PRIME Gatekeeper (Fase 3, Etapa 3.1) ---
  // 100% permissivo nesta fase — só CONTINUE ocorre em uso normal — mas os
  // quatro caminhos ficam corretamente orquestrados e testados (deps.gatekeeperDecide
  // permite exercitar BLOCK/IGNORE/ANSWER_WITHOUT_GPTMAKER nos testes, já que
  // o gatekeeper.js real ainda não implementa nenhuma regra que os produza).
  const decideFn = deps.gatekeeperDecide ?? gatekeeperDecide
  const decision = decideFn(text, { messageId, phone })
  log('🚧 Gatekeeper decidiu', { messageId, action: decision?.action, reason: decision?.reason })

  if (decision?.action === 'BLOCK' || decision?.action === 'IGNORE') {
    // Nunca é uma falha — fecha o dedupe como sucesso (mark_completed),
    // igual ao caminho CONTINUE bem-sucedido, nunca mark_failed.
    if (messageId) await confirmCompletion(messageId)
    const elapsedMsGate = Math.round(performance.now() - start)
    log('🏁 Fluxo completo (Gatekeeper)', { latenciaTotalMs: elapsedMsGate, action: decision.action })
    return
  }

  if (decision?.action === 'ANSWER_WITHOUT_GPTMAKER') {
    // Resposta local, sem chamar GPTMaker — reutiliza exatamente o mesmo
    // ciclo "provider aceitou -> confirmCompletion / provider falhou ->
    // mark_failed" do caminho CONTINUE (via markFailedAndCleanup), sem duplicar lógica.
    const localReply = typeof decision.localReply === 'string' && decision.localReply.trim().length > 0
      ? decision.localReply
      : 'Já te retorno, um momento.'
    try {
      await replyOnWhatsApp(phone, localReply)
      log('✅ Resposta local enviada — provider aceitou (provider_accepted)')
      logToSupabase('info', 'provider_accepted', { messageId })
    } catch (err) {
      const errInfo = err && err.errorCode
        ? { errorCode: err.errorCode, source: err.source, status: err.status, message: err.message }
        : bridgeError('internal_error', 'bridge', { message: err.message })
      log('❌ Erro ao enviar resposta local (ANSWER_WITHOUT_GPTMAKER)', errInfo)
      logToSupabase('error', 'provider_accept_error', { messageId, errorCode: errInfo.errorCode, source: 'zap_api', httpStatus: errInfo.status })
      await markFailedAndCleanup(messageId, errInfo)
      return
    }
    if (messageId) await confirmCompletion(messageId)
    const elapsedMsAns = Math.round(performance.now() - start)
    log('🏁 Fluxo completo (resposta local)', { latenciaTotalMs: elapsedMsAns })
    return
  }

  // decision.action === 'CONTINUE' — segue para Tool Router + Context Builder
  // (Fase 3, Etapas 3.2-3.5) antes de chamar o GPTMaker.
  const requestToolApi = deps.requestToolApi ?? buildRequestToolApi()
  const tools = createToolRegistry({ requestToolApi })
  const toolRouterResult = await routeTools(text, { messageId, phone }, tools)

  for (const matched of toolRouterResult.matchedTools) {
    log('🔧 Ferramenta casou', { messageId, tool: matched.name, confidence: matched.confidence })
    if (matched.result?.ok === true) {
      log('✅ Ferramenta concluída', { messageId, tool: matched.name })
    } else {
      log('⚠️  Ferramenta não concluída', { messageId, tool: matched.name, errorCode: matched.result?.error?.code })
    }
  }

  const context = buildContext(text, toolRouterResult)
  log('🧩 Contexto construído', {
    messageId,
    hasContext: context.hasContext,
    toolsUsed: context.toolsUsed,
    contextTruncated: context.contextTruncated,
  })

  let reply
  try {
    log('▶️  Chamando Conversation API (Gabi teste)...', { contextId: maskPhone(phone) })
    logToSupabase('info', 'gptmaker_called', { messageId })
    reply = await askGabi(phone, context.prompt)
    log('✅ Gabi respondeu', { reply })

    log('▶️  Enviando resposta via ZAP-API /send...')
    await replyOnWhatsApp(phone, reply)
    log('✅ Resposta enviada ao WhatsApp — provider aceitou (provider_accepted)')
    logToSupabase('info', 'provider_accepted', { messageId })
  } catch (err) {
    const errInfo = err && err.errorCode
      ? { errorCode: err.errorCode, source: err.source, status: err.status, message: err.message }
      : bridgeError('internal_error', 'bridge', { message: err.message })
    log('❌ Erro no processamento', errInfo)

    if (errInfo.source === 'gptmaker') {
      logToSupabase('error', 'gptmaker_error', { messageId, errorCode: errInfo.errorCode, source: 'gptmaker', httpStatus: errInfo.status })
    } else if (errInfo.source === 'zap_api') {
      logToSupabase('error', 'provider_accept_error', { messageId, errorCode: errInfo.errorCode, source: 'zap_api', httpStatus: errInfo.status })
    }

    await markFailedAndCleanup(messageId, errInfo)
    return
  }

  // Ponto sem volta: a ZAP-API já aceitou a mensagem. Nenhum caminho a partir
  // daqui chama mark_failed nem replyOnWhatsApp de novo para este messageId.
  if (messageId) {
    await confirmCompletion(messageId)
  }

  const elapsedMs = Math.round(performance.now() - start)
  log('🏁 Fluxo completo', { latenciaTotalMs: elapsedMs })
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(404).end()
    return
  }

  // Só a rota exata POST /webhook/<segredo> segue adiante. A rota antiga
  // POST /webhook (sem segredo) e qualquer segredo incorreto recebem o mesmo
  // 404 — nunca revela qual foi o motivo, nunca loga o path nem o valor recebido.
  const pathname = (req.url || '').split('?')[0]
  const match = /^\/webhook\/([^/]+)$/.exec(pathname)
  let candidateSecret = null
  if (match) {
    try {
      candidateSecret = decodeURIComponent(match[1])
    } catch {
      candidateSecret = null // path malformado — trata como segredo inválido, sem logar
    }
  }
  if (!candidateSecret || !isValidWebhookSecret(candidateSecret)) {
    res.writeHead(404).end()
    return
  }

  let body = ''
  req.on('data', (chunk) => (body += chunk))
  req.on('end', () => {
    // Responde 200 imediatamente — não deixa a ZAP-API esperando o processamento
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true }))

    let payload
    try {
      payload = JSON.parse(body)
    } catch {
      log('❌ Payload inválido (não é JSON)', { bodyLength: body.length })
      return
    }

    log('🔔 Webhook recebido', redactPayloadForLog(payload))
    handleIncoming(payload).catch((err) => {
      log('❌ Erro não tratado', { message: err.message })
      logToSupabase('error', 'unhandled_error', { source: 'bridge' })
    })
  })
})

server.listen(PORT, () => {
  log(`🚀 Bridge POC ouvindo na porta ${PORT} (rota protegida por segredo de path — ver WEBHOOK_PATH_SECRET no README)`)
})

// Exports só para testabilidade (Fase 3, Etapa 3.6) — nenhum consumidor de
// produção real importa este módulo, ele só roda como processo standalone
// (ver README). `server` é exportado só para os testes fecharem a porta
// (server.close()) ao final da suíte, evitando handle solto.
export { handleIncoming, server }
