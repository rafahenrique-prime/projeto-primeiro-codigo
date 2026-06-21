import { chromium } from 'playwright'

const SUPABASE_URL = "https://mbbgqasvssueirynnoyk.supabase.co"
const SUPABASE_KEY = "sb_publishable_RliDhy3CwEL-8eOw7EuwEQ_Ekpj9IPV"
const BAGY_URL = "https://prime-storemen.bagypro.com"

console.log("\n🚀 TESTANDO EXTRAÇÃO COM PLAYWRIGHT - 10 PRODUTOS\n")

// Buscar 10 produtos sem link
const response = await fetch(`${SUPABASE_URL}/rest/v1/products?select=id,nome,link&link=is.null&limit=10`, {
  headers: {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`
  }
})

const produtos = await response.json()

console.log(`📦 Encontrados ${produtos.length} produtos para testar\n`)

if (produtos.length === 0) {
  console.log("✅ Nenhum produto sem link")
  process.exit(0)
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()

let sucesso = 0
let erro = 0

for (let i = 0; i < produtos.length; i++) {
  const produto = produtos[i]
  console.log(`\n[${i + 1}/${produtos.length}] 🎯 ${produto.nome}`)

  try {
    // Navegar pra página de busca no admin
    const searchTerm = encodeURIComponent(produto.nome.split(' ').slice(0, 3).join(' '))
    await page.goto(`${BAGY_URL}/admin/produtos?search=${searchTerm}`, { waitUntil: 'networkidle' })

    // Procurar pelo link do produto na lista
    const produtoLink = await page.locator(`a:has-text("${produto.nome.substring(0, 20)}")`).first().getAttribute('href').catch(() => null)

    if (produtoLink) {
      console.log(`   ✅ Link encontrado: ${produtoLink}`)

      // Acessar a página do produto
      await page.goto(`${BAGY_URL}${produtoLink}`, { waitUntil: 'networkidle' })

      // Extrair a imagem
      const imagemUrl = await page.locator('img.product-image, img[alt*="produto"], img[class*="foto"]').first().getAttribute('src').catch(() => null)

      if (imagemUrl) {
        console.log(`   ✅ Imagem encontrada: ${imagemUrl}`)

        // Montar URL completa se for relativa
        const imagemCompleta = imagemUrl.startsWith('http') ? imagemUrl : `${BAGY_URL}${imagemUrl}`
        const linkCompleto = `${BAGY_URL}${produtoLink}`

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
          console.log(`   ✅ ATUALIZADO no Supabase!`)
          sucesso++
        } else {
          console.log(`   ❌ Erro ao atualizar Supabase: ${updateResponse.status}`)
          erro++
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
console.log(`📊 RESULTADO DO TESTE:`)
console.log(`   ✅ Sucesso: ${sucesso}/${produtos.length}`)
console.log(`   ❌ Erro: ${erro}/${produtos.length}`)
console.log(`${'='.repeat(50)}\n`)

if (sucesso > 0) {
  console.log(`✨ TESTE BEM-SUCEDIDO! Pronto pra rodar em todos os ${519} produtos?`)
}
