import { useState, useEffect, useMemo } from 'react'
import { useTheme } from '../theme.jsx'
import {
  buildProductTree, getCachedCatalog, setCachedCatalog, isDriveConfigured,
  imgUrl, imgUrlFull,
} from '../services/googleDriveCatalog'

export default function DraftCatalogPage() {
  const { theme: t } = useTheme()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastFetchedAt, setLastFetchedAt] = useState(null)
  const [activeBrand, setActiveBrand] = useState('todos')
  const [search, setSearch] = useState('')
  const [lightbox, setLightbox] = useState(null) // { product, index }
  const [copyFeedback, setCopyFeedback] = useState(null)

  useEffect(() => {
    const cached = getCachedCatalog()
    if (cached) {
      setProducts(cached.products)
      setLastFetchedAt(cached.fetchedAt)
    } else if (isDriveConfigured()) {
      refresh()
    }
  }, [])

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const fresh = await buildProductTree()
      setProducts(fresh)
      setCachedCatalog(fresh)
      setLastFetchedAt(Date.now())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const brands = useMemo(() => {
    const counts = {}
    products.forEach(p => { counts[p.brand] = (counts[p.brand] || 0) + 1 })
    return [...new Set(products.map(p => p.brand))].sort((a, b) => counts[b] - counts[a])
  }, [products])

  const filtered = useMemo(() => {
    let list = products
    if (activeBrand !== 'todos') list = list.filter(p => p.brand === activeBrand)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(p => (p.brand + ' ' + p.model).toLowerCase().includes(q))
    }
    return list
  }, [products, activeBrand, search])

  function openLightbox(product) {
    setLightbox({ product, index: 0 })
  }
  function closeLightbox() {
    setLightbox(null)
  }
  function lbNav(delta) {
    setLightbox(prev => {
      if (!prev) return prev
      const len = prev.product.images.length
      return { ...prev, index: (prev.index + delta + len) % len }
    })
  }

  function sendWhatsApp() {
    if (!lightbox) return
    const { product, index } = lightbox
    const msg = encodeURIComponent(`*${product.model}*\n${product.brand}\n${imgUrlFull(product.images[index].id)}`)
    window.open(`https://wa.me/?text=${msg}`, '_blank')
  }

  async function copyLink() {
    if (!lightbox) return
    const { product, index } = lightbox
    try {
      await navigator.clipboard.writeText(imgUrlFull(product.images[index].id))
      setCopyFeedback('link')
      setTimeout(() => setCopyFeedback(null), 2000)
    } catch {
      alert('Erro ao copiar link')
    }
  }

  async function downloadImage() {
    if (!lightbox) return
    const { product, index } = lightbox
    const id = product.images[index].id
    const a = document.createElement('a')
    a.href = `https://drive.google.com/uc?export=download&id=${id}`
    a.download = `${product.model.slice(0, 30).replace(/[^a-z0-9]/gi, '-')}.jpg`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const chipStyle = (active) => ({
    background: active ? (t.primary || '#E8192C') : t.bgTertiary,
    color: active ? '#fff' : t.textMid,
    border: 'none', borderRadius: 9999, padding: '6px 14px', fontSize: 12, fontWeight: active ? 600 : 500,
    cursor: 'pointer', whiteSpace: 'nowrap',
  })

  return (
    <div style={{ flex: 1, background: t.bg, borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '20px 24px', borderBottom: `1px solid ${t.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: t.text, display: 'flex', alignItems: 'center', gap: 8 }}>
              Catálogo Rascunho
              <span style={{ fontSize: 11, fontWeight: 600, color: t.primary || '#E8192C', background: t.primaryBg, padding: '2px 8px', borderRadius: 6 }}>rascunho</span>
            </div>
            <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>
              Fotos direto do Google Drive — teste procura no WhatsApp antes de cadastrar no catálogo oficial.
              {lastFetchedAt && <> · atualizado {new Date(lastFetchedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</>}
            </div>
          </div>
          <button onClick={refresh} disabled={loading} style={{
            background: loading ? t.bgTertiary : (t.primary || '#E8192C'), color: loading ? t.textMuted : '#fff',
            border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600,
            cursor: loading ? 'default' : 'pointer',
          }}>{loading ? 'Atualizando...' : '↻ Atualizar'}</button>
        </div>

        {products.length > 0 && (
          <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar produto ou marca..."
              style={{ flex: 1, minWidth: 200, border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, background: t.inputBg, color: t.text, outline: 'none' }}
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', overflowX: 'auto' }}>
              <button onClick={() => setActiveBrand('todos')} style={chipStyle(activeBrand === 'todos')}>Todos</button>
              {brands.map(b => (
                <button key={b} onClick={() => setActiveBrand(b)} style={chipStyle(activeBrand === b)}>
                  {b} ({products.filter(p => p.brand === b).length})
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {!isDriveConfigured() ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: t.text, marginBottom: 6 }}>Google Drive não configurado</div>
            <div style={{ fontSize: 13, color: t.textMuted }}>Adicione VITE_GOOGLE_DRIVE_API_KEY e VITE_GOOGLE_DRIVE_FOLDER_ID no .env.local</div>
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#DC2626', marginBottom: 6 }}>Erro ao carregar</div>
            <div style={{ fontSize: 13, color: t.textMuted }}>{error}</div>
          </div>
        ) : loading && products.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: t.textMuted, fontSize: 13 }}>Carregando fotos do Drive...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: t.text, marginBottom: 6 }}>
              {products.length === 0 ? 'Nenhuma foto encontrada na pasta' : 'Nenhum produto encontrado'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
            {filtered.map(p => (
              <div key={p.id} onClick={() => openLightbox(p)} style={{ cursor: 'pointer' }}>
                <div style={{ position: 'relative' }}>
                  <img src={imgUrl(p.images[0].id)} alt={p.model}
                    style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, background: t.bgTertiary, border: `1px solid ${t.border}` }}
                    onError={e => { e.target.src = 'https://placehold.co/400x400?text=%E2%80%A2' }} />
                  {p.images.length > 1 && (
                    <div style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>
                      {p.images.length} fotos
                    </div>
                  )}
                </div>
                <div style={{ padding: '8px 2px' }}>
                  <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 2 }}>{p.brand}</div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.model}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div onClick={closeLightbox} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <button onClick={closeLightbox} style={{ position: 'absolute', top: 20, right: 24, background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 20, width: 40, height: 40, borderRadius: '50%', cursor: 'pointer' }}>✕</button>

          {lightbox.product.images.length > 1 && (
            <>
              <button onClick={e => { e.stopPropagation(); lbNav(-1) }} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 22, width: 40, height: 40, borderRadius: '50%', cursor: 'pointer' }}>‹</button>
              <button onClick={e => { e.stopPropagation(); lbNav(1) }} style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 22, width: 40, height: 40, borderRadius: '50%', cursor: 'pointer' }}>›</button>
            </>
          )}

          <img
            onClick={e => e.stopPropagation()}
            src={imgUrlFull(lightbox.product.images[lightbox.index].id)}
            alt={lightbox.product.model}
            style={{ maxWidth: '88vw', maxHeight: '68vh', objectFit: 'contain', borderRadius: 8 }}
          />

          <div onClick={e => e.stopPropagation()} style={{ textAlign: 'center', marginTop: 14 }}>
            <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{lightbox.product.model}</div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 }}>
              {lightbox.product.brand}
              {lightbox.product.images.length > 1 && <> · {lightbox.index + 1}/{lightbox.product.images.length}</>}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 12 }}>
              <button onClick={copyLink} style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 12, borderRadius: 6, cursor: 'pointer' }}>
                {copyFeedback === 'link' ? '✓ Copiado' : '🔗 Link'}
              </button>
              <button onClick={sendWhatsApp} style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 12, borderRadius: 6, cursor: 'pointer' }}>💬 WhatsApp</button>
              <button onClick={downloadImage} style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 12, borderRadius: 6, cursor: 'pointer' }}>⬇️ Baixar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
