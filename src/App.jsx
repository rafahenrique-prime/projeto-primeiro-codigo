import { useState, useEffect, useRef, useCallback } from 'react'
import { useTheme } from './theme.jsx'
import LeftNav from './components/LeftNav'
import InboxList from './components/InboxList'
import ChatArea from './components/ChatArea'
import RightPanel from './components/RightPanel'
import PhotoHistoryPanel from './components/PhotoHistoryPanel'
import ChannelsPage from './pages/ChannelsPage'
import DealOncaPage from './pages/DealOncaPage'
import DashboardPage from './pages/DashboardPage'
import DashboardNewPage from './pages/DashboardNewPage'
import RelatoriosPage from './pages/RelatoriosPage'
import AgentsPage from './pages/AgentsPage'
import KnowledgePage from './pages/KnowledgePage'
import ContactsPage from './pages/ContactsPage'
import SimuladorClientePage from './pages/SimuladorClientePage'
import CatalogPage from './pages/CatalogPage'
import ImportCatalogPage from './pages/ImportCatalogPage'
import ExtractorPage from './pages/ExtractorPage'
import ImportReviewPage from './pages/ImportReviewPage'
import PhotoRecognitionPage from './pages/PhotoRecognitionPage'
import AgentLabPage from './pages/AgentLabPage'
import FollowUpPage from './pages/FollowUpPage'
import ImageExtractorPage from './pages/ImageExtractorPage'
import { listChats, assumeChat, releaseChat } from './services/gptmaker'
import { runFollowUpCheck } from './services/followUpService'
import { syncCatalogFromSupabase } from './services/catalog'
import { getAllProfiles } from './services/customerProfileService'

const AVATAR_COLORS = ['#6366f1','#EC4899','#F59E0B','#10B981','#3B82F6','#8B5CF6','#EF4444','#14B8A6']
function colorFor(str) { let h=0; for(const c of (str||'')) h=(h*31+c.charCodeAt(0))&0xffff; return AVATAR_COLORS[h % AVATAR_COLORS.length] }
function initialsFor(name) { return (name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() }
function fmtTime(ts) { if(!ts) return ''; const d=new Date(ts); return d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) }

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.08, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.35)
  } catch {}
}

function showNotification(name, msg) {
  if (Notification.permission === 'granted') {
    new Notification(`Nova mensagem de ${name}`, {
      body: msg || 'Nova mensagem',
      icon: '/favicon.ico',
      silent: true,
    })
  }
}

