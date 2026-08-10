import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTheme } from '../theme.jsx'
import { getProductsFromSupabase, upsertProducts, uploadImageToStorage, deleteProductFromSupabase, getCatalogHistory, normalizarNomeProduto } from '../services/catalogo/catalogSyncService'
import { extractProductData, normalizeExtractedData } from '../services/catalogo/scraperService'
import { regenerateKnowledgeUnico } from '../services/conhecimento/knowledgeGenerator'
import { loadCatalogV1Data } from '../services/catalogo/catalogV1Data'
import { derivarStatusCatalogo } from '../services/catalogo/catalogV1Status'
import { formatCatalogSyncDate, formatPixLabel, formatStockSummary } from '../services/catalogo/catalogV1Format'
import SupabaseStorageCard from '../components/SupabaseStorageCard'
import SyncStatusBadge from '../components/catalogo/SyncStatusBadge'
import OrigemBadge from '../components/catalogo/OrigemBadge'
import ProdutoDrawer from '../components/catalogo/ProdutoDrawer'

export default function CatalogPage({ onNavigate, initialOpenProductId, onInitialProductConsumed }) {
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
  const [loadingSync, setLoadingSync] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  // Status do Knowledge: 'updated' | 'pending' | 'syncing'
  const [knowledgeStatus, setKnowledgeStatus] = useState(() => {
    return localStorage.getItem('knowledge_status') || 'updated'
  })
  const debounceRef = useRef(null)
  // Catálogo V1 — Fase 2: status de sincronização por produto (id → resultado
  // de derivarStatusCatalogo). Nenhuma regra de prioridade fica inline aqui —
  // só consome catalogV1Data + catalogV1Status.
  const [syncStatusById, setSyncStatusById] = useState(new Map())
  // Catálogo V1 — Fase 3: dados enriquecidos por produto (origem, PIX, última
  // sync, resumo de estoque/variações) — id → objeto já formatado pelos
  // helpers de catalogV1Format.js. Mesma busca da Fase 2 (catalogV1Data),
  // sem query adicional por linha.
  const [catalogV1RowInfoById, setCatalogV1RowInfoById] = useState(new Map())
  // Catálogo V1 — Fase 4: filtros de situação + "mais filtros", 100%
  // client-side sobre os dados já carregados por catalogV1Data (nenhuma
  // query nova ao trocar filtro).
  const [quickFilter, setQuickFilter] = useState('todos') // 'todos'|'sincronizados'|'manuais'|'com_excecao'|'atualizados'
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const [filterMarca, setFilterMarca] = useState('')
  const [filterComVariacoes, setFilterComVariacoes] = useState(false)
  const [filterSemEstoque, setFilterSemEstoque] = useState(false)
  const [filterVendaSemEstoque, setFilterVendaSemEstoque] = useState(false)
  // Catálogo V1 — Fase 5: produto selecionado pro ProdutoDrawer (null = fechado).
  // A página só controla "qual" e "aberto/fechado" — toda a lógica de exibição
  // e a busca de variações sob demanda vivem dentro do componente.
  const [selectedProductForDrawer, setSelectedProductForDrawer] = useState(null)
  // Auditoria Bagy V2 — Fase 6: "Ver no Catálogo" abre o drawer de 1 produto
  // específico ao chegar de fora (id vem da Auditoria). Só um aviso discreto
  // e transitório se o id não for encontrado — nunca quebra a página.
  const [initialProductNotFound, setInitialProductNotFound] = useState(false)

  // Marca knowledge como desatualizado e dispara sync com debounce de 60s
  const markKnowledgeDirty = useCallback(() => {
    setKnowledgeStatus('pending')
    localStorage.setItem('knowledge_status', 'pending')

    // Cancela timer anterior se houver (reset do debounce)
    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      setKnowledgeStatus('syncing')
      localStorage.setItem('knowledge_status', 'syncing')
      try {
        const result = await regenerateKnowledgeUnico()
        if (result.ok) {
          setKnowledgeStatus('updated')
          localStorage.setItem('knowledge_status', 'updated')
          console.log('[Knowledge] ✅ Auto-sync concluído:', result.mensagem)
        } else {
          setKnowledgeStatus('pending')
          localStorage.setItem('knowledge_status', 'pending')
          console.warn('[Knowledge] ⚠️ Erro no auto-sync:', result.erro)
        }
      } catch (err) {
        setKnowledgeStatus('pending')
        localStorage.setItem('knowledge_status', 'pending')
        console.error('[Knowledge] ❌ Falha no auto-sync:', err.message)
      }
      debounceRef.current = null
    }, 60000) // 60 segundos de debounce
  }, [])

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

  // Catálogo V1 — Fases 2+3: carrega produtos+variações+exceções UMA VEZ
  // (catalogV1Data) e deriva, por produto, tanto o status (Fase 2) quanto os
  // dados enriquecidos de apresentação (Fase 3: origem, PIX, última sync,
  // resumo de estoque) — guardados em dois Maps por id pra lookup O(1) na
  // tabela, sem nenhuma query adicional por linha. Não substitui
  // `products`/`loadProducts` — é um enriquecimento paralelo.
  useEffect(() => {
    loadCatalogV1Data()
      .then((v1) => {
        const statusMap = new Map()
        const rowInfoMap = new Map()
        for (const p of v1.products) {
          const excecoes = v1.exceptionsByLink.get(p.link) || []
          statusMap.set(p.id, derivarStatusCatalogo(p, excecoes))

          const aggregate = v1.variationAggregates.get(p.id)
          const { variationsLine, stockLine } = formatStockSummary(p.sell_without_stock, aggregate)
          rowInfoMap.set(p.id, {
            bagyProductId: p.bagy_product_id,
            source: p.source,
            pixLabel: formatPixLabel(p.preco_pix),
            syncedLabel: formatCatalogSyncDate(p.synced_at),
            variationsLine,
            stockLine,
            // Fase 4 — campos crus (não formatados) usados pelos filtros:
            marca: p.marca || null,
            syncedAtRaw: p.synced_at || null,
            sellWithoutStock: p.sell_without_stock,
            variationCount: aggregate?.variationCount || 0,
            stockTotal: aggregate?.stockTotal ?? null,
            hasStockData: aggregate?.hasStockData ?? false,
            // Fase 5 (ProdutoDrawer) — campos adicionais só usados no painel:
            precoPix: p.preco_pix,
            categoriaBreadcrumb: p.categoria_breadcrumb || null,
            descricao: p.descricao || null,
            codigo: p.codigo || null,
            exceptions: excecoes,
          })
        }
        setSyncStatusById(statusMap)
        setCatalogV1RowInfoById(rowInfoMap)
      })
      .catch((e) => console.error('[CatalogV1/Fase2-3] falha ao carregar dados enriquecidos:', e.message))
  }, [])

  // Auditoria Bagy V2 — Fase 6: abre o drawer automaticamente quando a página
  // chega com um productId pedido de fora (Auditoria). Reutiliza os `products`
  // já carregados — nenhuma query nova, zero N+1. Só dispara quando os
  // produtos já estão disponíveis (evita corrida com loadProducts()).
  useEffect(() => {
    if (!initialOpenProductId || products.length === 0) return
    const produto = products.find((p) => p.id === initialOpenProductId)
    if (produto) {
      setSelectedProductForDrawer(produto)
    } else {
      setInitialProductNotFound(true)
      setTimeout(() => setInitialProductNotFound(false), 5000)
    }
    onInitialProductConsumed?.()
  }, [initialOpenProductId, products])

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
    // Sempre tratar como criação de produto novo — evita reaproveitar
    // um editingId deixado por uma edição cancelada anteriormente
    setEditingId(null)

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

    // Sempre tratar como criação de produto novo — evita reaproveitar
    // um editingId deixado por uma edição cancelada anteriormente
    setEditingId(null)

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

    // Verificar se produto com mesmo nome já existe (exato)
    const produtoExistente = products.find(p => p.nome.toLowerCase() === formData.nome.toLowerCase() && p.id !== editingId)
    if (produtoExistente) {
      const confirmar = confirm(`⚠️ Produto "${formData.nome}" já existe!\n\n✏️ Deseja editar o existente?\n\nClique "OK" para editar, "Cancelar" para adicionar novo mesmo assim.`)
      if (confirmar) {
        openEditModal(produtoExistente)
        return
      }
    }

    // Verificar nomes similares (previne duplicata ao renomear)
    // Ex: salvar "Marrom Black" quando "Marrom" já existe no catálogo
    if (!editingId) {
      const nomeNovo = formData.nome.toLowerCase()
      const similares = products.filter(p => {
        const nomeExist = p.nome.toLowerCase()
        // Considera similar se um contém o outro e têm pelo menos 60% das palavras em comum
        const palavrasNovo = nomeNovo.split(/\s+/).filter(w => w.length > 2)
        const palavrasExist = nomeExist.split(/\s+/).filter(w => w.length > 2)
        const emComum = palavrasNovo.filter(w => palavrasExist.includes(w)).length
        const similaridade = emComum / Math.max(palavrasNovo.length, palavrasExist.length)
        return similaridade >= 0.6 && p.id !== editingId && nomeExist !== nomeNovo
      })

      if (similares.length > 0) {
        const lista = similares.slice(0, 3).map(p => `• ${p.nome}`).join('\n')
        const confirmar = confirm(
          `⚠️ ATENÇÃO: Encontrei ${similares.length} produto(s) com nome similar:\n\n${lista}\n\n` +
          `Você quer adicionar "${formData.nome}" como produto NOVO?\n\n` +
          `Clique "OK" para adicionar novo\nClique "Cancelar" para não adicionar`
        )
        if (!confirmar) return
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

    // Atualizar formData com URL da imagem — normaliza nome automaticamente
    const dataComImagem = { ...formData, imagem: imagemUrl, nome: normalizarNomeProduto(formData.nome) }

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

        // Marca knowledge como desatualizado — sync automático em 60s (debounce)
        markKnowledgeDirty()
      }
    } catch (err) {
      console.error('Erro na sincronização:', err)
      alert('⚠️ Erro: ' + err.message)
    }

    setShowModal(false)
    setEditingId(null)
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

  const handleSyncKnowledge = async () => {
    // Cancela debounce pendente para não sobrepor
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }

    setLoadingSync(true)
    setKnowledgeStatus('syncing')
    localStorage.setItem('knowledge_status', 'syncing')
    setSyncMessage('Sincronizando Knowledge Base...')

    try {
      const result = await regenerateKnowledgeUnico()

      if (result.ok) {
        setKnowledgeStatus('updated')
        localStorage.setItem('knowledge_status', 'updated')
        setSyncMessage(`✅ Knowledge sincronizado: ${result.totalProdutos} produtos (${result.duplicatasRemovidas} duplicatas removidas)`)
        setTimeout(() => setSyncMessage(''), 5000)
      } else {
        setKnowledgeStatus('pending')
        localStorage.setItem('knowledge_status', 'pending')
        setSyncMessage(`❌ Erro: ${result.erro}`)
      }
    } catch (err) {
      setKnowledgeStatus('pending')
      localStorage.setItem('knowledge_status', 'pending')
      setSyncMessage(`❌ Erro ao sincronizar: ${err.message}`)
    } finally {
      setLoadingSync(false)
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
          markKnowledgeDirty()
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

  const normalizeAccents = (str) => (str || '').normalize('NFD').replace(/[̀-ͯ]/g, '')

  // Catálogo V1 — Fase 4: 7 dias em ms, usado só pelo filtro "Atualizados".
  const SETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000

  const passaFiltroSituacao = useCallback((product, filtro) => {
    if (filtro === 'todos') return true
    const status = syncStatusById.get(product.id)?.status
    if (filtro === 'sincronizados') return status === 'synced'
    if (filtro === 'manuais') return status === 'manual'
    if (filtro === 'com_excecao') return status === 'not_found' || status === 'conflict' || status === 'exception'
    if (filtro === 'atualizados') {
      const raw = catalogV1RowInfoById.get(product.id)?.syncedAtRaw
      if (!raw) return false
      return Date.now() - new Date(raw).getTime() <= SETE_DIAS_MS
    }
    return true
  }, [syncStatusById, catalogV1RowInfoById])

  // Contadores dos filtros rápidos — derivados 1x por mudança de dados, não
  // recalculados por clique de filtro (useMemo evita refazer a varredura
  // dos 555 produtos a cada render).
  const statusCounts = useMemo(() => ({
    todos: products.length,
    sincronizados: products.filter(p => passaFiltroSituacao(p, 'sincronizados')).length,
    manuais: products.filter(p => passaFiltroSituacao(p, 'manuais')).length,
    comExcecao: products.filter(p => passaFiltroSituacao(p, 'com_excecao')).length,
    atualizados: products.filter(p => passaFiltroSituacao(p, 'atualizados')).length,
  }), [products, passaFiltroSituacao])

  // Lista de marcas únicas pro seletor de "Mais filtros".
  const marcasList = useMemo(() => {
    const marcas = new Set()
    for (const info of catalogV1RowInfoById.values()) {
      if (info.marca) marcas.add(info.marca)
    }
    return Array.from(marcas).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [catalogV1RowInfoById])

  const maisFiltrosAtivos = [filterMarca, filterComVariacoes, filterSemEstoque, filterVendaSemEstoque].filter(Boolean).length

  const filtered = useMemo(() => products
    .filter(p => {
      const matchSearch = normalizeAccents(p.nome.toLowerCase()).includes(normalizeAccents(search.toLowerCase()))
      const matchCat = activeCategory === 'Todos' || p.categoria === activeCategory
      const matchSituacao = passaFiltroSituacao(p, quickFilter)

      const info = catalogV1RowInfoById.get(p.id)
      const matchMarca = !filterMarca || info?.marca === filterMarca
      const matchComVariacoes = !filterComVariacoes || (info?.variationCount || 0) > 0
      const matchVendaSemEstoque = !filterVendaSemEstoque || info?.sellWithoutStock === true
      // "Sem estoque": nunca classifica produto sem variação/sem dado real
      // de estoque como esgotado — só quando existe soma real de estoque
      // conhecida e ela é exatamente 0 (produto com controle de estoque).
      const matchSemEstoque = !filterSemEstoque || (info?.sellWithoutStock !== true && info?.hasStockData === true && info?.stockTotal === 0)

      return matchSearch && matchCat && matchSituacao && matchMarca && matchComVariacoes && matchVendaSemEstoque && matchSemEstoque
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
    }), [products, search, activeCategory, sortBy, quickFilter, filterMarca, filterComVariacoes, filterSemEstoque, filterVendaSemEstoque, catalogV1RowInfoById, passaFiltroSituacao])

  // Enviar via WhatsApp
  const sendWhatsApp = (product) => {
    // Padrão: encodeURIComponent() no conteúdo da mensagem
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

      {initialProductNotFound && (
        <div style={{ background: '#FEF3C7', borderBottom: '1px solid #FDE68A', padding: '8px 20px', fontSize: 12, color: '#92400E', flexShrink: 0 }}>
          ⚠️ Produto não encontrado no catálogo atual.
        </div>
      )}

      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${t.border}`, background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: t.text }}>Catálogo Supabase</h2>
          <p style={{ margin: '4px 0 0 0', fontSize: 12, color: t.textMuted }}>
            {filtered.length} de {products.length} produtos
            {activeCategory !== 'Todos' ? ` · ${activeCategory}` : ''}
            {' · '}
            <span style={{ color: '#10B981' }}>{products.filter(p => p.imagem && p.imagem.trim()).length} com foto</span>
            {products.filter(p => !p.imagem || !p.imagem.trim()).length > 0 && (
              <span style={{ color: '#EF4444', marginLeft: 6 }}>
                · {products.filter(p => !p.imagem || !p.imagem.trim()).length} sem foto
              </span>
            )}
          </p>
          {/* Indicador de status do Knowledge */}
          <p style={{ margin: '3px 0 0 0', fontSize: 11, color: t.textMuted }}>
            {knowledgeStatus === 'updated' && (
              <span style={{ color: '#10B981', fontWeight: 600 }}>Knowledge atualizado</span>
            )}
            {knowledgeStatus === 'pending' && (
              <span style={{ color: '#F59E0B', fontWeight: 600 }}>Knowledge desatualizado · sync em 60s...</span>
            )}
            {knowledgeStatus === 'syncing' && (
              <span style={{ color: '#6366F1', fontWeight: 600 }}>Sincronizando Knowledge...</span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Atualizar catálogo do Supabase"
            style={{ background: isRefreshing ? '#A0AEC0' : '#667EEA', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 14px', fontSize: 12, fontWeight: 600, cursor: isRefreshing ? 'not-allowed' : 'pointer', opacity: isRefreshing ? 0.7 : 1, transition: 'all 0.2s' }}
          >
            {isRefreshing ? 'Atualizando...' : 'Atualizar'}
          </button>
          <button
            onClick={openAddModal}
            style={{ background: '#0EC331', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            Adicionar produto
          </button>
          <button
            onClick={() => setShowUrlModal(true)}
            style={{ background: '#3B82F6', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            Adicionar via URL
          </button>
          <button
            onClick={() => setShowUrlTestModal(true)}
            style={{ background: '#F59E0B', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            title="Adicionar produto com foto via URL"
          >
            URL c/ foto
          </button>
          <button
            onClick={() => onNavigate && onNavigate('image-extractor')}
            style={{ background: '#8B5CF6', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            title="Gerenciar fotos dos produtos"
          >
            Revisor de fotos
          </button>
          <button
            onClick={handleSyncKnowledge}
            disabled={loadingSync}
            style={{
              padding: '10px 16px',
              background: loadingSync ? '#ccc' : t.primary || '#667EEA',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: loadingSync ? 'not-allowed' : 'pointer',
              fontSize: 12,
              fontWeight: 600,
              opacity: loadingSync ? 0.7 : 1,
              transition: 'all 0.2s'
            }}
            title="Sincronizar Knowledge Base"
          >
            {loadingSync ? 'Sincronizando...' : 'Sincronizar Knowledge'}
          </button>
        </div>
      </div>

      {/* Mensagem de feedback do sync */}
      {syncMessage && (
        <div style={{
          marginTop: 0,
          padding: '12px 20px',
          background: syncMessage.includes('✅') ? '#e8f5e9' : '#ffebee',
          color: syncMessage.includes('✅') ? '#2e7d32' : '#c62828',
          borderBottom: `1px solid ${syncMessage.includes('✅') ? '#c8e6c9' : '#ffcdd2'}`,
          fontSize: 13,
          fontWeight: 500,
          borderRadius: 0
        }}>
          {syncMessage}
        </div>
      )}

      {/* Storage Card */}
      <div style={{ padding: '8px 20px', borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
        <div style={{ maxWidth: 200 }}>
          <SupabaseStorageCard />
        </div>
      </div>

      {/* Catálogo V1 — Fase 4, LINHA 1: filtros rápidos de situação (nunca
          misturados com as pills de categoria abaixo — hierarquia própria) */}
      <div style={{ padding: '10px 20px 0 20px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {[
          { key: 'todos', label: 'Todos', count: statusCounts.todos },
          { key: 'sincronizados', label: 'Sincronizados', count: statusCounts.sincronizados },
          { key: 'manuais', label: 'Manuais', count: statusCounts.manuais },
          { key: 'com_excecao', label: 'Com exceção', count: statusCounts.comExcecao },
          { key: 'atualizados', label: 'Atualizados', count: statusCounts.atualizados },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setQuickFilter(f.key)}
            style={{
              padding: '5px 10px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              border: quickFilter === f.key ? 'none' : `1px solid ${t.border}`,
              background: quickFilter === f.key ? '#667EEA' : t.bgSecondary,
              color: quickFilter === f.key ? '#fff' : t.textMuted,
              transition: 'all 0.15s',
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}
          >
            {f.label}
            <span style={{
              fontSize: 10, fontWeight: 700,
              color: quickFilter === f.key ? '#fff' : t.textMuted,
              opacity: quickFilter === f.key ? 0.9 : 0.7,
            }}>
              {f.count}
            </span>
          </button>
        ))}
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

        {/* LINHA 2: pills de categoria + ordenação + "Mais filtros" */}
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
            <option value="lastAdded">Últimos adicionados</option>
            <option value="az">A → Z</option>
            <option value="preco">Menor preço</option>
            <option value="preco_desc">Maior preço</option>
          </select>

          {/* "Mais filtros" — popover compacto, não é modal grande */}
          <div style={{ position: 'relative', marginLeft: 'auto' }}>
            <button
              onClick={() => setShowMoreFilters(v => !v)}
              style={{
                padding: '5px 10px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                border: `1px solid ${maisFiltrosAtivos > 0 ? '#667EEA' : t.border}`,
                background: maisFiltrosAtivos > 0 ? '#EEF2FF' : t.bgSecondary,
                color: maisFiltrosAtivos > 0 ? '#4F46E5' : t.textMuted,
              }}
            >
              Mais filtros{maisFiltrosAtivos > 0 ? ` (${maisFiltrosAtivos})` : ''}
            </button>

            {showMoreFilters && (
              <div style={{
                position: 'absolute', top: '110%', right: 0, zIndex: 20,
                background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8,
                padding: 12, width: 220, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 600, color: t.textMuted, display: 'block', marginBottom: 4 }}>Marca</label>
                  <select
                    value={filterMarca}
                    onChange={e => setFilterMarca(e.target.value)}
                    style={{ width: '100%', fontSize: 11, padding: '5px 6px', borderRadius: 5, border: `1px solid ${t.border}`, background: t.bgSecondary, color: t.text, boxSizing: 'border-box' }}
                  >
                    <option value="">Todas</option>
                    {marcasList.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: t.text, cursor: 'pointer' }}>
                  <input type="checkbox" checked={filterComVariacoes} onChange={e => setFilterComVariacoes(e.target.checked)} />
                  Com variações
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: t.text, cursor: 'pointer' }}>
                  <input type="checkbox" checked={filterSemEstoque} onChange={e => setFilterSemEstoque(e.target.checked)} />
                  Sem estoque
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: t.text, cursor: 'pointer' }}>
                  <input type="checkbox" checked={filterVendaSemEstoque} onChange={e => setFilterVendaSemEstoque(e.target.checked)} />
                  Venda sem estoque
                </label>

                {maisFiltrosAtivos > 0 && (
                  <button
                    onClick={() => { setFilterMarca(''); setFilterComVariacoes(false); setFilterSemEstoque(false); setFilterVendaSemEstoque(false) }}
                    style={{ fontSize: 10, fontWeight: 600, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
                  >
                    Limpar filtros complementares
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${t.border}` }}>
              <th style={{ textAlign: 'left', padding: '6px', color: t.textSecondary, fontWeight: 600 }}>Foto</th>
              <th style={{ textAlign: 'left', padding: '6px', color: t.textSecondary, fontWeight: 600 }}>Produto</th>
              <th style={{ textAlign: 'left', padding: '6px', color: t.textSecondary, fontWeight: 600 }}>Categoria</th>
              <th style={{ textAlign: 'left', padding: '6px', color: t.textSecondary, fontWeight: 600 }}>Preço</th>
              <th style={{ textAlign: 'left', padding: '6px', color: t.textSecondary, fontWeight: 600 }}>Origem</th>
              <th style={{ textAlign: 'left', padding: '6px', color: t.textSecondary, fontWeight: 600 }}>Status</th>
              <th style={{ textAlign: 'left', padding: '6px', color: t.textSecondary, fontWeight: 600 }}>Última Sync</th>
              <th style={{ textAlign: 'left', padding: '6px', color: t.textSecondary, fontWeight: 600 }}>Estoque</th>
              <th style={{ textAlign: 'center', padding: '6px', color: t.textSecondary, fontWeight: 600 }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(product => (
              <tr
                key={product.id}
                onClick={() => setSelectedProductForDrawer(product)}
                style={{ borderBottom: `1px solid ${t.border}`, cursor: 'pointer' }}
              >
                <td style={{ padding: '6px' }}>
                  <a href={product.imagem} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                    <img
                      src={product.imagem}
                      alt={product.nome}
                      style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, display: 'block' }}
                      onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
                    />
                    <span style={{ display: 'none', width: 48, height: 48, borderRadius: 6, background: t.bgSecondary, fontSize: 18, alignItems: 'center', justifyContent: 'center' }}>📷</span>
                  </a>
                </td>
                <td style={{ padding: '6px', color: t.text, maxWidth: 280 }}>
                  <a
                    href={product.link}
                    target="_blank"
                    rel="noreferrer"
                    title={product.nome}
                    onClick={e => e.stopPropagation()}
                    style={{ color: t.text, textDecoration: 'none', fontWeight: 500, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {product.nome}
                  </a>
                </td>
                <td style={{ padding: '6px' }}>
                  {product.categoria ? (
                    <span style={{ background: t.bgSecondary, color: t.textMuted, borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {product.categoria}
                    </span>
                  ) : (
                    <span style={{ color: t.textMuted, fontSize: 10 }}>—</span>
                  )}
                </td>
                <td style={{ padding: '6px', whiteSpace: 'nowrap' }}>
                  <div style={{ color: t.text, fontWeight: 600 }}>{product.preco}</div>
                  {catalogV1RowInfoById.get(product.id)?.pixLabel && (
                    <div style={{ color: t.textMuted, fontSize: 10, fontWeight: 500 }}>
                      {catalogV1RowInfoById.get(product.id).pixLabel}
                    </div>
                  )}
                </td>
                <td style={{ padding: '6px' }}>
                  <OrigemBadge
                    bagyProductId={catalogV1RowInfoById.get(product.id)?.bagyProductId}
                    source={catalogV1RowInfoById.get(product.id)?.source}
                  />
                </td>
                <td style={{ padding: '6px' }}>
                  <SyncStatusBadge status={syncStatusById.get(product.id)} />
                </td>
                <td style={{ padding: '6px 4px', color: t.textMuted, fontSize: 10, whiteSpace: 'nowrap', maxWidth: 84 }}>
                  {catalogV1RowInfoById.get(product.id)?.syncedLabel ?? '—'}
                </td>
                <td style={{ padding: '6px', whiteSpace: 'nowrap' }}>
                  <div style={{ color: t.text, fontSize: 11, fontWeight: 500 }}>
                    {catalogV1RowInfoById.get(product.id)?.variationsLine ?? '—'}
                  </div>
                  <div style={{ color: t.textMuted, fontSize: 10 }}>
                    {catalogV1RowInfoById.get(product.id)?.stockLine ?? '—'}
                  </div>
                </td>
                <td style={{ padding: '6px' }}>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                    {/* WhatsApp */}
                    <button
                      onClick={(e) => { e.stopPropagation(); sendWhatsApp(product) }}
                      title="Enviar via WhatsApp"
                      style={{ ...btnStyle, background: '#25D366', color: '#fff' }}
                    >
                      Zap
                    </button>

                    {/* Copiar foto */}
                    <button
                      onClick={(e) => { e.stopPropagation(); copyImage(product) }}
                      title="Copiar imagem"
                      style={{ ...btnStyle, background: copyFeedback === product.id ? '#0EC331' : t.bgSecondary, color: copyFeedback === product.id ? '#fff' : t.text, border: `1px solid ${t.border}` }}
                    >
                      {copyFeedback === product.id ? 'Copiado' : 'Foto'}
                    </button>

                    {/* Copiar link */}
                    <button
                      onClick={(e) => { e.stopPropagation(); copyLink(product) }}
                      title="Copiar link do produto"
                      style={{ ...btnStyle, background: copyFeedback === `link-${product.id}` ? '#0EC331' : t.bgSecondary, color: copyFeedback === `link-${product.id}` ? '#fff' : t.text, border: `1px solid ${t.border}` }}
                    >
                      {copyFeedback === `link-${product.id}` ? 'Copiado' : 'Link'}
                    </button>

                    {/* Editar */}
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditModal(product) }}
                      title="Editar"
                      style={{ ...btnStyle, background: '#3B82F6', color: '#fff' }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>

                    {/* Deletar */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(product.id) }}
                      title="Excluir"
                      style={{ ...btnStyle, background: '#EF4444', color: '#fff' }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
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
              <button onClick={() => { setShowModal(false); setEditingId(null) }} style={{ flex: 1, background: t.bgSecondary, color: t.text, border: `1px solid ${t.border}`, borderRadius: 6, padding: '10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
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
            <h3 style={{ margin: '0 0 16px 0', fontSize: 15, fontWeight: 600, color: t.text }}>
              Adicionar produto via URL
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
                  O sistema vai extrair: <strong>nome, preços (original + desconto) e categoria</strong>. Você faz upload da foto e confirma.
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
                    {extracting ? 'Extraindo...' : 'Extrair dados'}
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
                    Upload da imagem *
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
                    Confirmar
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
              Adicionar via URL (teste) — foto automática
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
                  <strong>Teste:</strong> Extrai nome, preço e <strong>FOTO automaticamente</strong>. Categoria você seleciona depois.
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
                    {testExtracting ? 'Extraindo...' : 'Extrair + foto'}
                  </button>
                </div>
              </div>
            ) : (
              // ESTADO 2: Preview + Confirmar
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ background: '#ECFDF5', borderRadius: 6, padding: '10px', fontSize: 11, color: '#059669' }}>
                  Dados + foto extraídos! Confirme para prosseguir.
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
                      Foto extraída
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
                    Confirmar
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
            <h3 style={{ margin: '0 0 16px 0', fontSize: 15, fontWeight: 600, color: t.text }}>
              Histórico do catálogo
            </h3>

            {loadingHistory ? (
              <div style={{ padding: '20px', textAlign: 'center', color: t.textMuted }}>
                Carregando histórico...
              </div>
            ) : history.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: t.textMuted }}>
                Nenhuma ação registrada ainda
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {history.map((h, idx) => (
                  <div key={idx} style={{ padding: '10px 12px', background: t.bgSecondary, borderRadius: 6, fontSize: 11, borderLeft: `3px solid ${h.action === 'add' ? '#0EC331' : h.action === 'delete' ? '#DC2626' : '#3B82F6'}` }}>
                    <div style={{ fontWeight: 600, color: t.text, marginBottom: 4 }}>
                      {h.action === 'add' ? 'Adicionado' : h.action === 'delete' ? 'Deletado' : 'Editado'}: {h.produto_nome}
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

      {/* Catálogo V1 — Fase 5: ProdutoDrawer. A página só controla seleção/abertura/fechamento;
          toda a exibição e a busca de variações sob demanda vivem dentro do componente. */}
      {selectedProductForDrawer && (
        <ProdutoDrawer
          product={selectedProductForDrawer}
          v1Info={catalogV1RowInfoById.get(selectedProductForDrawer.id)}
          syncStatus={syncStatusById.get(selectedProductForDrawer.id)}
          onClose={() => setSelectedProductForDrawer(null)}
        />
      )}
    </div>
  )
}
