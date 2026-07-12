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
// Nunca chama GPT Maker, nunca envia mensagem, nunca lê images/audios/
// documents, nunca cria migration, nunca escreve fora do que
// _profileLearning.js já faz (só size).

import { learnSizeFromMessage } from './_profileLearning.js'

function logEvent(event) {
  console.log('[onnewmessage]', JSON.stringify({ event }))
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

  // (4) Encaminha pra _profileLearning.js — aguardado, não fire-and-forget.
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
