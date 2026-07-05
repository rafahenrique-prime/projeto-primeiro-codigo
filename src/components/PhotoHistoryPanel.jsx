import { useState, useEffect } from 'react'
import { useTheme } from '../theme.jsx'
import { getPhotoHistory, getPhotoStats, clearPhotoHistory } from '../services/photoHistory'

// Formato padrão de data/hora — igual ao usado em KnowledgePage.jsx
function formatDateTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '')
}

export default function PhotoHistoryPanel() {
  const { theme: t } = useTheme()
  const [history, setHistory] = useState([])
  const [stats, setStats] = useState(null)
  const [filtro, setFiltro] = useState('todos')

  useEffect(() => {
    carregarDados()
    const interval = setInterval(carregarDados, 5000)
    return () => clearInterval(interval)
  }, [filtro])

  const carregarDados = async () => {
    let dados = []
    if (filtro === 'todos') dados = await getPhotoHistory()
    else if (filtro === 'sucesso') dados = await getPhotoHistory({ sucesso: true })
    else if (filtro === 'erro') dados = await getPhotoHistory({ sucesso: false })
    else if (filtro === 'automático') dados = await getPhotoHistory({ tipo: 'automático' })
    else if (filtro === 'manual') dados = await getPhotoHistory({ tipo: 'manual' })

    setHistory(dados)
    setStats(await getPhotoStats())
  }

  const limparHistorico = async () => {
    if (confirm('Limpar todo o histórico de fotos?')) {
      await clearPhotoHistory()
      carregarDados()
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <StatCard t={t} label="Total enviado" value={stats.total} color={t.text} />
          <StatCard t={t} label="Sucesso" value={stats.sucessos} color="#10B981" />
          <StatCard t={t} label="Taxa de sucesso" value={`${stats.taxaSucesso}%`} color={stats.taxaSucesso >= 90 ? '#10B981' : '#F59E0B'} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['todos', 'sucesso', 'erro', 'automático', 'manual'].map(f => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              style={{
                background: filtro === f ? (t.primary || '#E8192C') : t.bgTertiary,
                color: filtro === f ? '#fff' : t.textMid,
                border: 'none', borderRadius: 9999,
                padding: '5px 12px', fontSize: 12, fontWeight: filtro === f ? 600 : 500,
                cursor: 'pointer', textTransform: 'capitalize',
              }}
            >{f}</button>
          ))}
        </div>
        <button onClick={limparHistorico} style={{ background: 'none', border: `1px solid ${t.border}`, borderRadius: 8, padding: '6px 12px', fontSize: 12, color: t.textSecondary, cursor: 'pointer' }}>
          Limpar histórico
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {history.length === 0 ? (
          <div style={{ textAlign: 'center', color: t.textMuted, padding: '40px 20px', fontSize: 13 }}>
            Nenhuma foto registrada ainda.
          </div>
        ) : (
          history.map(item => (
            <div key={item.id} style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ fontWeight: 600, color: t.text }}>{item.produto}</div>
                <div style={{ fontSize: 10, color: t.textMuted }}>{formatDateTime(item.created_at)}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, fontSize: 11, color: t.textMuted, marginBottom: 6 }}>
                <span>{item.cliente}</span>
                <span>·</span>
                <span>{item.canal}</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <Badge bg={item.sucesso ? '#D1FAE5' : '#FEE2E2'} color={item.sucesso ? '#065F46' : '#7F1D1D'} label={item.sucesso ? 'Enviado' : 'Erro'} />
                <Badge bg={item.tipo === 'automático' ? '#DBEAFE' : '#FEF3C7'} color={item.tipo === 'automático' ? '#1E40AF' : '#92400E'} label={item.tipo === 'automático' ? 'Automático' : 'Manual'} />
              </div>
              {item.erro && (
                <div style={{ marginTop: 6, padding: '6px 8px', background: '#FEE2E2', borderRadius: 6, fontSize: 10, color: '#7F1D1D' }}>{item.erro}</div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function StatCard({ t, label, value, color }) {
  return (
    <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 600, color }}>{value}</div>
      <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{label}</div>
    </div>
  )
}

function Badge({ bg, color, label }) {
  return <span style={{ background: bg, color, padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600 }}>{label}</span>
}
