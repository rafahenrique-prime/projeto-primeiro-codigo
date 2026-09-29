import webhookHandler from '../../webhook.js'

export default async function handler(req, res) {
  if (String(process.env.VERCEL_ENV || '').toLowerCase() !== 'preview') {
    return res.status(404).json({ ok: false })
  }

  const chatId = String(req.query?.chatId || '').slice(0, 180)
  if (!chatId) return res.status(400).json({ ok: false, error: 'chat_id_required' })

  req.method = 'POST'
  req.body = {
    pergunta: 'Me passa os valores ?',
    cliente_id: 'smart-video-preview-lab',
    chat_id: chatId,
  }

  return webhookHandler(req, res)
}
