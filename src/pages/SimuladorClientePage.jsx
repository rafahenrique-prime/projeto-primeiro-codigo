import { useState, useRef, useEffect } from 'react'
import { detectProductRequest } from '../services/groq'
import { findBestMatch, searchProduct } from '../services/catalog'
import { addPhotoToHistory, getPhotoStats } from '../services/photoHistory'
import { useTheme } from '../theme.jsx'

export default function SimuladorClientePage() {
  const { theme: t } = useTheme()
  const [messages, setMessages] = useState([
    { id: 1, role: 'ia', text: 'Olá! Sou a IA da PRIME STORE. Teste o sistema pedindo uma foto de um produto! 📸', type: 'text' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [cliente, setCliente] = useState('Cliente Teste')
  const [canal, setCanal] = useState('Simulador')
  const [stats, setStats] = useState(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    getPhotoStats().then(setStats)
  }, [messages])

  const enviarMensagem = async (text = '') => {
    const msg = (text || input).trim()
    if (!msg || loading) return

    setInput('')
    setLoading(true)

    // Adiciona mensagem do cliente
    const clientMsg = { id: Date.now(), role: 'cliente', text: msg, type: 'text' }
    setMessages(prev => [...prev, clientMsg])

    try {
      // Detecta se é pedido de foto
      const detection = detectProductRequest(msg)

      if (detection.temPedidoFoto && detection.nomeProduto) {
        // Simula delay de processamento
        await new Promise(resolve => setTimeout(resolve, 800))

        // Busca o produto
        const produto = findBestMatch(detection.nomeProduto)

        // Valida se produto foi encontrado E tem confiança mínima
        if (produto && produto.nome && produto.imagem) {
          // Calcula confidence (0-100)
          const confidence = produto.score ? Math.round(produto.score * 100) : 75

          // Aviso se score for baixo
          if (confidence < 50) {
            console.warn('[SimuladorClientePage] ⚠️  Baixa confiança para:', detection.nomeProduto, '|', confidence + '%')
          }

          // Adiciona mensagem da IA mostrando a foto
          const photoMsg = {
            id: Date.now() + 1,
            role: 'ia',
            text: `Aqui está a foto do ${produto.nome}`,
            type: 'photo',
            imagem: produto.imagem,
            produto: produto,
            confidence: confidence,
          }
          setMessages(prev => [...prev, photoMsg])

          // Aguarda um pouco
          await new Promise(resolve => setTimeout(resolve, 600))

          // Envia preço e link
          const priceMsg = {
            id: Date.now() + 2,
            role: 'ia',
            text: `${produto.preco}\n\nLink: ${produto.link}`,
            type: 'text',
          }
          setMessages(prev => [...prev, priceMsg])

          // Registra no histórico
          addPhotoToHistory({
            produto: produto.nome,
            cliente: cliente,
            canal: canal,
            tipo: 'simulado',
            sucesso: true,
          })

          getPhotoStats().then(setStats)
        } else {
          // Produto não encontrado
          const errorMsg = {
            id: Date.now() + 1,
            role: 'ia',
            text: `Desculpe, não encontrei "${detection.nomeProduto}" no catálogo. Tente com outro produto!`,
            type: 'text',
          }
          setMessages(prev => [...prev, errorMsg])

          addPhotoToHistory({
            produto: detection.nomeProduto,
            cliente: cliente,
            canal: canal,
            tipo: 'simulado',
            sucesso: false,
            erro: 'Produto não encontrado',
          })
        }
      } else {
        // Não é pedido de foto - responde genericamente
        const responses = [
          'Temos muitos produtos disponíveis! Qual você gostaria de ver? 👕👟',
          'Clique em algum produto ou me peça uma foto! 📸',
          'Que tal pedir uma foto? Ex: "qual é a foto do nike?" 🎯',
          'Estou aqui para ajudar! Peça uma foto de qualquer produto 📷',
        ]

        await new Promise(resolve => setTimeout(resolve, 600))

        const replyMsg = {
          id: Date.now() + 1,
          role: 'ia',
          text: responses[Math.floor(Math.random() * responses.length)],
          type: 'text',
        }
        setMessages(prev => [...prev, replyMsg])
      }
    } catch (e) {
      console.error('Erro:', e)
      const errorMsg = {
        id: Date.now() + 1,
        role: 'ia',
        text: `Erro ao processar: ${e.message}`,
        type: 'text',
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ flex: 1, background: t.bg, borderRadius: 12, display: 'flex', overflow: 'hidden', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${t.border}`, background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: t.text }}>🎭 Simulador de Cliente</h2>
          <p style={{ margin: '4px 0 0 0', fontSize: 12, color: t.textMuted }}>Teste o sistema como se fosse um cliente real</p>
        </div>
        {stats && (
          <div style={{ display: 'flex', gap: 16, fontSize: 12, textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0EC331' }}>{stats.total}</div>
              <div style={{ color: t.textMuted }}>Testes</div>
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#10B981' }}>{stats.sucessos}</div>
              <div style={{ color: t.textMuted }}>Sucesso</div>
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#F87171' }}>{stats.taxaSucesso}%</div>
              <div style={{ color: t.textMuted }}>Taxa</div>
            </div>
          </div>
        )}
      </div>

      {/* Configurações */}
      <div style={{ padding: '12px 20px', borderBottom: `1px solid ${t.border}`, background: t.bgSecondary, display: 'flex', gap: 12, fontSize: 12, flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', color: t.textMuted, marginBottom: 4 }}>Cliente:</label>
          <input
            type="text"
            value={cliente}
            onChange={e => setCliente(e.target.value)}
            style={{ width: '100%', borderRadius: 6, border: `1px solid ${t.border}`, padding: '6px 8px', fontSize: 12, background: t.bg, color: t.text }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', color: t.textMuted, marginBottom: 4 }}>Canal:</label>
          <select
            value={canal}
            onChange={e => setCanal(e.target.value)}
            style={{ width: '100%', borderRadius: 6, border: `1px solid ${t.border}`, padding: '6px 8px', fontSize: 12, background: t.bg, color: t.text }}
          >
            <option>WhatsApp</option>
            <option>Instagram</option>
            <option>Simulador</option>
          </select>
        </div>
      </div>

      {/* Chat */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12, background: t.bgSecondary }}>
        {messages.map(msg => (
          <div key={msg.id} style={{ display: 'flex', gap: 8, justifyContent: msg.role === 'cliente' ? 'flex-end' : 'flex-start' }}>
            {msg.role === 'ia' && (
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#FEF3EE', border: '1.5px solid #E8714A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16 }}>
                🤖
              </div>
            )}
            <div style={{ maxWidth: '60%' }}>
              {msg.type === 'photo' ? (
                <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 12, overflow: 'hidden' }}>
                  <img src={msg.imagem} alt={msg.produto.nome} style={{ width: '100%', maxHeight: 200, objectFit: 'cover' }} />
                  <div style={{ padding: '10px', fontSize: 12, fontWeight: 600, color: t.text }}>
                    {msg.produto.nome}
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    background: msg.role === 'cliente' ? '#0EC331' : t.bg,
                    color: msg.role === 'cliente' ? '#fff' : t.text,
                    border: msg.role === 'ia' ? `1px solid ${t.border}` : 'none',
                    borderRadius: 12,
                    padding: '10px 14px',
                    fontSize: 13,
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {msg.text}
                </div>
              )}
            </div>
            {msg.role === 'cliente' && (
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16 }}>
                👤
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#FEF3EE', border: '1.5px solid #E8714A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              🤖
            </div>
            <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 12, padding: '10px 14px', display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#0EC331', animation: 'blink 1s 0s infinite' }} />
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#0EC331', animation: 'blink 1s 0.2s infinite' }} />
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#0EC331', animation: 'blink 1s 0.4s infinite' }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '14px 20px', borderTop: `1px solid ${t.border}`, background: t.bg, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button
            onClick={() => enviarMensagem('qual é a foto do new balance?')}
            style={{ fontSize: 11, background: '#DBEAFE', color: '#1E40AF', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontWeight: 600 }}
          >
            📸 New Balance
          </button>
          <button
            onClick={() => enviarMensagem('manda a foto do nike dunk')}
            style={{ fontSize: 11, background: '#FEE2E2', color: '#7F1D1D', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontWeight: 600 }}
          >
            📸 Nike
          </button>
          <button
            onClick={() => enviarMensagem('qual é a foto da cueca?')}
            style={{ fontSize: 11, background: '#F3E8FF', color: '#5B21B6', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontWeight: 600 }}
          >
            📸 Cueca
          </button>
          <button
            onClick={() => enviarMensagem('qual é a foto do armani?')}
            style={{ fontSize: 11, background: '#FECACA', color: '#9F1239', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontWeight: 600 }}
          >
            📸 Armani
          </button>
        </div>

        <div style={{ background: t.bg, border: '1.5px solid #0EC331', borderRadius: 12, padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensagem() } }}
            rows={2}
            placeholder="Digite como se fosse um cliente (ex: qual é a foto do nike?)"
            style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 13, color: t.text, outline: 'none', resize: 'none', fontFamily: 'inherit' }}
          />
          <button
            onClick={() => enviarMensagem()}
            disabled={loading}
            style={{ width: 34, height: 34, background: loading ? '#B0E8BA' : '#0EC331', border: 'none', borderRadius: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: loading ? 'default' : 'pointer', flexShrink: 0 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes blink {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
