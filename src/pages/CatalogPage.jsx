import { useState, useEffect } from 'react'
import { useTheme } from '../theme.jsx'
import { getProductsFromSupabase } from '../services/catalogSyncService'

export default function CatalogPage() {
  const { theme: t } = useTheme()
  const [products, setProducts] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('Todos')
  const [copyFeedback, setCopyFeedback] = useState(null)
  const [formData, setFormData] = useState({ id: null, nome: '', preco: '', imagem: '', link: '', categoria: '' })
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [sortBy, setSortBy] = useState('default')

  const loadProducts = async () => {
    const supabaseProducts = await getProductsFromSupabase()
    setProducts(supabaseProducts)
    saveToStorage(supabaseProducts)
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await loadProducts()
    setTimeout(() => setIsRefreshing(false), 1000)
  }

  useEffect(() => {
    loadProducts()
  }, [])

  const saveToStorage = (data) => {
    localStorage.setItem('products_catalog', JSON.stringify(data))
  }

  const openAddModal = () => {
    setFormData({ id: null, nome: '', preco: '', imagem: '', link: '', categoria: '' })
    setEditingId(null)
    setShowModal(true)
  }

  const openEditModal = (product) => {
    setFormData(product)
    setEditingId(product.id)
    setShowModal(true)
  }

  const handleSave = () => {
    if (!formData.nome || !formData.preco || !formData.imagem || !formData.link) {
      alert('Preencha todos os campos!')
      return
    }
    let updated
    if (editingId) {
      updated = products.map(p => p.id === editingId ? formData : p)
    } else {
      updated = [...products, { ...formData, id: Math.max(...products.map(p => p.id), 0) + 1 }]
    }
    setProducts(updated)
    saveToStorage(updated)
    setShowModal(false)
    setFormData({ id: null, nome: '', preco: '', imagem: '', link: '', categoria: '' })
  }

  const handleDelete = (id) => {
    if (confirm('Tem certeza que quer deletar?')) {
      const updated = products.filter(p => p.id !== id)
      setProducts(updated)
      saveToStorage(updated)
    }
  }

  // Categorias únicas
  const categories = ['Todos', ...Array.from(new Set(products.map(p => p.categoria).filter(Boolean))).sort()]

  const parsePreco = (preco) => {
    const str = String(preco || '0').replace('R$', '').trim().replace(/\./g, '').replace(',', '.')
    return parseFloat(str) || 0
  }

  const filtered = products
    .filter(p => {
      const matchSearch = p.nome.toLowerCase().includes(search.toLowerCase())
      const matchCat = activeCategory === 'Todos' || p.categoria === activeCategory
      return matchSearch && matchCat
    })
    .sort((a, b) => {
      if (sortBy === 'az') return a.nome.localeCompare(b.nome, 'pt-BR')
      if (sortBy === 'preco') return parsePreco(a.preco) - parsePreco(b.preco)
      if (sortBy === 'preco_desc') return parsePreco(b.preco) - parsePreco(a.preco)
      return 0
    })

  // Enviar via WhatsApp
  const sendWhatsApp = (product) => {
    const msg = encodeURIComponent(`*${product.nome}*\n💰 ${product.preco}\n🔗 ${product.link}`)
    window.open(`https://wa.me/?text=${msg}`, '_blank')
  }

  // Copiar link do produto
  const copyLink = async (product) => {
    try {
      await navigator.clipboard.writeText(product.link)
      setCopyFeedback(`link-${product.id}`)
      setTimeout(() => setCopyFeedback(null), 2000)
    } catch {
      alert('❌ Erro ao copiar link')
    }
  }

  // Copiar imagem como arquivo (blob)
  const copyImage = async (product) => {
    try {
      const res = await fetch(product.imagem)
      if (!res.ok) throw new Error('Falha ao carregar imagem')

      const blob = await res.blob()

      // Copiar imagem como arquivo para colar direto (WhatsApp, etc)
      try {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
        setCopyFeedback(product.id)
        setTimeout(() => setCopyFeedback(null), 2000)
      } catch (clipErr) {
        // Se clipboard falhar, oferecer download
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${product.nome.substring(0, 30).replace(/[^a-z0-9]/gi, '-')}.jpg`
        a.click()
        URL.revokeObjectURL(url)
        setCopyFeedback(product.id)
        setTimeout(() => setCopyFeedback(null), 2000)
      }
    } catch (err) {
      alert('❌ Erro ao copiar imagem: ' + err.message)
    }
  }

  const btnStyle = {
    border: 'none',
    borderRadius: 4,
    padding: '4px 8px',
    fontSize: 11,
    cursor: 'pointer',
    fontWeight: 600,
    lineHeight: 1.4,
  }

  return (
    <div style={{ flex: 1, background: t.bg, borderRadius: 12, display: 'flex', overflow: 'hidden', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${t.border}`, background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: t.text }}>📦 Catálogo Supabase</h2>
          <p style={{ margin: '4px 0 0 0', fontSize: 12, color: t.textMuted }}>
            {filtered.length} de {products.length} produtos
            {activeCategory !== 'Todos' ? ` · ${activeCategory}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Atualizar catálogo do Supabase"
            style={{ background: isRefreshing ? '#A0AEC0' : '#667EEA', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 14px', fontSize: 12, fontWeight: 600, cursor: isRefreshing ? 'not-allowed' : 'pointer', opacity: isRefreshing ? 0.7 : 1, transition: 'all 0.2s' }}
          >
            {isRefreshing ? '⟳ Atualizando...' : '🔄 Atualizar'}
          </button>
          <button
            onClick={openAddModal}
            style={{ background: '#0EC331', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            ➕ Adicionar Produto
          </button>
        </div>
      </div>

      {/* Search + Filtro categoria */}
      <div style={{ padding: '10px 20px', borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
        <input
          type="text"
          placeholder="Buscar produto..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', borderRadius: 6, border: `1px solid ${t.border}`, padding: '8px 12px', fontSize: 12, background: t.bgSecondary, color: t.text, outline: 'none', boxSizing: 'border-box', marginBottom: 10 }}
        />

        {/* Pills de categoria + ordenação */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                padding: '4px 10px',
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                border: activeCategory === cat ? 'none' : `1px solid ${t.border}`,
                background: activeCategory === cat ? '#0EC331' : t.bgSecondary,
                color: activeCategory === cat ? '#fff' : t.textMuted,
                transition: 'all 0.15s',
              }}
            >
              {cat}
            </button>
          ))}

          {/* Separador + Ordenação */}
          <div style={{ width: 1, height: 20, background: t.border, margin: '0 4px', flexShrink: 0 }} />
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: sortBy !== 'default' ? '#667EEA' : t.textMuted,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              cursor: 'pointer',
              padding: '2px 0',
            }}
          >
            <option value="default">Ordenar</option>
            <option value="az">A → Z</option>
            <option value="preco">Menor preço</option>
            <option value="preco_desc">Maior preço</option>
          </select>
        </div>
      </div>

      {/* Tabela */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${t.border}` }}>
              <th style={{ textAlign: 'left', padding: '8px', color: t.textSecondary, fontWeight: 600 }}>Foto</th>
              <th style={{ textAlign: 'left', padding: '8px', color: t.textSecondary, fontWeight: 600 }}>Produto</th>
              <th style={{ textAlign: 'left', padding: '8px', color: t.textSecondary, fontWeight: 600 }}>Categoria</th>
              <th style={{ textAlign: 'left', padding: '8px', color: t.textSecondary, fontWeight: 600 }}>Preço</th>
              <th style={{ textAlign: 'center', padding: '8px', color: t.textSecondary, fontWeight: 600 }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(product => (
              <tr key={product.id} style={{ borderBottom: `1px solid ${t.border}` }}>
                <td style={{ padding: '8px' }}>
                  <a href={product.imagem} target="_blank" rel="noreferrer">
                    <img
                      src={product.imagem}
                      alt={product.nome}
                      style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, display: 'block' }}
                      onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
                    />
                    <span style={{ display: 'none', width: 56, height: 56, borderRadius: 6, background: t.bgSecondary, fontSize: 20, alignItems: 'center', justifyContent: 'center' }}>📷</span>
                  </a>
                </td>
                <td style={{ padding: '8px', color: t.text, maxWidth: 220 }}>
                  <a href={product.link} target="_blank" rel="noreferrer" style={{ color: t.text, textDecoration: 'none', fontWeight: 500 }}>
                    {product.nome}
                  </a>
                </td>
                <td style={{ padding: '8px' }}>
                  {product.categoria ? (
                    <span style={{ background: t.bgSecondary, color: t.textMuted, borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {product.categoria}
                    </span>
                  ) : (
                    <span style={{ color: t.textMuted, fontSize: 10 }}>—</span>
                  )}
                </td>
                <td style={{ padding: '8px', color: t.text, fontWeight: 600, whiteSpace: 'nowrap' }}>{product.preco}</td>
                <td style={{ padding: '8px' }}>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                    {/* WhatsApp */}
                    <button
                      onClick={() => sendWhatsApp(product)}
                      title="Enviar via WhatsApp"
                      style={{ ...btnStyle, background: '#25D366', color: '#fff' }}
                    >
                      📲 Zap
                    </button>

                    {/* Copiar foto */}
                    <button
                      onClick={() => copyImage(product)}
                      title="Copiar imagem"
                      style={{ ...btnStyle, background: copyFeedback === product.id ? '#0EC331' : t.bgSecondary, color: copyFeedback === product.id ? '#fff' : t.text, border: `1px solid ${t.border}` }}
                    >
                      {copyFeedback === product.id ? '✅ Copiado' : '📋 Foto'}
                    </button>

                    {/* Copiar link */}
                    <button
                      onClick={() => copyLink(product)}
                      title="Copiar link do produto"
                      style={{ ...btnStyle, background: copyFeedback === `link-${product.id}` ? '#0EC331' : t.bgSecondary, color: copyFeedback === `link-${product.id}` ? '#fff' : t.text, border: `1px solid ${t.border}` }}
                    >
                      {copyFeedback === `link-${product.id}` ? '✅ Link' : '🔗 Link'}
                    </button>

                    {/* Editar */}
                    <button
                      onClick={() => openEditModal(product)}
                      style={{ ...btnStyle, background: '#3B82F6', color: '#fff' }}
                    >
                      ✏️
                    </button>

                    {/* Deletar */}
                    <button
                      onClick={() => handleDelete(product.id)}
                      style={{ ...btnStyle, background: '#EF4444', color: '#fff' }}
                    >
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: t.textMuted, fontSize: 13 }}>
            Nenhum produto encontrado
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: t.bg, borderRadius: 12, padding: '24px', maxWidth: 500, width: '90%', maxHeight: '80vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 700, color: t.text }}>
              {editingId ? '✏️ Editar Produto' : '➕ Novo Produto'}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'Nome', key: 'nome', placeholder: 'Ex: Tenis Nike Dunk' },
                { label: 'Preço', key: 'preco', placeholder: 'Ex: R$ 459,00' },
                { label: 'Categoria', key: 'categoria', placeholder: 'Ex: Tênis, Perfumes, Camisetas...' },
                { label: 'URL da Imagem', key: 'imagem', placeholder: 'https://...' },
                { label: 'Link do Produto', key: 'link', placeholder: 'https://primestoremen.com.br/...' },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label style={{ display: 'block', fontSize: 12, color: t.textMuted, marginBottom: 4 }}>{label}</label>
                  <input
                    type="text"
                    value={formData[key] || ''}
                    onChange={e => setFormData({ ...formData, [key]: e.target.value })}
                    style={{ width: '100%', borderRadius: 6, border: `1px solid ${t.border}`, padding: '8px 12px', fontSize: 12, background: t.bgSecondary, color: t.text, outline: 'none', boxSizing: 'border-box' }}
                    placeholder={placeholder}
                  />
                  {key === 'imagem' && formData.imagem && (
                    <img src={formData.imagem} alt="preview" style={{ marginTop: 8, maxWidth: '100%', maxHeight: 150, borderRadius: 6 }} onError={e => e.target.style.display = 'none'} />
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button onClick={() => setShowModal(false)} style={{ flex: 1, background: t.bgSecondary, color: t.text, border: `1px solid ${t.border}`, borderRadius: 6, padding: '10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleSave} style={{ flex: 1, background: '#0EC331', color: '#fff', border: 'none', borderRadius: 6, padding: '10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
