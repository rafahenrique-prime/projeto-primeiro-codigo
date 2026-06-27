// Webhook para enviar alertas Telegram
// Recebe dados das intenções do GPT Maker e envia para Telegram

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID

// Função para enviar mensagem Telegram
async function enviarTelegram(mensagem, tipoAlerta) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('[Telegram] ❌ Token ou Chat ID não configurados')
    return { sucesso: false, erro: 'Token ou Chat ID ausente' }
  }

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`

    const payload = {
      chat_id: TELEGRAM_CHAT_ID,
      text: mensagem,
      parse_mode: 'HTML'
    }

    console.log(`[Telegram] 📤 Enviando alerta ${tipoAlerta}...`)

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    const resultado = await res.json()

    if (!res.ok) {
      console.error('[Telegram] ❌ Erro ao enviar:', resultado)
      return { sucesso: false, erro: resultado.description }
    }

    console.log(`[Telegram] ✅ Alerta ${tipoAlerta} enviado com sucesso!`)
    return { sucesso: true, messageId: resultado.result.message_id }

  } catch (err) {
    console.error('[Telegram] 🔴 ERRO:', err.message)
    return { sucesso: false, erro: err.message }
  }
}

// Formata mensagem baseada no tipo de alerta
function formatarMensagem(dados, tipoAlerta) {
  const { cliente, valor, motivo, descricao } = dados

  switch(tipoAlerta) {
    case 'venda_confirmada':
      return `💰 <b>VENDA CONFIRMADA</b>\n\n` +
             `👤 Cliente: ${cliente || 'Não informado'}\n` +
             `💵 Valor: R$ ${valor || '0'}\n` +
             `📝 Descrição: ${descricao || 'Nova venda realizada'}\n\n` +
             `<i>⏰ ${new Date().toLocaleString('pt-BR')}</i>`

    case 'novo_lead':
      return `📱 <b>NOVO LEAD</b>\n\n` +
             `👤 Cliente: ${cliente || 'Não informado'}\n` +
             `📞 Cliente pediu para ser contatado\n` +
             `📝 Detalhes: ${descricao || 'Cliente aguardando contato'}\n\n` +
             `<i>⏰ ${new Date().toLocaleString('pt-BR')}</i>`

    case 'cliente_insatisfeito':
      return `⚠️ <b>CLIENTE INSATISFEITO</b>\n\n` +
             `👤 Cliente: ${cliente || 'Não informado'}\n` +
             `😞 Motivo: ${motivo || descricao || 'Cliente reclamando'}\n` +
             `📝 Ação necessária: Contato urgente recomendado\n\n` +
             `<i>⏰ ${new Date().toLocaleString('pt-BR')}</i>`

    case 'pedido_grande':
      return `💎 <b>PEDIDO GRANDE</b>\n\n` +
             `👤 Cliente: ${cliente || 'Não informado'}\n` +
             `💵 Valor: R$ ${valor || '0'} (acima de R$ 500)\n` +
             `📝 Descrição: ${descricao || 'Pedido de alto valor'}\n\n` +
             `<i>⏰ ${new Date().toLocaleString('pt-BR')}</i>`

    default:
      return `🔔 <b>ALERTA</b>\n\n${descricao || 'Novo alerta recebido'}`
  }
}

// Detecta tipo de alerta baseado na intenção ou conteúdo
function detectarTipo(body) {
  // Tenta extrair do nome da intenção
  const nomeDados = body?.intencao_nome || body?.intention_name || ''
  const conteudo = (body?.texto || body?.text || '').toLowerCase()

  if (nomeDados.includes('Venda') || nomeDados.includes('venda')) return 'venda_confirmada'
  if (nomeDados.includes('Lead') || nomeDados.includes('lead')) return 'novo_lead'
  if (nomeDados.includes('Insatisfeito') || nomeDados.includes('insatisfeito')) return 'cliente_insatisfeito'
  if (nomeDados.includes('Grande') || nomeDados.includes('grande')) return 'pedido_grande'

  // Fallback: detecta por palavras-chave
  if (conteudo.includes('reclamação') || conteudo.includes('insatisfeito') || conteudo.includes('problema')) {
    return 'cliente_insatisfeito'
  }
  if (conteudo.includes('lead') || conteudo.includes('contato')) {
    return 'novo_lead'
  }
  if (conteudo.includes('venda') || conteudo.includes('confirmada')) {
    return 'venda_confirmada'
  }
  if (conteudo.includes('grande') || conteudo.includes('500')) {
    return 'pedido_grande'
  }

  return 'alerta_generico'
}

// Handler principal
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, erro: 'Método não permitido' })
  }

  try {
    console.log('[Telegram Alert] 📨 Requisição recebida:', JSON.stringify(req.body, null, 2))

    const body = req.body || {}

    // Extrair dados do payload
    const tipoAlerta = detectarTipo(body)

    const dados = {
      cliente: body.cliente_nome || body.cliente || body.customer || body.name || 'Cliente',
      valor: body.valor || body.value || body.amount || '0',
      motivo: body.motivo || body.reason || '',
      descricao: body.descricao || body.description || body.texto || body.text || body.message || ''
    }

    console.log(`[Telegram Alert] 🔍 Tipo detectado: ${tipoAlerta}`)

    // Formatar e enviar mensagem
    const mensagem = formatarMensagem(dados, tipoAlerta)
    const resultado = await enviarTelegram(mensagem, tipoAlerta)

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
      messageId: resultado.messageId,
      mensagem_enviada: true
    })

  } catch (err) {
    console.error('[Telegram Alert] 🔴 ERRO:', err.message)
    return res.status(500).json({
      ok: false,
      erro: err.message
    })
  }
}
