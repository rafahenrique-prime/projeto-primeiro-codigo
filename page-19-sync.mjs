const SUPABASE_URL = "https://mbbgqasvssueirynnoyk.supabase.co"
const SUPABASE_KEY = "sb_publishable_RliDhy3CwEL-8eOw7EuwEQ_Ekpj9IPV"
const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation,resolution=merge-duplicates' }
const produtos = [
  { nome: "Ferrari Scuderia Black Edt 125ml", preco: "299.00", price_original: 349, price_discount: 299, discount_percent: 14, status: "active", source: "bagy" },
  { nome: "Ch Men Carolina Herrera 100ml", preco: "649.00", price_original: 799, price_discount: 649, discount_percent: 19, status: "active", source: "bagy" },
  { nome: "Loção Corporal Mugler Angel 200ml", preco: "599.00", price_original: 699, price_discount: 599, discount_percent: 14, status: "active", source: "bagy" },
  { nome: "212 Vip Black 100ml", preco: "699.00", price_original: 799.99, price_discount: 699, discount_percent: 13, status: "active", source: "bagy" },
  { nome: "Jean Paul G. Le Male 125ml", preco: "688.00", price_original: 799, price_discount: 688, discount_percent: 14, status: "active", source: "bagy" },
  { nome: "Armani Stronger With You 100ml", preco: "699.00", price_original: 799, price_discount: 699, discount_percent: 13, status: "active", source: "bagy" },
  { nome: "Invictus Edt Masc 100ml", preco: "600.00", price_original: 799.99, price_discount: 600, discount_percent: 25, status: "active", source: "bagy" },
  { nome: "Sauvage Eau de Parfum Dior 100ml", preco: "900.00", price_original: 900, price_discount: 900, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Bleu de Chanel Eau de Parfum 100ml", preco: "1199.00", price_original: 1199, price_discount: 1199, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "212 Vip Men 100ml", preco: "699.00", price_original: 799, price_discount: 699, discount_percent: 13, status: "active", source: "bagy" },
  { nome: "Givenchy L'interdit Eau de Toilette 80ml", preco: "900.00", price_original: 900, price_discount: 900, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Scandal Gauliter 80ml", preco: "900.00", price_original: 900, price_discount: 900, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Pure Xs Feminino 80ml", preco: "900.00", price_original: 900, price_discount: 900, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Libre Ysl 90ml", preco: "999.99", price_original: 999.99, price_discount: 999.99, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Dolce & Gabbana Light Blue 100ml", preco: "700.00", price_original: 700, price_discount: 700, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Coco Mademoiselle Leau Privée Eau Pour Lá Nuit 100ml", preco: "1100.00", price_original: 1100, price_discount: 1100, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Angel Standing Star Edp 100ml", preco: "1100.00", price_original: 1100, price_discount: 1100, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Lady Milion Paco Rabanne Eau de Parfum 80ml", preco: "900.00", price_original: 900, price_discount: 900, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Good Girl Carolina Herrera 100ml", preco: "900.00", price_original: 900, price_discount: 900, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Euphoria Calvin Klein 100ml", preco: "600.00", price_original: 699.99, price_discount: 600, discount_percent: 14, status: "active", source: "bagy" },
  { nome: "You Because It's 100ml", preco: "900.00", price_original: 900, price_discount: 900, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Carolina Herrera Ch 100ml", preco: "999.99", price_original: 999.99, price_discount: 999.99, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Perfume Bad Boy", preco: "999.99", price_original: 999.99, price_discount: 999.99, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Fantasy Eau de Parfum 100ml", preco: "500.00", price_original: 500, price_discount: 500, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "212 Vip Rose", preco: "799.00", price_original: 890, price_discount: 799, discount_percent: 10, status: "active", source: "bagy" },
]
console.log(`\n🚀 PÁGINA 19 (451-475)\n`)
const response = await fetch(`${SUPABASE_URL}/rest/v1/products`, { method: 'POST', headers, body: JSON.stringify(produtos) })
console.log("📊 Status:", response.status); if (response.ok) console.log(`✅ OK!`)
