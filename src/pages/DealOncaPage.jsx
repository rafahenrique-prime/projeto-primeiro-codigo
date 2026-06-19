import { useState, useRef, useEffect } from 'react'
import { askCODEX, detectSaveIntent } from '../services/groq'
import { listChannels, getChatMessages, listAgents, listTrainings, createTraining } from '../services/gptmaker'
import { searchProduct } from '../services/catalog'

const CATEGORIES = {
  PRODUTO:    { label: 'Produto',    color: '#3B82F6' },
  PRECO:      { label: 'Preço',      color: '#0EC331' },
  FAQ:        { label: 'FAQ',        color: '#8B5CF6' },
  ESTRATEGIA: { label: 'Estratégia', color: '#F59E0B' },
  POLITICA:   { label: 'Política',   color: '#EF4444' },
  GUIA:       { label: 'Guia',       color: '#14B8A6' },
  GERAL:      { label: 'Geral',      color: '#6B7280' },
}

const SUGGESTIONS = [
  'Quem está mais perto de comprar agora?',
  'Quais clientes estão sem resposta há mais tempo?',
  'Quais são as principais objeções hoje?',
  'Resumo rápido do funil de vendas',
]

const QUICK_ACTIONS = [
  { icon: '🔥', label: 'Leads quentes',    cmd: 'Quem está mais perto de comprar agora?' },
  { icon: '📭', label: 'Sem resposta',      cmd: 'Quais clientes estão aguardando resposta há mais tempo?' },
  { icon: '💸', label: 'Pediram desconto',  cmd: 'Quem pediu desconto ou contestou o preço?' },
  { icon: '🚚', label: 'Pediram frete',     cmd: 'Quem perguntou sobre frete e não finalizou?' },
  { icon: '📊', label: 'Funil de vendas',   cmd: 'Qual o estado atual do funil de vendas?' },
  { icon: '📅', label: 'Follow-up urgente', cmd: 'Quem precisa de follow-up urgente agora?' },
  { icon: '🧠', label: 'Objeções do dia',   cmd: 'Quais são as principais objeções de hoje?' },
  { icon: '📸', label: 'Instagram hoje',    cmd: 'Quantas pessoas chamaram hoje no Instagram?' },
  { icon: '💬', label: 'WhatsApp hoje',     cmd: 'Quantas pessoas chamaram hoje no WhatsApp?' },
]

