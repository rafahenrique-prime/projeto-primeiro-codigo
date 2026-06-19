import { useState, useEffect } from 'react'
import { useTheme } from '../theme.jsx'
import { getAllProducts } from '../services/catalog'

export default function CatalogPage() {
  const { theme: t } = useTheme()
  const [products, setProducts] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [search, setSearch] = useState('')
  const [formData, setFormData] = useState({
    id: null,
    nome: '',
    preco: '',
    imagem: '',
    link: ''
  })

  useEffect(() => {
    // Sempre mescla catalog.js (fonte de verdade) com localStorage
    const defaultProducts = getAllProducts()
    const stored = localStorage.getItem('products_catalog')
    const storedProducts = stored ? JSON.parse(stored) : []

    // Pega IDs do localStorage para não perder edições manuais
    const storedById = {}
    storedProducts.forEach(p => { storedById[p.id] = p })

    // Mescla: catalog.js como base + substitui se usuário editou no localStorage
    const merged = defaultProducts.map(p => storedById[p.id] ? storedById[p.id] : p)

    // Adiciona produtos extras que vieram do Extrator (IDs maiores que catalog.js)
    const maxDefaultId = Math.max(...defaultProducts.map(p => p.id), 0)
    const extras = storedProducts.filter(p => p.id > maxDefaultId)

    const final = [...merged, ...extras]
    setProducts(final)
    saveToStorage(final)
  }, [])

  const saveToStorage = (data) => {
    localStorage.setItem('products_catalog', JSON.stringify(data))
  }

  const openAddModal = () => {
    setFormData({ id: null, nome: '', preco: '', imagem: '', link: '' })
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
    setFormData({ id: null, nome: '', preco: '', imagem: '', link: '' })
  }

  const handleDelete = (id) => {
    if (confirm('Tem certeza que quer deletar?')) {
      const updated = products.filter(p => p.id !== id)
      setProducts(updated)
      saveToStorage(updated)
    }
  }

  const filtered = products.filter(p =>
    p.nome.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ flex: 1, background: t.bg, borderRadius: 12, display: 'flex', overflow: 'hidden', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${t.border}`, background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: t.text }}>📦 Catálogo Estático</h2>
          <p style={{ margin: '4px 0 0 0', fontSize: 12, color: t.textMuted }}>Gerenciar produtos</p>
        </div>
        <button
          onClick={openAddModal}
          style={{
            background: '#0EC331',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '10px 16px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          ➕ Adicionar Produto
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '12px 20px', borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
        <input
          type="text"
          placeholder="Buscar produto..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%',
            borderRadius: 6,
            border: `1px solid ${t.border}`,
            padding: '8px 12px',
            fontSize: 12,
            background: t.bgSecondary,
            color: t.text,
            outline: 'none'
          }}
        />
      </div>

      {/* Tabela */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${t.border}` }}>
              <th style={{ textAlign: 'left', padding: '8px', color: t.textSecondary, fontWeight: 600 }}>ID</th>
              <th style={{ textAlign: 'left', padding: '8px', color: t.textSecondary, fontWeight: 600 }}>Produto</th>
              <th style={{ textAlign: 'left', padding: '8px', color: t.textSecondary, fontWeight: 600 }}>Preço</th>
              <th style={{ textAlign: 'left', padding: '8px', color: t.textSecondary, fontWeight: 600 }}>Imagem</th>
              <th style={{ textAlign: 'center', padding: '8px', color: t.textSecondary, fontWeight: 600 }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(product => (
              <tr key={product.id} style={{ borderBottom: `1px solid ${t.border}` }}>
                <td style={{ padding: '8px', color: t.text }}>{product.id}</td>
                <td style={{ padding: '8px', color: t.text }}>{product.nome}</td>
                <td style={{ padding: '8px', color: t.text }}>{product.preco}</td>
                <td style={{ padding: '8px' }}>
                  <a href={product.imagem} target="_blank" rel="noreferrer">
                    <img
                      src={product.imagem}
                      alt={product.nome}
                      style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, display: 'block' }}
                      onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'inline' }}
                    />
                    <span style={{ display: 'none', fontSize: 11, color: '#EF4444' }}>Sem foto</span>
                  </a>
                </td>
                <td style={{ padding: '8px', textAlign: 'center', display: 'flex', gap: 6, justifyContent: 'center' }}>
                  <button
                    onClick={() => openEditModal(product)}
                    style={{
                      background: '#3B82F6',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      padding: '4px 8px',
                      fontSize: 11,
                      cursor: 'pointer'
                    }}
                  >
                    ✏️ Editar
                  </button>
                  <button
                    onClick={() => handleDelete(product.id)}
                    style={{
                      background: '#EF4444',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      padding: '4px 8px',
                      fontSize: 11,
                      cursor: 'pointer'
                    }}
                  >
                    🗑️ Deletar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: t.bg, borderRadius: 12, padding: '24px', maxWidth: 500, width: '90%', maxHeight: '80vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 700, color: t.text }}>
              {editingId ? '✏️ Editar Produto' : '➕ Novo Produto'}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: t.textMuted, marginBottom: 4 }}>Nome</label>
                <input
                  type="text"
                  value={formData.nome}
                  onChange={e => setFormData({ ...formData, nome: e.target.value })}
                  style={{
                    width: '100%',
                    borderRadius: 6,
                    border: `1px solid ${t.border}`,
                    padding: '8px 12px',
                    fontSize: 12,
                    background: t.bgSecondary,
                    color: t.text,
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  placeholder="Ex: Tenis Nike Dunk"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: t.textMuted, marginBottom: 4 }}>Preço</label>
                <input
                  type="text"
                  value={formData.preco}
                  onChange={e => setFormData({ ...formData, preco: e.target.value })}
                  style={{
                    width: '100%',
                    borderRadius: 6,
                    border: `1px solid ${t.border}`,
                    padding: '8px 12px',
                    fontSize: 12,
                    background: t.bgSecondary,
                    color: t.text,
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  placeholder="Ex: R$ 459,00"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: t.textMuted, marginBottom: 4 }}>URL da Imagem</label>
                <input
                  type="text"
                  value={formData.imagem}
                  onChange={e => setFormData({ ...formData, imagem: e.target.value })}
                  style={{
                    width: '100%',
                    borderRadius: 6,
                    border: `1px solid ${t.border}`,
                    padding: '8px 12px',
                    fontSize: 12,
                    background: t.bgSecondary,
                    color: t.text,
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  placeholder="https://..."
                />
                {formData.imagem && (
                  <img
                    src={formData.imagem}
                    alt="preview"
                    style={{ marginTop: 8, maxWidth: '100%', maxHeight: 150, borderRadius: 6 }}
                    onError={e => e.target.style.display = 'none'}
                  />
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: t.textMuted, marginBottom: 4 }}>Link do Produto</label>
                <input
                  type="text"
                  value={formData.link}
                  onChange={e => setFormData({ ...formData, link: e.target.value })}
                  style={{
                    width: '100%',
                    borderRadius: 6,
                    border: `1px solid ${t.border}`,
                    padding: '8px 12px',
                    fontSize: 12,
                    background: t.bgSecondary,
                    color: t.text,
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  placeholder="https://primestoremen.com.br/..."
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  flex: 1,
                  background: t.bgSecondary,
                  color: t.text,
                  border: `1px solid ${t.border}`,
                  borderRadius: 6,
                  padding: '10px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                style={{
                  flex: 1,
                  background: '#0EC331',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '10px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
