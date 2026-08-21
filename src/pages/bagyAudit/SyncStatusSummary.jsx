// Extraído de BagyAuditPage.jsx (era `ExecutiveSummary`) na PARTE 56 / Fase 2
// — move-and-rename puro, sem mudança de lógica/props/render. Só o resumo de
// SINCRONIZAÇÃO (Verificar/Sincronizar agora, bagy_sync_runs) — nunca mistura
// com o resumo de qualidade do catálogo (ver QualitySummary.jsx, aba
// separada).

const STATUS_GERAL_COLOR = { operacional: '#0EC331', atencao: '#F59E0B', problema: '#E8192C', desconhecido: '#D1D5DB' }
const STATUS_GERAL_ICON = { operacional: '🟢', atencao: '🟡', problema: '🔴', desconhecido: '⚪' }

function formatDuration(ms) {
  if (ms == null) return '—'
  const totalSec = Math.round(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`
}

export default function SyncStatusSummary({ t, dashboard }) {
  const { productCounts, exceptionCounts, latestRun, statusGeral } = dashboard

  return (
    <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 14, padding: 20, marginBottom: 20, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
      <HealthRing status={statusGeral} />
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 8 }}>
          {latestRun
            ? <>Última execução: {new Date(latestRun.finished_at || latestRun.started_at).toLocaleString('pt-BR')} · {latestRun.mode} · {latestRun.trigger}</>
            : 'Nenhuma execução do sincronizador registrada ainda'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
          <SummaryLine icon="📦" label="Produtos" value={productCounts.total} color={t.text} />
          <SummaryLine icon="🔗" label="Sincronizados" value={productCounts.sincronizados} color="#0EC331" />
          <SummaryLine icon="✍️" label="Manuais" value={productCounts.manuais} color="#6366F1" />
          <SummaryLine icon="⚠️" label="Exceções abertas" value={exceptionCounts.porStatus.aberto} color="#E8192C" />
          {latestRun && (
            <>
              <SummaryLine icon="📊" label="Analisados" value={latestRun.total_analisado} color={t.text} />
              <SummaryLine icon="✅" label="Sem mudança" value={latestRun.sem_mudanca} color="#0EC331" />
              <SummaryLine icon="🔴" label="404" value={latestRun.total_404} color="#E8192C" />
              <SummaryLine icon="🟡" label="Página inválida" value={latestRun.pagina_invalida} color="#F59E0B" />
              <SummaryLine icon="🟠" label="Conflitos" value={latestRun.duplicate_conflict} color="#F97316" />
              <SummaryLine icon="🌐" label="Erro de rede" value={latestRun.erro_rede} color="#6B7280" />
              <SummaryLine icon="🔁" label="Retries" value={latestRun.retries_executados} color="#6B7280" />
              <SummaryLine icon="➕" label="Variações inseridas" value={latestRun.variacoes_inseridas} color="#7C3AED" />
              <SummaryLine icon="♻️" label="Variações atualizadas" value={latestRun.variacoes_atualizadas} color="#7C3AED" />
              <SummaryLine icon="🏁" label="Status final" value={latestRun.status_final} color={t.text} />
              <SummaryLine icon="⏱️" label="Duração" value={formatDuration(latestRun.duration_ms)} color={t.text} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryLine({ icon, label, value, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
      <span>{icon}</span>
      <span style={{ color: '#6B7280' }}>{label}:</span>
      <span style={{ fontWeight: 700, color }}>{value}</span>
    </div>
  )
}

function HealthRing({ status }) {
  const color = STATUS_GERAL_COLOR[status?.status] || '#D1D5DB'
  const icon = STATUS_GERAL_ICON[status?.status] || '⚪'
  return (
    <div style={{ position: 'relative', width: 110, height: 110, flexShrink: 0 }}>
      <div style={{
        width: 110, height: 110, borderRadius: '50%',
        background: color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.6s ease',
      }}>
        <div style={{ width: 88, height: 88, borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 4 }}>
          <div style={{ fontSize: 22 }}>{icon}</div>
          <div style={{ fontSize: 9, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{status?.label || 'Status'}</div>
        </div>
      </div>
    </div>
  )
}