export default function DealOncaPage({ conversations = [] }) {
  const [channels, setChannels] = useState([])
  const [richConversations, setRichConversations] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [historyProgress, setHistoryProgress] = useState(0)
  const [trainings, setTrainings] = useState([])
  const [firstAgent, setFirstAgent] = useState(null)

  const WELCOME = {
    id: 0, from: 'codex',
    text: 'Olá, Rafael! Sou o **CODEX**, seu Diretor Comercial IA.\n\nEstou conectado às conversas da PRIME STORE e respondo com base nos dados reais — **sem inventar números**.\n\n✅ Analiso: leads quentes, funil, objeções, follow-up, quem sumiu\n✅ Salvo conhecimento: diga "Adiciona que..." e registro na base\n❌ Não tenho: vendas realizadas, valores financeiros, pagamentos\n\nPergunte ou me peça para salvar algo!',
    suggestions: SUGGESTIONS,
  }

  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem('codex_history')
      if (saved) return JSON.parse(saved)
    } catch {}
    return [WELCOME]
  })
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalogResults, setCatalogResults] = useState([])
  const bottomRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])
  useEffect(() => { listChannels().then(setChannels).catch(() => {}) }, [])
  useEffect(() => {
    try { localStorage.setItem('codex_history', JSON.stringify(messages)) } catch {}
  }, [messages])

  useEffect(() => {
    listAgents().then(agents => {
      if (agents.length > 0) {
        setFirstAgent(agents[0])
        listTrainings(agents[0].id).then(setTrainings).catch(() => {})
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (conversations.length === 0) return
    setLoadingHistory(true)
    setHistoryProgress(0)
    async function loadAll() {
      const results = []
      for (let i = 0; i < conversations.length; i++) {
        const conv = conversations[i]
        try {
          const msgs = await getChatMessages(conv.id)
          results.push({ ...conv, fullMessages: Array.isArray(msgs) ? msgs : [] })
        } catch {
          results.push({ ...conv, fullMessages: [] })
        }
        setHistoryProgress(Math.round(((i + 1) / conversations.length) * 100))
      }
      setRichConversations(results)
      setLoadingHistory(false)
    }
    loadAll()
  }, [conversations])

  const handleCatalogSearch = (q) => {
    setCatalogSearch(q)
    setCatalogResults(q.trim().length >= 2 ? searchProduct(q) : [])
  }

  const clearHistory = () => {
    localStorage.removeItem('codex_history')
    setMessages([WELCOME])
  }

  const reloadTrainings = () => {
    if (firstAgent) listTrainings(firstAgent.id).then(setTrainings).catch(() => {})
  }

  const send = async (text) => {
    const t = (text || input).trim()
    if (!t || loading) return
    setInput('')

    const saveIntent = detectSaveIntent(t)
    const userMsg = { id: Date.now(), from: 'user', text: t }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const history = messages.filter(m => m.from === 'user' || m.from === 'codex')
      const ctx = richConversations.length > 0 ? richConversations : conversations
      const reply = await askCODEX(t, history, ctx, trainings)
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        from: 'codex',
        text: reply,
        saveSuggestion: saveIntent.detected ? saveIntent : null,
      }])
    } catch (err) {
      setMessages(prev => [...prev, {
        id: Date.now() + 1, from: 'codex',
        text: `⚠️ Erro ao conectar com a IA: ${err.message}`,
      }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ flex: 1, background: '#fff', borderRadius: 8, display: 'flex', overflow: 'hidden' }}>

      {/* Chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #E5E5E5' }}>

        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E5E5', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#F0EBFF', border: '2px solid #7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CodexIcon size={24} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0A0A0A', letterSpacing: '0.5px' }}>CODEX</div>
            <div style={{ fontSize: 12, color: '#82829B', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 7, height: 7, background: '#7C3AED', borderRadius: '50%', display: 'inline-block' }} />
              Diretor Comercial IA · PRIME STORE · Groq / Llama 3.3
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {trainings.length > 0 && (
              <span style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 9999, padding: '4px 12px', fontSize: 12, color: '#7C3AED', display: 'flex', alignItems: 'center', gap: 5 }}>
                🧠 {trainings.length} na base
              </span>
            )}
            {loadingHistory ? (
              <span style={{ background: '#FFF8E1', border: '1px solid #FCD34D', borderRadius: 9999, padding: '4px 12px', fontSize: 12, color: '#92400E', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#F59E0B', display: 'inline-block' }} />
                Carregando... {historyProgress}%
              </span>
            ) : (
              <span style={{ background: '#EFFDF4', border: '1px solid #B9F8CF', borderRadius: 9999, padding: '4px 12px', fontSize: 12, color: '#0EC331', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#0EC331', display: 'inline-block' }} />
                {richConversations.length} conversas
              </span>
            )}
            <span style={{ background: '#FFF8E1', border: '1px solid #FFC300', borderRadius: 9999, padding: '4px 12px', fontSize: 12, color: '#856404' }}>
              🔔 {conversations.filter(c => c.unread > 0).length} não lidas
            </span>
            <button onClick={clearHistory} style={{ background: 'none', border: '1px solid #E5E5E5', borderRadius: 8, padding: '4px 10px', fontSize: 11, color: '#82829B', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              Limpar
            </button>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {messages.map(msg => (
            <ChatMessage
              key={msg.id}
              msg={msg}
              onSuggestion={send}
              agentId={firstAgent?.id}
              onSaveConfirmed={reloadTrainings}
            />
          ))}
          {loading && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #E5E5E5', flexShrink: 0 }}>
          <div style={{ background: '#fff', border: '1px solid #7C3AED', borderRadius: 16, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              rows={1}
              placeholder='Pergunte sobre clientes ou diga "Adiciona que..." para salvar na base...'
              style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 14, color: '#0A0A0A', outline: 'none', resize: 'none', fontFamily: 'inherit' }}
            />
            <button onClick={() => send()} disabled={loading}
              style={{ width: 34, height: 34, background: loading ? '#DDD6FE' : '#7C3AED', border: 'none', borderRadius: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: loading ? 'not-allowed' : 'pointer', transition: 'background 0.2s' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
          <div style={{ fontSize: 11, color: '#82829B', textAlign: 'center', marginTop: 6 }}>
            CODEX · Analisa conversas e gerencia base de conhecimento em tempo real
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div style={{ width: 240, padding: '20px 16px', overflowY: 'auto', background: '#F7F7F7', flexShrink: 0 }}>

        <div style={{ fontSize: 12, fontWeight: 600, color: '#82829B', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Análise Rápida</div>
        {QUICK_ACTIONS.map(item => (
          <button key={item.label} onClick={() => send(item.cmd)} disabled={loading}
            style={{ width: '100%', background: '#fff', border: '1px solid #E5E5E5', borderRadius: 10, padding: '9px 12px', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 8, cursor: loading ? 'not-allowed' : 'pointer', textAlign: 'left', opacity: loading ? 0.5 : 1 }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#F5F3FF' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}>
            <span style={{ fontSize: 15 }}>{item.icon}</span>
            <span style={{ fontSize: 12, color: '#141413' }}>{item.label}</span>
          </button>
        ))}

        <div style={{ fontSize: 12, fontWeight: 600, color: '#82829B', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '16px 0 6px', paddingTop: 12, borderTop: '1px solid #E5E5E5' }}>Salvar Conhecimento</div>
        <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 8 }}>Atalhos para o chat</div>
        {[
          { icon: '📦', label: 'Produto novo',   prefix: 'Adiciona que produto ' },
          { icon: '💰', label: 'Preço / promo',  prefix: 'Adiciona que o preço ' },
          { icon: '❓', label: 'Pergunta freq.', prefix: 'Adiciona que quando cliente perguntar ' },
          { icon: '⚡', label: 'Estratégia',     prefix: 'Adiciona que a estratégia ' },
          { icon: '📋', label: 'Política',       prefix: 'Adiciona que a política ' },
        ].map(item => (
          <button key={item.label} onClick={() => setInput(item.prefix)}
            style={{ width: '100%', background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 10, padding: '8px 12px', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', textAlign: 'left' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#EDE9FE' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#F5F3FF' }}>
            <span style={{ fontSize: 14 }}>{item.icon}</span>
            <span style={{ fontSize: 11, color: '#7C3AED', fontWeight: 500 }}>{item.label}</span>
          </button>
        ))}

        <div style={{ fontSize: 12, fontWeight: 600, color: '#82829B', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '16px 0 10px', paddingTop: 12, borderTop: '1px solid #E5E5E5' }}>Canais</div>
        {channels.length === 0
          ? <div style={{ fontSize: 12, color: '#9CA3AF' }}>Carregando...</div>
          : channels.map(ch => (
            <div key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12, color: '#141413' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#0EC331', flexShrink: 0 }} />
              {ch.name || ch.label || ch.type}
            </div>
          ))
        }

        <div style={{ fontSize: 12, fontWeight: 600, color: '#82829B', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '16px 0 10px', paddingTop: 12, borderTop: '1px solid #E5E5E5' }}>📦 Buscar Produtos</div>
        <input type="text" placeholder="Nike, New Balance..." value={catalogSearch}
          onChange={e => handleCatalogSearch(e.target.value)}
          style={{ width: '100%', borderRadius: 8, border: '1px solid #E5E5E5', padding: '8px 10px', fontSize: 12, marginBottom: 8, boxSizing: 'border-box', outline: 'none' }} />
        {catalogResults.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
            {catalogResults.map(prod => (
              <div key={prod.id} style={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: 6, padding: 8, cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = '#F5F3FF'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#0A0A0A' }}>{prod.nome}</div>
                <div style={{ fontSize: 11, color: '#82829B' }}>{prod.preco}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Chat Message ─────────────────────────────────────────────────────────────
function ChatMessage({ msg, onSuggestion, agentId, onSaveConfirmed }) {
  if (msg.from === 'user') {
    return (
      <div style={{ alignSelf: 'flex-end', maxWidth: '72%' }}>
        <div style={{ background: '#7C3AED', color: '#fff', borderRadius: '16px 16px 2px 16px', padding: '10px 14px', fontSize: 14, lineHeight: 1.5 }}>
          {msg.text}
        </div>
      </div>
    )
  }

  return (
    <div style={{ alignSelf: 'flex-start', maxWidth: '88%', display: 'flex', gap: 10 }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#F0EBFF', border: '1.5px solid #7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
        <CodexIcon size={18} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: '16px 16px 16px 2px', padding: '12px 16px', fontSize: 14, color: '#0A0A0A', lineHeight: 1.7 }}>
          <Markdown text={msg.text} />
        </div>
        {msg.saveSuggestion && (
          <SaveCard suggestion={msg.saveSuggestion} agentId={agentId} onSaved={onSaveConfirmed} />
        )}
        {msg.suggestions && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {msg.suggestions.map(s => (
              <button key={s} onClick={() => onSuggestion(s)}
                style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 9999, padding: '5px 12px', fontSize: 12, color: '#7C3AED', fontWeight: 500, cursor: 'pointer' }}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Save Card ─────────────────────────────────────────────────────────────────
function SaveCard({ suggestion, agentId, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [category, setCategory] = useState(suggestion.category || 'GERAL')

  if (dismissed) return null

  if (saved) {
    return (
      <div style={{ marginTop: 8, background: '#F0FDF4', border: '1px solid #B9F8CF', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#0B5E20', display: 'flex', gap: 8, alignItems: 'center' }}>
        ✅ Salvo na base de conhecimento!
      </div>
    )
  }

  const handleSave = async () => {
    if (!agentId) return
    setSaving(true)
    try {
      const cat = CATEGORIES[category]
      const text = `[${cat?.label || category}]\n${suggestion.content}`
      const created = await createTraining(agentId, { type: 'TEXT', text })
      try {
        const map = JSON.parse(localStorage.getItem('codex_cats') || '{}')
        if (created?.id) map[created.id] = category
        localStorage.setItem('codex_cats', JSON.stringify(map))
      } catch {}
      setSaved(true)
      onSaved()
    } catch (e) {
      alert('Erro ao salvar: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ marginTop: 8, background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#7C3AED', marginBottom: 6 }}>💾 Salvar na base de conhecimento?</div>
      <div style={{ fontSize: 12, color: '#4B5563', marginBottom: 10, fontStyle: 'italic' }}>
        "{suggestion.content.slice(0, 140)}{suggestion.content.length > 140 ? '...' : ''}"
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={category} onChange={e => setCategory(e.target.value)}
          style={{ border: '1px solid #DDD6FE', borderRadius: 6, padding: '4px 8px', fontSize: 11, color: '#7C3AED', background: '#fff', outline: 'none', cursor: 'pointer' }}>
          {Object.entries(CATEGORIES).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <button onClick={handleSave} disabled={saving || !agentId}
          style={{ background: '#7C3AED', border: 'none', borderRadius: 6, padding: '4px 14px', fontSize: 11, color: '#fff', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Salvando...' : '✓ Confirmar'}
        </button>
        <button onClick={() => setDismissed(true)}
          style={{ background: 'none', border: '1px solid #DDD6FE', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: '#82829B', cursor: 'pointer' }}>
          Cancelar
        </button>
        {!agentId && <span style={{ fontSize: 11, color: '#EF4444' }}>Nenhum agente</span>}
      </div>
    </div>
  )
}

// ─── Markdown simples ─────────────────────────────────────────────────────────
function Markdown({ text }) {
  const lines = (text || '').split('\n')
  return (
    <div>
      {lines.map((line, i) => {
        if (!line.trim()) return <br key={i} />
        if (line.startsWith('• ') || line.startsWith('- ')) {
          return <div key={i} style={{ paddingLeft: 12, marginBottom: 2 }}>• <InlineFormat text={line.slice(2)} /></div>
        }
        return <div key={i} style={{ marginBottom: 2 }}><InlineFormat text={line} /></div>
      })}
    </div>
  )
}

function InlineFormat({ text }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
          ? <strong key={i} style={{ color: '#0A0A0A' }}>{p.slice(2, -2)}</strong>
          : <span key={i}>{p}</span>
      )}
    </>
  )
}

// ─── Typing indicator ─────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div style={{ alignSelf: 'flex-start', display: 'flex', gap: 10 }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#F0EBFF', border: '1.5px solid #7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CodexIcon size={18} />
      </div>
      <div style={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: '16px 16px 16px 2px', padding: '14px 18px', display: 'flex', gap: 5, alignItems: 'center' }}>
        {[0, 0.18, 0.36].map((d, i) => (
          <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: '#7C3AED', animation: `blink 1s ${d}s infinite` }} />
        ))}
        <span style={{ fontSize: 12, color: '#82829B', marginLeft: 8 }}>Analisando...</span>
      </div>
      <style>{`@keyframes blink{0%,80%,100%{opacity:.2;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}`}</style>
    </div>
  )
}

// ─── CODEX Icon ───────────────────────────────────────────────────────────────
function CodexIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/>
      <path d="M12 2v20"/>
      <path d="M2 8.5l10 7 10-7"/>
    </svg>
  )
}

