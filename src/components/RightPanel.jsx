import { useState, useEffect } from 'react'
import { getChatMessages, sendMessage, assumeChat, releaseChat } from '../services/gptmaker'
import { getRespostaRecomendada } from '../services/groq'
import { useTheme } from '../theme.jsx'

function calcProgress(msgs = [], lastMsg = '') {
  const text = (msgs.map(m => m.text || m.content || '').join(' ') + ' ' + lastMsg).toLowerCase()
  if (/manda o link|como fa[cç]o o pedido|quero comprar|vou levar|fecha|finalizar|confirma|pix da/.test(text)) return 90
  if (/aceita pix|quanto fica o frete|tem parcel|desconto|[cç]upom|mais barato|caro|valor/.test(text)) return 65
  if (/tem tamanho|tem em estoque|tem na cor|disponivel|chega quando|prazo|qual modelo/.test(text)) return 40
  if (/quanto custa|qual o pre[cç]o|me mostra|tem o modelo|oi|olá|bom dia|boa tarde/.test(text)) return 20
  return 5
}

export default function RightPanel({ conv, onConvUpdate, onFillInput }) {
  const { theme: t, dark } = useTheme()
  const [msgs, setMsgs] = useState([])
  const [resposta, setResposta] = useState(null)
  const [loadingResposta, setLoadingResposta] = useState(false)
  const [showResposta, setShowResposta] = useState(true)
  const [editando, setEditando] = useState(false)
  const [textoEditado, setTextoEditado] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [progress, setProgress] = useState(conv.objective_progress || 0)
  const [togglingMode, setTogglingMode] = useState(false)
  const [toast, setToast] = useState(null)

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function toggleMode() {
    setTogglingMode(true)
    try {
      const isHuman = conv.mode === 'copilot'
      if (isHuman) {
        await releaseChat(conv.id)
        onConvUpdate({ ...conv, mode: 'autopilot' })
        showToast('Conversa devolvida para o agente IA')
      } else {
        await assumeChat(conv.id)
        onConvUpdate({ ...conv, mode: 'copilot' })
        showToast('Você assumiu o atendimento')
      }
    } catch (e) {
      console.error('Erro ao mudar modo:', e)
      showToast('Erro ao mudar modo. Token pode ter expirado.', 'error')
    } finally {
      setTogglingMode(false)
    }
  }

  useEffect(() => {
    setResposta(null)
    setEditando(false)
    setTextoEditado('')
    loadAndRecommend()
  }, [conv.id])

  async function loadAndRecommend() {
    setLoadingResposta(true)
    try {
      const data = await getChatMessages(conv.id)
      const messages = Array.isArray(data) ? data : []
      setMsgs(messages)
      setProgress(calcProgress(messages, conv.lastMsg))
      const rec = await getRespostaRecomendada(conv, messages)
      setResposta(rec)
    } catch (e) {
      console.error('Erro resposta recomendada:', e)
    } finally {
      setLoadingResposta(false)
    }
  }

  async function regenerar() {
    setLoadingResposta(true)
    setResposta(null)
    try {
      const rec = await getRespostaRecomendada(conv, msgs)
      setResposta(rec)
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingResposta(false)
    }
  }

  return (
    <div style={{ width: 280, background: t.bg, borderRadius: 12, flexShrink: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', position: 'relative' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: toast.type === 'error' ? '#FEE2E2' : '#F0FDF4',
          border: `1px solid ${toast.type === 'error' ? '#FCA5A5' : '#86EFAC'}`,
          color: toast.type === 'error' ? '#DC2626' : '#15803D',
          borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 600,
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)', maxWidth: 280,
        }}>
          {toast.type === 'error' ? '⚠️ ' : '✅ '}{toast.msg}
        </div>
      )}

      {/* Agente + Contato */}
      <div style={{ padding: '14px 16px 12px', borderBottom: `1px solid ${t.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, background: t.bgSecondary, borderRadius: 10, padding: '8px 10px', border: `1px solid ${t.border}` }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff',
            background: conv.mode === 'copilot' ? 'linear-gradient(135deg, #6366F1, #8B5CF6)' : 'linear-gradient(135deg, #0EC331, #10B981)',
          }}>{conv.mode === 'copilot' ? '👤' : 'IA'}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: t.textMuted, fontWeight: 500 }}>
              {conv.mode === 'copilot' ? 'Atendimento humano' : 'Agente responsável'}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>
              {conv.mode === 'copilot' ? 'Você' : (conv.agentName || 'Gabriela')}
            </div>
          </div>
          <button
            onClick={toggleMode}
            disabled={togglingMode}
            title={conv.mode === 'copilot' ? 'Voltar para o agente' : 'Assumir atendimento'}
            style={{
              fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '4px 8px', border: 'none', cursor: togglingMode ? 'wait' : 'pointer',
              background: conv.mode === 'copilot' ? '#EEF2FF' : '#F0FDF4',
              color: conv.mode === 'copilot' ? '#6366F1' : '#00A84F',
              flexShrink: 0, transition: 'all 0.15s', lineHeight: 1.4,
            }}
          >
            {togglingMode ? '...' : conv.mode === 'copilot' ? '↩ Agente' : '✋ Assumir'}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          {conv.picture
            ? <img src={conv.picture} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} onError={e => e.target.style.display='none'} />
            : <div style={{ width: 40, height: 40, borderRadius: '50%', background: conv.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{conv.initials}</div>
          }
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.name}</div>
            <div style={{ fontSize: 11, color: t.textMid }}>{conv.channelLabel}{conv.channelSub ? ` · ${conv.channelSub}` : ''}</div>
          </div>
        </div>

        {conv.phone && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: t.textMid }}>
            <PhoneIcon />
            {conv.phone}
          </div>
        )}
      </div>

      {/* Objetivo + Progresso */}
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0EC331" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
          <Label t={t} style={{ margin: 0 }}>Objetivo</Label>
        </div>
        <div style={{ fontSize: 12, color: t.textSecondary, fontWeight: 500, marginBottom: 10, lineHeight: 1.5 }}>
          {conv.objective || 'Recommending Products and Driving Conversions'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <div style={{ flex: 1, height: 8, borderRadius: 9999, overflow: 'hidden', background: t.bgTertiary }}>
            <div style={{
              height: 8, borderRadius: 9999, transition: 'width 0.4s',
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #D946EF, #F97316)',
            }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#F97316', minWidth: 36 }}>{progress}%</span>
        </div>
        <div style={{ fontSize: 10, color: t.textMuted }}>Progresso do objetivo</div>
      </div>

      {/* Tags */}
      {(conv.tags || []).length > 0 && (
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${t.border}` }}>
          <Label t={t}>Tags</Label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {(conv.tags || []).map((tag, i) => (
              <span key={i} style={{ background: t.bgTertiary, border: `1px solid ${t.borderLight}`, borderRadius: 6, padding: '3px 8px', fontSize: 11, color: t.textSecondary, fontWeight: 500 }}>
                {tag.label || tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Resposta Recomendada */}
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0EC331" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <Label t={t} style={{ margin: 0 }}>Resposta Recomendada</Label>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={regenerar} disabled={loadingResposta} title="Regenerar" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: t.textMuted, padding: 2, fontSize: 14 }}>↻</button>
            <button onClick={() => setShowResposta(v => !v)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: t.textMuted, padding: 2, fontSize: 12 }}>
              {showResposta ? '∧' : '∨'}
            </button>
          </div>
        </div>

        {showResposta && (
          loadingResposta ? (
            <div style={{ background: t.bgSecondary, borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {[0, 0.2, 0.4].map((d, i) => (
                  <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#0EC331', animation: `blink 1s ${d}s infinite` }} />
                ))}
                <span style={{ fontSize: 12, color: t.textMuted, marginLeft: 4 }}>Gerando sugestão...</span>
              </div>
            </div>
          ) : resposta ? (
            <div style={{
              background: dark ? t.respostaBg : '#FFFBEB',
              border: `1px solid ${dark ? t.respostaBorder : '#FDE68A'}`,
              borderRadius: 10, padding: '12px 14px'
            }}>
              {editando ? (
                <textarea
                  value={textoEditado}
                  onChange={e => setTextoEditado(e.target.value)}
                  rows={3}
                  style={{ width: '100%', border: `1px solid ${dark ? t.borderMid : '#FCD34D'}`, borderRadius: 8, padding: '8px 10px', fontSize: 13, color: t.text, outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.6, background: t.inputBg, marginBottom: 8 }}
                />
              ) : (
                <p style={{ fontSize: 13, color: t.text, lineHeight: 1.6, margin: '0 0 10px 0', fontWeight: 500 }}>
                  {resposta.resposta}
                </p>
              )}

              {resposta.estrategia && !editando && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#F59E0B', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: dark ? '#FBBF24' : '#D97706', fontWeight: 600 }}>{resposta.estrategia}</span>
                </div>
              )}

              <div style={{ display: 'flex', gap: 4 }}>
                {editando ? (
                  <>
                    <ActionBtn icon={<SendIcon />} label="Enviar" color="#00A84F" textColor="#fff" loading={enviando}
                      onClick={async () => {
                        if (!textoEditado.trim()) return
                        setEnviando(true)
                        try { await sendMessage(conv.id, textoEditado.trim()); setEditando(false) }
                        catch(e) { console.error(e) }
                        finally { setEnviando(false) }
                      }}
                    />
                    <ActionBtn icon={<CancelIcon />} label="Cancelar" color="#F3F4F6" textColor="#6B7280" onClick={() => setEditando(false)} />
                  </>
                ) : (
                  <>
                    <ActionBtn icon={<SendIcon />} label="Enviar" color="#00A84F" textColor="#fff" loading={enviando}
                      onClick={async () => {
                        setEnviando(true)
                        try { await sendMessage(conv.id, resposta.resposta) }
                        catch(e) { console.error(e) }
                        finally { setEnviando(false) }
                      }}
                    />
                    <ActionBtn icon={<EditIcon />} label="Editar" color="#FEF3C7" textColor="#D97706" onClick={() => { setTextoEditado(resposta.resposta); setEditando(true) }} />
                    {onFillInput && (
                      <ActionBtn icon={<CopyIcon />} label="Usar" color="#EEF2FF" textColor="#6366F1" onClick={() => { onFillInput(resposta.resposta); setShowResposta(false) }} />
                    )}
                    <ActionBtn icon={<UserIcon />} label="Eu respondo" color="#FEE2E2" textColor="#E8192C" onClick={() => setShowResposta(false)} />
                  </>
                )}
              </div>
            </div>
          ) : null
        )}
      </div>

      {/* Resumo da conversa */}
      {(resposta?.resumo || loadingResposta) && (
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            <Label t={t} style={{ margin: 0 }}>Resumo da Conversa</Label>
          </div>
          {loadingResposta ? (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {[0, 0.2, 0.4].map((d, i) => (
                <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: '#6366F1', animation: `blink 1s ${d}s infinite` }} />
              ))}
              <span style={{ fontSize: 12, color: t.textMuted, marginLeft: 4 }}>Analisando conversa...</span>
            </div>
          ) : (
            <p style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.7, margin: 0, background: t.bgSecondary, borderRadius: 8, padding: '12px 14px', border: `1px solid ${t.border}` }}>
              {resposta.resumo}
            </p>
          )}
        </div>
      )}


      <style>{`@keyframes blink{0%,80%,100%{opacity:.2;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}`}</style>
    </div>
  )
}

