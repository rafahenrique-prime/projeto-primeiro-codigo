const SUPABASE_URL = "https://mbbgqasvssueirynnoyk.supabase.co"
const SUPABASE_KEY = "sb_publishable_RliDhy3CwEL-8eOw7EuwEQ_Ekpj9IPV"
const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation,resolution=merge-duplicates',
}
const produtos = [
  { nome: "Camiseta Oversized Balenciaga Branca", preco: "199.00", price_original: 199, price_discount: 199, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Camiseta Oversized Off White", preco: "199.00", price_original: 199, price_discount: 199, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Brand 433 Myself Masculino 25ml", preco: "120.00", price_original: 139.90, price_discount: 120, discount_percent: 14, status: "active", source: "bagy" },
  { nome: "Fame Brand 378 25ml", preco: "120.00", price_original: 139, price_discount: 120, discount_percent: 13, status: "active", source: "bagy" },
  { nome: "Louis Vuitton Lv Skate Sneaker Branco Verde", preco: "459.00", price_original: 599, price_discount: 459, discount_percent: 23, status: "active", source: "bagy" },
  { nome: "Louis Vuitton Lv Skate Sneaker Preto", preco: "459.00", price_original: 599, price_discount: 459, discount_percent: 23, status: "active", source: "bagy" },
  { nome: "Louis Vuitton Lv Skate Sneaker Branco Cinza", preco: "459.00", price_original: 599, price_discount: 459, discount_percent: 23, status: "active", source: "bagy" },
  { nome: "Louis Vuitton Lv Skate Sneaker Roxo", preco: "459.00", price_original: 599, price_discount: 459, discount_percent: 23, status: "active", source: "bagy" },
  { nome: "Louis Vuitton Lv Skate Sneaker Branco Preto", preco: "459.00", price_original: 599, price_discount: 459, discount_percent: 23, status: "active", source: "bagy" },
  { nome: "Louis Vuitton Lv Skate Sneaker Vermelho", preco: "459.00", price_original: 599, price_discount: 459, discount_percent: 23, status: "active", source: "bagy" },
  { nome: "Louis Vuitton Lv Skate Sneaker Branco Preto Cinza", preco: "459.00", price_original: 599, price_discount: 459, discount_percent: 23, status: "active", source: "bagy" },
  { nome: "Louis Vuitton Lv Skate Sneaker Azul", preco: "459.00", price_original: 599, price_discount: 459, discount_percent: 23, status: "active", source: "bagy" },
  { nome: "Louis Vuitton Lv Skate Sneaker Verde", preco: "459.00", price_original: 599, price_discount: 459, discount_percent: 23, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Lv Millionaire Preto", preco: "199.00", price_original: 199, price_discount: 199, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "New Balance 997 Marrom", preco: "399.00", price_original: 399, price_discount: 399, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "New Balance 997 Bege", preco: "399.00", price_original: 399, price_discount: 399, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "New Balance 997 Preto Laranja", preco: "399.00", price_original: 399, price_discount: 399, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "New Balance 997 Branco", preco: "399.00", price_original: 399, price_discount: 399, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "New Balance 997 Chumbo", preco: "399.00", price_original: 399, price_discount: 399, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "New Balance 997 Preto", preco: "399.00", price_original: 399, price_discount: 399, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Tenis New Balance 9060 Cizna C/ Detalhes Rosa", preco: "449.99", price_original: 599, price_discount: 449.99, discount_percent: 25, status: "active", source: "bagy" },
  { nome: "Tenis New Balance 9060 Rosa com Branco", preco: "449.00", price_original: 449, price_discount: 449, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Tenis New Balance 9060 Bege Cinza", preco: "449.00", price_original: 599, price_discount: 449, discount_percent: 25, status: "active", source: "bagy" },
  { nome: "Tenis New Balance 9060 Branco C/ Roxo", preco: "449.00", price_original: 599, price_discount: 449, discount_percent: 25, status: "active", source: "bagy" },
  { nome: "Tenis New Balance 9060 Preto C/ Cinza", preco: "449.00", price_original: 599, price_discount: 449, discount_percent: 25, status: "active", source: "bagy" },
]
console.log(`\n🚀 PÁGINA 13 (301-325) - ${produtos.length} produtos\n`)
const response = await fetch(`${SUPABASE_URL}/rest/v1/products`, {
  method: 'POST',
  headers,
  body: JSON.stringify(produtos),
})
console.log("📊 Status HTTP:", response.status)
if (response.ok) {
  const data = await response.json()
  console.log(`\n✅ SUCESSO! ${data.length} produtos sincronizados!`)
} else {
  const err = await response.text()
  console.log("\n❌ ERRO:", err)
}
