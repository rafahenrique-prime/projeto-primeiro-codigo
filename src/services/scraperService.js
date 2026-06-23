// Scraper de produtos via URL
// Extrai dados usando meta tags e padrões HTML comuns

export async function extractProductData(url) {
  try {
    console.log('[Scraper] Extraindo dados de:', url)

    // Usar CORS proxy se necessário
    const corsUrl = `https://cors-anywhere.herokuapp.com/${url}`

    const response = await fetch(url, {
      mode: 'no-cors',
    }).catch(() =>
      fetch(corsUrl, {
        headers: {
          'Origin': window.location.origin,
        },
      })
    )

    if (!response || !response.ok) {
      console.warn('[Scraper] Erro ao buscar página')
      return null
    }

    const html = await response.text()
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    // Extrair meta tags
    const getMetaContent = (property) => {
      const meta = doc.querySelector(`meta[property="${property}"]`) ||
                   doc.querySelector(`meta[name="${property}"]`)
      return meta?.getAttribute('content') || ''
    }

    // Extrair preços (retorna objeto com preco, price_original, price_discount)
    const precos = extractPrice(html, doc)

    // Extrair dados usando diferentes estratégias
    const dados = {
      nome: getMetaContent('og:title') ||
            getMetaContent('twitter:title') ||
            doc.querySelector('h1')?.textContent?.trim() ||
            '',

      preco: precos.preco || '',

      price_original: precos.price_original || '',

      price_discount: precos.price_discount || '',

      imagem: getMetaContent('og:image') ||
              getMetaContent('twitter:image') ||
              doc.querySelector('img')?.getAttribute('src') ||
              '',

      categoria: extractCategory(html, doc) || '',

      descricao: getMetaContent('og:description') ||
                 getMetaContent('description') ||
                 doc.querySelector('meta[name="description"]')?.getAttribute('content') ||
                 '',

      link: url,
    }

    console.log('[Scraper] Dados extraídos:', dados)
    return dados
  } catch (e) {
    console.error('[Scraper] Erro:', e.message)
    return null
  }
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