function Label({ children, t, style }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 800, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6, fontFamily: "'Barlow Condensed', sans-serif", ...style }}>
      <span style={{ color: t.primary || '#E8192C', marginRight: 4 }}>///</span>{children}
    </div>
  )
}

function ActionBtn({ icon, label, color, textColor, onClick, loading }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={loading}
      title={label}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: color, color: textColor, border: 'none', borderRadius: 7,
        padding: hovered ? '6px 10px' : '6px 8px',
        fontSize: 11, fontWeight: 700, cursor: loading ? 'default' : 'pointer',
        opacity: loading ? 0.7 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: hovered ? 5 : 0,
        transition: 'all 0.15s ease',
        whiteSpace: 'nowrap', overflow: 'hidden',
        minWidth: hovered ? 'auto' : 28, height: 28,
      }}
    >
      <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{loading ? '...' : icon}</span>
      <span style={{
        maxWidth: hovered ? 60 : 0, overflow: 'hidden',
        transition: 'max-width 0.15s ease', opacity: hovered ? 1 : 0,
        fontSize: 11,
      }}>{label}</span>
    </button>
  )
}

function PhoneIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.37 2 2 0 0 1 3.59 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.56a16 16 0 0 0 6.53 6.53l.93-.93a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
}
function SendIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> }
function EditIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> }
function CopyIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> }
function UserIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> }
function CancelIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> }
