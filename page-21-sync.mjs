const SUPABASE_URL = "https://mbbgqasvssueirynnoyk.supabase.co"
const SUPABASE_KEY = "sb_publishable_RliDhy3CwEL-8eOw7EuwEQ_Ekpj9IPV"
const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation,resolution=merge-duplicates' }
const produtos = [
  { nome: "Bermudas", preco: "179.00", price_original: 199, price_discount: 179, discount_percent: 10, status: "active", source: "bagy" },
  { nome: "Regatas Dry-fit", preco: "109.00", price_original: 129, price_discount: 109, discount_percent: 15, status: "inactive", source: "bagy" },
  { nome: "Al Noble Wazeer Lattafa 100ml", preco: "449.00", price_original: 499, price_discount: 449, discount_percent: 10, status: "active", source: "bagy" },
  { nome: "Lattafa Al Noble Safeer 100ml", preco: "449.00", price_original: 499, price_discount: 449, discount_percent: 10, status: "active", source: "bagy" },
  { nome: "Lattafa Al Noble Ameer Edp 100ml", preco: "449.00", price_original: 499, price_discount: 449, discount_percent: 10, status: "active", source: "bagy" },
  { nome: "Maison Alhambra Salvo Edp 100ml", preco: "499.99", price_original: 499.99, price_discount: 499.99, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Oud Mystery Intense Edp Unissex 100ml", preco: "499.00", price_original: 499, price_discount: 499, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Glacier Le Noir 100ml Edp", preco: "499.00", price_original: 499, price_discount: 499, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Yara Eau de Parfum Feminino 100ml", preco: "490.00", price_original: 490, price_discount: 490, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Lattafa Haya Haya Edp 100ml", preco: "499.00", price_original: 499, price_discount: 499, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Coco Moiselle Alhambra Feminino 100ml", preco: "449.00", price_original: 499.99, price_discount: 449, discount_percent: 10, status: "active", source: "bagy" },
  { nome: "Camiseta Diesel Estampada", preco: "189.00", price_original: 189, price_discount: 189, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Blusa Diesel", preco: "279.00", price_original: 279, price_discount: 279, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Tenis New Balance 9060 Bege Creme", preco: "449.00", price_original: 599, price_discount: 449, discount_percent: 25, status: "active", source: "bagy" },
  { nome: "Tenis Hugo 2023 Preto", preco: "429.00", price_original: 429, price_discount: 429, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Tenis Hugo Preto 2024", preco: "449.90", price_original: 449.90, price_discount: 449.90, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Tenis Hugo 2024", preco: "449.00", price_original: 449, price_discount: 449, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Tenis Vans", preco: "349.00", price_original: 349, price_discount: 349, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Camiseta Oversized Gucci", preco: "189.00", price_original: 189, price_discount: 189, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Tenis Hugo Boss", preco: "399.00", price_original: 499, price_discount: 399, discount_percent: 20, status: "active", source: "bagy" },
]
console.log(`\n🚀 PÁGINA 21 (501-520) - ÚLTIMA PÁGINA!\n`)
const response = await fetch(`${SUPABASE_URL}/rest/v1/products`, { method: 'POST', headers, body: JSON.stringify(produtos) })
console.log("📊 Status:", response.status); if (response.ok) console.log(`✅ FINALIZADO! Todos os 520 produtos sincronizados!`)
