import { useState, useEffect } from 'react'
import { getChatMessages, sendMessage } from '../services/gptmaker'
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

export default function RightPanel({ conv, onConvUpdate }) {
  const { theme: t } = useTheme()
  const [msgs, setMsgs] = useState([])
  const [resposta, setResposta] = useState(null)
  const [loadingResposta, setLoadingResposta] = useState(false)
  const [showResposta, setShowResposta] = useState(true)
  const [editando, setEditando] = useState(false)
  const [textoEditado, setTextoEditado] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [progress, setProgress] = useState(conv.objective_progress || 0)

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
    <div style={{ width: 280, background: t.bg, borderRadius: 12, flexShrink: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>

      {/* Agente + Contato */}
      <div style={{ padding: '14px 16px 12px', borderBottom: `1px solid ${t.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, background: t.bgSecondary, borderRadius: 10, padding: '8px 10px', border: `1px solid ${t.border}` }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, #0EC331, #10B981)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>IA</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: t.textMuted, fontWeight: 500 }}>Agente responsável</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{conv.agentName || 'Gabriela'}</div>
          </div>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: conv.mode === 'autopilot' ? '#0EC331' : '#6366F1', flexShrink: 0 }} />
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
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '12px 14px' }}>
              {editando ? (
                <textarea
                  value={textoEditado}
                  onChange={e => setTextoEditado(e.target.value)}
                  rows={3}
                  style={{ width: '100%', border: '1px solid #FCD34D', borderRadius: 8, padding: '8px 10px', fontSize: 13, color: '#0A0A0A', outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.6, background: '#fff', marginBottom: 8 }}
                />
              ) : (
                <p style={{ fontSize: 13, color: '#0A0A0A', lineHeight: 1.6, margin: '0 0 10px 0', fontWeight: 500 }}>
                  {resposta.resposta}
                </p>
              )}

              {resposta.estrategia && !editando && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#F59E0B', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: '#D97706', fontWeight: 600 }}>{resposta.estrategia}</span>
                </div>
              )}

              <div style={{ display: 'flex', gap: 4 }}>
                {editando ? (
                  <>
                    <ActionBtn color="#0EC331" textColor="#fff" loading={enviando}
                      onClick={async () => {
                        if (!textoEditado.trim()) return
                        setEnviando(true)
                        try { await sendMessage(conv.id, textoEditado.trim()); setEditando(false) }
                        catch(e) { console.error(e) }
                        finally { setEnviando(false) }
                      }}
                    >{enviando ? 'Enviando...' : '✓ Enviar'}</ActionBtn>
                    <ActionBtn color="#F3F4F6" textColor="#6B7280" onClick={() => setEditando(false)}>Cancelar</ActionBtn>
                  </>
                ) : (
                  <>
                    <ActionBtn color="#0EC331" textColor="#fff" loading={enviando}
                      onClick={async () => {
                        setEnviando(true)
                        try { await sendMessage(conv.id, resposta.resposta) }
                        catch(e) { console.error(e) }
                        finally { setEnviando(false) }
                      }}
                    >{enviando ? '...' : '↑ Enviar'}</ActionBtn>
                    <ActionBtn color="#FEF3C7" textColor="#D97706" onClick={() => { setTextoEditado(resposta.resposta); setEditando(true) }}>✏ Editar</ActionBtn>
                    <ActionBtn color="#F3F4F6" textColor="#6B7280" onClick={() => setShowResposta(false)}>Eu respondo</ActionBtn>
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
  return <div style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6, ...style }}>{children}</div>
}

function ActionBtn({ children, color, textColor, onClick, loading }) {
  return (
    <button onClick={onClick} disabled={loading} style={{
      flex: 1, background: color, color: textColor, border: 'none', borderRadius: 7,
      padding: '6px 4px', fontSize: 11, fontWeight: 700, cursor: loading ? 'default' : 'pointer',
      opacity: loading ? 0.7 : 1, transition: 'opacity 0.15s',
    }}>{children}</button>
  )
}

function PhoneIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.37 2 2 0 0 1 3.59 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.56a16 16 0 0 0 6.53 6.53l.93-.93a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
}
