import { useCallback, useEffect, useState } from 'react'
import { getMonthlyTokenUsage } from '../services/tokenLoggingService'

export default function TokenUsageCard() {
  const [tokenUsage, setTokenUsage] = useState(null)

  const loadTokenUsage = useCallback(async () => {
    try {
      const { totalTokens } = await getMonthlyTokenUsage('deepseek')

      const freeLimit = 1000000
      const percent = Math.round((totalTokens / freeLimit) * 100)

      setTokenUsage({
        usedTokens: totalTokens,
        freeLimit: freeLimit,
        usedPercent: Math.min(percent, 100),
        usedK: (totalTokens / 1000).toFixed(0),
        freeK: (freeLimit / 1000).toFixed(0)
      })
    } catch (e) {
      console.error('[TokenUsage] Erro:', e)
      setTokenUsage({
        usedTokens: 0,
        freeLimit: 1000000,
        usedPercent: 0,
        usedK: '0',
        freeK: '1000',
        error: true
      })
    }
  }, [])

  useEffect(() => {
    loadTokenUsage()
    const interval = setInterval(loadTokenUsage, 30 * 60 * 1000)
    return () => clearInterval(interval)
  }, [loadTokenUsage])

  if (!tokenUsage) {
    return (
      <div style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        padding: '10px',
        marginBottom: '12px',
        fontSize: '12px',
        color: '#9ca3af'
      }}>
        🧠 Carregando tokens...
      </div>
    )
  }

  const getBarColor = (percent) => {
    if (percent < 70) return '#10b981'
    if (percent < 85) return '#f59e0b'
    return '#ef4444'
  }

  const barColor = getBarColor(tokenUsage.usedPercent)
  const isAlert = tokenUsage.usedPercent >= 90
  const status = isAlert ? '⚠️ ALERTA' : '✅'
  const alertColor = isAlert ? '#ef4444' : 'inherit'

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: 8,
      padding: '10px',
      marginBottom: '12px',
      fontSize: '12px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ fontWeight: 600, color: '#1f2937' }}>🧠 DeepSeek Lite</span>
        <span style={{ fontWeight: 700, color: barColor }}>{tokenUsage.usedPercent}%</span>
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
          width: `${tokenUsage.usedPercent}%`,
          height: '100%',
          background: barColor,
          transition: 'all 0.3s ease'
        }} />
      </div>
      <div style={{ color: '#9ca3af', display: 'flex', justifyContent: 'space-between' }}>
        <span>{tokenUsage.usedK}K / {tokenUsage.freeK}K tokens</span>
        <span style={{ color: alertColor, fontWeight: isAlert ? 700 : 400 }}>{status}</span>
      </div>
      {isAlert && (
        <div style={{ fontSize: 11, color: '#ef4444', marginTop: 6, fontWeight: 600 }}>
          ⚠️ Próximo do limite! ({tokenUsage.usedPercent}%)
        </div>
      )}
    </div>
  )
}
