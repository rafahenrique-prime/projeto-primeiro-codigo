/**
 * api/_storyContext.js — recupera o contexto de Story (Instagram) de uma conversa
 * do GPT Maker, via API não documentada `GET /v2/chat/{chatId}/messages`,
 * validada empiricamente em 2026-08-30 (chat_id do defaultFieldKey da Action
 * bate exatamente com o chatId aceito por esse endpoint).
 *
 * Correlação: usa SOMENTE a mensagem role=user mais recente (maior `time`).
 * Nunca olha mensagens mais antigas, mesmo que tenham metadata de Story —
 * comprovado por teste real que o storyId muda por evento (Stories diferentes
 * geram storyId diferentes na mesma sessão), então a mensagem mais recente já
 * é a correlação correta; olhar pra trás arriscaria vazar o Story errado pro
 * assunto novo do cliente. Esta seleção NÃO muda na Etapa 0B (Story Vision
 * Trace) — só instrumentação, nenhuma correção de comportamento aqui.
 *
 * Fail-safe: qualquer falha (timeout, HTTP não-200, chatId ausente, mensagem
 * sem metadata de Story) nunca lança exceção, nunca bloqueia o fluxo normal
 * do webhook.
 *
 * Contrato de retorno (Etapa 0B — sempre um objeto, nunca null, pra permitir
 * observabilidade honesta no chamador sem inventar estado):
 *   { status: 'FOUND', storyId, storyMediaUrl, storyMediaType }
 *   { status: 'NO_STORY_IN_LATEST_MESSAGE' }  — resposta válida, mas a última
 *     mensagem de usuário não tem metadata de Story (ou não há mensagem de
 *     usuário nenhuma) — é o caso mais comum: Story efêmero, sem story nesta
 *     conversa, ou 2ª+ mensagem depois do Story.
 *   { status: 'GPTMAKER_FETCH_ERROR' }  — a chamada ao GPT Maker não pôde ser
 *     confiada (timeout, erro de rede, HTTP não-200, token ausente, resposta
 *     que não é um array de mensagens) — não é o mesmo que "sem Story",
 *     é "não sabemos se tinha Story".
 */

const GPTMAKER_MESSAGES_TIMEOUT_MS = 2500

export async function getStoryContext(chatId) {
  if (!chatId || typeof chatId !== 'string') return { status: 'NO_STORY_IN_LATEST_MESSAGE' }

  const token = process.env.VITE_GPTMAKER_TOKEN
  if (!token) return { status: 'GPTMAKER_FETCH_ERROR' }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), GPTMAKER_MESSAGES_TIMEOUT_MS)

  try {
    const res = await fetch(`https://api.gptmaker.ai/v2/chat/${encodeURIComponent(chatId)}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) return { status: 'GPTMAKER_FETCH_ERROR' }

    const mensagens = await res.json()
    if (!Array.isArray(mensagens)) return { status: 'GPTMAKER_FETCH_ERROR' }
    if (mensagens.length === 0) return { status: 'NO_STORY_IN_LATEST_MESSAGE' }

    const mensagensDeUsuario = mensagens.filter(m => m && m.role === 'user' && typeof m.time === 'number')
    if (mensagensDeUsuario.length === 0) return { status: 'NO_STORY_IN_LATEST_MESSAGE' }

    const ultima = mensagensDeUsuario.reduce((a, b) => (b.time > a.time ? b : a))

    const meta = ultima.metadata
    if (!meta || !meta.storyId || !meta.storyMediaUrl) return { status: 'NO_STORY_IN_LATEST_MESSAGE' }

    return {
      status: 'FOUND',
      storyId: meta.storyId,
      storyMediaUrl: meta.storyMediaUrl,
      storyMediaType: meta.storyMediaType || null,
    }
  } catch (err) {
    clearTimeout(timeout)
    // Nunca loga token nem storyMediaUrl — só o tipo genérico da falha.
    console.warn('[StoryContext] indisponível, seguindo sem Story:', err.name === 'AbortError' ? 'timeout' : 'erro')
    return { status: 'GPTMAKER_FETCH_ERROR' }
  }
}
