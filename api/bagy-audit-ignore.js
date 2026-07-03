// Marca/desmarca uma divergência da Auditoria Bagy como "ignorada" (não altera o catálogo,
// só some do filtro padrão do relatório). Ex.: diferença de preço proposital, nome já aprovado.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase não configurado' })
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { id, ignored, reason } = req.body || {}
  if (!id) return res.status(400).json({ error: 'id é obrigatório' })

  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/bagy_audit_log?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ ignored: ignored !== false, ignore_reason: reason || null }),
    })
    if (!resp.ok) return res.status(500).json({ error: `Supabase ${resp.status}` })
    return res.status(200).json({ success: true })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
