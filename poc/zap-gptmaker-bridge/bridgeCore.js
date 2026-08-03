// PRIME Bridge — bridgeCore.js (POC 2A, extração estrutural)
//
// Núcleo reutilizável da Bridge: toda a lógica de negócio e integrações
// (Gatekeeper/Tool Router/Context Builder já vivem em seus próprios
// arquivos; aqui fica handleIncoming e tudo que ele usa diretamente).
//
// Regra de desenho, obrigatória: NENHUMA linha de nível superior deste
// módulo pode ter efeito colateral. Isso significa, especificamente:
//   - nenhum process.exit();
//   - nenhum http.createServer()/server.listen();
//   - nenhuma chamada de rede (fetch) executada só por importar o arquivo;
//   - nenhuma variável de ambiente obrigatória exigida no import — ler
//     process.env é seguro (getBridgeConfig), mas validar e falhar por
//     ausência é responsabilidade de cada consumidor (server.mjs local
//     decide encerrar o processo; uma futura Vercel Function decidiria
//     responder um erro HTTP), nunca deste módulo.
//
// getBridgeConfig(env) é chamada em tempo de execução (dentro de
// handleIncoming, ou explicitamente por um consumidor) — nunca no topo do
// módulo — para que uma instância morna da Vercel nunca fique presa a
// valores de ambiente capturados num import anterior.

import { decide as gatekeeperDecide } from './gatekeeper.js'
import { routeTools } from './toolRouter.js'
import { createToolRegistry } from './tools/index.js'
import { buildContext } from './contextBuilder.js'
import { formatarParaWhatsApp } from './whatsappFormatter.js'

// --- Defaults de timeout (constantes puras, sem env) -----------------------
const DEFAULT_EXTERNAL_TIMEOUT_MS = 10000
const DEFAULT_SUPABASE_TIMEOUT_MS = 3000
const DEFAULT_IGNITE_TOOLS_TIMEOUT_MS = 8000

// --- LIVE_MODE seguro por padrão --------------------------------------------
// Ausência da variável, ou qualquer valor diferente de "true", mantém o modo seguro (sem chamadas reais).
function parseBooleanEnv(raw) {
  if (!raw || typeof raw !== 'string') return false
  return raw.trim().toLowerCase() === 'true'
}

function parseTimeoutEnv(raw, defaultMs, varName) {
  if (!raw) return defaultMs
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`❌ ${varName} inválido (${raw}) — usando padrão de ${defaultMs}ms`)
    return defaultMs
  }
  return n
}

/**
 * Lê a configuração da Bridge a partir de um objeto de ambiente (default:
 * process.env), em tempo de execução — nunca no carregamento do módulo.
 * Só leitura, nunca validação fatal, nunca lança. Variáveis ausentes viram
 * undefined/default, nunca derrubam o processo aqui.
 *
 * @param {NodeJS.ProcessEnv} env
 */
