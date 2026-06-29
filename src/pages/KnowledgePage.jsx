import { useState, useEffect } from 'react'
import { listAgents, listTrainings, createTraining, updateTraining, deleteTraining } from '../services/gptmaker'
import { suggestCategory } from '../services/groq'
import { extractAndSaveKnowledge } from '../services/knowledgeExtractor'
import { saveCreated, getCreatedAt, isNew } from '../services/knowledgeTimestamps'
import { saveEntry, getAllEntries, deleteEntry, updateEntry, countEntries } from '../services/knowledgeDB'
import { extractTextFromImage, detectContentCategory, identifyProductFromPhoto } from '../services/ocrService'
import { parseToBlocks, TIPO_TO_CATEGORY } from '../services/knowledgeParser'

const CATEGORIES = {
  PRODUTO:    { label: 'Produto',    color: '#3B82F6', bg: '#EFF6FF' },
  PRECO:      { label: 'Preço',      color: '#059669', bg: '#ECFDF5' },
  FAQ:        { label: 'FAQ',        color: '#7C3AED', bg: '#F5F3FF' },
  ESTRATEGIA: { label: 'Estratégia', color: '#D97706', bg: '#FFFBEB' },
  POLITICA:   { label: 'Política',   color: '#DC2626', bg: '#FEF2F2' },
  GUIA:       { label: 'Guia',       color: '#0891B2', bg: '#ECFEFF' },
  GERAL:      { label: 'Geral',      color: '#6B7280', bg: '#F9FAFB' },
}

const TYPE_LABELS  = { TEXT: 'Texto', URL: 'URL', FILE: 'Arquivo', QA: 'P&R' }
const TYPE_COLORS  = { TEXT: '#94A3B8', URL: '#8B5CF6', FILE: '#F59E0B', QA: '#0EC331' }

function loadCats() {
  try { return JSON.parse(localStorage.getItem('codex_cats') || '{}') } catch { return {} }
}
function saveCats(map) {
  try { localStorage.setItem('codex_cats', JSON.stringify(map)) } catch {}
}


function getCat(training, map) {
  if (map[training.id]) return map[training.id]
  if (training.type === 'TEXT' && training.text) {
    const m = training.text.match(/^\[([^\]]+)\]\n/)
    if (m) {
      const found = Object.entries(CATEGORIES).find(([, v]) => v.label === m[1])
      if (found) return found[0]
    }
  }
  return null
}
function previewText(item) {
  if (item.type === 'URL')  return item.website || ''
  if (item.type === 'FILE') return item.documentName || ''
  return (item.text || '').replace(/^\[[^\]]+\]\n/, '').replace(/\n/g, ' ').slice(0, 120)
}

