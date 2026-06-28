import { useEffect, useState } from 'react'
import { listChannels } from '../services/gptmaker'

const typeConfig = {
  whatsapp:  { icon: '💬', label: 'WhatsApp', color: '#0EC331', bg: '#EFFDF4', border: '#B9F8CF' },
  instagram: { icon: '📸', label: 'Instagram', color: '#ec4899', bg: '#FDF2F8', border: '#F9A8D4' },
  telegram:  { icon: '✈️',  label: 'Telegram',  color: '#2185FF', bg: '#EFF6FF', border: '#BFDBFE' },
  default:   { icon: '💬', label: 'Canal',     color: '#0EC331', bg: '#EFFDF4', border: '#B9F8CF' },
}

function getTypeConfig(apiType) {
  if (!apiType) return typeConfig.default
  const t = apiType.toLowerCase()
  if (t.includes('instagram')) return typeConfig.instagram
  if (t.includes('telegram')) return typeConfig.telegram
  return typeConfig.whatsapp
}

function formatPhoneNumber(phone) {
  if (!phone) return null
  const digits = String(phone).replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12) {
    const ddd = digits.slice(2, 4)
    const rest = digits.slice(4)
    const formatted = rest.length === 9
      ? `${rest.slice(0, 5)}-${rest.slice(5)}`
      : `${rest.slice(0, 4)}-${rest.slice(4)}`
    return `+55 ${ddd} ${formatted}`
  }
  return `+${digits}`
}

function mapChannelData(apiChannel) {
  const cfg = getTypeConfig(apiChannel.type)
  const t = (apiChannel.type || '').toLowerCase()
  const isWhatsapp = !t.includes('instagram') && !t.includes('telegram')

  let sub
  if (apiChannel.username) {
    sub = isWhatsapp ? formatPhoneNumber(apiChannel.username) : `@${apiChannel.username}`
  } else {
    sub = cfg.label
  }

  return {
    id: apiChannel.id,
    label: apiChannel.name || 'Canal',
    sub,
    cfg,
    connected: apiChannel.connected === true,
    agentName: apiChannel.agentName || null,
    agentPicture: apiChannel.agentPicture || null,
  }
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchChannels() {
      try {
        setLoading(true)
        const data = await listChannels()
        const mapped = data.map(mapChannelData)
        setChannels(mapped)
      } catch (err) {
        console.error('Erro ao buscar canais:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchChannels()
  }, [])

  if (loading) return (
    <div style={{ flex: 1, background: '#fff', borderRadius: 8, padding: 28 }}>
      <p>Carregando canais...</p>
    </div>
  )

  if (error) return (
    <div style={{ flex: 1, background: '#fff', borderRadius: 8, padding: 28 }}>
      <p style={{ color: '#e74c3c' }}>Erro: {error}</p>
    </div>
  )

  const connected = channels.filter(c => c.connected).length

  return (
    <div style={{ flex: 1, background: '#fff', borderRadius: 8, padding: 28, overflowY: 'auto' }}>
      <div style={{ maxWidth: 620 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0A0A0A', marginBottom: 4 }}>Canais Conectados</h1>
            <p style={{ fontSize: 13, color: '#82829B' }}>
              {connected} de {channels.length} {channels.length === 1 ? 'canal conectado' : 'canais conectados'}
            </p>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          {channels.map(ch => (
            <div key={ch.id} style={{ background: '#FAFAFA', border: `1px solid ${ch.connected ? '#E5E5E5' : '#F3F4F6'}`, borderRadius: 12, padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: ch.connected ? 1 : 0.7 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 46, height: 46, borderRadius: 12, background: ch.cfg.bg, border: `1.5px solid ${ch.cfg.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{ch.cfg.icon}</div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#0A0A0A' }}>{ch.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 500, color: ch.cfg.color, background: ch.cfg.bg, border: `1px solid ${ch.cfg.border}`, borderRadius: 6, padding: '1px 7px' }}>{ch.cfg.label}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#6B7280', marginTop: 3 }}>{ch.sub}</div>
                  {ch.agentName && (
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                      Agente: <span style={{ color: '#6B7280', fontWeight: 500 }}>{ch.agentName}</span>
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: ch.connected ? '#0EC331' : '#9CA3AF', display: 'inline-block' }} />
                  <span style={{ color: ch.connected ? '#0EC331' : '#9CA3AF', fontWeight: 500 }}>{ch.connected ? 'Conectado' : 'Desconectado'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        {channels.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#9CA3AF', fontSize: 14 }}>
            Nenhum canal encontrado
          </div>
        )}
      </div>
    </div>
  )
}
