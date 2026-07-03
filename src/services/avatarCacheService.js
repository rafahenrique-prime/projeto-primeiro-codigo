// Cache de fotos de perfil (WhatsApp/Instagram) no Supabase Storage.
// Motivo: as URLs que o GPT Maker devolve (CDN do WhatsApp/Instagram) são temporárias
// e às vezes já chegam bloqueadas (ex.: 403 do cdninstagram.com) — guardando uma cópia
// permanente no nosso Storage, a foto nunca mais some.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY
const TABLE = 'avatar_cache'
const BUCKET = 'avatars'

const sbHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

function isOwnStorageUrl(url) {
  return typeof url === 'string' && url.includes(`${SUPABASE_URL}/storage/`)
}

// Busca a URL em cache pra um contato (sem tentar baixar nada).
export async function getCachedUrl(contactId) {
  if (!contactId) return null
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?contact_id=eq.${encodeURIComponent(contactId)}&select=url`, { headers: sbHeaders })
    if (!res.ok) return null
    const rows = await res.json()
    return rows[0]?.url || null
  } catch {
    return null
  }
}

// Garante que a foto do contato está salva no nosso Storage. Se já estiver, retorna
// a URL cacheada sem baixar de novo. Se não estiver, pede pro servidor baixar e subir
// (o download precisa rodar no servidor — o CDN do Instagram bloqueia fetch direto do
// navegador por CORS). Sempre retorna algo utilizável: a URL cacheada, ou a original.
export async function ensureCachedAvatar(contactId, originalUrl) {
  if (!originalUrl || !contactId || isOwnStorageUrl(originalUrl)) return originalUrl

  const cached = await getCachedUrl(contactId)
  if (cached) return cached

  try {
    const res = await fetch('/api/cache-avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactId, url: originalUrl }),
    })
    if (!res.ok) return originalUrl
    const data = await res.json()
    return data.url || originalUrl
  } catch (err) {
    console.warn('[avatarCache] não foi possível cachear a foto, usando original:', err.message)
    return originalUrl
  }
}

// Apaga todo o cache de avatares (Storage + tabela). Usado pelo botão "Apagar avatares em cache".
export async function clearAvatarCache() {
  const listRes = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: sbHeaders,
    body: JSON.stringify({ limit: 1000, offset: 0, prefix: '' }),
  })
  if (listRes.ok) {
    const files = await listRes.json()
    const names = files.map(f => f.name).filter(Boolean)
    if (names.length > 0) {
      await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
        method: 'DELETE',
        headers: sbHeaders,
        body: JSON.stringify({ prefixes: names }),
      })
    }
  }
  await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?contact_id=not.is.null`, {
    method: 'DELETE',
    headers: sbHeaders,
  })
}
