import { useCallback, useEffect, useState } from 'react'
import { getGPTMakerCredits } from '../services/gptmakerCreditsService'

export default function GPTMakerCreditsCard() {
  const [credits, setCredits] = useState(null)
  const [loading, setLoading] = useState(false)

  const loadCredits = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getGPTMakerCredits()
      if (data) {
        setCredits(data)
      }
    } catch (e) {
      console.error('[GPTMaker Card] Erro:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCredits()
    const interval = setInterval(loadCredits, 10 * 60 * 1000)
    return () => clearInterval(interval)
  }, [loadCredits])

  if (!credits) {
    return (
      <div style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        padding: '8px 10px',
        marginBottom: '12px',
        fontSize: '12px',
        color: '#9ca3af'
      }}>
        💰 Carregando créditos...
      </div>
    )
  }

  const getStatusColor = (credits) => {
    if (credits > 1000) return '#10b981'
    if (credits > 500) return '#f59e0b'
    if (credits > 100) return '#ef4444'
    return '#dc2626'
  }

  const getAlertStatus = (credits) => {
    if (credits < 100) return '🔴 CRÍTICO'
    if (credits < 300) return '⚠️ BAIXO'
    if (credits < 800) return '⚠️ AVISO'
    return '✅ OK'
  }

  const statusColor = getStatusColor(credits.credits)
  const alertStatus = getAlertStatus(credits.credits)
  const percent = Math.min(100, Math.round((credits.credits / 2000) * 100))

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: 8,
      padding: '8px 10px',
      marginBottom: '12px',
      fontSize: '12px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ fontWeight: 600, color: '#1f2937' }}>💰 CRÉDITOS</span>
        <span style={{ fontWeight: 700, color: statusColor, fontSize: 13 }}>{credits.credits}</span>
      </div>

      <div style={{
        width: '100%',
        height: 5,
        background: '#e5e7eb',
        borderRadius: 3,
        overflow: 'hidden',
        marginBottom: '6px'
      }}>
        <div style={{
          width: `${percent}%`,
          height: '100%',
          background: statusColor,
          transition: 'all 0.3s ease'
        }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <span style={{ color: '#9ca3af' }}>
          {percent}% · {alertStatus}
        </span>
        <button
          onClick={loadCredits}
          disabled={loading}
          style={{
            background: 'none',
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '10px',
            color: '#6b7280',
            opacity: loading ? 0.5 : 1,
            padding: 0,
            fontWeight: 500
          }}
        >
          {loading ? '⏳' : '🔄'}
        </button>
      </div>

      {credits.credits < 300 && (
        <div style={{
          fontSize: 10,
          color: '#ef4444',
          fontWeight: 600,
          marginTop: 4,
          padding: '4px 6px',
          background: '#fee2e2',
          borderRadius: 3
        }}>
          ⚠️ Créditos baixos! Recarregue em breve
        </div>
      )}
    </div>
  )
}
