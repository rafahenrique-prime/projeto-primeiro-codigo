import { useState, useEffect, useMemo } from 'react'
import { listContacts } from '../services/gptmaker'
import { useTheme } from '../theme.jsx'
import { getAllProfiles } from '../services/customerProfileService'

const AVATAR_COLORS = ['#6366f1','#EC4899','#F59E0B','#10B981','#3B82F6','#8B5CF6','#EF4444','#14B8A6']
function colorFor(str) { let h=0; for(const c of (str||'')) h=(h*31+c.charCodeAt(0))&0xffff; return AVATAR_COLORS[h%AVATAR_COLORS.length] }
function initialsFor(name) { return (name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() }
function daysAgo(dateStr) {
  if (!dateStr) return null
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

function normalizeContact(c) {
  const name = c.name || c.username || c.phone || 'Sem nome'
  const channelType = c.type === 'INSTAGRAM' ? 'instagram' : c.type === 'Z_API' ? 'whatsapp' : 'other'

  // Tenta múltiplas fontes de foto (hierarquia de prioridade)
  let picture = c.picture || c.avatar || c.profileImage || c.photo || c.image

  // Se ainda sem foto, tenta extrair de objetos aninhados
  if (!picture) {
    picture = c.igProfile?.profile_pic_url ||
              c.instagramProfile?.profile_pic_url ||
              c.profileData?.picture ||
              c.metadata?.picture ||
              null
  }

  // Se for contato do Instagram e tem username, tenta construir URL
  if (!picture && channelType === 'instagram' && c.username) {
    // Nota: Isso seria para futuro, caso tenhamos acesso à API Instagram
  }

  return {
    id: c.id,
    name,
    initials: initialsFor(name),
    color: colorFor(name),
    phone: c.phone || c.whatsappPhone || null,
    email: c.email || null,
    city: c.city || null,
    channel: channelType,
    channelLabel: channelType === 'instagram' ? 'Instagram' : channelType === 'whatsapp' ? 'WhatsApp' : c.type || '—',
    picture,
    createdAt: c.createdAt || null,
    createdAtLabel: c.createdAt ? new Date(c.createdAt).toLocaleDateString('pt-BR') : '—',
    daysOld: daysAgo(c.createdAt),
    tags: c.tags || [],
    raw: c,
  }
}

const PERIOD_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: '3d', label: 'Últimos 3 dias', days: 3 },
  { id: '7d', label: '7 dias', days: 7 },
  { id: '30d', label: '30 dias', days: 30 },
  { id: '90d', label: '3 meses', days: 90 },
]
const CHANNEL_FILTERS = [
  { id: 'all', label: 'Todos canais' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'instagram', label: 'Instagram' },
]

