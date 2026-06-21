const SUPABASE_URL = "https://mbbgqasvssueirynnoyk.supabase.co"
const SUPABASE_KEY = "sb_publishable_RliDhy3CwEL-8eOw7EuwEQ_Ekpj9IPV"

console.log("\n🔍 TESTANDO BUSCA E EXTRAÇÃO DE LINKS/IMAGENS\n")

// Buscar produtos Armaf (teste)
const response = await fetch(`${SUPABASE_URL}/rest/v1/products?select=id,nome,link,imagem&nome=like.*Armaf*`, {
  headers: {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`
  }
})

const produtos = await response.json()

console.log(`📦 Encontrados ${produtos.length} produtos Armaf\n`)

if (produtos.length === 0) {
  console.log("❌ Nenhum produto Armaf encontrado")
  process.exit(1)
}

// Testar com o primeiro produto
const produto = produtos[0]
console.log(`🎯 Testando com: "${produto.nome}"`)
console.log(`   Link atual: ${produto.link || "❌ Vazio"}`)
console.log(`   Imagem atual: ${produto.imagem || "❌ Vazio"}\n`)

// Buscar no site Bagy
console.log(`🌐 Buscando no Bagy...`)
const searchUrl = `https://prime-storemen.bagypro.com/?s=${encodeURIComponent(produto.nome)}`
console.log(`   URL: ${searchUrl}\n`)

try {
  const searchResponse = await fetch(searchUrl)
  const html = await searchResponse.text()

  // Procurar por links de produto
  const produtoMatch = html.match(/href="([^"]*\/produto\/[^"]*)"[^>]*>([^<]*)<\/a>/i)

  if (produtoMatch) {
    const novoLink = produtoMatch[1]
    console.log(`✅ LINK ENCONTRADO:`)
    console.log(`   ${novoLink}\n`)

    // Agora fetch a página do produto pra pegar a imagem
    const produtoResponse = await fetch(novoLink)
    const produtoHtml = await produtoResponse.text()

    // Procurar por imagem do produto
    const imagemMatch = produtoHtml.match(/class="produto-imagem[^"]*"[^>]*><img[^>]*src="([^"]*)"/)

    if (imagemMatch) {
      const novaImagem = imagemMatch[1]
      console.log(`✅ IMAGEM ENCONTRADA:`)
      console.log(`   ${novaImagem}\n`)

      // Atualizar no Supabase
      console.log(`📝 Atualizando no Supabase...\n`)
      const updateResponse = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${produto.id}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          link: novoLink,
          imagem: novaImagem
        })
      })

      if (updateResponse.ok) {
        console.log(`✅ SUCESSO! Produto atualizado:\n`)
        console.log(`   Nome: ${produto.nome}`)
        console.log(`   Link: ${novoLink}`)
        console.log(`   Imagem: ${novaImagem}\n`)
      } else {
        console.log(`❌ Erro ao atualizar: ${updateResponse.status}\n`)
      }
    } else {
      console.log(`⚠️  Imagem não encontrada na página\n`)
    }
  } else {
    console.log(`❌ Nenhum produto encontrado na busca\n`)
  }
} catch (error) {
  console.log(`❌ Erro: ${error.message}\n`)
}

console.log(`✨ TESTE FINALIZADO\n`)
