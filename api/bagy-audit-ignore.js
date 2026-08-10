// Marca/desmarca uma divergência da Auditoria Bagy como "ignorada" (não altera o catálogo,
// só some do filtro padrão do relatório). Ex.: diferença de preço proposital, nome já aprovado.

import crypto from 'node:crypto'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY

// Correção de segurança (fechamento Auditoria Bagy V2) — mesmo
// BAGY_UI_ACTION_SECRET reutilizado, nenhum secret novo criado.
const BAGY_UI_ACTION_SECRET = process.env.BAGY_UI_ACTION_SECRET

function compararSegredoSeguro(fornecido, esperado) {
  if (typeof fornecido !== 'string' || typeof esperado !== 'string') return false
  const bufferFornecido = Buffer.from(fornecido)
  const bufferEsperado = Buffer.from(esperado)
  if (bufferFornecido.length !== bufferEsperado.length) return false
  return crypto.timingSafeEqual(bufferFornecido, bufferEsperado)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!BAGY_UI_ACTION_SECRET) {
    console.error('[bagy-audit-ignore] Configuração ausente: BAGY_UI_ACTION_SECRET não definida')
    return res.status(503).json({ error: 'ação indisponível: BAGY_UI_ACTION_SECRET não configurado no servidor' })
  }
  if (!compararSegredoSeguro(req.body?.actionSecret, BAGY_UI_ACTION_SECRET)) {
    return res.status(401).json({ error: 'não autorizado' })
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase não configurado' })
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
