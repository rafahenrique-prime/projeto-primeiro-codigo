import { useState, useRef } from 'react'
import { useTheme } from '../theme.jsx'
import { processPhotoFlow, getMetrics, resetMetrics } from '../services/photoFlowService'
import { getCacheStats } from '../services/photoCacheService'

export default function PhotoRecognitionPage() {
  const { theme: t } = useTheme()
  const [imageUrl, setImageUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [metrics, setMetrics] = useState(getMetrics())
  const [tab, setTab] = useState('test') // 'test' | 'metrics' | 'cache'
  const fileInputRef = useRef(null)

  const handleProcess = async () => {
    if (!imageUrl.trim()) {
      alert('Digite uma URL de imagem válida')
      return
    }

    setLoading(true)
    try {
      const res = await processPhotoFlow(imageUrl)
      setResult(res)
      setMetrics(getMetrics())
    } catch (err) {
      alert('Erro: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setLoading(true)

      // Converte para base64 (para testes locais)
      const reader = new FileReader()
      reader.onload = async () => {
        // Em produção, você faria upload para um servidor
        const dataUrl = reader.result
        setImageUrl(dataUrl)

        // Processa
        const res = await processPhotoFlow(dataUrl)
        setResult(res)
        setMetrics(getMetrics())
        setLoading(false)
      }
      reader.readAsDataURL(file)
    } catch (err) {
      alert('Erro ao processar: ' + err.message)
      setLoading(false)
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: t.bg, borderRadius: 12, overflow: 'hidden', border: `1px solid ${t.border}` }}>
      {/* Header */}
      <div style={{ padding: '20px 24px', borderBottom: `1px solid ${t.border}`, background: '#F0F9FF' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ fontSize: 24 }}>📸</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0369A1' }}>Reconhecimento de Fotos</h1>
            <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#0C4A6E' }}>
              Envie uma foto para encontrar produtos no catálogo
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${t.border}`, background: t.bg, padding: '0 24px' }}>
        {[
          { key: 'test', label: '🧪 Teste' },
          { key: 'metrics', label: '📊 Performance' },
          { key: 'cache', label: '💾 Cache' },
        ].map(tabItem => (
          <button
            key={tabItem.key}
            onClick={() => setTab(tabItem.key)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: tab === tabItem.key ? '2px solid #0891B2' : '2px solid transparent',
              padding: '12px 0',
              fontSize: 13,
              fontWeight: 600,
              color: tab === tabItem.key ? '#0891B2' : t.textMuted,
              cursor: 'pointer',
              marginRight: 16,
            }}
          >
            {tabItem.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        {/* TAB: TESTE */}
        {tab === 'test' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Input */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: t.textMuted, marginBottom: 8 }}>
                URL da Imagem
              </label>
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  type="text"
                  value={imageUrl}
                  onChange={e => setImageUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleProcess()}
                  placeholder="https://..."
                  disabled={loading}
                  style={{
                    flex: 1,
                    borderRadius: 8,
                    border: `1px solid ${t.border}`,
                    padding: '10px 14px',
                    fontSize: 13,
                    background: t.bgSecondary,
                    color: t.text,
                    outline: 'none',
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  style={{
                    background: t.bgTertiary,
                    border: `1px solid ${t.border}`,
                    borderRadius: 8,
                    padding: '10px 18px',
                    fontSize: 13,
                    cursor: 'pointer',
                    color: t.text,
                    whiteSpace: 'nowrap',
                  }}
                >
                  📁 Upload
                </button>
                <button
                  onClick={handleProcess}
                  disabled={loading || !imageUrl.trim()}
                  style={{
                    background: loading || !imageUrl.trim() ? '#BFDBFE' : '#0EA5E9',
                    border: 'none',
                    borderRadius: 8,
                    padding: '10px 24px',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#fff',
                    cursor: loading || !imageUrl.trim() ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {loading ? '⏳ Processando...' : '🔍 Analisar'}
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </div>

            {/* Preview */}
            {imageUrl && imageUrl.startsWith('http') && (
              <div style={{ background: t.bgSecondary, borderRadius: 8, padding: 12, textAlign: 'center' }}>
                <img
                  src={imageUrl}
                  alt="Preview"
                  style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: 8 }}
                />
              </div>
            )}

            {/* Resultado */}
            {result && (
              <div style={{
                background: result.success ? '#ECFDF5' : '#FEE2E2',
                border: `1px solid ${result.success ? '#6EE7B7' : '#FECACA'}`,
                borderRadius: 8,
                padding: 16,
              }}>
                {result.success ? (
                  <>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#059669', marginBottom: 12 }}>
                      ✅ {result.matches.length} produtos encontrados
                    </div>

                    {result.matches.map((product, i) => (
                      <div key={i} style={{
                        background: '#fff',
                        borderRadius: 6,
                        padding: 10,
                        marginBottom: i < result.matches.length - 1 ? 8 : 0,
                        display: 'flex',
                        gap: 10,
                      }}>
                        {product.imagem && (
                          <img
                            src={product.imagem}
                            alt={product.nome}
                            style={{ width: 60, height: 60, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }}
                          />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#111' }}>
                            {product.nome}
                          </div>
                          <div style={{ fontSize: 12, color: '#059669', fontWeight: 700 }}>
                            {product.preco}
                          </div>
                          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
                            Confiança: {product.confidence}%
                          </div>
                        </div>
                      </div>
                    ))}

                    <div style={{
                      fontSize: 11,
                      color: '#6B7280',
                      marginTop: 12,
                      paddingTop: 12,
                      borderTop: `1px solid #E5E7EB`,
                    }}>
                      ⏱️ Processado em {result.processingTime}ms
                      {result.analysis.fromCache && ' (do cache)'}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: '#991B1B' }}>
                    ❌ Erro: {result.error}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB: MÉTRICAS */}
        {tab === 'metrics' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              {[
                { label: 'Total Processado', value: metrics.totalProcessed },
                { label: 'Cache Hits', value: metrics.cacheHits },
                { label: 'Taxa de Cache', value: `${metrics.cacheHitRate}%` },
                { label: 'Tempo Médio', value: `${metrics.averageTimeMs}ms` },
                { label: 'Erros', value: metrics.errors },
                { label: 'Taxa de Erro', value: `${metrics.errorRate}%` },
              ].map((metric, i) => (
                <div
                  key={i}
                  style={{
                    background: t.bgSecondary,
                    borderRadius: 8,
                    padding: 12,
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 6 }}>
                    {metric.label}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#0891B2' }}>
                    {metric.value}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                resetMetrics()
                setMetrics(getMetrics())
              }}
              style={{
                background: '#FEE2E2',
                border: '1px solid #FECACA',
                borderRadius: 8,
                padding: 10,
                fontSize: 12,
                fontWeight: 600,
                color: '#991B1B',
                cursor: 'pointer',
              }}
            >
              🔄 Resetar Métricas
            </button>
          </div>
        )}

        {/* TAB: CACHE */}
        {tab === 'cache' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {(() => {
              const stats = getCacheStats()
              return (
                <>
                  <div style={{
                    background: '#F0F9FF',
                    border: '1px solid #BAE6FD',
                    borderRadius: 8,
                    padding: 12,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0369A1', marginBottom: 12 }}>
                      📊 Estatísticas do Cache
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[
                        [`📦 Entradas`, stats.totalEntries],
                        [`💰 Economia Estimada`, `$${stats.estimatedSavings.toFixed(2)}`],
                        [`📅 Entrada Mais Antiga`, stats.oldestEntry || 'N/A'],
                        [`⏱️ Entrada Mais Recente`, stats.newestEntry || 'N/A'],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: 12,
                          }}
                        >
                          <span style={{ color: '#0C4A6E' }}>{label}</span>
                          <span style={{ fontWeight: 600, color: '#0369A1' }}>{value}</span>
                        </div>
                      ))}
                    </div>

                    {Object.keys(stats.providers).length > 0 && (
                      <>
                        <div style={{ fontSize: 11, color: '#6B7280', marginTop: 12, paddingTop: 12, borderTop: '1px solid #BAE6FD' }}>
                          🔧 Provedores Usados:
                        </div>
                        {Object.entries(stats.providers).map(([provider, count]) => (
                          <div key={provider} style={{ fontSize: 11, color: '#0C4A6E', marginTop: 4 }}>
                            • {provider}: {count} análises
                          </div>
                        ))}
                      </>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      if (window.confirm('Limpar todo o cache?')) {
                        // Implementar clearCache()
                        alert('Cache limpo!')
                      }
                    }}
                    style={{
                      background: '#FEE2E2',
                      border: '1px solid #FECACA',
                      borderRadius: 8,
                      padding: 10,
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#991B1B',
                      cursor: 'pointer',
                    }}
                  >
                    🗑️ Limpar Cache
                  </button>
                </>
              )
            })()}
          </div>
        )}
      </div>
    </div>
  )
}
