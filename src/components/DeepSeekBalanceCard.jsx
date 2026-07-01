import { useCallback, useEffect, useState } from 'react'
import { getDeepSeekBalance } from '../services/deepseekBalanceService'

export default function DeepSeekBalanceCard({ boxed = false }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await getDeepSeekBalance()
    setData(result)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 30 * 60 * 1000)
    return () => clearInterval(interval)
  }, [load])

  const boxStyle = boxed ? {
    background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px',
  } : {}

  if (!data) {
    return (
      <div style={{ fontSize: 11, color: '#9ca3af', ...boxStyle }}>
        💰 Carregando saldo DeepSeek...
      </div>
    )
  }

  const statusColor = data.balance > 0.5 ? '#10b981' : data.balance > 0.1 ? '#f59e0b' : '#ef4444'
  const statusLabel = data.balance > 0.5 ? '✅ OK' : data.balance > 0.1 ? '⚠️ Baixo' : '🔴 Recarregar'

  return (
    <div style={{ fontSize: 12, ...boxStyle }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, color: '#1f2937' }}>💰 Saldo DeepSeek</span>
        <span style={{ fontWeight: 700, color: statusColor }}>${data.balance.toFixed(2)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, fontSize: 11, color: '#9ca3af' }}>
        <span>Conta compartilhada (CODEX + GPT Maker)</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {statusLabel}
          <button
            onClick={load}
            disabled={loading}
            style={{ background: 'none', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 10, color: '#6b7280', opacity: loading ? 0.5 : 1, padding: 0 }}
          >
            {loading ? '⏳' : '🔄'}
          </button>
        </span>
      </div>
    </div>
  )
}
