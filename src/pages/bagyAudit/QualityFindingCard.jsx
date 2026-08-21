// PARTE 56 / Fase 3 (leitura) + Fase 4 (Ignorar/Reativar) — card de 1
// finding da Auditoria de Qualidade. Renderiza literalmente o que a API
// devolve (mensagem/encontrado/por_que/o_que_conferir) — nunca reformula
// ALERTA/SUGESTAO como certeza.
//
// Fase 4 — Ignorar/Reativar: mesmo padrão de segurança já usado por
// V2ExceptionCard (BagyAuditPage.jsx) — senha de ação (BAGY_UI_ACTION_SECRET)
// digitada a cada clique, nunca persistida (sem localStorage/sessionStorage,
// sem log), lida só no momento da chamada e limpa logo em seguida. O card só
// muda visualmente DEPOIS que o backend confirma — nunca otimismo prematuro
// (evita mostrar "ignorado" se a escrita falhar). Só chama
// setFindingStatus(id, 'aberto'|'ignorado', senha) — nunca 'resolvido' (o
// próprio setFindingStatus já rejeita isso no cliente, antes de qualquer
// rede; o backend rejeita de novo, independente). Nenhum botão "Resolver"/
// "Corrigir" existe nesta área — resolvido é sempre automático (run completa
// que não encontra mais o achado); correção automática de catálogo nunca foi
// implementada em nenhuma fase desta frente.

import { useState } from 'react'
import { setFindingStatus } from '../../services/auditoria/qualidadeCatalogoData.js'

// Limiar de UI (não é campo de backend) — só decide qual aviso de freshness
// mostrar. `content_synced_at` é o único sinal de conteúdo confirmado;
// `last_seen_at` é só presença, nunca usado aqui pra decidir "atualizado".
const SHADOW_STALE_THRESHOLD_MS = 72 * 60 * 60 * 1000

const CLASSE_META = {
  FATO: { icon: '📋', color: '#2563EB', label: 'FATO' },
  ALERTA: { icon: '⚠️', color: '#7C3AED', label: 'ALERTA' },
  SUGESTAO: { icon: '💡', color: '#6B7280', label: 'SUGESTÃO' },
}

const SEVERIDADE_META = {
  CRITICO: { color: '#E8192C', label: 'CRÍTICO', solido: true },
  IMPORTANTE: { color: '#F59E0B', label: 'IMPORTANTE', solido: false },
  REVISAR: { color: '#9CA3AF', label: 'REVISAR', solido: false },
}

export function ClasseBadge({ classe }) {
  const meta = CLASSE_META[classe] || { icon: '•', color: '#6B7280', label: classe }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700,
      color: meta.color, background: `${meta.color}15`, borderRadius: 6, padding: '2px 8px',
    }}>
      {meta.icon} {meta.label}
    </span>
  )
}

export function SeveridadeBadge({ severidade }) {
  const meta = SEVERIDADE_META[severidade] || { color: '#6B7280', label: severidade, solido: false }
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '2px 8px',
      color: meta.solido ? '#fff' : meta.color,
      background: meta.solido ? meta.color : `${meta.color}15`,
      border: meta.solido ? 'none' : `1px solid ${meta.color}55`,
    }}>
      {meta.label}
    </span>
  )
}

function formatRelativo(ms) {
  const totalHoras = Math.floor(ms / (60 * 60 * 1000))
  if (totalHoras < 24) return `${totalHoras}h`
  const dias = Math.floor(totalHoras / 24)
  return `${dias} dia${dias === 1 ? '' : 's'}`
}

// ShadowFreshnessNote — regra de exibição (PARTE 56 §5, verbatim):
//   content_synced_at NULL      -> neutro, "data desconhecida"
//   content_synced_at > 72h     -> âmbar, "pode estar desatualizado"
//   content_synced_at <= 72h    -> discreto, "sincronizado há Xh"
// `last_seen_at` NUNCA classifica o conteúdo como atualizado — é só
// contexto de presença, exibido à parte, nunca como substituto de
// content_synced_at.
export function ShadowFreshnessNote({ contentSyncedAt, lastSeenAt, discreto = false }) {
  const agora = Date.now()

  let texto
  let cor
  if (!contentSyncedAt) {
    texto = 'Data de sincronização do conteúdo desconhecida. Confirme diretamente na Bagy antes de agir.'
    cor = '#6B7280'
  } else {
    const idadeMs = agora - new Date(contentSyncedAt).getTime()
    if (idadeMs > SHADOW_STALE_THRESHOLD_MS) {
      texto = `⚠️ Espelho pode estar desatualizado — conteúdo sincronizado há ${formatRelativo(idadeMs)}. Confirme diretamente na Bagy antes de agir.`
      cor = '#B45309'
    } else {
      texto = `Espelho sincronizado há ${formatRelativo(idadeMs)}.`
      cor = '#9CA3AF'
    }
  }

  return (
    <div style={{ fontSize: discreto ? 10.5 : 11.5, color: cor, marginTop: 4 }}>
      {texto}
      {lastSeenAt && (
        <span style={{ color: '#9CA3AF' }}> · visto pela última vez em {new Date(lastSeenAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
      )}
    </div>
  )
}

function CampoTexto({ titulo, valor }) {
  if (!valor) return null
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 2 }}>{titulo}</div>
      <div style={{ fontSize: 12, color: 'inherit' }}>{valor}</div>
    </div>
  )
}

