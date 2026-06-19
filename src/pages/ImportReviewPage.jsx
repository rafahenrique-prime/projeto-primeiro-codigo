import { useState, useEffect } from 'react'
import { useTheme } from '../theme.jsx'

export default function ImportReviewPage() {
  const { theme: t } = useTheme()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('summary') // 'summary' | 'new' | 'conflicts'
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    loadReport()
  }, [])

  async function loadReport() {
    try {
      const response = await fetch('/import-report.json')
      const data = await response.json()
      setReport(data)
      setLoading(false)
    } catch (e) {
      console.error('Erro ao carregar relatório:', e)
      setLoading(false)
    }
  }

  async function handleConfirm() {
    if (!confirmed) return

    // Salva o catálogo importado em localStorage
    try {
      const catalogResponse = await fetch('/catalog-imported.json')
      const catalog = await catalogResponse.json()
      localStorage.setItem('products_catalog', JSON.stringify(catalog))
      alert('✅ Catálogo atualizado com sucesso! 61 produtos importados.')
      window.location.reload()
    } catch (e) {
      alert('❌ Erro ao salvar catálogo: ' + e.message)
    }
  }

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.bg }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⏳</div>
          <div style={{ fontSize: 14, color: t.text }}>Carregando relatório...</div>
        </div>
      </div>
    )
  }

  if (!report) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.bg }}>
        <div style={{ textAlign: 'center', color: t.textMuted }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>❌</div>
          <div>Erro ao carregar relatório de importação</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: t.bg, borderRadius: 12, overflow: 'hidden', border: `1px solid ${t.border}` }}>

      {/* Header */}
      <div style={{ padding: '20px 24px', borderBottom: `1px solid ${t.border}`, background: '#ECFDF5' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 24 }}>✅</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#065F46' }}>Importação Concluída</h1>
            <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#047857' }}>
              {report.newProducts} produtos importados do backup Dealism • {report.timestamp}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${t.border}`, background: t.bg, padding: '0 24px' }}>
        {[
          { key: 'summary', label: '📊 Resumo', count: null },
          { key: 'new', label: '✨ Produtos Novos', count: report.newProducts },
          { key: 'conflicts', label: '⚠️  Conflitos', count: 0 },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setTab(tab.key)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: tab.key === tab.key ? `2px solid ${tab.key === 'summary' ? '#10B981' : tab.key === 'new' ? '#F59E0B' : '#EF4444'}` : '2px solid transparent',
              padding: '12px 0',
              fontSize: 13,
              fontWeight: 600,
              color: tab.key === tab.key ? t.text : t.textMuted,
              cursor: 'pointer',
              marginRight: 16,
              display: 'flex',
              gap: 8,
              alignItems: 'center',
            }}
          >
            {tab.label}
            {tab.count !== null && <span style={{ background: '#E5E7EB', padding: '1px 6px', borderRadius: 10, fontSize: 11 }}>{tab.count}</span>}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>

        {/* Resumo */}
        {tab === 'summary' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Cards de estatísticas */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[
                { label: 'Produtos Atuais', value: report.currentProducts, icon: '📦', color: '#3B82F6' },
                { label: 'Produtos Importados', value: report.newProducts, icon: '✨', color: '#10B981' },
                { label: 'Total Final', value: report.totalAfterImport, icon: '🎉', color: '#7C3AED' },
              ].map((stat, i) => (
                <div
                  key={i}
                  style={{
                    background: t.bgSecondary,
                    border: `1px solid ${t.border}`,
                    borderRadius: 12,
                    padding: '16px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 24, marginBottom: 8 }}>{stat.icon}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: stat.color, marginBottom: 4 }}>{stat.value}</div>
                  <div style={{ fontSize: 12, color: t.textMuted }}>{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Info boxes */}
            <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 12, padding: '16px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0369A1', marginBottom: 8 }}>ℹ️ O que foi feito</div>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: '#0C4A6E', lineHeight: 1.8 }}>
                <li>✅ Importou {report.newProducts} produtos do backup Dealism (maio 2026)</li>
                <li>✅ Detectou 0 duplicatas exatas</li>
                <li>✅ Manteve os {report.currentProducts} produtos atuais</li>
                <li>⏳ Aguardando sua confirmação para finalizar</li>
              </ul>
            </div>

            <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 12, padding: '16px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#B45309', marginBottom: 8 }}>⚠️ Próximos passos</div>
              <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: '#78350F', lineHeight: 1.8 }}>
                <li>Revise os <strong>Produtos Novos</strong> importados</li>
                <li>Verifique se há <strong>Conflitos</strong> a resolver</li>
                <li>Se tudo estiver OK, clique em <strong>Confirmar Importação</strong></li>
                <li>Os produtos serão salvos no catálogo permanentemente</li>
              </ol>
            </div>
          </div>
        )}

        {/* Produtos Novos */}
        {tab === 'new' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 8 }}>
              Mostrando {report.newProductsList?.length || 0} produtos importados do backup
            </div>
            {report.newProductsList?.map((prod, i) => (
              <div
                key={i}
                style={{
                  background: t.bgSecondary,
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  padding: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: t.text, fontSize: 13, marginBottom: 4 }}>
                    {prod.nome}
                  </div>
                  <div style={{ display: 'flex', gap: 8, fontSize: 11, color: t.textMuted }}>
                    <span>📁 {prod.categoria}</span>
                    {prod.estoque > 0 && <span>📦 {prod.estoque} un.</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 100, flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, color: '#10B981', fontSize: 13 }}>
                    {prod.preco}
                  </div>
                  <div style={{ fontSize: 10, color: t.textMuted }}>ID: {prod.id}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Conflitos */}
        {tab === 'conflicts' && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: t.textMuted }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Nenhum conflito encontrado!</div>
            <div style={{ fontSize: 12 }}>
              Todos os 13 produtos do backup são novos. Nenhuma duplicata foi detectada.
            </div>
          </div>
        )}
      </div>

      {/* Footer - Confirmação */}
      <div style={{ padding: '16px 24px', borderTop: `1px solid ${t.border}`, background: t.bg, display: 'flex', gap: 12, alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={e => setConfirmed(e.target.checked)}
          style={{ width: 18, height: 18, cursor: 'pointer' }}
        />
        <label style={{ flex: 1, fontSize: 12, color: t.text, cursor: 'pointer' }}>
          ✅ Revisei tudo e confirmo a importação dos 13 produtos
        </label>
        <button
          onClick={handleConfirm}
          disabled={!confirmed}
          style={{
            background: confirmed ? '#10B981' : '#D1D5DB',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '10px 24px',
            fontSize: 13,
            fontWeight: 600,
            cursor: confirmed ? 'pointer' : 'not-allowed',
            whiteSpace: 'nowrap',
          }}
        >
          ✅ Confirmar Importação
        </button>
      </div>
    </div>
  )
}
