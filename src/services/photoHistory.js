// Histórico de fotos enviadas — Supabase
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY
const TABLE = 'photo_history'

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
}

function base() {
  return `${SUPABASE_URL}/rest/v1/${TABLE}`
}

export async function addPhotoToHistory(evento) {
  try {
    const entry = {
      produto: evento.produto || 'Desconhecido',
      cliente: evento.cliente || 'Sem nome',
      canal: evento.canal || 'Desconhecido',
      tipo: evento.tipo || 'manual',
      sucesso: evento.sucesso !== false,
      erro: evento.erro || null,
    }
    const res = await fetch(base(), {
      method: 'POST',
      headers,
      body: JSON.stringify(entry),
    })
    if (!res.ok) throw new Error(`addPhotoToHistory: ${res.status}`)
    const data = await res.json()
    return data[0]
  } catch (e) {
    console.error('Erro ao salvar histórico:', e)
    return null
  }
}

export async function getPhotoHistory(filtro = {}) {
  try {
    let url = `${base()}?order=created_at.desc&limit=200`
    if (filtro.sucesso !== undefined) url += `&sucesso=eq.${filtro.sucesso}`
    if (filtro.tipo) url += `&tipo=eq.${encodeURIComponent(filtro.tipo)}`
    if (filtro.date) {
      // filtra por data local (created_at começa com a data ISO)
      const iso = filtro.date.split('/').reverse().join('-') // dd/mm/yyyy → yyyy-mm-dd
      url += `&created_at=gte.${iso}T00:00:00&created_at=lte.${iso}T23:59:59`
    }
    const res = await fetch(url, { headers })
    if (!res.ok) throw new Error(`getPhotoHistory: ${res.status}`)
    return res.json()
  } catch (e) {
    console.error('Erro ao buscar histórico:', e)
    return []
  }
}

export async function getPhotoStats(date = null) {
  const history = await getPhotoHistory(date ? { date } : {})
  return {
    total: history.length,
    sucessos: history.filter(h => h.sucesso).length,
    erros: history.filter(h => !h.sucesso).length,
    automaticos: history.filter(h => h.tipo === 'automático').length,
    manuais: history.filter(h => h.tipo === 'manual').length,
    produtosUnicos: [...new Set(history.map(h => h.produto))].length,
    taxaSucesso: history.length > 0 ? Math.round((history.filter(h => h.sucesso).length / history.length) * 100) : 0,
  }
}

export async function clearPhotoHistory() {
  try {
    const res = await fetch(`${base()}?id=neq.00000000-0000-0000-0000-000000000000`, {
      method: 'DELETE',
      headers,
    })
    return res.ok
  } catch (e) {
    console.error('Erro ao limpar histórico:', e)
    return false
  }
}

export async function getPhotosByProduct(produto) {
  const history = await getPhotoHistory()
  return history.filter(h => h.produto.toLowerCase().includes(produto.toLowerCase()))
}

export async function getPhotosByClient(cliente) {
  const history = await getPhotoHistory()
  return history.filter(h => h.cliente.toLowerCase().includes(cliente.toLowerCase()))
}
