const SUPABASE_URL = "https://mbbgqasvssueirynnoyk.supabase.co"
const SUPABASE_KEY = "sb_publishable_RliDhy3CwEL-8eOw7EuwEQ_Ekpj9IPV"
const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation,resolution=merge-duplicates' }
const produtos = [
  { nome: "Camiseta Calvin Klein Básica Premium Azul", preco: "129.00", price_original: 219, price_discount: 129, discount_percent: 41, status: "active", source: "bagy" },
  { nome: "Camiseta Calvin Klein Básica Premium Vermelha", preco: "129.00", price_original: 219, price_discount: 129, discount_percent: 41, status: "active", source: "bagy" },
  { nome: "Camiseta Calvin Klein Básica Premium Branca", preco: "129.00", price_original: 219, price_discount: 129, discount_percent: 41, status: "active", source: "bagy" },
  { nome: "Camiseta Diesel Básica Premium Verde Musgo", preco: "129.00", price_original: 219, price_discount: 129, discount_percent: 41, status: "active", source: "bagy" },
  { nome: "Camiseta Diesel Básica Premium Marron", preco: "129.00", price_original: 219, price_discount: 129, discount_percent: 41, status: "active", source: "bagy" },
  { nome: "Camiseta Diesel Básica Premium Preta", preco: "129.00", price_original: 219, price_discount: 129, discount_percent: 41, status: "active", source: "bagy" },
  { nome: "Camiseta Diesel Básica Premium Verde", preco: "129.00", price_original: 219, price_discount: 129, discount_percent: 41, status: "active", source: "bagy" },
  { nome: "Camiseta Diesel Básica Premium Branca", preco: "129.00", price_original: 219, price_discount: 129, discount_percent: 41, status: "active", source: "bagy" },
  { nome: "Camiseta Diesel Básica Premium Azul Marinho", preco: "129.00", price_original: 219, price_discount: 129, discount_percent: 41, status: "active", source: "bagy" },
  { nome: "Camiseta Diesel Básica Premium Azul Bebê", preco: "129.00", price_original: 219, price_discount: 129, discount_percent: 41, status: "active", source: "bagy" },
  { nome: "Camiseta Diesel Básica Premium Bege", preco: "129.00", price_original: 219, price_discount: 129, discount_percent: 41, status: "active", source: "bagy" },
  { nome: "Empório Armani Camiseta Básica Premium Azul", preco: "129.00", price_original: 219, price_discount: 129, discount_percent: 41, status: "active", source: "bagy" },
  { nome: "Empório Armani Camiseta Básica Premium Branca", preco: "129.00", price_original: 219, price_discount: 129, discount_percent: 41, status: "active", source: "bagy" },
  { nome: "Empório Armani Camiseta Básica Premium Preta", preco: "129.00", price_original: 219, price_discount: 129, discount_percent: 41, status: "active", source: "bagy" },
  { nome: "Empório Armani Camiseta Básica Premium Laranja", preco: "129.00", price_original: 219, price_discount: 129, discount_percent: 41, status: "active", source: "bagy" },
  { nome: "Chinelo Boss", preco: "150.00", price_original: 150, price_discount: 150, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Chinelo Diesel Preto Vermelho", preco: "150.00", price_original: 150, price_discount: 150, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Chinelo Diesel All Over Preto", preco: "150.00", price_original: 150, price_discount: 150, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Chinelo Diesel Branco", preco: "150.00", price_original: 219, price_discount: 150, discount_percent: 31, status: "active", source: "bagy" },
  { nome: "Chinelo Diesel Preto Plataforma", preco: "150.00", price_original: 150, price_discount: 150, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Chinelo Diesel Vermelho", preco: "150.00", price_original: 150, price_discount: 150, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Chinelo Diesel Creme", preco: "150.00", price_original: 150, price_discount: 150, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Empório Armani Camiseta Básica Premium Verde", preco: "129.00", price_original: 219, price_discount: 129, discount_percent: 41, status: "active", source: "bagy" },
  { nome: "Plataforma Gucci Femina Marrom Claro", preco: "319.00", price_original: 499, price_discount: 319, discount_percent: 36, status: "active", source: "bagy" },
  { nome: "Bermuda Diesel Jeans", preco: "179.00", price_original: 229, price_discount: 179, discount_percent: 22, status: "active", source: "bagy" },
]
console.log(`\n🚀 PÁGINA 17 (401-425)\n`)
const response = await fetch(`${SUPABASE_URL}/rest/v1/products`, { method: 'POST', headers, body: JSON.stringify(produtos) })
console.log("📊 Status:", response.status); if (response.ok) console.log(`✅ OK!`)
