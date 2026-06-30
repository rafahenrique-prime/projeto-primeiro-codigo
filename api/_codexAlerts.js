// Helper compartilhado — grava alertas para o CODEX consumir (painel DealOnça)
// Fail-safe: nunca lança erro nem atrasa o fluxo principal do webhook que o chama

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY

export async function logCodexAlert({ type, severity = 'info', conversationId = null, message, data = null }) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/codex_alerts`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        type,
        severity,
        conversation_id: conversationId,
        message,
        data,
      }),
    })
  } catch (err) {
    // Nunca deixa o alerta quebrar o webhook principal
    console.error('[codexAlerts] falha ao gravar alerta (ignorado):', err.message)
  }
}
