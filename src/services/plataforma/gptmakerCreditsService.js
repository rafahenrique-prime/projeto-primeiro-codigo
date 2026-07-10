const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY
const GPTMAKER_TOKEN = import.meta.env.VITE_GPTMAKER_USER_TOKEN
const GPTMAKER_URL = import.meta.env.VITE_GPTMAKER_URL || 'https://api.gptmaker.ai'

// Endpoint fixo hospedado no ignite-webhook (Vercel) — mesmo em dev e produção,
// assim não depende de rodar um servidor proxy local separado.
const CREDITS_ENDPOINT = 'https://ignite-webhook.vercel.app/api/gptmaker-credits'

export async function getGPTMakerCredits() {
  try {
    const res = await fetch(CREDITS_ENDPOINT, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    if (!res.ok) {
      console.warn('[GPTMaker] Erro ao buscar créditos:', res.status)
      return null
    }

    const data = await res.json()
    return {
      creditsSpent: Math.round(data.creditsSpent ?? 0),
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      timestamp: data.timestamp,
      cached: !!data.cached,
      lastUpdated: new Date()
    }
  } catch (e) {
    console.error('[GPTMaker] Erro:', e.message)
    return null
  }
}

export async function logGPTMakerConsumption(creditsUsed, model = 'unknown') {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/gptmaker_consumption`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        credits_used: creditsUsed,
        model: model,
        timestamp: new Date().toISOString()
      })
    })

    return res.ok
  } catch (e) {
    console.error('[GPTMaker Logging] Erro:', e.message)
    return false
  }
}

export async function getMonthlyGPTMakerConsumption() {
  try {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/gptmaker_consumption?timestamp=gte.${startOfMonth}&select=credits_used`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        }
      }
    )

    if (!res.ok) return { totalCredits: 0 }

    const data = await res.json()
    const totalCredits = data.reduce((sum, row) => sum + (row.credits_used || 0), 0)

    return { totalCredits }
  } catch (e) {
    console.error('[GPTMaker Consumption] Erro:', e.message)
    return { totalCredits: 0 }
  }
}
