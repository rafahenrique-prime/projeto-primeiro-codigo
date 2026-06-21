import { chromium } from 'playwright'

const SUPABASE_URL = "https://mbbgqasvssueirynnoyk.supabase.co"
const SUPABASE_KEY = "sb_publishable_RliDhy3CwEL-8eOw7EuwEQ_Ekpj9IPV"
const BAGY_LOJA = "https://prime-storemen.bagypro.com"

console.log("\n🚀 TESTANDO EXTRAÇÃO COM IDs DO BAGY - 3 PRODUTOS\n")

// Buscar 3 produtos sem link
const response = await fetch(`${SUPABASE_URL}/rest/v1/products?select=id,nome,link&link=is.null&limit=3`, {
  headers: {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`
  }
})

const produtos = await response.json()

console.log(`📦 Testando com ${produtos.length} produtos\n`)

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()

let sucesso = 0
let erro = 0

for (let i = 0; i < produtos.length; i++) {
  const produto = produtos[i]
  console.log(`\n[${i + 1}/3] 🎯 ${produto.nome}`)

  try {
    // Estratégia: Buscar na loja pública (não admin)
    const searchUrl = `${BAGY_LOJA}/?s=${encodeURIComponent(produto.nome.substring(0, 30))}`
    console.log(`   🌐 Buscando em: ${searchUrl}`)

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })

    // Aguardar um segundo pra JS carregar
    await page.waitForTimeout(2000)

    // Procurar por links de produtos
    const produtoLinks = await page.locator('a[href*="/produto/"]').all()

    if (produtoLinks.length > 0) {
      // Pegar o primeiro link
      const primeiroLink = await produtoLinks[0].getAttribute('href')
      console.log(`   ✅ Link encontrado: ${primeiroLink}`)

      // Montar URL completa
      const linkCompleto = primeiroLink.startsWith('http') ? primeiroLink : `${BAGY_LOJA}${primeiroLink}`

      // Navegar para a página do produto
      await page.goto(linkCompleto, { waitUntil: 'domcontentloaded', timeout: 15000 })
      await page.waitForTimeout(1000)

      // Tentar diferentes seletores de imagem
      let imagemUrl = null

      // Tentar 1: img com classe produto
      imagemUrl = await page.locator('img[class*="produto"], img[class*="product"]').first().getAttribute('src').catch(() => null)

      // Tentar 2: img dentro de picture
      if (!imagemUrl) {
        imagemUrl = await page.locator('picture img').first().getAttribute('src').catch(() => null)
      }

      // Tentar 3: primeira imagem grande
      if (!imagemUrl) {
        imagemUrl = await page.locator('img[style*="width"][style*="height"]').first().getAttribute('src').catch(() => null)
      }

      if (imagemUrl) {
        // Garantir URL absoluta
        const imagemCompleta = imagemUrl.startsWith('http') ? imagemUrl : `${BAGY_LOJA}${imagemUrl}`

        console.log(`   ✅ Imagem: ${imagemCompleta.substring(0, 80)}...`)

        // Extrair ID do link
        const idMatch = primeiroLink.match(/\/(\d+)(?:\/|$|-)/) || primeiroLink.match(/id[=_](\d+)/)
        const produtoId = idMatch ? idMatch[1] : 'desconhecido'
        console.log(`   🔑 ID extraído: ${produtoId}`)

        // Atualizar no Supabase
        const updateResponse = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${produto.id}`, {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            link: linkCompleto,
            imagem: imagemCompleta
          })
        })

        if (updateResponse.ok) {
          console.log(`   ✅ ATUALIZADO!`)
          sucesso++
        }
      } else {
        console.log(`   ⚠️  Imagem não encontrada`)
        erro++
      }
    } else {
      console.log(`   ❌ Produto não encontrado na busca`)
      erro++
    }
  } catch (error) {
    console.log(`   ❌ Erro: ${error.message}`)
    erro++
  }
}

await browser.close()

console.log(`\n${'='.repeat(50)}`)
console.log(`📊 RESULTADO:`)
console.log(`   ✅ Sucesso: ${sucesso}/3`)
console.log(`   ❌ Erro: ${erro}/3`)
console.log(`${'='.repeat(50)}\n`)

if (sucesso > 0) {
  console.log(`✨ TESTE FUNCIONOU! Pronto pra escalar pra todos os 519?`)
}
