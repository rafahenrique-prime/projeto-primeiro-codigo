// Módulo experimental — Central de Inteligência de Contatos
// Isolado do módulo Contatos atual (ContactsPage.jsx) — não altera rotas, tabelas ou dados existentes.
import { useState, useEffect, useMemo } from 'react'
import { useTheme } from '../theme.jsx'
import { listContacts, getChatMessages } from '../services/gptmaker'
import { getAllProfiles, getProfile } from '../services/customerProfileService'
import { getAnalysis, analyzeConversation } from '../services/crm/contactAnalysisService'
import { saveEntry } from '../services/knowledgeDB'
import Tooltip from '../components/Tooltip.jsx'

function HelpIcon({ text, position = 'bottom' }) {
  return (
    <Tooltip text={text} position={position}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.55, cursor: 'help', flexShrink: 0 }}>
        <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 2-3 4"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    </Tooltip>
  )
}

const AVATAR_COLORS = ['#6366f1', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EF4444', '#14B8A6']
function colorFor(str) { let h = 0; for (const c of (str || '')) h = (h * 31 + c.charCodeAt(0)) & 0xffff; return AVATAR_COLORS[h % AVATAR_COLORS.length] }
function initialsFor(name) { return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() }

function loadFollowUpFlags() {
  try { return JSON.parse(localStorage.getItem('contacts_new_followup') || '{}') } catch { return {} }
}
function saveFollowUpFlags(flags) {
  localStorage.setItem('contacts_new_followup', JSON.stringify(flags))
}

function resolveChatId(contact, conversations) {
  const digits = (contact.phone || '').replace(/\D/g, '')
  const match = (conversations || []).find(c =>
    (digits && c.phone?.replace(/\D/g, '')?.includes(digits)) ||
    (contact.name && c.name?.toLowerCase() === contact.name.toLowerCase())
  )
  return match?.id || null
}

export default function ContactsNewPage({ conversations = [] }) {
  const { theme: t } = useTheme()
  const [selected, setSelected] = useState(null)

  return selected
    ? <ContactDetail contact={selected} t={t} onBack={() => setSelected(null)} />
    : <ContactsList t={t} conversations={conversations} onSelect={setSelected} />
}

function ContactsList({ t, conversations, onSelect }) {
  const [contacts, setContacts] = useState([])
  const [profiles, setProfiles] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [perspective, setPerspective] = useState('todos')
  const [followUpFlags, setFollowUpFlags] = useState(loadFollowUpFlags)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [list, profs] = await Promise.all([listContacts(1, 100), getAllProfiles().catch(() => [])])
      setContacts(list)
      const map = {}
      profs.forEach(p => { map[p.conv_id] = p })
      setProfiles(map)
    } finally {
      setLoading(false)
    }
  }

  const withChatId = useMemo(() => {
    return contacts.map(c => {
      const chatId = resolveChatId(c, conversations)
      return { ...c, chatId, profile: chatId ? profiles[chatId] : null }
    })
  }, [contacts, conversations, profiles])

  const filtered = useMemo(() => {
    let list = withChatId
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c => (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q))
    }
    if (perspective === 'quentes') list = list.filter(c => (c.profile?.buy_score || 0) >= 70)
    if (perspective === 'frios') list = list.filter(c => (c.profile?.buy_score || 0) < 30)
    if (perspective === 'acompanhamento') list = list.filter(c => followUpFlags[c.id])
    return list
  }, [withChatId, search, perspective, followUpFlags])

  const counts = useMemo(() => ({
    todos: withChatId.length,
    quentes: withChatId.filter(c => (c.profile?.buy_score || 0) >= 70).length,
    frios: withChatId.filter(c => (c.profile?.buy_score || 0) < 30).length,
    acompanhamento: withChatId.filter(c => followUpFlags[c.id]).length,
  }), [withChatId, followUpFlags])

  return (
    <div style={{ flex: 1, background: t.bg, borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 20 }}>
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 16, fontWeight: 500, color: t.text, display: 'flex', alignItems: 'center', gap: 8 }}>
          Contatos <span style={{ fontSize: 11, fontWeight: 600, color: '#7C3AED', background: '#F5F3FF', padding: '2px 8px', borderRadius: 6 }}>experimental</span>
        </div>
        <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>Central de inteligência de conversas — módulo isolado, não afeta a tela de Contatos atual.</div>
      </div>

      <div style={{ display: 'flex', gap: 6, margin: '16px 0 12px', flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          ['todos', 'Todos', null],
          ['quentes', 'Quentes', 'Score de conversão ≥ 70% — clientes com alta chance de comprar em breve.'],
          ['frios', 'Frios', 'Score de conversão < 30% — clientes com baixa chance de comprar no momento.'],
          ['acompanhamento', 'Acompanhamento', 'Contatos marcados manualmente (📌) para você voltar a falar depois.'],
        ].map(([k, label, help]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <button onClick={() => setPerspective(k)} style={{
              fontSize: 12, padding: '6px 14px', borderRadius: 9999, border: 'none', cursor: 'pointer',
              background: perspective === k ? (t.primary || '#E8192C') : t.bgTertiary,
              color: perspective === k ? '#fff' : t.textMid,
              fontWeight: perspective === k ? 600 : 500,
            }}>{label} ({counts[k]})</button>
            {help && <HelpIcon text={help} />}
          </div>
        ))}
      </div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Buscar por nome ou telefone..."
        style={{ width: '100%', maxWidth: 340, border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, color: t.text, background: t.inputBg, outline: 'none', boxSizing: 'border-box', marginBottom: 14 }}
      />

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>Carregando contatos...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>Nenhum contato nessa visão.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${t.border}` }}>
                <th style={{ textAlign: 'left', padding: '8px', color: t.textMuted, fontWeight: 500, fontSize: 12 }}>Nome</th>
                <th style={{ textAlign: 'left', padding: '8px', color: t.textMuted, fontWeight: 500, fontSize: 12 }}>Canal</th>
                <th style={{ textAlign: 'left', padding: '8px', color: t.textMuted, fontWeight: 500, fontSize: 12 }}>Telefone</th>
                <th style={{ textAlign: 'left', padding: '8px', color: t.textMuted, fontWeight: 500, fontSize: 12 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    Score
                    <HelpIcon text="Chance estimada de o contato comprar, calculada pela IA a partir da conversa (0-100%)." />
                  </span>
                </th>
                <th style={{ textAlign: 'right', padding: '8px', color: t.textMuted, fontWeight: 500, fontSize: 12 }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} style={{ borderBottom: `1px solid ${t.borderLight}` }}>
                  <td style={{ padding: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {c.picture
                        ? <img src={c.picture} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} onError={e => e.target.style.display = 'none'} />
                        : <div style={{ width: 28, height: 28, borderRadius: '50%', background: colorFor(c.name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#fff' }}>{initialsFor(c.name)}</div>}
                      <span style={{ color: t.text, fontWeight: 500 }}>{c.name || 'Sem nome'}</span>
                      {followUpFlags[c.id] && <span title="Marcado para acompanhamento" style={{ fontSize: 10 }}>📌</span>}
                    </div>
                  </td>
                  <td style={{ padding: '8px', color: t.textMid }}>{c.type === 'INSTAGRAM' ? 'Instagram' : 'WhatsApp'}</td>
                  <td style={{ padding: '8px', color: t.textMid }}>{c.phone || '—'}</td>
                  <td style={{ padding: '8px' }}>
                    {c.profile?.buy_score != null
                      ? <span style={{ fontSize: 11, fontWeight: 600, color: c.profile.buy_score >= 70 ? '#0EC331' : c.profile.buy_score >= 40 ? '#D97706' : '#9CA3AF' }}>{c.profile.buy_score}%</span>
                      : <span style={{ color: t.textMuted }}>—</span>}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>
                    <button onClick={() => onSelect(c)} style={{ background: 'none', border: 'none', color: t.primary || '#E8192C', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Visualizar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const TABS = [
  { key: 'conversa', label: 'Conversa' },
  { key: 'analise', label: 'Análise IA' },
  { key: 'aprendizados', label: 'Aprendizados' },
  { key: 'perspectiva', label: 'Insights' },
]

function ContactDetail({ contact, t, onBack }) {
  const id = contact.id
  const chatId = contact.chatId
  const [tab, setTab] = useState('conversa')
  const [contactName] = useState(contact.name || 'Contato')
  const [messages, setMessages] = useState([])
  const [loadingMsgs, setLoadingMsgs] = useState(true)
  const [analysis, setAnalysis] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [profile, setProfile] = useState(null)
  const [followUp, setFollowUp] = useState(() => !!loadFollowUpFlags()[id])

  useEffect(() => {
    if (!chatId) {
      setLoadingMsgs(false)
      setMessages([])
      return
    }
    setLoadingMsgs(true)
    getChatMessages(chatId).then(msgs => {
      setMessages(Array.isArray(msgs) ? msgs : [])
    }).catch(() => setMessages([])).finally(() => setLoadingMsgs(false))
    getAnalysis(chatId).then(setAnalysis)
    getProfile(chatId).then(setProfile)
  }, [chatId])

  function toggleFollowUp() {
    const flags = loadFollowUpFlags()
    if (flags[id]) delete flags[id]; else flags[id] = true
    saveFollowUpFlags(flags)
    setFollowUp(!!flags[id])
  }

  async function handleAnalyze() {
    if (!chatId) return
    setAnalyzing(true)
    try {
      const result = await analyzeConversation(chatId, contactName, messages)
      setAnalysis(result)
    } catch (e) {
      alert('Erro ao analisar: ' + e.message + '\n\nSe a mensagem for sobre tabela inexistente, veja o SQL em src/services/contactAnalysisService.js')
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleAddToKnowledge(pergunta) {
    try {
      await saveEntry({ title: pergunta, content: `Pergunta frequente identificada na conversa com ${contactName}: "${pergunta}"`, category: 'FAQ', source: 'contatos-new' })
      alert('Adicionado à Base de Conhecimento!')
    } catch (e) {
      alert('Erro ao salvar: ' + e.message)
    }
  }

  return (
    <div style={{ flex: 1, background: t.bg, borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted, display: 'flex' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <div style={{ fontSize: 15, fontWeight: 600, color: t.text }}>{contactName || 'Contato'}</div>
        </div>
        <button onClick={toggleFollowUp} style={{
          fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
          background: followUp ? '#FEF3C7' : t.bgTertiary, color: followUp ? '#92400E' : t.textMid, border: 'none',
        }}>{followUp ? 'Marcado p/ acompanhamento' : 'Marcar p/ acompanhamento'}</button>
      </div>

      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${t.border}`, padding: '0 20px' }}>
        {TABS.map(tb => (
          <button key={tb.key} onClick={() => setTab(tb.key)} style={{
            background: 'none', border: 'none', borderBottom: tab === tb.key ? `2px solid ${t.primary || '#E8192C'}` : '2px solid transparent',
            padding: '10px 14px', fontSize: 13, fontWeight: tab === tb.key ? 600 : 500,
            color: tab === tb.key ? (t.primary || '#E8192C') : t.textMid, cursor: 'pointer',
          }}>{tb.label}</button>
        ))}
      </div>

      {!chatId && (
        <div style={{ margin: '14px 20px 0', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#92400E' }}>
          Não encontramos uma conversa ativa para este contato (sem correspondência por telefone/nome nas conversas carregadas). Abra a tela de Mensagem pelo menos uma vez para este contato e volte aqui.
        </div>
      )}

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '240px 1fr', overflow: 'hidden' }}>
        {/* Coluna fixa — sempre visível independente da aba */}
        <div style={{ borderRight: `1px solid ${t.border}`, padding: 20, overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            {contact.picture
              ? <img src={contact.picture} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} onError={e => e.target.style.display = 'none'} />
              : <div style={{ width: 40, height: 40, borderRadius: '50%', background: colorFor(contactName), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, color: '#fff', flexShrink: 0 }}>{initialsFor(contactName)}</div>}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contactName}</div>
              <div style={{ fontSize: 11, color: t.textMuted }}>{contact.type === 'INSTAGRAM' ? 'Instagram' : 'WhatsApp'}</div>
            </div>
          </div>

          <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>Última interação</div>
          <div style={{ fontSize: 12, color: t.text, marginBottom: 16 }}>{profile?.last_seen ? new Date(profile.last_seen).toLocaleString('pt-BR') : '—'}</div>

          <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>Objetivo</div>
          <div style={{ fontSize: 12, color: t.text, lineHeight: 1.5, marginBottom: 16 }}>{analysis?.objetivo || profile?.notes || '—'}</div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <div style={{ flex: 1, height: 8, borderRadius: 9999, overflow: 'hidden', background: t.bgTertiary }}>
              <div style={{
                height: 8, borderRadius: 9999, transition: 'width 0.4s',
                width: `${analysis?.score_conversao ?? profile?.buy_score ?? 0}%`,
                background: 'linear-gradient(90deg, #D946EF, #F97316)',
              }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#F97316', minWidth: 36 }}>{analysis?.score_conversao ?? profile?.buy_score ?? 0}%</span>
          </div>
          <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 16 }}>Progresso do objetivo</div>

          <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>Resumo</div>
          <div style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.5, marginBottom: 16 }}>{analysis?.resumo || 'Rode a Análise IA para gerar um resumo.'}</div>

          <div style={{ height: 1, background: t.border, margin: '14px 0' }} />

          <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>Produtos de interesse</div>
          <div style={{ fontSize: 12, color: t.text, marginBottom: 12 }}>{(profile?.products_asked || []).join(', ') || '—'}</div>

          <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>Tags</div>
          <div style={{ fontSize: 12, color: t.text }}>{(profile?.tags || []).join(', ') || '—'}</div>
        </div>

        {/* Coluna direita — conteúdo por aba */}
        <div style={{ overflowY: 'auto', padding: 20 }}>
        {tab === 'conversa' && (
          loadingMsgs ? <div style={{ color: t.textMuted, fontSize: 13 }}>Carregando conversa...</div> :
          messages.length === 0 ? <div style={{ color: t.textMuted, fontSize: 13 }}>Nenhuma mensagem encontrada.</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 600 }}>
              {messages.map((m, i) => (
                <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-start' : 'flex-end', maxWidth: '80%' }}>
                  <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 2, textAlign: m.role === 'user' ? 'left' : 'right' }}>
                    {m.role === 'user' ? 'Cliente' : 'Agente'} · {m.createdAt ? new Date(m.createdAt).toLocaleString('pt-BR') : ''}
                  </div>
                  <div style={{
                    background: m.role === 'user' ? t.bgSecondary : (t.primaryBg || '#fff5f5'),
                    border: `1px solid ${t.border}`, borderRadius: 10, padding: '8px 12px', fontSize: 13, color: t.text,
                  }}>{m.text || m.content || m.message || (m.imageUrl || m.image ? 'Imagem enviada' : 'Mensagem sem texto')}</div>
                </div>
              ))}
            </div>
          )
        )}

        {tab === 'analise' && (
          <div style={{ maxWidth: 600 }}>
            <button onClick={handleAnalyze} disabled={analyzing || messages.length === 0} style={{
              background: analyzing ? t.bgTertiary : (t.primary || '#E8192C'), color: analyzing ? t.textMuted : '#fff',
              border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: analyzing ? 'default' : 'pointer', marginBottom: 16,
            }}>{analyzing ? 'Analisando...' : 'Analisar Conversa'}</button>

            {!analysis && !analyzing && <div style={{ color: t.textMuted, fontSize: 13 }}>Nenhuma análise gerada ainda. Clique no botão acima.</div>}

            {analysis && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <AnalysisBlock t={t} label="Resumo" content={analysis.resumo} />
                <AnalysisBlock t={t} label="Objetivo do cliente" content={analysis.objetivo} />
                <AnalysisBlock t={t} label="Produtos citados" content={(analysis.produtos_citados || []).join(', ') || '—'} />
                <AnalysisBlock t={t} label="Interesse de compra" content={analysis.interesse_compra} />
                <AnalysisBlock t={t} label="Objeções identificadas" content={(analysis.objecoes || []).join(' · ') || '—'} />
                <AnalysisBlock t={t} label="Dúvidas frequentes" content={(analysis.duvidas_frequentes || []).join(' · ') || '—'} />
                <AnalysisBlock t={t} label="Próxima ação recomendada" content={analysis.proxima_acao} />
                <div>
                  <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    Score de conversão
                    <HelpIcon text="Chance estimada de o contato comprar, calculada pela IA a partir da conversa (0-100%)." />
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 600, color: (analysis.score_conversao || 0) >= 70 ? '#0EC331' : (analysis.score_conversao || 0) >= 40 ? '#D97706' : t.textMuted }}>{analysis.score_conversao}%</div>
                </div>
                {analysis._persisted === false && (
                  <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#92400E' }}>
                    Análise gerada mas não salva — a tabela <code>contact_ai_analysis</code> ainda não existe no Supabase. Rode o SQL que está no comentário final de <code>src/services/contactAnalysisService.js</code> uma vez no SQL Editor.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'aprendizados' && (
          <div style={{ maxWidth: 600 }}>
            {!analysis ? (
              <div style={{ color: t.textMuted, fontSize: 13 }}>Rode a "Análise IA" primeiro para identificar dúvidas frequentes e objeções desta conversa.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(analysis.duvidas_frequentes || []).length === 0 && <div style={{ color: t.textMuted, fontSize: 13 }}>Nenhuma dúvida recorrente identificada nesta conversa.</div>}
                {(analysis.duvidas_frequentes || []).map((pergunta, i) => (
                  <div key={i} style={{ background: t.bgSecondary, border: `1px solid ${t.border}`, borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>Pergunta</div>
                    <div style={{ fontSize: 13, color: t.text, marginBottom: 10 }}>{pergunta}</div>
                    <button onClick={() => handleAddToKnowledge(pergunta)} style={{ background: t.bgTertiary, border: `1px solid ${t.border}`, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 500, color: t.textSecondary, cursor: 'pointer' }}>
                      Adicionar ao Conhecimento
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'perspectiva' && (
          <div style={{ maxWidth: 500, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <PerspectivaBlock t={t} title="Necessidades" content={analysis?.objetivo || profile?.notes} />
            <PerspectivaBlock t={t} title="Riscos" content={(analysis?.objecoes || []).join(' · ')} />
            <PerspectivaBlock t={t} title="Preferências" content={(analysis?.produtos_citados || []).join(', ') || profile?.size} />
            {!analysis && <div style={{ fontSize: 12, color: t.textMuted }}>Preenchido automaticamente depois que você rodar a "Análise IA".</div>}
          </div>
        )}
        </div>
      </div>
    </div>
  )
}

function AnalysisBlock({ t, label, content }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: t.text, lineHeight: 1.6 }}>{content || '—'}</div>
    </div>
  )
}

function PerspectivaBlock({ t, title, content }) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: t.text, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13, color: t.textSecondary }}>{content || '—'}</div>
    </div>
  )
}