export default function ContactsPage() {
  const { theme: t } = useTheme()
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [tab, setTab] = useState('info')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [periodFilter, setPeriodFilter] = useState('all')
  const [channelFilter, setChannelFilter] = useState('all')
  const [hasEmailFilter, setHasEmailFilter] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [profiles, setProfiles] = useState({}) // conv_id → supabase profile

  useEffect(() => { load(1) }, [])

  async function syncContacts() {
    setSyncing(true)
    await load(1)
    setSyncing(false)
  }

  async function load(p) {
    if (p === 1) setLoading(true)
    else setLoadingMore(true)
    try {
      const [data, sbProfiles] = await Promise.all([
        listContacts(p, 50),
        p === 1 ? getAllProfiles().catch(() => []) : Promise.resolve([]),
      ])
      if (p === 1) {
        const profileMap = {}
        sbProfiles.forEach(pr => { profileMap[pr.conv_id] = pr })
        setProfiles(profileMap)
      }
      const normalized = data.map(normalizeContact)
      // Debug: verificar contatos sem foto e campos disponíveis
      const withoutPicture = normalized.filter(c => !c.picture)
      if (withoutPicture.length > 0) {
        const details = withoutPicture.map(c => {
          const raw = data.find(d => d.id === c.id)
          const hasAlternatives = {
            igProfile: !!raw.igProfile,
            instagramProfile: !!raw.instagramProfile,
            profileData: !!raw.profileData,
            metadata: !!raw.metadata,
          }
          return { name: c.name, id: c.id, channel: c.channel, alternatives: hasAlternatives }
        })
        console.log(`[Contatos] ${withoutPicture.length} de ${normalized.length} SEM FOTO:`, details)
      }
      if (p === 1) { setContacts(normalized); if (normalized.length > 0) setSelected(normalized[0]) }
      else setContacts(prev => [...prev, ...normalized])
      setHasMore(data.length === 50)
      setPage(p)
    } catch (e) { setError('Erro ao carregar contatos') }
    finally { setLoading(false); setLoadingMore(false) }
  }

  const filtered = useMemo(() => {
    const periodDays = PERIOD_FILTERS.find(f => f.id === periodFilter)?.days
    return contacts.filter(c => {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase()) &&
          !c.phone?.includes(search) && !c.email?.toLowerCase().includes(search.toLowerCase())) return false
      if (channelFilter !== 'all' && c.channel !== channelFilter) return false
      if (hasEmailFilter && !c.email) return false
      if (periodDays != null && (c.daysOld == null || c.daysOld > periodDays)) return false
      return true
    })
  }, [contacts, search, channelFilter, hasEmailFilter, periodFilter])

  if (loading) return <Centered t={t}><span style={{color:t.textMuted,fontSize:14}}>Carregando contatos...</span></Centered>
  if (error) return <Centered t={t}><span style={{color:'#EF4444',fontSize:14}}>{error}</span></Centered>

  return (
    <div style={{ flex:1, display:'flex', gap:14, overflow:'hidden', minHeight:0 }}>

      {/* ── COLUNA LISTA ── */}
      <div style={{ width:340, display:'flex', flexDirection:'column', gap:0, overflow:'hidden', background:t.bg, borderRadius:12, boxShadow:'0 1px 4px rgba(0,0,0,0.07)', flexShrink:0 }}>

        {/* Topo busca */}
        <div style={{ padding:'14px 14px 10px', borderBottom:`1px solid ${t.border}` }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
            <div style={{ position:'relative', flex:1 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={t.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)' }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar contato..."
                style={{ width:'100%', background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:8, padding:'7px 28px 7px 28px', fontSize:12, color:t.text, outline:'none', boxSizing:'border-box' }}/>
              {search && <button onClick={()=>setSearch('')} style={{ position:'absolute', right:7, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:t.textMuted, fontSize:15, lineHeight:1 }}>×</button>}
            </div>
            {/* Botão sync */}
            <button onClick={syncContacts} title="Sincronizar contatos" style={{ width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center', background:t.bgSecondary, border:`1px solid ${t.border}`, borderRadius:8, cursor:'pointer', flexShrink:0, transition:'opacity 0.2s', opacity: syncing ? 0.5 : 1 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.textMid} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }}>
                <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
            </button>
            {/* Contagem */}
            <span style={{ fontSize:11, fontWeight:700, color:t.textMuted, flexShrink:0 }}>{filtered.length}</span>
          </div>

          {/* Filtros — linha única compacta */}
          <div style={{ display:'flex', gap:3, flexWrap:'wrap', alignItems:'center' }}>
            {PERIOD_FILTERS.map(f => (
              <MiniChip key={f.id} active={periodFilter===f.id} onClick={()=>setPeriodFilter(f.id)} t={t}>{f.label}</MiniChip>
            ))}
            <div style={{ width:1, height:14, background:t.border, margin:'0 3px' }}/>
            <MiniChip active={channelFilter==='whatsapp'} onClick={()=>setChannelFilter(v=>v==='whatsapp'?'all':'whatsapp')} t={t} color="#25D366">WA</MiniChip>
            <MiniChip active={channelFilter==='instagram'} onClick={()=>setChannelFilter(v=>v==='instagram'?'all':'instagram')} t={t} color="#E1306C">IG</MiniChip>
            <MiniChip active={hasEmailFilter} onClick={()=>setHasEmailFilter(v=>!v)} t={t}>✉</MiniChip>
          </div>
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>

        {/* Lista */}
        <div style={{ flex:1, overflowY:'auto' }}>
          {filtered.length === 0
            ? <div style={{ textAlign:'center', color:t.textMuted, fontSize:13, padding:'40px 20px' }}>Nenhum contato encontrado</div>
            : filtered.map(contact => (
              <ContactRow key={contact.id} contact={contact} isActive={selected?.id===contact.id}
                onClick={()=>{ setSelected(contact); setTab('info') }} t={t}/>
            ))
          }
          {hasMore && (
            <div style={{ padding:14, textAlign:'center' }}>
              <button onClick={()=>load(page+1)} disabled={loadingMore}
                style={{ background:t.bgTertiary, border:`1px solid ${t.border}`, borderRadius:9, padding:'7px 20px', fontSize:12, color:t.textMid, cursor:'pointer', fontWeight:600 }}>
                {loadingMore ? 'Carregando...' : 'Carregar mais'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── PAINEL DETALHE ── */}
      {selected ? (
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:t.bg, borderRadius:12, boxShadow:'0 1px 4px rgba(0,0,0,0.07)', minWidth:0 }}>

          {/* Header */}
          <div style={{ padding:'24px 28px 20px', borderBottom:`1px solid ${t.border}`, background: t.bgSecondary }}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:18 }}>
              <Avatar contact={selected} size={64} fontSize={22}/>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:20, fontWeight:800, color:t.text, marginBottom:4 }}>{selected.name}</div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
                  {selected.phone && <InfoTag icon="📱" value={selected.phone}/>}
                  {selected.email && <InfoTag icon="✉️" value={selected.email}/>}
                  {selected.city && <InfoTag icon="🏙️" value={selected.city.split(',')[0]}/>}
                </div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  <ChannelBadge channel={selected.channel} label={selected.channelLabel}/>
                  {selected.createdAt && (
                    <span style={{ fontSize:12, color:t.textMuted, background:t.bgTertiary, borderRadius:6, padding:'3px 10px' }}>
                      Desde {selected.createdAtLabel}
                    </span>
                  )}
                  {selected.tags.map((tag,i) => (
                    <span key={i} style={{ fontSize:11, background:'#F3F4F6', color:'#6B7280', borderRadius:9999, padding:'3px 10px', fontWeight:500 }}>{tag.label||tag}</span>
                  ))}
                </div>
              </div>
              <button style={{ background:'#0EC331', color:'#fff', border:'none', borderRadius:10, padding:'10px 18px', fontSize:13, fontWeight:700, cursor:'pointer', flexShrink:0 }}>
                💬 Conversar
              </button>
            </div>
          </div>

          {/* Stats cards */}
          <div style={{ padding:'16px 28px', borderBottom:`1px solid ${t.border}`, display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
            <StatCard icon="📱" label="Canal" value={selected.channelLabel} t={t}/>
            <StatCard icon="📅" label="Cadastrado" value={selected.createdAtLabel} t={t}/>
            <StatCard icon="🏙️" label="Cidade" value={selected.city?.split(',')[0]||'—'} t={t}/>
          </div>

          {/* Tabs */}
          <div style={{ padding:'0 28px', borderBottom:`1px solid ${t.border}`, display:'flex', gap:0 }}>
            {[['info','📋 Informações'],['ia','🧠 Perfil IA'],['extra','🔍 Dados extras']].map(([id,label])=>(
              <TabBtn key={id} active={tab===id} onClick={()=>setTab(id)} t={t}>{label}</TabBtn>
            ))}
          </div>

          {/* Conteúdo da tab */}
          <div style={{ flex:1, overflowY:'auto', padding:'24px 28px' }}>
            {tab==='info' && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18 }}>
                {[
                  ['Nome completo', selected.name],
                  ['Telefone / WhatsApp', selected.phone||'—'],
                  ['Email', selected.email||'—'],
                  ['Cidade', selected.city||'—'],
                  ['Canal principal', selected.channelLabel],
                  ['Cadastrado em', selected.createdAtLabel],
                ].map(([label,val])=>(
                  <div key={label} style={{ display:'flex', flexDirection:'column', gap:6, padding:'14px 16px', background:t.bgSecondary, borderRadius:10, border:`1px solid ${t.border}` }}>
                    <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.6px' }}>{label}</div>
                    <div style={{ fontSize:14, color:t.text, fontWeight:500, wordBreak:'break-all' }}>{val}</div>
                  </div>
                ))}
              </div>
            )}
            {tab==='ia' && <ProfileIATab profile={profiles[selected.id]} t={t}/>}
            {tab==='extra' && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                {Object.entries(selected.raw)
                  .filter(([k,v])=>v && typeof v!=='object' && !['id','name','phone','email','city','type','picture','createdAt','updatedAt','whatsappPhone','username'].includes(k))
                  .map(([k,v])=>(
                    <div key={k} style={{ background:t.bgSecondary, borderRadius:10, padding:'12px 16px', border:`1px solid ${t.border}` }}>
                      <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:5 }}>{k}</div>
                      <div style={{ fontSize:13, color:t.text, wordBreak:'break-all' }}>{String(v)}</div>
                    </div>
                  ))}
                {Object.entries(selected.raw).filter(([k,v])=>v&&typeof v!=='object'&&!['id','name','phone','email','city','type','picture','createdAt','updatedAt','whatsappPhone','username'].includes(k)).length===0 && (
                  <div style={{ gridColumn:'1/-1', color:t.textMuted, fontSize:13, padding:20 }}>Nenhum dado extra disponível.</div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <Centered t={t}><span style={{color:t.textMuted,fontSize:14}}>Selecione um contato</span></Centered>
      )}
    </div>
  )
}

