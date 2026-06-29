// Endpoint para indexar base de conhecimento com embeddings semânticos
// Chamar UMA VEZ após ativar pgvector no Supabase: POST /api/embed-knowledge
// Seguro chamar novamente — só processa entradas sem embedding

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY
const COHERE_API_KEY = process.env.COHERE_API_KEY

const SB_HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

async function generateEmbedding(text) {
  const res = await fetch('https://api.cohere.com/v2/embed', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${COHERE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      texts: [text],
      model: 'embed-multilingual-v3.0',
      input_type: 'search_document',
      embedding_types: ['float'],
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Cohere ${res.status}: ${err}`)
  }
  const data = await res.json()
  return data.embeddings?.float?.[0]
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' })

  if (!COHERE_API_KEY) return res.status(500).json({ error: 'COHERE_API_KEY não configurada' })

  try {
    // Busca entradas sem embedding
    const allRes = await fetch(
      `${SUPABASE_URL}/rest/v1/knowledge?select=id,title,content&embedding=is.null&limit=500`,
      { headers: SB_HEADERS }
    )
    if (!allRes.ok) throw new Error(`Supabase erro: ${allRes.status}`)
    const entries = await allRes.json()

    if (!entries.length) {
      return res.status(200).json({ message: 'Todas as entradas já têm embedding', total: 0 })
    }

    const results = []

    for (const entry of entries) {
      try {
        const text = [entry.title, entry.content].filter(Boolean).join('\n\n')
        const embedding = await generateEmbedding(text)

        await fetch(`${SUPABASE_URL}/rest/v1/knowledge?id=eq.${entry.id}`, {
          method: 'PATCH',
          headers: { ...SB_HEADERS, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ embedding }),
        })

        results.push({ id: entry.id, title: entry.title, status: 'ok' })
        console.log(`[embed] ✅ ${entry.title}`)

        await new Promise(r => setTimeout(r, 150))
      } catch (e) {
        console.error(`[embed] ❌ ${entry.title}: ${e.message}`)
        results.push({ id: entry.id, title: entry.title, status: 'erro', error: e.message })
      }
    }

    return res.status(200).json({
      total: entries.length,
      success: results.filter(r => r.status === 'ok').length,
      failed: results.filter(r => r.status === 'erro').length,
      results,
    })
  } catch (err) {
    console.error('[embed-knowledge] Erro:', err)
    return res.status(500).json({ error: err.message })
  }
}
