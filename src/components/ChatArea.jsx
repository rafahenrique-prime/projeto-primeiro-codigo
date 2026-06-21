import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { getChatMessages, sendMessage, finishChat, assumeChat, releaseChat, deleteChat } from '../services/gptmaker'
import { detectProductRequest, groqRequest } from '../services/groq'
import { findBestMatch, searchProduct, findProductInText } from '../services/catalog'
import { addPhotoToHistory } from '../services/photoHistory'
import { useTheme } from '../theme.jsx'
import { searchEntries, saveEntry } from '../services/knowledgeDB'
import { parseToBlocks, TIPO_TO_CATEGORY } from '../services/knowledgeParser'
import { upsertProfile, getProfile } from '../services/customerProfileService'
import { syncMessages, getConvHistory, deleteConvHistory, archiveConvHistory } from '../services/messageHistoryService'

const GPTMAKER_URL = 'https://app.gptmaker.ai/browse/chat'


function fmtTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

const ChatArea = forwardRef(function ChatArea({ conv, onConvUpdate }, ref) {
  const { theme: t, dark } = useTheme()
  const [msgs, setMsgs] = useState([])
  const [input, setInput] = useState('')
  const [lastProcessedMsgId, setLastProcessedMsgId] = useState(null)
  const lastProcessedMsgIdRef = useRef(null)
  const [autoSending, setAutoSending] = useState(false)
  const autoSendingRef = useRef(false)
  // Cooldown: evita reprocessar o mesmo pedido múltiplas vezes (5s)
  const lastAutoPhotoTimeRef = useRef(0)
  // Rastreamento de contexto Dealism-style: último produto em foco na conversa
  const lastProductContextRef = useRef(null)
  const [showPhotoModal, setShowPhotoModal] = useState(false)
  const [photoSearch, setPhotoSearch] = useState('')
  const [photoResults, setPhotoResults] = useState([])
  const [sendingPhoto, setSendingPhoto] = useState(false)

  useImperativeHandle(ref, () => ({
    fill: (text) => setInput(text)
  }))
  const [mode, setMode] = useState(conv.mode || 'autopilot')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [modeHint, setModeHint] = useState(null)
  const bottomRef = useRef(null)
  // Base local
  const [kbEnabled, setKbEnabled] = useState(() => localStorage.getItem('kb_enabled') !== 'false')
  const [kbSuggestion, setKbSuggestion] = useState(null)
  const [kbDismissed, setKbDismissed] = useState(false)
  // Perfil IA do cliente
  const [clientProfile, setClientProfile] = useState(null)
  // Salvar conversa
  const [selectedMsgs, setSelectedMsgs] = useState(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [savingConv, setSavingConv] = useState(false)
  const [saveToast, setSaveToast] = useState(null)
  // Busca no histórico
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef(null)
  // Memória contextual
  const [memEnabled, setMemEnabled] = useState(() => localStorage.getItem('mem_enabled') !== 'false')
  // Ocultar mensagens localmente
  const [hiddenMsgs, setHiddenMsgs] = useState(new Set())
  // Menu ⋮
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef(null)
  // Modal Limpar Conversa
  const [showClearModal, setShowClearModal] = useState(false)
  const [clearingAction, setClearingAction] = useState(null) // null | 'archiving' | 'deleting'

  useEffect(() => {
    if (!showMenu) return
    const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [showMenu])

  useEffect(() => {
    setMode(conv.mode || 'autopilot')
    setClientProfile(null)
    lastProductContextRef.current = null
    loadMessages()
    getProfile(conv.id).then(p => setClientProfile(p)).catch(() => {})
    const interval = setInterval(() => loadMessages(true), 5000)
    return () => clearInterval(interval)
  }, [conv.id])

  useEffect(() => {
    if (!searchQuery) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, searchQuery])

  useEffect(() => {
    if (showSearch) setTimeout(() => searchInputRef.current?.focus(), 50)
    else setSearchQuery('')
  }, [showSearch])

  const filteredMsgs = (searchQuery.trim()
    ? msgs.filter(m => (m.text || m.content || '').toLowerCase().includes(searchQuery.toLowerCase()))
    : msgs).filter(m => !hiddenMsgs.has(m.id))

  async function loadMessages(silent = false) {
    if (!silent) setLoading(true)
    try {
      const data = await getChatMessages(conv.id)
      const msgList = Array.isArray(data) ? data : []
      setMsgs(msgList)

      // Atualiza contexto do produto (Dealism-style): varre mensagens do agente para saber qual produto está em foco
      const allMsgs = [...msgList].reverse().slice(0, 10)
      const agentMsgs = allMsgs.filter(m => m.role !== 'user' && m.role !== 'client')

      for (const m of agentMsgs) {
        const textoMsg = m.text || m.content || m.message || ''
        const produtoNoContexto = findProductInText(textoMsg)
        if (produtoNoContexto) {
          lastProductContextRef.current = produtoNoContexto
          break
        }
      }

      // Detecção automática de pedido de foto
      if (msgList.length > 0 && !autoSendingRef.current) {
        const lastMsg = msgList[msgList.length - 1]

        // Verifica se é mensagem nova do cliente e não foi processada
        if (lastMsg.role === 'user' && lastMsg.id !== lastProcessedMsgIdRef.current) {
          lastProcessedMsgIdRef.current = lastMsg.id
          setLastProcessedMsgId(lastMsg.id)
          setKbDismissed(false)

          // Atualiza perfil do cliente no Supabase a cada msg nova
          upsertProfile(conv, msgList).then(() => getProfile(conv.id).then(p => setClientProfile(p))).catch(() => {})
          // Salva cópia das mensagens no Supabase (backup independente do GPTMaker)
          syncMessages(conv.id, msgList).catch(() => {})

          // Busca na base local se estiver ativada
          if (kbEnabled) {
            const clientText = lastMsg.text || lastMsg.content || ''
            searchEntries(clientText).then(results => {
              if (results.length > 0) {
                setKbSuggestion({ query: clientText, results })
              } else {
                setKbSuggestion(null)
              }
            }).catch(() => {})
          }

          // Detecta se é pedido de foto
          const detection = detectProductRequest(lastMsg.text || lastMsg.content || '')

          // Resolve produto: nome explícito na msg OU contexto rastreado (Dealism-style)
          const produtoAlvo = detection.nomeProduto
            ? findBestMatch(detection.nomeProduto)
            : (detection.temPedidoFoto ? lastProductContextRef.current : null)

          if (detection.temPedidoFoto && produtoAlvo) {
            // Cooldown: não dispara se foi muito recente (evita 3x envios)
            const now = Date.now()
            if (now - lastAutoPhotoTimeRef.current < 3000) {
              autoSendingRef.current = false
              setAutoSending(false)
            } else {
              lastAutoPhotoTimeRef.current = now
              autoSendingRef.current = true
              setAutoSending(true)
              try {
              const produto = produtoAlvo
              if (produto) {
                // Salva no contexto o produto que foi enviado
                lastProductContextRef.current = produto

                // Envia a foto automático
                await sendMessage(conv.id, produto.nome, produto.imagem)

                // Envia mensagem com preço e link
                setTimeout(() => {
                  sendMessage(conv.id, `${produto.preco}\n\n${produto.link}`).catch(() => {})
                }, 500)

                // Registra no histórico
                addPhotoToHistory({
                  produto: produto.nome,
                  cliente: conv.name,
                  canal: conv.channelLabel,
                  tipo: detection.nomeProduto ? 'automático' : 'contexto',
                  sucesso: true,
                })
              } else {
                addPhotoToHistory({
                  produto: detection.nomeProduto || '(contexto)',
                  cliente: conv.name,
                  canal: conv.channelLabel,
                  tipo: 'automático',
                  sucesso: false,
                  erro: 'Produto não encontrado no catálogo',
                })
              }
            } catch (err) {
              console.error('Erro ao enviar foto automático:', err)
              addPhotoToHistory({
                produto: detection.nomeProduto || '(contexto)',
                cliente: conv.name,
                canal: conv.channelLabel,
                tipo: 'automático',
                sucesso: false,
                erro: err.message,
              })
              } finally {
                autoSendingRef.current = false
                setAutoSending(false)
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('Erro ao carregar mensagens:', e)
    } finally {
      if (!silent) setLoading(false)
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

  const [gerarLoading, setGerarLoading] = useState(false)

  const handleGerar = async () => {
    if (gerarLoading) return
    const lastClient = [...msgs].reverse().find(m => m.role === 'user')
    if (!lastClient) return
    const query = lastClient.text || lastClient.content || ''
    setGerarLoading(true)
    try {
      const results = kbEnabled ? await searchEntries(query) : []
      const context = results.length > 0
        ? results.slice(0, 3).map(e => `[${e.category}] ${e.title}: ${e.content}`).join('\n\n')
        : ''

      let historySource = msgs
      if (memEnabled) {
        const fullHistory = await getConvHistory(conv.id, 200).catch(() => [])
        if (fullHistory.length > msgs.length) {
          historySource = fullHistory.map(r => ({ role: r.role, text: r.content, content: r.content, id: r.msg_id }))
        }
      }

      const history = historySource.slice(-30).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text || m.content || '',
      })).filter(m => m.content)

      const memNote = memEnabled ? `\n\nVocê tem acesso ao histórico completo desta conversa (${historySource.length} mensagens).` : ''
      const systemPrompt = `Você é Gabriela, vendedora da PRIME STORE — loja de roupas e tênis masculinos. Seja direta, simpática e focada em fechar a venda.${memNote}${context ? `\n\nBase de conhecimento relevante:\n${context}` : ''}`
      const data = await groqRequest({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: systemPrompt }, ...history],
        max_tokens: 400,
        temperature: 0.7,
      })
      const reply = data.choices?.[0]?.message?.content || ''
      if (reply) setInput(reply)
    } catch (e) {
      console.error('Gerar erro:', e)
      alert(`Erro ao gerar: ${e.message}`)
    } finally {
      setGerarLoading(false)
    }
  }

  const handleSaveConversation = async () => {
    if (selectedMsgs.size === 0) return
    setSavingConv(true)
    try {
      const selected = msgs.filter(m => selectedMsgs.has(m.id))
      const content = selected.map(m => {
        const role = m.role === 'user' ? conv.name : 'Agente'
        const text = m.text || m.content || ''
        return `${role}: ${text}`
      }).join('\n')
      // Parser estruturado — divide a conversa em blocos por tipo
      const blocos = await parseToBlocks(content).catch(() => [{ tipo: 'FAQ', nome: content.slice(0, 80), conteudo: content }])
      for (const b of blocos) {
        await saveEntry({ title: b.nome || content.slice(0, 80), content: b.conteudo, category: TIPO_TO_CATEGORY[b.tipo] || 'FAQ', source: 'conversa' })
      }
      setSaveToast(`${selectedMsgs.size} mensagem(ns) salvas na base!`)
      setSelectedMsgs(new Set())
      setSelectMode(false)
      setTimeout(() => setSaveToast(null), 3000)
    } catch (e) {
      setSaveToast('Erro ao salvar.')
      setTimeout(() => setSaveToast(null), 3000)
    } finally {
      setSavingConv(false)
    }
  }

  const toggleSelectMsg = (id) => {
    setSelectedMsgs(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleFinish = async () => {
    try {
      await finishChat(conv.id)
      onConvUpdate({ ...conv, finished: true })
    } catch (e) {
      console.error('Erro ao finalizar:', e)
    }
  }

  const handleClearConv = async (action) => {
    setClearingAction(action)
    try {
      if (action === 'delete') {
        await Promise.all([
          deleteConvHistory(conv.id),
          deleteChat(conv.id),
        ])
      } else {
        await archiveConvHistory(conv.id)
      }
      setHiddenMsgs(new Set(msgs.map(m => m.id)))
    } catch (e) {
      console.warn('[ChatArea] Erro ao limpar conversa:', e)
    } finally {
      setClearingAction(null)
      setShowClearModal(false)
    }
  }

  const handlePhotoSearch = (query) => {
    setPhotoSearch(query)
    if (query.trim().length >= 2) {
      setPhotoResults(searchProduct(query))
    } else {
      setPhotoResults([])
    }
  }

  const sendPhotoManual = async (produto) => {
    setSendingPhoto(true)
    // Mostra a foto imediatamente no chat
    const tempPhoto = { id: Date.now(), role: 'agent', text: produto.nome, image: produto.imagem, time: Date.now() }
    setMsgs(prev => [...prev, tempPhoto])
    try {
      await sendMessage(conv.id, produto.nome, produto.imagem)
      setTimeout(() => {
        sendMessage(conv.id, `${produto.preco}\n\n${produto.link}`).catch(() => {})
      }, 500)

      // Registra no histórico
      addPhotoToHistory({
        produto: produto.nome,
        cliente: conv.name,
        canal: conv.channelLabel,
        tipo: 'manual',
        sucesso: true,
      })

      setShowPhotoModal(false)
      setPhotoSearch('')
      setPhotoResults([])
    } catch (e) {
      console.error('Erro ao enviar foto:', e)

      // Registra erro no histórico
      addPhotoToHistory({
        produto: produto.nome,
        cliente: conv.name,
        canal: conv.channelLabel,
        tipo: 'manual',
        sucesso: false,
        erro: e.message,
      })
    } finally {
      setSendingPhoto(false)
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
            <div style={{ fontSize: 12, color: t.textMuted, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {conv.channelLabel}{conv.channelSub ? ` · ${conv.channelSub}` : ''}
              <span style={{
                fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '1px 6px',
                background: mode === 'copilot' ? '#FEE2E2' : '#F0FDF4',
                color: mode === 'copilot' ? '#DC2626' : '#16A34A',
              }}>
                {mode === 'copilot' ? '✋ Você está atendendo' : '🤖 Agente respondendo'}
              </span>
              {clientProfile?.buy_score > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '1px 6px',
                  background: clientProfile.buy_score >= 70 ? '#FEF9C3' : '#F3F4F6',
                  color: clientProfile.buy_score >= 70 ? '#92400E' : '#6B7280',
                }}>
                  {clientProfile.buy_score >= 70 ? '🔥' : '⚡'} Score {clientProfile.buy_score}
                </span>
              )}
              {clientProfile?.size && (
                <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '1px 6px', background: '#EDE9FE', color: '#5B21B6' }}>
                  👟 {clientProfile.size}
                </span>
              )}
              {clientProfile?.tags?.slice(0, 2).map((tag, i) => (
                <span key={i} style={{ fontSize: 10, fontWeight: 600, borderRadius: 4, padding: '1px 6px', background: '#F0FDF4', color: '#166534' }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Banner seleção inline quando selectMode ativo */}
          {selectMode && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button onClick={handleSaveConversation} disabled={selectedMsgs.size === 0 || savingConv}
                style={{ background: selectedMsgs.size > 0 ? '#10B981' : '#E5E5E5', border: 'none', borderRadius: 7, padding: '4px 10px', fontSize: 12, fontWeight: 700, color: selectedMsgs.size > 0 ? '#fff' : '#9CA3AF', cursor: selectedMsgs.size > 0 ? 'pointer' : 'default' }}>
                {savingConv ? '...' : `✓ ${selectedMsgs.size}`}
              </button>
              <button onClick={() => { setSelectMode(false); setSelectedMsgs(new Set()) }}
                style={{ background: 'none', border: 'none', fontSize: 18, color: '#9CA3AF', cursor: 'pointer', lineHeight: 1, padding: '2px 4px' }}>×</button>
            </div>
          )}
          <ModeToggle mode={mode} t={t} setMode={async (newMode) => {
            try {
              if (newMode === 'copilot') await assumeChat(conv.id)
              else await releaseChat(conv.id)
              setMode(newMode)
              onConvUpdate({ ...conv, mode: newMode })
            } catch (e) {
              setModeHint('⚠️ Erro ao mudar modo: ' + (e.message || 'Token pode ter expirado'))
              setTimeout(() => setModeHint(null), 6000)
            }
          }} />
          {/* Menu ⋮ */}
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button onClick={() => setShowMenu(s => !s)}
              style={{ background: showMenu ? t.bgTertiary : 'none', border: 'none', borderRadius: 7, padding: '4px 8px', cursor: 'pointer', color: t.textMuted, fontSize: 18, lineHeight: 1, display: 'flex', alignItems: 'center' }}>
              ⋮
            </button>
            {showMenu && (
              <div style={{ position: 'absolute', right: 0, top: 36, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.18)', minWidth: 200, zIndex: 200, overflow: 'hidden' }}>
                <MenuItem t={t} icon="🔍" label="Buscar no histórico" onClick={() => { setShowSearch(s => !s); setShowMenu(false) }} />
                <MenuItem t={t} icon="🧠" label={kbEnabled ? 'Base ativa' : 'Base inativa'} sublabel={kbEnabled ? 'clique para desativar' : 'clique para ativar'} onClick={() => { const n = !kbEnabled; setKbEnabled(n); localStorage.setItem('kb_enabled', String(n)); setShowMenu(false) }} active={kbEnabled} />
                <MenuItem t={t} icon="💬" label={memEnabled ? 'Memória ativa' : 'Memória inativa'} sublabel={memEnabled ? 'Gerar usa histórico completo' : 'Gerar usa msgs visíveis'} onClick={() => { const n = !memEnabled; setMemEnabled(n); localStorage.setItem('mem_enabled', String(n)); setShowMenu(false) }} active={memEnabled} />
                <MenuItem t={t} icon="💾" label="Salvar na base" onClick={() => { setSelectMode(true); setShowMenu(false) }} />
                <div style={{ height: 1, background: t.border, margin: '2px 0' }} />
                <MenuItem t={t} icon="🧹" label="Limpar conversa" onClick={() => { setShowClearModal(true); setShowMenu(false) }} />
                <MenuItem t={t} icon="✅" label="Resolver conversa" onClick={() => { handleFinish(); setShowMenu(false) }} />
              </div>
            )}
          </div>
          <button onClick={handleFinish} style={{ background: t.bgTertiary, border: `1px solid ${t.borderLight}`, borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, color: t.textSecondary, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Resolver
          </button>
        </div>
      </div>

      {/* Hint de modo */}
      {modeHint && (
        <div style={{ background: dark ? '#2a2010' : '#FEF3C7', borderBottom: `1px solid ${dark ? '#4a3a10' : '#FDE68A'}`, padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: dark ? '#FCD34D' : '#92400E', flexShrink: 0 }}>
          <span>⚡ {modeHint}</span>
          <a href={GPTMAKER_URL} target="_blank" rel="noreferrer" style={{ color: dark ? '#FBBF24' : '#D97706', fontWeight: 700, textDecoration: 'none', marginLeft: 8 }}>Abrir GPT Maker →</a>
        </div>
      )}

      {/* Barra de busca */}
      {showSearch && (
        <div style={{ padding: '8px 12px', borderBottom: `1px solid ${t.border}`, background: t.bg, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 13 }}>🔍</span>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar mensagens..."
            onKeyDown={e => e.key === 'Escape' && setShowSearch(false)}
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, color: t.text, background: 'transparent', fontFamily: 'inherit' }}
          />
          {searchQuery && (
            <span style={{ fontSize: 11, color: t.textMuted, fontWeight: 600 }}>
              {filteredMsgs.length} resultado{filteredMsgs.length !== 1 ? 's' : ''}
            </span>
          )}
          <button onClick={() => setShowSearch(false)} style={{ background: 'none', border: 'none', fontSize: 16, color: t.textMuted, cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}>×</button>
        </div>
      )}

      {/* Banner modo seleção */}
      {selectMode && (
        <div style={{ background: '#F5F3FF', borderBottom: '1px solid #DDD6FE', padding: '8px 16px', fontSize: 12, color: '#5B21B6', fontWeight: 600, flexShrink: 0 }}>
          Clique nas mensagens que quer salvar na base de conhecimento · {selectedMsgs.size} selecionada(s)
        </div>
      )}

      {/* Toast */}
      {saveToast && (
        <div style={{ position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)', background: '#10B981', color: '#fff', padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, zIndex: 999, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', whiteSpace: 'nowrap' }}>
          🧠 {saveToast}
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px', display: 'flex', flexDirection: 'column', gap: 6, background: t.bgSecondary, position: 'relative' }}>
        {loading
          ? <div style={{ textAlign: 'center', color: t.textMuted, fontSize: 13, marginTop: 40 }}>Carregando mensagens...</div>
          : msgs.length === 0
            ? <div style={{ textAlign: 'center', color: t.textMuted, fontSize: 13, marginTop: 40 }}>Nenhuma mensagem</div>
            : filteredMsgs.map(msg => (
                <MsgWrapper key={msg.id} msg={msg} selectMode={selectMode} selectedMsgs={selectedMsgs} toggleSelectMsg={toggleSelectMsg} onHide={() => setHiddenMsgs(prev => new Set([...prev, msg.id]))}>
                  <Bubble msg={msg} conv={conv} t={t} highlight={searchQuery} />
                </MsgWrapper>
              ))
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
            <div style={{ display: 'flex', gap: 4, position: 'relative' }}>
              <IconBtn title="Anexo" color={t.textMuted}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              </IconBtn>
              <IconBtn title="Emoji" color={t.textMuted}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 13s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
              </IconBtn>

              {/* Botão Enviar Foto */}
              <button
                onClick={() => setShowPhotoModal(!showPhotoModal)}
                title="Enviar Foto"
                style={{ background: 'transparent', border: 'none', padding: '4px 6px', borderRadius: 6, cursor: 'pointer', color: t.textMuted, display: 'flex', alignItems: 'center', fontSize: 16 }}
              >
                📸
              </button>

              {/* Modal Enviar Foto */}
              {showPhotoModal && (
                <div style={{ position: 'absolute', bottom: 40, left: 0, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, padding: 10, minWidth: 200, maxWidth: 250, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 1000 }}>
                  <input
                    type="text"
                    placeholder="Buscar produto..."
                    value={photoSearch}
                    onChange={e => handlePhotoSearch(e.target.value)}
                    style={{ width: '100%', borderRadius: 6, border: `1px solid ${t.border}`, padding: '6px 8px', fontSize: 12, marginBottom: 8 }}
                  />
                  {photoResults.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 150, overflowY: 'auto' }}>
                      {photoResults.map(prod => (
                        <button
                          key={prod.id}
                          onClick={() => sendPhotoManual(prod)}
                          disabled={sendingPhoto}
                          style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 6, padding: '6px 8px', textAlign: 'left', cursor: sendingPhoto ? 'not-allowed' : 'pointer', fontSize: 11, opacity: sendingPhoto ? 0.5 : 1 }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f0f0f0'}
                          onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                        >
                          <div style={{ fontWeight: 600, color: t.text }}>{prod.nome}</div>
                          <div style={{ fontSize: 10, color: t.textMuted }}>{prod.preco}</div>
                        </button>
                      ))}
                    </div>
                  )}
                  {photoSearch && photoResults.length === 0 && (
                    <div style={{ fontSize: 11, color: t.textMuted, textAlign: 'center', padding: 8 }}>Nenhum produto encontrado</div>
                  )}
                </div>
              )}

              <button onClick={handleGerar} disabled={gerarLoading} style={{ background: gerarLoading ? '#6B7280' : 'linear-gradient(135deg, #0EC331, #10B981)', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: gerarLoading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="#fff"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                {gerarLoading ? '...' : 'Gerar'}
              </button>
            </div>
            <button onClick={() => handleSend()} disabled={sending} style={{ width: 34, height: 34, background: sending ? '#B0E8BA' : '#0EC331', border: 'none', borderRadius: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: sending ? 'default' : 'pointer', transition: 'background 0.15s' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Modal — Limpar Conversa */}
      {showClearModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => !clearingAction && setShowClearModal(false)}>
          <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 16, padding: '28px 28px 24px', width: 360, maxWidth: '90vw', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 22, marginBottom: 6, textAlign: 'center' }}>🧹</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: t.text, textAlign: 'center', marginBottom: 4 }}>Limpar Conversa</div>
            <div style={{ fontSize: 12, color: t.textMuted, textAlign: 'center', marginBottom: 20 }}>
              {conv.name || conv.id} — o que fazer com essa conversa?
            </div>

            {/* Opção 1: Arquivo Morto */}
            <button
              onClick={() => handleClearConv('archive')}
              disabled={!!clearingAction}
              style={{
                width: '100%', background: clearingAction === 'archiving' ? '#F3F4F6' : (dark ? '#1E293B' : '#F8FAFC'),
                border: `1px solid ${dark ? '#334155' : '#E2E8F0'}`, borderRadius: 12, padding: '14px 16px',
                cursor: clearingAction ? 'not-allowed' : 'pointer', textAlign: 'left', marginBottom: 10,
                opacity: clearingAction && clearingAction !== 'archiving' ? 0.4 : 1, transition: 'opacity 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>📦</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>
                    {clearingAction === 'archiving' ? 'Arquivando...' : 'Arquivo Morto (90 dias)'}
                  </div>
                  <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
                    Arquiva do Supabase. GPTMaker continua. Hard delete em 90 dias.
                  </div>
                </div>
              </div>
            </button>

            {/* Opção 2: Apagar Tudo */}
            <button
              onClick={() => handleClearConv('delete')}
              disabled={!!clearingAction}
              style={{
                width: '100%', background: clearingAction === 'deleting' ? '#FEF2F2' : (dark ? '#2D1515' : '#FFF5F5'),
                border: `1px solid ${dark ? '#7F1D1D' : '#FECACA'}`, borderRadius: 12, padding: '14px 16px',
                cursor: clearingAction ? 'not-allowed' : 'pointer', textAlign: 'left', marginBottom: 20,
                opacity: clearingAction && clearingAction !== 'deleting' ? 0.4 : 1, transition: 'opacity 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>🗑️</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#DC2626' }}>
                    {clearingAction === 'deleting' ? 'Apagando...' : 'Apagar Tudo'}
                  </div>
                  <div style={{ fontSize: 11, color: '#EF4444', marginTop: 2 }}>
                    Deleta do Supabase e do GPTMAKER. Irreversível.
                  </div>
                </div>
              </div>
            </button>

            <button
              onClick={() => setShowClearModal(false)}
              disabled={!!clearingAction}
              style={{ width: '100%', background: 'none', border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px', fontSize: 12, color: t.textMuted, cursor: clearingAction ? 'not-allowed' : 'pointer' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
})

export default ChatArea

function MenuItem({ t, icon, label, sublabel, onClick, danger, active }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: hov ? (t?.bgTertiary || 'rgba(0,0,0,0.04)') : 'none', border: 'none', padding: '9px 16px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
      <span style={{ fontSize: 15, opacity: active === false ? 0.35 : 1 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 13, color: danger ? '#DC2626' : (t?.text || '#333'), fontWeight: active ? 600 : 400 }}>{label}</div>
        {sublabel && <div style={{ fontSize: 11, color: t?.textMuted || '#9CA3AF', marginTop: 1 }}>{sublabel}</div>}
      </div>
      {active !== undefined && (
        <div style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: active ? '#10B981' : '#D1D5DB', flexShrink: 0 }} />
      )}
    </button>
  )
}

function MsgWrapper({ msg, selectMode, selectedMsgs, toggleSelectMsg, onHide, children }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => selectMode && toggleSelectMsg(msg.id)}
      style={{ position: 'relative', cursor: selectMode ? 'pointer' : 'default', borderRadius: 10, outline: selectMode && selectedMsgs.has(msg.id) ? '2px solid #10B981' : 'none', background: selectMode && selectedMsgs.has(msg.id) ? 'rgba(16,185,129,0.07)' : 'transparent', transition: 'all 0.1s' }}>
      {selectMode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 4px 2px', fontSize: 11, color: selectedMsgs.has(msg.id) ? '#10B981' : '#D1D5DB', fontWeight: 600 }}>
          {selectedMsgs.has(msg.id) ? '✓ Selecionada' : '○ Clique para selecionar'}
        </div>
      )}
      {children}
      {hovered && !selectMode && (
        <button
          onClick={e => { e.stopPropagation(); onHide() }}
          title="Ocultar mensagem"
          style={{ position: 'absolute', top: 4, left: 36, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0, opacity: 0.55, transition: 'opacity 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
          onMouseLeave={e => e.currentTarget.style.opacity = '0.55'}>
          🗑️
        </button>
      )}
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
      {[['autopilot','🤖 Agente'],['copilot','✋ Assumir']].map(([val, label]) => (
        <button key={val} onClick={() => setMode(val)} style={{
          background: mode === val ? t.bg : 'transparent',
          color: mode === val ? (val === 'copilot' ? '#DC2626' : '#0EC331') : t.textMuted,
          border: 'none', borderRadius: 9999,
          padding: '4px 12px', fontSize: 12, fontWeight: mode === val ? 700 : 500,
          boxShadow: mode === val ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          transition: 'all 0.15s', cursor: 'pointer',
        }}>{label}</button>
      ))}
    </div>
  )
}

function AudioBubble({ msg, isUser, t }) {
  const transcription = msg.midiaContent || ''
  const bgColor = isUser ? t.bubbleUser : t.bubbleAI
  const radius = isUser ? '2px 14px 14px 14px' : '14px 2px 14px 14px'
  const border = isUser ? `1px solid ${t.borderLight}` : 'none'

  return (
    <div style={{ background: bgColor, border, borderRadius: radius, padding: '9px 13px', boxShadow: isUser ? '0 1px 2px rgba(0,0,0,0.05)' : 'none', maxWidth: 280 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: transcription ? 6 : 0 }}>
        <span style={{ fontSize: 16 }}>🎤</span>
        <span style={{ fontSize: 11, color: t.textMuted, fontWeight: 600 }}>Áudio</span>
      </div>
      {transcription && (
        <div style={{ fontSize: 12, color: t.text, fontStyle: 'italic', lineHeight: 1.5 }}>
          "{transcription}"
        </div>
      )}
      {!transcription && (
        <div style={{ fontSize: 11, color: t.textMuted }}>Sem transcrição disponível</div>
      )}
    </div>
  )
}

function highlightText(text, query) {
  if (!query || !text) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: '#FEF08A', color: '#713F12', borderRadius: 2, padding: '0 1px' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {highlightText(text.slice(idx + query.length), query)}
    </>
  )
}

function Bubble({ msg, conv, t, highlight }) {
  const text = msg.text || msg.content || ''
  const time = fmtTime(msg.time)
  const isAudio = msg.type === 'AUDIO' || (msg.audioUrl && !msg.text)
  const imageUrl = msg.image || msg.imagem || msg.imageUrl || (msg.type === 'IMAGE' ? msg.midiaUrl : null)
  const renderedText = highlight ? highlightText(text, highlight) : text

  if (msg.role === 'user') {
    return (
      <div style={{ display: 'flex', gap: 8, maxWidth: '72%', alignSelf: 'flex-start' }}>
        {conv.picture
          ? <img src={conv.picture} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, marginTop: 2 }} onError={e => e.target.style.display='none'} />
          : <div style={{ width: 28, height: 28, borderRadius: '50%', background: conv.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0, marginTop: 2 }}>{conv.initials}</div>
        }
        <div>
          {isAudio
            ? <AudioBubble msg={msg} isUser t={t} />
            : imageUrl
              ? <img src={imageUrl} alt={text || 'foto'} style={{ maxWidth: 200, borderRadius: 10, display: 'block' }} />
              : <div style={{ background: t.bubbleUser, border: `1px solid ${t.borderLight}`, borderRadius: '2px 14px 14px 14px', padding: '9px 13px', fontSize: 13, color: t.text, lineHeight: 1.55, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>{renderedText}</div>
          }
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
          {isAudio
            ? <AudioBubble msg={msg} isUser={false} t={t} />
            : imageUrl
              ? <img src={imageUrl} alt={text || 'foto'} style={{ maxWidth: 200, borderRadius: 10, display: 'block' }} />
              : <div style={{ background: t.bubbleAI, borderRadius: '14px 2px 14px 14px', padding: '9px 13px', fontSize: 13, color: t.text, lineHeight: 1.55 }}>{renderedText}</div>
          }
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
          {isAudio
            ? <AudioBubble msg={msg} isUser={false} t={t} />
            : imageUrl
              ? <img src={imageUrl} alt={text || 'foto'} style={{ maxWidth: 200, borderRadius: 10, display: 'block' }} />
              : <div style={{ background: t.bubbleAI, borderRadius: '14px 2px 14px 14px', padding: '9px 13px', fontSize: 13, color: t.text, lineHeight: 1.55 }}>{renderedText}</div>
          }
          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 3, textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
            {time} · {msg.metadata?.senderName || 'Você'}
            <svg width="12" height="8" viewBox="0 0 16 10" fill={t.textMuted}><path d="M1 5l4 4L15 1M6 5l4 4"/></svg>
          </div>
        </div>
      </div>
    )
  }

  if (msg.role === 'system') {
    return (
      <div style={{ alignSelf: 'center', fontSize: 11, color: t.textMuted, background: t.bgSecondary, borderRadius: 20, padding: '4px 12px', border: `1px solid ${t.borderLight}`, maxWidth: '80%', textAlign: 'center' }}>
        {text}
      </div>
    )
  }

  return null
}