// ── Perfil IA Tab ──

function BuyScoreBar({ score }) {
  const color = score >= 70 ? '#0EC331' : score >= 40 ? '#F59E0B' : '#9CA3AF'
  return (
    <div style={{ marginBottom:20 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
        <span style={{ fontSize:13, fontWeight:700, color:'#111' }}>Buy Score</span>
        <span style={{ fontSize:18, fontWeight:800, color }}>{score}/100</span>
      </div>
      <div style={{ height:10, background:'#F3F4F6', borderRadius:99, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${score}%`, background:color, borderRadius:99, transition:'width 0.5s' }}/>
      </div>
      <div style={{ fontSize:11, color:'#9CA3AF', marginTop:4 }}>
        {score >= 70 ? '🔥 Alta intenção de compra' : score >= 40 ? '⚡ Interesse moderado' : '😐 Baixo engajamento'}
      </div>
    </div>
  )
}

function TagList({ tags, label }) {
  if (!tags?.length) return null
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:8 }}>{label}</div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
        {tags.map((tag,i) => (
          <span key={i} style={{ fontSize:12, background:'#F3F4F6', color:'#374151', borderRadius:9999, padding:'4px 12px', fontWeight:500 }}>{tag}</span>
        ))}
      </div>
    </div>
  )
}

function ProfileIATab({ profile, t }) {
  if (!profile) return (
    <div style={{ textAlign:'center', padding:'60px 20px', color:t.textMuted }}>
      <div style={{ fontSize:32, marginBottom:12 }}>🧠</div>
      <div style={{ fontSize:14, fontWeight:600, marginBottom:6 }}>Sem perfil IA ainda</div>
      <div style={{ fontSize:12 }}>O perfil é criado automaticamente quando o cliente envia mensagens.</div>
    </div>
  )

  return (
    <div>
      <BuyScoreBar score={profile.buy_score || 0}/>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
        {profile.size && (
          <div style={{ background:t.bgSecondary, borderRadius:10, padding:'12px 16px', border:`1px solid ${t.border}` }}>
            <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:4 }}>Tamanho</div>
            <div style={{ fontSize:18, fontWeight:800, color:t.text }}>{profile.size}</div>
          </div>
        )}
        {profile.cep && (
          <div style={{ background:t.bgSecondary, borderRadius:10, padding:'12px 16px', border:`1px solid ${t.border}` }}>
            <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:4 }}>CEP</div>
            <div style={{ fontSize:18, fontWeight:800, color:t.text }}>{profile.cep}</div>
          </div>
        )}
        <div style={{ background:t.bgSecondary, borderRadius:10, padding:'12px 16px', border:`1px solid ${t.border}` }}>
          <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:4 }}>Mensagens</div>
          <div style={{ fontSize:18, fontWeight:800, color:t.text }}>{profile.message_count || 0}</div>
        </div>
        <div style={{ background:t.bgSecondary, borderRadius:10, padding:'12px 16px', border:`1px solid ${t.border}` }}>
          <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:4 }}>Último contato</div>
          <div style={{ fontSize:13, fontWeight:700, color:t.text }}>{profile.last_seen ? new Date(profile.last_seen).toLocaleDateString('pt-BR') : '—'}</div>
        </div>
      </div>

      <TagList tags={profile.tags} label="Tags automáticas"/>
      <TagList tags={profile.interests} label="Marcas / Interesses"/>
      <TagList tags={profile.products_asked} label="Produtos perguntados"/>

      {profile.notes && (
        <div style={{ marginTop:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:8 }}>Notas</div>
          <div style={{ background:t.bgSecondary, borderRadius:10, padding:'14px 16px', border:`1px solid ${t.border}`, fontSize:13, color:t.text, whiteSpace:'pre-wrap' }}>{profile.notes}</div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ──

function Avatar({ contact, size=38, fontSize=13 }) {
  if (contact.picture) {
    return (
      <img
        src={contact.picture}
        alt=""
        style={{ width:size, height:size, borderRadius:'50%', objectFit:'cover', flexShrink:0, border: '2px solid #E5E5E5' }}
        onError={e => {
          e.target.style.display = 'none'
          // Fallback para initiais se imagem quebrar
          const container = e.target.parentElement
          if (container) {
            const initials = document.createElement('div')
            initials.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:${contact.color};display:flex;align-items:center;justify-content:center;font-size:${fontSize}px;font-weight:800;color:#fff;flex-shrink:0;`
            initials.textContent = contact.initials
            container.appendChild(initials)
          }
        }}
      />
    )
  }

  return (
    <div style={{
      width:size,
      height:size,
      borderRadius:'50%',
      background:contact.color,
      display:'flex',
      alignItems:'center',
      justifyContent:'center',
      fontSize,
      fontWeight:800,
      color:'#fff',
      flexShrink:0,
      border: '2px solid rgba(255,255,255,0.5)',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    }}>
      {contact.initials}
    </div>
  )
}

