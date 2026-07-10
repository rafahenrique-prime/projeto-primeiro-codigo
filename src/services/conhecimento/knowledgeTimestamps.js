export function loadCreated() {
  try { return JSON.parse(localStorage.getItem('codex_created') || '{}') } catch { return {} }
}

export function saveCreated(id) {
  try {
    const m = loadCreated()
    m[id] = Date.now()
    localStorage.setItem('codex_created', JSON.stringify(m))
  } catch {}
}

export function getCreatedAt(item) {
  const api = item.createdAt || item.created_at || item.dateCreated
  if (api) return new Date(api).getTime()
  return loadCreated()[item.id] || 0
}

export function isNew(item) {
  const ts = getCreatedAt(item)
  return ts > 0 && Date.now() - ts < 48 * 60 * 60 * 1000
}
