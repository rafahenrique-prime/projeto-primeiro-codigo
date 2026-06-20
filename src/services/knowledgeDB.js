// Base de conhecimento — Supabase (nuvem, compartilhada entre dispositivos)

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY
const TABLE = 'knowledge'

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
}

function base() {
  return `${SUPABASE_URL}/rest/v1/${TABLE}`
}

export async function saveEntry({ title, content, category = 'GERAL', source = 'manual', gptMakerId = null }) {
  const res = await fetch(base(), {
    method: 'POST',
    headers,
    body: JSON.stringify({ title, content, category, source, gpt_maker_id: gptMakerId }),
  })
  if (!res.ok) throw new Error(`Supabase saveEntry: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return data[0]?.id
}

export async function updateEntry(id, { title, content, category }) {
  const res = await fetch(`${base()}?id=eq.${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ title, content, category }),
  })
  if (!res.ok) throw new Error(`Supabase updateEntry: ${res.status} ${await res.text()}`)
}

export async function getAllEntries() {
  const res = await fetch(`${base()}?order=created_at.desc`, { headers })
  if (!res.ok) throw new Error(`Supabase getAllEntries: ${res.status}`)
  return res.json()
}

export async function deleteEntry(id) {
  const res = await fetch(`${base()}?id=eq.${id}`, { method: 'DELETE', headers })
  if (!res.ok) throw new Error(`Supabase deleteEntry: ${res.status}`)
}

export async function searchEntries(query) {
  if (!query || query.trim().length < 2) return []
  const all = await getAllEntries()
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  if (words.length === 0) return []

  const scored = all.map(entry => {
    const score = words.reduce((acc, w) => {
      const titleHits = (( entry.title || '').toLowerCase().match(new RegExp(w, 'g')) || []).length * 3
      const contentHits = ((entry.content || '').toLowerCase().match(new RegExp(w, 'g')) || []).length
      return acc + titleHits + contentHits
    }, 0)
    return { ...entry, score }
  }).filter(e => e.score > 0)

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, 3)
}

export async function countEntries() {
  const res = await fetch(`${base()}?select=id`, {
    headers: { ...headers, 'Prefer': 'count=exact' },
  })
  const count = res.headers.get('content-range')?.split('/')[1]
  return parseInt(count || '0', 10)
}
