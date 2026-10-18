const STORAGE_KEY = 'codex_created'
const NEW_WINDOW_MS = 48 * 60 * 60 * 1000 // selo "NOVO" vale por 48h

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// Timestamp utilizável: número finito, positivo e dentro do intervalo de Date
// (0/NaN/Infinity/fora do intervalo/estrutura inválida = desconhecido)
function toValidTimestamp(value) {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value !== 'number' && typeof value !== 'string' && !(value instanceof Date)) return 0
  // new Date() devolve NaN para números além de ±8.64e15 ms
  const ts = new Date(value).getTime()
  return Number.isFinite(ts) && ts > 0 ? ts : 0
}

export function loadCreated() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    return isPlainObject(parsed) ? parsed : {}
  } catch (err) {
    console.error('[loadCreated] Erro ao ler cache de datas', { key: STORAGE_KEY, message: err.message })
    return {}
  }
}

export function saveCreated(id) {
  if (id === null || id === undefined || id === '') return false
  try {
    const m = loadCreated()
    m[id] = Date.now()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(m))
    return true
  } catch (err) {
    console.error('[saveCreated] Erro ao gravar cache de datas', { key: STORAGE_KEY, message: err.message })
    return false
  }
}

export function getCreatedAt(item) {
  if (!item) return 0
  const api = toValidTimestamp(item.createdAt || item.created_at || item.dateCreated)
  if (api) return api
  if (item.id === null || item.id === undefined || item.id === '') return 0
  return toValidTimestamp(loadCreated()[item.id])
}

export function isNew(item) {
  const ts = getCreatedAt(item)
  if (ts <= 0) return false
  const age = Date.now() - ts
  return age >= 0 && age < NEW_WINDOW_MS
}
