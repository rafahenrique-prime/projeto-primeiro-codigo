import { useState } from 'react'
import { useTheme } from '../theme.jsx'
import { scrapeProductsFromURL } from '../services/scrapingService'
import { getAllProducts } from '../services/catalog'

export default function ExtractorPage() {
  const { theme: t } = useTheme()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [scrapedProducts, setScrapedProducts] = useState([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  const handleScrape = async () => {
    if (!url.trim()) {
      setError('Digite uma URL válida')
      return
    }

    setLoading(true)
    setError('')
    setScrapedProducts([])
    setSuccessMessage('')

    try {
      const scraped = await scrapeProductsFromURL(url)
      
      // Carrega catálogo existente para verificar duplicatas
      const stored = localStorage.getItem('products_catalog')
      const existingProducts = stored ? JSON.parse(stored) : getAllProducts()
      const existingNames = new Set(existingProducts.map(p => p.nome.toLowerCase()))

      // Filtra duplicatas
      const filtered = scraped.filter(p => !existingNames.has(p.nome.toLowerCase()))
      const duplicatesRemoved = scraped.length - filtered.length

      if (filtered.length === 0) {
        setError(`❌ Nenhum produto novo encontrado. ${duplicatesRemoved} produtos já existem no catálogo.`)
        return
      }

      setScrapedProducts(filtered)
      if (duplicatesRemoved > 0) {
        setError(`⚠️ ${duplicatesRemoved} produto(s) ignorado(s) por já existir no catálogo`)
      }
    } catch (err) {
      setError(`❌ Erro ao raspar: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveToTemplate = async () => {
    if (scrapedProducts.length === 0) {
      setError('Nenhum produto para salvar')
      return
    }

    setSaving(true)
    setError('')

    try {
      // Carrega catálogo existente
      const stored = localStorage.getItem('products_catalog')
      const existingProducts = stored ? JSON.parse(stored) : getAllProducts()

      // Encontra o maior ID
      const maxId = Math.max(...existingProducts.map(p => p.id), 0)

      // Filtra duplicatas novamente (proteção)
      const existingNames = new Set(existingProducts.map(p => p.nome.toLowerCase()))
      const productsToAdd = scrapedProducts.filter(p => !existingNames.has(p.nome.toLowerCase()))

      // Cria novos produtos com IDs sequenciais
      const newProducts = productsToAdd.map((p, idx) => ({
        ...p,
        id: maxId + idx + 1
      }))

      // Combina e salva
      const updated = [...existingProducts, ...newProducts]
      localStorage.setItem('products_catalog', JSON.stringify(updated))

      setSuccessMessage(`✅ ${newProducts.length} produtos adicionados com sucesso! (IDs ${newProducts[0]?.id}-${newProducts[newProducts.length - 1]?.id})`)
      setScrapedProducts([])
      setUrl('')

      // Limpa mensagem após 3s
      setTimeout(() => setSuccessMessage(''), 3000)
    } catch (err) {
      setError(`❌ Erro ao salvar: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ flex: 1, background: t.bg, borderRadius: 12, display: 'flex', overflow: 'hidden', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${t.border}`, background: t.bg, flexShrink: 0 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: t.text }}>🔨 Extrator de Produtos</h2>
        <p style={{ margin: '4px 0 0 0', fontSize: 12, color: t.textMuted }}>Raspe produtos do seu site e adicione ao catálogo</p>
      </div>

      {/* Input Section */}
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
        <label style={{ display: 'block', fontSize: 12, color: t.textMuted, marginBottom: 8 }}>
          Cole a URL da página (ex: https://www.primestoremen.com.br/produtos?page=3)
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleScrape()}
            placeholder="https://www.primestoremen.com.br/produtos?page=..."
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

      {/* Messages */}
      {error && (
        <div style={{
          padding: '12px 20px',
          background: error.includes('✅') ? '#D1FAE5' : error.includes('⚠️') ? '#FEF3C7' : '#FEE2E2',
          color: error.includes('✅') ? '#065F46' : error.includes('⚠️') ? '#92400E' : '#7F1D1D',
          fontSize: 12,
          borderBottom: `1px solid ${t.border}`,
          flexShrink: 0
        }}>
          {error}
        </div>
      )}

      {successMessage && (
        <div style={{
          padding: '12px 20px',
          background: '#D1FAE5',
          color: '#065F46',
          fontSize: 12,
          borderBottom: `1px solid ${t.border}`,
          flexShrink: 0
        }}>
          {successMessage}
        </div>
      )}

      {/* Products Preview */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {scrapedProducts.length > 0 && (
          <>
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: 14, color: t.text }}>
                ✅ {scrapedProducts.length} produtos encontrados
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {scrapedProducts.map((product, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: t.bgSecondary,
                      border: `1px solid ${t.border}`,
                      borderRadius: 8,
                      padding: 12,
                      display: 'flex',
                      gap: 12,
                      alignItems: 'start'
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: t.text, fontSize: 12, marginBottom: 4 }}>
                        {product.nome}
                      </div>
                      <div style={{ display: 'flex', gap: 8, fontSize: 11, color: t.textMuted, marginBottom: 4 }}>
                        <span>💰 {product.preco}</span>
                        {product.link && <span>📍 Link OK</span>}
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
            </div>
          </>
        )}

        {!loading && scrapedProducts.length === 0 && !error && (
          <div style={{ textAlign: 'center', color: t.textMuted, padding: '40px 20px' }}>
            <div style={{ fontSize: 14 }}>Cole uma URL e clique em "🔍 Raspar"</div>
            <div style={{ fontSize: 12, marginTop: 8 }}>Ex: https://www.primestoremen.com.br/produtos?page=2</div>
          </div>
        )}
      </div>

      {/* Save Button */}
      {scrapedProducts.length > 0 && (
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${t.border}`, flexShrink: 0 }}>
          <button
            onClick={handleSaveToTemplate}
            disabled={saving}
            style={{
              width: '100%',
              background: saving ? '#B0E8BA' : '#0EC331',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '12px',
              fontSize: 12,
              fontWeight: 600,
              cursor: saving ? 'default' : 'pointer'
            }}
          >
            {saving ? '⏳ Salvando...' : `✅ Adicionar ${scrapedProducts.length} ao Catálogo`}
          </button>
        </div>
      )}
    </div>
  )
}
