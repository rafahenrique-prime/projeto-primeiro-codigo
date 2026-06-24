import { useCallback, useEffect, useState } from 'react'
import { getSupabaseStorageInfo } from '../services/supabaseStorage'

export default function SupabaseStorageCard() {
  const [storage, setStorage] = useState(null)

  const loadStorage = useCallback(async () => {
    const data = await getSupabaseStorageInfo()
    setStorage(data)
  }, [])

  useEffect(() => {
    loadStorage()
    const interval = setInterval(loadStorage, 30 * 60 * 1000)
    return () => clearInterval(interval)
  }, [loadStorage])

  if (!storage) {
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
        📦 Carregando storage...
      </div>
    )
  }

  const getBarColor = (percent) => {
    if (percent < 70) return '#10b981'
    if (percent < 85) return '#f59e0b'
    return '#ef4444'
  }

  const barColor = getBarColor(storage.usedPercent)

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
        <span style={{ fontWeight: 600, color: '#1f2937' }}>📦 Storage</span>
        <span style={{ fontWeight: 700, color: barColor }}>{storage.usedPercent}%</span>
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
          width: `${storage.usedPercent}%`,
          height: '100%',
          background: barColor,
          transition: 'all 0.3s ease'
        }} />
      </div>
      <div style={{ color: '#9ca3af' }}>
        {storage.usedGB.toFixed(2)} GB / {storage.totalGB} GB
      </div>
    </div>
  )
}
