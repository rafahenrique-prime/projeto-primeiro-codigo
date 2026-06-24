// API para logar ações do catálogo
// POST /api/log-history

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://mbbgqasvssueirynnoyk.supabase.co'
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY || 'sb_publishable_RliDhy3CwEL-8eOw7EuwEQ_Ekpj9IPV'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { action, produto_nome, produto_id, detalhes } = req.body

  if (!action || !produto_nome) {
    return res.status(400).json({ error: 'action e produto_nome são obrigatórios' })
  }

  try {
    console.log(`[Catalog Log] ${action}: ${produto_nome}`)

    // Salvar em catalog_history
    const response = await fetch(`${SUPABASE_URL}/rest/v1/catalog_history`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        action: action, // 'add', 'edit', 'delete'
        produto_nome: produto_nome,
        produto_id: produto_id || null,
        detalhes: detalhes || null,
        timestamp: new Date().toISOString(),
        created_at: new Date().toISOString()
      })
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('[Catalog Log] Erro:', response.status, error)
      // Não falhar a requisição principal se log falhar
      return res.status(200).json({ success: true, logged: false, error: error })
    }

    const logged = await response.json()
    console.log('[Catalog Log] ✅ Salvo:', action)
    return res.status(200).json({ success: true, logged: true })

  } catch (err) {
    console.error('[Catalog Log] Erro:', err.message)
    // Não falhar a requisição principal
    return res.status(200).json({ success: true, logged: false, error: err.message })
  }
}
