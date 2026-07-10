const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY

export async function logTokenUsage(provider, tokensUsed, model, cost = 0) {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/token_usage`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        provider: provider,
        tokens_used: tokensUsed,
        model: model,
        cost: cost,
        timestamp: new Date().toISOString()
      })
    })

    if (!response.ok) {
      console.warn('[TokenLogging] Erro ao logar:', response.status)
      return false
    }

    return true
  } catch (e) {
    console.error('[TokenLogging] Erro:', e.message)
    return false
  }
}

export async function getMonthlyTokenUsage(provider = 'deepseek') {
  try {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/token_usage?provider=eq.${provider}&timestamp=gte.${startOfMonth}&select=tokens_used,cost`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        }
      }
    )

    if (!response.ok) {
      console.warn('[TokenLogging] Erro ao buscar:', response.status)
      return { totalTokens: 0, totalCost: 0 }
    }

    const data = await response.json()
    const totalTokens = data.reduce((sum, row) => sum + (row.tokens_used || 0), 0)
    const totalCost = data.reduce((sum, row) => sum + (row.cost || 0), 0)

    return { totalTokens, totalCost }
  } catch (e) {
    console.error('[TokenLogging] Erro ao buscar uso:', e.message)
    return { totalTokens: 0, totalCost: 0 }
  }
}