function ContactRow({ contact, isActive, onClick, t }) {
  return (
    <div onClick={onClick} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', cursor:'pointer', background:isActive?t.bgSecondary:'transparent', borderLeft:`3px solid ${isActive?'#0EC331':'transparent'}`, transition:'background 0.1s' }}
      onMouseEnter={e=>{ if(!isActive) e.currentTarget.style.background=t.bgSecondary }}
      onMouseLeave={e=>{ if(!isActive) e.currentTarget.style.background='transparent' }}>
      <Avatar contact={contact} size={42}/>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:2 }}>
          <div style={{ fontSize:13, fontWeight:700, color:t.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:155 }}>{contact.name}</div>
          <div style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
            {contact.picture && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" title="Tem foto">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
              </svg>
            )}
            <ChannelDot channel={contact.channel}/>
          </div>
        </div>
        <div style={{ fontSize:11, color:t.textMuted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {contact.phone || contact.email || contact.channelLabel}
        </div>
      </div>
    </div>
  )
}

function Chip({ children, active, onClick, t, color }) {
  const activeColor = color || '#0EC331'
  return (
    <button onClick={onClick} style={{ fontSize:11, padding:'4px 11px', borderRadius:9999, border:`1px solid ${active?activeColor:t.border}`, cursor:'pointer', background:active?activeColor:t.bgSecondary, color:active?'#fff':t.textMid, fontWeight:active?700:500, transition:'all 0.12s', whiteSpace:'nowrap' }}>
      {children}
    </button>
  )
}

