const SUPABASE_URL = "https://mbbgqasvssueirynnoyk.supabase.co"
const SUPABASE_KEY = "sb_publishable_RliDhy3CwEL-8eOw7EuwEQ_Ekpj9IPV"
const headers = {
  'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json',
  'Prefer': 'return=representation,resolution=merge-duplicates',
}
const produtos = [
  { nome: "Tenis New Balance Cinza", preco: "449.00", price_original: 599, price_discount: 449, discount_percent: 25, status: "active", source: "bagy" },
  { nome: "Tenis New Balance 9060 Preto com Branco", preco: "449.00", price_original: 599, price_discount: 449, discount_percent: 25, status: "active", source: "bagy" },
  { nome: "Tenis New Balance Verde", preco: "449.00", price_original: 599, price_discount: 449, discount_percent: 25, status: "active", source: "bagy" },
  { nome: "Tenis New Balance Salmão Laranja", preco: "449.00", price_original: 599, price_discount: 449, discount_percent: 25, status: "active", source: "bagy" },
  { nome: "Tenis New Balance Bege Rose", preco: "449.00", price_original: 599, price_discount: 449, discount_percent: 25, status: "active", source: "bagy" },
  { nome: "Tenis New Balance 9060 Azul", preco: "449.00", price_original: 590, price_discount: 449, discount_percent: 24, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Miu Miu Oval Roxo", preco: "199.00", price_original: 199, price_discount: 199, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Miu Miu Oval Âmbar", preco: "199.00", price_original: 199, price_discount: 199, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Miu Miu Oval Vinho", preco: "199.00", price_original: 199, price_discount: 199, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Lv Millionaire Laranja", preco: "199.00", price_original: 199, price_discount: 199, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Prada Aviador Preto", preco: "199.00", price_original: 199, price_discount: 199, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Prada Aviador Dourado", preco: "199.00", price_original: 199, price_discount: 199, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Lv Quadrado Prata", preco: "199.00", price_original: 199, price_discount: 199, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Prada Retangular Preto", preco: "199.00", price_original: 199, price_discount: 199, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Off White Preto", preco: "199.00", price_original: 199, price_discount: 199, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Fendi Oval Cinza", preco: "199.00", price_original: 199, price_discount: 199, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Prada Chunky Preto", preco: "199.00", price_original: 199, price_discount: 199, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Versace Medusa Preto", preco: "199.00", price_original: 199, price_discount: 199, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Miu Miu Shield Marrom", preco: "199.00", price_original: 199, price_discount: 199, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Miu Miu Cat Eye Preto", preco: "199.00", price_original: 199, price_discount: 199, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Miu Miu Cat Eye Tartaruga", preco: "199.00", price_original: 199, price_discount: 199, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Miu Miu Cat Eye Dourado", preco: "199.00", price_original: 199, price_discount: 199, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Palm Angels Preto Âmbar", preco: "199.00", price_original: 199, price_discount: 199, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Palm Angels Preto Cinza", preco: "199.00", price_original: 199, price_discount: 199, discount_percent: 0, status: "active", source: "bagy" },
  { nome: "Óculos de Sol Palm Angels Branco", preco: "199.00", price_original: 199, price_discount: 199, discount_percent: 0, status: "active", source: "bagy" },
]
console.log(`\n🚀 PÁGINA 14 (326-350) - ${produtos.length} produtos\n`)
const response = await fetch(`${SUPABASE_URL}/rest/v1/products`, { method: 'POST', headers, body: JSON.stringify(produtos) })
console.log("📊 Status HTTP:", response.status)
if (response.ok) console.log(`\n✅ SUCESSO! ${(await response.json()).length} produtos!`)
else console.log("\n❌ ERRO:", await response.text())
