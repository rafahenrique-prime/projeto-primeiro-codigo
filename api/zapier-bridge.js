// Bridge: GPT Maker → Zapier → Telegram
// Recebe dados do GPT Maker e envia para Zapier com formatação correta

const ZAPIER_WEBHOOK = process.env.ZAPIER_WEBHOOK_URL
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID

// Mapeia tipo de alerta para mensagem formatada
function formatarMensagem(tipo, dados = {}) {
  const { cliente, valor, descricao } = dados

  const mensagens = {
    venda_confirmada: `💰 <b>VENDA CONFIRMADA</b>\n\n👤 Cliente: ${cliente || 'Não informado'}\n💵 Valor: R$ ${valor || '0'}\n📝 ${descricao || 'Novo pedido fechado!'}`,

    novo_lead: `📱 <b>NOVO LEAD</b>\n\n👤 Cliente: ${cliente || 'Não informado'}\n📞 Cliente pediu para ser contatado\n📝 ${descricao || 'Aguardando contato'}`,

    cliente_insatisfeito: `⚠️ <b>CLIENTE INSATISFEITO</b>\n\n👤 Cliente: ${cliente || 'Não informado'}\n😞 ${descricao || 'Cliente reclamando - contato urgente recomendado!'}`,

    pedido_grande: `💎 <b>PEDIDO GRANDE</b>\n\n👤 Cliente: ${cliente || 'Não informado'}\n💵 Valor: R$ ${valor || '0'} (acima de R$ 500)\n📝 ${descricao || 'Pedido de alto valor recebido!'}`
  }

  return mensagens[tipo] || `🔔 Alerta: ${descricao || 'Novo alerta recebido'}`
}

// Detecta tipo de alerta
function detectarTipo(corpo) {
  const texto = (corpo?.texto || corpo?.descricao || corpo?.message || '').toLowerCase()

  if (texto.includes('reclamação') || texto.includes('insatisfeito') || texto.includes('problema') || texto.includes('defeito')) {
    return 'cliente_insatisfeito'
  }
  if (texto.includes('lead') || texto.includes('contato') || texto.includes('pede para ser contatado')) {
    return 'novo_lead'
  }
  if (texto.includes('venda') || texto.includes('confirmada') || texto.includes('fechada')) {
    return 'venda_confirmada'
  }
  if (texto.includes('grande') || texto.includes('500') || parseFloat(corpo?.valor) > 500) {
    return 'pedido_grande'
  }

  return 'cliente_insatisfeito' // default
}

// Envia para Zapier
async function enviarParaZapier(mensagem, tipoAlerta) {
  if (!ZAPIER_WEBHOOK) {
    console.error('[Zapier Bridge] ❌ ZAPIER_WEBHOOK_URL não configurada')
    return { sucesso: false, erro: 'Webhook Zapier não configurado' }
  }

  try {
    console.log(`[Zapier Bridge] 📤 Enviando para Zapier: ${tipoAlerta}`)

    const payload = {
      text: mensagem,
      chat_id: TELEGRAM_CHAT_ID,
      parse_mode: 'HTML'
    }

    const res = await fetch(ZAPIER_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    const resultado = await res.json()

    if (!res.ok) {
      console.error('[Zapier Bridge] ❌ Erro Zapier:', resultado)
      return { sucesso: false, erro: resultado.message || 'Erro ao enviar' }
    }

    console.log(`[Zapier Bridge] ✅ Alerta enviado: ${tipoAlerta}`)
    return { sucesso: true, resultado }

  } catch (err) {
    console.error('[Zapier Bridge] 🔴 ERRO:', err.message)
    return { sucesso: false, erro: err.message }
  }
}

// Handler principal
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' })
  }

  try {
    console.log('[Zapier Bridge] 📨 Requisição recebida:', JSON.stringify(req.body, null, 2))

    const corpo = req.body || {}
    const tipoAlerta = detectarTipo(corpo)

    const mensagem = formatarMensagem(tipoAlerta, {
      cliente: corpo.cliente_nome || corpo.cliente || 'Cliente',
      valor: corpo.valor || corpo.value || '0',
      descricao: corpo.descricao || corpo.texto || corpo.message || ''
    })

    const resultado = await enviarParaZapier(mensagem, tipoAlerta)

    if (!resultado.sucesso) {
      return res.status(400).json({
        ok: false,
        erro: resultado.erro,
        tipo: tipoAlerta
      })
    }

    return res.status(200).json({
      ok: true,
      tipo: tipoAlerta,
      mensagem: 'Alerta enviado com sucesso para Telegram via Zapier'
    })

  } catch (err) {
    console.error('[Zapier Bridge] 🔴 ERRO:', err.message)
    return res.status(500).json({
      ok: false,
      erro: err.message
    })
  }
}
