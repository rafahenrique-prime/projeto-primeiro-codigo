// Webhook DEBUG - mostra TUDO que chega do GPT Maker
// Use para descobrir quais variáveis estão disponíveis

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' })
  }

  try {
    console.log('[Webhook-Debug] 📨 TUDO QUE CHEGOU:')
    console.log(JSON.stringify(req.body, null, 2))

    // Retornar TUDO que chegou (para análise)
    const resposta = {
      sucesso: true,
      timestamp: new Date().toISOString(),
      debug: {
        tudo_que_chegou: req.body,
        chaves_disponiveis: Object.keys(req.body || {}),
        valores_por_chave: {}
      }
    }

    // Mostrar cada chave e valor
    if (req.body) {
      Object.keys(req.body).forEach(chave => {
        resposta.debug.valores_por_chave[chave] = {
          tipo: typeof req.body[chave],
          valor: String(req.body[chave]).substring(0, 100) // primeiros 100 chars
        }
      })
    }

    console.log('[Webhook-Debug] ✅ Resposta enviada:')
    console.log(JSON.stringify(resposta, null, 2))

    return res.status(200).json(resposta)

  } catch (err) {
    console.error('[Webhook-Debug] 🔴 ERRO:', err.message)
    return res.status(500).json({
      sucesso: false,
      erro: err.message,
      stack: err.stack
    })
  }
}
