const WS = import.meta.env.VITE_GPTMAKER_WORKSPACE
const BASE = 'https://api.gptmaker.ai'

let _apiToken = import.meta.env.VITE_GPTMAKER_TOKEN
let _userToken = localStorage.getItem('gptmaker_user_token') || import.meta.env.VITE_GPTMAKER_USER_TOKEN

export function updateUserToken(token) {
  _userToken = token.trim()
  localStorage.setItem('gptmaker_user_token', _userToken)
}

function isTokenExpired(token) {
  if (!token) return true
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    if (!payload.exp) return false
    return Date.now() > payload.exp * 1000
  } catch { return false }
}

function getTokenExpiryInfo(token) {
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    if (!payload.exp) return null
    const hoursLeft = (payload.exp * 1000 - Date.now()) / 3600000
    return { expired: hoursLeft <= 0, hoursLeft: Math.round(hoursLeft * 10) / 10 }
  } catch { return null }
}

async function getUserTokenAuto() {
  if (_userToken && !isTokenExpired(_userToken)) return _userToken
  return _apiToken
}

async function request(path, options = {}) {
  const token = _apiToken
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'omit',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Erro na API GPT Maker')
  return data
}

export async function listAgents() {
  const data = await request(`/v2/workspace/${WS}/agents`)
  return data.data || []
}

export async function getAgent(agentId) {
  return request(`/v2/workspace/${WS}/agents/${agentId}`)
}

