const SUPABASE_URL = "https://mbbgqasvssueirynnoyk.supabase.co"
const SUPABASE_KEY = "sb_publishable_RliDhy3CwEL-8eOw7EuwEQ_Ekpj9IPV"

console.log("\n🔍 Analisando duplicatas...\n")

const response = await fetch(`${SUPABASE_URL}/rest/v1/products?select=id,nome`, {
  headers: {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`
  }
})

const data = await response.json()

// Agrupar por nome e contar
const grupos = {}
data.forEach(p => {
  if (!grupos[p.nome]) grupos[p.nome] = []
  grupos[p.nome].push(p.id)
})

// Encontrar duplicatas
const duplicatas = Object.entries(grupos)
  .filter(([nome, ids]) => ids.length > 1)
  .sort((a, b) => b[1].length - a[1].length)

if (duplicatas.length === 0) {
  console.log("✅ Nenhuma duplicata encontrada!\n")
  process.exit(0)
}

console.log(`⚠️  ENCONTRADAS ${duplicatas.length} LINHAS COM DUPLICATAS:\n`)

duplicatas.forEach(([nome, ids], idx) => {
  console.log(`${idx + 1}. "${nome}"`)
  console.log(`   ❌ ${ids.length} registros encontrados`)
  ids.forEach((id, i) => {
    console.log(`      ${i + 1}. ID: ${id}`)
  })
  console.log()
})

console.log(`📊 RESUMO: ${duplicatas.length} produtos com duplicatas\n`)