export default function QualityFindingCard({ finding, t, expanded, onToggleExpand, onStatusChanged }) {
  const shadow = finding.shadow_products || {}
  const inativo = shadow.ativo === false
  const nome = shadow.nome || `produto ${finding.bagy_product_id ?? finding.shadow_product_id}`

  // Fase 4 — estado local de ação, mesmo padrão de V2ExceptionCard: busy/
  // actionError/showPasswordInput/passwordInput vivem só neste card, nunca
  // no pai — cada finding triagem sua própria ação, independente dos outros.
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [showPasswordInput, setShowPasswordInput] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')

  async function handleToggleStatus() {
    const senha = passwordInput
    setShowPasswordInput(false)
    setPasswordInput('') // limpo imediatamente após a leitura — nunca persistido
    setBusy(true)
    setActionError(null)
    try {
      const novoStatus = finding.status === 'aberto' ? 'ignorado' : 'aberto'
      const atualizado = await setFindingStatus(finding.id, novoStatus, senha)
      // Só muda a UI depois da confirmação do backend — nunca otimismo
      // prematuro. Repassa o finding confirmado pro pai decidir o patch.
      onStatusChanged?.(atualizado || { ...finding, status: novoStatus })
    } catch (e) {
      setActionError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 10, padding: '10px 14px', opacity: inativo ? 0.6 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div
          onClick={onToggleExpand}
          style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0, cursor: 'pointer' }}
        >
          <SeveridadeBadge severidade={finding.severidade} />
          <ClasseBadge classe={finding.classe} />
          <span style={{ fontSize: 12, fontWeight: 600, color: t.text }}>{nome}</span>
          <span style={{ fontSize: 11, color: t.textMuted }}>· #{finding.bagy_product_id ?? '—'}</span>
          {inativo && (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', background: '#F3F4F6', borderRadius: 6, padding: '1px 6px' }}>Inativo</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: '#9CA3AF' }}>{finding.status === 'ignorado' ? 'Ignorado' : 'Aberto'}</span>
          {finding.status === 'aberto' && (
            <button onClick={() => setShowPasswordInput((v) => !v)} disabled={busy}
              style={{ fontSize: 11, color: '#6B7280', background: 'none', border: `1px solid ${t.border}`, borderRadius: 6, padding: '2px 8px', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>
              {busy ? '...' : 'Ignorar'}
            </button>
          )}
          {finding.status === 'ignorado' && (
            <button onClick={() => setShowPasswordInput((v) => !v)} disabled={busy}
              style={{ fontSize: 11, color: '#7C3AED', background: 'none', border: '1px solid #7C3AED', borderRadius: 6, padding: '2px 8px', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>
              {busy ? '...' : 'Reativar'}
            </button>
          )}
          <span onClick={onToggleExpand} style={{ fontSize: 11, color: t.textMuted, cursor: 'pointer' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {showPasswordInput && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
          <input
            type="password"
            autoFocus
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleToggleStatus()}
            placeholder="Senha de ação"
            style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: `1px solid ${t.border}`, background: t.bg, color: t.text, flex: 1, maxWidth: 180 }}
          />
          <button onClick={handleToggleStatus}
            style={{ fontSize: 11, color: '#fff', background: finding.status === 'aberto' ? '#6B7280' : '#7C3AED', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
            Confirmar
          </button>
          <button onClick={() => { setShowPasswordInput(false); setPasswordInput('') }}
            style={{ fontSize: 11, color: t.textMuted, background: 'none', border: 'none', cursor: 'pointer' }}>
            Cancelar
          </button>
        </div>
      )}

      <div onClick={onToggleExpand} style={{ fontSize: 12, color: t.text, marginTop: 4, cursor: 'pointer' }}>{finding.mensagem}</div>

      {actionError && (
        <div style={{ fontSize: 11, color: '#E8192C', marginTop: 4 }}>⚠️ Não foi possível atualizar: {actionError}</div>
      )}

      {expanded && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${t.border}`, color: t.text }}>
          <CampoTexto titulo="Problema" valor={finding.mensagem} />
          <CampoTexto titulo="Encontrado" valor={finding.encontrado} />
          <CampoTexto titulo="Por que foi sinalizado" valor={finding.por_que} />
          <CampoTexto titulo="O que conferir" valor={finding.o_que_conferir} />

          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 2 }}>Contexto do Shadow</div>
            <div style={{ fontSize: 11.5, color: t.textMuted }}>
              {shadow.ativo === false ? 'Produto inativo' : 'Produto ativo'}
            </div>
            <ShadowFreshnessNote
              contentSyncedAt={shadow.content_synced_at}
              lastSeenAt={shadow.last_seen_at}
              discreto={finding.classe === 'SUGESTAO'}
            />
          </div>
        </div>
      )}
    </div>
  )
}
