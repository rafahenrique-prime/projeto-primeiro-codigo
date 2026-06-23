// Scraper de produtos via URL
// Chama API serverless no Vercel que faz o scraping server-side (sem CORS)

export async function extractProductData(url) {
  try {
    console.log('[Scraper] Chamando API serverless para:', url)

    // Chamar API serverless
    const apiUrl = `/api/scraper?url=${encodeURIComponent(url)}`

    const response = await fetch(apiUrl)

    if (!response.ok) {
      const error = await response.json()
      console.error('[Scraper] Erro da API:', error.error)
      return null
    }

    const dados = await response.json()
    console.log('[Scraper] ✅ Dados extraídos:', dados)
    return dados
  } catch (e) {
    console.error('[Scraper] Erro:', e.message)
    return null
  }
}

// Extrair nome do produto
function extractName(html, doc) {
  // Tentar meta tags
  const metaTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
                    doc.querySelector('meta[name="og:title"]')?.getAttribute('content') ||
                    ''
  if (metaTitle) return metaTitle

  // Tentar h1
  const h1 = doc.querySelector('h1')?.textContent?.trim()
  if (h1) return h1

  // Tentar title tag
  const title = doc.querySelector('title')?.textContent?.trim()
  if (title) return title

  return ''
}

// Extrair preços usando padrões comuns
// Retorna: { preco, price_original, price_discount }
function extractPrice(html, doc) {
  const precos = []

  // Padrão principal: R$ XXX,XX
  const pricePattern = /R\$\s*([\d.,]+)/gi
  let match
  while ((match = pricePattern.exec(html)) !== null) {
    precos.push(`R$ ${match[1]}`)
  }

  // Se não achou via regex, procurar em atributos de data
  if (precos.length === 0) {
    const priceElements = doc.querySelectorAll('[data-price], [data-valor], .price, .preco, .valor')
    priceElements.forEach(el => {
      const text = el.textContent.trim()
      if (text.includes('R$') || /[\d.,]+/.test(text)) {
        precos.push(text)
      }
    })
  }

  // Remover duplicatas
  const uniquePrecos = [...new Set(precos)]

  if (uniquePrecos.length === 0) {
    return { preco: '', price_original: '', price_discount: '' }
  }

  if (uniquePrecos.length === 1) {
    // Apenas 1 preço encontrado
    return {
      preco: uniquePrecos[0],
      price_original: '',
      price_discount: uniquePrecos[0],
    }
  }

  // Múltiplos preços: 1º = original, 2º = desconto
  return {
    preco: uniquePrecos[1], // Usar o 2º como preço principal (com desconto)
    price_original: uniquePrecos[0], // 1º = preço original
    price_discount: uniquePrecos[1], // 2º = preço com desconto
  }
}

// Extrair categoria usando breadcrumb ou padrões
function extractCategory(html, doc) {
  // Procurar em breadcrumb
  const breadcrumb = doc.querySelector('[class*="breadcrumb"]')
  if (breadcrumb) {
    const items = breadcrumb.querySelectorAll('a, span')
    if (items.length > 1) {
      return items[items.length - 2]?.textContent?.trim() || ''
    }
  }

  // Procurar em URL path
  const urlParts = new URL(html).pathname.split('/')
  if (urlParts.length > 1) {
    return urlParts[1].replace(/-/g, ' ').trim()
  }

  // Procurar em texto de categoria
  const categoryPattern = /categoria[:\s]*([a-z\s]+)/gi
  const match = html.match(categoryPattern)
  if (match) {
    return match[0].replace(/categoria[:\s]*/i, '').trim()
  }

  return ''
}

// Normalizar dados extraídos
export function normalizeExtractedData(dados) {
  return {
    nome: dados.nome || '',
    preco: normalizarPreco(dados.preco) || '',
    imagem: dados.imagem || '',
    categoria: dados.categoria || 'Sem categoria',
    link: dados.link || '',
    price_original: '',
    price_discount: '',
    codigo: '',
    status: 'active',
  }
}

function normalizarPreco(preco) {
  if (!preco) return ''

  // Remove R$ e espaços, converte para formato padrão
  const clean = preco.replace(/R\$\s*/gi, '').trim()

  // Se já tem formato brasileiro (1.234,56), retorna como está
  if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(clean)) {
    return `R$ ${clean}`
  }

  // Se tem separador de decimal em ponto (1234.56), converte
  const num = parseFloat(clean.replace(/\./g, '').replace(',', '.'))
  if (!isNaN(num)) {
    return `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return preco
}
