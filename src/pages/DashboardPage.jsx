import { useState, useMemo } from 'react'

export default function DashboardPage({ conversations = [] }) {
  const [tab, setTab] = useState('geral')

  const metrics = useMemo(() => computeMetrics(conversations), [conversations])

  return (
    <div style={{ flex: 1, background: '#F3F4F6', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #EBEBEB', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 8, height: 56, flexShrink: 0, borderRadius: '12px 12px 0 0' }}>
        <TabBtn active={tab === 'geral'} onClick={() => setTab('geral')}>Visão Geral</TabBtn>
        <TabBtn active={tab === 'canais'} onClick={() => setTab('canais')}>Canais</TabBtn>
        <TabBtn active={tab === 'clientes'} onClick={() => setTab('clientes')}>Clientes</TabBtn>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '4px 10px' }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#0EC331' }} />
          <span style={{ fontSize: 11, color: '#0EC331', fontWeight: 600 }}>Dados reais · {conversations.length} conversas</span>
        </div>
      </div>

      <div style={{ fontSize: 12, color: '#9CA3AF', padding: '10px 24px 0' }}>
        Calculado em tempo real a partir das suas conversas do GPT Maker
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 24px 24px' }}>
        {conversations.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#9CA3AF', fontSize: 14 }}>
            Carregando conversas...
          </div>
        ) : tab === 'geral' ? (
          <VisaoGeral metrics={metrics} />
        ) : tab === 'canais' ? (
          <Canais metrics={metrics} />
        ) : (
          <Clientes metrics={metrics} />
        )}
      </div>
    </div>
  )
}

function computeMetrics(conversations) {
  const total = conversations.length
  const naoLidas = conversations.filter(c => c.unread > 0).length
  const totalNaoLidas = conversations.reduce((s, c) => s + (c.unread || 0), 0)
  const autopilot = conversations.filter(c => c.mode === 'autopilot').length
  const copilot = conversations.filter(c => c.mode === 'copilot').length
  const whatsapp = conversations.filter(c => c.channel === 'whatsapp').length
  const instagram = conversations.filter(c => c.channel === 'instagram').length

  // Distribuição por hora
  const porHora = Array(24).fill(0)
  conversations.forEach(c => {
    if (c.time) {
      const h = parseInt(c.time.split(':')[0])
      if (!isNaN(h)) porHora[h]++
    }
  })

  // Top clientes com mais não lidas
  const topNaoLidas = [...conversations]
    .filter(c => c.unread > 0)
    .sort((a, b) => b.unread - a.unread)
    .slice(0, 8)

  // Canais mais ativos (por channelLabel)
  const porCanal = {}
  conversations.forEach(c => {
    const label = c.channelLabel || 'Outro'
    porCanal[label] = (porCanal[label] || 0) + 1
  })
  const canais = Object.entries(porCanal)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count }))

  // Última mensagem mais recente de cada conversa — clientes ativos hoje
  const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const ativosHoje = conversations.filter(c => c.time && !c.time.includes('/')).length // horário sem data = hoje

  // Estágios do funil (usa fullMessages se disponível)
  const funil = { QUENTE_FECHAR: 0, DECISAO_OBJECAO: 0, CONSIDERACAO: 0, CURIOSIDADE: 0, INDEFINIDO: 0 }
  conversations.forEach(c => {
    const msgs = c.fullMessages || []
    const text = (msgs.map(m => m.text || m.content || '').join(' ') + ' ' + (c.lastMsg || '')).toLowerCase()
    if (/manda o link|como fa[cç]o o pedido|quero comprar|vou levar|fecha|finalizar|confirma/.test(text)) funil.QUENTE_FECHAR++
    else if (/aceita pix|quanto fica o frete|tem parcel|desconto|[cç]upom|mais barato|caro/.test(text)) funil.DECISAO_OBJECAO++
    else if (/tem tamanho|tem em estoque|tem na cor|disponivel|chega quando|prazo/.test(text)) funil.CONSIDERACAO++
    else if (/quanto custa|qual o pre[cç]o|valor|me mostra|tem o modelo/.test(text)) funil.CURIOSIDADE++
    else funil.INDEFINIDO++
  })

  return { total, naoLidas, totalNaoLidas, autopilot, copilot, whatsapp, instagram, porHora, topNaoLidas, canais, ativosHoje, funil }
}