export function getBridgeConfig(env = process.env) {
  return Object.freeze({
    AGENT_ID: env.AGENT_ID,
    GPT_TOKEN: env.GPT_TOKEN,
    ZAPI_INSTANCE_ID: env.ZAPI_INSTANCE_ID,
    ZAPI_TOKEN: env.ZAPI_TOKEN,
    ZAPI_BASE_URL: env.ZAPI_BASE_URL || 'https://api.zap-api.tech/v1',
    // Só para testabilidade local (Fase 2B.5) — comportamento padrão idêntico ao
    // anterior, sem essa variável. Nunca documentado como uso de produção.
    GPTMAKER_BASE_URL: env.GPTMAKER_BASE_URL || 'https://api.gptmaker.ai',
    SUPABASE_URL: env.SUPABASE_URL || env.VITE_SUPABASE_URL,
    SUPABASE_SECRET_KEY: env.SUPABASE_SECRET_KEY,
    LIVE_MODE: parseBooleanEnv(env.LIVE_MODE),
    EXTERNAL_TIMEOUT_MS: parseTimeoutEnv(env.EXTERNAL_TIMEOUT_MS, DEFAULT_EXTERNAL_TIMEOUT_MS, 'EXTERNAL_TIMEOUT_MS'),
    SUPABASE_TIMEOUT_MS: parseTimeoutEnv(env.SUPABASE_TIMEOUT_MS, DEFAULT_SUPABASE_TIMEOUT_MS, 'SUPABASE_TIMEOUT_MS'),
    // IGNITE_PRIME_URL tem fallback só para NEXT_PUBLIC_VERCEL_URL — convenção já
    // existente no projeto (ver CLAUDE.md raiz, ignite-webhook.vercel.app) —
    // nunca um domínio inventado aqui.
    IGNITE_PRIME_URL: env.IGNITE_PRIME_URL || env.NEXT_PUBLIC_VERCEL_URL || null,
    BRIDGE_TOOLS_SECRET: env.BRIDGE_TOOLS_SECRET,
    IGNITE_TOOLS_TIMEOUT_MS: parseTimeoutEnv(env.IGNITE_TOOLS_TIMEOUT_MS, DEFAULT_IGNITE_TOOLS_TIMEOUT_MS, 'IGNITE_TOOLS_TIMEOUT_MS'),
    // FLUXO SIMPLES vs FLUXO COMPLICADO — leitura pura, sem normalizar nem
    // validar aqui (mesma disciplina do resto desta função). Valor cru do
    // env, inclusive se ausente (undefined) ou inválido — validateBridgeMode()
    // é quem decide se está aceitável, nunca esta função.
    BRIDGE_MODE: env.BRIDGE_MODE,
  })
}

/**
 * Validação pura (nunca lança, nunca chama process.exit) das variáveis
 * obrigatórias. Cada consumidor decide o que fazer com o resultado:
 * server.mjs local encerra o processo (comportamento já existente,
 * preservado ali); uma futura Vercel Function responderia um erro HTTP.
 *
 * @param {ReturnType<typeof getBridgeConfig>} config
 * @returns {{ ok: boolean, missing: Array<{ key: string, message: string }> }}
 */
export function validateRequiredEnv(config) {
  const missing = []

  const required = {
    AGENT_ID: config.AGENT_ID,
    GPT_TOKEN: config.GPT_TOKEN,
    ZAPI_INSTANCE_ID: config.ZAPI_INSTANCE_ID,
    ZAPI_TOKEN: config.ZAPI_TOKEN,
  }
  for (const [key, value] of Object.entries(required)) {
    if (!value) {
      missing.push({ key, message: `❌ Falta variável de ambiente: ${key}` })
    }
  }

  if (config.LIVE_MODE && !config.SUPABASE_URL) {
    missing.push({
      key: 'SUPABASE_URL',
      message: '❌ Falta variável de ambiente: SUPABASE_URL (ou VITE_SUPABASE_URL) — obrigatória quando LIVE_MODE=true',
    })
  }
  if (config.LIVE_MODE && !config.SUPABASE_SECRET_KEY) {
    missing.push({
      key: 'SUPABASE_SECRET_KEY',
      message: '❌ Falta variável de ambiente: SUPABASE_SECRET_KEY — obrigatória quando LIVE_MODE=true',
    })
  }

  return { ok: missing.length === 0, missing }
}

/**
 * Validação pura (nunca lança, nunca chama process.exit) de BRIDGE_MODE —
 * mesmo espírito de validateRequiredEnv. Vocabulário fechado: só "simple" ou
 * "complicated" são aceitos. Ausente, vazio, ou qualquer outro valor (typo,
 * maiúscula errada, etc.) é inválido — nunca assume "complicated" por
 * padrão, para nunca cair silenciosamente no fluxo antigo por engano.
 *
 * @param {ReturnType<typeof getBridgeConfig>} config
 * @returns {{ ok: boolean, message?: string }}
 */
export function validateBridgeMode(config) {
  if (config.BRIDGE_MODE === 'simple' || config.BRIDGE_MODE === 'complicated') {
    return { ok: true }
  }
  return {
    ok: false,
    message: `❌ BRIDGE_MODE inválido ou ausente: ${JSON.stringify(config.BRIDGE_MODE)} — valores aceitos: "simple" ou "complicated"`,
  }
}

