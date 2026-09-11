/**
 * api/_storyContext.js — recupera o contexto de Story (Instagram) de uma conversa
 * do GPT Maker, via API não documentada `GET /v2/chat/{chatId}/messages`,
 * validada empiricamente em 2026-08-30 (chat_id do defaultFieldKey da Action
 * bate exatamente com o chatId aceito por esse endpoint).
 *
 * Correlação: prioridade absoluta pra mensagem role=user mais recente (maior
 * `time`) que já tenha sua PRÓPRIA metadata de Story — isso nunca muda,
 * Story novo sempre vence.
 *
 * Correção #3 (2026-09-07, continuidade curta): quando a mensagem mais
 * recente NÃO tem metadata própria, mas é uma continuação curta e imediata
 * (ex.: Story de Bermuda + "Qual valor?" + depois só "Bermuda"), reaproveita
 * o Story anterior válido mais próximo — só quando as 4 condições abaixo são
 * verdadeiras ao mesmo tempo (ver STORY_CONTINUATION_WINDOW_MS/
 * STORY_CONTINUATION_MAX_WORDS): (1) mensagem atual tem entre 1 e 3 palavras;
 * (2) existe mensagem `user` anterior com storyId+storyMediaUrl válidos;
 * (3) é a MAIS PRÓXIMA (maior `time` entre as anteriores) — nunca uma mais
 * antiga se houver uma mais recente também dentro da janela; (4) a diferença
 * de tempo entre a mensagem atual e essa Story anterior é <= 5 minutos.
 * Deliberadamente sem NLP e sem lista de marcas/categorias — só contagem de
 * palavras (proxy: mensagem curta = provável continuação; mensagem longa =
 * pergunta nova de verdade) + janela de tempo curta (evita reaproveitar
 * Story de horas/dias atrás). Risco residual conhecido, não resolvido: uma
 * troca de assunto genuína mas curta e rápida ("Nike?" logo após um Story de
 * Bermuda) ainda seria mal classificada como continuação — não há solução
 * determinística simples pra isso sem entender semântica.
 *
 * Correção #8 (2026-09-11, referência explícita à mídia): mantém a regra
 * curta acima intacta, mas permite reaproveitar o Story anterior por até
 * 30 minutos quando a própria mensagem aponta explicitamente para a mídia
 * anterior (ex.: "esse da foto", "essa imagem", "desse Story"). Pedidos de
 * uma NOVA foto (ex.: "me manda foto do tênis") não qualificam.
 *
 * Fail-safe: qualquer falha (timeout, HTTP não-200, chatId ausente, mensagem
 * sem metadata de Story) nunca lança exceção, nunca bloqueia o fluxo normal
 * do webhook.
 *
 * Contrato de retorno (Etapa 0B — sempre um objeto, nunca null, pra permitir
 * observabilidade honesta no chamador sem inventar estado). Continua idêntico
 * após a Correção #3 — a continuidade curta é 100% transparente pro chamador,
 * que recebe `{ status: 'FOUND', ... }` normalmente, seja Story próprio ou
 * reaproveitado:
 *   { status: 'FOUND', storyId, storyMediaUrl, storyMediaType }
 *   { status: 'NO_STORY_IN_LATEST_MESSAGE' }  — resposta válida, mas a última
 *     mensagem de usuário não tem metadata de Story (ou não há mensagem de
 *     usuário nenhuma) e não qualifica como continuidade curta — é o caso
 *     mais comum: Story efêmero, sem story nesta conversa, ou mensagem longa/
 *     tardia depois do Story.
 *   { status: 'GPTMAKER_FETCH_ERROR' }  — a chamada ao GPT Maker não pôde ser
 *     confiada (timeout, erro de rede, HTTP não-200, token ausente, resposta
 *     que não é um array de mensagens) — não é o mesmo que "sem Story",
 *     é "não sabemos se tinha Story".
 */

const GPTMAKER_MESSAGES_TIMEOUT_MS = 2500

