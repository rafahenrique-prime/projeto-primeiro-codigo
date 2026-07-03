// Baixa a foto de perfil (WhatsApp/Instagram) e salva no Storage próprio.
// Roda no servidor de propósito: o CDN do Instagram bloqueia fetch direto do navegador
// (CORS/hotlink protection — os 403 que apareciam antes), mas server-to-server funciona.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY
const BUCKET = 'avatars'

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'image/webp,image/*,*/*;q=0.8',
}

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase não configurado' })
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { contactId, url } = req.body || {}
  if (!contactId || !url) {
    return res.status(400).json({ error: 'contactId e url são obrigatórios' })
  }

  try {
    const imgRes = await fetch(url, { headers: BROWSER_HEADERS })
    if (!imgRes.ok) return res.status(200).json({ url }) // fallback: devolve a original, não quebra o app

    const buffer = Buffer.from(await imgRes.arrayBuffer())
    const fileName = `${contactId.replace(/[^a-zA-Z0-9_-]/g, '_')}.jpg`

    const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${fileName}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'x-upsert': 'true',
        'Content-Type': imgRes.headers.get('content-type') || 'image/jpeg',
      },
      body: buffer,
    })
    if (!uploadRes.ok) return res.status(200).json({ url })

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${fileName}`
    await fetch(`${SUPABASE_URL}/rest/v1/avatar_cache`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ contact_id: contactId, url: publicUrl }),
    }).catch(() => {})

    return res.status(200).json({ url: publicUrl })
  } catch (err) {
    console.error('[cache-avatar] erro:', err.message)
    return res.status(200).json({ url }) // nunca quebra o app por causa disso
  }
}
