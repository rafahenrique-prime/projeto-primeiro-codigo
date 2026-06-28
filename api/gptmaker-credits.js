export default async function handler(req, res) {
  const GPTMAKER_TOKEN = process.env.VITE_GPTMAKER_USER_TOKEN
  const GPTMAKER_URL = process.env.VITE_GPTMAKER_URL || 'https://api.gptmaker.ai'

  if (!GPTMAKER_TOKEN) {
    return res.status(500).json({ error: 'GPTMaker token not configured' })
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const response = await fetch(`${GPTMAKER_URL}/account/info`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${GPTMAKER_TOKEN}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      console.warn(`[GPTMaker Proxy] Erro ${response.status}:`, response.statusText)
      return res.status(response.status).json({ error: 'Failed to fetch GPTMaker credits' })
    }

    const data = await response.json()
    const credits = data.credits || data.saldo || data.balance || 0

    return res.status(200).json({
      credits: Math.round(credits),
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('[GPTMaker Proxy] Erro:', error.message)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
