import { useState, useEffect } from 'react'
import { listAgents, listTrainings, createTraining, updateTraining, deleteTraining } from '../services/gptmaker'

const TYPE_LABELS = { TEXT: 'Texto', URL: 'URL', FILE: 'Arquivo', QA: 'Pergunta/Resposta' }
const TYPE_COLORS = { TEXT: '#3B82F6', URL: '#8B5CF6', FILE: '#F59E0B', QA: '#0EC331' }

export default function KnowledgePage() {
  const [agents, setAgents] = useState([])
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [newItem, setNewItem] = useState({ type: 'TEXT', text: '', website: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')

  useEffect(() => {
    listAgents().then(ag => {
      setAgents(ag)
      if (ag.length > 0) setSelectedAgent(ag[0])
    })
  }, [])

  useEffect(() => {
    if (selectedAgent) loadTrainings()
  }, [selectedAgent])

  async function loadTrainings() {
    setLoading(true)
    setSelected(null)
    try {
      const data = await listTrainings(selectedAgent.id)
      setItems(data)
      if (data.length > 0) setSelected(data[0])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const filtered = items.filter(it => {
    const matchType = typeFilter === 'ALL' || it.type === typeFilter
    const text = (it.text || it.website || it.documentName || '').toLowerCase()
    const matchSearch = !search || text.includes(search.toLowerCase())
    return matchType && matchSearch
  })

  const startEdit = () => { setDraft({ ...selected }); setEditing(true) }

  const saveEdit = async () => {
    setSaving(true)
    try {
      await updateTraining(draft.id, { text: draft.text })
      setItems(prev => prev.map(it => it.id === draft.id ? { ...it, text: draft.text } : it))
      setSelected({ ...selected, text: draft.text })
      setEditing(false)
    } catch (e) {
      alert('Erro ao salvar: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Deletar este treinamento?')) return
    try {
      await deleteTraining(id)
      const next = items.filter(it => it.id !== id)
      setItems(next)
      setSelected(next[0] || null)
    } catch (e) {
      alert('Erro ao deletar: ' + e.message)
    }
  }

  const handleCreate = async () => {
    if (!newItem.text && !newItem.website) return
    setSaving(true)
    try {
      const created = await createTraining(selectedAgent.id, newItem)
      await loadTrainings()
      setShowNew(false)
      setNewItem({ type: 'TEXT', text: '', website: '' })
    } catch (e) {
      alert('Erro ao criar: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const preview = (item) => {
    if (item.type === 'URL') return item.website || ''
    if (item.type === 'FILE') return item.documentName || ''
    return (item.text || '').slice(0, 80)
  }

  const title = (item) => {
    const p = preview(item)
    return p.slice(0, 50) + (p.length > 50 ? '...' : '')
  }

  return (
    <div style={{ flex: 1, display: 'flex', gap: 12, overflow: 'hidden' }}>

      {/* Lista */}
      <div style={{ width: 310, background: '#fff', borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>

        {/* Seletor de agente */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #E5E5E5' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0A0A0A', marginBottom: 8 }}>Base de Conhecimento</div>
          <select
            value={selectedAgent?.id || ''}
            onChange={e => setSelectedAgent(agents.find(a => a.id === e.target.value))}
            style={{ width: '100%', border: '1px solid #E5E5E5', borderRadius: 8, padding: '6px 10px', fontSize: 13, color: '#0A0A0A', outline: 'none', background: '#F7F7F7', marginBottom: 8 }}
          >
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar..."
            style={{ width: '100%', border: '1px solid #E5E5E5', borderRadius: 8, padding: '7px 10px', fontSize: 13, color: '#0A0A0A', outline: 'none', boxSizing: 'border-box', marginBottom: 8 }}
          />
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {['ALL', 'TEXT', 'URL', 'FILE', 'QA'].map(t => (
              <button key={t} onClick={() => setTypeFilter(t)}
                style={{ border: 'none', borderRadius: 9999, padding: '3px 9px', fontSize: 11, fontWeight: 500, cursor: 'pointer', background: typeFilter === t ? '#0EC331' : '#F7F7F7', color: typeFilter === t ? '#fff' : '#4B5563' }}>
                {t === 'ALL' ? 'Todos' : TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: '8px 14px', borderBottom: '1px solid #E5E5E5' }}>
          <button onClick={() => setShowNew(true)} style={{ width: '100%', background: '#0EC331', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer' }}>
            + Novo Treinamento
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading
            ? <div style={{ padding: 24, textAlign: 'center', color: '#82829B', fontSize: 13 }}>Carregando...</div>
            : filtered.length === 0
              ? <div style={{ padding: 24, textAlign: 'center', color: '#82829B', fontSize: 13 }}>Nenhum treinamento</div>
              : filtered.map(item => (
                <div key={item.id} onClick={() => { setSelected(item); setEditing(false) }}
                  style={{ padding: '10px 14px', borderBottom: '1px solid #E5E5E5', cursor: 'pointer', background: selected?.id === item.id ? '#F7F7F7' : '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ background: TYPE_COLORS[item.type] || '#6B7280', color: '#fff', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{item.type}</span>
                    {item.image && <span style={{ fontSize: 10, color: '#82829B' }}>🖼️</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#4B5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {title(item)}
                  </div>
                </div>
              ))
          }
        </div>

        <div style={{ padding: '8px 14px', borderTop: '1px solid #E5E5E5', fontSize: 12, color: '#82829B', textAlign: 'center' }}>
          {items.length} treinamentos · {selectedAgent?.name}
        </div>
      </div>

      {/* Detalhe */}
      <div style={{ flex: 1, background: '#fff', borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {showNew ? (
          <>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E5E5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Novo Treinamento</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowNew(false)} style={btnSecondary}>Cancelar</button>
                <button onClick={handleCreate} disabled={saving} style={btnPrimary}>{saving ? 'Salvando...' : '✓ Criar'}</button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Field label="Tipo">
                <select value={newItem.type} onChange={e => setNewItem(p => ({ ...p, type: e.target.value }))} style={inputStyle}>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              {newItem.type === 'URL' ? (
                <Field label="URL do site">
                  <input value={newItem.website} onChange={e => setNewItem(p => ({ ...p, website: e.target.value }))} placeholder="https://..." style={inputStyle} />
                </Field>
              ) : (
                <Field label="Conteúdo do treinamento">
                  <textarea value={newItem.text} onChange={e => setNewItem(p => ({ ...p, text: e.target.value }))}
                    rows={14} placeholder="Digite o conteúdo do treinamento..." style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }} />
                </Field>
              )}
            </div>
          </>
        ) : selected ? (
          <>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E5E5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ background: TYPE_COLORS[selected.type], color: '#fff', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>{TYPE_LABELS[selected.type] || selected.type}</span>
                {selected.image && <span style={{ fontSize: 13, color: '#82829B' }}>🖼️ com imagem</span>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => handleDelete(selected.id)} style={{ ...btnSecondary, color: '#EF4444', borderColor: '#FCA5A5' }}>🗑 Deletar</button>
                {!editing && selected.type === 'TEXT' && <button onClick={startEdit} style={btnSecondary}>✏️ Editar</button>}
                {editing && <>
                  <button onClick={() => setEditing(false)} style={btnSecondary}>Cancelar</button>
                  <button onClick={saveEdit} disabled={saving} style={btnPrimary}>{saving ? 'Salvando...' : '✓ Salvar'}</button>
                </>}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {selected.image && (
                <Field label="Imagem vinculada">
                  <img src={selected.image} alt="" style={{ maxWidth: 300, borderRadius: 8, border: '1px solid #E5E5E5' }} />
                </Field>
              )}
              {selected.type === 'URL' ? (
                <Field label="URL">
                  <a href={selected.website} target="_blank" rel="noreferrer" style={{ color: '#3B82F6', fontSize: 13 }}>{selected.website}</a>
                </Field>
              ) : selected.type === 'FILE' ? (
                <Field label="Arquivo">
                  <a href={selected.documentUrl} target="_blank" rel="noreferrer" style={{ color: '#3B82F6', fontSize: 13 }}>{selected.documentName}</a>
                </Field>
              ) : (
                <Field label="Conteúdo">
                  {editing
                    ? <textarea value={draft.text} onChange={e => setDraft(p => ({ ...p, text: e.target.value }))}
                        rows={16} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }} />
                    : <pre style={{ fontSize: 13, color: '#141413', lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{selected.text}</pre>
                  }
                </Field>
              )}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#82829B', fontSize: 14 }}>
            Selecione um treinamento
          </div>
        )}
      </div>
    </div>
  )
}

const inputStyle = { width: '100%', border: '1px solid #E5E5E5', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#0A0A0A', outline: 'none', boxSizing: 'border-box', background: '#fff' }
const btnPrimary = { background: '#0EC331', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 13, color: '#fff', fontWeight: 600, cursor: 'pointer' }
const btnSecondary = { background: '#F7F7F7', border: '1px solid #E5E5E5', borderRadius: 8, padding: '6px 14px', fontSize: 13, color: '#4B5563', cursor: 'pointer' }

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#82829B', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  )
}
