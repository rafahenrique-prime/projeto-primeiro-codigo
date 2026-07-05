// Healthcheck — detecta conversas onde o cliente mandou mensagem e ninguém respondeu
// (Gabriela travada, GPT Maker fora do ar, etc) e avisa o Rafael no Telegram antes que
// o cliente desista sem ninguém notar. Não é específico de nenhum bug — cobre qualquer
// situação em que uma mensagem de cliente fique sem resposta por tempo demais.

const GPTMAKER_TOKEN = process.env.VITE_GPTMAKER_TOKEN
const GPTMAKER_WS = process.env.VITE_GPTMAKER_WORKSPACE
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID
const BASE = 'https://api.gptmaker.ai'

const STUCK_THRESHOLD_MS = 3 * 60 * 1000 // sem resposta por mais de 3min = suspeito
const MAX_AGE_MS = 30 * 60 * 1000 // ignora chats com última msg há mais de 30min (não é "travado agora")
const DEDUPE_WINDOW_MS = 10 * 60 * 1000 // não alerta o mesmo chat de novo por 10min

async function enviarTelegram(mensagem) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('[cron-stuck-check] Telegram não configurado')
    return
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: mensagem, parse_mode: 'HTML' }),
    })
    if (!res.ok) console.error('[cron-stuck-check] Telegram respondeu:', res.status, await res.text())
  } catch (err) {
    console.error('[cron-stuck-check] Erro ao enviar Telegram:', err.message)
  }
}

async function jaAlertadoRecente(chatId) {
  try {
    const desde = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString()
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/codex_alerts?type=eq.chat_travado&conversation_id=eq.${encodeURIComponent(chatId)}&created_at=gte.${desde}&select=id&limit=1`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    )
    if (!res.ok) return false
    const data = await res.json()
    return data.length > 0
  } catch (err) {
    console.error('[cron-stuck-check] Erro ao checar dedupe:', err.message)
    return false
  }
}

async function registrarAlerta(chatId, mensagem) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/codex_alerts`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ type: 'chat_travado', severity: 'critico', conversation_id: chatId, message: mensagem, data: null }),
    })
  } catch (err) {
    console.error('[cron-stuck-check] Erro ao registrar alerta:', err.message)
  }
}

export default async function handler(req, res) {
  try {
    const now = Date.now()
    const listRes = await fetch(`${BASE}/v2/workspace/${GPTMAKER_WS}/chats?page=1&pageSize=20`, {
      headers: { Authorization: `Bearer ${GPTMAKER_TOKEN}` },
    })
    if (!listRes.ok) {
      console.error('[cron-stuck-check] Falha ao listar chats:', listRes.status)
      return res.status(200).json({ ok: true, skipped: 'failed to list chats' })
    }
    const data = await listRes.json()
    const chats = Array.isArray(data) ? data : (data.data || [])

    let travados = 0

    for (const chat of chats) {
      const chatTime = chat.time || 0
      const idadeMs = now - chatTime
      if (idadeMs > MAX_AGE_MS || idadeMs < STUCK_THRESHOLD_MS) continue
      // O campo "role" no resumo do chat já reflete quem mandou a última mensagem —
      // se não for cliente, alguém (ou o sistema) já respondeu, não está travado.
      if (chat.role !== 'user' && chat.role !== 'client') continue

      const jaAlertou = await jaAlertadoRecente(chat.id)
      if (jaAlertou) continue

      const minutos = Math.round(idadeMs / 60000)
      const nome = chat.name || chat.whatsappPhone || 'Cliente'
      const textoCliente = (chat.conversation || '').slice(0, 150)
      const mensagem = `⚠️ <b>CLIENTE SEM RESPOSTA</b>\n\n👤 ${nome}\n💬 "${textoCliente}"\n⏱️ Há ${minutos}min sem resposta\n\nVerifique o WhatsApp/painel GPT Maker.`

      await enviarTelegram(mensagem)
      await registrarAlerta(chat.id, `Cliente "${nome}" sem resposta: "${textoCliente}"`)
      travados++
    }

    console.log(`[cron-stuck-check] Verificados ${chats.length} chats, ${travados} alertados`)
    return res.status(200).json({ ok: true, checked: chats.length, alertados: travados })
  } catch (err) {
    console.error('[cron-stuck-check] Erro:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
