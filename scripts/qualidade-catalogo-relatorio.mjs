// scripts/qualidade-catalogo-relatorio.mjs
//
// SOMENTE LEITURA. Roda o motor puro de auditoria de qualidade
// (src/services/auditoria/qualidadeCatalogoRules.js) contra o estado real
// atual de shadow_products/shadow_product_variations e imprime o relatório.
// Não escreve em NADA — nem Supabase, nem Bagy, nem arquivo.
//
// Uso: node scripts/qualidade-catalogo-relatorio.mjs

import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
process.chdir('/Users/macbook/Projetos/IGNITE-PRIME')
const envLocalPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envLocalPath)) {
  for (const line of fs.readFileSync(envLocalPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const { avaliarCatalogo } = await import('../src/services/auditoria/qualidadeCatalogoRules.js')

const PAGE_SIZE = 1000

function supabaseHeaders() {
  const key = process.env.SUPABASE_SECRET_KEY
  return { apikey: key, Authorization: `Bearer ${key}` }
}

async function fetchAll(path, select, extra = '') {
  const url = process.env.VITE_SUPABASE_URL
  const rows = []
  let offset = 0
  while (true) {
    const res = await fetch(`${url}/rest/v1/${path}?select=${select}${extra}&limit=${PAGE_SIZE}&offset=${offset}`, { headers: supabaseHeaders() })
    if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
    const page = await res.json()
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return rows
}

const produtos = await fetchAll('shadow_products', 'id,bagy_product_id,nome,marca,categoria_nome,preco,preco_pix,link,imagem_principal,ativo')
const variacoes = await fetchAll('shadow_product_variations', 'id,shadow_product_id')

const variationsByProductId = new Map()
for (const v of variacoes) {
  const lista = variationsByProductId.get(v.shadow_product_id) || []
  lista.push(v)
  variationsByProductId.set(v.shadow_product_id, lista)
}

const resultado = avaliarCatalogo(produtos, variationsByProductId)

console.log('=== RESUMO ===')
console.log('Total ativos analisados:', resultado.totalAtivosAnalisados)
console.log('Sem achados:', resultado.semAchados)
console.log('Com achados:', resultado.comAchados)

const porTipo = {}
for (const r of resultado.resultados) {
  for (const a of r.achados) {
    porTipo[a.tipo] = (porTipo[a.tipo] || 0) + 1
  }
}
console.log('\n=== POR TIPO ===')
for (const [tipo, n] of Object.entries(porTipo).sort((a, b) => b[1] - a[1])) {
  console.log(` ${tipo}: ${n}`)
}

console.log('\n=== PRODUTOS COM ACHADOS (bagy_product_id | nome | tipos) ===')
for (const r of resultado.resultados) {
  if (r.achados.length === 0) continue
  console.log(` ${r.produto.bagy_product_id} | ${r.produto.nome} | ${r.achados.map((a) => `${a.classe}:${a.tipo}`).join(', ')}`)
}

// --- Validação dos controles conhecidos (produtos já corrigidos hoje) ------
console.log('\n=== CONTROLES CONHECIDOS ===')
const idsCorrigidosHoje = [
  10084754, 10084761, 10084771, 10084772, 10084776, 10084777, 10084780,
  10477518, 10477521, 10477531, 10477715, 10477716, 10490760, 10490762,
  7446655, 7446963, 7447925, 7447926, 7447931, 7572423, 7580846, 7581064,
  7581086, 7581711, 7588236, 7598984, 7606253, 7606391, 9677224, 9733645, 9737287,
]
const idsTeste = [10494395, 10493527, 10493370]

const byBagyId = new Map(resultado.resultados.map((r) => [r.produto.bagy_product_id, r]))

let falsosPositivos = 0
for (const id of idsCorrigidosHoje) {
  const r = byBagyId.get(id)
  if (!r) {
    console.log(` ⚠️  ${id} não encontrado entre os ativos analisados (pode estar inativo/ausente)`)
    continue
  }
  const criticosOuAlertas = r.achados.filter((a) => a.classe !== 'SUGESTAO')
  if (criticosOuAlertas.length > 0) {
    falsosPositivos++
    console.log(` 🔴 FALSO POSITIVO em ${id} (${r.produto.nome}): ${criticosOuAlertas.map((a) => a.tipo).join(', ')}`)
  }
}
console.log(`31 correções homologadas ainda limpas (sem FATO/ALERTA): ${idsCorrigidosHoje.length - falsosPositivos}/${idsCorrigidosHoje.length}`)

let testesNaFilaAtiva = 0
for (const id of idsTeste) {
  if (byBagyId.has(id)) {
    testesNaFilaAtiva++
    console.log(` 🔴 Produto de teste ${id} apareceu na fila ATIVA (deveria estar inativo, fora da análise)`)
  }
}
console.log(`3 produtos de teste inativos ignorados corretamente: ${testesNaFilaAtiva === 0 ? 'SIM' : 'NÃO'}`)

console.log('\n=== CASOS NOMINAIS ===')
for (const [id, nomeEsperado, marcaEsperada, categoriaEsperada] of [
  [7447926, 'Tênis Boss TTNM EVO', 'BOSS', 'Tênis'],
  [7446655, 'Tênis Boss Bulton Sneaker', 'BOSS', 'Tênis'],
  [7606391, 'One Million Parfum 100ml', 'Paco Rabanne', 'Perfumes de Griffe'],
]) {
  const r = byBagyId.get(id)
  if (!r) { console.log(` ⚠️  ${id} não encontrado`); continue }
  const ok = r.produto.marca === marcaEsperada && r.produto.categoria_nome === categoriaEsperada
  console.log(` ${ok ? 'OK' : 'DIVERGENTE'} — ${id}: nome="${r.produto.nome}" marca="${r.produto.marca}" categoria="${r.produto.categoria_nome}" (esperado marca="${marcaEsperada}" categoria="${categoriaEsperada}")`)
}
