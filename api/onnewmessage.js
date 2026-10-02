// Alvo do gatilho de sistema "Nova mensagem" (onNewMessage) do GPT Maker —
// dispara em TODA mensagem, cliente ou agente, diferente da Ação "Buscar
// Produtos" (api/webhook.js, que continua intocada). Responsabilidade única:
// filtrar e encaminhar mensagens de cliente com declaração de tamanho pra
// api/_profileLearning.js. Rota fina — nenhuma lógica de detecção de
// tamanho, reconciliação de perfil ou chamada de RPC vive aqui.
//
// Execução AGUARDADA, não fire-and-forget: o handler dá `await` em
// learnSizeFromMessage() e só responde depois que ela conclui (ou do
// próprio timeout interno dela, ~3000ms, já testado na Etapa 3). O fato de
// o GPT Maker provavelmente ignorar o corpo da resposta (confirmado na
// Fase 2C.0 — onNewMessage é fire-and-forget do lado de quem envia) não
// muda a semântica de como este handler processa o evento: ele espera a
// conclusão real antes de responder, não dispara e esquece.
//
// Fan-out CI Insight V2: após os filtros de role/IDs/texto, publica em
// background SOMENTE { contextId, messageId, role, channel } no Base44.
// Nunca envia texto, telefone ou mídia. É fail-open e não altera a Fase 2C.
//
// Nunca chama GPT Maker, nunca envia mensagem, nunca lê images/audios/
// documents, nunca cria migration, nunca escreve fora do que
// _profileLearning.js já faz (só size).

import { createHash } from 'node:crypto'
import { waitUntil } from '@vercel/functions'
import { learnSizeFromMessage } from './_profileLearning.js'

const CI_INSIGHT_SIGNAL_URL = 'https://igniteprime.base44.app/functions/ciInsightInboundSignal'
const CI_INSIGHT_SIGNAL_TIMEOUT_MS = 2500
const CI_INSIGHT_SIGNAL_RETRY_DELAY_MS = 700

// PRIME ALERTA V2.4 LAB — sinal de mudança de estado do chat.
// PRIME ALERTA V2.4 LAB — preview env refresh after secret configuration.
// PRIME ALERTA V2.4 candidate preview refreshed after candidate secret.
// PRIME ALERTA V2.4 candidate preview refreshed after candidate secret resync.
// Não envia texto, telefone nem mídia. O endpoint Base44 consulta o próprio
// GPTMaker e usa chat.humanTalk como fonte de verdade.
const FAST_HANDOFF_SIGNAL_URL = 'https://igniteprime.base44.app/functions/operationalFastHandoffHumanStateSignal'
const FAST_HANDOFF_SIGNAL_TIMEOUT_MS = 12000
const FAST_HANDOFF_SIGNAL_RETRY_DELAY_MS = 700
const FAST_HANDOFF_PILOT_CONTEXT_HASH = '0da8aef8180c01cdd4f12f6eb2fd2367e72f27bf118963bcfa275feccf417f86'

function logEvent(event) {
  console.log('[onnewmessage]', JSON.stringify({ event }))
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function postCiInsightSignalOnce(payload) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CI_INSIGHT_SIGNAL_TIMEOUT_MS)
  try {
    const res = await fetch(CI_INSIGHT_SIGNAL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    return res.status
  } catch (err) {
    return err?.name === 'AbortError' ? 408 : 0
  } finally {
    clearTimeout(timeout)
  }
}

async function postCiInsightSignal(payload) {
  let status = await postCiInsightSignalOnce(payload)

  // Única repetição permitida: o webhook pode chegar alguns ms antes de a
  // nova message ficar visível no GET /v2/chat/{id}/messages do GPTMaker.
  if (status === 409) {
    await sleep(CI_INSIGHT_SIGNAL_RETRY_DELAY_MS)
    status = await postCiInsightSignalOnce(payload)
  }

  if (status >= 200 && status < 300) {
    console.log('[onnewmessage][ci-insight]', JSON.stringify({ event: 'signal_delivered', status }))
  } else {
    console.warn('[onnewmessage][ci-insight]', JSON.stringify({ event: 'signal_failed', status }))
  }
}

function scheduleCiInsightSignal({ contextId, messageId, channel }) {
  const task = postCiInsightSignal({
    contextId,
    messageId,
    role: 'user',
    channel,
  })

  // Mesmo padrão fail-open já usado pelo projeto: nunca bloqueia a resposta
  // do webhook nem transforma falha de telemetria/sinal em falha do atendimento.
  try {
    waitUntil(task)
  } catch {
    void task
  }
}

function isFastHandoffPilotContext(contextId) {
  if (typeof contextId !== 'string' || !contextId.trim()) return false
  const hash = createHash('sha256').update(contextId.trim()).digest('hex')
  return hash === FAST_HANDOFF_PILOT_CONTEXT_HASH
}

