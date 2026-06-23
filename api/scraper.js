// API Serverless para Web Scraping
// Executa no servidor (sem CORS issues)
// Uso: GET /api/scraper?url=https://www.primestoremen.com.br/...

export default async function handler(req, res) {
  // Apenas GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { url } = req.query

  if (!url) {
    return res.status(400).json({ error: 'URL parameter required' })
  }

  try {
    console.log('[Scraper API] Extraindo dados de:', url)

    // Fazer fetch da página (server-side, sem CORS)
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      },
    })

    if (!response.ok) {
      console.error('[Scraper API] Erro ao buscar:', response.status)
      return res.status(400).json({ error: `Failed to fetch URL: ${response.status}` })
    }

    const html = await response.text()

    // Parsear HTML
    // Nota: Node.js não tem DOMParser nativo, vamos usar regex e padrões
    const dados = extractData(html, url)

    console.log('[Scraper API] ✅ Dados extraídos:', dados)
    return res.status(200).json(dados)
  } catch (err) {
    console.error('[Scraper API] Erro:', err.message)
    return res.status(500).json({ error: err.message })
  }
}

// Extrair dados do HTML usando regex e padrões
function extractData(html, url) {
  return {
    nome: extractName(html),
    price_original: extractPrices(html).original || '',
    price_discount: extractPrices(html).discount || '',
    preco: extractPrices(html).discount || extractPrices(html).original || '',
    categoria: extractCategory(html, url),
    link: url,
  }
}

// Extrair nome do produto
function extractName(html) {
  // Procurar em meta tags
  const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)
  if (ogTitle) return ogTitle[1]

  const twitterTitle = html.match(/<meta\s+name="twitter:title"\s+content="([^"]+)"/i)
  if (twitterTitle) return twitterTitle[1]

  // Procurar em <title>
  const title = html.match(/<title>([^<]+)<\/title>/i)
  if (title) {
    // Remove domínio do title
    let text = title[1]
    text = text.replace(/[|–-].*$/, '').trim() // Remove tudo depois de | – ou -
    if (text.length > 10) return text
  }

  // Procurar em <h1>
  const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)
  if (h1) return h1[1].trim()

  return ''
}

// Extrair preços (original e desconto)
function extractPrices(html) {
  const prices = []

  // Padrão: R$ XXX,XX
  const priceMatches = html.matchAll(/R\$\s*([\d.,]+)/gi)
  for (const match of priceMatches) {
    prices.push(`R$ ${match[1]}`)
  }

  // Remover duplicatas
  const uniquePrices = [...new Set(prices)]

  if (uniquePrices.length === 0) {
    return { original: '', discount: '' }
  }

  if (uniquePrices.length === 1) {
    return {
      original: '',
      discount: uniquePrices[0],
    }
  }

  // 1º = original, 2º = desconto
  return {
    original: uniquePrices[0],
    discount: uniquePrices[1],
  }
}

// Extrair categoria
function extractCategory(html, url) {
  // Procurar em breadcrumb
  const breadcrumb = html.match(/breadcrumb[^<]*>([^<]+)<\/[^>]*>/i)
  if (breadcrumb) {
    return breadcrumb[1].trim()
  }

  // Procurar no path da URL
  const urlPath = new URL(url).pathname
  const parts = urlPath.split('/').filter(Boolean)
  if (parts.length > 1) {
    return parts[0].replace(/-/g, ' ').trim()
  }

  // Procurar em meta tags
  const categoryMeta = html.match(/<meta\s+name="product:category"\s+content="([^"]+)"/i)
  if (categoryMeta) return categoryMeta[1]

  return ''
}
