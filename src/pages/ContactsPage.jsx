import { useState } from 'react'
import { conversations } from '../data/mockData'

const contacts = conversations.map((c, i) => ({
  id: c.id,
  name: c.name,
  initials: c.initials,
  color: c.color,
  phone: c.phone || '+55 11 9' + (9000 + i * 1234).toString().substring(0, 4) + '-' + (1000 + i * 567).toString().substring(0, 4),
  city: c.city || ['São Paulo, SP', 'Rio de Janeiro, RJ', 'Belo Horizonte, MG', 'Curitiba, PR', 'Porto Alegre, RS', 'Campinas, SP'][i % 6],
  orders: c.orders || Math.floor(Math.random() * 5) + 1,
  totalSpent: [1290, 450, 870, 220, 3100, 680][i % 6],
  channel: c.channelLabel,
  tags: c.tags || [],
  lastSeen: c.time,
  aiSummary: c.aiSummary,
  messages: c.messages,
  objective_progress: c.objective_progress,
}))

export default function ContactsPage() {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(contacts[0])
  const [tab, setTab] = useState('info')

  const filtered = contacts.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search)
  )

  return (
    <div style={{ flex: 1, display: 'flex', gap: 12, overflow: 'hidden' }}>

      {/* Lista de contatos */}
      <div style={{ width: 280, background: '#fff', borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid #E5E5E5' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0A0A0A', marginBottom: 10 }}>Contatos <span style={{ fontSize: 12, fontWeight: 400, color: '#82829B' }}>({contacts.length})</span></div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome ou telefone..." style={{ width: '100%', border: '1px solid #E5E5E5', borderRadius: 8, padding: '7px 10px', fontSize: 13, color: '#0A0A0A', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.map(contact => (
            <div key={contact.id} onClick={() => setSelected(contact)}
              style={{ padding: '10px 14px', borderBottom: '1px solid #E5E5E5', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center', background: selected?.id === contact.id ? '#F7F7F7' : '#fff' }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: contact.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{contact.initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A', marginBottom: 2 }}>{contact.name}</div>
                <div style={{ fontSize: 11, color: '#82829B' }}>{contact.phone} · {contact.city?.split(',')[0]}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#0EC331' }}>R${contact.totalSpent.toLocaleString('pt-BR')}</div>
                <div style={{ fontSize: 10, color: '#82829B' }}>{contact.orders} pedido{contact.orders !== 1 ? 's' : ''}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detalhe do contato */}
      {selected && (
        <div style={{ flex: 1, background: '#fff', borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E5E5', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: selected.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: '#fff' }}>{selected.initials}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#0A0A0A' }}>{selected.name}</div>
              <div style={{ fontSize: 12, color: '#82829B', marginTop: 2 }}>{selected.phone} · {selected.city}</div>
              <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
                {selected.tags.map(t => (
                  <span key={t.label} style={{ background: t.color + '22', color: t.color, borderRadius: 9999, padding: '2px 8px', fontSize: 11, fontWeight: 500 }}>{t.label}</span>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ background: '#EFFDF4', border: '1px solid #B9F8CF', borderRadius: 8, padding: '6px 12px', fontSize: 12, color: '#0EC331', fontWeight: 600, cursor: 'pointer' }}>💬 Conversar</button>
            </div>
          </div>

          {/* Stats rápidos */}
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #E5E5E5', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {[['💰', 'Gasto Total', 'R$' + selected.totalSpent.toLocaleString('pt-BR')], ['🛍️', 'Pedidos', selected.orders], ['📊', 'Progresso', selected.objective_progress + '%'], ['📱', 'Canal', selected.channel]].map(([ic, label, val]) => (
              <div key={label} style={{ background: '#F7F7F7', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 18 }}>{ic}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0A0A0A', margin: '3px 0 2px' }}>{val}</div>
                <div style={{ fontSize: 10, color: '#82829B' }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ padding: '0 20px', borderBottom: '1px solid #E5E5E5', display: 'flex', gap: 0 }}>
            {[['info', '📋 Informações'], ['history', '💬 Histórico'], ['summary', '🤖 IA']].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)}
                style={{ border: 'none', borderBottom: tab === id ? '2px solid #0EC331' : '2px solid transparent', background: 'none', padding: '10px 14px', fontSize: 13, fontWeight: tab === id ? 600 : 400, color: tab === id ? '#0EC331' : '#82829B', cursor: 'pointer' }}>
                {label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
            {tab === 'info' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[['Nome completo', selected.name], ['Telefone / WhatsApp', selected.phone], ['Cidade', selected.city], ['Canal principal', selected.channel], ['Último contato', selected.lastSeen]].map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#82829B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
                    <div style={{ fontSize: 13, color: '#141413' }}>{val}</div>
                  </div>
                ))}
              </div>
            )}
            {tab === 'history' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selected.messages.map((msg, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: msg.role === 'user' ? 'row' : 'row-reverse', gap: 8, alignItems: 'flex-end' }}>
                    <div style={{ maxWidth: '75%', background: msg.role === 'user' ? '#fff' : '#D8FDD2', border: '1px solid #E5E5E5', borderRadius: msg.role === 'user' ? '16px 16px 16px 2px' : '16px 16px 2px 16px', padding: '8px 12px', fontSize: 13, color: '#141413', lineHeight: 1.5 }}>
                      {msg.content}
                      {msg.time && <div style={{ fontSize: 10, color: '#82829B', marginTop: 4, textAlign: 'right' }}>{msg.time}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {tab === 'summary' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: '#EFFDF4', border: '1px solid #B9F8CF', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#0EC331', marginBottom: 6 }}>🤖 Resumo IA</div>
                  <div style={{ fontSize: 13, color: '#141413', lineHeight: 1.7 }}>{selected.aiSummary}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#82829B', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Progresso do Objetivo</div>
                  <div style={{ background: '#F7F7F7', borderRadius: 9999, height: 8, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: selected.objective_progress + '%', background: 'linear-gradient(90deg, #D863E1 0%, #FFB25B 100%)', borderRadius: 9999 }} />
                  </div>
                  <div style={{ fontSize: 12, color: '#82829B', marginTop: 4, textAlign: 'right' }}>{selected.objective_progress}%</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