async function postFastHandoffStateSignalOnce(payload) {
  const secretName =
    process.env.VERCEL_ENV === 'production'
      ? 'PRIME_FAST_HANDOFF_PRODUCTION_PILOT_SECRET'
      : 'PRIME_FAST_HANDOFF_CANDIDATE_SECRET'
  const rawSecret = process.env[secretName]
  const token = typeof rawSecret === 'string' ? rawSecret.trim() : ''

  if (!token || !payload?.contextId) {
    return 0
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FAST_HANDOFF_SIGNAL_TIMEOUT_MS)
  try {
    const url = new URL(FAST_HANDOFF_SIGNAL_URL)
    url.searchParams.set('token', token)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    return response.status
  } catch (err) {
    return err?.name === 'AbortError' ? 408 : 0
  } finally {
    clearTimeout(timeout)
  }
}

async function postFastHandoffStateSignal(payload) {
  let status = await postFastHandoffStateSignalOnce(payload)

  // O evento pode chegar alguns ms antes de o estado atualizado do chat
  // ficar visível na API do GPTMaker. Uma única repetição curta é suficiente.
  if (status === 409) {
    await sleep(FAST_HANDOFF_SIGNAL_RETRY_DELAY_MS)
    status = await postFastHandoffStateSignalOnce(payload)
  }

  if (status >= 200 && status < 300) {
    console.log('[onnewmessage][fast-handoff-lab]', JSON.stringify({ event: 'signal_delivered', status }))
  } else if (status !== 0) {
    console.warn('[onnewmessage][fast-handoff-lab]', JSON.stringify({ event: 'signal_failed', status }))
  }
}

function scheduleFastHandoffStateSignal({ contextId, messageId, role, channel }) {
  if (!isFastHandoffPilotContext(contextId)) return

  const task = postFastHandoffStateSignal({
    contextId,
    messageId,
    role,
    channel,
  })

  // Fail-open: nunca bloqueia o webhook original nem altera o atendimento.
  try {
    waitUntil(task)
  } catch {
    void task
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, route: 'onnewmessage', ready: true })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, erro: 'Método não permitido' })
  }

  // Body defensivo: aceita só objeto não-array. null/undefined/array/string/
  // número viram objeto vazio, nunca lançam exceção nas leituras abaixo.
  const body =
    req.body &&
    typeof req.body === 'object' &&
    !Array.isArray(req.body)
      ? req.body
      : {}

  const role = typeof body.role === 'string' ? body.role.trim().toLowerCase() : null
  const contextId = typeof body.contextId === 'string' ? body.contextId.trim() : null
  const messageId = typeof body.messageId === 'string' ? body.messageId.trim() : null
  const message = typeof body.message === 'string' ? body.message : '' // preservado como texto; trim() só pra checar vazio
  const contactPhone = typeof body.contactPhone === 'string'
    ? (body.contactPhone.trim() || null)
    : null
  const channel = typeof body.channel === 'string' ? body.channel : null // _profileLearning.js já normaliza

  // PRIME ALERTA V2.4 LAB: observa qualquer evento do chat antes do filtro
  // de role. É apenas fan-out fail-open e não muda a lógica original abaixo.
  scheduleFastHandoffStateSignal({ contextId, messageId, role, channel })

  // (1) Filtro de role — primeira coisa, antes de qualquer outra checagem.
  //     Garante que learnSizeFromMessage()/upsertIdentity() nunca são
  //     chamadas, nenhum fetch/acesso ao Supabase acontece, para eventos
  //     que não são do cliente.
  if (role !== 'user') {
    logEvent('ignored_non_user_role')
    return res.status(200).json({ ok: true })
  }

  // (2) Sem contextId ou messageId (inclusive só espaços, já eliminados
  //     pelo trim acima) — sem como identificar perfil nem satisfazer a
  //     chave de dedup exigida pela RPC. Não vale a pena chamar a cadeia.
  if (!contextId || !messageId) {
    logEvent('ignored_missing_ids')
    return res.status(200).json({ ok: true })
  }

  // (3) Mensagem sem texto (imagem sem legenda, áudio, documento, ou
  //     mensagem vazia/só espaços) — nenhum aprendizado nesta versão.
  if (!message.trim()) {
    logEvent('ignored_no_text')
    return res.status(200).json({ ok: true })
  }

  // (4) Fan-out CI Insight — não envia texto/telefone/mídia e não bloqueia.
  scheduleCiInsightSignal({ contextId, messageId, channel })

  // (5) Encaminha pra _profileLearning.js — aguardado, não fire-and-forget.
  //     Nenhuma lógica de extractSize duplicada aqui.
  try {
    await learnSizeFromMessage({ contextId, telefone: contactPhone, channel, texto: message, messageId })
  } catch {
    // Nunca registra err.message, stack, payload, IDs, telefone ou texto —
    // só o evento fixo. learnSizeFromMessage() já é desenhada pra nunca
    // lançar (Etapa 3), isto é defesa extra, não caminho esperado.
    console.warn('[onnewmessage]', JSON.stringify({ event: 'learning_unexpected_failure' }))
  }

  return res.status(200).json({ ok: true })
}
