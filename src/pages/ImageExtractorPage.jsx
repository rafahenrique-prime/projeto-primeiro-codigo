import { useState } from 'react'
import { useTheme } from '../theme'
import { extractAndUpdateAllImages } from '../services/imageExtractor'
import { syncCatalogFromSupabase } from '../services/catalog'

export default function ImageExtractorPage() {
  const { theme: t } = useTheme()
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const [catalog, setCatalog] = useState(null)

  async function handleExtract() {
    setLoading(true)
    setProgress({ current: 0, total: 0, produto: '' })
    setResult(null)

    try {
      // Carregar produtos do localStorage
      const stored = localStorage.getItem('products_catalog')
      const products = stored ? JSON.parse(stored) : []
      setCatalog(products)

      const withoutImages = products.filter(p => !p.imagem || !p.imagem.trim())
      setProgress({ current: 0, total: withoutImages.length, produto: 'Iniciando...' })

      // Extrair e atualizar
      const res = await extractAndUpdateAllImages(products, (current, total, nome) => {
        setProgress({ current, total, produto: nome })
      })

      setResult(res)
      if (res.success) {
        // Sincronizar novo catálogo
        await syncCatalogFromSupabase()
        setTimeout(() => window.location.reload(), 2000)
      }
    } catch (err) {
      console.error(err)
      setResult({ success: false, error: err.message })
    } finally {
      setLoading(false)
    }
  }

  if (!catalog) {
    const stored = localStorage.getItem('products_catalog')
    const products = stored ? JSON.parse(stored) : []
    const withImages = products.filter(p => p.imagem && p.imagem.trim())
    const withoutImages = products.length - withImages.length

    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20, padding: 30, background: t.bg, borderRadius: 8 }}>
        <h1 style={{ color: t.text, margin: 0 }}>🖼️ Extrator de Imagens da Bagy</h1>

        <div style={{ background: t.bgAlt, padding: 20, borderRadius: 8, border: `1px solid ${t.border}` }}>
          <h3 style={{ color: t.text, margin: '0 0 10px 0' }}>Status Atual</h3>
          <p style={{ color: t.textSecondary, margin: 0 }}>
            Total: <strong>{products.length}</strong> produtos
          </p>
          <p style={{ color: t.textSecondary, margin: 0 }}>
            Com foto: <strong style={{ color: '#10B981' }}>{withImages.length}</strong>
          </p>
          <p style={{ color: t.textSecondary, margin: 0 }}>
            Sem foto: <strong style={{ color: '#EF4444' }}>{withoutImages}</strong> ({((withoutImages/products.length)*100).toFixed(1)}%)
          </p>
        </div>

        <div style={{ background: t.bgAlt, padding: 20, borderRadius: 8, border: `1px solid ${t.border}` }}>
          <h3 style={{ color: t.text, margin: '0 0 10px 0' }}>Como Funciona</h3>
          <ul style={{ color: t.textSecondary, margin: 0, paddingLeft: 20 }}>
            <li>Acessa a página do produto no link da Bagy</li>
            <li>Extrai a imagem via og:image meta tag</li>
            <li>Atualiza no Supabase</li>
            <li>Sincroniza no app (~2-3 min por 522 produtos)</li>
          </ul>
        </div>

        <button
          onClick={handleExtract}
          disabled={loading || withoutImages === 0}
          style={{
            padding: '12px 24px',
            fontSize: 16,
            fontWeight: 600,
            background: withoutImages === 0 ? '#ccc' : '#3B82F6',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: withoutImages === 0 ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s'
          }}
        >
          {loading ? '⏳ Extraindo...' : '🚀 Extrair 522 Imagens'}
        </button>

        {result && (
          <div style={{
            background: result.success ? '#D1FAE5' : '#FEE2E2',
            border: `2px solid ${result.success ? '#10B981' : '#EF4444'}`,
            color: result.success ? '#065F46' : '#7F1D1D',
            padding: 15,
            borderRadius: 8,
            fontWeight: 500
          }}>
            {result.success
              ? `✅ Concluído! ${result.imagesAdded} imagens adicionadas. Recarregando em 2s...`
              : `❌ Erro: ${result.error || 'Falha ao atualizar Supabase'}`
            }
          </div>
        )}
      </div>
    )
  }

  // Durante extração
  if (progress) {
    const percent = Math.round((progress.current / progress.total) * 100)
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20, padding: 30, background: t.bg, borderRadius: 8, justifyContent: 'center', alignItems: 'center' }}>
        <h2 style={{ color: t.text }}>⏳ Extraindo Imagens...</h2>

        <div style={{ width: '100%', maxWidth: 600 }}>
          <div style={{
            background: t.bgAlt,
            height: 40,
            borderRadius: 8,
            overflow: 'hidden',
            border: `2px solid ${t.border}`
          }}>
            <div style={{
              background: '#3B82F6',
              height: '100%',
              width: `${percent}%`,
              transition: 'width 0.3s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 600,
              fontSize: 12
            }}>
              {percent}%
            </div>
          </div>
        </div>

        <p style={{ color: t.textSecondary, textAlign: 'center', margin: 0 }}>
          {progress.current} / {progress.total}
        </p>

        <p style={{ color: t.text, textAlign: 'center', fontWeight: 500, margin: 0 }}>
          {progress.produto}
        </p>

        {result && (
          <div style={{
            background: result.success ? '#D1FAE5' : '#FEE2E2',
            border: `2px solid ${result.success ? '#10B981' : '#EF4444'}`,
            color: result.success ? '#065F46' : '#7F1D1D',
            padding: 15,
            borderRadius: 8,
            fontWeight: 500,
            textAlign: 'center'
          }}>
            {result.success
              ? `✅ Concluído! ${result.imagesAdded} imagens adicionadas.`
              : `❌ Erro ao processar`
            }
          </div>
        )}
      </div>
    )
  }

  return null
}
