import { channels } from '../data/mockData'

const typeConfig = {
  whatsapp_app:  { icon: '💬', color: '#0EC331', bg: '#EFFDF4', border: '#B9F8CF', label: 'WhatsApp API Oficial' },
  whatsapp_waba: { icon: '💬', color: '#04BE23', bg: '#EFFDF4', border: '#B9F8CF', label: 'WhatsApp QR Code' },
  instagram_dm:  { icon: '📸', color: '#ec4899', bg: '#FDF2F8', border: '#F9A8D4', label: 'Instagram DM' },
}

export default function ChannelsPage() {
  return (
    <div style={{ flex: 1, background: '#fff', borderRadius: 8, padding: 28, overflowY: 'auto' }}>
      <div style={{ maxWidth: 600 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0A0A0A', marginBottom: 4 }}>Canais Conectados</h1>
        <p style={{ fontSize: 13, color: '#82829B', marginBottom: 24 }}>Gerencie suas contas de WhatsApp e Instagram</p>
        <div style={{ display: 'grid', gap: 12 }}>
          {channels.map(ch => {
            const cfg = typeConfig[ch.type] || typeConfig.whatsapp_app
            return (
              <div key={ch.id} style={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: cfg.bg, border: `1px solid ${cfg.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{cfg.icon}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#0A0A0A' }}>{ch.label}</div>
                    <div style={{ fontSize: 12, color: '#82829B', marginTop: 2 }}>{ch.sub}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#0EC331', display: 'inline-block' }} />
                    <span style={{ color: '#0EC331', fontWeight: 500 }}>Conectado</span>
                  </div>
                  <button style={{ background: '#F7F7F7', border: '1px solid #E5E5E5', borderRadius: 8, padding: '5px 12px', fontSize: 12, color: '#4B5563' }}>Gerenciar</button>
                </div>
              </div>
            )
          })}
        </div>
        <button style={{ width: '100%', marginTop: 16, background: '#fff', border: '1px dashed #E5E5E5', borderRadius: 12, padding: '14px 18px', fontSize: 13, color: '#82829B', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          + Adicionar novo canal
        </button>
      </div>
    </div>
  )
}