function MiniChip({ children, active, onClick, t, color }) {
  const activeColor = color || '#0EC331'
  return (
    <button onClick={onClick} style={{ fontSize:10, padding:'3px 8px', borderRadius:6, border:`1px solid ${active?activeColor:t.border}`, cursor:'pointer', background:active?activeColor:'transparent', color:active?'#fff':t.textMuted, fontWeight:active?700:500, transition:'all 0.1s', whiteSpace:'nowrap', lineHeight:1.4 }}>
      {children}
    </button>
  )
}

function StatCard({ icon, label, value, t }) {
  return (
    <div style={{ background:t.bgSecondary, borderRadius:10, padding:'14px 16px', border:`1px solid ${t.border}` }}>
      <div style={{ fontSize:20, marginBottom:6 }}>{icon}</div>
      <div style={{ fontSize:15, fontWeight:700, color:t.text, marginBottom:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={value||'—'}>{value||'—'}</div>
      <div style={{ fontSize:11, color:t.textMuted }}>{label}</div>
    </div>
  )
}

function TabBtn({ children, active, onClick, t }) {
  return (
    <button onClick={onClick} style={{ border:'none', borderBottom:active?'2px solid #0EC331':'2px solid transparent', background:'none', padding:'12px 16px', fontSize:13, fontWeight:active?700:400, color:active?'#0EC331':t.textMuted, cursor:'pointer', transition:'color 0.12s' }}>{children}</button>
  )
}

function InfoTag({ icon, value }) {
  return (
    <span style={{ fontSize:12, color:'#374151', background:'#F3F4F6', borderRadius:6, padding:'3px 10px', display:'flex', alignItems:'center', gap:4 }}>
      {icon} {value}
    </span>
  )
}

function ChannelBadge({ channel, label }) {
  const color = channel==='whatsapp'?'#25D366':channel==='instagram'?'#E1306C':'#6B7280'
  return (
    <span style={{ fontSize:11, fontWeight:700, color:'#fff', background:color, borderRadius:6, padding:'3px 10px' }}>{label}</span>
  )
}

function ChannelDot({ channel }) {
  const color = channel==='whatsapp'?'#25D366':channel==='instagram'?'#E1306C':'#9CA3AF'
  return <div style={{ width:8, height:8, borderRadius:'50%', background:color, flexShrink:0 }}/>
}

function Centered({ t, children }) {
  return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', background:t.bg, borderRadius:12 }}>
      {children}
    </div>
  )
}
