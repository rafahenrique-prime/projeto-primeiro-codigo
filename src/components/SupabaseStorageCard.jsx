import { useCallback, useEffect, useState } from 'react'
import { getSupabaseStorageInfo } from '../services/supabaseStorage'

export default function SupabaseStorageCard({ boxed = false }) {
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

  const boxStyle = boxed ? {
    background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px',
  } : {}

  if (!storage) {
    return (
      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 10, ...boxStyle }}>
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
  const dbBarColor = storage.dbUsedPercent != null ? getBarColor(storage.dbUsedPercent) : '#e5e7eb'

  return (
    <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6, ...boxStyle }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginBottom: 3 }}>
          <span style={{ fontWeight: 600, color: '#6b7280' }}>📦 Storage</span>
          <span style={{ color: '#9ca3af' }}>
            {storage.usedGB.toFixed(2)} GB / {storage.totalGB} GB · <span style={{ fontWeight: 700, color: barColor }}>{storage.usedPercent}%</span>
          </span>
        </div>
        <div style={{ width: '100%', height: 3, background: '#e5e7eb', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${storage.usedPercent}%`, height: '100%', background: barColor, transition: 'all 0.3s ease' }} />
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginBottom: 3 }}>
          <span style={{ fontWeight: 600, color: '#6b7280' }}>🗄️ Database</span>
          <span style={{ color: '#9ca3af' }}>
            {storage.dbUsedMB != null ? (
              <>{storage.dbUsedMB.toFixed(1)} MB / {storage.dbTotalMB} MB · <span style={{ fontWeight: 700, color: dbBarColor }}>{storage.dbUsedPercent}%</span></>
            ) : '—'}
          </span>
        </div>
        <div style={{ width: '100%', height: 3, background: '#e5e7eb', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${storage.dbUsedPercent || 0}%`, height: '100%', background: dbBarColor, transition: 'all 0.3s ease' }} />
        </div>
      </div>
    </div>
  )
}
