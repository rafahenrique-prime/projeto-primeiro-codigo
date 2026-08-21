// PARTE 56 / Fase 3 — barra de filtros da aba Qualidade do Catálogo.
// Só os parâmetros que a API realmente suporta (status, severidade, classe,
// tipo, bagyProductId, nome) — nenhum parâmetro inventado (nada de `ativo`,
// nada de ordenação server-side).

import { useEffect, useState } from 'react'

const CLASSE_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'FATO', label: 'FATO' },
  { value: 'ALERTA', label: 'ALERTA' },
  { value: 'SUGESTAO', label: 'SUGESTÃO' },
]

const SEVERIDADE_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'CRITICO', label: 'CRÍTICO' },
  { value: 'IMPORTANTE', label: 'IMPORTANTE' },
  { value: 'REVISAR', label: 'REVISAR' },
]

const STATUS_OPTIONS = [
  { value: 'aberto', label: 'Aberto' },
  { value: 'ignorado', label: 'Ignorado' },
]

function Chip({ active, onClick, color, label }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 12, padding: '5px 12px', borderRadius: 9999, border: `1px solid ${color}`, cursor: 'pointer', fontWeight: 600,
      background: active ? color : `${color}12`,
      color: active ? '#fff' : color,
    }}>{label}</button>
  )
}

// Decide bagyProductId × nome sem presumir — só numérico puro vira ID.
function ehIdNumerico(texto) {
  return /^\d+$/.test(texto.trim())
}

export default function QualityFilters({ filters, onChange, tiposDisponiveis, t }) {
  // Debounce ~300ms da busca — só dispara onChange depois que o usuário
  // parar de digitar, evitando 1 request por tecla.
  const [buscaInput, setBuscaInput] = useState(filters.busca || '')

  useEffect(() => {
    setBuscaInput(filters.busca || '')
  }, [filters.busca])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (buscaInput !== (filters.busca || '')) {
        onChange({ busca: buscaInput })
      }
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaInput])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {CLASSE_OPTIONS.map((opt) => (
          <Chip key={opt.value} active={filters.classe === opt.value} onClick={() => onChange({ classe: opt.value })} color="#7C3AED" label={opt.label} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {SEVERIDADE_OPTIONS.map((opt) => (
          <Chip key={opt.value} active={filters.severidade === opt.value} onClick={() => onChange({ severidade: opt.value })} color="#E8192C" label={opt.label} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {STATUS_OPTIONS.map((opt) => (
          <Chip key={opt.value} active={filters.status === opt.value} onClick={() => onChange({ status: opt.value })} color="#6B7280" label={opt.label} />
        ))}
      </div>
      {tiposDisponiveis.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Chip active={filters.tipo === 'all'} onClick={() => onChange({ tipo: 'all' })} color="#2563EB" label="Todos os tipos" />
          {tiposDisponiveis.map((tipo) => (
            <Chip key={tipo} active={filters.tipo === tipo} onClick={() => onChange({ tipo })} color="#2563EB" label={tipo} />
          ))}
        </div>
      )}
      <input
        value={buscaInput}
        onChange={(e) => setBuscaInput(e.target.value)}
        placeholder="Buscar por nome ou bagy_product_id..."
        style={{ fontSize: 12, padding: '7px 10px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.text, maxWidth: 320 }}
      />
    </div>
  )
}

export { ehIdNumerico }
