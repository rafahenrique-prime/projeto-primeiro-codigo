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
  const prices = extractPrices(html)
  return {
    nome: extractName(html),
    price_original: prices.original || '',
    price_discount: prices.discount || '',
    preco: prices.discount || prices.original || '',
    allPrices: prices.allPrices || [],  // NOVO: Retorna TODOS os preços para debug
    categoria: '', // Deixar vazio - usuário seleciona depois
    imagem: extractImage(html, url),
    link: url,
  }
}

// Extrair nome do produto
function extractName(html) {
  let nome = ''

  // Procurar em meta tags
  const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)
  if (ogTitle) nome = ogTitle[1]

  // Fallback: twitter:title
  if (!nome) {
    const twitterTitle = html.match(/<meta\s+name="twitter:title"\s+content="([^"]+)"/i)
    if (twitterTitle) nome = twitterTitle[1]
  }

  // Fallback: Procurar em <title>
  if (!nome) {
    const title = html.match(/<title>([^<]+)<\/title>/i)
    if (title) {
      let text = title[1]
      text = text.replace(/[|–-].*$/, '').trim()
      if (text.length > 10) nome = text
    }
  }

  // Fallback: Procurar em <h1>
  if (!nome) {
    const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)
    if (h1) nome = h1[1].trim()
  }

  // LIMPAR LIXO: Remover "| Prime Store | PRIME STORE" e variações
  nome = nome.replace(/\s*\|\s*Prime Store\s*\|\s*PRIME STORE\s*$/i, '')
  nome = nome.replace(/\s*\|\s*Prime Store\s*$/i, '')
  nome = nome.trim()

  return nome
}

// Extrair preços (original e desconto)
function extractPrices(html) {
  const prices = []

  // Padrão: R$ XXX,XX
  const priceMatches = html.matchAll(/R\$\s*([\d.,]+)/gi)
  for (const match of priceMatches) {
    prices.push(`R$ ${match[1]}`)
  }

  // Remover duplicatas mantendo ordem
  const uniquePrices = [...new Set(prices)]

  if (uniquePrices.length === 0) {
    return {
      original: '',
      discount: '',
      allPrices: []
    }
  }

  if (uniquePrices.length === 1) {
    return {
      original: '',
      discount: uniquePrices[0],
      allPrices: uniquePrices
    }
  }

  // NOVO: Procurar por padrões CSS específicos (PrimeStore)
  let original = ''
  let discount = ''

  // 1. Procurar preço RISCADO (<strike>, <s>, <del>) = ORIGINAL
  const strikePrice = html.match(/<(?:strike|s|del)[^>]*>\s*R\$\s*([\d.,]+)/i)
  if (strikePrice) {
    original = `R$ ${strikePrice[1]}`
  }

  // 2. Procurar classes CSS comuns para desconto
  const discountMatch = html.match(/(?:class|data-price)="[^"]*(?:discount|sale|final|current|promo)[^"]*"[^>]*>.*?R\$\s*([\d.,]+)/i)
  if (discountMatch) {
    discount = `R$ ${discountMatch[1]}`
  }

  // 3. Se não achou com padrões CSS, usar ordem padrão:
  // - Se achou original riscado, o primeiro não-riscado é o desconto
  // - Senão, 1º = original, 2º = desconto
  if (!original && !discount) {
    original = uniquePrices[0] || ''
    discount = uniquePrices[1] || ''
  } else if (original && !discount) {
    // Se achou só original, o primeiro preço diferente é o desconto
    discount = uniquePrices.find(p => p !== original) || ''
  } else if (!original && discount) {
    // Se achou só desconto, procura original
    original = uniquePrices.find(p => p !== discount) || ''
  }

  // Garantir que desconto < original (lógica financeira)
  const originalVal = parseFloat(original.replace(/\D/g, '.').replace(/\./g, '').replace(',', '.'))
  const discountVal = parseFloat(discount.replace(/\D/g, '.').replace(/\./g, '').replace(',', '.'))

  if (discountVal > originalVal && original !== '') {
    // Se desconto > original, inverte
    ;[original, discount] = [discount, original]
  }

  return {
    original: original,
    discount: discount,
    allPrices: uniquePrices  // Retorna TODOS os preços para referência
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

// Extrair imagem do produto
function extractImage(html, url) {
  // 1. Procurar og:image (mais confiável)
  const ogImage = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)
  if (ogImage && ogImage[1]) return ogImage[1]

  // 2. Procurar twitter:image
  const twitterImage = html.match(/<meta\s+name="twitter:image"\s+content="([^"]+)"/i)
  if (twitterImage && twitterImage[1]) return twitterImage[1]

  // 3. Procurar primeira img src com tamanho razoável
  const imgMatches = html.match(/<img[^>]+src="([^"]+)"[^>]*>/gi)
  if (imgMatches) {
    for (const img of imgMatches) {
      const src = img.match(/src="([^"]+)"/i)
      if (src && src[1]) {
        const imgUrl = src[1]
        // Ignorar imagens muito pequenas (ícones, logos)
        if (!imgUrl.includes('icon') && !imgUrl.includes('logo') && !imgUrl.includes('placeholder')) {
          return resolveUrl(imgUrl, url)
        }
      }
    }
  }

  return ''
}

// Resolver URL relativa para absoluta
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
