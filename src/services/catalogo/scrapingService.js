// Serviço de Web Scraping para importar produtos do site

export async function scrapeProductsFromURL(url) {
  try {
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`Erro ao acessar site: ${response.status}`)
    }

    const html = await response.text()
    const products = extractProductsFromHTML(html, url)

    if (products.length === 0) {
      throw new Error('Nenhum produto encontrado na página. Verifique a URL ou structure HTML do site.')
    }

    return products
  } catch (error) {
    console.error('Erro no scraping:', error)
    if (error.message.includes('Failed to fetch') || error.message.includes('CORS')) {
      throw new Error('Erro CORS: O site pode estar bloqueando requisições. Tente usar um proxy ou configure CORS no servidor.')
    }
    throw error
  }
}

function extractProductsFromHTML(html, baseUrl = '') {
  const products = []

  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    // Tenta encontrar produtos por classes comuns
    let productElements = doc.querySelectorAll('[data-product], .product, .item, .produto')

    if (productElements.length === 0) {
      productElements = doc.querySelectorAll('div[class*="product"], div[class*="item"]')
    }

    // Se ainda não encontrou, tenta encontrar links com imagens (padrão comum)
    if (productElements.length === 0) {
      productElements = doc.querySelectorAll('a img').map(img => img.closest('[class*="product"], [class*="item"], [data-product], a'))
    }

    productElements.forEach((element, index) => {
      try {
        // Extrai nome
        const nameEl = element.querySelector('[data-name], .name, .title, h2, h3, .produto-nome')
        const name = nameEl?.textContent?.trim() || `Produto ${index + 1}`

        // Extrai preço
        const priceEl = element.querySelector('[data-price], .price, .preco, [class*="price"]')
        let price = priceEl?.textContent?.trim() || ''

        // Formata preço se necessário
        if (price && !price.includes('R$')) {
          price = `R$ ${price}`
        }

        // Extrai imagem
        let imageUrl = ''
        const imgEl = element.querySelector('img')
        if (imgEl) {
          imageUrl = imgEl.src || imgEl.getAttribute('data-src') || ''
        }

        // Converte URL relativa para absoluta
        if (imageUrl && !imageUrl.startsWith('http') && baseUrl) {
          try {
            imageUrl = new URL(imageUrl, baseUrl).href
          } catch {
            imageUrl = ''
          }
        }

        // Extrai link do produto
        let productLink = ''
        const linkEl = element.querySelector('a[href]') || (element.tagName === 'A' ? element : null)
        if (linkEl) {
          productLink = linkEl.href
        }

        // Converte URL relativa para absoluta
        if (productLink && !productLink.startsWith('http') && baseUrl) {
          try {
            productLink = new URL(productLink, baseUrl).href
          } catch {
            productLink = ''
          }
        }

        // Só adiciona se tiver pelo menos nome e um identificador
        if (name && (imageUrl || productLink || price)) {
          products.push({
            id: Date.now() + index,
            nome: name,
            preco: price || 'Consultar',
            imagem: imageUrl || 'https://via.placeholder.com/300x300?text=Sem+Imagem',
            link: productLink || ''
          })
        }
      } catch (e) {
        console.warn(`Erro ao processar elemento ${index}:`, e)
      }
    })
  } catch (error) {
    console.error('Erro ao fazer parse do HTML:', error)
  }

  return products
}

// Função alternativa: scraping via API (se o site oferecer)
export async function scrapeProductsViaAPI(baseURL) {
  try {
    // Tenta acessar um possível endpoint de API
    const apiUrl = `${baseURL}/api/products` // Ajuste conforme necessário
    const response = await fetch(apiUrl)
    const data = await response.json()

    return data.map((product, index) => ({
      id: product.id || Date.now() + index,
      nome: product.name || product.nome || 'Produto',
      preco: product.price || product.preco || 'Consultar',
      imagem: product.image || product.imagem || '',
      link: product.url || product.link || ''
    }))
  } catch (error) {
    throw new Error('API não disponível ou inválida')
  }
}
