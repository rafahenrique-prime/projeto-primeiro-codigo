const SUPABASE_URL = "https://mbbgqasvssueirynnoyk.supabase.co"
const SUPABASE_KEY = "sb_publishable_RliDhy3CwEL-8eOw7EuwEQ_Ekpj9IPV"
const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation,resolution=merge-duplicates' }
const produtos = [
  { nome: "Óculos de Sol Palm Angels Tartaruga", preco: "199.00", price_original: 199, price_discount: 199, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Miu Miu Shield Preto", preco: "199.00", price_original: 199, price_discount: 199, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Miu Miu Shield Cinza", preco: "199.00", price_original: 199, price_discount: 199, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Boné Itals El Patron Gold Branco", preco: "179.00", price_original: 199, price_discount: 179, discount_percent: 10, status: "active", source: "bagy" },
  { nome: "Boné Itals El Patron Gold Turquesa", preco: "190.00", price_original: 190, price_discount: 190, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Boné Itals El Chapo Preto Borda Prata", preco: "190.00", price_original: 190, price_discount: 190, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Boné Itals Dollar Preto", preco: "190.00", price_original: 190, price_discount: 190, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Boné Itals Brasão Luminous", preco: "190.00", price_original: 190, price_discount: 190, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Boné Itals Baseball Mercedes Preto", preco: "190.00", price_original: 190, price_discount: 190, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Boné Itals Bear Preto", preco: "190.00", price_original: 190, price_discount: 190, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Boné Itals All-stars New York Kinicks", preco: "190.00", price_original: 190, price_discount: 190, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Boné Itals All-stars Boston Celtics", preco: "190.00", price_original: 190, price_discount: 190, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Boné Itals Militar Vintage Orange Destroyed", preco: "190.00", price_original: 190, price_discount: 190, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Boné Itals Medellín Preto", preco: "190.00", price_original: 190, price_discount: 190, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Conjunto Moletom Boss Preto C/ Amarelo", preco: "499.00", price_original: 799, price_discount: 499, discount_percent: 37, status: "active", source: "bagy" },
  { nome: "Conjunto Moletom Boss Azul", preco: "499.00", price_original: 799, price_discount: 499, discount_percent: 37, status: "active", source: "bagy" },
  { nome: "Conjunto Moletom Boss Preto", preco: "499.00", price_original: 799, price_discount: 499, discount_percent: 37, status: "active", source: "bagy" },
  { nome: "Conjunto Moletom Armani Black", preco: "499.00", price_original: 799, price_discount: 499, discount_percent: 37, status: "active", source: "bagy" },
  { nome: "Conjunto Moletom Armani Branco C/ Preto", preco: "499.00", price_original: 799, price_discount: 499, discount_percent: 37, status: "active", source: "bagy" },
  { nome: "Conjunto Moletom Armani Preto C/ Vermelho", preco: "499.00", price_original: 799, price_discount: 499, discount_percent: 37, status: "active", source: "bagy" },
  { nome: "Conjunto Moletom Armani", preco: "499.00", price_original: 799, price_discount: 499, discount_percent: 37, status: "active", source: "bagy" },
  { nome: "Cinto Diesel Preto", preco: "169.00", price_original: 209, price_discount: 169, discount_percent: 19, status: "active", source: "bagy" },
  { nome: "Cinto Diesel Prata", preco: "149.00", price_original: 199.99, price_discount: 149, discount_percent: 25, status: "active", source: "bagy" },
  { nome: "Tenis Vans Ultrarange Vr3 Preto", preco: "299.00", price_original: 399, price_discount: 299, discount_percent: 25, status: "active", source: "bagy" },
  { nome: "Boné New Era Marron", preco: "90.00", price_original: 110, price_discount: 90, discount_percent: 18, status: "active", source: "bagy" },
]
console.log(`\n🚀 PÁGINA 15 (351-375) - ${produtos.length} produtos\n`)
const response = await fetch(`${SUPABASE_URL}/rest/v1/products`, { method: 'POST', headers, body: JSON.stringify(produtos) })
console.log("📊 Status HTTP:", response.status)
if (response.ok) console.log(`\n✅ SUCESSO! ${(await response.json()).length} produtos!`)
else console.log("\n❌ ERRO:", await response.text())
