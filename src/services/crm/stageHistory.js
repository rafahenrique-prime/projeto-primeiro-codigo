const KEY = 'codex_stage_history'

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} }
}

function save(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)) } catch {}
}

export function recordStage(convId, stage) {
  if (!convId || !stage || stage === 'INDEFINIDO') return
  const all = load()
  const history = all[convId] || []
  if (history.length && history[history.length - 1].stage === stage) return
  history.push({ stage, at: Date.now() })
  all[convId] = history.slice(-10)
  save(all)
}

export function getTimeInStage(convId) {
  const all = load()
  const history = all[convId]
  if (!history?.length) return null
  const last = history[history.length - 1]
  const min = Math.round((Date.now() - last.at) / 60000)
  if (min < 60) return { stage: last.stage, minutes: min, label: `${min}min` }
  if (min < 1440) {
    const h = Math.floor(min / 60)
    const m = min % 60
    return { stage: last.stage, minutes: min, label: m > 0 ? `${h}h ${m}min` : `${h}h` }
  }
  const days = Math.floor(min / 1440)
  return { stage: last.stage, minutes: min, label: `${days} dia${days > 1 ? 's' : ''}` }
}

export function cleanupOldEntries() {
  const all = load()
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  let changed = false
  for (const id of Object.keys(all)) {
    const filtered = (all[id] || []).filter(e => e.at > cutoff)
    if (filtered.length === 0) { delete all[id]; changed = true }
    else if (filtered.length !== all[id].length) { all[id] = filtered; changed = true }
  }
  if (changed) save(all)
}
