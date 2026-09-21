/**
 * scripts/reconciliacao-legados-preview.mjs
 *
 * CONTRATO CATÁLOGO PRIME — Etapa 1 (LAB/preview). Preview SOMENTE LEITURA
 * da reconciliação assistida dos produtos legados sem bagy_product_id.
 * Lê products via REST (chave pública/anon) e imprime o relatório gerado
 * por api/_reconciliacaoLegados.js. NENHUMA escrita, NENHUMA vinculação
 * automática.
 *
 * Uso:
 *   VITE_SUPABASE_URL=https://<projeto>.supabase.co \
 *   VITE_SUPABASE_ANON_KEY=<chave pública> \
 *   node scripts/reconciliacao-legados-preview.mjs [--json]
 */

import { reconciliarLegadosPreview } from '../api/_reconciliacaoLegados.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (chave pública/anon, leitura apenas).')
  process.exit(1)
}

const resp = await fetch(
  `${SUPABASE_URL}/rest/v1/products?select=id,nome,link,bagy_product_id,preco,imagem,status&order=id&limit=1000`,
  { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
)
if (!resp.ok) {
  console.error(`Falha na leitura: HTTP ${resp.status} ${await resp.text()}`)
  process.exit(1)
}
const rows = await resp.json()
const legados = rows.filter((r) => r.bagy_product_id == null)
const candidatos = rows.filter((r) => r.bagy_product_id != null)

const relatorio = reconciliarLegadosPreview(legados, candidatos)

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(relatorio, null, 2))
  process.exit(0)
}

const ordem = { alta: 0, media: 1, baixa: 2, nenhuma: 3 }
const ordenado = [...relatorio].sort(
  (a, b) => ordem[a.confianca] - ordem[b.confianca] || String(a.legado.nome).localeCompare(String(b.legado.nome))
)

console.log(`RECONCILIAÇÃO DE LEGADOS — PREVIEW SOMENTE LEITURA (Etapa 1)`)
console.log(`Legados sem bagy_product_id: ${legados.length} | Candidatos com vínculo Bagy: ${candidatos.length}`)
const contagem = {}
for (const r of relatorio) contagem[r.confianca] = (contagem[r.confianca] || 0) + 1
console.log(`Confiança: ${Object.entries(contagem).map(([k, v]) => `${k}=${v}`).join(' | ')}`)
console.log('')
for (const r of ordenado) {
  console.log(`- [${r.confianca.toUpperCase()}] ${r.legado.nome} (${r.legado.id})`)
  console.log(`  link normalizado: ${r.link_normalizado ?? '(sem link)'}`)
  if (r.candidatos.length === 0) {
    console.log(`  candidato Bagy: nenhum`)
  } else {
    for (const c of r.candidatos) {
      console.log(`  candidato Bagy: ${c.bagy_product_id} — ${c.nome} [${c.evidencias.join(', ')}]`)
    }
  }
  console.log(`  conflito/ambiguidade: ${r.conflito ? 'SIM' : 'não'} | recomendação: ${r.recomendacao}`)
}
console.log('')
console.log('Nenhuma escrita foi feita. Vinculação só após validação humana (Etapa 0, seção 8).')
