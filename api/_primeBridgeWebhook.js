/**
 * api/_primeBridgeWebhook.js
 *
 * Helper privado (prefixo "_" — nunca vira Function própria) — webhook
 * REAL da PRIME Bridge Serverless, destino do evento message.received da
 * ZAP-API (ver docs/integrations/PRIME-BRIDGE-POC.md e
 * poc/zap-gptmaker-bridge/README.md). Substitui as POCs 1/2A/2B.1/2B.2
 * (casca e núcleo já validados separadamente) por um único handler
 * definitivo.
 *
 * Contrato de segurança, idêntico em espírito ao server.mjs local: só
 * aceita POST; exige ?secret=<WEBHOOK_PATH_SECRET> comparado em tempo
 * constante; qualquer método ou segredo incorretos respondem 404 idêntico,
 * nunca revelando qual foi o motivo da rejeição. Responde 200 imediatamente
 * e processa o payload em segundo plano via waitUntil(handleIncoming(...)).
 *
 * Nunca loga segredo, token, ou o objeto de config inteiro.
 */

import { timingSafeEqual } from 'node:crypto'
import { waitUntil } from '@vercel/functions'
import { getBridgeConfig, handleIncoming } from '../poc/zap-gptmaker-bridge/bridgeCore.js'

/**
 * Comparação de tempo constante — mesma lógica de isValidWebhookSecret já
 * usada em poc/zap-gptmaker-bridge/server.mjs, adaptada aqui porque o
 * segredo chega via query string, não via segmento de path (rota real é
 * sempre o dispatcher ?tool=, para não criar uma 13ª Function).
 */
function isValidWebhookSecret(candidate, expectedSecret) {
  if (typeof expectedSecret !== 'string' || expectedSecret.length === 0) return false
  if (typeof candidate !== 'string' || candidate.length === 0) return false
  const expected = Buffer.from(expectedSecret)
  const received = Buffer.from(candidate)
  if (expected.length !== received.length) return false
  return timingSafeEqual(expected, received)
}

/**
 * Handler da rota do webhook real — recebe (req, res) direto, no mesmo
 * padrão já usado pelos outros branches de api/system-tools.js.
 */
export async function runPrimeBridgeWebhook(req, res) {
  if (req.method !== 'POST') {
    return res.status(404).end()
  }

  const webhookPathSecret = process.env.WEBHOOK_PATH_SECRET
  const candidateSecret = typeof req.query?.secret === 'string' ? req.query.secret : null

  if (!isValidWebhookSecret(candidateSecret, webhookPathSecret)) {
    return res.status(404).end()
  }

  const payload = req.body
  if (!payload || typeof payload !== 'object') {
    return res.status(404).end()
  }

  // Responde 200 imediatamente — não deixa a ZAP-API esperando o processamento.
  res.status(200).json({ ok: true })

  // getBridgeConfig(process.env) é chamada aqui, no momento da requisição —
  // nunca capturada no topo do módulo (ver bridgeCore.js). handleIncoming
  // roda em segundo plano via waitUntil, sobrevivendo à resposta já enviada.
  const config = getBridgeConfig(process.env)
  waitUntil(
    handleIncoming(payload, { config }).catch((err) => {
      console.error('[prime-bridge-webhook] ❌ Erro não tratado', { message: err?.message })
    })
  )
}
