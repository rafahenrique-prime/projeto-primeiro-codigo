import { useState, useEffect } from 'react'
import { useTheme } from '../theme.jsx'
import BagyAuditPage from './BagyAuditPage'
import SystemHealthTab from './SystemHealthTab'
import KnowledgeAuditTab from './KnowledgeAuditTab'
import LearningsAuditTab from './LearningsAuditTab'
import WhatsappAuditTab from './WhatsappAuditTab'
import InstagramAuditTab from './InstagramAuditTab'
import GabrielaAuditTab from './GabrielaAuditTab'
import CodexAuditTab from './CodexAuditTab'
import { getOverallHealth } from '../services/opsHealthService'

const TABS = [
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: '💬',
    status: 'live',
    description: 'Auditoria da qualidade da operação de WhatsApp: leads sem resposta, contatos duplicados, sem nome, abandonadas e sem interação recente.',
    engine: 'Sem IA — 100% regra (tempo, duplicidade, nome vazio)',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    icon: '📸',
    status: 'live',
    description: 'Auditoria de DMs via GPT Maker: sem resposta, contatos duplicados, sem nome, abandonadas e sem interação recente.',
    engine: 'Sem IA — 100% regra (tempo, duplicidade, nome vazio)',
  },
  {
    id: 'conhecimento',
    label: 'Conhecimento',
    icon: '📚',
    status: 'live',
    description: 'Auditoria da base de conhecimento CODEX: duplicado, semelhante, obsoleto, muito curto e contraditório.',
    engine: 'Embeddings (regra) + IA (DeepSeek R1) só pra contradição',
  },
  {
    id: 'aprendizagem',
    label: 'Aprendizagem',
    icon: '🧠',
    status: 'live',
    description: 'Auditoria da biblioteca de aprendizados (agent_learnings): duplicadas, conflitantes e muito curtas.',
    engine: 'Similaridade de palavras (regra) + IA (DeepSeek R1) só pra conflito',
  },
  {
    id: 'gabriela',
    label: 'Gabriela IA',
    icon: '🤖',
    status: 'live',
    description: 'Qualidade das respostas da Gabriela: taxa de sucesso, falhas detectadas e confiança média, a partir do cron de auditoria diária.',
    engine: 'Sem IA nova — agrega o cron de auditoria diária (Groq) que já existe',
  },
  {
    id: 'sistema',
    label: 'Sistema',
    icon: '⚙️',
    status: 'live',
    description: 'Auditoria técnica da saúde do sistema: Supabase, WhatsApp, Instagram, Groq e webhooks.',
    engine: 'Sem IA — apenas verificações técnicas (health checks)',
  },
  {
    id: 'codex',
    label: 'CODEX',
    icon: '🧩',
    status: 'live',
    description: 'Auditoria do código do projeto: arquivos órfãos, funções sem uso, componentes duplicados, rotas mortas e tabelas sem uso.',
    engine: 'Análise feita pelo Claude Code (fora do navegador) — sem automação em tempo real',
  },
  {
    id: 'bagy',
    label: 'Bagy',
    icon: '🛍️',
    status: 'live',
    description: 'Compara o catálogo publicado na Bagy com o catálogo interno.',
    engine: 'Sem IA — apenas regras e comparações',
  },
]

