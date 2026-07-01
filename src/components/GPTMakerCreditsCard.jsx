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

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: 8,
      padding: '8px 10px',
      marginBottom: '12px',
      fontSize: '12px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <span style={{ fontWeight: 600, color: '#1f2937' }}>💰 CRÉDITOS GASTOS</span>
        <span style={{ fontWeight: 700, color: '#7C3AED', fontSize: 13 }}>{credits.creditsSpent}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#9ca3af' }}>
          desde {credits.periodStart ? new Date(credits.periodStart).toLocaleDateString('pt-BR') : '—'}
          {credits.cached ? ' · cache' : ''}
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
    </div>
  )
}
