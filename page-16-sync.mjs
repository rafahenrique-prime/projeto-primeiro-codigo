const SUPABASE_URL = "https://mbbgqasvssueirynnoyk.supabase.co"
const SUPABASE_KEY = "sb_publishable_RliDhy3CwEL-8eOw7EuwEQ_Ekpj9IPV"
const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation,resolution=merge-duplicates' }
const produtos = [
  { nome: "Boné New Era Nude", preco: "90.00", price_original: 110, price_discount: 90, discount_percent: 18, status: "active", source: "bagy" },
  { nome: "Boné New Era Preto/preto", preco: "90.00", price_original: 110, price_discount: 90, discount_percent: 18, status: "active", source: "bagy" },
  { nome: "Boné New Era Branco", preco: "90.00", price_original: 110, price_discount: 90, discount_percent: 18, status: "active", source: "bagy" },
  { nome: "Boné Louis Vuitton Preto Jeans", preco: "349.90", price_original: 599, price_discount: 349.90, discount_percent: 42, status: "active", source: "bagy" },
  { nome: "Boné New Era Preto", preco: "90.00", price_original: 110, price_discount: 90, discount_percent: 18, status: "active", source: "bagy" },
  { nome: "Boné New Era Azul", preco: "90.00", price_original: 110, price_discount: 90, discount_percent: 18, status: "active", source: "bagy" },
  { nome: "Boné New Era Destroyed Bordo", preco: "90.00", price_original: 110, price_discount: 90, discount_percent: 18, status: "active", source: "bagy" },
  { nome: "Boné New Era Destroyed Marron", preco: "90.00", price_original: 110, price_discount: 90, discount_percent: 18, status: "active", source: "bagy" },
  { nome: "Boné New Era Destroyed Amarelo", preco: "90.00", price_original: 110, price_discount: 90, discount_percent: 18, status: "active", source: "bagy" },
  { nome: "Boné New Era Destroyed Azul Marinho", preco: "90.00", price_original: 110, price_discount: 90, discount_percent: 18, status: "active", source: "bagy" },
  { nome: "Boné New Era Destroyed Preto", preco: "90.00", price_original: 110, price_discount: 90, discount_percent: 18, status: "active", source: "bagy" },
  { nome: "Boné New Era Destroyed Rosa", preco: "90.00", price_original: 110, price_discount: 90, discount_percent: 18, status: "active", source: "bagy" },
  { nome: "Tenis Diesel Branco C/ Vermelho", preco: "459.00", price_original: 599, price_discount: 459, discount_percent: 23, status: "active", source: "bagy" },
  { nome: "Louis Vuitton Lv Skate Sneaker Bege", preco: "459.00", price_original: 599, price_discount: 459, discount_percent: 23, status: "active", source: "bagy" },
  { nome: "Louis Vuitton Lv Skate Sneaker Preto Branco", preco: "459.00", price_original: 599, price_discount: 459, discount_percent: 23, status: "active", source: "bagy" },
  { nome: "Camisa Adidas Flamengo Iii 2024", preco: "149.00", price_original: 249, price_discount: 149, discount_percent: 40, status: "inactive", source: "bagy" },
  { nome: "Camisa Real Madrid Jogador 25/26 New", preco: "169.00", price_original: 249, price_discount: 169, discount_percent: 32, status: "active", source: "bagy" },
  { nome: "Camiseta Barcelona 24/25", preco: "149.00", price_original: 249, price_discount: 149, discount_percent: 40, status: "active", source: "bagy" },
  { nome: "Camiseta Manchester City", preco: "149.00", price_original: 249, price_discount: 149, discount_percent: 40, status: "active", source: "bagy" },
  { nome: "Camisa Palmeiras", preco: "149.00", price_original: 249, price_discount: 149, discount_percent: 40, status: "active", source: "bagy" },
  { nome: "Camisa Botago", preco: "149.00", price_original: 249, price_discount: 149, discount_percent: 40, status: "active", source: "bagy" },
  { nome: "Camisa Santos Mod.2024", preco: "149.00", price_original: 249, price_discount: 149, discount_percent: 40, status: "active", source: "bagy" },
  { nome: "Camisa Corinthians Mod.2024", preco: "149.00", price_original: 249, price_discount: 149, discount_percent: 40, status: "active", source: "bagy" },
  { nome: "Camiseta Basica Premium Bege Calvin", preco: "129.00", price_original: 219, price_discount: 129, discount_percent: 41, status: "active", source: "bagy" },
  { nome: "Camiseta Básica Premium Preta Calvin Klein", preco: "129.00", price_original: 219, price_discount: 129, discount_percent: 41, status: "active", source: "bagy" },
]
console.log(`\n🚀 PÁGINA 16 (376-400) - ${produtos.length} produtos\n`)
const response = await fetch(`${SUPABASE_URL}/rest/v1/products`, { method: 'POST', headers, body: JSON.stringify(produtos) })
console.log("📊 Status HTTP:", response.status)
if (response.ok) console.log(`\n✅ SUCESSO!`)
else console.log("\n❌ ERRO:", await response.text())
