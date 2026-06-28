import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const app = express()
const PORT = 5178

app.use(cors())
app.use(express.json())

app.get('/api/gptmaker-credits', async (req, res) => {
  const GPTMAKER_TOKEN = process.env.VITE_GPTMAKER_USER_TOKEN
  const GPTMAKER_URL = process.env.VITE_GPTMAKER_URL || 'https://api.gptmaker.ai'

  if (!GPTMAKER_TOKEN) {
    return res.status(500).json({ error: 'GPTMaker token not configured' })
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
      console.warn(`[GPTMaker Proxy] Endpoint /account/info não existe (${response.status}). Usando mock para dev.`)
      // MOCK para dev local (remove quando endpoint real estiver funcionando)
      return res.status(200).json({
        credits: 1584,
        timestamp: new Date().toISOString(),
        mock: true,
        message: 'Usando dados mock. Renovar token em: https://app.gptmaker.ai/browse/developers'
      })
    }

    const data = await response.json()
    const credits = data.credits || data.saldo || data.balance || 0

    return res.status(200).json({
      credits: Math.round(credits),
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('[GPTMaker Proxy] Erro:', error.message)
    // Fallback para dev
    return res.status(200).json({
      credits: 1584,
      timestamp: new Date().toISOString(),
      mock: true,
      message: 'Usando dados mock. Renovar token em: https://app.gptmaker.ai/browse/developers'
    })
  }
})

app.listen(PORT, () => {
  console.log(`✅ Backend proxy running on http://localhost:${PORT}`)
})
