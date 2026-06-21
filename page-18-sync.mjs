const SUPABASE_URL = "https://mbbgqasvssueirynnoyk.supabase.co"
const SUPABASE_KEY = "sb_publishable_RliDhy3CwEL-8eOw7EuwEQ_Ekpj9IPV"
const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation,resolution=merge-duplicates' }
const produtos = [
  { nome: "Calça Jeans Emporio Armani Preta", preco: "259.00", price_original: 319, price_discount: 259, discount_percent: 19, status: "active", source: "bagy" },
  { nome: "Bermuda Diesel Azul", preco: "189.00", price_original: 249, price_discount: 189, discount_percent: 24, status: "active", source: "bagy" },
  { nome: "Bermuda Diesel Branca", preco: "189.00", price_original: 249, price_discount: 189, discount_percent: 24, status: "active", source: "bagy" },
  { nome: "Bermuda Diesel Verde", preco: "189.00", price_original: 249, price_discount: 189, discount_percent: 24, status: "active", source: "bagy" },
  { nome: "Bermuda Diesel Vermelha", preco: "189.00", price_original: 249, price_discount: 189, discount_percent: 24, status: "active", source: "bagy" },
  { nome: "Chinelo Slide Gucci Feminina", preco: "299.00", price_original: 349, price_discount: 299, discount_percent: 14, status: "inactive", source: "bagy" },
  { nome: "Chinelo Slide Boss Preta", preco: "159.00", price_original: 199, price_discount: 159, discount_percent: 20, status: "active", source: "bagy" },
  { nome: "Chinelo Slide Boss Branca", preco: "169.00", price_original: 169, price_discount: 169, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Body Cream Mugler Alien Feminino Creme Hidratante 200ml", preco: "999.99", price_original: 999.99, price_discount: 999.99, discount_percent: 0, status: "inactive", source: "bagy" },
  { nome: "One Million Parfum 100ml", preco: "999.99", price_original: 999.99, price_discount: 999.99, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Armani Acqua Di Gio 100ml", preco: "900.00", price_original: 900, price_discount: 900, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Ralph Lauren Polo Blue Edt 125ml", preco: "599.00", price_original: 690, price_discount: 599, discount_percent: 13, status: "active", source: "bagy" },
  { nome: "Yves Saint Laurent Y Edp 100ml", preco: "999.00", price_original: 999, price_discount: 999, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Mont Blanc Individuel 75ml", preco: "900.00", price_original: 900, price_discount: 900, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Moschino Toy 2 Bubble Gum Edt 100ml", preco: "900.00", price_original: 900, price_discount: 900, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Moschino Toy Boy Eau Parfum 100ml", preco: "900.00", price_original: 900, price_discount: 900, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Alien Mugler Loção Corporal 200ml", preco: "800.00", price_original: 800, price_discount: 800, discount_percent: 0, status: "inactive", source: "bagy" },
  { nome: "Phantom Parfum 100ml", preco: "790.00", price_original: 990, price_discount: 790, discount_percent: 20, status: "active", source: "bagy" },
  { nome: "Phantom Paco Rabanne Edt 100ml", preco: "699.00", price_original: 799.99, price_discount: 699, discount_percent: 13, status: "active", source: "bagy" },
  { nome: "Ysl Kouros Tradicional 100ml", preco: "900.00", price_original: 900, price_discount: 900, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Versace Tradicional Pour Homme Edt 100ml", preco: "699.00", price_original: 799, price_discount: 699, discount_percent: 13, status: "active", source: "bagy" },
  { nome: "212 Nyc Men Edt 100ml", preco: "599.00", price_original: 699, price_discount: 599, discount_percent: 14, status: "active", source: "bagy" },
  { nome: "Azzaro Pour Homme Eau de Toilette 100ml", preco: "499.00", price_original: 599, price_discount: 499, discount_percent: 17, status: "active", source: "bagy" },
  { nome: "Diesel Spirit Of The Brave 125ml", preco: "799.00", price_original: 899, price_discount: 799, discount_percent: 11, status: "active", source: "bagy" },
  { nome: "Diesel Only The Brave Edt 125ml", preco: "900.00", price_original: 900, price_discount: 900, discount_percent: 0, status: "active", source: "bagy" },
]
console.log(`\n🚀 PÁGINA 18 (426-450)\n`)
const response = await fetch(`${SUPABASE_URL}/rest/v1/products`, { method: 'POST', headers, body: JSON.stringify(produtos) })
console.log("📊 Status:", response.status); if (response.ok) console.log(`✅ OK!`)
