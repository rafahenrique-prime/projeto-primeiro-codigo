// Catálogo V1 — Fase 5: painel lateral de leitura/conferência de 1 produto.
// Só leitura — nenhuma escrita, nenhuma ação destrutiva, nenhum "corrigir
// exceção" ainda (fica pra V2/Auditoria). Busca as variações completas SOB
// DEMANDA (só quando este componente monta pra um produto específico) — a
// tabela/agregados continuam vindo de catalogV1Data.js, sem duplicar lógica.

import { useEffect, useState } from 'react'
import { useTheme } from '../../theme.jsx'
import { getVariationsForProduct } from '../../services/catalogo/catalogV1Data'
import SyncStatusBadge from './SyncStatusBadge'
import OrigemBadge from './OrigemBadge'

function formatMoeda(valor) {
  if (valor === null || valor === undefined) return null
  const n = Number(valor)
  if (Number.isNaN(n)) return null
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function capitalizar(s) {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ')
}

// Renderiza attributes (jsonb) honestamente — sem inventar semântica de
// tamanho/cor que não esteja no dado salvo.
function AttributesList({ attributes, t }) {
  const entradas = Object.entries(attributes || {})
  if (entradas.length === 0) return <span style={{ color: t.textMuted, fontSize: 11 }}>—</span>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {entradas.map(([chave, valor]) => (
        <span key={chave} style={{ fontSize: 11, color: t.text }}>
          <strong>{capitalizar(chave)}:</strong> {String(valor)}
        </span>
      ))}
    </div>
  )
}

const EXCEPTION_LABEL = {
  '404': 'Não encontrado na Bagy',
  duplicate_conflict: 'Conflito de link',
  pagina_invalida: 'Página inválida',
}

