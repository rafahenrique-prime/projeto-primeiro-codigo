import { useState, useEffect } from 'react'
import { useTheme } from './theme.jsx'
import LeftNav from './components/LeftNav'
import InboxList from './components/InboxList'
import ChatArea from './components/ChatArea'
import RightPanel from './components/RightPanel'
import ChannelsPage from './pages/ChannelsPage'
import DealOncaPage from './pages/DealOncaPage'
import DashboardPage from './pages/DashboardPage'
import AgentsPage from './pages/AgentsPage'
import KnowledgePage from './pages/KnowledgePage'
import ContactsPage from './pages/ContactsPage'
import { listChats } from './services/gptmaker'

const AVATAR_COLORS = ['#6366f1','#EC4899','#F59E0B','#10B981','#3B82F6','#8B5CF6','#EF4444','#14B8A6']
function colorFor(str) { let h=0; for(const c of (str||'')) h=(h*31+c.charCodeAt(0))&0xffff; return AVATAR_COLORS[h % AVATAR_COLORS.length] }
function initialsFor(name) { return (name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() }
function fmtTime(ts) { if(!ts) return ''; const d=new Date(ts); return d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) }

function normalizeChat(c) {
  return {
    ...c,
    color: colorFor(c.name),
    initials: initialsFor(c.name),
    lastMsg: c.conversation || '',
    channelLabel: c.type === 'INSTAGRAM' ? 'Instagram' : c.type === 'Z_API' ? 'WhatsApp' : c.type || '',
    channelSub: c.username || c.whatsappPhone || '',
    channel: c.type === 'INSTAGRAM' ? 'instagram' : 'whatsapp',
    time: fmtTime(c.time),
    unread: c.unReadCount || 0,
    objective_progress: 0,
    mode: c.humanTalk ? 'copilot' : 'autopilot',
    messages: [],
    tags: [],
    orders: [],
    tasks: [],
    phone: c.whatsappPhone || '',
    email: '',
    city: '',
    since: '',
    objective: '',
    aiSummary: '',
  }
}

export default function App() {
  const { theme: t } = useTheme()
  const [page, setPage] = useState('inbox')
  const [conversations, setConversations] = useState([])
  const [activeConv, setActiveConv] = useState(null)
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadChats() }, [])

  async function loadChats() {
    setLoading(true)
    try {
      const raw = await listChats()
      const normalized = raw.map(normalizeChat)
      setConversations(normalized)
      if (normalized.length > 0) setActiveConv(normalized[0])
    } catch (e) {
      console.error('Erro ao carregar chats:', e)
    } finally {
      setLoading(false)
    }
  }

  function selectConv(conv) {
    setActiveConv(conv)
    if (conv.unread > 0) {
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread: 0 } : c))
    }
  }

  const filtered = conversations.filter(c => {
    if (filter === 'unread') return c.unread > 0
    if (filter === 'wa') return c.channel === 'whatsapp'
    if (filter === 'ig') return c.channel === 'instagram'
    return true
  })

  return (
    <div style={{ display: 'flex', height: '100vh', background: t.appBg, overflow: 'hidden' }}>
      <LeftNav page={page} setPage={setPage} unreadCount={conversations.reduce((sum, c) => sum + (c.unread || 0), 0)} />
      <div style={{ flex: 1, display: 'flex', gap: 10, padding: '10px 12px', overflow: 'hidden' }}>
        {page === 'inbox' && (
          loading ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.bg, borderRadius: 8 }}>
              <div style={{ fontSize: 14, color: t.textMuted }}>Carregando conversas...</div>
            </div>
          ) : <>
            <InboxList conversations={filtered} active={activeConv} onSelect={selectConv} filter={filter} setFilter={setFilter} />
            {activeConv && <ChatArea conv={activeConv} onConvUpdate={c => setActiveConv(c)} />}
            {activeConv && <RightPanel conv={activeConv} onConvUpdate={c => setActiveConv(c)} />}
          </>
        )}
        {page === 'channels' && <ChannelsPage />}
        {page === 'dealonca' && <DealOncaPage conversations={conversations} />}
        {page === 'contacts' && <ContactsPage />}
        {page === 'reports'  && <DashboardPage conversations={conversations} />}
        {page === 'agents'   && <AgentsPage />}
        {page === 'knowledge'&& <KnowledgePage />}
        {page === 'settings' && <PlaceholderPage icon="⚙️" title="Configurações" />}
      </div>
    </div>
  )
}

function PlaceholderPage({ icon, title }) {
  const { theme: t } = useTheme()
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: t.bg, borderRadius: 8 }}>
      <div style={{ fontSize: 48 }}>{icon}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: t.textSecondary }}>{title}</div>
      <div style={{ fontSize: 13, color: t.textMuted }}>Em breve...</div>
    </div>
  )
}