export default function KnowledgePage() {
  const [agents, setAgents]               = useState([])
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [items, setItems]                 = useState([])
  const [loading, setLoading]             = useState(true)
  const [search, setSearch]               = useState('')
  const [typeFilter, setTypeFilter]       = useState('ALL')
  const [catFilter, setCatFilter]         = useState('ALL')
  const [catsMap, setCatsMap]             = useState(loadCats)
  const [showModal, setShowModal]         = useState(false)
  const [modalMode, setModalMode]         = useState('new')   // 'new' | 'edit'
  const [editItem, setEditItem]           = useState(null)
  const [form, setForm]                   = useState({ type: 'TEXT', text: '', website: '', category: 'GERAL' })
  const [saving, setSaving]               = useState(false)
  const [page, setPage]                   = useState(1)
  const [activeTab, setActiveTab]         = useState('knowledge') // 'knowledge' | 'history' | 'local'
  const [localEntries, setLocalEntries]   = useState([])
  const [localCount, setLocalCount]       = useState(0)
  const [localSearch, setLocalSearch]     = useState('')
  const [localCatFilter, setLocalCatFilter] = useState('ALL')
  const [localView, setLocalView]         = useState('list') // 'list' | 'history' | 'add'
  const [localPage, setLocalPage]         = useState(1)
  const LOCAL_PER_PAGE = 10
  // Local — modal adicionar
  const [localAddMode, setLocalAddMode]   = useState(null) // null | 'file' | 'link' | 'text'
  const [localLinkUrl, setLocalLinkUrl]   = useState('')
  const [localLinkCat, setLocalLinkCat]   = useState('PRODUTO')
  const [localLinkSaving, setLocalLinkSaving] = useState(false)
  // Modo texto
  const [localText, setLocalText]         = useState('')
  const [localTextCat, setLocalTextCat]   = useState('GERAL')
  const [localTextSaving, setLocalTextSaving] = useState(false)
  // Parsing
  const [parsing, setParsing]             = useState(false)
  const [parsePreview, setParsePreview]   = useState(null) // blocos antes de salvar
  // Edição de entrada local
  const [localEditEntry, setLocalEditEntry] = useState(null)
  const [localEditTitle, setLocalEditTitle] = useState('')
  const [localEditContent, setLocalEditContent] = useState('')
  const [localEditCategory, setLocalEditCategory] = useState('GERAL')
  const [localEditSaving, setLocalEditSaving] = useState(false)
  // Identificar Produto por Foto
  const [photoFile, setPhotoFile]         = useState(null)
  const [photoPreview, setPhotoPreview]   = useState(null)
  const [photoRunning, setPhotoRunning]   = useState(false)
  const [photoLog, setPhotoLog]           = useState([])
  const [photoResult, setPhotoResult]     = useState(null)
  const [photoTitle, setPhotoTitle]       = useState('')
  const [photoContent, setPhotoContent]   = useState('')
  const [photoSaved, setPhotoSaved]       = useState(false)
  const [photoError, setPhotoError]       = useState('')

  // OCR
  const [ocrFile, setOcrFile]             = useState(null)
  const [ocrPreview, setOcrPreview]       = useState(null)
  const [ocrRunning, setOcrRunning]       = useState(false)
  const [ocrLog, setOcrLog]               = useState([])
  const [ocrResult, setOcrResult]         = useState(null)
  const [ocrError, setOcrError]           = useState('')
  const [ocrCategory, setOcrCategory]     = useState('PRODUTO')
  const [ocrSaved, setOcrSaved]           = useState(false)
  const [catSuggestion, setCatSuggestion] = useState(null)
  const [suggesting, setSuggesting]       = useState(false)
  // Extrator de URL
  const [extractUrl, setExtractUrl]       = useState('')
  const [extracting, setExtracting]       = useState(false)
  const [extractLog, setExtractLog]       = useState([])
  const [extractResult, setExtractResult] = useState(null)
  const [extractError, setExtractError]   = useState('')
  const [histPage, setHistPage]           = useState(1)
  const PER_PAGE = 15
  const HIST_PER_PAGE = 20

  useEffect(() => {
    listAgents().then(ag => {
      setAgents(ag)
      if (ag.length > 0) setSelectedAgent(ag[0])
    })
    loadLocalEntries()
  }, [])

  async function loadLocalEntries() {
    const entries = await getAllEntries()
    setLocalEntries(entries)
    setLocalCount(entries.length)
  }

  useEffect(() => { if (selectedAgent) load() }, [selectedAgent])

  async function load() {
    setLoading(true)
    try {
      const data = await listTrainings(selectedAgent.id)
      // Ordena por data de criação — mais novo primeiro
      const sorted = [...data].sort((a, b) => getCreatedAt(b) - getCreatedAt(a))
      setItems(sorted)
      setPage(1)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const cats = loadCats()

  const filtered = items.filter(it => {
    const matchType = typeFilter === 'ALL' || it.type === typeFilter
    const itemCat   = getCat(it, cats)
    const matchCat  = catFilter === 'ALL' || itemCat === catFilter
    const txt       = (it.text || it.website || it.documentName || '').toLowerCase()
    return matchType && matchCat && (!search || txt.includes(search.toLowerCase()))
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  const catCounts = {}
  items.forEach(it => {
    const c = getCat(it, cats) || 'GERAL'
    catCounts[c] = (catCounts[c] || 0) + 1
  })

  async function triggerSuggest(url) {
    if (!url || !url.startsWith('http')) return
    setSuggesting(true)
    setCatSuggestion(null)
    try {
      const result = await suggestCategory(url)
      setCatSuggestion(result)
      setForm(p => ({ ...p, category: result.categoria }))
    } catch { /* silencioso */ }
    finally { setSuggesting(false) }
  }

  async function handleExtract() {
    if (!extractUrl.trim()) return
    setExtracting(true)
    setExtractLog([])
    setExtractResult(null)
    setExtractError('')
    try {
      setExtractLog(['Conectando ao servidor...'])
      const res = await fetch('https://ignite-webhook.vercel.app/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: extractUrl.trim(), category: 'GERAL' }),
      })
      setExtractLog(prev => [...prev, 'Baixando conteúdo da página...'])
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Erro ao extrair')
      setExtractLog(prev => [...prev, `✅ ${data.chars} caracteres extraídos em ${data.chunks} bloco(s)`])
      setExtractResult(data)
      await loadLocalEntries()
    } catch (e) {
      setExtractError(e.message)
    } finally {
      setExtracting(false)
    }
  }

  function handleOcrFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setOcrFile(file)
    setOcrResult(null)
    setOcrError('')
    setOcrLog([])
    setOcrSaved(false)
    const reader = new FileReader()
    reader.onload = ev => setOcrPreview(ev.target.result)
    reader.readAsDataURL(file)
    // auto-detecta categoria pelo nome do arquivo
    const name = file.name.toLowerCase()
    if (/preco|price|valor|tabela/.test(name)) setOcrCategory('PRECO')
    else if (/politica|frete|entrega|troca/.test(name)) setOcrCategory('POLITICA')
    else setOcrCategory('PRODUTO')
  }

  function handlePhotoFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoResult(null)
    setPhotoError('')
    setPhotoLog([])
    setPhotoSaved(false)
    setPhotoTitle('')
    setPhotoContent('')
    const reader = new FileReader()
    reader.onload = ev => setPhotoPreview(ev.target.result)
    reader.readAsDataURL(file)
  }

  async function handleIdentifyProduct() {
    if (!photoFile) return
    setPhotoRunning(true)
    setPhotoLog([])
    setPhotoResult(null)
    setPhotoError('')
    setPhotoSaved(false)
    try {
      const result = await identifyProductFromPhoto(photoFile, ({ msg }) => setPhotoLog(prev => [...prev, msg]))
      setPhotoResult(result)
      const lines = result.text.split('\n')
      const titleLine = lines.find(l => l.startsWith('##'))
      setPhotoTitle(titleLine ? titleLine.replace('##', '').replace(/\[|\]/g, '').trim() : photoFile.name)
      setPhotoContent(result.text)
    } catch (e) {
      setPhotoError(e.message)
    } finally {
      setPhotoRunning(false)
    }
  }

  async function handleSavePhotoProduct() {
    if (!photoContent) return
    try {
      await saveEntry({ title: photoTitle || 'Produto identificado', content: photoContent, category: 'PRODUTO', source: 'foto' })
      setPhotoSaved(true)
      loadLocalEntries()
    } catch (e) {
      setPhotoError(e.message)
    }
  }

  async function handleOCR() {
    if (!ocrFile) return
    setOcrRunning(true)
    setOcrLog([])
    setOcrResult(null)
    setOcrError('')
    setOcrSaved(false)
    try {
      const result = await extractTextFromImage(ocrFile, ({ msg }) => setOcrLog(prev => [...prev, msg]))
      const cat = detectContentCategory(result.text)
      setOcrCategory(cat)
      setOcrResult(result.text)
    } catch (e) {
      setOcrError(e.message)
    } finally {
      setOcrRunning(false)
    }
  }

  async function handleLocalLinkSave() {
    if (!localLinkUrl.trim()) return
    setLocalLinkSaving(true)
    try {
      await saveEntry({ title: localLinkUrl, content: localLinkUrl, category: localLinkCat, source: localLinkUrl })
      await loadLocalEntries()
      setLocalLinkUrl('')
      setLocalAddMode(null)
      setLocalView('list')
    } catch (e) { alert('Erro: ' + e.message) }
    finally { setLocalLinkSaving(false) }
  }

  async function handleLocalTextSave() {
    if (!localText.trim()) return
    setLocalTextSaving(true)
    setParsing(true)
    setParsePreview(null)
    try {
      const blocos = await parseToBlocks(localText)
      setParsePreview(blocos)
      setParsing(false)
      // salva cada bloco como entrada separada
      for (const b of blocos) {
        await saveEntry({
          title: b.nome || b.conteudo.slice(0, 80),
          content: b.conteudo,
          category: TIPO_TO_CATEGORY[b.tipo] || 'GERAL',
          source: 'manual',
        })
      }
      await loadLocalEntries()
      setLocalText('')
      setParsePreview(null)
      setLocalAddMode(null)
      setLocalView('list')
    } catch (e) { alert('Erro: ' + e.message) }
    finally { setLocalTextSaving(false); setParsing(false) }
  }

  async function handleOcrSave() {
    if (!ocrResult) return
    setParsing(true)
    try {
      const blocos = await parseToBlocks(ocrResult)
      for (const b of blocos) {
        await saveEntry({
          title: b.nome || (ocrFile?.name || 'Imagem'),
          content: b.conteudo,
          category: TIPO_TO_CATEGORY[b.tipo] || ocrCategory,
          source: 'ocr',
        })
      }
      await loadLocalEntries()
      setOcrSaved(true)
    } catch (e) {
      // fallback: salva como bloco único
      await saveEntry({ title: ocrFile?.name || 'Imagem extraída', content: ocrResult, category: ocrCategory, source: 'ocr' })
      await loadLocalEntries()
      setOcrSaved(true)
    } finally {
      setParsing(false)
    }
  }

  function openLocalEdit(entry) {
    setLocalEditEntry(entry)
    setLocalEditTitle(entry.title)
    setLocalEditContent(entry.content)
    setLocalEditCategory(entry.category || 'GERAL')
  }

  async function handleLocalEditSave() {
    if (!localEditEntry) return
    setLocalEditSaving(true)
    try {
      await updateEntry(localEditEntry.id, {
        title: localEditTitle,
        content: localEditContent,
        category: localEditCategory,
      })
      await loadLocalEntries()
      setLocalEditEntry(null)
    } catch (e) { alert('Erro ao salvar: ' + e.message) }
    finally { setLocalEditSaving(false) }
  }

  function handleDownload() {
    if (!extractResult?.fileContent) return
    const blob = new Blob([extractResult.fileContent], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `conhecimento-${new Date().toISOString().slice(0,10)}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  function openNew() {
    setForm({ type: 'TEXT', text: '', website: '', category: 'GERAL' })
    setModalMode('new')
    setEditItem(null)
    setCatSuggestion(null)
    setShowModal(true)
  }

  function openEdit(item) {
    const cat = getCat(item, cats) || 'GERAL'
    setForm({
      type: item.type,
      text: (item.text || '').replace(/^\[[^\]]+\]\n/, ''),
      website: item.website || '',
      category: cat,
    })
    setModalMode('edit')
    setEditItem(item)
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.text && !form.website) return
    setSaving(true)
    try {
      if (modalMode === 'new') {
        const body = form.type === 'URL'
          ? { type: 'URL', website: form.website }
          : { type: form.type, text: `[${CATEGORIES[form.category]?.label}]\n${form.text}` }
        const created = await createTraining(selectedAgent.id, body)
        if (created?.id) {
          const map = loadCats()
          map[created.id] = form.category
          saveCats(map)
          setCatsMap({ ...map })
          saveCreated(created.id)
        }
        // Salva também na base local com parsing estruturado
        if (form.type !== 'URL') {
          const blocos = await parseToBlocks(form.text).catch(() => [{ tipo: 'GERAL', nome: form.text.slice(0, 80), conteudo: form.text }])
          for (const b of blocos) {
            await saveEntry({
              title: b.nome || form.text.slice(0, 80),
              content: b.conteudo,
              category: TIPO_TO_CATEGORY[b.tipo] || form.category,
              source: 'manual',
              gptMakerId: created?.id || null,
            })
          }
          await loadLocalEntries()
        }
      } else {
        const body = form.type === 'URL'
          ? { website: form.website }
          : { text: `[${CATEGORIES[form.category]?.label}]\n${form.text}` }
        await updateTraining(editItem.id, body)
        const map = loadCats()
        map[editItem.id] = form.category
        saveCats(map)
        setCatsMap({ ...map })
      }
      await load()
      setShowModal(false)
    } catch (e) { alert('Erro: ' + e.message) }
    finally { setSaving(false) }
  }

  async function handleDelete(item) {
    if (!confirm('Deletar este treinamento?')) return
    try {
      await deleteTraining(item.id)
      const map = loadCats()
      delete map[item.id]
      saveCats(map)
      setCatsMap({ ...map })
      setItems(prev => prev.filter(i => i.id !== item.id))
    } catch (e) { alert('Erro: ' + e.message) }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 8, overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{ padding: '20px 24px 0', borderBottom: '1px solid #E5E5E5' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#F0EBFF', border: '2px solid #7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#0A0A0A' }}>Base de Conhecimento</div>
              <div style={{ fontSize: 12, color: '#82829B', marginTop: 2 }}>
                O que o agente sabe e pode responder aos clientes · {items.length} treinamentos
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {agents.length > 1 && (
              <select value={selectedAgent?.id || ''} onChange={e => setSelectedAgent(agents.find(a => a.id === e.target.value))}
                style={{ border: '1px solid #E5E5E5', borderRadius: 8, padding: '7px 12px', fontSize: 13, outline: 'none', background: '#F9FAFB', color: '#0A0A0A' }}>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
            <button onClick={openNew}
              style={{ background: '#7C3AED', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Adicionar
            </button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 0 }}>
          {[
            { key: 'knowledge', label: 'GPT Maker', icon: '📚' },
            { key: 'local',     label: `Base Local${localCount > 0 ? ` (${localCount})` : ''}`, icon: '🧠' },
            { key: 'extract',   label: 'Extrair da URL', icon: '🔗' },
            { key: 'history',   label: 'Histórico', icon: '🕐' },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              background: 'none', border: 'none', borderBottom: activeTab === tab.key ? '2px solid #7C3AED' : '2px solid transparent',
              padding: '8px 18px', fontSize: 13, fontWeight: activeTab === tab.key ? 700 : 500,
              color: activeTab === tab.key ? '#7C3AED' : '#6B7280', cursor: 'pointer', transition: 'all 0.15s',
            }}>{tab.icon} {tab.label}</button>
          ))}
        </div>

      {/* ── Filtros (só na aba conhecimento) ── */}
        {activeTab === 'knowledge' && <div style={{ display: 'flex', gap: 12, alignItems: 'center', paddingBottom: 14, flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Pesquisar..."
              style={{ width: '100%', border: '1px solid #E5E5E5', borderRadius: 8, padding: '8px 12px 8px 34px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
          </div>

          {/* Category pills */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            <Pill label="Todos" active={catFilter === 'ALL'} onClick={() => { setCatFilter('ALL'); setPage(1) }} color="#6B7280" />
            {Object.entries(CATEGORIES).map(([k, v]) => (
              <Pill key={k} label={`${v.label}${catCounts[k] ? ` (${catCounts[k]})` : ''}`}
                active={catFilter === k} onClick={() => { setCatFilter(k); setPage(1) }} color={v.color} />
            ))}
          </div>

          {/* Type select */}
          <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1) }}
            style={{ border: '1px solid #E5E5E5', borderRadius: 8, padding: '7px 12px', fontSize: 13, outline: 'none', background: '#F9FAFB', color: '#4B5563' }}>
            <option value="ALL">Todos os tipos</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>}
      </div>

      {/* ── Base Local (layout idêntico ao Dealism) ── */}
      {activeTab === 'local' && (() => {
        const filtered = localEntries.filter(e =>
          (!localSearch || `${e.title} ${e.content} ${e.source || ''}`.toLowerCase().includes(localSearch.toLowerCase())) &&
          (localCatFilter === 'ALL' || e.category === localCatFilter)
        )
        const totalLocalPages = Math.max(1, Math.ceil(filtered.length / LOCAL_PER_PAGE))
        const paginated = filtered.slice((localPage - 1) * LOCAL_PER_PAGE, localPage * LOCAL_PER_PAGE)

        return (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Sub-header estilo Dealism */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #E5E5E5' }}>
              <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 16px', lineHeight: 1.6 }}>
                O conhecimento abaixo determina o que o chat sabe e pode sugerir aos atendentes — você pode excluí-lo a qualquer momento.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  onClick={() => { setLocalView('add'); setLocalAddMode(null); setOcrFile(null); setOcrPreview(null); setOcrResult(null); setOcrLog([]); setOcrSaved(false); setOcrError('') }}
                  style={{ background: '#0EC331', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Adicionar
                </button>
                <button onClick={() => { setLocalView(localView === 'history' ? 'list' : 'history'); setLocalSearch('') }}
                  style={{ background: 'none', border: 'none', fontSize: 13, fontWeight: 600, color: localView === 'history' ? '#111827' : '#6B7280', cursor: 'pointer', padding: '8px 4px', borderBottom: localView === 'history' ? '2px solid #111827' : '2px solid transparent' }}>
                  Histórico de uploads
                </button>
                {localView === 'list' && (
                  <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
                    <select
                      value={localCatFilter}
                      onChange={e => { setLocalCatFilter(e.target.value); setLocalPage(1) }}
                      style={{ border: '1px solid #E5E5E5', borderRadius: 8, padding: '7px 10px', fontSize: 13, outline: 'none', color: '#374151', background: '#fff', cursor: 'pointer' }}>
                      <option value="ALL">Todas</option>
                      {Object.entries(CATEGORIES).map(([key, cat]) => (
                        <option key={key} value={key}>{cat.label}</option>
                      ))}
                    </select>
                    <div style={{ position: 'relative' }}>
                      <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      <input value={localSearch} onChange={e => { setLocalSearch(e.target.value); setLocalPage(1) }} placeholder="Pesquisar..."
                        style={{ border: '1px solid #E5E5E5', borderRadius: 8, padding: '7px 12px 7px 32px', fontSize: 13, outline: 'none', width: 180 }} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* VIEW: Adicionar */}
            {localView === 'add' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
                {localAddMode === null && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 400, margin: '0 auto', paddingTop: 20 }}>
                    {[
                      { mode: 'photo', icon: '📸', label: 'Identificar produto por foto', sub: 'Envie uma foto — a IA identifica o produto e salva na base automaticamente.' },
                      { mode: 'file', icon: '⬆️', label: 'Adicionar conhecimento por arquivo', sub: 'JPG, PNG, PDF — a IA lê e extrai o texto (OCR). Máx. 20MB.' },
                      { mode: 'link', icon: '🔗', label: 'Adicionar conhecimento por link', sub: 'Importar automaticamente o conteúdo a partir da URL.' },
                      { mode: 'text', icon: '📝', label: 'Adicionar conhecimento por texto', sub: 'Digite ou cole o conteúdo diretamente.' },
                    ].map(opt => (
                      <button key={opt.mode} onClick={() => setLocalAddMode(opt.mode)}
                        style={{ background: '#fff', border: '1.5px solid #E5E5E5', borderRadius: 14, padding: '24px 20px', textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, transition: 'all 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#0EC331'; e.currentTarget.style.background = '#F0FDF4' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E5E5'; e.currentTarget.style.background = '#fff' }}>
                        <span style={{ fontSize: 30 }}>{opt.icon}</span>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{opt.label}</div>
                        <div style={{ fontSize: 12, color: '#9CA3AF' }}>{opt.sub}</div>
                      </button>
                    ))}
                    <button onClick={() => setLocalView('list')} style={{ background: 'none', border: 'none', fontSize: 13, color: '#9CA3AF', cursor: 'pointer', marginTop: 4 }}>← Voltar</button>
                  </div>
                )}

                {/* Modo: identificar produto por foto */}
                {localAddMode === 'photo' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
                    <button onClick={() => { setLocalAddMode(null); setPhotoFile(null); setPhotoPreview(null); setPhotoResult(null) }} style={{ background: 'none', border: 'none', fontSize: 13, color: '#6B7280', cursor: 'pointer', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 4 }}>← Voltar</button>

                    {!photoFile ? (
                      <label style={{ border: '2px dashed #D1D5DB', borderRadius: 14, padding: '40px 20px', textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, background: '#FAFAFA' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#3B82F6'; e.currentTarget.style.background = '#EFF6FF' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#D1D5DB'; e.currentTarget.style.background = '#FAFAFA' }}>
                        <span style={{ fontSize: 40 }}>📸</span>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Clique para enviar foto do produto</div>
                        <div style={{ fontSize: 12, color: '#9CA3AF' }}>JPG, PNG, WEBP — a IA identifica marca, tipo, cor e características</div>
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoFileChange} />
                      </label>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                          {photoPreview && <img src={photoPreview} alt="" style={{ width: 130, height: 130, objectFit: 'cover', borderRadius: 10, border: '1px solid #E5E5E5', flexShrink: 0 }} />}
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{photoFile.name}</div>
                            <div style={{ fontSize: 12, color: '#6B7280' }}>Categoria: <strong>PRODUTO</strong> (automático)</div>
                            <button onClick={() => { setPhotoFile(null); setPhotoPreview(null); setPhotoResult(null); setPhotoLog([]); setPhotoError(''); setPhotoSaved(false) }}
                              style={{ background: 'none', border: '1px solid #E5E7EB', borderRadius: 7, padding: '5px 12px', fontSize: 12, color: '#6B7280', cursor: 'pointer', alignSelf: 'flex-start' }}>
                              ✕ Trocar foto
                            </button>
                            {!photoResult && (
                              <button onClick={handleIdentifyProduct} disabled={photoRunning}
                                style={{ background: photoRunning ? '#D1D5DB' : '#3B82F6', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: photoRunning ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start' }}>
                                {photoRunning
                                  ? <><span style={{ display: 'inline-block', width: 13, height: 13, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Identificando...</>
                                  : '🔍 Identificar produto'}
                              </button>
                            )}
                          </div>
                        </div>

                        {photoLog.length > 0 && (
                          <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {photoLog.map((l, i) => <div key={i} style={{ fontSize: 12, color: '#6B7280' }}>• {l}</div>)}
                          </div>
                        )}

                        {photoError && <div style={{ background: '#FEF2F2', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#DC2626' }}>⚠️ {photoError}</div>}

                        {photoResult && !photoSaved && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>✅ Produto identificado — revise antes de salvar:</div>
                            <input value={photoTitle} onChange={e => setPhotoTitle(e.target.value)} placeholder="Título do produto" style={{ border: '1px solid #D1D5DB', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#111827' }} />
                            <textarea value={photoContent} onChange={e => setPhotoContent(e.target.value)} rows={8} style={{ border: '1px solid #D1D5DB', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#374151', resize: 'vertical', fontFamily: 'monospace' }} />
                            <button onClick={handleSavePhotoProduct}
                              style={{ background: '#0EC331', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', alignSelf: 'flex-start' }}>
                              💾 Salvar na base
                            </button>
                          </div>
                        )}

                        {photoSaved && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#166534', fontWeight: 600 }}>
                              ✅ Produto salvo na base com sucesso!
                            </div>
                            <button onClick={() => { setPhotoFile(null); setPhotoPreview(null); setPhotoResult(null); setPhotoLog([]); setPhotoError(''); setPhotoSaved(false); setPhotoTitle(''); setPhotoContent('') }}
                              style={{ background: '#3B82F6', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', alignSelf: 'flex-start' }}>
                              📸 Adicionar outra foto
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Modo: arquivo (OCR) */}
                {localAddMode === 'file' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
                    <button onClick={() => setLocalAddMode(null)} style={{ background: 'none', border: 'none', fontSize: 13, color: '#6B7280', cursor: 'pointer', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 4 }}>← Voltar</button>
                    {!ocrFile ? (
                      <label style={{ border: '2px dashed #D1D5DB', borderRadius: 14, padding: '40px 20px', textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, background: '#FAFAFA' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#0EC331'; e.currentTarget.style.background = '#F0FDF4' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#D1D5DB'; e.currentTarget.style.background = '#FAFAFA' }}>
                        <span style={{ fontSize: 36 }}>⬆️</span>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Clique para selecionar a imagem</div>
                        <div style={{ fontSize: 12, color: '#9CA3AF' }}>JPG, PNG, WEBP — até 20MB</div>
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleOcrFileChange} />
                      </label>
                    ) : (
                      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        {ocrPreview && <img src={ocrPreview} alt="" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 10, border: '1px solid #E5E5E5', flexShrink: 0 }} />}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{ocrFile.name}</div>
                          <select value={ocrCategory} onChange={e => setOcrCategory(e.target.value)} style={inputSt}>
                            {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                          <button onClick={handleOCR} disabled={ocrRunning}
                            style={{ background: ocrRunning ? '#D1D5DB' : '#0EC331', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: ocrRunning ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start' }}>
                            {ocrRunning ? <><span style={{ display: 'inline-block', width: 13, height: 13, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Lendo...</> : '🔍 Extrair texto'}
                          </button>
                        </div>
                      </div>
                    )}
                    {ocrLog.length > 0 && (
                      <div style={{ background: '#0A0A0A', borderRadius: 8, padding: '12px 16px', fontFamily: 'monospace' }}>
                        {ocrLog.map((msg, i) => <div key={i} style={{ fontSize: 12, color: i === ocrLog.length - 1 ? '#4ADE80' : '#6B7280', marginBottom: 3 }}>› {msg}</div>)}
                      </div>
                    )}
                    {ocrError && <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#DC2626' }}>❌ {ocrError}</div>}
                    {ocrResult && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: 8, padding: '12px 14px', maxHeight: 220, overflowY: 'auto' }}>
                          <pre style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{ocrResult}</pre>
                        </div>
                        {ocrSaved
                          ? <span style={{ background: '#ECFDF5', color: '#065F46', border: '1px solid #6EE7B7', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 700, alignSelf: 'flex-start' }}>✅ Salvo na base local!</span>
                          : <button onClick={async () => { await handleOcrSave(); setLocalView('list'); await loadLocalEntries() }}
                              style={{ background: '#0EC331', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', alignSelf: 'flex-start' }}>
                              Salvar na base local
                            </button>
                        }
                      </div>
                    )}
                  </div>
                )}

                {/* Modo: link */}
                {localAddMode === 'link' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 480 }}>
                    <button onClick={() => setLocalAddMode(null)} style={{ background: 'none', border: 'none', fontSize: 13, color: '#6B7280', cursor: 'pointer', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 4 }}>← Voltar</button>
                    <div style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6 }}>Cole a URL. O link será salvo na base local e consultado quando o cliente perguntar algo relacionado.</div>
                    <input value={localLinkUrl} onChange={e => setLocalLinkUrl(e.target.value)} placeholder="https://..." style={inputSt} />
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#82829B', textTransform: 'uppercase', marginBottom: 6 }}>Categoria</div>
                      <select value={localLinkCat} onChange={e => setLocalLinkCat(e.target.value)} style={inputSt}>
                        {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </div>
                    <button onClick={handleLocalLinkSave} disabled={!localLinkUrl.trim() || localLinkSaving}
                      style={{ background: localLinkUrl.trim() ? '#0EC331' : '#D1D5DB', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: localLinkUrl.trim() ? 'pointer' : 'not-allowed', alignSelf: 'flex-start' }}>
                      {localLinkSaving ? 'Salvando...' : 'Salvar link'}
                    </button>
                  </div>
                )}

                {/* Modo: texto */}
                {localAddMode === 'text' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 560 }}>
                    <button onClick={() => { setLocalAddMode(null); setParsePreview(null) }} style={{ background: 'none', border: 'none', fontSize: 13, color: '#6B7280', cursor: 'pointer', alignSelf: 'flex-start' }}>← Voltar</button>

                    <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#065F46', lineHeight: 1.6 }}>
                      🧠 <strong>Salvamento inteligente:</strong> a IA vai dividir o texto automaticamente em blocos separados por tipo (produto, preço, política, etc.) — igual ao Dealism.
                    </div>

                    <textarea value={localText} onChange={e => setLocalText(e.target.value)} rows={10}
                      placeholder="Cole aqui qualquer texto — produto com preço, política de troca, lista de produtos, FAQ..."
                      style={{ ...inputSt, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }} />

                    {/* Preview dos blocos detectados */}
                    {parsePreview && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#065F46' }}>✅ {parsePreview.length} blocos detectados:</div>
                        {parsePreview.map((b, i) => {
                          const cat = CATEGORIES[TIPO_TO_CATEGORY[b.tipo]]
                          return (
                            <div key={i} style={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: 8, padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                              <span style={{ background: cat?.bg || '#F9FAFB', color: cat?.color || '#6B7280', borderRadius: 5, padding: '2px 7px', fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>
                                {b.tipo}
                              </span>
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{b.nome}</div>
                                <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{b.conteudo.slice(0, 80)}...</div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    <button onClick={handleLocalTextSave} disabled={!localText.trim() || localTextSaving || parsing}
                      style={{ background: localText.trim() && !localTextSaving ? '#0EC331' : '#D1D5DB', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: localText.trim() && !localTextSaving ? 'pointer' : 'not-allowed', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8 }}>
                      {parsing ? <><span style={{ display: 'inline-block', width: 13, height: 13, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Analisando...</> : localTextSaving ? 'Salvando...' : '🧠 Analisar e salvar'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* VIEW: Histórico */}
            {localView === 'history' && (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <div style={{ padding: '0 24px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #E5E5E5' }}>
                        {['Fonte', 'Tempo de upload', 'Status', 'Ação'].map(h => (
                          <th key={h} style={{ ...th, fontWeight: 600, color: '#374151', fontSize: 13, textTransform: 'none', letterSpacing: 0 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {localEntries.length === 0 ? (
                        <tr><td colSpan={4} style={{ padding: '60px 0', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Nenhum upload registrado</td></tr>
                      ) : localEntries.map((entry, idx) => (
                        <tr key={entry.id} style={{ borderBottom: '1px solid #F3F4F6' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                          onMouseLeave={e => e.currentTarget.style.background = ''}>
                          <td style={td}>
                            <div style={{ fontSize: 13, color: '#374151', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {entry.source?.startsWith('http') ? (
                                <a href={entry.source} target="_blank" rel="noreferrer" style={{ color: '#6B7280', textDecoration: 'none' }}>{entry.source}</a>
                              ) : entry.source === 'ocr' ? `📷 ${entry.title}` : entry.source === 'conversa' ? `💬 ${entry.title.slice(0, 60)}` : entry.title.slice(0, 60)}
                            </div>
                          </td>
                          <td style={{ ...td, whiteSpace: 'nowrap', color: '#6B7280', fontSize: 13 }}>
                            {new Date(entry.createdAt).toLocaleString('pt-BR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '')}
                          </td>
                          <td style={td}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#059669', fontSize: 13 }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>
                              Sucesso
                            </span>
                          </td>
                          <td style={td}>
                            <button onClick={async () => { await deleteEntry(entry.id); await loadLocalEntries() }}
                              style={{ background: 'none', border: 'none', fontSize: 13, color: '#0EC331', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                              onMouseEnter={e => e.currentTarget.style.color = '#DC2626'}
                              onMouseLeave={e => e.currentTarget.style.color = '#0EC331'}>
                              Excluir
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* VIEW: Lista principal */}
            {localView === 'list' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {localEntries.length === 0 ? (
                    <div style={{ padding: '60px 24px', textAlign: 'center' }}>
                      <div style={{ fontSize: 40, marginBottom: 12 }}>🧠</div>
                      <div style={{ fontSize: 14, color: '#374151', fontWeight: 600, marginBottom: 6 }}>Base local vazia</div>
                      <div style={{ fontSize: 13, color: '#9CA3AF' }}>Clique em "+ Adicionar" para começar</div>
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #E5E5E5' }}>
                          {['Conteúdo', 'Categoria', 'Fonte', 'Ação'].map((h, i) => (
                            <th key={h} style={{ ...th, fontWeight: 600, color: '#374151', fontSize: 13, textTransform: 'none', letterSpacing: 0, width: i === 0 ? 'auto' : i === 1 ? 180 : i === 2 ? 260 : 100 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {paginated.map((entry, idx) => {
                          const cat = CATEGORIES[entry.category]
                          const preview = entry.content.replace(/\n/g, ' ').slice(0, 120)
                          const srcLabel = entry.source?.startsWith('http') ? entry.source : entry.source === 'ocr' ? '📷 imagem' : entry.source === 'conversa' ? '💬 conversa' : 'texto manual'
                          return (
                            <tr key={entry.id} style={{ borderBottom: '1px solid #F3F4F6' }}
                              onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                              onMouseLeave={e => e.currentTarget.style.background = ''}>
                              <td style={td}>
                                <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
                                  {preview}{entry.content.length > 120 ? '...' : ''}
                                </div>
                              </td>
                              <td style={td}>
                                {cat && (
                                  <span style={{ background: cat.bg, color: cat.color, border: `1px solid ${cat.color}30`, borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                                    {cat.label}
                                  </span>
                                )}
                              </td>
                              <td style={td}>
                                {entry.source?.startsWith('http') ? (
                                  <a href={entry.source} target="_blank" rel="noreferrer"
                                    style={{ color: '#6B7280', fontSize: 12, textDecoration: 'none', display: 'block', maxWidth: 230, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {entry.source.replace(/^https?:\/\//, '')}
                                  </a>
                                ) : (
                                  <span style={{ fontSize: 12, color: '#9CA3AF' }}>{srcLabel}</span>
                                )}
                              </td>
                              <td style={td}>
                                <div style={{ display: 'flex', gap: 10 }}>
                                  <button onClick={() => openLocalEdit(entry)}
                                    style={{ background: 'none', border: 'none', fontSize: 13, color: '#6B7280', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                                    onMouseEnter={e => e.currentTarget.style.color = '#111'}
                                    onMouseLeave={e => e.currentTarget.style.color = '#6B7280'}>
                                    Editar
                                  </button>
                                  <button onClick={async () => { await deleteEntry(entry.id); await loadLocalEntries() }}
                                    style={{ background: 'none', border: 'none', fontSize: 13, color: '#0EC331', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                                    onMouseEnter={e => e.currentTarget.style.color = '#DC2626'}
                                    onMouseLeave={e => e.currentTarget.style.color = '#0EC331'}>
                                    Excluir
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
                {totalLocalPages > 1 && (
                  <div style={{ padding: '12px 24px', borderTop: '1px solid #E5E5E5', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <PageBtn label="‹ Anterior" disabled={localPage === 1} onClick={() => setLocalPage(p => p - 1)} />
                    {Array.from({ length: totalLocalPages }, (_, i) => i + 1).map(p => (
                      <PageBtn key={p} label={String(p)} active={p === localPage} onClick={() => setLocalPage(p)} />
                    ))}
                    <PageBtn label="Próximo ›" disabled={localPage === totalLocalPages} onClick={() => setLocalPage(p => p + 1)} />
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Extrair da URL ── */}
      {activeTab === 'extract' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Descrição */}
          <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 10, padding: '14px 18px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#5B21B6', marginBottom: 6 }}>🔗 Como funciona</div>
            <div style={{ fontSize: 13, color: '#6D28D9', lineHeight: 1.7 }}>
              Cole qualquer URL → nosso servidor baixa o conteúdo da página (sem bloqueio de CORS) → extrai o texto → salva automaticamente na <strong>Base Local</strong> no Supabase.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {['1. Cole a URL', '2. Clique em Extrair', '3. Salvo no Supabase', '4. Gabriela já usa'].map((s, i) => (
                <span key={i} style={{ background: '#EDE9FE', color: '#5B21B6', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>{s}</span>
              ))}
            </div>
          </div>

          {/* Input URL */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#82829B', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>URL para extrair</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                value={extractUrl}
                onChange={e => { setExtractUrl(e.target.value); setExtractResult(null); setExtractError('') }}
                onKeyDown={e => e.key === 'Enter' && !extracting && handleExtract()}
                placeholder="https://www.primestoremen.com.br/produtos?page=1"
                disabled={extracting}
                style={{ flex: 1, border: '1px solid #E5E5E5', borderRadius: 8, padding: '10px 14px', fontSize: 13, outline: 'none', color: '#111827', background: extracting ? '#F9FAFB' : '#fff' }}
              />
              <button
                onClick={handleExtract}
                disabled={extracting || !extractUrl.trim()}
                style={{ background: extracting ? '#C4B5FD' : '#7C3AED', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: extracting ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 8 }}>
                {extracting
                  ? <><span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Gerando...</>
                  : '🔗 Extrair e Salvar'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>
              Dica: para sites com paginação, extraia página por página (ex: ?page=1, ?page=2…)
            </div>
          </div>

          {/* Log de progresso */}
          {extractLog.length > 0 && (
            <div style={{ background: '#0A0A0A', borderRadius: 10, padding: '14px 18px', fontFamily: 'monospace' }}>
              {extractLog.map((msg, i) => (
                <div key={i} style={{ fontSize: 12, color: i === extractLog.length - 1 ? '#A78BFA' : '#6B7280', marginBottom: 4 }}>
                  <span style={{ color: '#4ADE80', marginRight: 8 }}>›</span>{msg}
                </div>
              ))}
              {extracting && <span style={{ color: '#A78BFA', fontSize: 12 }}>█</span>}
            </div>
          )}

          {/* Erro */}
          {extractError && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '14px 18px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#DC2626', marginBottom: 4 }}>❌ Erro na extração</div>
              <div style={{ fontSize: 13, color: '#7F1D1D' }}>{extractError}</div>
              <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 8 }}>Sugestões: tente outra página, envie um PDF ou adicione os produtos manualmente.</div>
            </div>
          )}

          {/* Resultado */}
          {extractResult && (
            <div style={{ background: '#ECFDF5', border: '1px solid #6EE7B7', borderRadius: 10, padding: '16px 20px' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#065F46', marginBottom: 4 }}>
                ✅ Salvo na Base Local!
              </div>
              <div style={{ fontSize: 13, color: '#047857', marginBottom: 8 }}>
                <strong>{extractResult.title}</strong> — {extractResult.chunks} bloco(s), {extractResult.chars?.toLocaleString()} caracteres extraídos e salvos no Supabase.
              </div>
              <div style={{ fontSize: 12, color: '#059669' }}>
                A Gabriela já pode usar esse conhecimento nas próximas respostas.
              </div>

              {/* Instrução de upload */}
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '12px 16px', marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#166534', marginBottom: 6 }}>📤 Como subir no Dealism:</div>
                <ol style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: '#15803D', lineHeight: 1.8 }}>
                  <li>Acesse <strong>Conhecimento → + Adicionar</strong> no Dealism</li>
                  <li>Clique em <strong>"Adicionar conhecimento por arquivo"</strong></li>
                  <li>Selecione o arquivo <strong>.md</strong> que você baixou</li>
                  <li>Aguarde o processamento ✅</li>
                </ol>
              </div>

              {/* Preview dos produtos */}
              <div style={{ fontSize: 11, fontWeight: 600, color: '#047857', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Produtos incluídos ({extractResult.produtos_encontrados})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                {extractResult.saved.map((b, i) => (
                  <div key={i} style={{ background: '#fff', border: '1px solid #D1FAE5', borderRadius: 6, padding: '6px 12px', fontSize: 12, color: '#374151' }}>
                    {b.nome}
                  </div>
                ))}
              </div>

              <button onClick={() => { setExtractResult(null); setExtractLog([]); setExtractUrl('') }}
                style={{ marginTop: 14, background: 'none', border: '1px solid #6EE7B7', borderRadius: 8, padding: '7px 18px', fontSize: 13, color: '#065F46', cursor: 'pointer', fontWeight: 600 }}>
                Gerar outro arquivo
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Histórico — Supabase ── */}
      {activeTab === 'history' && (() => {
        const histTotal = Math.max(1, Math.ceil(localEntries.length / HIST_PER_PAGE))
        const histPaged = localEntries.slice((histPage - 1) * HIST_PER_PAGE, histPage * HIST_PER_PAGE)
        const hoje = localEntries.filter(e => Date.now() - new Date(e.created_at).getTime() < 86400000).length
        const porCat = {}
        localEntries.forEach(e => { porCat[e.category] = (porCat[e.category] || 0) + 1 })
        return (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Resumo */}
            <div style={{ display: 'flex', gap: 12, padding: '14px 24px', background: '#F9FAFB', borderBottom: '1px solid #E5E5E5', flexWrap: 'wrap' }}>
              {[
                { label: 'Total na base', value: localEntries.length, color: '#7C3AED' },
                { label: 'Adicionados hoje', value: hoje, color: '#10B981' },
                { label: 'Produtos', value: porCat['PRODUTO'] || 0, color: '#3B82F6' },
                { label: 'Preços', value: porCat['PRECO'] || 0, color: '#059669' },
                { label: 'Estratégias', value: porCat['ESTRATEGIA'] || 0, color: '#D97706' },
              ].map(s => (
                <div key={s.label} style={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: 8, padding: '8px 16px', minWidth: 100 }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: '#82829B', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Tabela */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {localEntries.length === 0 ? (
                <div style={{ padding: 60, textAlign: 'center' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                  <div style={{ fontSize: 14, color: '#82829B' }}>Nenhuma entrada na base</div>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E5E5' }}>
                      <th style={th}>#</th>
                      <th style={th}>Data / Hora</th>
                      <th style={th}>Título</th>
                      <th style={{ ...th, width: 120 }}>Categoria</th>
                      <th style={{ ...th, width: 160 }}>Fonte</th>
                      <th style={{ ...th, width: 100 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {histPaged.map((entry, idx) => {
                      const date = new Date(entry.created_at)
                      const isToday = new Date().toDateString() === date.toDateString()
                      const catInfo = CATEGORIES[entry.category] || CATEGORIES['GERAL']
                      const globalIdx = (histPage - 1) * HIST_PER_PAGE + idx + 1
                      return (
                        <tr key={entry.id}
                          style={{ borderBottom: '1px solid #F3F4F6', background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#F5F3FF'}
                          onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#FAFAFA'}>
                          <td style={{ ...td, color: '#D1D5DB', fontSize: 12, width: 40 }}>{globalIdx}</td>
                          <td style={{ ...td, whiteSpace: 'nowrap' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
                              {isToday ? 'Hoje' : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                            </div>
                            <div style={{ fontSize: 11, color: '#82829B', marginTop: 2 }}>
                              {date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </td>
                          <td style={td}>
                            <div style={{ fontSize: 13, color: '#374151', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {entry.title || <span style={{ color: '#9CA3AF', fontStyle: 'italic' }}>sem título</span>}
                            </div>
                          </td>
                          <td style={td}>
                            <span style={{ background: catInfo.bg, color: catInfo.color, border: `1px solid ${catInfo.color}30`, borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>
                              {catInfo.label}
                            </span>
                          </td>
                          <td style={td}>
                            <span style={{ fontSize: 11, color: '#6B7280', maxWidth: 140, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {entry.source || '—'}
                            </span>
                          </td>
                          <td style={td}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
                              ✓ Salvo
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Paginação */}
            {histTotal > 1 && (
              <div style={{ padding: '12px 24px', borderTop: '1px solid #E5E5E5', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <PageBtn label="‹ Anterior" disabled={histPage === 1} onClick={() => setHistPage(p => p - 1)} />
                {Array.from({ length: Math.min(histTotal, 7) }, (_, i) => i + 1).map(p => (
                  <PageBtn key={p} label={String(p)} active={p === histPage} onClick={() => setHistPage(p)} />
                ))}
                <PageBtn label="Próximo ›" disabled={histPage === histTotal} onClick={() => setHistPage(p => p + 1)} />
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Table (aba conhecimento) ── */}
      {activeTab === 'knowledge' && <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#82829B', fontSize: 14 }}>Carregando...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 14, color: '#82829B' }}>Nenhum treinamento encontrado</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E5E5' }}>
                <th style={th}>Conteúdo</th>
                <th style={{ ...th, width: 130 }}>Categoria</th>
                <th style={{ ...th, width: 80  }}>Tipo</th>
                <th style={{ ...th, width: 220 }}>Fonte</th>
                <th style={{ ...th, width: 110 }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((item, idx) => {
                const catKey  = getCat(item, cats)
                const catInfo = catKey ? CATEGORIES[catKey] : null
                const preview = previewText(item)
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid #F3F4F6', background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#F5F3FF'}
                    onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#FAFAFA'}>

                    {/* Conteúdo */}
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        {isNew(item) && (
                          <span style={{
                            flexShrink: 0, background: '#10B981', color: '#fff',
                            fontSize: 9, fontWeight: 800, padding: '2px 6px',
                            borderRadius: 4, letterSpacing: '0.5px', marginTop: 2,
                          }}>NOVO</span>
                        )}
                        <div style={{ fontSize: 13, color: '#111827', lineHeight: 1.5 }}>
                          {preview
                            ? <>{preview.slice(0, 100)}{preview.length > 100 ? <span style={{ color: '#9CA3AF' }}>...</span> : ''}</>
                            : <span style={{ color: '#9CA3AF', fontStyle: 'italic' }}>sem conteúdo</span>
                          }
                        </div>
                      </div>
                    </td>

                    {/* Categoria */}
                    <td style={td}>
                      {catInfo ? (
                        <span style={{ background: catInfo.bg, color: catInfo.color, border: `1px solid ${catInfo.color}30`, borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>
                          {catInfo.label}
                        </span>
                      ) : (
                        <span style={{ color: '#D1D5DB', fontSize: 12 }}>—</span>
                      )}
                    </td>

                    {/* Tipo */}
                    <td style={td}>
                      <span style={{ background: TYPE_COLORS[item.type] + '22', color: TYPE_COLORS[item.type], borderRadius: 5, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                        {TYPE_LABELS[item.type] || item.type}
                      </span>
                    </td>

                    {/* Fonte */}
                    <td style={td}>
                      {item.website ? (
                        <a href={item.website} target="_blank" rel="noreferrer"
                          style={{ color: '#7C3AED', fontSize: 12, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: 200 }}>
                          {item.website.replace(/^https?:\/\//, '').slice(0, 40)}
                        </a>
                      ) : (
                        <span style={{ color: '#D1D5DB', fontSize: 12 }}>—</span>
                      )}
                    </td>

                    {/* Ações */}
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => openEdit(item)}
                          style={{ background: 'none', border: '1px solid #E5E5E5', borderRadius: 6, padding: '4px 10px', fontSize: 12, color: '#4B5563', cursor: 'pointer', fontWeight: 500 }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = '#7C3AED'; e.currentTarget.style.color = '#7C3AED' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E5E5'; e.currentTarget.style.color = '#4B5563' }}>
                          Editar
                        </button>
                        <button onClick={() => handleDelete(item)}
                          style={{ background: 'none', border: '1px solid #E5E5E5', borderRadius: 6, padding: '4px 10px', fontSize: 12, color: '#9CA3AF', cursor: 'pointer' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = '#FCA5A5'; e.currentTarget.style.color = '#DC2626' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E5E5'; e.currentTarget.style.color = '#9CA3AF' }}>
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>}

      {/* ── Pagination (aba conhecimento) ── */}
      {activeTab === 'knowledge' && totalPages > 1 && (
        <div style={{ padding: '12px 24px', borderTop: '1px solid #E5E5E5', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <PageBtn label="‹ Anterior" disabled={page === 1} onClick={() => setPage(p => p - 1)} />
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <PageBtn key={p} label={String(p)} active={p === page} onClick={() => setPage(p)} />
          ))}
          <PageBtn label="Próximo ›" disabled={page === totalPages} onClick={() => setPage(p => p + 1)} />
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Modal ── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div style={{ background: '#fff', borderRadius: 12, width: 580, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>

            {/* Modal header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #E5E5E5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0A0A0A' }}>
                {modalMode === 'new' ? '+ Novo Treinamento' : '✏️ Editar Treinamento'}
              </div>
              <button onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', fontSize: 20, color: '#9CA3AF', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            {/* Modal body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <ModalField label="Tipo" style={{ flex: 1 }}>
                  <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} style={inputSt}>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </ModalField>
                <ModalField label="Categoria CODEX" style={{ flex: 1 }}>
                  <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                    style={{ ...inputSt, borderColor: CATEGORIES[form.category]?.color || '#E5E5E5', color: CATEGORIES[form.category]?.color }}>
                    {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </ModalField>
              </div>

              {form.type === 'URL' ? (
                <ModalField label="URL">
                  <input
                    value={form.website}
                    onChange={e => { setForm(p => ({ ...p, website: e.target.value })); setCatSuggestion(null) }}
                    onBlur={e => triggerSuggest(e.target.value)}
                    placeholder="https://..." style={inputSt} />
                  {suggesting && (
                    <div style={{ marginTop: 6, fontSize: 12, color: '#7C3AED', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid #7C3AED', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                      Analisando URL para sugerir categoria...
                    </div>
                  )}
                  {catSuggestion && !suggesting && (
                    <div style={{ marginTop: 8, background: '#F5F3FF', border: '1px solid #C4B5FD', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14 }}>🤖</span>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 12, color: '#5B21B6', fontWeight: 700 }}>Categoria sugerida pela IA: </span>
                        <span style={{ fontSize: 12, color: '#7C3AED', fontWeight: 800 }}>{CATEGORIES[catSuggestion.categoria]?.label}</span>
                        {catSuggestion.motivo && <span style={{ fontSize: 11, color: '#8B5CF6', marginLeft: 4 }}>— {catSuggestion.motivo}</span>}
                      </div>
                      <button onClick={() => setCatSuggestion(null)}
                        style={{ background: 'none', border: 'none', fontSize: 14, color: '#A78BFA', cursor: 'pointer', lineHeight: 1 }}>×</button>
                    </div>
                  )}
                </ModalField>
              ) : (
                <ModalField label="Conteúdo">
                  <textarea value={form.text} onChange={e => setForm(p => ({ ...p, text: e.target.value }))}
                    rows={12} placeholder="Digite o conteúdo do treinamento..."
                    style={{ ...inputSt, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }} />
                </ModalField>
              )}
            </div>

            {/* Modal footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid #E5E5E5', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setShowModal(false)}
                style={{ background: '#F7F7F7', border: '1px solid #E5E5E5', borderRadius: 8, padding: '8px 18px', fontSize: 13, color: '#4B5563', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{ background: '#7C3AED', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 600, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Salvando...' : modalMode === 'new' ? '✓ Criar' : '✓ Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de edição de entrada local */}
      {localEditEntry && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 14, width: 620, maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 24px', borderBottom: '1px solid #F0F0F0' }}>
              <button onClick={() => setLocalEditEntry(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#6B7280', lineHeight: 1 }}>‹</button>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Editar conhecimento</span>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              {/* Título — nosso diferencial de busca */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Título</label>
                <input value={localEditTitle} onChange={e => setLocalEditTitle(e.target.value)}
                  style={{ width: '100%', border: '1px solid #E5E7EB', borderRadius: 8, padding: '9px 12px', fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
                  onFocus={e => e.target.style.borderColor = '#0EC331'}
                  onBlur={e => e.target.style.borderColor = '#E5E7EB'} />
              </div>

              {/* Conteúdo — igual Dealism, textarea grande */}
              <div style={{ marginBottom: 20 }}>
                <textarea value={localEditContent} onChange={e => setLocalEditContent(e.target.value)} rows={10}
                  style={{ width: '100%', border: '1px solid #E5E7EB', borderRadius: 8, padding: '10px 12px', fontSize: 13, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, outline: 'none' }}
                  onFocus={e => e.target.style.borderColor = '#0EC331'}
                  onBlur={e => e.target.style.borderColor = '#E5E7EB'} />
              </div>

              {/* Categoria — tags clicáveis estilo Dealism */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 10 }}>Categoria:</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {Object.entries(CATEGORIES).map(([k, v]) => {
                    const active = localEditCategory === k
                    return (
                      <button key={k} onClick={() => setLocalEditCategory(k)}
                        style={{
                          padding: '5px 14px', borderRadius: 9999, fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
                          background: active ? v.bg : '#F9FAFB',
                          color: active ? v.color : '#6B7280',
                          border: `1.5px solid ${active ? v.color : '#E5E7EB'}`,
                        }}>
                        {v.label.toLowerCase()}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Fonte — read-only estilo Dealism */}
              {localEditEntry.source && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Fonte:</label>
                  <p style={{ margin: 0, fontSize: 13, color: '#6B7280', wordBreak: 'break-all' }}>{localEditEntry.source}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #F0F0F0', display: 'flex', gap: 10 }}>
              <button onClick={handleLocalEditSave} disabled={localEditSaving}
                style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: '#0EC331', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: localEditSaving ? 0.7 : 1 }}>
                {localEditSaving ? 'Salvando...' : 'Save'}
              </button>
              <button onClick={() => setLocalEditEntry(null)}
                style={{ padding: '10px 24px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', fontSize: 14, color: '#374151', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────────

function Pill({ label, active, onClick, color }) {
  return (
    <button onClick={onClick} style={{
      border: `1px solid ${active ? color : '#E5E5E5'}`,
      borderRadius: 9999, padding: '4px 12px', fontSize: 12, fontWeight: 500,
      cursor: 'pointer', background: active ? color : '#fff',
      color: active ? '#fff' : '#6B7280', transition: 'all 0.15s',
    }}>
      {label}
    </button>
  )
}

function PageBtn({ label, active, disabled, onClick }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      border: '1px solid #E5E5E5', borderRadius: 8, padding: '6px 12px', fontSize: 13,
      cursor: disabled ? 'not-allowed' : 'pointer',
      background: active ? '#7C3AED' : '#fff',
      color: active ? '#fff' : disabled ? '#D1D5DB' : '#4B5563',
      fontWeight: active ? 700 : 400,
    }}>
      {label}
    </button>
  )
}

function ModalField({ label, children, style }) {
  return (
    <div style={style}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#82829B', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  )
}

const th = { padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left' }
const td = { padding: '12px 16px', verticalAlign: 'middle' }
const inputSt = { width: '100%', border: '1px solid #E5E5E5', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#0A0A0A', outline: 'none', boxSizing: 'border-box', background: '#fff', fontFamily: 'inherit' }
