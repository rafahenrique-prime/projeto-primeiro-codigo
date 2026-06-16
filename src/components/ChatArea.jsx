import { useState, useRef, useEffect } from 'react'
import { getChatMessages, sendMessage, finishChat } from '../services/gptmaker'
import { useTheme } from '../theme.jsx'

const GPTMAKER_URL = 'https://app.gptmaker.ai/browse/chat'


function fmtTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function ChatArea({ conv, onConvUpdate }) {
  const { theme: t } = useTheme()
  const [msgs, setMsgs] = useState([])
  const [input, setInput] = useState('')
  const [mode, setMode] = useState(conv.mode || 'autopilot')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [modeHint, setModeHint] = useState(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    setMode(conv.mode || 'autopilot')
    loadMessages()
  }, [conv.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  async function loadMessages() {
    setLoading(true)
    try {
      const data = await getChatMessages(conv.id)
      setMsgs(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error('Erro ao carregar mensagens:', e)
      setMsgs([])
    } finally {
      setLoading(false)
    }
  }

  const handleSend = async (text) => {
    const txt = text || input.trim()
    if (!txt || sending) return
    setSending(true)
    setInput('')
    const tempMsg = { id: Date.now(), role: 'agent', text: txt, time: Date.now() }
    setMsgs(prev => [...prev, tempMsg])
    try {
      await sendMessage(conv.id, txt)
    } catch (e) {
      console.error('Erro ao enviar:', e)
    } finally {
      setSending(false)
    }
  }

  const handleFinish = async () => {
    try {
      await finishChat(conv.id)
      onConvUpdate({ ...conv, finished: true })
    } catch (e) {
      console.error('Erro ao finalizar:', e)
    }
  }

  return (
    <div style={{ flex: 1, background: t.bg, borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}`, background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {conv.picture
            ? <img src={conv.picture} alt="" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover' }} onError={e => e.target.style.display='none'} />
            : <div style={{ width: 38, height: 38, borderRadius: '50%', background: conv.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff' }}>{conv.initials}</div>
          }
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{conv.name}</div>
            <div style={{ fontSize: 12, color: t.textMuted }}>{conv.channelLabel}{conv.channelSub ? ` · ${conv.channelSub}` : ''}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ModeToggle mode={mode} t={t} setMode={(newMode) => {
            setMode(newMode)
            onConvUpdate({ ...conv, mode: newMode })
            const hint = newMode === 'copilot'
              ? 'Clique em "Assumir atendimento" no GPT Maker'
              : 'Clique em "Voltar pro Agente" no GPT Maker'
            setModeHint(hint)
            setTimeout(() => setModeHint(null), 6000)
          }} />
          <button onClick={handleFinish} style={{ background: t.bgTertiary, border: `1px solid ${t.borderLight}`, borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, color: t.textSecondary, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Resolver
          </button>
        </div>
      </div>

      {/* Hint de modo */}
      {modeHint && (
        <div style={{ background: '#FEF3C7', borderBottom: '1px solid #FDE68A', padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: '#92400E', flexShrink: 0 }}>
          <span>⚡ {modeHint}</span>
          <a href={GPTMAKER_URL} target="_blank" rel="noreferrer" style={{ color: '#D97706', fontWeight: 700, textDecoration: 'none', marginLeft: 8 }}>Abrir GPT Maker →</a>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px', display: 'flex', flexDirection: 'column', gap: 6, background: t.bgSecondary }}>
        {loading
          ? <div style={{ textAlign: 'center', color: t.textMuted, fontSize: 13, marginTop: 40 }}>Carregando mensagens...</div>
          : msgs.length === 0
            ? <div style={{ textAlign: 'center', color: t.textMuted, fontSize: 13, marginTop: 40 }}>Nenhuma mensagem</div>
            : msgs.map(msg => <Bubble key={msg.id} msg={msg} conv={conv} t={t} />)
        }
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '12px 14px', borderTop: `1px solid ${t.border}`, background: t.bg, flexShrink: 0 }}>
        <div style={{ background: t.bg, border: '1.5px solid #0EC331', borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            rows={2}
            placeholder="Digite aqui..."
            style={{ background: 'transparent', border: 'none', fontSize: 14, color: t.text, outline: 'none', resize: 'none', width: '100%', fontFamily: 'inherit', lineHeight: 1.5 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <IconBtn title="Anexo" color={t.textMuted}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              </IconBtn>
              <IconBtn title="Emoji" color={t.textMuted}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 13s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
              </IconBtn>
              <button style={{ background: 'linear-gradient(135deg, #0EC331, #10B981)', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="#fff"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                Gerar
              </button>
            </div>
            <button onClick={() => handleSend()} disabled={sending} style={{ width: 34, height: 34, background: sending ? '#B0E8BA' : '#0EC331', border: 'none', borderRadius: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: sending ? 'default' : 'pointer', transition: 'background 0.15s' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function IconBtn({ children, title, color }) {
  return (
    <button title={title} style={{ background: 'transparent', border: 'none', padding: '4px 6px', borderRadius: 6, cursor: 'pointer', color, display: 'flex', alignItems: 'center' }}>
      {children}
    </button>
  )
}

function ModeToggle({ mode, setMode, t }) {
  return (
    <div style={{ background: t.bgTertiary, borderRadius: 9999, padding: 3, display: 'flex', gap: 0 }}>
      {[['autopilot','AutoPilot'],['copilot','Copilot']].map(([val, label]) => (
        <button key={val} onClick={() => setMode(val)} style={{
          background: mode === val ? t.bg : 'transparent',
          color: mode === val ? '#0EC331' : t.textMuted,
          border: 'none', borderRadius: 9999,
          padding: '4px 12px', fontSize: 12, fontWeight: mode === val ? 700 : 500,
          boxShadow: mode === val ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          transition: 'all 0.15s', cursor: 'pointer',
        }}>{label}</button>
      ))}
    </div>
  )
}

function Bubble({ msg, conv, t }) {
  const text = msg.text || msg.content || ''
  const time = fmtTime(msg.time)

  if (msg.role === 'user') {
    return (
      <div style={{ display: 'flex', gap: 8, maxWidth: '72%', alignSelf: 'flex-start' }}>
        {conv.picture
          ? <img src={conv.picture} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, marginTop: 2 }} onError={e => e.target.style.display='none'} />
          : <div style={{ width: 28, height: 28, borderRadius: '50%', background: conv.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0, marginTop: 2 }}>{conv.initials}</div>
        }
        <div>
          <div style={{ background: t.bubbleUser, border: `1px solid ${t.borderLight}`, borderRadius: '2px 14px 14px 14px', padding: '9px 13px', fontSize: 13, color: t.text, lineHeight: 1.55, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>{text}</div>
          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 3 }}>{time}</div>
        </div>
      </div>
    )
  }

  if (msg.role === 'assistant') {
    return (
      <div style={{ display: 'flex', gap: 8, maxWidth: '72%', alignSelf: 'flex-end', flexDirection: 'row-reverse' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #0EC331, #10B981)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff', flexShrink: 0, marginTop: 2 }}>IA</div>
        <div>
          <div style={{ background: t.bubbleAI, borderRadius: '14px 2px 14px 14px', padding: '9px 13px', fontSize: 13, color: t.text, lineHeight: 1.55 }}>{text}</div>
          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 3, textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
            {time}
            <svg width="12" height="8" viewBox="0 0 16 10" fill="#0EC331"><path d="M1 5l4 4L15 1M6 5l4 4"/></svg>
          </div>
        </div>
      </div>
    )
  }

  if (msg.role === 'agent') {
    return (
      <div style={{ display: 'flex', gap: 8, maxWidth: '72%', alignSelf: 'flex-end', flexDirection: 'row-reverse' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#6366F1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0, marginTop: 2 }}>
          {(msg.metadata?.senderName || 'R')[0]}
        </div>
        <div>
          <div style={{ background: t.bubbleAI, borderRadius: '14px 2px 14px 14px', padding: '9px 13px', fontSize: 13, color: t.text, lineHeight: 1.55 }}>{text}</div>
          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 3, textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
            {time} · {msg.metadata?.senderName || 'Você'}
            <svg width="12" height="8" viewBox="0 0 16 10" fill={t.textMuted}><path d="M1 5l4 4L15 1M6 5l4 4"/></svg>
          </div>
        </div>
      </div>
    )
  }

  return null
}
