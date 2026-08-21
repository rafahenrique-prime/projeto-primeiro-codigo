// Novo na PARTE 56 / Fase 2 — cards de resumo da Qualidade do Catálogo na
// aba Visão Geral, visualmente separados do resumo de sincronização
// (SyncStatusSummary.jsx). Só leitura (getQualitySummary, camada homologada
// na Fase 1) — nenhuma ação de escrita aqui, nenhum findings/filtro ainda
// (Fase 3+).

import SummaryCard from '../../components/operations/SummaryCard.jsx'

export default function QualitySummary({ t, summary, loading, error }) {
  return (
    <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 14, padding: 20, marginBottom: 20 }}>
      <div style={{ fontSize: 11, color: t.textMuted, fontWeight: 600, textTransform: 'uppercase', marginBottom: 12 }}>
        Qualidade do catálogo
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: t.textMuted, padding: '8px 0' }}>Carregando resumo de qualidade...</div>
      ) : error ? (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '10px 14px', color: '#E8192C', fontSize: 13 }}>
          ⚠️ Não foi possível carregar o resumo de qualidade: {error}
        </div>
      ) : !summary ? (
        <div style={{ fontSize: 12, color: t.textMuted, padding: '8px 0' }}>
          Nenhuma auditoria de qualidade executada ainda.
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <SummaryCard icon="📦" label="Ativos analisados" value={summary.total_active_products ?? '—'} accent="#7C3AED" />
            <SummaryCard icon="✅" label="Sem problemas" value={summary.products_without_findings ?? '—'} accent="#0EC331" />
            <SummaryCard icon="⚠️" label="Com problemas" value={summary.products_with_findings ?? '—'} accent="#F59E0B" />
            <SummaryCard icon="🔴" label="Críticos" value={summary.critico_count ?? '—'} accent="#E8192C" />
          </div>
          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 10 }}>
            última auditoria: {summary.finished_at || summary.created_at
              ? new Date(summary.finished_at || summary.created_at).toLocaleString('pt-BR')
              : '—'}
            {' · '}status: {summary.status || '—'}
          </div>
        </>
      )}
    </div>
  )
}
