// api/message-router-probe.js
//
// Fase 2C.0 — probe temporário e isolado para observar o payload real do
// gatilho "Nova mensagem" (onNewMessage) do GPT Maker, sem tocar em nenhum
// dado ou fluxo de produção. Responsabilidade única: registrar (com
// sanitização) o formato do evento recebido. NUNCA chama GPT Maker, Supabase,
// nem qualquer módulo comercial do projeto — zero imports além do módulo
// nativo `crypto` (usado só para gerar hash curto de comparação de IDs).
//
// Regra dura do handler: nada roda depois de res.status(...) — o runtime da
// Vercel pode encerrar a função assim que a resposta é enviada, então todo o
// trabalho (sanitizar + logar) acontece ANTES de responder.
//
// Remover este arquivo ao final do experimento (ver plano da Fase 2C.0).

import { createHash } from 'crypto'

const MAX_DEPTH = 4
const MAX_ARRAY_ITEMS = 20
const MAX_STRING_SAFETY = 300 // corte defensivo antes de qualquer truncamento específico — evita logar base64/binário grande por engano
const MAX_CONTENT_LENGTH = 80
const ALLOWED_HEADERS = ['content-type', 'user-agent']

// Nomes de campo cujo VALOR nunca é logado, mesmo mascarado — substring,
// case-insensitive, conforme especificado (inclui "key" isolado, que também
// cobre apikey/api_key por conter essa substring).
const SECRET_KEY_PATTERN = /authorization|cookie|token|secret|password|apikey|api_key|key/i
const PHONE_KEY_PATTERN = /telefone|phone|celular|whatsapp/i
const CONTENT_KEY_PATTERN = /message|text|content|pergunta|prompt|texto|caption/i

// Heurística de "parece um identificador de evento/conversa" — sufixo "id"
// (cobre chatId, contextId, messageId, conv_id, eventId). Simplificação
// conhecida e aceita: também casa com nomes que terminam em "id" por
// coincidência (ex.: "valid") — pior efeito colateral é hashear um valor não
// sensível à toa, nunca vazar algo. Aceitável num probe de diagnóstico
// temporário.
const ID_KEY_SUFFIX_PATTERN = /id$/i

function classifyKey(rawKey) {
  const k = String(rawKey).toLowerCase()
  if (SECRET_KEY_PATTERN.test(k)) return 'secret'
  if (PHONE_KEY_PATTERN.test(k)) return 'phone'
  if (ID_KEY_SUFFIX_PATTERN.test(k)) return 'id'
  if (CONTENT_KEY_PATTERN.test(k)) return 'content'
  return 'other'
}

function maskPhone(value) {
  const digits = String(value).replace(/\D/g, '')
  if (!digits) return '[phone:sem_digitos]'
  const keep = digits.slice(-4)
  return `***${keep}`
}

// Hash curto e determinístico — o mesmo valor de entrada sempre gera o mesmo
// hash, permitindo comparar igualdade de contextId/chatId/messageId entre
// eventos diferentes sem nunca registrar o valor real.
function shortHash(value) {
  const hash = createHash('sha256').update(String(value)).digest('hex')
  return `h:${hash.slice(0, 10)}`
}

function truncateContent(value, max = MAX_CONTENT_LENGTH) {
  const str = String(value)
  return str.length > max ? `${str.slice(0, max)}…[truncated]` : str
}

function sanitizeValue(key, value, depth) {
  if (value === null || value === undefined) return value
  if (depth > MAX_DEPTH) return '[profundidade_maxima_excedida]'

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS)
    const sanitized = items.map((item, i) => sanitizeValue(`${key}[${i}]`, item, depth + 1))
    if (value.length > MAX_ARRAY_ITEMS) {
      sanitized.push(`[+${value.length - MAX_ARRAY_ITEMS}_itens_omitidos]`)
    }
    return sanitized
  }

  if (typeof value === 'object') {
    const out = {}
    for (const k of Object.keys(value)) {
      out[k] = sanitizeValue(k, value[k], depth + 1)
    }
    return out
  }

  const kind = classifyKey(key)

  if (typeof value === 'string') {
    const safe = value.length > MAX_STRING_SAFETY ? value.slice(0, MAX_STRING_SAFETY) : value
    if (kind === 'secret') return '[REDACTED]'
    if (kind === 'phone') return maskPhone(safe)
    if (kind === 'id') return shortHash(safe)
    return truncateContent(safe) // 'content' e 'other' recebem o mesmo corte defensivo
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    if (kind === 'secret') return '[REDACTED]'
    if (kind === 'id') return shortHash(String(value))
    return value
  }

  return '[tipo_nao_suportado]'
}

function sanitizeBody(body) {
  if (!body || typeof body !== 'object') {
    return { _valor_bruto_nao_objeto: typeof body }
  }
  const out = {}
  for (const k of Object.keys(body)) {
    out[k] = sanitizeValue(k, body[k], 1)
  }
  return out
}

function sanitizeHeaders(headers) {
  const out = {}
  for (const name of ALLOWED_HEADERS) {
    const value = headers?.[name]
    if (value) out[name] = String(value).slice(0, 120)
  }
  return out
}

export default function handler(req, res) {
  // 1. Validar método HTTP
  if (req.method === 'GET') {
    // Healthcheck simples — nunca loga evento (não é uma mensagem real)
    return res.status(200).json({ ok: true, probe: 'message-router-probe', ready: true })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, erro: 'Método não permitido' })
  }

  // 2. Receber req.body (já parseado pelo runtime da Vercel)
  // 3. Sanitizar em memória — nunca logar req.body/req.headers direto
  const safeHeaders = sanitizeHeaders(req.headers)
  const safeBody = sanitizeBody(req.body)
  const fieldNames = req.body && typeof req.body === 'object' ? Object.keys(req.body) : []

  const logEntry = {
    received_at: new Date().toISOString(),
    method: req.method,
    content_type: safeHeaders['content-type'] || null,
    user_agent: safeHeaders['user-agent'] || null,
    field_names: fieldNames,
    body: safeBody,
  }

  // 4. Emitir UM único console.log estruturado — antes da resposta
  console.log('[PROBE_2C0]', JSON.stringify(logEntry))

  // 5. Responder — nada roda depois disto
  return res.status(200).json({ ok: true })
}
