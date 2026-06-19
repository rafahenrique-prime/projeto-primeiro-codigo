import { useState, useEffect, useRef } from 'react'
import { useTheme } from '../theme.jsx'
import { listAgents, listTrainings, getAgent } from '../services/gptmaker'
import { askAgentSim, generateStressQuestion, auditConversation } from '../services/groq'

const STRESS_SCENARIOS = [
  { label: '💰 Pediu desconto', text: 'Tem algum desconto? Vi que na concorrência tá mais barato.' },
  { label: '📦 Produto específico', text: 'Vocês têm Nike Air Max 270 no 42?' },
  { label: '🔄 Troca/devolução', text: 'Comprei semana passada mas não serviu, como faço pra trocar?' },
  { label: '😠 Cliente bravo', text: 'Faz 2 semanas e meu pedido não chegou! Isso é um absurdo!' },
]

export default function AgentLabPage() {
  const { theme: t } = useTheme()
  const [agents, setAgents] = useState([])
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [agentDetail, setAgentDetail] = useState(null)
  const [trainings, setTrainings] = useState([])
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingAgent, setLoadingAgent] = useState(true)
  const [audit, setAudit] = useState(null)
  const [auditing, setAuditing] = useState(false)
  const [generatingQ, setGeneratingQ] = useState(false)
  const [useKnowledge, setUseKnowledge] = useState(true)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    const style = document.createElement('style')
    style.id = 'lab-bounce'
    style.textContent = `@keyframes labDot{0%,80%,100%{transform:scale(0);opacity:0.3}40%{transform:scale(1);opacity:1}}`
    if (!document.getElementById('lab-bounce')) document.head.appendChild(style)
    return () => document.getElementById('lab-bounce')?.remove()
  }, [])

  useEffect(() => {
    loadAgents()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function loadAgents() {
    setLoadingAgent(true)
    try {
      const list = await listAgents()
      setAgents(list)
      if (list.length > 0) await pickAgent(list[0])
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingAgent(false)
    }
  }

  async function pickAgent(agent) {
    setSelectedAgent(agent)
    setMessages([])
    setAudit(null)
    setAgentDetail(null)
    // Carrega detalhe e treinamentos independentemente — falha em um não bloqueia o outro
    const [detailRes, trRes] = await Promise.allSettled([
      getAgent(agent.id),
      listTrainings(agent.id),
    ])
    if (detailRes.status === 'fulfilled') setAgentDetail(detailRes.value)
    if (trRes.status === 'fulfilled') setTrainings(trRes.value)
    else setTrainings([])
  }

  async function send(text) {
    const msg = (text !== undefined ? text : input).trim()
    if (!msg || loading) return
    setInput('')

    const userMsg = { from: 'user', text: msg, ts: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const reply = await askAgentSim(
        agentDetail || selectedAgent,
        useKnowledge ? trainings : [],
        msg,
        messages
      )
      setMessages(prev => [...prev, { from: 'agent', text: reply, ts: Date.now() }])
    } catch (e) {
      setMessages(prev => [...prev, { from: 'agent', text: '❌ Erro ao contatar o agente. Tente novamente.', ts: Date.now() }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  async function handleGenerateQ() {
    setGeneratingQ(true)
    try {
      const q = await generateStressQuestion(selectedAgent || {}, trainings, messages)
      setInput(q)
      inputRef.current?.focus()
    } catch (e) {
      console.error(e)
    } finally {
      setGeneratingQ(false)
    }
  }

  async function handleAudit() {
    if (messages.length < 2) return
    setAuditing(true)
    try {
      const result = await auditConversation(selectedAgent || {}, messages)
      setAudit(result)
    } catch (e) {
      console.error(e)
    } finally {
      setAuditing(false)
    }
  }

  function clearChat() {
    setMessages([])
    setAudit(null)
  }

  const agentName = selectedAgent?.name || 'Agente'
  const agentInitials = agentName.slice(0, 2).toUpperCase()

  return (
    <div style={{ flex: 1, display: 'flex', gap: 12, overflow: 'hidden', minWidth: 0 }}>
      {/* ── Chat ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: t.bg, borderRadius: 12, border: `1px solid ${t.border}`, overflow: 'hidden', minWidth: 0 }}>

        {/* Header */}
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 12, background: t.navBg, flexShrink: 0 }}>
          <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
            {agentInitials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {agents.length > 1 ? (
              <select
                value={selectedAgent?.id || ''}
                onChange={e => { const a = agents.find(x => x.id === e.target.value); if (a) pickAgent(a) }}
                style={{ fontSize: 15, fontWeight: 700, color: t.text, background: 'transparent', border: 'none', cursor: 'pointer', outline: 'none', padding: 0, maxWidth: '100%' }}
              >
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            ) : (
              <div style={{ fontSize: 15, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agentName}</div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: loadingAgent ? '#F59E0B' : '#10B981', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: loadingAgent ? '#F59E0B' : '#10B981', fontWeight: 500 }}>
                {loadingAgent ? 'Carregando...' : 'AI Ativo'}
              </span>
              {!loadingAgent && trainings.length > 0 && (
                <span style={{ fontSize: 11, color: t.textMuted }}>· {trainings.length} treinamentos</span>
              )}
            </div>
          </div>
          {/* Toggle Conhecimento */}
          <button
            onClick={() => setUseKnowledge(v => !v)}
            title={useKnowledge ? 'Desativar base de conhecimento' : 'Ativar base de conhecimento'}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px',
              borderRadius: 20, border: `1.5px solid ${useKnowledge ? '#10B981' : t.border}`,
              background: useKnowledge ? '#ECFDF5' : t.bgTertiary,
              cursor: 'pointer', flexShrink: 0, transition: 'all 0.2s',
            }}
          >
            {/* pill switch */}
            <div style={{ width: 28, height: 16, borderRadius: 8, background: useKnowledge ? '#10B981' : '#D1D5DB', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
              <div style={{ position: 'absolute', top: 2, left: useKnowledge ? 14 : 2, width: 12, height: 12, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: useKnowledge ? '#059669' : t.textMuted, whiteSpace: 'nowrap' }}>
              Conhecimento
            </span>
          </button>

          <button
            onClick={clearChat}
            title="Limpar conversa"
            style={{ background: 'none', border: `1px solid ${t.border}`, borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: t.textMuted, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
          >
            🗑️ Limpar
          </button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 8, background: '#ece5dd' }}>
          {messages.length === 0 && !loading && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: 0.55, paddingTop: 60 }}>
              <div style={{ fontSize: 40 }}>🧪</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#555' }}>Teste de Agente</div>
              <div style={{ fontSize: 13, color: '#666', textAlign: 'center', lineHeight: 1.6 }}>
                Digite como se fosse um cliente<br />
                ou use <b>⚡ Gerar</b> para um stress test automático
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.from === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '70%',
                background: m.from === 'user' ? '#dcf8c6' : '#fff',
                borderRadius: m.from === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                padding: '8px 12px 6px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
                fontSize: 14,
                lineHeight: 1.5,
                color: '#111',
                wordBreak: 'break-word',
              }}>
                {m.text}
                <div style={{ fontSize: 10, color: '#999', textAlign: 'right', marginTop: 3 }}>
                  {new Date(m.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  {m.from === 'user' && <span style={{ marginLeft: 4 }}>✓✓</span>}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ background: '#fff', borderRadius: '12px 12px 12px 2px', padding: '12px 16px', boxShadow: '0 1px 2px rgba(0,0,0,0.1)', display: 'flex', gap: 5, alignItems: 'center' }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: '#888', animation: `labDot 1.3s ${i * 0.2}s ease-in-out infinite` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Scenario pills */}
        <div style={{ padding: '8px 12px', borderTop: `1px solid ${t.border}`, display: 'flex', gap: 6, overflowX: 'auto', background: t.bg, flexShrink: 0 }}>
          {STRESS_SCENARIOS.map(s => (
            <button
              key={s.label}
              onClick={() => send(s.text)}
              disabled={loading}
              style={{ whiteSpace: 'nowrap', fontSize: 11, padding: '5px 10px', borderRadius: 20, background: t.bgTertiary, border: `1px solid ${t.border}`, cursor: 'pointer', color: t.textSecondary, flexShrink: 0 }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Input */}
        <div style={{ padding: '10px 12px', borderTop: `1px solid ${t.border}`, display: 'flex', gap: 8, background: t.bg, flexShrink: 0, alignItems: 'center' }}>
          <button
            onClick={handleGenerateQ}
            disabled={generatingQ || loadingAgent}
            title="Gerar pergunta de stress test"
            style={{ padding: '0 14px', height: 40, borderRadius: 10, border: `1px solid ${t.border}`, background: t.bgTertiary, cursor: 'pointer', fontSize: 12, color: t.textSecondary, whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {generatingQ ? '...' : '⚡ Gerar'}
          </button>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Digite como cliente..."
            disabled={loadingAgent}
            style={{ flex: 1, height: 40, borderRadius: 10, border: `1px solid ${t.border}`, padding: '0 14px', fontSize: 14, background: t.bgSecondary, color: t.text, outline: 'none', minWidth: 0 }}
          />
          <button
            onClick={() => send()}
            disabled={loading || !input.trim() || loadingAgent}
            style={{ width: 40, height: 40, borderRadius: 10, border: 'none', background: loading || !input.trim() ? '#ccc' : '#25D366', cursor: loading || !input.trim() ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.15s' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Sidebar Auditoria ── */}
      <div style={{ width: 290, display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>

        {/* Audit card */}
        <div style={{ background: t.bg, borderRadius: 12, border: `1px solid ${t.border}`, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>🔍 Auditoria CODEX</div>
          <button
            onClick={handleAudit}
            disabled={auditing || messages.length < 2}
            style={{ width: '100%', padding: '10px 0', borderRadius: 8, border: 'none', background: messages.length >= 2 && !auditing ? '#7C3AED' : t.bgTertiary, color: messages.length >= 2 ? '#fff' : t.textMuted, fontWeight: 600, fontSize: 13, cursor: messages.length >= 2 && !auditing ? 'pointer' : 'not-allowed', transition: 'background 0.15s' }}
          >
            {auditing ? '⏳ Analisando...' : '▶ Analisar Conversa'}
          </button>
          {messages.length < 2 && (
            <div style={{ fontSize: 11, color: t.textMuted, textAlign: 'center' }}>Precisa de pelo menos 1 troca para auditar</div>
          )}
          {audit && <AuditResult audit={audit} t={t} />}
        </div>

        {/* Session info */}
        <div style={{ background: t.bg, borderRadius: 12, border: `1px solid ${t.border}`, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 10 }}>📊 Sessão</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              ['Agente', agentName],
              ['Mensagens', messages.length],
              ['Treinamentos', useKnowledge ? trainings.length : '— desativado'],
              ['Trocas', Math.floor(messages.length / 2)],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: t.textMuted }}>{label}</span>
                <span style={{ color: t.text, fontWeight: 600 }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Dicas */}
        <div style={{ background: t.bg, borderRadius: 12, border: `1px solid ${t.border}`, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 8 }}>💡 Como testar</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              'Digite como se fosse um cliente real',
              'Use os cenários rápidos abaixo do chat',
              'Clique em ⚡ Gerar para um teste aleatório',
              'Após a conversa, clique em Analisar para o score CODEX',
            ].map((tip, i) => (
              <div key={i} style={{ fontSize: 11, color: t.textSecondary, display: 'flex', gap: 6, lineHeight: 1.5 }}>
                <span style={{ color: '#7C3AED', flexShrink: 0 }}>{i + 1}.</span>
                <span>{tip}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function AuditResult({ audit, t }) {
  if (!audit?.score && audit?.score !== 0) return null
  const score = audit.score ?? 0
  const scoreColor = score >= 8 ? '#10B981' : score >= 6 ? '#F59E0B' : '#EF4444'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
      {/* Score circle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 54, height: 54, borderRadius: '50%', background: `${scoreColor}18`, border: `3px solid ${scoreColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: scoreColor, flexShrink: 0 }}>
          {score}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.text }}>Score Geral</div>
          {audit.resumo && (
            <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2, lineHeight: 1.4 }}>
              {audit.resumo.slice(0, 90)}{audit.resumo.length > 90 ? '…' : ''}
            </div>
          )}
        </div>
      </div>

      {/* 3 critérios */}
      {[
        { key: 'tom',   label: '🎭 Tom de Voz' },
        { key: 'dados', label: '📋 Fidelidade' },
        { key: 'funil', label: '🎯 Funil' },
      ].map(({ key, label }) => {
        const item = audit[key]
        if (!item) return null
        const nota = item.nota ?? 0
        const nc = nota >= 8 ? '#10B981' : nota >= 6 ? '#F59E0B' : '#EF4444'
        return (
          <div key={key} style={{ background: t.bgSecondary, borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: t.text }}>{label}</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: nc }}>{nota}/10</span>
            </div>
            <div style={{ height: 4, background: t.border, borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: 4, background: nc, borderRadius: 2, width: `${nota * 10}%`, transition: 'width 0.6s ease' }} />
            </div>
            {item.observacao && (
              <div style={{ fontSize: 10, color: t.textMuted, marginTop: 4, lineHeight: 1.4 }}>{item.observacao}</div>
            )}
          </div>
        )
      })}

      {/* Pontos fortes */}
      {audit.pontos_fortes?.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#10B981', marginBottom: 4 }}>✅ Pontos fortes</div>
          {audit.pontos_fortes.map((p, i) => (
            <div key={i} style={{ fontSize: 11, color: t.textSecondary, padding: '2px 0', lineHeight: 1.4 }}>• {p}</div>
          ))}
        </div>
      )}

      {/* Melhorar */}
      {audit.melhorar?.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#EF4444', marginBottom: 4 }}>⚠️ A melhorar</div>
          {audit.melhorar.map((p, i) => (
            <div key={i} style={{ fontSize: 11, color: t.textSecondary, padding: '2px 0', lineHeight: 1.4 }}>• {p}</div>
          ))}
        </div>
      )}
    </div>
  )
}