function VisaoGeral({ metrics }) {
  const { total, naoLidas, totalNaoLidas, autopilot, copilot, whatsapp, instagram, ativosHoje, funil, porHora } = metrics

  const cards = [
    { icon: '💬', title: 'Total de Conversas', value: total, sub: 'Ativas no sistema', color: '#0EC331' },
    { icon: '🔔', title: 'Não Lidas', value: totalNaoLidas, sub: `${naoLidas} contatos aguardando`, color: '#F59E0B' },
    { icon: '🤖', title: 'AutoPilot', value: autopilot, sub: `${copilot} em Copilot`, color: '#6366F1' },
    { icon: '🔥', title: 'Quentes pra Fechar', value: funil.QUENTE_FECHAR, sub: 'Prontos para comprar', color: '#EF4444' },
  ]

  const funilItems = [
    { label: 'Quente pra Fechar', value: funil.QUENTE_FECHAR, color: '#EF4444' },
    { label: 'Decisão / Objeção', value: funil.DECISAO_OBJECAO, color: '#F59E0B' },
    { label: 'Consideração', value: funil.CONSIDERACAO, color: '#6366F1' },
    { label: 'Curiosidade', value: funil.CURIOSIDADE, color: '#3B82F6' },
    { label: 'Sem dados', value: funil.INDEFINIDO, color: '#D1D5DB' },
  ]

  const horasPico = porHora
    .map((count, h) => ({ hora: `${String(h).padStart(2,'0')}h`, count }))
    .filter(h => h.count > 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {cards.map(card => (
          <div key={card.title} style={{ background: '#fff', border: '1px solid #EBEBEB', borderRadius: 12, padding: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: card.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, marginBottom: 12 }}>{card.icon}</div>
            <div style={{ fontSize: 30, fontWeight: 700, color: '#0A0A0A', marginBottom: 4 }}>{card.value}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{card.title}</div>
            <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{card.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <ChartCard title="Funil de Vendas" sub="Estágio de cada conversa" icon="📊">
          <BarSimple items={funilItems} />
        </ChartCard>

        <ChartCard title="WhatsApp vs Instagram" sub="Distribuição por canal" icon="📱">
          <DonutSimple items={[
            { label: 'WhatsApp', value: whatsapp, color: '#25D366' },
            { label: 'Instagram', value: instagram, color: '#E1306C' },
          ]} />
        </ChartCard>
      </div>

      {horasPico.length > 0 && (
        <ChartCard title="Pico de Mensagens por Hora" sub="Quando seus clientes mais falam" icon="⏰">
          <BarChart items={horasPico} />
        </ChartCard>
      )}
    </div>
  )
}

function Canais({ metrics }) {
  const { canais, whatsapp, instagram } = metrics
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ChartCard title="Conversas por Canal" sub="Volume total em cada canal conectado" icon="📡">
        <BarSimple items={canais.map((c, i) => ({ label: c.label, value: c.count, color: ['#0EC331','#E1306C','#6366F1','#F59E0B'][i % 4] }))} />
      </ChartCard>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <StatBox title="WhatsApp" value={whatsapp} icon="💬" color="#25D366" sub="conversas ativas" />
        <StatBox title="Instagram" value={instagram} icon="📸" color="#E1306C" sub="conversas ativas" />
      </div>
    </div>
  )
}

function Clientes({ metrics }) {
  const { topNaoLidas, funil } = metrics
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {topNaoLidas.length > 0 && (
        <ChartCard title="Clientes Aguardando Resposta" sub="Ordenado por mensagens não lidas" icon="🚨">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topNaoLidas.map((c, i) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < topNaoLidas.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                  {c.initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.lastMsg}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                  <span style={{ background: '#FEF3C7', color: '#D97706', fontSize: 11, fontWeight: 700, borderRadius: 9999, padding: '2px 8px' }}>{c.unread} não lidas</span>
                  <span style={{ fontSize: 10, color: '#9CA3AF' }}>{c.channelLabel}</span>
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      )}

      <ChartCard title="Estágio do Funil" sub="Baseado no conteúdo das conversas" icon="🎯">
        <BarSimple items={[
          { label: '🔥 Quente pra Fechar', value: funil.QUENTE_FECHAR, color: '#EF4444' },
          { label: '💸 Decisão / Objeção', value: funil.DECISAO_OBJECAO, color: '#F59E0B' },
          { label: '🔍 Consideração', value: funil.CONSIDERACAO, color: '#6366F1' },
          { label: '👀 Curiosidade', value: funil.CURIOSIDADE, color: '#3B82F6' },
        ]} />
      </ChartCard>
    </div>
  )
}

// ─── Componentes visuais ──────────────────────────────────────────────────────

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
      fontSize: 13, fontWeight: active ? 700 : 400,
      background: active ? '#0EC331' : 'transparent',
      color: active ? '#fff' : '#6B7280',
    }}>{children}</button>
  )
}