// Correção #3 — constantes da continuidade curta de Story.
export const STORY_CONTINUATION_WINDOW_MS = 5 * 60 * 1000
export const STORY_CONTINUATION_MAX_WORDS = 3

// Correção #8 — referência explícita à mídia permite continuidade mais longa
// sem afrouxar a regra genérica acima. Ex.: "esse da foto", "essa imagem",
// "desse Story". A janela maior só vale com referência textual forte.
export const STORY_MEDIA_REFERENCE_WINDOW_MS = 30 * 60 * 1000
export const STORY_MEDIA_REFERENCE_MAX_WORDS = 12

// Contagem determinística de palavras: trim + split por whitespace + descarta
// segmentos vazios. Texto ausente/vazio conta como 0 palavras (nunca qualifica
// como continuação — CTX-STORY-08).
function contarPalavras(texto) {
  if (typeof texto !== 'string') return 0
  return texto.trim().split(/\s+/).filter(Boolean).length
}

function normalizarReferencia(texto) {
  if (typeof texto !== 'string') return ''
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

function temReferenciaExplicitaAMidia(texto) {
  const n = normalizarReferencia(texto)
  if (!n) return false
  return [
    /\b(?:da|dessa|desta|na|nessa|nesta)\s+(?:foto|imagem)\b/,
    /\b(?:do|desse|deste|no|nesse|neste)\s+story\b/,
    /\b(?:essa|esta|aquela)\s+(?:foto|imagem)\b/,
    /\b(?:esse|este|aquele)\s+story\b/,
  ].some((re) => re.test(n))
}

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
    if (meta && meta.storyId && meta.storyMediaUrl) {
      return {
        status: 'FOUND',
        storyId: meta.storyId,
        storyMediaUrl: meta.storyMediaUrl,
        storyMediaType: meta.storyMediaType || null,
      }
    }

    // Correção #3 — continuidade curta: a mensagem mais recente não tem
    // metadata própria, mas pode ser uma continuação curta de um Story
    // anterior (ver comentário no topo do arquivo pras 4 condições).
    const textoAtual = typeof ultima.text === 'string' ? ultima.text : (typeof ultima.content === 'string' ? ultima.content : '')
    const numeroDePalavras = contarPalavras(textoAtual)

    const candidatosComStoryAnterior = mensagensDeUsuario.filter(
      (m) => m.time < ultima.time && m.metadata && m.metadata.storyId && m.metadata.storyMediaUrl
    )

    if (candidatosComStoryAnterior.length > 0) {
      // Sempre o mais PRÓXIMO (maior time entre os anteriores).
      const storyAnterior = candidatosComStoryAnterior.reduce((a, b) => (b.time > a.time ? b : a))
      const gapMs = ultima.time - storyAnterior.time
      const continuidadeCurta = numeroDePalavras >= 1
        && numeroDePalavras <= STORY_CONTINUATION_MAX_WORDS
        && gapMs <= STORY_CONTINUATION_WINDOW_MS
      const referenciaExplicita = numeroDePalavras >= 1
        && numeroDePalavras <= STORY_MEDIA_REFERENCE_MAX_WORDS
        && temReferenciaExplicitaAMidia(textoAtual)
        && gapMs <= STORY_MEDIA_REFERENCE_WINDOW_MS

      if (continuidadeCurta || referenciaExplicita) {
        const metaAnterior = storyAnterior.metadata
        return {
          status: 'FOUND',
          storyId: metaAnterior.storyId,
          storyMediaUrl: metaAnterior.storyMediaUrl,
          storyMediaType: metaAnterior.storyMediaType || null,
        }
      }
    }

    return { status: 'NO_STORY_IN_LATEST_MESSAGE' }
  } catch (err) {
    clearTimeout(timeout)
    // Nunca loga token nem storyMediaUrl — só o tipo genérico da falha.
    console.warn('[StoryContext] indisponível, seguindo sem Story:', err.name === 'AbortError' ? 'timeout' : 'erro')
    return { status: 'GPTMAKER_FETCH_ERROR' }
  }
}
