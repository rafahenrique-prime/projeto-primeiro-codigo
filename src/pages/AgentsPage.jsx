import { useState, useEffect } from 'react'
import { listAgents, listChannels, updateAgent, activateAgent, deactivateAgent } from '../services/gptmaker'

const t = {
  card: '#FFFFFF',
  cardBorder: '#E5E5E5',
  bg: '#F9F9FB',
  text: '#0A0A0A',
  textMuted: '#82829B',
  primary: '#0EC331',
  secondary: '#6366F1',
  info: '#2185FF',
}

const ROTEIRO_TEMPLATE = `## ROTEIRO DE VENDA (siga as etapas em ordem, sem pular)
1. Identifique a intenção do cliente em 1-2 interações.
2. Responda com base no catálogo e políticas verificadas — nunca invente produto, preço ou prazo.
3. Pergunte o objetivo/uso principal do produto.
4. Faça 1 pergunta de restrição adicional (tamanho, cor, orçamento).
5. Recomende um único produto (ou registre para atendimento humano se não achar).
6. Explique 1-2 benefícios reais e verificados do produto.
7. Confirme variação, tamanho, cor e quantidade.
8. Informe preço e promoções vigentes.
9. Explique condições de entrega e pagamento.
10. Envie o link de checkout.
11. Peça confirmação após o pagamento.
12. Informe o status do pedido quando solicitado.

## SEMPRE FAÇA
- Responda apenas com dados reais do catálogo e da base de conhecimento.
- Seja direto e objetivo — no máximo 2-3 frases por resposta.

## NUNCA FAÇA
- Nunca invente preço, estoque ou prazo de entrega.
- Nunca prometa desconto sem confirmação da política vigente.
- Nunca repita a mesma pergunta já respondida pelo cliente.`

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
    <div style={{ flex: 1, display: 'flex', gap: 16, overflow: 'hidden', padding: 16, background: t.bg }}>

      {/* Lista de agentes - MELHORADA */}
      <div style={{ width: 280, background: t.card, borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0, border: `1px solid ${t.cardBorder}`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ padding: '16px', borderBottom: `1px solid ${t.cardBorder}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            🤖 Agentes <span style={{ fontSize: 12, fontWeight: 500, color: t.textMuted }}>({agents.length})</span>
          </div>
          <button style={{ width: '100%', background: t.primary, border: 'none', borderRadius: 8, padding: '10px 12px', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', transition: 'all 0.2s' }}>
            ➕ Novo Agente
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {agents.map(agent => {
            const numChannels = channels.filter(c => c.agentId === agent.id).length
            return (
              <div key={agent.id} onClick={() => { setSelected(agent); setEditing(false) }}
                style={{
                  padding: '12px', margin: '8px', borderRadius: 10, cursor: 'pointer',
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                  background: selected?.id === agent.id ? '#F0F4FF' : t.card,
                  border: `1.5px solid ${selected?.id === agent.id ? t.secondary : t.cardBorder}`,
                  transition: 'all 0.15s'
                }}>
                <img src={agent.avatar} alt="" style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }} onError={e => e.target.style.display='none'} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{agent.name}</div>
                  <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{agent.jobName}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, background: agent.status === 'ACTIVE' ? '#EFFDF4' : '#F3F4F6', color: agent.status === 'ACTIVE' ? t.primary : '#9CA3AF', padding: '2px 8px', borderRadius: 4 }}>
                      {agent.status === 'ACTIVE' ? '🟢 Ativo' : '⚫ Inativo'}
                    </span>
                    {numChannels > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 600, background: '#EFF6FF', color: t.info, padding: '2px 8px', borderRadius: 4 }}>
                        📱 {numChannels}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Detalhe do agente - NOVO LAYOUT */}
      {selected && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Header Card - Status + Actions */}
          <div style={{ background: t.card, borderRadius: 12, border: `1px solid ${t.cardBorder}`, padding: '20px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <img src={selected.avatar} alt="" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${selected.status === 'ACTIVE' ? t.primary : '#D1D5DB'}` }} />
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: t.text }}>{selected.name}</div>
                <div style={{ fontSize: 13, color: t.textMuted, marginTop: 4 }}>
                  {selected.jobName} • {selected.jobSite && <span>{selected.jobSite}</span>}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ background: selected.status === 'ACTIVE' ? '#EFFDF4' : '#F3F4F6', color: selected.status === 'ACTIVE' ? t.primary : '#9CA3AF', padding: '4px 12px', borderRadius: 20, fontSize: 11 }}>
                    {selected.status === 'ACTIVE' ? '🟢 Ativo' : '⚫ Inativo'}
                  </span>
                  {agentChannels(selected.id).length > 0 && (
                    <span style={{ background: '#EFF6FF', color: t.info, padding: '4px 12px', borderRadius: 20, fontSize: 11 }}>
                      📱 {agentChannels(selected.id).length} canal{agentChannels(selected.id).length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => toggleActive(selected)}
                style={{ background: selected.status === 'ACTIVE' ? '#FEF3C7' : '#DBEAFE', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, color: selected.status === 'ACTIVE' ? '#92400E' : '#0C4A6E', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>
                {selected.status === 'ACTIVE' ? '⏸ Pausar' : '▶ Ativar'}
              </button>
              {!editing && <button onClick={startEdit} style={{ background: t.secondary, border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, color: '#fff', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>✏️ Editar</button>}
              {editing && <>
                <button onClick={() => setEditing(false)} style={{ background: '#F3F4F6', border: `1px solid ${t.cardBorder}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, color: t.text, cursor: 'pointer' }}>Cancelar</button>
                <button onClick={saveEdit} disabled={saving} style={{ background: t.primary, border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, color: '#fff', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Salvando...' : '✓ Salvar'}
                </button>
              </>}
            </div>
          </div>

          {/* Scroll area com cards */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Card: Canais vinculados */}
            {agentChannels(selected.id).length > 0 && (
              <CardSection title="📱 Canais Vinculados" color="#EFF6FF" borderColor={t.info}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {agentChannels(selected.id).map(ch => (
                    <span key={ch.id} style={{ background: ch.connected ? '#EFFDF4' : '#FEE2E2', border: `1px solid ${ch.connected ? '#B9F8CF' : '#FECACA'}`, borderRadius: 20, padding: '6px 14px', fontSize: 12, color: ch.connected ? '#065F46' : '#991B1B', fontWeight: 600 }}>
                      {ch.type === 'INSTAGRAM' ? '📸' : ch.type === 'TELEGRAM' ? '✈️' : '💬'} {ch.name}
                    </span>
                  ))}
                </div>
              </CardSection>
            )}

            {/* Card: Informações da Empresa */}
            <CardSection title="🏢 Informações da Empresa" color="#F0F9FF" borderColor={t.info}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Field label="Empresa / Loja">
                  {editing
                    ? <input value={draft.jobName} onChange={e => setDraft(p => ({...p, jobName: e.target.value}))} style={inputStyle} />
                    : <div style={valueStyle}>{selected.jobName}</div>}
                </Field>
                <Field label="Site">
                  {editing
                    ? <input value={draft.jobSite} onChange={e => setDraft(p => ({...p, jobSite: e.target.value}))} style={inputStyle} />
                    : <div style={valueStyle}>{selected.jobSite || '—'}</div>}
                </Field>
              </div>
              <Field label="Descrição">
                {editing
                  ? <textarea value={draft.jobDescription} onChange={e => setDraft(p => ({...p, jobDescription: e.target.value}))} rows={3} style={{...inputStyle, resize: 'vertical'}} />
                  : <div style={valueStyle}>{selected.jobDescription}</div>}
              </Field>
            </CardSection>

            {/* Card: Comportamento (Destaque) */}
            <CardSection title="🧠 Comportamento (System Prompt)" color="#FEF3C7" borderColor="#F59E0B" highlight>
              {editing && (
                <button
                  onClick={() => setDraft(p => ({ ...p, behavior: `${p.behavior ? p.behavior + '\n\n' : ''}${ROTEIRO_TEMPLATE}` }))}
                  style={{ marginBottom: 10, background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, color: '#4F46E5', cursor: 'pointer' }}
                  title="Insere um roteiro de venda estruturado em etapas, no estilo Dealism"
                >
                  📋 Aplicar Roteiro Estruturado
                </button>
              )}
              {editing
                ? <textarea value={draft.behavior} onChange={e => setDraft(p => ({...p, behavior: e.target.value}))} rows={10} style={{...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12}} />
                : <div style={{...valueStyle, fontFamily: 'monospace', fontSize: 12, background: '#1F2937', color: '#E5E7EB', borderRadius: 8, padding: 12, whiteSpace: 'pre-wrap', overflow: 'auto', maxHeight: '300px', border: '1px solid #374151'}}>{selected.behavior}</div>}
            </CardSection>

          </div>
        </div>
      )}
    </div>
  )
}

const inputStyle = { width: '100%', background: '#fff', border: `1px solid ${t.cardBorder}`, borderRadius: 8, padding: '10px 12px', fontSize: 13, color: t.text, outline: 'none', boxSizing: 'border-box', transition: 'border 0.2s' }
const valueStyle = { fontSize: 13, color: t.text, lineHeight: 1.6 }

function CardSection({ title, color, borderColor, highlight, children }) {
  return (
    <div style={{
      background: color,
      border: `1.5px solid ${borderColor || t.cardBorder}`,
      borderRadius: 12,
      padding: 16,
      boxShadow: highlight ? '0 2px 8px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.05)',
    }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6, display: 'block' }}>{label}</label>
      {children}
    </div>
  )
}
