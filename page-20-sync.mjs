const SUPABASE_URL = "https://mbbgqasvssueirynnoyk.supabase.co"
const SUPABASE_KEY = "sb_publishable_RliDhy3CwEL-8eOw7EuwEQ_Ekpj9IPV"
const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation,resolution=merge-duplicates' }
const produtos = [
  { nome: "Fame Paco Rabanne 80ml", preco: "999.99", price_original: 999.99, price_discount: 999.99, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Idôle Lancôme Eau de Parfum 100ml", preco: "999.99", price_original: 999.99, price_discount: 999.99, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Olympéa Rabanne Eau de Parfum 80ml", preco: "899.99", price_original: 899.99, price_discount: 899.99, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Lá Vie Est Belle 100ml", preco: "999.99", price_original: 1080, price_discount: 999.99, discount_percent: 7, status: "active", source: "bagy" },
  { nome: "Carteira Mini Couro Sintético Montblanc", preco: "129.00", price_original: 199, price_discount: 129, discount_percent: 35, status: "active", source: "bagy" },
  { nome: "Allure Homme Sport Edt 100ml", preco: "990.00", price_original: 1080, price_discount: 990, discount_percent: 8, status: "active", source: "bagy" },
  { nome: "Calca Jeans Preta Diesel", preco: "249.90", price_original: 319, price_discount: 249.90, discount_percent: 22, status: "active", source: "bagy" },
  { nome: "Tenis Armani E7", preco: "449.00", price_original: 599, price_discount: 449, discount_percent: 25, status: "active", source: "bagy" },
  { nome: "Calça Ellus", preco: "249.99", price_original: 349, price_discount: 249.99, discount_percent: 28, status: "active", source: "bagy" },
  { nome: "Calça Jeans Diesel", preco: "249.00", price_original: 299, price_discount: 249, discount_percent: 17, status: "active", source: "bagy" },
  { nome: "Kit Cueca Diesel", preco: "149.00", price_original: 249, price_discount: 149, discount_percent: 40, status: "active", source: "bagy" },
  { nome: "Cueca Diesel", preco: "30.00", price_original: 39, price_discount: 30, discount_percent: 23, status: "active", source: "bagy" },
  { nome: "Paco Rabanne 1 Million Edt 100ml para Masculino", preco: "549.00", price_original: 699, price_discount: 549, discount_percent: 21, status: "active", source: "bagy" },
  { nome: "One Million 1 Million Parfum Edp 200ml para Masculino", preco: "749.00", price_original: 849, price_discount: 749, discount_percent: 12, status: "active", source: "bagy" },
  { nome: "Glacier Pour Homme", preco: "499.00", price_original: 520, price_discount: 499, discount_percent: 4, status: "active", source: "bagy" },
  { nome: "Glacier Le Noir 100ml Kit", preco: "499.00", price_original: 529, price_discount: 499, discount_percent: 6, status: "active", source: "bagy" },
  { nome: "Lattafa Asad Eau de Parfum 100ml", preco: "339.00", price_original: 519, price_discount: 339, discount_percent: 35, status: "active", source: "bagy" },
  { nome: "Armaf Club de Nuit Intense 100ml", preco: "499.00", price_original: 599, price_discount: 499, discount_percent: 17, status: "active", source: "bagy" },
  { nome: "Your Touch For Men Maison Alhambra 100ml", preco: "389.00", price_original: 519, price_discount: 389, discount_percent: 25, status: "active", source: "bagy" },
  { nome: "Club de Nuit Ico Nic", preco: "499.00", price_original: 599.99, price_discount: 499, discount_percent: 17, status: "active", source: "bagy" },
  { nome: "Club de Nuit Milestone 105ml", preco: "499.00", price_original: 599, price_discount: 499, discount_percent: 17, status: "active", source: "bagy" },
  { nome: "Maître de Blue Maison Alhambra 100ml", preco: "449.00", price_original: 499, price_discount: 449, discount_percent: 10, status: "active", source: "bagy" },
  { nome: "Lattafa Fakhar Black 100ml", preco: "499.00", price_original: 580, price_discount: 499, discount_percent: 14, status: "active", source: "bagy" },
  { nome: "Lattafa Fakhar Rose 100ml", preco: "499.00", price_original: 499, price_discount: 499, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Fakhar Gold Lattafa 100ml", preco: "499.00", price_original: 599.99, price_discount: 499, discount_percent: 17, status: "active", source: "bagy" },
]
console.log(`\n🚀 PÁGINA 20 (476-500)\n`)
const response = await fetch(`${SUPABASE_URL}/rest/v1/products`, { method: 'POST', headers, body: JSON.stringify(produtos) })
console.log("📊 Status:", response.status); if (response.ok) console.log(`✅ OK!`)
