// POC isolada — ponte ZAP-API Trial (zap-api.tech) <-> GPTMaker Conversation API (Gabi teste).
// Não depende de nenhum arquivo do projeto principal. Sem dependências externas (só Node built-in).
// Uso: veja README.md nesta pasta.

import http from 'node:http'

const PORT = process.env.PORT || 3344

const AGENT_ID = process.env.AGENT_ID
const GPT_TOKEN = process.env.GPT_TOKEN
const ZAPI_INSTANCE_ID = process.env.ZAPI_INSTANCE_ID
const ZAPI_TOKEN = process.env.ZAPI_TOKEN
const ZAPI_BASE_URL = process.env.ZAPI_BASE_URL || 'https://api.zap-api.tech/v1'
const DRY_RUN = process.env.DRY_RUN === 'true'

const required = { AGENT_ID, GPT_TOKEN, ZAPI_INSTANCE_ID, ZAPI_TOKEN }
for (const [key, value] of Object.entries(required)) {
  if (!value) {
    console.error(`❌ Falta variável de ambiente: ${key}`)
    process.exit(1)
  }
}

// Dedupe em memória — some quando o processo é encerrado (POC descartável)
const seenMessageIds = new Set()

function log(step, data) {
  const ts = new Date().toISOString()
  console.log(`[${ts}] ${step}`, data ?? '')
}

async function askGabi(phone, prompt) {
  const url = `https://api.gptmaker.ai/v2/agent/${AGENT_ID}/conversation`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GPT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ contextId: phone, prompt }),
  })
  const json = await res.json()
  if (!res.ok || json.success === false) {
    throw new Error(`GPTMaker respondeu ${res.status}: ${JSON.stringify(json)}`)
  }
  return json.message
}

async function replyOnWhatsApp(phone, message) {
  const url = `${ZAPI_BASE_URL}/instances/${ZAPI_INSTANCE_ID}/send`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ZAPI_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ phone, type: 'text', body: message }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(`ZAP-API /send respondeu ${res.status}: ${JSON.stringify(json)}`)
  }
  return json
}

// A ZAP-API separa eventos de entrada ("message.received") e saída ("message.sent").
// Como só tratamos "message.received", a nossa própria resposta (que gera "message.sent")
// nunca é reprocessada — não existe risco de loop por construção.
async function handleIncoming(payload) {
  const start = performance.now()
  const { event, data } = payload

  if (event !== 'message.received') {
    log('⏭️  Ignorado (evento não é message.received)', { event })
    return
  }

  const { messageId, phone: phoneField, from, type, body: text } = data || {}
  const phone = phoneField || from

  if (!phone) {
    log('⏭️  Ignorado (payload sem telefone — sem data.phone nem data.from)', { messageId })
    return
  }

  if (data?.fromMe === true) {
    log('⏭️  Ignorado (fromMe=true — mensagem própria)', { messageId, phone })
    return
  }

  if (type !== 'text' || !text) {
    log('⏭️  Ignorado (não é mensagem de texto)', { messageId, phone, type })
    return
  }

  if (messageId && seenMessageIds.has(messageId)) {
    log('⏭️  Ignorado (messageId duplicado)', { messageId })
    return
  }
  if (messageId) seenMessageIds.add(messageId)

  log('📩 Mensagem recebida', { messageId, phone, texto: text })

  if (DRY_RUN) {
    log('🧪 DRY_RUN ativo — não vai chamar GPTMaker nem responder no WhatsApp')
    return
  }

  try {
    log('▶️  Chamando Conversation API (Gabi teste)...', { contextId: phone })
    const reply = await askGabi(phone, text)
    log('✅ Gabi respondeu', { reply })

    log('▶️  Enviando resposta via ZAP-API /send...')
    await replyOnWhatsApp(phone, reply)
    log('✅ Resposta enviada ao WhatsApp')

    const elapsedMs = Math.round(performance.now() - start)
    log('🏁 Fluxo completo', { latenciaTotalMs: elapsedMs })
  } catch (err) {
    log('❌ Erro no processamento', { message: err.message })
  }
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/webhook') {
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
      log('❌ Payload inválido (não é JSON)', { body })
      return
    }

    log('🔔 Webhook recebido (raw)', payload)
    handleIncoming(payload).catch((err) => log('❌ Erro não tratado', { message: err.message }))
  })
})

server.listen(PORT, () => {
  log(`🚀 Bridge POC ouvindo em http://localhost:${PORT}/webhook`)
})
