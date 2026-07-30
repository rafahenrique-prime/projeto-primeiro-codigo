// Status real do PRIME Cobranças pro Operations Center (Fase A) — ping real dos
// 2 apps Base44 (PRIME + Lyra) + última atividade real (HistoricoAtividade, só
// timestamp). WhatsApp/Z-API sempre "not_checked" nesta fase — a integração de
// status real da Z-API fica pra uma fase futura. Mesmo padrão de
// vercelStatusService.js/githubStatusService.js/supabaseHealthService.js: cache
// client-side best-effort, nunca conhece nem recebe nenhuma credencial Base44.

const PRIME_COBRANCAS_STATUS_URL = '/api/system-tools?tool=prime-cobrancas-status'
const CACHE_DURATION = 3 * 60 * 1000

let cached = null
let lastFetchTime = 0

export async function getPrimeCobrancasStatus(force = false) {
  const now = Date.now()
  if (!force && cached && (now - lastFetchTime) < CACHE_DURATION) return cached

  try {
    const res = await fetch(force ? `${PRIME_COBRANCAS_STATUS_URL}&force=true` : PRIME_COBRANCAS_STATUS_URL)
    if (!res.ok) throw new Error(`respondeu ${res.status}`)
    const data = await res.json()
    cached = data
    lastFetchTime = now
    return data
  } catch (e) {
    console.error('[PrimeCobrancasStatus] Erro:', e.message)
    return {
      primeAvailable: false, lyraAvailable: false, whatsappStatus: 'not_checked',
      lastActivityAt: null, lastChecked: new Date().toISOString(),
      errorCode: 'CLIENT_ERROR', cached: true,
    }
  }
}
