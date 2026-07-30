// Fase 2A.1 do Operations Center — GET lê o último estado persistido no Supabase
// (sem custo, nunca chama o QwenCloud); POST solicita uma verificação real, mas
// quem decide se ela acontece é a trava atômica server-side (api/system-tools.js
// ?tool=qwen-health + migration 015) — este service nunca conhece nem controla
// o intervalo mínimo. Nunca conhece nem recebe nenhuma API Key.
//
// Endpoint consolidado dentro de api/system-tools.js (não é mais um arquivo
// próprio) pra caber no limite de 12 Serverless Functions do plano Hobby da
// Vercel — mesmo comportamento de antes, só a URL mudou.

const QWEN_HEALTH_URL = '/api/system-tools?tool=qwen-health'

let inFlightGet = null
let inFlightPost = null

function clientErrorState() {
  return {
    available: false, model: null, latencyMs: null, lastChecked: null,
    errorCode: 'QWEN_CLIENT_ERROR', cached: true,
  }
}

// Lê o último resultado persistido. Seguro pra chamar ao montar a página, em
// F5, ou em qualquer navegação da SPA — nunca dispara uma chamada real.
export async function getQwenHealthState() {
  if (inFlightGet) return inFlightGet

  inFlightGet = (async () => {
    try {
      const res = await fetch(QWEN_HEALTH_URL)
      if (!res.ok) throw new Error(`GET respondeu ${res.status}`)
      return await res.json()
    } catch (e) {
      console.error('[QwenHealth] Erro no GET:', e.message)
      return clientErrorState()
    } finally {
      inFlightGet = null
    }
  })()

  return inFlightGet
}

// Solicita uma verificação real — só deve ser chamado por ação explícita do
// usuário (botão "Atualizar agora"), nunca automaticamente. O servidor decide
// se a chamada real acontece (payload de retorno inclui `throttled: true`
// quando a trava ainda não liberou).
export async function requestQwenHealthRefresh() {
  if (inFlightPost) return inFlightPost

  inFlightPost = (async () => {
    try {
      const res = await fetch(QWEN_HEALTH_URL, { method: 'POST' })
      if (!res.ok) throw new Error(`POST respondeu ${res.status}`)
      return await res.json()
    } catch (e) {
      console.error('[QwenHealth] Erro no POST:', e.message)
      return clientErrorState()
    } finally {
      inFlightPost = null
    }
  })()

  return inFlightPost
}
