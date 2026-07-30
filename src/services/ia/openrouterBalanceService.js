// Pacote 1 da migração de segurança do OpenRouter — o saldo agora vem do servidor
// (api/system-tools.js?tool=openrouter-usage), nunca mais chama openrouter.ai
// direto do browser nem lê nenhuma variável de ambiente. A chave (OPENROUTER_API_KEY)
// existe só no servidor. Pacote 2 (groq.js/ocrService.js) migrado — zero referência
// a VITE_OPENROUTER* restante em src/.

const OPENROUTER_USAGE_URL = '/api/system-tools?tool=openrouter-usage'
const CACHE_DURATION = 5 * 60 * 1000 // mesmo TTL do cache do próprio endpoint

let cache = null
let cachedAt = 0
let inFlight = null

async function fetchUsage(force) {
  const res = await fetch(force ? `${OPENROUTER_USAGE_URL}&force=true` : OPENROUTER_USAGE_URL)
  if (!res.ok) throw new Error(`openrouter-usage respondeu ${res.status}`)
  return res.json()
}

// Forma completa normalizada — usada pelo card real do Operations Center.
export async function getOpenRouterUsage(force = false) {
  const now = Date.now()
  if (!force && cache && (now - cachedAt) < CACHE_DURATION) return cache

  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const data = await fetchUsage(force)
      cache = data
      cachedAt = Date.now()
      return data
    } catch (e) {
      console.error('[OpenRouterBalance] Erro:', e.message)
      return { available: false, errorCode: 'OPENROUTER_CLIENT_ERROR', lastChecked: new Date().toISOString(), cached: false }
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

// Interface legada, preservada pro DashboardNewPage.jsx — mesmo contrato de antes:
// null em erro/indisponível, { balance, totalCredits, totalUsage } em sucesso.
export async function getOpenRouterBalance() {
  const data = await getOpenRouterUsage()
  if (!data.available) return null

  return {
    balance: data.remainingCredits,
    totalCredits: data.totalCredits,
    totalUsage: data.totalUsage,
  }
}