export async function updateAgent(agentId, body) {
  return request(`/v2/workspace/${WS}/agents/${agentId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export async function createAgent(body) {
  return request(`/v2/workspace/${WS}/agents`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function deleteAgent(agentId) {
  return request(`/v2/workspace/${WS}/agents/${agentId}`, { method: 'DELETE' })
}

export async function activateAgent(agentId) {
  return request(`/v2/workspace/${WS}/agents/${agentId}/activate`, { method: 'POST' })
}

export async function deactivateAgent(agentId) {
  return request(`/v2/workspace/${WS}/agents/${agentId}/inactivate`, { method: 'POST' })
}

export async function listChannels() {
  const data = await request(`/v2/workspace/${WS}/channels`)
  return data.data || []
}

export async function listChats(agentId, page = 1, pageSize = 50) {
  const q = agentId ? `&agentId=${agentId}` : ''
  const data = await request(`/v2/workspace/${WS}/chats?page=${page}&pageSize=${pageSize}${q}`)
  return Array.isArray(data) ? data : (data.data || [])
}

export async function getChatMessages(chatId) {
  return request(`/v2/chat/${chatId}/messages`)
}

export async function sendMessage(chatId, text, imageUrl = null) {
  // Campo correto confirmado pela docs e pelo teste que funcionou às 12:31: { image: url }
  const body = imageUrl
    ? { message: text, image: imageUrl }
    : { message: text, type: 'TEXT' }

  if (imageUrl) {
    // Valida que a URL é de imagem real (não página HTML)
    const isImageUrl = /\.(jpg|jpeg|png|webp|gif|webp)(\?|$)/i.test(imageUrl) ||
                       imageUrl.includes('cdn.dooca.store') ||
                       imageUrl.includes('supabase')
    if (!isImageUrl) {
      console.warn('[sendMessage] ⚠️ URL suspeita — não parece ser imagem direta:', imageUrl)
    }
    console.log('[sendMessage] Enviando imagem:', { chatId, text: text?.slice(0, 40), imageUrl: imageUrl?.slice(0, 80), isImageUrl })
  }

  try {
    const result = await request(`/v2/chat/${chatId}/send-message`, {
      method: 'POST',
      body: JSON.stringify(body),
    })

    if (imageUrl) {
      console.log('[sendMessage] ✅ Resposta da API:', JSON.stringify(result)?.slice(0, 200))
    }

    return result
  } catch (err) {
    // Captura o status HTTP para detectar rate-limit (429)
    console.error('[sendMessage] ❌ Erro ao enviar', {
      chatId,
      hasImage: !!imageUrl,
      status: err.response?.status,
      message: err.message,
      textPreview: text?.slice(0, 60)
    })
    throw err
  }
}

export async function assumeChat(chatId) {
  const token = await getUserTokenAuto()
  const res = await fetch(`${BASE}/chat-context/conversation/${chatId}/start-attendance`, {
    method: 'POST',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  })
  if (!res.ok && res.status !== 204) throw new Error('Erro ao assumir chat')
  return true
}

export async function releaseChat(chatId) {
  const token = await getUserTokenAuto()
  const res = await fetch(`${BASE}/chat-context/conversation/${chatId}/return-to-agent`, {
    method: 'POST',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  })
  if (!res.ok && res.status !== 204) throw new Error('Erro ao voltar pro agente')
  return true
}

export async function finishChat(chatId) {
  return request(`/v2/chat/${chatId}/finish`, { method: 'POST' })
}

export async function deleteChat(chatId) {
  return request(`/v2/chat/${chatId}`, { method: 'DELETE' }).catch(() => null)
}

export async function listContacts(page = 1, pageSize = 20) {
  const data = await request(`/v2/workspace/${WS}/contacts?page=${page}&pageSize=${pageSize}`)
  return data.data || []
}

// Dashboard — usa USER_TOKEN (endpoints /dashboard/ exigem sessão de usuário)
async function dashboardRequest(path) {
  const token = await getUserTokenAuto()
  const expiry = getTokenExpiryInfo(token)
  if (expiry?.expired) {
    throw new Error('Token expirado. Abra app.gptmaker.ai, vá em Chave de API, e atualize o VITE_GPTMAKER_USER_TOKEN no .env.local')
  }
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'omit',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  if (res.status === 401 || res.status === 403) {
    throw new Error('Token inválido. Abra app.gptmaker.ai, copie o token de sessão e atualize VITE_GPTMAKER_USER_TOKEN no .env.local')
  }
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || data.message || 'Erro na API Dashboard')
  return data
}

function dashboardUrl(path, startDate, endDate) {
  return `/dashboard/workspace/${WS}/${path}?startDate=${startDate}&endDate=${endDate}`
}

export async function getDashboardData(startDate, endDate) {
  const [
    resolved,
    credits,
    contacts,
    appointments,
    creditsByPeriod,
    creditsByModel,
    assistantsPerf,
    contactsPerf,
    byHour,
    byChannel,
  ] = await Promise.all([
    dashboardRequest(dashboardUrl('interactions/resolved/count', startDate, endDate)),
    dashboardRequest(dashboardUrl('credits/consumption/amount', startDate, endDate)),
    dashboardRequest(dashboardUrl('contacts/new/count', startDate, endDate)),
    dashboardRequest(dashboardUrl('appointments/scheduled/count', startDate, endDate)),
    dashboardRequest(dashboardUrl('credits/consumption/by-period', startDate, endDate)),
    dashboardRequest(dashboardUrl('credits/consumption/by-model', startDate, endDate)),
    dashboardRequest(dashboardUrl('assistants/performance', startDate, endDate)),
    dashboardRequest(dashboardUrl('contacts/performance', startDate, endDate)),
    dashboardRequest(dashboardUrl('interactions/by-hour', startDate, endDate)),
    dashboardRequest(dashboardUrl('credits/consumption/by-channel', startDate, endDate)),
  ])
  return { resolved, credits, contacts, appointments, creditsByPeriod, creditsByModel, assistantsPerf, contactsPerf, byHour, byChannel }
}

export function checkUserTokenStatus() {
  const expiry = getTokenExpiryInfo(_userToken)
  if (!_userToken) return { valid: false, message: 'Token de usuário não configurado' }
  if (expiry?.expired) return { valid: false, message: `Token expirado. Atualize o VITE_GPTMAKER_USER_TOKEN` }
  if (expiry && expiry.hoursLeft < 2) return { valid: true, message: `Token expira em ${expiry.hoursLeft}h` }
  return { valid: true, message: null }
}

// Treinamentos
export async function listTrainings(agentId, type = '', page = 1, pageSize = 50) {
  const t = type ? `&type=${type}` : ''
  const data = await request(`/v2/agent/${agentId}/trainings?page=${page}&pageSize=${pageSize}${t}`)
  return data.data || []
}

export async function createTraining(agentId, body) {
  return request(`/v2/agent/${agentId}/trainings`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateTraining(trainingId, body) {
  return request(`/v2/training/${trainingId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export async function deleteTraining(trainingId) {
  return request(`/v2/training/${trainingId}`, { method: 'DELETE' })
}
