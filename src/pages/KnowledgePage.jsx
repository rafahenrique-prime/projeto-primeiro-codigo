import { useState, useEffect } from 'react'
import { listAgents, listTrainings, createTraining, updateTraining, deleteTraining } from '../services/gptmaker'
import { suggestCategory } from '../services/groq'
import { extractAndSaveKnowledge } from '../services/knowledgeExtractor'
import { saveCreated, getCreatedAt, isNew } from '../services/knowledgeTimestamps'

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
  const [activeTab, setActiveTab]         = useState('knowledge') // 'knowledge' | 'history'
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
  }, [])

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
      const result = await extractAndSaveKnowledge(
        extractUrl.trim(),
        ({ msg }) => setExtractLog(prev => [...prev, msg]),
        items
      )
      setExtractResult(result)
    } catch (e) {
      setExtractError(e.message)
    } finally {
      setExtracting(false)
    }
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
            { key: 'knowledge', label: 'Base de Conhecimento', icon: '📚' },
            { key: 'extract',   label: 'Extrair da URL',       icon: '🔗' },
            { key: 'history',   label: 'Histórico de Upload',  icon: '🕐' },
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

      {/* ── Extrair da URL ── */}
      {activeTab === 'extract' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Descrição */}
          <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 10, padding: '14px 18px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#5B21B6', marginBottom: 6 }}>📥 Como funciona</div>
            <div style={{ fontSize: 13, color: '#6D28D9', lineHeight: 1.7 }}>
              Cole a URL do seu site → os produtos do catálogo são formatados em blocos <strong>Produto + Preço</strong> → gera um arquivo <strong>.md</strong> pronto para upload no Dealism. Basta baixar e enviar via "Adicionar por arquivo".
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {['1. Informe a URL', '2. Clique em Gerar Arquivo', '3. Baixe o .md', '4. Suba no Dealism'].map((s, i) => (
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
                  : '📄 Gerar Arquivo'}
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
                ✅ Arquivo gerado!
              </div>
              <div style={{ fontSize: 12, color: '#047857', marginBottom: 14 }}>
                {extractResult.produtos_encontrados} produtos formatados em blocos Produto + Preço — prontos para upload no Dealism.
              </div>

              {/* Botão de download destacado */}
              <button onClick={handleDownload}
                style={{ background: '#059669', border: 'none', borderRadius: 10, padding: '12px 28px', fontSize: 15, fontWeight: 800, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                ⬇️ Baixar arquivo .md
              </button>

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

      {/* ── Histórico de Upload ── */}
      {activeTab === 'history' && (() => {
        const histItems = [...items].sort((a, b) => getCreatedAt(b) - getCreatedAt(a))
        const histTotal = Math.max(1, Math.ceil(histItems.length / HIST_PER_PAGE))
        const histPaged = histItems.slice((histPage - 1) * HIST_PER_PAGE, histPage * HIST_PER_PAGE)
        return (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Resumo */}
            <div style={{ display: 'flex', gap: 12, padding: '14px 24px', background: '#F9FAFB', borderBottom: '1px solid #E5E5E5', flexWrap: 'wrap' }}>
              {[
                { label: 'Total de uploads', value: items.length, color: '#7C3AED' },
                { label: 'URLs', value: items.filter(i => i.type === 'URL').length, color: '#8B5CF6' },
                { label: 'Textos', value: items.filter(i => i.type === 'TEXT').length, color: '#3B82F6' },
                { label: 'Arquivos', value: items.filter(i => i.type === 'FILE').length, color: '#F59E0B' },
                { label: 'Adicionados hoje', value: items.filter(i => { const ts = getCreatedAt(i); return ts > 0 && Date.now() - ts < 24*60*60*1000 }).length, color: '#10B981' },
              ].map(s => (
                <div key={s.label} style={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: 8, padding: '8px 16px', minWidth: 100 }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: '#82829B', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Tabela histórico */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loading ? (
                <div style={{ padding: 60, textAlign: 'center', color: '#82829B', fontSize: 14 }}>Carregando...</div>
              ) : histItems.length === 0 ? (
                <div style={{ padding: 60, textAlign: 'center' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                  <div style={{ fontSize: 14, color: '#82829B' }}>Nenhum upload registrado</div>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E5E5' }}>
                      <th style={th}>#</th>
                      <th style={th}>Data / Hora</th>
                      <th style={th}>Fonte / Conteúdo</th>
                      <th style={{ ...th, width: 80 }}>Tipo</th>
                      <th style={{ ...th, width: 130 }}>Categoria</th>
                      <th style={{ ...th, width: 110 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {histPaged.map((item, idx) => {
                      const ts      = getCreatedAt(item)
                      const date    = ts ? new Date(ts) : null
                      const catKey  = getCat(item, cats)
                      const catInfo = catKey ? CATEGORIES[catKey] : null
                      const isToday = date && new Date().toDateString() === date.toDateString()
                      const source  = item.website || previewText(item)
                      const globalIdx = (histPage - 1) * HIST_PER_PAGE + idx + 1
                      return (
                        <tr key={item.id}
                          style={{ borderBottom: '1px solid #F3F4F6', background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#F5F3FF'}
                          onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#FAFAFA'}>
                          <td style={{ ...td, color: '#D1D5DB', fontSize: 12, width: 40 }}>{globalIdx}</td>
                          <td style={{ ...td, whiteSpace: 'nowrap' }}>
                            {date ? (
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
                                  {isToday ? 'Hoje' : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                </div>
                                <div style={{ fontSize: 11, color: '#82829B', marginTop: 2 }}>
                                  {date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </div>
                            ) : (
                              <span style={{ color: '#D1D5DB', fontSize: 12 }}>—</span>
                            )}
                          </td>
                          <td style={td}>
                            {item.website ? (
                              <a href={item.website} target="_blank" rel="noreferrer"
                                style={{ color: '#7C3AED', fontSize: 13, textDecoration: 'none', display: 'block', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                🔗 {item.website.replace(/^https?:\/\//, '')}
                              </a>
                            ) : (
                              <div style={{ fontSize: 13, color: '#374151', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {source || <span style={{ color: '#9CA3AF', fontStyle: 'italic' }}>sem conteúdo</span>}
                              </div>
                            )}
                          </td>
                          <td style={td}>
                            <span style={{ background: TYPE_COLORS[item.type] + '22', color: TYPE_COLORS[item.type], borderRadius: 5, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                              {TYPE_LABELS[item.type] || item.type}
                            </span>
                          </td>
                          <td style={td}>
                            {catInfo ? (
                              <span style={{ background: catInfo.bg, color: catInfo.color, border: `1px solid ${catInfo.color}30`, borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>
                                {catInfo.label}
                              </span>
                            ) : <span style={{ color: '#D1D5DB', fontSize: 12 }}>—</span>}
                          </td>
                          <td style={td}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
                              ✓ Concluído
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Paginação histórico */}
            {histTotal > 1 && (
              <div style={{ padding: '12px 24px', borderTop: '1px solid #E5E5E5', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <PageBtn label="‹ Anterior" disabled={histPage === 1} onClick={() => setHistPage(p => p - 1)} />
                {Array.from({ length: histTotal }, (_, i) => i + 1).map(p => (
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
