const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY

const sbHeaders = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
}

// [] = nada escondido = catálogo público mostra todas as marcas, inclusive pastas novas no Drive
export async function getHiddenBrands() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/catalog_public_config?id=eq.1&select=hidden_brands`, { headers: sbHeaders })
  if (!res.ok) throw new Error(`Supabase respondeu ${res.status}`)
  const rows = await res.json()
  return rows[0]?.hidden_brands || []
}

export async function saveHiddenBrands(hiddenBrands) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/catalog_public_config?id=eq.1`, {
    method: 'PATCH',
    headers: sbHeaders,
    body: JSON.stringify({ hidden_brands: hiddenBrands, updated_at: new Date().toISOString() }),
  })
  if (!res.ok) throw new Error(`Supabase respondeu ${res.status}`)
}