// Dedupe em memória — some quando o processo é encerrado (POC descartável).
// Numa Vercel Function, cada instância morna mantém isso só enquanto viva —
// é a mesma característica de "segunda camada rápida, não fonte de
// verdade" já documentada abaixo, não um comportamento novo.
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

async function fetchWithTimeout(url, options, timeoutMs) {
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
// estão configurados — nunca lança, nunca exige nada no import do módulo.
// Chamado só de dentro do caminho CONTINUE de handleIncoming, sempre depois
// do LIVE_MODE já ter sido confirmado. Sem as duas variáveis, devolve
// undefined — a ferramenta cai no caminho tool_not_configured já definido na
// Etapa 3.4, sem impedir GPTMaker/ZAP-API de funcionarem normalmente.
function buildRequestToolApi(config) {
  if (!config.IGNITE_PRIME_URL || !config.BRIDGE_TOOLS_SECRET) return undefined

  return (params) => requestConsultarProdutoTool(config.IGNITE_PRIME_URL, config.BRIDGE_TOOLS_SECRET, config.IGNITE_TOOLS_TIMEOUT_MS, params)
}

// Fecha o dedupe persistente em 'failed' e limpa o Set em memória — usado
// tanto pelo caminho CONTINUE (GPTMaker/ZAP-API) quanto por
// ANSWER_WITHOUT_GPTMAKER (ZAP-API), nunca duplicado entre os dois.
async function markFailedAndCleanup(config, messageId, errInfo) {
  if (!messageId) return
  seenMessageIds.delete(messageId) // defensivo — no-op se nunca esteve lá
  const failResult = await processBridgeMessage(config, 'mark_failed', messageId, errInfo.errorCode)
  if (!failResult.ok) {
    log('⚠️  Falha ao registrar mark_failed no Supabase (indisponibilidade)', { messageId })
  }
  logToSupabase(config, 'warning', 'processing_failed', { messageId, errorCode: errInfo.errorCode, source: errInfo.source })
}

// --- Dedupe persistente (Supabase) ---
// Único ponto de contato com o Supabase: chama a RPC process_bridge_message
// (migration 017). Nunca usa Authorization: Bearer — apikey sozinho já
// autentica como service_role (confirmado em docs/SUPABASE.md §3.5).
// Retorna sempre { ok, result?, reason? } — nunca lança exceção — para que o
// chamador decida o fallback sem precisar de try/catch.
async function processBridgeMessage(config, action, messageId, errorCode) {
  const url = `${config.SUPABASE_URL}/rest/v1/rpc/process_bridge_message`
  let res
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          apikey: config.SUPABASE_SECRET_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_action: action, p_message_id: messageId, p_error_code: errorCode ?? null }),
      },
      config.SUPABASE_TIMEOUT_MS
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
async function confirmCompletion(config, messageId) {
  const backoffsMs = [300, 600, 1200]
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await processBridgeMessage(config, 'mark_completed', messageId)

    if (result.ok && result.result === 'completed') {
      seenMessageIds.add(messageId)
      log('✅ mark_completed confirmado', { messageId })
      logToSupabase(config, 'info', 'completed', { messageId })
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
function logToSupabase(config, level, event, details = {}) {
  if (!config.LIVE_MODE || !config.SUPABASE_URL || !config.SUPABASE_SECRET_KEY) return

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
    `${config.SUPABASE_URL}/rest/v1/bridge_operation_logs`,
    {
      method: 'POST',
      headers: {
        apikey: config.SUPABASE_SECRET_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
    },
    config.SUPABASE_TIMEOUT_MS
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

async function askGabi(config, phone, prompt) {
  const url = `${config.GPTMAKER_BASE_URL}/v2/agent/${config.AGENT_ID}/conversation`
  let res
  try {
    res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.GPT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ contextId: phone, prompt }),
    }, config.EXTERNAL_TIMEOUT_MS)
  } catch (err) {
    if (err.name === 'AbortError') {
      throw bridgeError('timeout', 'gptmaker', { message: `sem resposta em ${config.EXTERNAL_TIMEOUT_MS}ms` })
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

async function replyOnWhatsApp(config, phone, message) {
  const url = `${config.ZAPI_BASE_URL}/instances/${config.ZAPI_INSTANCE_ID}/send`
  let res
  try {
    res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.ZAPI_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone, type: 'text', body: message }),
    }, config.EXTERNAL_TIMEOUT_MS)
  } catch (err) {
    if (err.name === 'AbortError') {
      throw bridgeError('timeout', 'zap_api', { message: `sem resposta em ${config.EXTERNAL_TIMEOUT_MS}ms` })
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
// real (o handler HTTP no fim de server.mjs chama handleIncoming(payload) sem
// segundo argumento, reproduzindo exatamente o comportamento padrão):
//   - deps.gatekeeperDecide: substitui decide() do gatekeeper.js real;
//   - deps.requestToolApi: substitui buildRequestToolApi() (evita rede real
//     e leitura de env/segredo real nos testes);
//   - deps.config (POC 2A): substitui getBridgeConfig() — permite injetar
//     configuração de teste sem depender de process.env real.
export async function handleIncoming(payload, deps = {}) {
  const start = performance.now()
  const { event, data } = payload
  const config = deps.config ?? getBridgeConfig()

  if (event !== 'message.received') {
    log('⏭️  Ignorado (evento não é message.received)', { event })
    logToSupabase(config, 'info', 'filtered_wrong_event')
    return
  }

  const { messageId, phone: phoneField, from, type, body: text } = data || {}

  if (data?.fromMe === true) {
    log('⏭️  Ignorado (fromMe=true — mensagem própria)', { messageId, event })
    logToSupabase(config, 'info', 'filtered_from_me', { messageId })
    return
  }

  if (type !== 'text' || !text) {
    log('⏭️  Ignorado (não é mensagem de texto)', { messageId, event, type })
    logToSupabase(config, 'info', 'filtered_not_text', { messageId })
    return
  }

  const rawPhone = phoneField || from

  if (!rawPhone) {
    log('⏭️  Ignorado (payload sem telefone — sem data.phone nem data.from)', { messageId })
    logToSupabase(config, 'warning', 'filtered_no_phone', { messageId })
    return
  }

  const phone = normalizePhone(rawPhone)
  if (!phone) {
    log('⏭️  Ignorado (telefone inválido após normalização)', { messageId, errorCode: 'invalid_phone', source: 'bridge' })
    logToSupabase(config, 'warning', 'filtered_invalid_phone', { messageId, errorCode: 'invalid_phone', source: 'bridge' })
    return
  }

  log('📩 Mensagem recebida', { messageId, phone: maskPhone(phone) })
  logToSupabase(config, 'info', 'received', { messageId })

  if (!config.LIVE_MODE) {
    log('🧪 LIVE_MODE inativo — não vai chamar GPTMaker nem responder no WhatsApp')
    return
  }

  // Dedupe em memória — segunda camada rápida, não a fonte de verdade.
  // Só é alcançada em LIVE_MODE=true (testes em modo seguro nunca tocam o Set).
  if (messageId && seenMessageIds.has(messageId)) {
    log('⏭️  Ignorado (messageId já em processamento nesta execução)', { messageId })
    logToSupabase(config, 'info', 'filtered_duplicate', { messageId })
    return
  }

  if (messageId) {
    const checkResult = await processBridgeMessage(config, 'check_or_start', messageId)

    if (checkResult.ok && (checkResult.result === 'process' || checkResult.result === 'retry_failed' || checkResult.result === 'retry_stale')) {
      log('▶️  Dedupe persistente autorizou processamento', { messageId, result: checkResult.result })
      logToSupabase(config, 'info', 'processing_started', { messageId })
      // Não adiciona ao Set ainda — só depois de mark_completed confirmado,
      // ou imediatamente removido (defensivo) se GPTMaker/ZAP-API falharem.
    } else if (checkResult.ok && checkResult.result === 'already_processing') {
      log('⏭️  Ignorado (already_processing — outra tentativa em andamento)', { messageId })
      logToSupabase(config, 'info', 'filtered_duplicate', { messageId })
      return
    } else if (checkResult.ok && checkResult.result === 'duplicate_completed') {
      seenMessageIds.add(messageId)
      log('⏭️  Ignorado (duplicate_completed)', { messageId })
      logToSupabase(config, 'info', 'filtered_duplicate', { messageId })
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

  // --- Divergência FLUXO SIMPLES / FLUXO COMPLICADO ---
  // Ponto deliberadamente ANTES do Gatekeeper: o Gatekeeper não é transporte
  // (pode gerar BLOCK/IGNORE/ANSWER_WITHOUT_GPTMAKER), o que violaria a
  // garantia do FLUXO SIMPLES de "toda mensagem original vai direto pra Gaby
  // Teste". Tudo acima desta linha (parse do evento, filtros fromMe/tipo,
  // normalização de telefone, dedupe) é comum aos dois modos.
  const modeCheck = validateBridgeMode(config)
  if (!modeCheck.ok) {
    log('❌ BRIDGE_MODE inválido — abortando com segurança', { messageId, BRIDGE_MODE: config.BRIDGE_MODE })
    logToSupabase(config, 'error', 'invalid_bridge_mode', { messageId })
    await markFailedAndCleanup(config, messageId, bridgeError('internal_error', 'bridge', { message: modeCheck.message }))
    return
  }

  if (config.BRIDGE_MODE === 'simple') {
    return simplePipeline(config, { phone, text, messageId, start })
  }

  return complicatedPipeline(config, deps, { phone, text, messageId, start })
}

// --- FLUXO SIMPLES ----------------------------------------------------------
// Transporte mínimo: mensagem original -> Gaby Teste -> resposta original.
// Nunca passa pelo Gatekeeper, Tool Router, consultarProduto,
// continuationDetector, bridge_product_context ou buildContext. v1
// deliberadamente mínima (regra combinada: provar o fluxo ponta a ponta
// primeiro, melhorar depois) — formatarParaWhatsApp fica fora desta versão,
// não é pré-requisito técnico para o envio funcionar.
async function simplePipeline(config, { phone, text, messageId, start }) {
  log('PIPELINE=SIMPLE', { messageId })

  let reply
  try {
    logToSupabase(config, 'info', 'gptmaker_called', { messageId })
    reply = await askGabi(config, phone, text)
    log('✅ Gabi respondeu (simple)', { reply })

    // UX-2 v1 (simple) — última etapa antes do envio: só espaçamento entre
    // linhas, nunca decide conteúdo. Nunca loga o texto em si.
    const replyFormatada = formatarParaWhatsApp(reply)
    log('🎨 whatsappFormatter aplicado (simple)', {
      messageId,
      originalLength: reply.length,
      formattedLength: replyFormatada.length,
    })

    log('▶️  Enviando resposta via ZAP-API /send (simple)...')
    await replyOnWhatsApp(config, phone, replyFormatada)
    log('✅ Resposta enviada ao WhatsApp — provider aceitou (provider_accepted)')
    logToSupabase(config, 'info', 'provider_accepted', { messageId })
  } catch (err) {
    const errInfo = err && err.errorCode
      ? { errorCode: err.errorCode, source: err.source, status: err.status, message: err.message }
      : bridgeError('internal_error', 'bridge', { message: err.message })
    log('❌ Erro no processamento (simple)', errInfo)

    if (errInfo.source === 'gptmaker') {
      logToSupabase(config, 'error', 'gptmaker_error', { messageId, errorCode: errInfo.errorCode, source: 'gptmaker', httpStatus: errInfo.status })
    } else if (errInfo.source === 'zap_api') {
      logToSupabase(config, 'error', 'provider_accept_error', { messageId, errorCode: errInfo.errorCode, source: 'zap_api', httpStatus: errInfo.status })
    }

    await markFailedAndCleanup(config, messageId, errInfo)
    return
  }

  if (messageId) {
    await confirmCompletion(config, messageId)
  }

  const elapsedMs = Math.round(performance.now() - start)
  log('🏁 Fluxo completo (simple)', { latenciaTotalMs: elapsedMs })
}

// --- FLUXO COMPLICADO --------------------------------------------------------
// Comportamento idêntico ao handleIncoming original do HEAD — só extraído
// para uma função própria, sem NENHUMA mudança de lógica, sem nenhuma
// melhoria de outra fase (sem formatter, sem memória, sem knowledge, sem
// continuidade nova, sem lista determinística, sem product context).
async function complicatedPipeline(config, deps, { phone, text, messageId, start }) {
  log('PIPELINE=COMPLICATED', { messageId })

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
    if (messageId) await confirmCompletion(config, messageId)
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
      await replyOnWhatsApp(config, phone, localReply)
      log('✅ Resposta local enviada — provider aceitou (provider_accepted)')
      logToSupabase(config, 'info', 'provider_accepted', { messageId })
    } catch (err) {
      const errInfo = err && err.errorCode
        ? { errorCode: err.errorCode, source: err.source, status: err.status, message: err.message }
        : bridgeError('internal_error', 'bridge', { message: err.message })
      log('❌ Erro ao enviar resposta local (ANSWER_WITHOUT_GPTMAKER)', errInfo)
      logToSupabase(config, 'error', 'provider_accept_error', { messageId, errorCode: errInfo.errorCode, source: 'zap_api', httpStatus: errInfo.status })
      await markFailedAndCleanup(config, messageId, errInfo)
      return
    }
    if (messageId) await confirmCompletion(config, messageId)
    const elapsedMsAns = Math.round(performance.now() - start)
    log('🏁 Fluxo completo (resposta local)', { latenciaTotalMs: elapsedMsAns })
    return
  }

  // decision.action === 'CONTINUE' — segue para Tool Router + Context Builder
  // (Fase 3, Etapas 3.2-3.5) antes de chamar o GPTMaker.
  const requestToolApi = deps.requestToolApi ?? buildRequestToolApi(config)
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
    logToSupabase(config, 'info', 'gptmaker_called', { messageId })
    reply = await askGabi(config, phone, context.prompt)
    log('✅ Gabi respondeu', { reply })

    log('▶️  Enviando resposta via ZAP-API /send...')
    await replyOnWhatsApp(config, phone, reply)
    log('✅ Resposta enviada ao WhatsApp — provider aceitou (provider_accepted)')
    logToSupabase(config, 'info', 'provider_accepted', { messageId })
  } catch (err) {
    const errInfo = err && err.errorCode
      ? { errorCode: err.errorCode, source: err.source, status: err.status, message: err.message }
      : bridgeError('internal_error', 'bridge', { message: err.message })
    log('❌ Erro no processamento', errInfo)

    if (errInfo.source === 'gptmaker') {
      logToSupabase(config, 'error', 'gptmaker_error', { messageId, errorCode: errInfo.errorCode, source: 'gptmaker', httpStatus: errInfo.status })
    } else if (errInfo.source === 'zap_api') {
      logToSupabase(config, 'error', 'provider_accept_error', { messageId, errorCode: errInfo.errorCode, source: 'zap_api', httpStatus: errInfo.status })
    }

    await markFailedAndCleanup(config, messageId, errInfo)
    return
  }

  // Ponto sem volta: a ZAP-API já aceitou a mensagem. Nenhum caminho a partir
  // daqui chama mark_failed nem replyOnWhatsApp de novo para este messageId.
  if (messageId) {
    await confirmCompletion(config, messageId)
  }

  const elapsedMs = Math.round(performance.now() - start)
  log('🏁 Fluxo completo', { latenciaTotalMs: elapsedMs })
}

export { log, redactPayloadForLog, logToSupabase, processBridgeMessage, confirmCompletion }