function normalizeChat(c) {
  return {
    ...c,
    color: colorFor(c.name),
    initials: initialsFor(c.name),
    lastMsg: c.conversation || '',
    channelLabel: c.type === 'INSTAGRAM' ? 'Instagram' : c.type === 'Z_API' ? 'WhatsApp' : c.type || '',
    channelSub: c.username || c.whatsappPhone || '',
    igChannelId: c.channelId || '',
    channel: c.type === 'INSTAGRAM' ? 'instagram' : 'whatsapp',
    time: fmtTime(c.time),
    rawTime: c.time || null,
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
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showPhotoHistory, setShowPhotoHistory] = useState(false)
  const [botSleep, setBotSleep] = useState(() => localStorage.getItem('bot_sleep') === 'true')
  const [sleepLoading, setSleepLoading] = useState(false)
  const [profilesMap, setProfilesMap] = useState({})
  const chatRef = useRef(null)
  const convsRef = useRef([])
  const initialLoadDone = useRef(false)
  const manuallyReadRef = useRef(new Set())

  useEffect(() => {
    Notification.requestPermission()
    loadChats(true)
    syncCatalogFromSupabase().catch(() => {})
  }, [])

  // Auto-refresh a cada 30s
  useEffect(() => {
    const timer = setInterval(() => loadChats(false), 30000)
    return () => clearInterval(timer)
  }, [])

  // Motor de follow-up — verifica a cada 60s
  useEffect(() => {
    const check = () => {
      if (convsRef.current.length > 0) {
        runFollowUpCheck(convsRef.current).catch(() => {})
      }
    }
    const timer = setInterval(check, 60000)
    return () => clearInterval(timer)
  }, [])

  // Score dinâmico + tags — recarrega perfis pra priorizar a fila do Inbox
  useEffect(() => {
    const loadProfiles = () => {
      getAllProfiles().then(list => {
        const map = {}
        for (const p of list) map[p.conv_id] = p
        setProfilesMap(map)
      }).catch(() => {})
    }
    loadProfiles()
    const timer = setInterval(loadProfiles, 60000)
    return () => clearInterval(timer)
  }, [])

  async function loadChats(isFirst = false) {
    if (isFirst) setLoading(true)
    try {
      const raw = await listChats()
      const normalized = raw.map(normalizeChat)

      if (!isFirst && initialLoadDone.current) {
        // Detecta novas mensagens comparando com estado anterior
        const prev = convsRef.current
        for (const conv of normalized) {
          const old = prev.find(c => c.id === conv.id)
          if (old && conv.unread > old.unread) {
            playBeep()
            showNotification(conv.name, conv.lastMsg)
            break
          }
          if (!old && conv.unread > 0) {
            playBeep()
            showNotification(conv.name, conv.lastMsg)
            break
          }
        }
      }

      // Remove do set quando API confirma unread=0 (plataforma registrou como lido)
      for (const c of normalized) {
        if (manuallyReadRef.current.has(c.id) && c.unread === 0) {
          manuallyReadRef.current.delete(c.id)
        }
      }
      // Usa dados da API direto, exceto conversas que o usuário clicou explicitamente
      setConversations(normalized.map(c =>
        manuallyReadRef.current.has(c.id) ? { ...c, unread: 0 } : c
      ))

      convsRef.current = normalized
      initialLoadDone.current = true
      if (isFirst && normalized.length > 0) setActiveConv(normalized[0])
    } catch (e) {
      console.error('Erro ao carregar chats:', e)
    } finally {
      if (isFirst) setLoading(false)
    }
  }

  function selectConv(conv) {
    setActiveConv(conv)
    if (conv.unread > 0) {
      manuallyReadRef.current.add(conv.id)
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread: 0 } : c))
    }
  }

  async function toggleBotSleep() {
    if (sleepLoading) return
    const next = !botSleep
    setSleepLoading(true)
    try {
      const targets = conversations.filter(c => next ? c.mode !== 'copilot' : c.mode === 'copilot')
      await Promise.allSettled(targets.map(c => next ? assumeChat(c.id) : releaseChat(c.id)))
      setBotSleep(next)
      localStorage.setItem('bot_sleep', String(next))
      setConversations(prev => prev.map(c => ({ ...c, mode: next ? 'copilot' : 'autopilot' })))
    } catch (e) {
      console.error('Erro ao alterar modo do bot:', e)
    } finally {
      setSleepLoading(false)
    }
  }

  const fillChatInput = useCallback((text) => {
    chatRef.current?.fill(text)
  }, [])

  // Fila priorizada: pedido de humano > score alto > esfriando com intenção > resto
  function conversationPriority(c) {
    const profile = profilesMap[c.id]
    const score = profile?.buy_score ?? 0
    const needsHuman = c.mode === 'copilot' && c.unread > 0
    if (needsHuman) return 0
    if (score >= 70) return 1
    const inactiveMin = c.rawTime ? Math.floor((Date.now() - new Date(c.rawTime).getTime()) / 60000) : 0
    if (score >= 30 && inactiveMin > 30) return 2
    if (score >= 30) return 3
    return 4
  }

  const filtered = conversations.filter(c => {
    if (filter === 'unread') return c.unread > 0
    if (filter === 'meus') return c.mode === 'copilot'
    if (filter === 'autoia') return c.mode !== 'copilot'
    if (filter === 'wa') return c.channel === 'whatsapp'
    if (filter === 'ig') return c.channel === 'instagram'
    if (filter === 'human') return c.mode === 'copilot' && c.unread > 0
    if (filter.startsWith('ig:')) return c.channel === 'instagram' && (c.igChannelId || c.channelId) === filter.slice(3)
    return true
  }).filter(c => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return c.name?.toLowerCase().includes(q) || c.lastMsg?.toLowerCase().includes(q)
  }).sort((a, b) => {
    const diff = conversationPriority(a) - conversationPriority(b)
    if (diff !== 0) return diff
    const scoreA = profilesMap[a.id]?.buy_score ?? 0
    const scoreB = profilesMap[b.id]?.buy_score ?? 0
    return scoreB - scoreA
  })

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread || 0), 0)
  const humanWaiting = conversations.filter(c => c.mode === 'copilot' && c.unread > 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: t.appBg, overflow: 'hidden' }}>
      {/* Ticker bar */}
      <div style={{
        background: '#E8192C', color: '#fff', fontSize: 11, fontWeight: 600,
        fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.8px',
        padding: '4px 16px', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0,
        textTransform: 'uppercase',
      }}>
        <span>/// Sistema online · CODEX ativo</span>
        <span style={{ opacity: 0.5 }}>///</span>
        <span>{conversations.length} conversas abertas</span>
        {totalUnread > 0 && <><span style={{ opacity: 0.5 }}>///</span><span>{totalUnread} não lidas</span></>}
        {humanWaiting.length > 0 && (
          <>
            <span style={{ opacity: 0.5 }}>///</span>
            <HumanAlert names={humanWaiting.map(c => c.name)} />
          </>
        )}
      </div>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <LeftNav page={page} setPage={setPage} unreadCount={totalUnread} />
        <div style={{ flex: 1, display: 'flex', gap: 10, padding: '10px 12px', overflow: 'hidden' }}>
          {page === 'inbox' && (
            loading ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.bg, borderRadius: 8 }}>
                <div style={{ fontSize: 14, color: t.textMuted }}>Carregando conversas...</div>
              </div>
            ) : <>
              <InboxList conversations={filtered} allConversations={conversations} active={activeConv} onSelect={selectConv}
                filter={filter} setFilter={setFilter} search={search} setSearch={setSearch}
                botSleep={botSleep} sleepLoading={sleepLoading} onToggleSleep={toggleBotSleep} profilesMap={profilesMap} />
              {activeConv && <ChatArea ref={chatRef} conv={activeConv} onConvUpdate={c => {
                setActiveConv(c)
                setConversations(prev => prev.map(p => p.id === c.id ? { ...p, mode: c.mode } : p))
              }} />}
              {activeConv && <RightPanel conv={activeConv} onConvUpdate={c => {
                setActiveConv(c)
                setConversations(prev => prev.map(p => p.id === c.id ? { ...p, mode: c.mode } : p))
              }} onFillInput={fillChatInput} />}
            </>
          )}
          {page === 'channels' && <ChannelsPage />}
          {page === 'dealonca' && <DealOncaPage conversations={conversations} setPage={setPage} />}
          {page === 'contacts' && <ContactsPage conversations={conversations} setPage={setPage} activeConv={activeConv} setActiveConv={setActiveConv} />}
          {page === 'dashboard' && <DashboardNewPage conversations={conversations} />}
          {page === 'reports'    && <DashboardPage conversations={conversations} />}
          {page === 'relatorios' && <RelatoriosPage />}
          {page === 'agents'   && <AgentsPage />}
          {page === 'knowledge'&& <KnowledgePage />}
          {page === 'simulador' && <SimuladorClientePage />}
          {page === 'catalogo' && <CatalogPage onNavigate={setPage} />}
          {page === 'importar' && <ImportCatalogPage />}
          {page === 'importar-backup' && <ImportReviewPage />}
          {page === 'photo' && <PhotoRecognitionPage />}
          {page === 'extrator' && <ExtractorPage />}
          {page === 'image-extractor' && <ImageExtractorPage />}
          {page === 'lab'     && <AgentLabPage />}
          {page === 'followup' && <FollowUpPage conversations={conversations} />}
          {page === 'settings' && <PlaceholderPage icon="⚙️" title="Configurações" />}
        </div>

        {/* Botão flutuante Histórico de Fotos */}
        <button
          onClick={() => setShowPhotoHistory(true)}
          title="Histórico de Fotos"
          style={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: '#0EC331',
            border: 'none',
            color: '#fff',
            fontSize: 24,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            transition: 'transform 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          📸
        </button>

        {/* Painel de Histórico */}
        <PhotoHistoryPanel isOpen={showPhotoHistory} onClose={() => setShowPhotoHistory(false)} theme={t} />
      </div>
    </div>
  )
}

function HumanAlert({ names }) {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const iv = setInterval(() => setVisible(v => !v), 600)
    return () => clearInterval(iv)
  }, [])
  const label = names.length === 1
    ? `⚠ ${names[0]} aguardando humano`
    : `⚠ ${names.length} clientes aguardando humano`
  return (
    <span style={{
      background: 'rgba(255,255,255,0.22)',
      borderRadius: 4,
      padding: '2px 10px',
      fontWeight: 800,
      letterSpacing: '1px',
      opacity: visible ? 1 : 0.2,
      transition: 'opacity 0.15s',
    }}>
      {label}
    </span>
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
