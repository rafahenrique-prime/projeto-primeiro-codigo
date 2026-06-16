import { useState, useEffect } from 'react'
import { listAgents, listChannels, updateAgent, activateAgent, deactivateAgent } from '../services/gptmaker'

export default function AgentsPage() {
  const [agents, setAgents] = useState([])
  const [channels, setChannels] = useState([])
  const [selected, setSelected] = useState(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [ag, ch] = await Promise.all([listAgents(), listChannels()])
      setAgents(ag)
      setChannels(ch)
      if (ag.length > 0) setSelected(ag[0])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const startEdit = () => { setDraft({ ...selected }); setEditing(true) }

  const saveEdit = async () => {
    setSaving(true)
    try {
      await updateAgent(draft.id, {
        name: draft.name,
        behavior: draft.behavior,
        jobDescription: draft.jobDescription,
        jobSite: draft.jobSite,
        jobName: draft.jobName,
      })
      setAgents(prev => prev.map(a => a.id === draft.id ? { ...a, ...draft } : a))
      setSelected({ ...selected, ...draft })
      setEditing(false)
    } catch (e) {
      alert('Erro ao salvar: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (agent) => {
    try {
      if (agent.status === 'ACTIVE') {
        await deactivateAgent(agent.id)
        const updated = { ...agent, status: 'DISABLED' }
        setAgents(prev => prev.map(a => a.id === agent.id ? updated : a))
        if (selected?.id === agent.id) setSelected(updated)
      } else {
        await activateAgent(agent.id)
        const updated = { ...agent, status: 'ACTIVE' }
        setAgents(prev => prev.map(a => a.id === agent.id ? updated : a))
        if (selected?.id === agent.id) setSelected(updated)
      }
    } catch (e) {
      alert('Erro: ' + e.message)
    }
  }

  const agentChannels = (agentId) => channels.filter(c => c.agentId === agentId)
  const initials = (name) => name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', borderRadius: 8 }}>
      <div style={{ fontSize: 14, color: '#82829B' }}>Carregando agentes...</div>
    </div>
  )

  if (error) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: '#fff', borderRadius: 8 }}>
      <div style={{ fontSize: 32 }}>⚠️</div>
      <div style={{ fontSize: 14, color: '#EF4444' }}>{error}</div>
      <button onClick={load} style={{ background: '#0EC331', border: 'none', borderRadius: 8, padding: '8px 20px', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Tentar novamente</button>
    </div>
  )

  return (
    <div style={{ flex: 1, display: 'flex', gap: 12, overflow: 'hidden' }}>

      {/* Lista de agentes */}
      <div style={{ width: 260, background: '#fff', borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #E5E5E5' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0A0A0A', marginBottom: 10 }}>Agentes</div>
          <button style={{ width: '100%', background: '#0EC331', border: 'none', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer' }}>
            + Novo Agente
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {agents.map(agent => (
            <div key={agent.id} onClick={() => { setSelected(agent); setEditing(false) }}
              style={{ padding: '12px 16px', borderBottom: '1px solid #E5E5E5', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center', background: selected?.id === agent.id ? '#F7F7F7' : '#fff' }}>
              <img src={agent.avatar} alt="" style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0 }} onError={e => e.target.style.display='none'} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A' }}>{agent.name}</div>
                <div style={{ fontSize: 11, color: '#82829B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{agent.jobName}</div>
              </div>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: agent.status === 'ACTIVE' ? '#0EC331' : '#E5E5E5', flexShrink: 0 }} />
            </div>
          ))}
        </div>
      </div>

      {/* Detalhe do agente */}
      {selected && (
        <div style={{ flex: 1, background: '#fff', borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E5E5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img src={selected.avatar} alt="" style={{ width: 48, height: 48, borderRadius: '50%' }} />
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0A0A0A' }}>{selected.name}</div>
                <div style={{ fontSize: 12, color: '#82829B', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: selected.status === 'ACTIVE' ? '#0EC331' : '#E5E5E5', display: 'inline-block' }} />
                  {selected.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => toggleActive(selected)}
                style={{ background: '#F7F7F7', border: '1px solid #E5E5E5', borderRadius: 8, padding: '6px 14px', fontSize: 13, color: '#4B5563', cursor: 'pointer' }}>
                {selected.status === 'ACTIVE' ? '⏸ Pausar' : '▶ Ativar'}
              </button>
              {!editing && <button onClick={startEdit} style={{ background: '#F7F7F7', border: '1px solid #E5E5E5', borderRadius: 8, padding: '6px 14px', fontSize: 13, color: '#4B5563', cursor: 'pointer' }}>✏️ Editar</button>}
              {editing && <>
                <button onClick={() => setEditing(false)} style={{ background: '#F7F7F7', border: '1px solid #E5E5E5', borderRadius: 8, padding: '6px 14px', fontSize: 13, color: '#4B5563', cursor: 'pointer' }}>Cancelar</button>
                <button onClick={saveEdit} disabled={saving} style={{ background: '#0EC331', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 13, color: '#fff', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Salvando...' : '✓ Salvar'}
                </button>
              </>}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Canais vinculados */}
            <Field label="Canais vinculados">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {agentChannels(selected.id).map(ch => (
                  <span key={ch.id} style={{ background: ch.connected ? '#EFFDF4' : '#FFF7F0', border: `1px solid ${ch.connected ? '#B9F8CF' : '#FED7AA'}`, borderRadius: 9999, padding: '4px 12px', fontSize: 12, color: ch.connected ? '#0EC331' : '#EA580C', fontWeight: 500 }}>
                    {ch.type === 'INSTAGRAM' ? '📸' : '💬'} {ch.name}
                  </span>
                ))}
                {agentChannels(selected.id).length === 0 && <span style={{ fontSize: 12, color: '#82829B' }}>Nenhum canal vinculado</span>}
              </div>
            </Field>

            {/* Nome */}
            <Field label="Nome do agente">
              {editing
                ? <input value={draft.name} onChange={e => setDraft(p => ({...p, name: e.target.value}))} style={inputStyle} />
                : <div style={valueStyle}>{selected.name}</div>}
            </Field>

            {/* Empresa */}
            <Field label="Empresa / Loja">
              {editing
                ? <input value={draft.jobName} onChange={e => setDraft(p => ({...p, jobName: e.target.value}))} style={inputStyle} />
                : <div style={valueStyle}>{selected.jobName}</div>}
            </Field>

            {/* Site */}
            <Field label="Site">
              {editing
                ? <input value={draft.jobSite} onChange={e => setDraft(p => ({...p, jobSite: e.target.value}))} style={inputStyle} />
                : <div style={valueStyle}>{selected.jobSite}</div>}
            </Field>

            {/* Descrição */}
            <Field label="Descrição da empresa">
              {editing
                ? <textarea value={draft.jobDescription} onChange={e => setDraft(p => ({...p, jobDescription: e.target.value}))} rows={4} style={{...inputStyle, resize: 'vertical'}} />
                : <div style={valueStyle}>{selected.jobDescription}</div>}
            </Field>

            {/* Comportamento / Prompt */}
            <Field label="Comportamento (System Prompt)">
              {editing
                ? <textarea value={draft.behavior} onChange={e => setDraft(p => ({...p, behavior: e.target.value}))} rows={10} style={{...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12}} />
                : <div style={{...valueStyle, fontFamily: 'monospace', fontSize: 12, background: '#F7F7F7', borderRadius: 8, padding: 12, whiteSpace: 'pre-wrap'}}>{selected.behavior}</div>}
            </Field>
          </div>
        </div>
      )}
    </div>
  )
}

const inputStyle = { width: '100%', background: '#fff', border: '1px solid #E5E5E5', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#0A0A0A', outline: 'none', boxSizing: 'border-box' }
const valueStyle = { fontSize: 13, color: '#141413', lineHeight: 1.6 }

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#82829B', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  )
}
