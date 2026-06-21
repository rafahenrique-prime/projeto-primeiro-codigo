const SUPABASE_URL = "https://mbbgqasvssueirynnoyk.supabase.co"
const SUPABASE_KEY = "sb_publishable_RliDhy3CwEL-8eOw7EuwEQ_Ekpj9IPV"

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation,resolution=merge-duplicates',
}

const produtos = [
  { nome: "Camiseta Tricot Itals Branca", preco: "199.00", price_original: 219, price_discount: 199, discount_percent: 9, status: "active", source: "bagy" },
  { nome: "Camiseta Tricot Itals Palha", preco: "199.00", price_original: 219, price_discount: 199, discount_percent: 9, status: "active", source: "bagy" },
  { nome: "Camiseta Tricot Itals Verde", preco: "199.00", price_original: 219, price_discount: 199, discount_percent: 9, status: "active", source: "bagy" },
  { nome: "Camiseta Tricot Itals Cinza", preco: "199.00", price_original: 219, price_discount: 199, discount_percent: 9, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Cat Eye Preto", preco: "199.00", price_original: 249, price_discount: 199, discount_percent: 20, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Miu Miu Tartaruga", preco: "199.00", price_original: 249, price_discount: 199, discount_percent: 20, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Quadrado Transparente", preco: "199.00", price_original: 249, price_discount: 199, discount_percent: 20, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Tartaruga Marrom", preco: "199.00", price_original: 249, price_discount: 199, discount_percent: 20, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Cat Eye Dourado", preco: "199.00", price_original: 249, price_discount: 199, discount_percent: 20, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Quadrado Âmbar", preco: "199.00", price_original: 249, price_discount: 199, discount_percent: 20, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Retangular Fumê", preco: "199.00", price_original: 249, price_discount: 199, discount_percent: 20, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Retangular Fumê Ii", preco: "199.00", price_original: 249, price_discount: 199, discount_percent: 20, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Quadrado Caramelo", preco: "199.00", price_original: 249, price_discount: 199, discount_percent: 20, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Aviador Preto", preco: "199.00", price_original: 249, price_discount: 199, discount_percent: 20, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Retangular Tartaruga", preco: "199.00", price_original: 249, price_discount: 199, discount_percent: 20, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Flat Top Âmbar", preco: "199.00", price_original: 249, price_discount: 199, discount_percent: 20, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Flat Top Âmbar Ii", preco: "199.00", price_original: 249, price_discount: 199, discount_percent: 20, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Quadrado Cristal", preco: "199.00", price_original: 249, price_discount: 199, discount_percent: 20, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Quadrado Azul", preco: "199.00", price_original: 249, price_discount: 199, discount_percent: 20, status: "active", source: "bagy" },
  { nome: "Tenis New Balance 9060 Branco", preco: "449.00", price_original: 599, price_discount: 449, discount_percent: 25, status: "active", source: "bagy" },
  { nome: "Camiseta Boss Preta", preco: "179.00", price_original: 179, price_discount: 179, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Camiseta Diesel Branca", preco: "179.00", price_original: 219, price_discount: 179, discount_percent: 18, status: "active", source: "bagy" },
  { nome: "Camiseta Diesel Preta", preco: "179.00", price_original: 179, price_discount: 179, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Camiseta Oversized Nike", preco: "199.00", price_original: 199, price_discount: 199, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Camiseta Oversized Balenciaga Verde", preco: "199.00", price_original: 199, price_discount: 199, discount_percent: 0, status: "active", source: "bagy" },
]

console.log(`\n🚀 SINCRONIZANDO PÁGINA 12 - ${produtos.length} PRODUTOS...\n`)

const response = await fetch(`${SUPABASE_URL}/rest/v1/products`, {
  method: 'POST',
  headers,
  body: JSON.stringify(produtos),
})

console.log("📊 Status HTTP:", response.status)

if (response.ok) {
  const data = await response.json()
  console.log(`\n✅ SUCESSO! ${data.length} produtos sincronizados!`)
  data.forEach(p => console.log(`  - ${p.nome} | R$ ${p.price_discount}`))
} else {
  const err = await response.text()
  console.log("\n❌ ERRO:", err)
}
