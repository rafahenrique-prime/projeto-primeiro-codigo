// Gerencia histórico de fotos enviadas
const HISTORY_KEY = 'photo_history'
const MAX_HISTORY = 100

export function addPhotoToHistory(evento) {
  try {
    let history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')

    const entry = {
      id: Date.now(),
      timestamp: new Date().toLocaleTimeString('pt-BR'),
      date: new Date().toLocaleDateString('pt-BR'),
      produto: evento.produto || 'Desconhecido',
      cliente: evento.cliente || 'Sem nome',
      canal: evento.canal || 'Desconhecido',
      tipo: evento.tipo || 'manual', // 'automático' ou 'manual'
      sucesso: evento.sucesso !== false,
      erro: evento.erro || null,
    }

    history.unshift(entry)
    history = history.slice(0, MAX_HISTORY)

    localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
    return entry
  } catch (e) {
    console.error('Erro ao salvar histórico:', e)
    return null
  }
}

export function getPhotoHistory(filtro = {}) {
  try {
    let history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')

    // Filtra por data se especificado
    if (filtro.date) {
      history = history.filter(h => h.date === filtro.date)
    }

    // Filtra por tipo (automático/manual)
    if (filtro.tipo) {
      history = history.filter(h => h.tipo === filtro.tipo)
    }

    // Filtra por status (sucesso/erro)
    if (filtro.sucesso !== undefined) {
      history = history.filter(h => h.sucesso === filtro.sucesso)
    }

    return history
  } catch (e) {
    console.error('Erro ao buscar histórico:', e)
    return []
  }
}

export function getPhotoStats(date = null) {
  const history = date ? getPhotoHistory({ date }) : getPhotoHistory()

  const stats = {
    total: history.length,
    sucessos: history.filter(h => h.sucesso).length,
    erros: history.filter(h => !h.sucesso).length,
    automaticos: history.filter(h => h.tipo === 'automático').length,
    manuais: history.filter(h => h.tipo === 'manual').length,
    produtosUnicos: [...new Set(history.map(h => h.produto))].length,
    taxaSucesso: history.length > 0 ? Math.round((history.filter(h => h.sucesso).length / history.length) * 100) : 0,
  }

  return stats
}

export function clearPhotoHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY)
    return true
  } catch (e) {
    console.error('Erro ao limpar histórico:', e)
    return false
  }
}

export function getPhotosByProduct(produto) {
  const history = getPhotoHistory()
  return history.filter(h => h.produto.toLowerCase().includes(produto.toLowerCase()))
}

export function getPhotosByClient(cliente) {
  const history = getPhotoHistory()
  return history.filter(h => h.cliente.toLowerCase().includes(cliente.toLowerCase()))
}
