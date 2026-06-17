import { useState, useEffect } from 'react'
import { getPhotoHistory, getPhotoStats, clearPhotoHistory } from '../services/photoHistory'

export default function PhotoHistoryPanel({ isOpen, onClose, theme: t }) {
  const [history, setHistory] = useState([])
  const [stats, setStats] = useState(null)
  const [filtro, setFiltro] = useState('todos')

  useEffect(() => {
    if (isOpen) {
      carregarDados()
      const interval = setInterval(carregarDados, 3000)
      return () => clearInterval(interval)
    }
  }, [isOpen, filtro])

  const carregarDados = () => {
    let dados = []
    if (filtro === 'todos') dados = getPhotoHistory()
    else if (filtro === 'sucesso') dados = getPhotoHistory({ sucesso: true })
    else if (filtro === 'erro') dados = getPhotoHistory({ sucesso: false })
    else if (filtro === 'automático') dados = getPhotoHistory({ tipo: 'automático' })
    else if (filtro === 'manual') dados = getPhotoHistory({ tipo: 'manual' })

    setHistory(dados)
    setStats(getPhotoStats())
  }

  const limparHistorico = () => {
    if (confirm('Limpar todo o histórico de fotos?')) {
      clearPhotoHistory()
      carregarDados()
    }
  }

  if (!isOpen) return null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ width: '100%', maxWidth: 500, background: t.bg, borderRadius: '12px 12px 0 0', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '16px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: t.text }}>📸 Histórico de Fotos</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: t.textMuted }}>✕</button>
        </div>

        {/* Stats */}
        {stats && (
          <div style={{ padding: '12px 16px', background: t.bgSecondary, borderBottom: `1px solid ${t.border}`, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 12 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#0EC331' }}>{stats.total}</div>
              <div style={{ color: t.textMuted }}>Total</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#10B981' }}>{stats.sucessos}</div>
              <div style={{ color: t.textMuted }}>Sucesso</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#F87171' }}>{stats.taxaSucesso}%</div>
              <div style={{ color: t.textMuted }}>Taxa</div>
            </div>
          </div>
        )}

        {/* Filtros */}
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}`, display: 'flex', gap: 6, overflowX: 'auto', flexShrink: 0 }}>
          {['todos', 'sucesso', 'erro', 'automático', 'manual'].map(f => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              style={{
                background: filtro === f ? '#0EC331' : t.bgSecondary,
                color: filtro === f ? '#fff' : t.text,
                border: `1px solid ${filtro === f ? '#0EC331' : t.border}`,
                borderRadius: 9999,
                padding: '4px 12px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {f === 'todos' && 'Todos'}
              {f === 'sucesso' && '✅ Sucesso'}
              {f === 'erro' && '❌ Erro'}
              {f === 'automático' && '⚡ Automático'}
              {f === 'manual' && '👆 Manual'}
            </button>
          ))}
        </div>

        {/* Lista */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {history.length === 0 ? (
            <div style={{ textAlign: 'center', color: t.textMuted, padding: '40px 20px', fontSize: 13 }}>
              Nenhuma foto enviada ainda
            </div>
          ) : (
            history.map(item => (
              <div
                key={item.id}
                style={{
                  background: t.bgSecondary,
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  padding: '10px 12px',
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ fontWeight: 600, color: t.text }}>{item.produto}</div>
                  <div style={{ fontSize: 10, color: t.textMuted }}>{item.timestamp}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: 11, color: t.textMuted, marginBottom: 4 }}>
                  <span>{item.cliente}</span>
                  <span>·</span>
                  <span>{item.canal}</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{ background: item.sucesso ? '#D1FAE5' : '#FEE2E2', color: item.sucesso ? '#065F46' : '#7F1D1D', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
                    {item.sucesso ? '✅ Enviado' : '❌ Erro'}
                  </span>
                  <span style={{ background: item.tipo === 'automático' ? '#DBEAFE' : '#FEF3C7', color: item.tipo === 'automático' ? '#1E40AF' : '#92400E', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
                    {item.tipo === 'automático' ? '⚡ Auto' : '👆 Manual'}
                  </span>
                </div>
                {item.erro && (
                  <div style={{ marginTop: 6, padding: '6px 8px', background: '#FEE2E2', borderRadius: 4, fontSize: 10, color: '#7F1D1D' }}>
                    {item.erro}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${t.border}`, display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            onClick={limparHistorico}
            style={{
              flex: 1,
              background: 'none',
              border: `1px solid ${t.border}`,
              borderRadius: 6,
              padding: '8px 12px',
              fontSize: 12,
              fontWeight: 600,
              color: t.textSecondary,
              cursor: 'pointer',
            }}
          >
            🗑️ Limpar
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              background: '#0EC331',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '8px 12px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ✓ Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
