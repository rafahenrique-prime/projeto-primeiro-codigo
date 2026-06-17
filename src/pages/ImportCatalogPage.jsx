import { useState } from 'react'
import { useTheme } from '../theme.jsx'
import { scrapeProductsFromURL } from '../services/scrapingService'

export default function ImportCatalogPage() {
  const { theme: t } = useTheme()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [products, setProducts] = useState([])
  const [error, setError] = useState('')
  const [selectedProducts, setSelectedProducts] = useState(new Set())
  const [importing, setImporting] = useState(false)

  const handleScrape = async () => {
    if (!url.trim()) {
      setError('Digite uma URL válida')
      return
    }

    setLoading(true)
    setError('')
    setProducts([])
    setSelectedProducts(new Set())

    try {
      const scraped = await scrapeProductsFromURL(url)
      setProducts(scraped)

      if (scraped.length === 0) {
        setError('Nenhum produto encontrado nesta URL')
      }
    } catch (err) {
      setError(`Erro ao raspar: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const toggleProductSelection = (index) => {
    const newSelected = new Set(selectedProducts)
    if (newSelected.has(index)) {
      newSelected.delete(index)
    } else {
      newSelected.add(index)
    }
    setSelectedProducts(newSelected)
  }

  const handleImport = async () => {
    if (selectedProducts.size === 0) {
      setError('Selecione pelo menos 1 produto')
      return
    }

    setImporting(true)

    try {
      // Carrega catálogo atual
      const stored = localStorage.getItem('products_catalog')
      let currentProducts = stored ? JSON.parse(stored) : []

      // Filtra produtos selecionados
      const productsToImport = products
        .filter((_, index) => selectedProducts.has(index))
        .map((product, index) => ({
          ...product,
          id: Math.max(...currentProducts.map(p => p.id), 0) + index + 1
        }))

      // Combina com existentes
      const updated = [...currentProducts, ...productsToImport]

      // Salva
      localStorage.setItem('products_catalog', JSON.stringify(updated))

      setError(`✅ ${productsToImport.length} produtos importados com sucesso!`)
      setProducts([])
      setUrl('')
      setSelectedProducts(new Set())

      // Recarrega a página após 2 segundos
      setTimeout(() => {
        window.location.reload()
      }, 2000)
    } catch (err) {
      setError(`Erro ao importar: ${err.message}`)
    } finally {
      setImporting(false)
    }
  }

  const toggleSelectAll = () => {
    if (selectedProducts.size === products.length) {
      setSelectedProducts(new Set())
    } else {
      setSelectedProducts(new Set(products.map((_, i) => i)))
    }
  }

  return (
    <div style={{ flex: 1, background: t.bg, borderRadius: 12, display: 'flex', overflow: 'hidden', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${t.border}`, background: t.bg, flexShrink: 0 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: t.text }}>🔗 Importar do Site</h2>
        <p style={{ margin: '4px 0 0 0', fontSize: 12, color: t.textMuted }}>Raspe produtos do site e importe para o catálogo</p>
      </div>

      {/* Input Section */}
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
        <label style={{ display: 'block', fontSize: 12, color: t.textMuted, marginBottom: 8 }}>
          Cole o link do site (ex: https://www.primestoremen.com.br/)
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleScrape()}
            placeholder="https://www.primestoremen.com.br/"
            disabled={loading}
            style={{
              flex: 1,
              borderRadius: 6,
              border: `1px solid ${t.border}`,
              padding: '10px 12px',
              fontSize: 12,
              background: t.bgSecondary,
              color: t.text,
              outline: 'none'
            }}
          />
          <button
            onClick={handleScrape}
            disabled={loading}
            style={{
              background: loading ? '#B0E8BA' : '#0EC331',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '10px 16px',
              fontSize: 12,
              fontWeight: 600,
              cursor: loading ? 'default' : 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            {loading ? '⏳ Raspando...' : '🔍 Raspar'}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div style={{
          padding: '12px 20px',
          background: error.includes('✅') ? '#D1FAE5' : '#FEE2E2',
          color: error.includes('✅') ? '#065F46' : '#7F1D1D',
          fontSize: 12,
          borderBottom: `1px solid ${t.border}`,
          flexShrink: 0
        }}>
          {error}
        </div>
      )}

      {/* Products List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {products.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
              <div style={{ fontSize: 12, color: t.textMuted }}>
                {selectedProducts.size} de {products.length} selecionados
              </div>
              <button
                onClick={toggleSelectAll}
                style={{
                  background: t.bgSecondary,
                  color: t.text,
                  border: `1px solid ${t.border}`,
                  borderRadius: 4,
                  padding: '4px 8px',
                  fontSize: 11,
                  cursor: 'pointer'
                }}
              >
                {selectedProducts.size === products.length ? 'Desselecionar Tudo' : 'Selecionar Tudo'}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {products.map((product, index) => (
                <div
                  key={index}
                  onClick={() => toggleProductSelection(index)}
                  style={{
                    background: selectedProducts.has(index) ? '#D1FAE5' : t.bgSecondary,
                    border: `2px solid ${selectedProducts.has(index) ? '#0EC331' : t.border}`,
                    borderRadius: 8,
                    padding: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    gap: 12,
                    alignItems: 'start'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedProducts.has(index)}
                    onChange={() => {}}
                    style={{ marginTop: 4, cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: t.text, fontSize: 12, marginBottom: 4 }}>
                      {product.nome}
                    </div>
                    <div style={{ display: 'flex', gap: 8, fontSize: 11, color: t.textMuted, marginBottom: 4 }}>
                      <span>{product.preco}</span>
                      {product.link && <span>📍 Link</span>}
                    </div>
                    {product.imagem && product.imagem.includes('http') && (
                      <a
                        href={product.imagem}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 11, color: '#0EC331', textDecoration: 'none' }}
                      >
                        Ver imagem
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {!loading && products.length === 0 && !error && (
          <div style={{ textAlign: 'center', color: t.textMuted, padding: '40px 20px' }}>
            <div style={{ fontSize: 14 }}>Cole uma URL e clique em "Raspar"</div>
            <div style={{ fontSize: 12, marginTop: 8 }}>Exemplo: https://www.primestoremen.com.br/</div>
          </div>
        )}
      </div>

      {/* Import Button */}
      {products.length > 0 && (
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${t.border}`, flexShrink: 0 }}>
          <button
            onClick={handleImport}
            disabled={importing || selectedProducts.size === 0}
            style={{
              width: '100%',
              background: importing ? '#B0E8BA' : '#0EC331',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '12px',
              fontSize: 12,
              fontWeight: 600,
              cursor: importing || selectedProducts.size === 0 ? 'default' : 'pointer'
            }}
          >
            {importing ? '⏳ Importando...' : `✅ Importar ${selectedProducts.size} Produtos`}
          </button>
        </div>
      )}
    </div>
  )
}
