const SUPABASE_URL = "https://mbbgqasvssueirynnoyk.supabase.co"
const SUPABASE_KEY = "sb_publishable_RliDhy3CwEL-8eOw7EuwEQ_Ekpj9IPV"
const BAGY_URL = "https://prime-storemen.bagypro.com"

console.log("\n🔍 TESTANDO EXTRAÇÃO DE LINKS DO ADMIN BAGY\n")

// Buscar produtos sem link
const response = await fetch(`${SUPABASE_URL}/rest/v1/products?select=id,nome,link,imagem&link=is.null&limit=5`, {
  headers: {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`
  }
})

const produtos = await response.json()

console.log(`📦 Encontrados ${produtos.length} produtos SEM LINK\n`)

if (produtos.length === 0) {
  console.log("✅ Todos os produtos já têm link!")
  process.exit(0)
}

// Testar com primeiro produto
const produto = produtos[0]
console.log(`🎯 Testando: "${produto.nome}"`)
console.log(`   Status: Link ${produto.link ? '✅' : '❌'} | Imagem ${produto.imagem ? '✅' : '❌'}\n`)

// Estratégia 1: Procurar no admin usando busca
const searchTerm = encodeURIComponent(produto.nome.split(' ').slice(0, 3).join(' '))
const adminSearchUrl = `${BAGY_URL}/admin/produtos?search=${searchTerm}`

console.log(`🌐 Procurando no Admin Bagy...`)
console.log(`   URL: ${adminSearchUrl}\n`)

try {
  const adminResponse = await fetch(adminSearchUrl)
  const adminHtml = await adminResponse.text()

  // Procurar por dados JSON no HTML (o Bagy pode ter dados estruturados)
  const produtoPattern = new RegExp(`"nome":"[^"]*${produto.nome.split(' ')[0]}[^"]*"`, 'i')

  if (produtoPattern.test(adminHtml)) {
    console.log(`✅ Produto encontrado no admin!\n`)

    // Extrair link possível
    const linkPattern = new RegExp(`href="([^"]*produto[^"]*)"`,'i')
    const linkMatch = adminHtml.match(linkPattern)

    if (linkMatch) {
      const link = linkMatch[1]
      console.log(`📝 Link extraído: ${link}\n`)
    }
  } else {
    console.log(`⚠️  Produto não encontrado no admin\n`)
  }
} catch (error) {
  console.log(`❌ Erro ao acessar admin: ${error.message}\n`)
}

console.log(`💡 PRÓXIMOS PASSOS:`)
console.log(`   1. Se encontrou links: implementar scraping completo`)
console.log(`   2. Se não encontrou: usar IDs do Bagy (9681393, etc)`)
console.log(`   3. Ou fazer upload manual via form no admin\n`)
