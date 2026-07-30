// Health check real da API do Perplexity pro Operations Center. A API do Perplexity
// não expõe saldo/uso/requests (só o endpoint de chat) — por isso este service nunca
// pede nem recebe métrica de billing, só disponibilidade/modelo/latência reais.
// GET lê o cache em memória do servidor (nunca chama o Perplexity); POST solicita uma
// verificação real (respeitando o cache de 5min do servidor, a menos que force=true) —
// usado pelo botão "Atualizar agora". Nunca conhece nem recebe nenhuma API Key.

const PERPLEXITY_HEALTH_URL = '/api/system-tools?tool=perplexity-health'

let inFlightGet = null
let inFlightPost = null

function clientErrorState() {
  return {
    available: false, model: null, latencyMs: null, lastChecked: null,
    errorCode: 'PERPLEXITY_CLIENT_ERROR', cached: true,
  }
}

export async function getPerplexityHealthState() {
  if (inFlightGet) return inFlightGet

  inFlightGet = (async () => {
    try {
      const res = await fetch(PERPLEXITY_HEALTH_URL)
      if (!res.ok) throw new Error(`GET respondeu ${res.status}`)
      return await res.json()
    } catch (e) {
      console.error('[PerplexityHealth] Erro no GET:', e.message)
      return clientErrorState()
    } finally {
      inFlightGet = null
    }
  })()

  return inFlightGet
}

export async function requestPerplexityHealthRefresh(force = false) {
  if (inFlightPost) return inFlightPost

  inFlightPost = (async () => {
    try {
      const url = force ? `${PERPLEXITY_HEALTH_URL}&force=true` : PERPLEXITY_HEALTH_URL
      const res = await fetch(url, { method: 'POST' })
      if (!res.ok) throw new Error(`POST respondeu ${res.status}`)
      return await res.json()
    } catch (e) {
      console.error('[PerplexityHealth] Erro no POST:', e.message)
      return clientErrorState()
    } finally {
      inFlightPost = null
    }
  })()

  return inFlightPost
}
