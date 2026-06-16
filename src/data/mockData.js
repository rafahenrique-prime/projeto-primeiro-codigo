export const conversations = [
  {
    id: 1, name: 'Maria Aparecida', initials: 'MA',
    color: '#0EC331',
    channel: 'whatsapp_app', channelLabel: 'WhatsApp #1', channelSub: 'API Oficial',
    lastMsg: 'Quero saber o preço com desconto 🙏', time: '14:32', unread: 3,
    phone: '(31) 99999-1234', email: 'maria@email.com', city: 'Belo Horizonte, MG',
    since: 'jun/2024', orders: 1, talks: 3, rating: '5/5',
    mode: 'autopilot',
    objective: 'Recommending Products and Driving Conversions',
    objective_progress: 55,
    tags: [{ label: 'Lead quente', color: '#0EC331' }, { label: 'Produto X', color: '#EF9323' }],
    messages: [
      { id: 1, role: 'user', content: 'Olá! Vim pelo Instagram de vocês. Quero saber o preço do produto X. 😊', time: '14:28' },
      { id: 2, role: 'assistant', content: 'Olá, Maria! Tudo bem? 😊 O produto X está disponível por R$ 89,90. Temos também o kit com 3 unidades por R$ 249,90 com frete grátis! Posso te ajudar com mais alguma informação?', time: '14:28' },
      { id: 3, role: 'user', content: 'Que ótimo! E vocês entregam em Belo Horizonte?', time: '14:30' },
      { id: 4, role: 'assistant', content: 'Sim! Entregamos para todo o Brasil 🇧🇷 O prazo para BH é de 2 a 4 dias úteis via Correios ou transportadora. Deseja finalizar seu pedido?', time: '14:30' },
      { id: 5, role: 'user', content: 'Quero saber o preço com desconto se tiver 🙏', time: '14:32' },
    ],
    suggested_reply: 'Boa notícia, Maria! Para compras acima de 2 unidades você ganha 10% de desconto automático! O kit com 3 sai por R$ 224,91 com frete grátis. Quer aproveitar? 🎉',
    suggested_tone: 'Defer gracioso',
    aiSummary: 'Cliente interessada no Produto X. Perguntou sobre entrega em BH. Agora busca desconto. Lead com alto potencial de conversão.',
    tasks: [{ title: 'Enviar tabela de preços', status: 'pending' }, { title: 'Follow-up em 2 dias', status: 'pending' }],
  },
  {
    id: 2, name: 'João Silva', initials: 'JS',
    color: '#2185FF',
    channel: 'instagram_dm', channelLabel: 'Instagram #1', channelSub: 'Meta Graph API',
    lastMsg: 'Oi, vi o post de vocês e fiquei interessado', time: '14:10', unread: 1,
    phone: '(11) 98888-5678', email: 'joao@email.com', city: 'São Paulo, SP',
    since: 'jan/2025', orders: 0, talks: 1, rating: '-',
    mode: 'copilot',
    objective: 'Engaging New Leads',
    objective_progress: 20,
    tags: [{ label: 'Novo lead', color: '#2185FF' }],
    messages: [
      { id: 1, role: 'user', content: 'Oi! Vi o post de vocês no Instagram e fiquei interessado no produto. Como funciona?', time: '14:10' },
      { id: 2, role: 'assistant', content: 'Olá, João! Que bom ter você aqui! 😊 Nosso produto funciona de forma simples: você escolhe, a gente entrega em até 4 dias úteis. Quer saber mais detalhes?', time: '14:11' },
    ],
    suggested_reply: 'João, além do produto principal temos um kit especial com 20% OFF para primeiros clientes! Quer que eu te mande os detalhes? 🛍️',
    suggested_tone: 'Proativo',
    aiSummary: 'Novo lead vindo do Instagram. Demonstrou interesse inicial. Alto potencial se abordado com oferta de entrada.',
    tasks: [],
  },
  {
    id: 3, name: 'Carlos Ferreira', initials: 'CF',
    color: '#10b981',
    channel: 'whatsapp_waba', channelLabel: 'WhatsApp #2', channelSub: 'QR Code',
    lastMsg: 'Perfeito, obrigado!', time: '13:55', unread: 0,
    phone: '(21) 97777-9999', email: 'carlos@email.com', city: 'Rio de Janeiro, RJ',
    since: 'mar/2024', orders: 3, talks: 7, rating: '4/5',
    mode: 'autopilot',
    objective: 'Customer Retention',
    objective_progress: 80,
    tags: [{ label: 'Recorrente', color: '#0EC331' }, { label: 'Pedido #447', color: '#EF9323' }],
    messages: [
      { id: 1, role: 'user', content: 'Boa tarde! Fiz um pedido na semana passada, pedido #447. Quando chega?', time: '13:55' },
      { id: 2, role: 'assistant', content: 'Olá, Carlos! Consultei aqui e seu pedido #447 está a caminho! Previsão de entrega amanhã até as 18h. Você receberá um SMS com o código de rastreio. 📦', time: '13:56' },
      { id: 3, role: 'user', content: 'Perfeito, obrigado!', time: '13:57' },
    ],
    suggested_reply: null,
    aiSummary: 'Cliente recorrente com pedido em trânsito. Consulta resolvida. Entrega prevista para amanhã.',
    tasks: [],
  },
  {
    id: 4, name: 'Ana Lima', initials: 'AL',
    color: '#ec4899',
    channel: 'instagram_dm', channelLabel: 'Instagram #2', channelSub: 'Meta Graph API',
    lastMsg: 'Vocês fazem entrega pra SP?', time: '13:41', unread: 0,
    phone: '(11) 96666-3333', email: 'ana@email.com', city: 'São Paulo, SP',
    since: 'mai/2025', orders: 2, talks: 4, rating: '5/5',
    mode: 'copilot',
    objective: 'Driving Conversions',
    objective_progress: 40,
    tags: [{ label: 'VIP', color: '#EF9323' }],
    messages: [
      { id: 1, role: 'user', content: 'Oi! Vocês fazem entrega pra São Paulo?', time: '13:41' },
      { id: 2, role: 'assistant', content: 'Olá, Ana! Sim, entregamos para SP com prazo de 1 a 2 dias úteis! 🚀 Quer fazer um pedido?', time: '13:42' },
    ],
    suggested_reply: 'Ana, para SP temos entrega expressa disponível! Quer aproveitar e já fechar o pedido hoje? 🚀',
    suggested_tone: 'Urgência suave',
    aiSummary: 'Cliente VIP de SP. Perguntou sobre entrega. Boa candidata para upsell de frete expresso.',
    tasks: [{ title: 'Oferecer frete expresso', status: 'pending' }],
  },
  {
    id: 5, name: 'Pedro Martins', initials: 'PM',
    color: '#6366f1',
    channel: 'whatsapp_app', channelLabel: 'WhatsApp #1', channelSub: 'API Oficial',
    lastMsg: '✅ Obrigado pelo atendimento!', time: '13:22', unread: 0,
    phone: '(85) 95555-1111', email: 'pedro@email.com', city: 'Fortaleza, CE',
    since: 'ago/2024', orders: 5, talks: 12, rating: '5/5',
    mode: 'autopilot',
    objective: 'Customer Retention',
    objective_progress: 100,
    tags: [{ label: 'Resolvido', color: '#0EC331' }],
    messages: [
      { id: 1, role: 'user', content: 'Boa tarde, preciso cancelar meu pedido.', time: '13:15' },
      { id: 2, role: 'assistant', content: 'Olá Pedro! Entendido. Pode me informar o número do pedido?', time: '13:16' },
      { id: 3, role: 'user', content: 'Pedido #512', time: '13:18' },
      { id: 4, role: 'assistant', content: 'Cancelamento do pedido #512 realizado! O reembolso será processado em até 3 dias úteis. 👍', time: '13:19' },
      { id: 5, role: 'user', content: '✅ Obrigado pelo atendimento!', time: '13:22' },
    ],
    suggested_reply: null,
    aiSummary: 'Cancelamento do pedido #512 processado. Cliente satisfeito. Reembolso em andamento.',
    tasks: [],
  },
  {
    id: 6, name: 'Lucia Santos', initials: 'LS',
    color: '#f97316',
    channel: 'instagram_dm', channelLabel: 'Instagram #1', channelSub: 'Meta Graph API',
    lastMsg: 'Tem desconto para compra no atacado?', time: '12:58', unread: 0,
    phone: '(51) 94444-2222', email: 'lucia@email.com', city: 'Porto Alegre, RS',
    since: 'fev/2025', orders: 1, talks: 2, rating: '4/5',
    mode: 'copilot',
    objective: 'Upsell Atacado',
    objective_progress: 30,
    tags: [{ label: 'Atacado', color: '#EF9323' }],
    messages: [
      { id: 1, role: 'user', content: 'Oi! Tem algum desconto para compra no atacado?', time: '12:58' },
      { id: 2, role: 'assistant', content: 'Olá, Lucia! Sim! Para compras acima de 10 unidades, 15% de desconto. Acima de 20 unidades, 25%! Quer saber mais?', time: '12:59' },
    ],
    suggested_reply: null,
    aiSummary: 'Cliente buscando desconto atacado. Informada sobre política de preços. Aguardando retorno.',
    tasks: [],
  },
]

export const channels = [
  { id: 'whatsapp_app', label: 'WhatsApp #1', sub: 'API Oficial · +55 31 9999-0001', type: 'whatsapp_app', connected: true },
  { id: 'whatsapp_waba', label: 'WhatsApp #2', sub: 'QR Code · Evolution API', type: 'whatsapp_waba', connected: true },
  { id: 'instagram_dm', label: 'Instagram #1', sub: '@primestore · Meta Graph API', type: 'instagram_dm', connected: true },
  { id: 'instagram_dm2', label: 'Instagram #2', sub: '@primestore2 · Meta Graph API', type: 'instagram_dm', connected: true },
]

export const channelIcon = (type) => {
  if (type?.startsWith('whatsapp')) return '💬'
  if (type?.startsWith('instagram')) return '📸'
  return '💬'
}

export const channelColor = (type) => {
  if (type?.startsWith('whatsapp')) return '#0EC331'
  if (type?.startsWith('instagram')) return '#ec4899'
  return '#0EC331'
}
