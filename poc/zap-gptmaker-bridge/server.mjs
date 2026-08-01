// POC isolada — ponte ZAP-API Trial (zap-api.tech) <-> GPTMaker Conversation API (Gabi teste).
// Não depende de nenhum arquivo do projeto principal. Sem dependências externas (só Node built-in).
// Uso: veja README.md nesta pasta.
//
// A partir da POC 2A, este arquivo é só a CASCA HTTP local — toda a lógica
// de negócio/integrações vive em bridgeCore.js (que pode ser importado sem
// efeitos colaterais em outros ambientes, ex. uma futura Vercel Function).
// Aqui ficam, exclusivamente: leitura+validação fatal de env no boot local
// (comportamento já existente, preservado), proteção de rota por segredo de
// path, http.createServer/server.listen, parsing HTTP, e resposta HTTP.

import http from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { getBridgeConfig, validateRequiredEnv, handleIncoming, log, redactPayloadForLog, logToSupabase } from './bridgeCore.js'

const PORT = process.env.PORT || 3344

// --- Segredo de path do webhook (proteção temporária, Fase 2B.1) ---
// Obrigatório. Sem ele o servidor não inicia — nunca aceita webhook desprotegido por padrão.
// Exclusivo da casca HTTP local — nunca usado por bridgeCore.js.
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

// --- Validação fatal no boot local (POC 2A) ---
// Comportamento idêntico ao anterior: cada variável obrigatória ausente é
// logada individualmente e o processo é encerrado. getBridgeConfig()/
// validateRequiredEnv() são só leitura/validação puras (vivem em
// bridgeCore.js, nunca chamam process.exit sozinhas) — a decisão de
// encerrar o processo por variável ausente é exclusiva desta casca local.
const config = getBridgeConfig()
const validation = validateRequiredEnv(config)
if (!validation.ok) {
  for (const missing of validation.missing) {
    console.error(missing.message)
  }
  process.exit(1)
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
      logToSupabase(config, 'error', 'unhandled_error', { source: 'bridge' })
    })
  })
})

server.listen(PORT, () => {
  log(`🚀 Bridge POC ouvindo na porta ${PORT} (rota protegida por segredo de path — ver WEBHOOK_PATH_SECRET no README)`)
})

// Exports só para testabilidade (Fase 3, Etapa 3.6) — nenhum consumidor de
// produção real importa este módulo, ele só roda como processo standalone
// (ver README). `server` é exportado só para os testes fecharem a porta
// (server.close()) ao final da suíte, evitando handle solto. `handleIncoming`
// é reexportado de bridgeCore.js — mesma API pública de antes.
export { handleIncoming, server }
