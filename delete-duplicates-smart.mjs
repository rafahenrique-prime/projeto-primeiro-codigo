const SUPABASE_URL = "https://mbbgqasvssueirynnoyk.supabase.co"
const SUPABASE_KEY = "sb_publishable_RliDhy3CwEL-8eOw7EuwEQ_Ekpj9IPV"

console.log("\n🧹 Analisando duplicatas com dados (link/imagem)...\n")

// Buscar todos os produtos com nome e link
const response = await fetch(`${SUPABASE_URL}/rest/v1/products?select=id,nome,link,imagem`, {
  headers: {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`
  }
})

const data = await response.json()

// Agrupar por nome
const grupos = {}
data.forEach(p => {
  if (!grupos[p.nome]) grupos[p.nome] = []
  grupos[p.nome].push(p)
})

// Encontrar duplicatas e definir qual deletar
const paraDelete = []
Object.entries(grupos).forEach(([nome, produtos]) => {
  if (produtos.length > 1) {
    // Ordenar: com link/imagem primeiro, depois por ID
    const comDados = produtos.filter(p => p.link || p.imagem)
    const semDados = produtos.filter(p => !p.link && !p.imagem)

    if (comDados.length > 0) {
      // Manter o primeiro com dados, deletar o resto
      semDados.forEach(p => paraDelete.push(p.id))
      if (comDados.length > 1) {
        // Se tem mais de 1 com dados, deletar os extras
        comDados.slice(1).forEach(p => paraDelete.push(p.id))
      }
    } else {
      // Se nenhum tem dados, manter o primeiro, deletar os outros
      produtos.slice(1).forEach(p => paraDelete.push(p.id))
    }
  }
})

console.log(`📊 IDs a deletar: ${paraDelete.length}`)
console.log(`✅ Mantém: ${data.length - paraDelete.length} produtos únicos com dados\n`)

if (paraDelete.length === 0) {
  console.log("✅ Nenhum registro para deletar!\n")
  process.exit(0)
}

// Deletar em batch
console.log("🗑️  Deletando registros sem link/imagem...\n")

for (const id of paraDelete) {
  await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${id}`, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  })
}

console.log(`✅ FINALIZADO! Deletados ${paraDelete.length} registros duplicados\n`)
console.log(`📊 Total final: ${data.length - paraDelete.length} produtos únicos\n`)
