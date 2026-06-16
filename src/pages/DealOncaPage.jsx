import { useState, useRef, useEffect } from 'react'
import { askDealOnca } from '../services/groq'
import { listChannels, getChatMessages } from '../services/gptmaker'

const SUGGESTIONS = [
  'Mostre os leads mais quentes',
  'Quantos clientes perguntaram sobre frete e não responderam?',
  'Quem está mais perto de comprar hoje?',
  'Analise as principais objeções',
  'Gere o playbook de vendas da loja',
  'Quais clientes sumiram e precisam de follow-up?',
]

export default function DealOncaPage({ conversations = [] }) {
  const [channels, setChannels] = useState([])
  const [richConversations, setRichConversations] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [historyProgress, setHistoryProgress] = useState(0)
  const WELCOME = {
    id: 0, from: 'oncca',
    text: 'Olá, Rafael! Sou o **Deal Claude**, seu Diretor Comercial com IA.\n\nEstou conectado a todos os canais e conversas da PRIME STORE. Pode me perguntar qualquer coisa — analiso os dados em tempo real e respondo com precisão.',
    suggestions: SUGGESTIONS.slice(0, 4),
  }
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem('dealclaude_history')
      if (saved) return JSON.parse(saved)
    } catch {}
    return [WELCOME]
  })
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const bottomRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])
  useEffect(() => { listChannels().then(setChannels).catch(() => {}) }, [])
  useEffect(() => {
    try { localStorage.setItem('dealclaude_history', JSON.stringify(messages)) } catch {}
  }, [messages])

  const clearHistory = () => {
    localStorage.removeItem('dealclaude_history')
    setMessages([WELCOME])
  }

  // Carrega histórico completo de todas as conversas
  useEffect(() => {
    if (conversations.length === 0) return
    setLoadingHistory(true)
    setHistoryProgress(0)

    async function loadAllHistories() {
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

    loadAllHistories()
  }, [conversations])

  const send = async (text) => {
    const t = (text || input).trim()
    if (!t || loading) return
    setInput('')
    setError(null)

    const userMsg = { id: Date.now(), from: 'user', text: t }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const history = messages.filter(m => m.from === 'user' || m.from === 'oncca')
      const ctx = richConversations.length > 0 ? richConversations : conversations
      const reply = await askDealOnca(t, history, ctx)
      setMessages(prev => [...prev, { id: Date.now() + 1, from: 'oncca', text: reply }])
    } catch (err) {
      setError(err.message)
      setMessages(prev => [...prev, {
        id: Date.now() + 1, from: 'oncca',
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
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#FEF3EE', border: '2px solid #E8714A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ClawdIcon size={26} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0A0A0A' }}>Deal Claude</div>
            <div style={{ fontSize: 12, color: '#82829B', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 7, height: 7, background: '#E8714A', borderRadius: '50%', display: 'inline-block' }} />
              Diretor Comercial IA · PRIME STORE · Groq / Llama 3.1
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            {loadingHistory ? (
              <span style={{ background: '#FFF8E1', border: '1px solid #FCD34D', borderRadius: 9999, padding: '4px 12px', fontSize: 12, color: '#92400E', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#F59E0B', display: 'inline-block', animation: 'blink 1s infinite' }} />
                Carregando histórico... {historyProgress}%
              </span>
            ) : (
              <span style={{ background: '#EFFDF4', border: '1px solid #B9F8CF', borderRadius: 9999, padding: '4px 12px', fontSize: 12, color: '#0EC331', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#0EC331', display: 'inline-block' }} />
                {richConversations.length} conversas com histórico completo
              </span>
            )}
            <span style={{ background: '#FFF8E1', border: '1px solid #FFC300', borderRadius: 9999, padding: '4px 12px', fontSize: 12, color: '#856404' }}>🔔 {conversations.filter(c => c.unread > 0).length} não lidas</span>
            <button onClick={clearHistory} title="Limpar histórico" style={{ background: 'none', border: '1px solid #E5E5E5', borderRadius: 8, padding: '4px 10px', fontSize: 11, color: '#82829B', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              Limpar
            </button>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {messages.map(msg => (
            <ChatMessage key={msg.id} msg={msg} onSuggestion={send} />
          ))}
          {loading && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #E5E5E5', flexShrink: 0 }}>
          <div style={{ background: '#fff', border: '1px solid #01AB59', borderRadius: 16, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              rows={1}
              placeholder="Pergunte qualquer coisa sobre seus clientes e conversas..."
              style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 14, color: '#0A0A0A', outline: 'none', resize: 'none' }}
            />
            <button
              onClick={() => send()}
              disabled={loading}
              style={{ width: 34, height: 34, background: loading ? '#B9F8CF' : '#0EC331', border: 'none', borderRadius: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.2s' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
          <div style={{ fontSize: 11, color: '#82829B', textAlign: 'center', marginTop: 6 }}>
            IA real · Analisa suas conversas, mensagens e clientes em tempo real
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div style={{ width: 240, padding: '20px 16px', overflowY: 'auto', background: '#F7F7F7', flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#82829B', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Perguntas exemplo</div>
        {[
          { icon: '🔥', label: 'Leads quentes agora',         cmd: 'Quem está mais perto de comprar agora?' },
          { icon: '📦', label: 'Dúvidas sobre frete',         cmd: 'Quantos clientes perguntaram sobre frete e não responderam?' },
          { icon: '🌡️', label: 'Clientes que sumiram',       cmd: 'Quais clientes pararam de responder e precisam de follow-up?' },
          { icon: '💸', label: 'Objeções de preço',          cmd: 'Quais clientes tiveram objeção de preço ou pediram desconto?' },
          { icon: '📊', label: 'Resumo do dia',               cmd: 'Faça um resumo completo dos atendimentos de hoje' },
          { icon: '🧠', label: 'Análise de objeções',        cmd: 'Quais são as principais objeções dos clientes?' },
          { icon: '📋', label: 'Playbook de vendas',         cmd: 'Gere o playbook de vendas baseado nos melhores atendimentos' },
          { icon: '📅', label: 'Follow-ups urgentes',        cmd: 'Quem precisa de follow-up urgente agora?' },
          { icon: '🏆', label: 'Melhor atendimento',         cmd: 'Qual foi o melhor atendimento da semana e por quê?' },
        ].map(item => (
          <button
            key={item.label}
            onClick={() => send(item.cmd)}
            disabled={loading}
            style={{ width: '100%', background: '#fff', border: '1px solid #E5E5E5', borderRadius: 10, padding: '9px 12px', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 8, cursor: loading ? 'not-allowed' : 'pointer', textAlign: 'left', opacity: loading ? 0.5 : 1 }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#EFFDF4' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}
          >
            <span style={{ fontSize: 16 }}>{item.icon}</span>
            <span style={{ fontSize: 12, color: '#141413' }}>{item.label}</span>
          </button>
        ))}

        <div style={{ fontSize: 12, fontWeight: 600, color: '#82829B', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '16px 0 10px' }}>Canais monitorados</div>
        {channels.length === 0
          ? <div style={{ fontSize: 12, color: '#9CA3AF' }}>Carregando...</div>
          : channels.map(ch => (
            <div key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12, color: '#141413' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#0EC331', flexShrink: 0 }} />
              {ch.name || ch.label || ch.type}
            </div>
          ))
        }
      </div>
    </div>
  )
}

// ─── Chat Message ─────────────────────────────────────────────────────────────
function ChatMessage({ msg, onSuggestion }) {
  if (msg.from === 'user') {
    return (
      <div style={{ alignSelf: 'flex-end', maxWidth: '72%' }}>
        <div style={{ background: '#0EC331', color: '#fff', borderRadius: '16px 16px 2px 16px', padding: '10px 14px', fontSize: 14, lineHeight: 1.5 }}>
          {msg.text}
        </div>
      </div>
    )
  }

  return (
    <div style={{ alignSelf: 'flex-start', maxWidth: '88%', display: 'flex', gap: 10 }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#FEF3EE', border: '1.5px solid #E8714A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}><ClawdIcon size={20} /></div>
      <div style={{ flex: 1 }}>
        <div style={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: '16px 16px 16px 2px', padding: '12px 16px', fontSize: 14, color: '#0A0A0A', lineHeight: 1.7 }}>
          <Markdown text={msg.text} />
        </div>
        {msg.suggestions && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {msg.suggestions.map(s => (
              <button key={s} onClick={() => onSuggestion(s)} style={{ background: '#EFFDF4', border: '1px solid #B9F8CF', borderRadius: 9999, padding: '5px 12px', fontSize: 12, color: '#0EC331', fontWeight: 500, cursor: 'pointer' }}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Markdown simples ─────────────────────────────────────────────────────────
function Markdown({ text }) {
  const lines = text.split('\n')
  return (
    <div>
      {lines.map((line, i) => {
        if (!line.trim()) return <br key={i} />
        // bullet
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
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#FEF3EE', border: '1.5px solid #E8714A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ClawdIcon size={20} /></div>
      <div style={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: '16px 16px 16px 2px', padding: '14px 18px', display: 'flex', gap: 5, alignItems: 'center' }}>
        {[0, 0.18, 0.36].map((d, i) => (
          <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: '#0EC331', animation: `blink 1s ${d}s infinite` }} />
        ))}
        <span style={{ fontSize: 12, color: '#82829B', marginLeft: 8 }}>Analisando dados...</span>
      </div>
      <style>{`@keyframes blink{0%,80%,100%{opacity:.2;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}`}</style>
    </div>
  )
}

function ClawdIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shapeRendering="crispEdges">
      <rect x="4" y="4" width="8" height="6" fill="#E8714A"/>
      <rect x="2" y="5" width="2" height="3" fill="#E8714A"/>
      <rect x="12" y="5" width="2" height="3" fill="#E8714A"/>
      <rect x="5" y="6" width="2" height="2" fill="#1a1a1a"/>
      <rect x="9" y="6" width="2" height="2" fill="#1a1a1a"/>
      <rect x="5" y="10" width="2" height="3" fill="#E8714A"/>
      <rect x="9" y="10" width="2" height="3" fill="#E8714A"/>
    </svg>
  )
}