function Campo({ label, value, t }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0', borderBottom: `1px solid ${t.border}` }}>
      <span style={{ fontSize: 11, color: t.textMuted }}>{label}</span>
      <span style={{ fontSize: 11, color: t.text, fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

/**
 * @param {{ product: object, v1Info: object|undefined, syncStatus: object|undefined, onClose: () => void }} props
 */
export default function ProdutoDrawer({ product, v1Info, syncStatus, onClose }) {
  const { theme: t } = useTheme()
  const [variations, setVariations] = useState(null)
  const [loadingVariations, setLoadingVariations] = useState(true)
  const [variationsError, setVariationsError] = useState(null)

  // Busca sob demanda — só as variações DESTE produto, refeita se o usuário
  // abrir outro produto sem fechar o drawer (produto.id muda).
  useEffect(() => {
    let cancelado = false
    setLoadingVariations(true)
    setVariationsError(null)
    setVariations(null)

    getVariationsForProduct(product.id)
      .then((rows) => { if (!cancelado) setVariations(rows) })
      .catch((e) => { if (!cancelado) setVariationsError(e.message) })
      .finally(() => { if (!cancelado) setLoadingVariations(false) })

    return () => { cancelado = true }
  }, [product.id])

  const precoPixLabel = formatMoeda(v1Info?.precoPix)
  const exceptions = v1Info?.exceptions || []

  return (
    <>
      {/* Overlay discreto — clicar fora fecha, sem escurecer a página como os modais grandes */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 40 }}
      />
      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 41,
          width: 'min(480px, 100vw)',
          background: t.bg, borderLeft: `1px solid ${t.border}`,
          display: 'flex', flexDirection: 'column',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
        }}
      >
        {/* Cabeçalho */}
        <div style={{ padding: 16, borderBottom: `1px solid ${t.border}`, flexShrink: 0, display: 'flex', gap: 12 }}>
          <img
            src={product.imagem}
            alt={product.nome}
            style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, flexShrink: 0, background: t.bgSecondary }}
            onError={(e) => { e.target.style.visibility = 'hidden' }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {product.nome}
              </h3>
              <button
                onClick={onClose}
                title="Fechar"
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, color: t.textMuted, lineHeight: 1, padding: 2, flexShrink: 0 }}
              >
                ✕
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <SyncStatusBadge status={syncStatus} />
              <OrigemBadge bagyProductId={v1Info?.bagyProductId} source={v1Info?.source} />
            </div>
            <div style={{ marginTop: 8, fontSize: 10.5, color: t.textMuted }}>
              {v1Info?.bagyProductId != null && <>Bagy ID: {v1Info.bagyProductId} · </>}
              Última sync: {v1Info?.syncedLabel ?? '—'}
            </div>
          </div>
        </div>

        {/* Corpo — scroll interno */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>

          {/* Pendência de sincronização — só se houver exceção aberta */}
          {exceptions.length > 0 && (
            <div style={{ marginBottom: 16, background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#B45309', marginBottom: 6 }}>⚠️ Pendência de sincronização</div>
              {exceptions.map((exc, idx) => (
                <div key={idx} style={{ fontSize: 11, color: '#78350F', marginBottom: idx < exceptions.length - 1 ? 6 : 0 }}>
                  <div><strong>{EXCEPTION_LABEL[exc.tipo] || exc.tipo}</strong> · status: aberto</div>
                  {exc.detalhe && (
                    <div style={{ color: '#92400E', fontSize: 10, marginTop: 2 }}>
                      {typeof exc.detalhe === 'string' ? exc.detalhe : JSON.stringify(exc.detalhe)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Informações do produto */}
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: 0.3, margin: '0 0 6px 0' }}>
              Produto
            </h4>
            <Campo t={t} label="Preço" value={product.preco} />
            <Campo t={t} label="Preço PIX" value={precoPixLabel} />
            <Campo t={t} label="Categoria" value={product.categoria} />
            <Campo t={t} label="Breadcrumb" value={v1Info?.categoriaBreadcrumb} />
            <Campo t={t} label="Marca" value={v1Info?.marca} />
            <Campo t={t} label="Código" value={v1Info?.codigo} />
            <Campo
              t={t}
              label="Estoque"
              value={v1Info?.sellWithoutStock === true ? 'Venda sem estoque' : null}
            />
            {v1Info?.descricao && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>Descrição</div>
                <div
                  style={{ fontSize: 11, color: t.text, lineHeight: 1.5, maxHeight: 120, overflowY: 'auto' }}
                  dangerouslySetInnerHTML={{ __html: v1Info.descricao }}
                />
              </div>
            )}
          </div>

          {/* Variações */}
          <div>
            <h4 style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: 0.3, margin: '0 0 6px 0' }}>
              Variações
            </h4>

            {loadingVariations && (
              <div style={{ fontSize: 11, color: t.textMuted, padding: '8px 0' }}>Carregando variações...</div>
            )}

            {!loadingVariations && variationsError && (
              <div style={{ fontSize: 11, color: '#DC2626', padding: '8px 0' }}>
                Erro ao carregar variações: {variationsError}
              </div>
            )}

            {!loadingVariations && !variationsError && variations && variations.length === 0 && (
              <div style={{ fontSize: 11, color: t.textMuted, padding: '8px 0' }}>Sem variações.</div>
            )}

            {!loadingVariations && !variationsError && variations && variations.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {variations.map((v) => (
                  <div key={v.id} style={{ border: `1px solid ${t.border}`, borderRadius: 8, padding: 8, display: 'flex', gap: 8 }}>
                    {v.imagem_principal ? (
                      <img src={v.imagem_principal} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 40, height: 40, borderRadius: 6, background: t.bgSecondary, flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <AttributesList attributes={v.attributes} t={t} />
                      <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                        {v.preco != null && <span style={{ fontSize: 10.5, color: t.text, fontWeight: 600 }}>{formatMoeda(v.preco)}</span>}
                        {v.preco_compare != null && (
                          <span style={{ fontSize: 10.5, color: t.textMuted, textDecoration: 'line-through' }}>{formatMoeda(v.preco_compare)}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>
                        {v.sell_without_stock === true
                          ? 'Venda sem estoque'
                          : v.stock_quantity !== null && v.stock_quantity !== undefined
                            ? `Estoque: ${v.stock_quantity}`
                            : 'Estoque: —'}
                      </div>
                      <div style={{ fontSize: 9.5, color: t.textMuted, marginTop: 2 }}>bagy_variation_id: {v.bagy_variation_id}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