function ChartCard({ title, sub, icon, children }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #EBEBEB', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 34, height: 34, borderRadius: 8, background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{icon}</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A' }}>{title}</div>
          <div style={{ fontSize: 11, color: '#9CA3AF' }}>{sub}</div>
        </div>
      </div>
      {children}
    </div>
  )
}

function StatBox({ title, value, icon, color, sub }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #EBEBEB', borderRadius: 12, padding: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 48, height: 48, borderRadius: 12, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#0A0A0A' }}>{value}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{title}</div>
        <div style={{ fontSize: 11, color: '#9CA3AF' }}>{sub}</div>
      </div>
    </div>
  )
}

function BarSimple({ items }) {
  const max = Math.max(...items.map(i => i.value), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map(item => (
        <div key={item.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#374151', marginBottom: 4 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{item.label}</span>
            <span style={{ fontWeight: 700, color: item.color }}>{item.value}</span>
          </div>
          <div style={{ height: 7, background: '#F3F4F6', borderRadius: 9999 }}>
            <div style={{ height: 7, width: `${(item.value / max) * 100}%`, background: item.color, borderRadius: 9999, transition: 'width 0.4s' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function BarChart({ items }) {
  const max = Math.max(...items.map(i => i.count), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100, paddingBottom: 20, position: 'relative' }}>
      {items.map(item => (
        <div key={item.hora} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
          <div style={{ width: '100%', background: '#0EC331', borderRadius: '4px 4px 0 0', height: `${(item.count / max) * 80}%`, minHeight: 4, transition: 'height 0.3s' }} />
          <span style={{ fontSize: 9, color: '#9CA3AF', transform: 'rotate(-45deg)', transformOrigin: 'center', whiteSpace: 'nowrap' }}>{item.hora}</span>
        </div>
      ))}
    </div>
  )
}

function DonutSimple({ items }) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1
  const r = 30, cx = 50, cy = 50
  let offset = 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <svg viewBox="0 0 100 100" style={{ width: 90, height: 90, flexShrink: 0 }}>
        {items.map(item => {
          const pct = item.value / total
          const dash = pct * 2 * Math.PI * r
          const gap = (1 - pct) * 2 * Math.PI * r
          const rotate = offset * 360
          offset += pct
          return (
            <circle key={item.label} cx={cx} cy={cy} r={r} fill="none" stroke={item.color} strokeWidth={18}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={-rotate * Math.PI * r / 180 + 2 * Math.PI * r * 0.25}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          )
        })}
        <text x="50" y="47" textAnchor="middle" fontSize="13" fontWeight="700" fill="#0A0A0A">{total}</text>
        <text x="50" y="58" textAnchor="middle" fontSize="7" fill="#9CA3AF">total</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
            <span style={{ color: '#374151' }}>{item.label}</span>
            <span style={{ fontWeight: 700, color: item.color, marginLeft: 4 }}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
