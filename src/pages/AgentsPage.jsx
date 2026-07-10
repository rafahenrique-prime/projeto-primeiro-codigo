import { useState, useEffect, useRef } from 'react'
import { useTheme } from '../theme.jsx'
import { listAgents, listChannels, updateAgent, activateAgent, deactivateAgent, testAgentConversation, testChatId, deleteChat } from '../services/chat/gptmaker'
import { clearAvatarCache } from '../services/plataforma/avatarCacheService'

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

const PREVIEW_TTL_MS = 10 * 60 * 1000

export default function AgentsPage() {
  const { theme: tt, dark } = useTheme()
  const [agents, setAgents] = useState([])
  const [channels, setChannels] = useState([])
  const [selected, setSelected] = useState(null)
  const [draft, setDraft] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [showClearAvatars, setShowClearAvatars] = useState(false)
  const [clearPassword, setClearPassword] = useState('')
  const [clearingAvatars, setClearingAvatars] = useState(false)
  const [clearError, setClearError] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [ag, ch] = await Promise.all([listAgents(), listChannels()])
      setAgents(ag)
      setChannels(ch)
      if (ag.length > 0) {
        setSelected(ag[0])
        setDraft({ ...ag[0] })
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function selectAgent(agent) {
    setSelected(agent)
    setDraft({ ...agent })
  }

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
    } catch (e) {
      alert('Erro ao salvar: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const CLEAR_AVATARS_PASSWORD = 'CONFIRMAR'

  const handleClearAvatars = async () => {
    if (clearPassword.trim().toUpperCase() !== CLEAR_AVATARS_PASSWORD) {
      setClearError('Digite exatamente "CONFIRMAR" pra prosseguir.')
      return
    }
    setClearingAvatars(true)
    setClearError(null)
    try {
      await clearAvatarCache()
      setShowClearAvatars(false)
      setClearPassword('')
    } catch (e) {
      setClearError('Erro ao apagar: ' + e.message)
    } finally {
      setClearingAvatars(false)
    }
  }

  const toggleActive = async (agent) => {
    try {
      if (agent.status === 'ACTIVE') {
        await deactivateAgent(agent.id)
        const updated = { ...agent, status: 'DISABLED' }
        setAgents(prev => prev.map(a => a.id === agent.id ? updated : a))
        if (selected?.id === agent.id) { setSelected(updated); setDraft(d => ({ ...d, status: 'DISABLED' })) }
      } else {
        await activateAgent(agent.id)
        const updated = { ...agent, status: 'ACTIVE' }
        setAgents(prev => prev.map(a => a.id === agent.id ? updated : a))
        if (selected?.id === agent.id) { setSelected(updated); setDraft(d => ({ ...d, status: 'ACTIVE' })) }
      }
    } catch (e) {
      alert('Erro: ' + e.message)
    }
  }

  const agentChannels = (agentId) => channels.filter(c => c.agentId === agentId)
  const initials = (name) => name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: tt.bg, borderRadius: 12 }}>
      <div style={{ fontSize: 13, color: tt.textMuted }}>Carregando agentes...</div>
    </div>
  )

  if (error) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: tt.bg, borderRadius: 12 }}>
      <div style={{ fontSize: 13, color: '#DC2626' }}>{error}</div>
      <button onClick={load} style={{ background: tt.primary || '#E8192C', border: 'none', borderRadius: 8, padding: '8px 18px', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Tentar novamente</button>
    </div>
  )

  const dirty = selected && draft && (
    draft.name !== selected.name || draft.behavior !== selected.behavior ||
    draft.jobDescription !== selected.jobDescription || draft.jobSite !== selected.jobSite ||
    draft.jobName !== selected.jobName
  )

  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '220px 1fr 300px', gap: 14, overflow: 'hidden', padding: 14, background: tt.appBg }}>

      {/* Coluna 1 — Lista de agentes */}
      <div style={{ background: tt.bg, borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', border: `1px solid ${tt.border}` }}>
        <div style={{ padding: 12, borderBottom: `1px solid ${tt.border}` }}>
          <button style={{ width: '100%', background: tt.primary || '#E8192C', border: 'none', borderRadius: 8, padding: '9px 12px', fontSize: 13, fontWeight: 500, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <IcoPlus size={14} /> Criar agente
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {agents.map(agent => {
            const active = selected?.id === agent.id
            return (
              <div key={agent.id} onClick={() => selectAgent(agent)}
                style={{
                  padding: '9px 10px', borderRadius: 8, cursor: 'pointer',
                  display: 'flex', gap: 8, alignItems: 'center',
                  background: active ? (tt.primaryBg || '#fff5f5') : 'transparent',
                  border: `1px solid ${active ? (tt.primary || '#E8192C') : 'transparent'}`,
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = tt.bgTertiary }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
                {agent.avatar
                  ? <img src={agent.avatar} alt="" style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }} onError={e => e.target.style.display = 'none'} />
                  : <div style={{ width: 32, height: 32, borderRadius: '50%', background: tt.bgTertiary, color: tt.textMid, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{initials(agent.name)}</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: active ? (tt.primary || '#E8192C') : tt.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.name}</div>
                  <div style={{ fontSize: 11, color: tt.textMuted, display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: agent.status === 'ACTIVE' ? '#10B981' : tt.textMuted, flexShrink: 0 }} />
                    {agent.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ padding: 8, borderTop: `1px solid ${tt.border}` }}>
          <button onClick={() => { setShowClearAvatars(true); setClearError(null); setClearPassword('') }}
            style={{ width: '100%', background: 'none', border: `1px solid ${tt.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 12, color: tt.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            onMouseEnter={e => { e.currentTarget.style.color = tt.primary || '#E8192C'; e.currentTarget.style.borderColor = tt.primary || '#E8192C' }}
            onMouseLeave={e => { e.currentTarget.style.color = tt.textMuted; e.currentTarget.style.borderColor = tt.border }}>
            <IcoTrash size={13} /> Apagar avatares em cache
          </button>
        </div>
      </div>

      {showClearAvatars && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => !clearingAvatars && setShowClearAvatars(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: tt.bg, borderRadius: 12, padding: 20, width: 320, boxShadow: '0 10px 40px rgba(0,0,0,0.25)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: tt.text, marginBottom: 4 }}>Apagar avatares em cache?</div>
            <div style={{ fontSize: 12, color: tt.textMuted, marginBottom: 14 }}>
              Isso apaga todas as fotos salvas no Storage. As fotos voltam a ser buscadas da origem (WhatsApp/Instagram) na próxima vez que cada conversa abrir. Digite <strong>CONFIRMAR</strong> pra prosseguir.
            </div>
            <input
              type="text"
              value={clearPassword}
              onChange={e => setClearPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleClearAvatars()}
              placeholder="Digite CONFIRMAR"
              autoFocus
              style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${tt.border}`, borderRadius: 8, padding: '9px 12px', fontSize: 13, color: tt.text, background: tt.inputBg || tt.bg, outline: 'none', marginBottom: 8 }}
            />
            {clearError && <div style={{ fontSize: 12, color: '#E8192C', marginBottom: 8 }}>{clearError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowClearAvatars(false)} disabled={clearingAvatars}
                style={{ flex: 1, background: 'none', border: `1px solid ${tt.border}`, borderRadius: 8, padding: '9px 0', fontSize: 12, color: tt.textMid, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleClearAvatars} disabled={clearingAvatars || !clearPassword}
                style={{ flex: 1, background: tt.primary || '#E8192C', border: 'none', borderRadius: 8, padding: '9px 0', fontSize: 12, fontWeight: 600, color: '#fff', cursor: clearingAvatars ? 'not-allowed' : 'pointer', opacity: clearingAvatars || !clearPassword ? 0.6 : 1 }}>
                {clearingAvatars ? 'Apagando...' : 'CONFIRMAR'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Coluna 2 — Configuração */}
      {selected && draft && (
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 500, color: tt.text }}>Configuração do agente</div>
              <div style={{ fontSize: 12, color: tt.textMuted, marginTop: 2 }}>Identidade, tom de voz e objetivo comercial</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => toggleActive(selected)}
                style={{ background: tt.bgTertiary, border: `1px solid ${tt.border}`, borderRadius: 8, padding: '8px 14px', fontSize: 12, color: tt.textSecondary, fontWeight: 500, cursor: 'pointer' }}>
                {selected.status === 'ACTIVE' ? 'Pausar' : 'Ativar'}
              </button>
              <button onClick={saveEdit} disabled={saving || !dirty}
                style={{ background: dirty ? (tt.primary || '#E8192C') : tt.bgTertiary, border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12, color: dirty ? '#fff' : tt.textMuted, fontWeight: 500, cursor: dirty ? 'pointer' : 'default' }}>
                {saving ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </div>

          {agentChannels(selected.id).length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {agentChannels(selected.id).map(ch => (
                <span key={ch.id} style={{ background: ch.connected ? '#F0FDF4' : '#FEF2F2', border: `1px solid ${ch.connected ? '#BBF7D0' : '#FECACA'}`, borderRadius: 6, padding: '4px 10px', fontSize: 11, color: ch.connected ? '#166534' : '#991B1B', fontWeight: 500 }}>
                  {ch.name}
                </span>
              ))}
            </div>
          )}

          <Card t={tt} title="Informações básicas">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <Field label="Nome" t={tt}>
                <input value={draft.name || ''} onChange={e => setDraft(p => ({ ...p, name: e.target.value }))} style={inputStyle(tt)} />
              </Field>
              <Field label="Empresa / loja" t={tt}>
                <input value={draft.jobName || ''} onChange={e => setDraft(p => ({ ...p, jobName: e.target.value }))} style={inputStyle(tt)} />
              </Field>
            </div>
            <Field label="Site" t={tt}>
              <input value={draft.jobSite || ''} onChange={e => setDraft(p => ({ ...p, jobSite: e.target.value }))} style={inputStyle(tt)} />
            </Field>
            <Field label="Descrição" t={tt}>
              <textarea value={draft.jobDescription || ''} onChange={e => setDraft(p => ({ ...p, jobDescription: e.target.value }))} rows={3} style={{ ...inputStyle(tt), resize: 'vertical' }} />
            </Field>
          </Card>

          <Card t={tt} title="Comportamento (system prompt)">
            <button
              onClick={() => setDraft(p => ({ ...p, behavior: `${p.behavior ? p.behavior + '\n\n' : ''}${ROTEIRO_TEMPLATE}` }))}
              style={{ marginBottom: 10, background: tt.bgTertiary, border: `1px solid ${tt.border}`, borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 500, color: tt.textSecondary, cursor: 'pointer' }}
              title="Insere um roteiro de venda estruturado em etapas"
            >
              Aplicar roteiro estruturado
            </button>
            <textarea value={draft.behavior || ''} onChange={e => setDraft(p => ({ ...p, behavior: e.target.value }))} rows={10}
              style={{ ...inputStyle(tt), resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }} />
          </Card>
        </div>
      )}

      {/* Coluna 3 — Preview ao vivo */}
      {selected && <LivePreview agent={selected} t={tt} dark={dark} />}
    </div>
  )
}

function LivePreview({ agent, t, dark }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const contextIdRef = useRef(null)
  const expiresAtRef = useRef(null)
  const [expiresIn, setExpiresIn] = useState(null)

  useEffect(() => {
    setMessages([])
    contextIdRef.current = null
    expiresAtRef.current = null
    setExpiresIn(null)
    return () => cleanup()
  }, [agent.id])

  useEffect(() => {
    if (!expiresAtRef.current) return
    const iv = setInterval(() => {
      const remaining = expiresAtRef.current - Date.now()
      if (remaining <= 0) {
        cleanup()
        setMessages([])
        setExpiresIn(null)
      } else {
        setExpiresIn(Math.ceil(remaining / 60000))
      }
    }, 15000)
    return () => clearInterval(iv)
  }, [expiresAtRef.current])

  async function cleanup() {
    if (contextIdRef.current) {
      const chatId = testChatId(agent.id, contextIdRef.current)
      deleteChat(chatId)
      contextIdRef.current = null
    }
  }

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setSending(true)
    if (!contextIdRef.current) {
      contextIdRef.current = `preview-${Date.now()}`
      expiresAtRef.current = Date.now() + PREVIEW_TTL_MS
      setExpiresIn(Math.ceil(PREVIEW_TTL_MS / 60000))
    }
    setMessages(m => [...m, { role: 'user', text }])
    try {
      const res = await testAgentConversation(agent.id, text, contextIdRef.current)
      if (res.success === false) {
        const friendly = res.error === 'assistant is disabled' ? 'Este agente está inativo — ative-o para testar.' : res.error
        setMessages(m => [...m, { role: 'agent', text: friendly, isError: true }])
      } else {
        setMessages(m => [...m, { role: 'agent', text: res.message || '(sem texto na resposta)' }])
      }
    } catch (e) {
      setMessages(m => [...m, { role: 'agent', text: 'Erro ao testar: ' + e.message }])
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 11, color: t.textMuted }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: contextIdRef.current ? '#10B981' : t.textMuted }} />
        {contextIdRef.current ? `Preview isolado · some em ${expiresIn ?? 10} min` : 'Preview isolado — não some no Inbox'}
      </div>
      {/* Moldura de celular fina */}
      <div style={{ flex: 1, background: t.bgSecondary, borderRadius: 22, border: `2px solid ${t.borderMid || t.border}`, padding: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{ width: 44, height: 5, borderRadius: 4, background: t.borderMid || t.border }} />
        </div>
        <div style={{ flex: 1, background: t.bg, borderRadius: 14, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8, borderBottom: `1px solid ${t.border}` }}>
            {agent.avatar
              ? <img src={agent.avatar} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }} />
              : <div style={{ width: 24, height: 24, borderRadius: '50%', background: t.primary || '#E8192C', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600 }}>{agent.name?.slice(0, 2).toUpperCase()}</div>}
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: t.text }}>{agent.name}</div>
              <div style={{ fontSize: 10, color: '#10B981' }}>Testando ao vivo</div>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {messages.length === 0 && (
              <div style={{ fontSize: 12, color: t.textMuted, textAlign: 'center', marginTop: 20 }}>Digite uma mensagem para testar o agente ao vivo.</div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                background: m.role === 'user' ? (t.primary || '#E8192C') : m.isError ? '#FEF2F2' : t.bgSecondary,
                color: m.role === 'user' ? '#fff' : m.isError ? '#DC2626' : t.text,
                border: m.role === 'user' ? 'none' : `1px solid ${m.isError ? '#FECACA' : t.border}`,
                borderRadius: 10, padding: '8px 10px', fontSize: 12, maxWidth: '85%',
              }}>{m.text}</div>
            ))}
            {sending && <div style={{ alignSelf: 'flex-start', fontSize: 11, color: t.textMuted }}>Digitando...</div>}
          </div>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="Digite para testar..."
            disabled={sending}
            style={{ width: '100%', border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 12, background: t.bgSecondary, color: t.text, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
      </div>
    </div>
  )
}

function Card({ title, t, children }) {
  return (
    <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: t.text, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  )
}

function Field({ label, t, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 11, color: t.textMuted, marginBottom: 4, display: 'block' }}>{label}</label>
      {children}
    </div>
  )
}

function inputStyle(t) {
  return { width: '100%', background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, color: t.text, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
}

function IcoPlus({ size = 14 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg> }
function IcoTrash({ size = 13 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg> }