export default function IntelligenceOpsPage({ initialTab = 'bagy' }) {
  const { theme: t } = useTheme()
  const [activeTab, setActiveTab] = useState(TABS.some(x => x.id === initialTab) ? initialTab : 'bagy')
  const [health, setHealth] = useState(null)
  const [healthLoading, setHealthLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setHealthLoading(true)
    getOverallHealth().then(h => { if (!cancelled) { setHealth(h); setHealthLoading(false) } })
    return () => { cancelled = true }
  }, [])

  const tab = TABS.find(x => x.id === activeTab) || TABS[0]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: t.bg, borderRadius: 12, border: `1px solid ${t.border}` }}>
      <div style={{ padding: '18px 24px 0', flexShrink: 0 }}>
        <h1 style={{ fontSize: 19, fontWeight: 700, color: t.text, margin: '0 0 2px' }}>Inteligência Operacional</h1>
        <p style={{ fontSize: 12, color: t.textMuted, margin: '0 0 16px' }}>
          Central de auditorias, diagnósticos e verificações de saúde do DealOnça.
        </p>
        <OverallHealthPanel health={health} loading={healthLoading} t={t} />
        <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${t.border}`, overflowX: 'auto' }}>
          {TABS.map(tb => (
            <TabButton key={tb.id} tb={tb} active={activeTab === tb.id} onClick={() => setActiveTab(tb.id)} t={t} />
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tab.id === 'bagy' && <BagyAuditPage />}
        {tab.id === 'sistema' && <SystemHealthTab t={t} />}
        {tab.id === 'conhecimento' && <KnowledgeAuditTab t={t} />}
        {tab.id === 'aprendizagem' && <LearningsAuditTab t={t} />}
        {tab.id === 'whatsapp' && <WhatsappAuditTab t={t} />}
        {tab.id === 'instagram' && <InstagramAuditTab t={t} />}
        {tab.id === 'gabriela' && <GabrielaAuditTab t={t} />}
        {tab.id === 'codex' && <CodexAuditTab t={t} />}
        {tab.status === 'dev' && <DevelopmentTab tab={tab} t={t} />}
      </div>
    </div>
  )
}

function TabButton({ tb, active, onClick, t }) {
  const primary = t.primary || '#E8192C'
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '9px 14px', fontSize: 13, fontWeight: active ? 700 : 500,
      background: 'none', border: 'none', borderBottom: `2px solid ${active ? primary : 'transparent'}`,
      color: active ? primary : t.textMid, cursor: 'pointer', whiteSpace: 'nowrap',
      transition: 'color 0.15s, border-color 0.15s',
    }}>
      <span>{tb.icon}</span>
      {tb.label}
      {tb.status === 'dev' && (
        <span style={{
          fontSize: 9, fontWeight: 700, color: '#9CA3AF', background: active ? `${primary}12` : (t.bgTertiary || '#F3F4F6'),
          borderRadius: 9999, padding: '1px 6px', textTransform: 'uppercase', letterSpacing: '0.3px',
        }}>Em breve</span>
      )}
    </button>
  )
}

function DevelopmentTab({ tab, t }) {
  return (
    <div style={{ padding: 24, maxWidth: 760, margin: '0 auto' }}>
      <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 14, padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 24 }}>{tab.icon}</span>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: t.text, margin: 0 }}>{tab.label}</h2>
          <span style={{
            fontSize: 10, fontWeight: 700, color: '#B45309', background: '#FEF3C7',
            borderRadius: 9999, padding: '2px 9px', textTransform: 'uppercase', letterSpacing: '0.3px',
          }}>Em desenvolvimento</span>
        </div>
        <p style={{ fontSize: 13, color: t.textMid, lineHeight: 1.5, margin: '0 0 16px' }}>{tab.description}</p>

        {tab.roadmap && (
          <>
            <div style={{ fontSize: 11, color: t.textMuted, fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>
              O que essa auditoria vai medir
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginBottom: 16 }}>
              {tab.roadmap.map(item => (
                <div key={item} style={{
                  display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: t.textMid,
                  background: t.bgTertiary || '#F9FAFB', border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 10px',
                }}>
                  <span style={{ color: '#D1D5DB' }}>○</span>
                  {item}
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ fontSize: 11.5, color: t.textMuted, borderTop: `1px solid ${t.border}`, paddingTop: 12 }}>
          <strong style={{ color: t.textMid }}>Motor:</strong> {tab.engine}
        </div>
      </div>

      <div style={{ textAlign: 'center', color: t.textMuted, fontSize: 12.5, padding: '16px 0' }}>
        Score, resumo executivo e histórico desta auditoria aparecem aqui assim que ela for ativada.
      </div>
    </div>
  )
}

function healthColor(pct) {
  if (pct == null) return '#9CA3AF'
  if (pct >= 90) return '#0EC331'
  if (pct >= 70) return '#F59E0B'
  return '#E8192C'
}

function OverallHealthPanel({ health, loading, t }) {
  if (loading) {
    return (
      <div style={{ fontSize: 12, color: t.textMuted, padding: '4px 0 14px' }}>Calculando saúde geral...</div>
    )
  }
  if (!health || health.knownCount < 3) {
    return null // painel só aparece quando pelo menos 3 auditorias têm dado real
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
      background: t.bgTertiary || '#F9FAFB', border: `1px solid ${t.border}`, borderRadius: 12,
      padding: '12px 16px', marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: t.textMuted, fontWeight: 600, textTransform: 'uppercase' }}>Saúde geral</span>
        <span style={{ fontSize: 22, fontWeight: 800, color: healthColor(health.overall) }}>{health.overall}%</span>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {health.items.filter(i => i.pct != null).map(i => (
          <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <span style={{ color: t.textMid }}>{i.label}</span>
            <span style={{ fontWeight: 700, color: healthColor(i.pct) }}>{i.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
