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
 * assunto novo do cliente.
 *
 * Fail-safe: qualquer falha (timeout, HTTP não-200, chatId ausente, mensagem
 * sem metadata de Story) retorna null — nunca lança exceção, nunca bloqueia
 * o fluxo normal do webhook.
 */

const GPTMAKER_MESSAGES_TIMEOUT_MS = 2500

export async function getStoryContext(chatId) {
  if (!chatId || typeof chatId !== 'string') return null

  const token = process.env.VITE_GPTMAKER_TOKEN
  if (!token) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), GPTMAKER_MESSAGES_TIMEOUT_MS)

  try {
    const res = await fetch(`https://api.gptmaker.ai/v2/chat/${encodeURIComponent(chatId)}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) return null

    const mensagens = await res.json()
    if (!Array.isArray(mensagens) || mensagens.length === 0) return null

    const mensagensDeUsuario = mensagens.filter(m => m && m.role === 'user' && typeof m.time === 'number')
    if (mensagensDeUsuario.length === 0) return null

    const ultima = mensagensDeUsuario.reduce((a, b) => (b.time > a.time ? b : a))

    const meta = ultima.metadata
    if (!meta || !meta.storyId || !meta.storyMediaUrl) return null

    return {
      storyId: meta.storyId,
      storyMediaUrl: meta.storyMediaUrl,
      storyMediaType: meta.storyMediaType || null,
    }
  } catch (err) {
    clearTimeout(timeout)
    // Nunca loga token nem storyMediaUrl — só o tipo genérico da falha.
    console.warn('[StoryContext] indisponível, seguindo sem Story:', err.name === 'AbortError' ? 'timeout' : 'erro')
    return null
  }
}
