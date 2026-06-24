import { useState, useEffect } from 'react'
import { useTheme } from '../theme.jsx'
import { getProductsFromSupabase, upsertProducts, uploadImageToStorage, deleteProductFromSupabase, getCatalogHistory } from '../services/catalogSyncService'
import { extractProductData, normalizeExtractedData } from '../services/scraperService'

export default function CatalogPage() {
  const { theme: t } = useTheme()
  const [products, setProducts] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('Todos')
  const [copyFeedback, setCopyFeedback] = useState(null)
  const [formData, setFormData] = useState({ id: null, nome: '', preco: '', price_original: '', price_discount: '', imagem: '', link: '', categoria: '', status: 'active', codigo: '' })
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [sortBy, setSortBy] = useState('default')
  const [categoriesList, setCategoriesList] = useState([])
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [imagemFile, setImagemFile] = useState(null)
  const [imagemPreview, setImagemPreview] = useState(null)
  const [showUrlModal, setShowUrlModal] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState('')
  const [extractedData, setExtractedData] = useState(null)
  const [urlImageFile, setUrlImageFile] = useState(null)
  const [urlImagePreview, setUrlImagePreview] = useState(null)
  // Modal de TESTE (novo)
  const [showUrlTestModal, setShowUrlTestModal] = useState(false)
  const [testUrlInput, setTestUrlInput] = useState('')
  const [testExtracting, setTestExtracting] = useState(false)
  const [testExtractError, setTestExtractError] = useState('')
  const [testExtractedData, setTestExtractedData] = useState(null)
  const [testImageFile, setTestImageFile] = useState(null)
  const [testImagePreview, setTestImagePreview] = useState(null)
  // Histórico do catálogo
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [sortByFilter, setSortByFilter] = useState('default') // 'default', 'lastAdded'

  const loadProducts = async () => {
    const supabaseProducts = await getProductsFromSupabase()
    setProducts(supabaseProducts)
    saveToStorage(supabaseProducts)
    // Limpar categorias órfãs do localStorage
    localStorage.removeItem('test_category')
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await loadProducts()
    setTimeout(() => setIsRefreshing(false), 1000)
  }

  const handleOpenHistory = async () => {
    setShowHistoryModal(true)
    if (history.length === 0) {
      await loadHistory()
    }
  }

  useEffect(() => {
    loadProducts()
  }, [])

  useEffect(() => {
    if (showModal && products.length > 0) {
      // Extrair categorias únicas dos produtos
      const cats = Array.from(new Set(products.map(p => p.categoria).filter(Boolean))).sort()
      setCategoriesList(cats)
      setShowNewCategoryInput(false)
      setNewCategory('')
    }
  }, [showModal, products])

  const saveToStorage = (data) => {
    localStorage.setItem('products_catalog', JSON.stringify(data))
  }

  const openAddModal = () => {
    setFormData({ id: null, nome: '', preco: '', price_original: '', price_discount: '', imagem: '', link: '', categoria: '', status: 'active', codigo: '' })
    setEditingId(null)
    setImagemFile(null)
    setImagemPreview(null)
    setShowModal(true)
  }

  const openEditModal = (product) => {
    setFormData({
      ...product,
      price_original: product.price_original || '',
      price_discount: product.price_discount || ''
    })
    setEditingId(product.id)
    setImagemFile(null)
    setImagemPreview(product.imagem || null)
    setShowModal(true)
  }

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      setImagemFile(file)
      // Gerar preview
      const reader = new FileReader()
      reader.onload = (event) => {
        setImagemPreview(event.target?.result)
        setFormData({ ...formData, imagem: file.name })
      }
      reader.readAsDataURL(file)
    }
  }

  const handleExtractFromUrl = async () => {
    if (!urlInput.trim()) {
      setExtractError('Colar uma URL válida')
      return
    }

    setExtracting(true)
    setExtractError('')

    try {
      const extracted = await extractProductData(urlInput)

      if (!extracted || !extracted.nome) {
        setExtractError('❌ Não foi possível extrair dados. Tente digitar manualmente.')
        setExtracting(false)
        return
      }

      console.log('✅ Dados extraídos:', extracted)

      // Guardar dados extraídos para ajuste
      setExtractedData(extracted)
      setExtractError('')

    } catch (err) {
      console.error('Erro:', err)
      setExtractError('❌ Erro ao extrair dados: ' + err.message)
    } finally {
      setExtracting(false)
    }
  }

  const handleConfirmExtractedData = async () => {
    // Normalizar dados
    const normalized = normalizeExtractedData(extractedData)

    // Preencher formulário
    setFormData(normalized)
    // Imagem é opcional - seleciona depois no modal principal se necessário
    if (urlImageFile) {
      setImagemFile(urlImageFile)
      setImagemPreview(urlImagePreview)
    }

    // Carregar categorias atualizadas
    const cats = Array.from(new Set(products.map(p => p.categoria).filter(Boolean))).sort()
    setCategoriesList(cats)

    // Fechar modal de URL e abrir modal de edição
    setShowUrlModal(false)
    setUrlInput('')
    setExtractedData(null)
    setUrlImageFile(null)
    setUrlImagePreview(null)
    setShowModal(true)

    console.log('✅ Pronto para salvar! (Imagem é opcional)')
  }

  const handleUrlImageSelect = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      setUrlImageFile(file)
      const reader = new FileReader()
      reader.onload = (event) => {
        setUrlImagePreview(event.target?.result)
      }
      reader.readAsDataURL(file)
    }
  }

  // NOVO: Funções para MODAL DE TESTE
  const handleExtractFromUrlTest = async () => {
    if (!testUrlInput.trim()) {
      setTestExtractError('Colar uma URL válida')
      return
    }

    setTestExtracting(true)
    setTestExtractError('')

    try {
      const extracted = await extractProductData(testUrlInput)

      if (!extracted || !extracted.nome) {
        setTestExtractError('❌ Não foi possível extrair dados.')
        setTestExtracting(false)
        return
      }

      console.log('✅ [TESTE] Dados extraídos:', extracted)

      // Se tiver imagem, fazer download
      if (extracted.imagem) {
        try {
          const imgResponse = await fetch(extracted.imagem)
          const blob = await imgResponse.blob()
          const file = new File([blob], 'produto-imagem.jpg', { type: blob.type })
          setTestImageFile(file)
          const reader = new FileReader()
          reader.onload = (event) => {
            setTestImagePreview(event.target?.result)
          }
          reader.readAsDataURL(blob)
          console.log('✅ [TESTE] Imagem baixada')
        } catch (err) {
          console.warn('[TESTE] Erro ao baixar imagem:', err.message)
        }
      }

      setTestExtractedData(extracted)
      setTestExtractError('')

    } catch (err) {
      console.error('[TESTE] Erro:', err)
      setTestExtractError('❌ Erro ao extrair: ' + err.message)
    } finally {
      setTestExtracting(false)
    }
  }

  const handleConfirmTestData = async () => {
    if (!testExtractedData) return

    const normalized = {
      nome: testExtractedData.nome || '',
      preco: testExtractedData.preco || '',
      price_original: testExtractedData.price_original || '',
      price_discount: testExtractedData.price_discount || '',
      imagem: testExtractedData.imagem || '',
      categoria: '',
      link: testExtractedData.link || testUrlInput,
      status: 'active',
      codigo: ''
    }

    setFormData(normalized)
    if (testImageFile) {
      setImagemFile(testImageFile)
      setImagemPreview(testImagePreview)
    }

    // Fechar modal de teste e abrir formulário
    setShowUrlTestModal(false)
    setTestUrlInput('')
    setTestExtractedData(null)
    setTestImageFile(null)
    setTestImagePreview(null)
    setShowModal(true)

    console.log('✅ [TESTE] Pronto para salvar com foto!')
  }

  const handleSave = async () => {
    if (!formData.nome || !formData.preco || !formData.link) {
      alert('Preencha nome, preço e link!')
      return
    }

    // Verificar se produto com mesmo nome já existe
    const produtoExistente = products.find(p => p.nome.toLowerCase() === formData.nome.toLowerCase() && p.id !== formData.id)
    if (produtoExistente) {
      const confirmar = confirm(`⚠️ Produto "${formData.nome}" já existe!\n\n✏️ Deseja editar o existente?\n\nClique "OK" para editar, "Cancelar" para adicionar novo mesmo assim.`)
      if (confirmar) {
        openEditModal(produtoExistente)
        return
      }
    }

    // Upload da imagem se arquivo foi selecionado
    let imagemUrl = formData.imagem
    if (imagemFile) {
      try {
        console.log('📤 Fazendo upload da imagem...')
        imagemUrl = await uploadImageFile(imagemFile, formData.nome)
        if (!imagemUrl) {
          alert('Erro ao fazer upload da imagem. Tente novamente.')
          return
        }
      } catch (err) {
        console.error('Erro no upload:', err)
        alert('Erro ao fazer upload: ' + err.message)
        return
      }
    }

    // Atualizar formData com URL da imagem
    const dataComImagem = { ...formData, imagem: imagemUrl }

    let updated
    let newId = null
    let productToSync = { ...dataComImagem }

    if (editingId) {
      // EDIÇÃO: preserva o ID original
      productToSync = { ...dataComImagem, id: editingId }
      updated = products.map(p => p.id === editingId ? productToSync : p)
    } else {
      // NOVO: gera ID local temporário
      const validIds = products.map(p => p.id).filter(id => typeof id === 'number' && !isNaN(id))
      newId = validIds.length > 0 ? Math.max(...validIds) + 1 : 1
      productToSync = { ...dataComImagem, id: newId }
      updated = [...products, productToSync]
    }
    setProducts(updated)
    saveToStorage(updated)

    const isNewProduct = !editingId
    const successMessage = isNewProduct ? '✅ Produto adicionado com sucesso!' : '✅ Produto atualizado com sucesso!'
    alert(successMessage)

    // Sincronizar APENAS este produto com Supabase (não toda a lista)
    try {
      const result = await upsertProducts([productToSync])
      console.log('[CatalogPage] Resultado upsert:', result)

      // Se foi inserido novo produto, atualizar localmente com UUID do Supabase
      if (isNewProduct && result?.success === true && result?.inserted > 0 && result?.produtos?.[0]?.supabaseId) {
        const supabaseId = result.produtos[0].supabaseId
        const updatedLocal = updated.map(p =>
          p.id === newId ? { ...p, id: supabaseId } : p
        )
        setProducts(updatedLocal)
        saveToStorage(updatedLocal)
        console.log('[CatalogPage] ✅ UUID atualizado:', supabaseId)
      }

      if (result?.success === false) {
        console.error('Erro ao sincronizar:', result.error)
        alert('⚠️ Erro ao sincronizar com Supabase: ' + (result.error || 'Desconhecido'))
      } else if (result?.success === true) {
        console.log('✅ Sincronizado com Supabase:', result.inserted, 'inseridos,', result.updated, 'atualizados')
      }
    } catch (err) {
      console.error('Erro na sincronização:', err)
      alert('⚠️ Erro: ' + err.message)
    }

    setShowModal(false)
    setFormData({ id: null, nome: '', preco: '', price_original: '', price_discount: '', imagem: '', link: '', categoria: '', status: 'active', codigo: '' })
    setImagemFile(null)
    setImagemPreview(null)
  }

  // Upload de arquivo de imagem
  async function uploadImageFile(file, productName) {
    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
      const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY

      // Converter arquivo para blob
      const blob = file instanceof Blob ? file : await file.arrayBuffer().then(b => new Blob([b], { type: file.type }))

      // Gerar nome único do arquivo com extensão correta
      const ext = file.type === 'image/webp' ? 'webp' : 'jpg'
      const fileName = `${productName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${Date.now()}.${ext}`

      console.log(`📤 Fazendo upload: ${fileName} (${(blob.size / 1024).toFixed(2)}KB)`)

      // Fazer upload
      const uploadRes = await fetch(
        `${SUPABASE_URL}/storage/v1/object/produtos/${fileName}`,
        {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': file.type || 'image/jpeg',
          },
          body: blob,
        }
      )

      if (!uploadRes.ok) {
        const error = await uploadRes.text()
        console.error('Erro no upload:', uploadRes.status, error)
        return null
      }

      // Retornar URL pública
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/produtos/${fileName}`
      console.log('✅ Imagem salva:', fileName)
      return publicUrl
    } catch (e) {
      console.error('Erro:', e.message)
      return null
    }
  }

  const handleDelete = async (id) => {
    if (confirm('Tem certeza que quer deletar?')) {
      const produtoADeletar = products.find(p => p.id === id)
      const produtoNome = produtoADeletar?.nome || 'Desconhecido'
      const updated = products.filter(p => p.id !== id)
      setProducts(updated)
      saveToStorage(updated)
      alert('✅ Produto deletado localmente!')

      // Sincronizar deleção APENAS deste produto com Supabase
      try {
        const result = await deleteProductFromSupabase(id, produtoNome)
        if (result.success) {
          console.log('✅ Produto deletado do Supabase')
        } else {
          console.error('Erro ao deletar:', result.error)
          alert('⚠️ Erro ao deletar do Supabase: ' + (result.error || 'Desconhecido'))
        }
      } catch (err) {
        console.error('Erro na sincronização:', err)
        alert('⚠️ Erro: ' + err.message)
      }
    }
  }

  // Categorias únicas
  const categories = ['Todos', ...Array.from(new Set(products.map(p => p.categoria).filter(Boolean))).sort()]

  const parsePreco = (preco) => {
    const str = String(preco || '0').replace('R$', '').trim().replace(/\./g, '').replace(',', '.')
    return parseFloat(str) || 0
  }

  // Formatar preço enquanto digita: "449" → "R$ 449,00"
  const formatPrice = (value) => {
    if (!value) return ''
    // Remove tudo que não é número
    const numStr = String(value).replace(/\D/g, '')
    if (!numStr) return ''
    // Converte para número e formata
    const num = parseInt(numStr, 10) / 100
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num)
  }

  const handlePriceChange = (field, value) => {
    // Apenas 'preco' recebe formatação com R$
    // 'price_original' e 'price_discount' recebem apenas números
    if (field === 'preco') {
      const formatted = formatPrice(value)
      setFormData({ ...formData, [field]: formatted })
    } else {
      // Para price_original e price_discount: apenas números
      const numOnly = String(value).replace(/\D/g, '')
      setFormData({ ...formData, [field]: numOnly })
    }
  }

  const filtered = products
    .filter(p => {
      const matchSearch = p.nome.toLowerCase().includes(search.toLowerCase())
      const matchCat = activeCategory === 'Todos' || p.categoria === activeCategory
      return matchSearch && matchCat
    })
    .sort((a, b) => {
      if (sortBy === 'lastAdded') {
        // Ordenar por data mais recente primeiro (últimos adicionados)
        return new Date(b.synced_at || 0) - new Date(a.synced_at || 0)
      }
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
          <button
            onClick={() => setShowUrlModal(true)}
            style={{ background: '#3B82F6', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            📎 Adicionar via URL
          </button>
          <button
            onClick={() => setShowUrlTestModal(true)}
            style={{ background: '#F59E0B', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            title="Versão de teste - extrai foto automaticamente"
          >
            🧪 URL (TESTE)
          </button>
          <button
            onClick={handleOpenHistory}
            style={{ background: '#8B5CF6', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            title="Ver histórico de ações"
          >
            📊 Histórico
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
            <option value="lastAdded">📊 Últimos Adicionados</option>
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
                { label: 'Nome *', key: 'nome', placeholder: 'Ex: Tenis Nike Dunk', required: true },
                { label: 'Preço *', key: 'preco', placeholder: 'Ex: R$ 459,00', required: true },
                { label: 'Categoria *', key: 'categoria', type: 'categoria-select', required: true },
                { label: 'Preço Original', key: 'price_original', placeholder: 'Ex: 599.90 (sem formatação)', type: 'number' },
                { label: 'Preço com Desconto', key: 'price_discount', placeholder: 'Ex: 459.90 (sem formatação)', type: 'number' },
                { label: 'Código/SKU', key: 'codigo', placeholder: 'Ex: NIKE-001' },
                { label: 'Status', key: 'status', type: 'select', options: [{ value: 'active', label: 'Ativo' }, { value: 'inactive', label: 'Inativo' }] },
                { label: 'Imagem', key: 'imagem', type: 'image-upload' },
                { label: 'Link do Produto *', key: 'link', placeholder: 'https://primestoremen.com.br/...', required: true },
              ].map(({ label, key, placeholder, type, options, required }) => (
                <div key={key}>
                  <label style={{ display: 'block', fontSize: 12, color: t.textMuted, marginBottom: 4 }}>{label}</label>
                  {type === 'categoria-select' ? (
                    <>
                      {!showNewCategoryInput ? (
                        <>
                          <select
                            value={formData[key] || ''}
                            onChange={e => {
                              if (e.target.value === '__nova__') {
                                setShowNewCategoryInput(true)
                              } else {
                                setFormData({ ...formData, [key]: e.target.value })
                              }
                            }}
                            style={{ width: '100%', borderRadius: 6, border: `1px solid ${t.border}`, padding: '8px 12px', fontSize: 12, background: t.bgSecondary, color: t.text, outline: 'none', boxSizing: 'border-box' }}
                          >
                            <option value="">— Selecione uma categoria —</option>
                            {categoriesList.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            <option value="__nova__">➕ Criar nova categoria</option>
                          </select>
                        </>
                      ) : (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input
                            type="text"
                            value={newCategory}
                            onChange={e => setNewCategory(e.target.value)}
                            placeholder="Nova categoria..."
                            style={{ flex: 1, borderRadius: 6, border: `1px solid ${t.border}`, padding: '8px 12px', fontSize: 12, background: t.bgSecondary, color: t.text, outline: 'none', boxSizing: 'border-box' }}
                            autoFocus
                          />
                          <button
                            onClick={() => {
                              if (newCategory.trim()) {
                                setFormData({ ...formData, [key]: newCategory })
                                setCategoriesList([...categoriesList, newCategory].sort())
                                setShowNewCategoryInput(false)
                                setNewCategory('')
                              }
                            }}
                            style={{ background: '#0EC331', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                          >
                            ✓
                          </button>
                          <button
                            onClick={() => {
                              setShowNewCategoryInput(false)
                              setNewCategory('')
                            }}
                            style={{ background: t.bgSecondary, color: t.text, border: `1px solid ${t.border}`, borderRadius: 6, padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </>
                  ) : type === 'image-upload' ? (
                    <>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageSelect}
                          style={{ flex: 1, borderRadius: 6, border: `1px solid ${t.border}`, padding: '8px 12px', fontSize: 12, background: t.bgSecondary, color: t.text, outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}
                        />
                      </div>
                      {imagemPreview && (
                        <img src={imagemPreview} alt="preview" style={{ marginTop: 8, maxWidth: '100%', maxHeight: 150, borderRadius: 6, objectFit: 'cover' }} />
                      )}
                    </>
                  ) : type === 'select' ? (
                    <select
                      value={formData[key] || ''}
                      onChange={e => setFormData({ ...formData, [key]: e.target.value })}
                      style={{ width: '100%', borderRadius: 6, border: `1px solid ${t.border}`, padding: '8px 12px', fontSize: 12, background: t.bgSecondary, color: t.text, outline: 'none', boxSizing: 'border-box' }}
                    >
                      {options?.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  ) : (
                    <input
                      type={type || 'text'}
                      value={formData[key] || ''}
                      onChange={e => {
                        // Formatar preço automaticamente para campos de preço
                        if (['preco', 'price_original', 'price_discount'].includes(key)) {
                          handlePriceChange(key, e.target.value)
                        } else {
                          setFormData({ ...formData, [key]: e.target.value })
                        }
                      }}
                      style={{ width: '100%', borderRadius: 6, border: `1px solid ${t.border}`, padding: '8px 12px', fontSize: 12, background: t.bgSecondary, color: t.text, outline: 'none', boxSizing: 'border-box', cursor: 'text' }}
                      placeholder={placeholder}
                      disabled={false}
                    />
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

      {/* Modal de Extração via URL */}
      {showUrlModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: t.bg, borderRadius: 12, padding: '24px', maxWidth: 500, width: '90%', maxHeight: '80vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 700, color: t.text }}>
              📎 Adicionar Produto via URL
            </h3>

            {!extractedData ? (
              // ESTADO 1: Extração
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: t.textMuted, marginBottom: 4 }}>
                    Cole a URL do produto
                  </label>
                  <input
                    type="text"
                    value={urlInput}
                    onChange={e => setUrlInput(e.target.value)}
                    placeholder="https://www.primestoremen.com.br/tenis-new-balance-9060"
                    style={{ width: '100%', borderRadius: 6, border: `1px solid ${t.border}`, padding: '8px 12px', fontSize: 12, background: t.bgSecondary, color: t.text, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                {extractError && (
                  <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 6, padding: '8px 12px', fontSize: 11 }}>
                    {extractError}
                  </div>
                )}

                <div style={{ background: t.bgSecondary, borderRadius: 6, padding: '10px', fontSize: 11, color: t.textMuted }}>
                  💡 O sistema vai extrair: <strong>nome, preços (original + desconto) e categoria</strong>. Você faz upload da foto e confirma.
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => {
                      setShowUrlModal(false)
                      setUrlInput('')
                      setExtractError('')
                      setExtractedData(null)
                    }}
                    style={{ flex: 1, background: t.bgSecondary, color: t.text, border: `1px solid ${t.border}`, borderRadius: 6, padding: '10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleExtractFromUrl}
                    disabled={extracting}
                    style={{ flex: 1, background: '#3B82F6', color: '#fff', border: 'none', borderRadius: 6, padding: '10px', fontSize: 12, fontWeight: 600, cursor: extracting ? 'wait' : 'pointer', opacity: extracting ? 0.7 : 1 }}
                  >
                    {extracting ? '⏳ Extraindo...' : '🔍 Extrair Dados'}
                  </button>
                </div>
              </div>
            ) : (
              // ESTADO 2: Ajuste + Upload de Imagem
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ background: '#ECFDF5', borderRadius: 6, padding: '10px', fontSize: 11, color: '#059669' }}>
                  ✅ Dados extraídos com sucesso! Agora faça upload da imagem.
                </div>

                {/* Preview dos dados extraídos */}
                <div style={{ background: t.bgSecondary, borderRadius: 6, padding: '10px', fontSize: 11 }}>
                  <div style={{ marginBottom: 6 }}>
                    <strong>Nome:</strong> {extractedData.nome}
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <strong>Preço:</strong> {extractedData.price_discount}
                    {extractedData.price_original && ` (de ${extractedData.price_original})`}
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <strong>Categoria:</strong> {extractedData.categoria || 'Sem categoria'}
                  </div>
                  <div>
                    <strong>Link:</strong> <a href={extractedData.link} target="_blank" rel="noreferrer" style={{ color: '#3B82F6', textDecoration: 'none', fontSize: 10 }}>Ver página</a>
                  </div>
                </div>

                {/* Upload de Imagem */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: t.textMuted, marginBottom: 4 }}>
                    📸 Upload da Imagem *
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleUrlImageSelect}
                    style={{ width: '100%', borderRadius: 6, border: `1px solid ${t.border}`, padding: '8px 12px', fontSize: 12, background: t.bgSecondary, color: t.text, outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}
                  />
                  {urlImagePreview && (
                    <img src={urlImagePreview} alt="preview" style={{ marginTop: 8, maxWidth: '100%', maxHeight: 150, borderRadius: 6, objectFit: 'cover' }} />
                  )}
                </div>

                {extractError && (
                  <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 6, padding: '8px 12px', fontSize: 11 }}>
                    {extractError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => {
                      setExtractedData(null)
                      setUrlInput('')
                      setUrlImageFile(null)
                      setUrlImagePreview(null)
                      setExtractError('')
                    }}
                    style={{ flex: 1, background: t.bgSecondary, color: t.text, border: `1px solid ${t.border}`, borderRadius: 6, padding: '10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Voltar
                  </button>
                  <button
                    onClick={handleConfirmExtractedData}
                    disabled={!urlImageFile}
                    style={{ flex: 1, background: '#0EC331', color: '#fff', border: 'none', borderRadius: 6, padding: '10px', fontSize: 12, fontWeight: 600, cursor: urlImageFile ? 'pointer' : 'not-allowed', opacity: urlImageFile ? 1 : 0.5 }}
                  >
                    ✅ Confirmar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de TESTE: Adicionar via URL c/ Foto Automática */}
      {showUrlTestModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: t.bg, borderRadius: 12, padding: '24px', maxWidth: 500, width: '90%', maxHeight: '80vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 700, color: t.text }}>
              🧪 Adicionar via URL (TESTE) - Foto Automática
            </h3>

            {!testExtractedData ? (
              // ESTADO 1: Extração
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: t.textMuted, marginBottom: 4 }}>
                    Cole a URL do produto
                  </label>
                  <input
                    type="text"
                    value={testUrlInput}
                    onChange={e => setTestUrlInput(e.target.value)}
                    placeholder="https://www.primestoremen.com.br/tenis-new-balance-9060"
                    style={{ width: '100%', borderRadius: 6, border: `1px solid ${t.border}`, padding: '8px 12px', fontSize: 12, background: t.bgSecondary, color: t.text, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                {testExtractError && (
                  <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 6, padding: '8px 12px', fontSize: 11 }}>
                    {testExtractError}
                  </div>
                )}

                <div style={{ background: '#FEF3C7', borderRadius: 6, padding: '10px', fontSize: 11, color: '#92400E' }}>
                  ⚠️ <strong>TESTE:</strong> Extrai nome, preço e <strong>FOTO automaticamente</strong>. Categoria você seleciona depois.
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => {
                      setShowUrlTestModal(false)
                      setTestUrlInput('')
                      setTestExtractError('')
                      setTestExtractedData(null)
                      setTestImageFile(null)
                      setTestImagePreview(null)
                    }}
                    style={{ flex: 1, background: t.bgSecondary, color: t.text, border: `1px solid ${t.border}`, borderRadius: 6, padding: '10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleExtractFromUrlTest}
                    disabled={testExtracting}
                    style={{ flex: 1, background: '#F59E0B', color: '#fff', border: 'none', borderRadius: 6, padding: '10px', fontSize: 12, fontWeight: 600, cursor: testExtracting ? 'wait' : 'pointer', opacity: testExtracting ? 0.7 : 1 }}
                  >
                    {testExtracting ? '⏳ Extraindo...' : '🔍 Extrair + Foto'}
                  </button>
                </div>
              </div>
            ) : (
              // ESTADO 2: Preview + Confirmar
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ background: '#ECFDF5', borderRadius: 6, padding: '10px', fontSize: 11, color: '#059669' }}>
                  ✅ Dados + Foto extraídos! Confirme para prosseguir.
                </div>

                {/* Preview dos dados extraídos */}
                <div style={{ background: t.bgSecondary, borderRadius: 6, padding: '10px', fontSize: 11 }}>
                  <div style={{ marginBottom: 6 }}>
                    <strong>Nome:</strong> {testExtractedData.nome}
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <strong>Preço:</strong> {testExtractedData.preco}
                    {testExtractedData.price_original && ` (de ${testExtractedData.price_original})`}
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <strong>Link:</strong> <a href={testExtractedData.link} target="_blank" rel="noreferrer" style={{ color: '#3B82F6', textDecoration: 'none', fontSize: 10 }}>Ver página</a>
                  </div>
                </div>

                {/* Preview da Imagem */}
                {testImagePreview && (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: t.textMuted, marginBottom: 4 }}>
                      📸 Foto Extraída
                    </label>
                    <img src={testImagePreview} alt="preview" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 6, objectFit: 'cover' }} />
                  </div>
                )}

                {testExtractError && (
                  <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 6, padding: '8px 12px', fontSize: 11 }}>
                    {testExtractError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => {
                      setTestExtractedData(null)
                      setTestUrlInput('')
                      setTestImageFile(null)
                      setTestImagePreview(null)
                      setTestExtractError('')
                    }}
                    style={{ flex: 1, background: t.bgSecondary, color: t.text, border: `1px solid ${t.border}`, borderRadius: 6, padding: '10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Voltar
                  </button>
                  <button
                    onClick={handleConfirmTestData}
                    style={{ flex: 1, background: '#0EC331', color: '#fff', border: 'none', borderRadius: 6, padding: '10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    ✅ Confirmar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de Histórico */}
      {showHistoryModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: t.bg, borderRadius: 12, padding: '24px', maxWidth: 600, width: '90%', maxHeight: '80vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 700, color: t.text }}>
              📊 Histórico do Catálogo
            </h3>

            {loadingHistory ? (
              <div style={{ padding: '20px', textAlign: 'center', color: t.textMuted }}>
                ⏳ Carregando histórico...
              </div>
            ) : history.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: t.textMuted }}>
                📭 Nenhuma ação registrada ainda
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {history.map((h, idx) => (
                  <div key={idx} style={{ padding: '10px 12px', background: t.bgSecondary, borderRadius: 6, fontSize: 11, borderLeft: `3px solid ${h.action === 'add' ? '#0EC331' : h.action === 'delete' ? '#DC2626' : '#3B82F6'}` }}>
                    <div style={{ fontWeight: 600, color: t.text, marginBottom: 4 }}>
                      {h.action === 'add' ? '➕ Adicionado' : h.action === 'delete' ? '🗑️ Deletado' : '✏️ Editado'}: {h.produto_nome}
                    </div>
                    <div style={{ color: t.textMuted }}>
                      {h.timestamp.toLocaleString('pt-BR')}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button
                onClick={() => setShowHistoryModal(false)}
                style={{ flex: 1, background: '#0EC331', color: '#fff', border: 'none', borderRadius: 6, padding: '10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                ✓ Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
