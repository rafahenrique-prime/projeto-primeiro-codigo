// API Serverless para Teste de Web Scraping
// Retorna informações detalhadas de cada etapa
// Uso: GET /api/scraper-debug?url=https://www.primestoremen.com.br/...

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { url } = req.query

  if (!url) {
    return res.status(400).json({ error: 'URL parameter required' })
  }

  try {
    console.log('[Scraper DEBUG] Testando:', url)

    // Fazer fetch da página
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      },
    })

    if (!response.ok) {
      return res.status(400).json({
        error: `Failed to fetch URL: ${response.status}`,
        url
      })
    }

    const html = await response.text()
    const htmlSize = html.length

    // Testar cada função individualmente
    const nome = extractName(html)
    const prices = extractPrices(html)
    const imagem = extractImage(html, url)

    console.log('[Scraper DEBUG] Resultados:')
    console.log('  Nome:', nome)
    console.log('  Preços:', prices)
    console.log('  Imagem:', imagem)

    return res.status(200).json({
      url,
      success: true,
      htmlSize,
      extractions: {
        nome: {
          value: nome,
          found: !!nome,
        },
        preco: {
          value: prices.discount || prices.original || '',
          found: !!(prices.discount || prices.original),
          original: prices.original,
          discount: prices.discount,
        },
        imagem: {
          value: imagem,
          found: !!imagem,
        },
      },
      debug: {
        htmlLength: html.length,
        ogImageMatch: html.match(/<meta\s+property="og:image"/i) ? 'FOUND' : 'NOT FOUND',
        priceMatches: html.match(/R\$\s*([\d.,]+)/gi) || [],
        imgTags: (html.match(/<img[^>]+src/gi) || []).length,
      },
    })
  } catch (err) {
    console.error('[Scraper DEBUG] Erro:', err.message)
    return res.status(500).json({ error: err.message, url })
  }
}

// Extrair nome do produto
function extractName(html) {
  const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)
  if (ogTitle) return ogTitle[1]

  const twitterTitle = html.match(/<meta\s+name="twitter:title"\s+content="([^"]+)"/i)
  if (twitterTitle) return twitterTitle[1]

  const title = html.match(/<title>([^<]+)<\/title>/i)
  if (title) {
    let text = title[1]
    text = text.replace(/[|–-].*$/, '').trim()
    if (text.length > 10) return text
  }

  const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)
  if (h1) return h1[1].trim()

  return ''
}

// Extrair preços
function extractPrices(html) {
  const prices = []
  const priceMatches = html.matchAll(/R\$\s*([\d.,]+)/gi)
  for (const match of priceMatches) {
    prices.push(`R$ ${match[1]}`)
  }

  const uniquePrices = [...new Set(prices)]

  if (uniquePrices.length === 0) {
    return { original: '', discount: '' }
  }

  if (uniquePrices.length === 1) {
    return { original: '', discount: uniquePrices[0] }
  }

  return {
    original: uniquePrices[0],
    discount: uniquePrices[1],
  }
}

// Extrair imagem
function extractImage(html, url) {
  const ogImage = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)
  if (ogImage && ogImage[1]) return ogImage[1]

  const twitterImage = html.match(/<meta\s+name="twitter:image"\s+content="([^"]+)"/i)
  if (twitterImage && twitterImage[1]) return twitterImage[1]

  const imgMatches = html.match(/<img[^>]+src="([^"]+)"[^>]*>/gi)
  if (imgMatches) {
    for (const img of imgMatches) {
      const src = img.match(/src="([^"]+)"/i)
      if (src && src[1]) {
        const imgUrl = src[1]
        if (!imgUrl.includes('icon') && !imgUrl.includes('logo') && !imgUrl.includes('placeholder')) {
          return resolveUrl(imgUrl, url)
        }
      }
    }
  }

  return ''
}

// Resolver URL relativa
function resolveUrl(relativeUrl, baseUrl) {
  if (!relativeUrl) return ''
  if (relativeUrl.startsWith('http')) return relativeUrl
  if (relativeUrl.startsWith('//')) return 'https:' + relativeUrl

  try {
    return new URL(relativeUrl, baseUrl).toString()
  } catch {
    return relativeUrl
  }
}
