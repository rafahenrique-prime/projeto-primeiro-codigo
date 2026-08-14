// Auditoria Bagy vs Catálogo interno — SEM API paga da Bagy.
// Usa sitemap.xml público + JSON-LD (schema.org/Product) de cada página de produto.
// Isolado: só lê a tabela `products` (nunca escreve nela) e escreve em `bagy_audit_log`.
//
// Uso manual (fase de teste, sem cron ainda):
//   GET /api/bagy-audit?runId=xxx&offset=0&limit=25          → processa um lote e volta
//   GET /api/bagy-audit?runId=xxx&offset=0&limit=25&finalize=1 → depois do último lote,
//     calcula os "sumidos" (existem no catálogo mas não apareceram na Bagy)

import crypto from 'node:crypto'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY
const STORE_URL = process.env.BAGY_STORE_URL || 'https://www.primestoremen.com.br'
const SITEMAP_URL = `${STORE_URL}/sitemap.xml`

// Correção de segurança (fechamento Auditoria Bagy V2) — rota legada, mas
// ainda escreve em bagy_audit_log via scraping real; reutiliza o mesmo
// BAGY_UI_ACTION_SECRET já criado pra Verificar/Sincronizar/Ignorar/Reativar
// (system-tools.js) em vez de inventar um secret novo. Mesma comparação
// segura (timingSafeEqual), mesmo padrão "falha fechado" se a env var não
// estiver configurada. GET-based (query string), não POST — secret vem em
// ?actionSecret=.
const BAGY_UI_ACTION_SECRET = process.env.BAGY_UI_ACTION_SECRET

function compararSegredoSeguro(fornecido, esperado) {
  if (typeof fornecido !== 'string' || typeof esperado !== 'string') return false
  const bufferFornecido = Buffer.from(fornecido)
  const bufferEsperado = Buffer.from(esperado)
  if (bufferFornecido.length !== bufferEsperado.length) return false
  return crypto.timingSafeEqual(bufferFornecido, bufferEsperado)
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  'Referer': 'https://www.google.com/',
}

const sbHeaders = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal',
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function getSitemapUrls() {
  const res = await fetch(SITEMAP_URL, { headers: BROWSER_HEADERS })
  if (!res.ok) throw new Error(`sitemap ${res.status}`)
  const xml = await res.text()
  const matches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim())
  return [...new Set(matches)]
}

async function fetchProductJsonLd(url) {
  const res = await fetch(url, { headers: BROWSER_HEADERS })
  if (!res.ok) return null
  const html = await res.text()
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  for (const b of blocks) {
    try {
      const data = JSON.parse(b[1])
      if (data['@type'] === 'Product') return data
    } catch {}
  }
  return null
}

async function getLocalProducts() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/products?select=id,nome,link,price_discount,preco,codigo`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  })
  if (!res.ok) return []
  return res.json()
}

function normLink(url) {
  if (!url) return ''
  return url.trim().replace(/\/$/, '').toLowerCase()
}

function priceOf(local) {
  if (local.price_discount != null) return Number(local.price_discount)
  const m = String(local.preco || '').match(/[\d.,]+/)
  if (!m) return null
  return Number(m[0].replace(/\./g, '').replace(',', '.'))
}

// Normaliza pra comparação "de conteúdo": sem acento, sem hífen/pontuação, sem espaço duplo.
// Usado só pra CLASSIFICAR a divergência como cosmética — nunca decide sozinho, o item continua
// aparecendo no relatório (com selo diferente) pra você confirmar.
function normalizeForCompare(s) {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .toLowerCase()
    .replace(/[-–—_.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function classifyNameDiff(bagyName, localName) {
  if (normalizeForCompare(bagyName) === normalizeForCompare(localName)) return 'cosmetic_name'
  return 'real'
}

// PostgREST exige que TODOS os objetos de um insert em lote tenham exatamente as mesmas
// chaves ("All object keys must match") — por isso todo row passa por aqui antes de gravar,
// preenchendo com null o que não se aplica àquele tipo de linha.
const ROW_SHAPE = {
  run_id: null, url: null, status: null,
  bagy_name: null, bagy_price: null, bagy_sku: null, bagy_stock: null,
  catalog_id: null, catalog_name: null, catalog_price: null,
  diff_kind: 'real', details: null,
}
function buildRow(overrides) {
  return { ...ROW_SHAPE, ...overrides }
}

async function logRows(rows) {
  if (!rows.length) return
  const res = await fetch(`${SUPABASE_URL}/rest/v1/bagy_audit_log`, {
    method: 'POST',
    headers: sbHeaders,
    body: JSON.stringify(rows.map(buildRow)),
  }).catch(err => { console.error('[bagy-audit] falha de rede ao gravar linhas:', err.message); return null })
  if (res && !res.ok) {
    const body = await res.text().catch(() => '')
    console.error('[bagy-audit] Supabase recusou o insert:', res.status, body)
  }
}

export default async function handler(req, res) {
  if (!BAGY_UI_ACTION_SECRET) {
    console.error('[bagy-audit] Configuração ausente: BAGY_UI_ACTION_SECRET não definida')
    return res.status(503).json({ error: 'ação indisponível: BAGY_UI_ACTION_SECRET não configurado no servidor' })
  }
  if (!compararSegredoSeguro(req.query?.actionSecret, BAGY_UI_ACTION_SECRET)) {
    return res.status(401).json({ error: 'não autorizado' })
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase não configurado' })
  }

  const runId = String(req.query.runId || Date.now())
  const offset = parseInt(req.query.offset || '0', 10)
  const limit = Math.min(parseInt(req.query.limit || '25', 10), 50)
  const finalize = req.query.finalize === '1'

  try {
    const sitemapUrls = await getSitemapUrls()
    const localProducts = await getLocalProducts()
    const localByLink = new Map(localProducts.map(p => [normLink(p.link), p]))

    if (finalize) {
      // Produtos que estão no catálogo (com link da própria loja) mas não apareceram
      // em nenhum lote da varredura do sitemap → provavelmente removidos/despublicados na Bagy.
      const sitemapSet = new Set(sitemapUrls.map(normLink))
      const missingInBagy = localProducts.filter(p => {
        const link = normLink(p.link)
        return link && link.includes(STORE_URL.replace(/^https?:\/\//, '')) && !sitemapSet.has(link)
      })
      const rows = missingInBagy.map(p => ({
        run_id: runId,
        url: p.link,
        status: 'missing_in_bagy',
        catalog_id: p.id,
        catalog_name: p.nome,
        catalog_price: priceOf(p),
        details: { motivo: 'link do catálogo não encontrado no sitemap atual da Bagy' },
      }))
      // Linha "meta": guarda o total de URLs do sitemap dessa execução, pro resumo executivo
      // calcular a % de saúde sem depender de um número fixo no frontend.
      rows.push({ run_id: runId, status: 'meta', details: { totalUrls: sitemapUrls.length } })
      await logRows(rows)
      return res.status(200).json({ done: true, finalized: true, missingInBagy: rows.length - 1 })
    }

    const batch = sitemapUrls.slice(offset, offset + limit)
    const rows = []

    for (const url of batch) {
      await sleep(300) // não martelar o servidor da Bagy
      let product
      try {
        product = await fetchProductJsonLd(url)
      } catch (err) {
        console.error('[bagy-audit] erro ao ler', url, err.message)
        continue
      }
      if (!product) continue // página não é produto (categoria, blog, home, etc.)

      const local = localByLink.get(normLink(url))
      const bagyPrice = product.offers?.price != null ? Number(product.offers.price) : null
      const bagyName = product.name || ''
      const bagyStock = product.offers?.availability?.includes('InStock') ? 'in_stock' : 'out_of_stock'

      if (!local) {
        rows.push({
          run_id: runId, url, status: 'missing_in_catalog',
          bagy_name: bagyName, bagy_price: bagyPrice, bagy_sku: String(product.sku || ''), bagy_stock: bagyStock,
        })
        continue
      }

      const localPrice = priceOf(local)
      const priceDiff = localPrice != null && bagyPrice != null && Math.abs(localPrice - bagyPrice) > 0.01
      const nameDiff = local.nome && bagyName && local.nome.trim().toLowerCase() !== bagyName.trim().toLowerCase()

      if (priceDiff || nameDiff) {
        const diffKind = nameDiff && !priceDiff ? classifyNameDiff(bagyName, local.nome) : 'real'
        rows.push({
          run_id: runId, url, status: priceDiff && nameDiff ? 'price_and_name_diff' : priceDiff ? 'price_diff' : 'name_diff',
          bagy_name: bagyName, bagy_price: bagyPrice, bagy_sku: String(product.sku || ''), bagy_stock: bagyStock,
          catalog_id: local.id, catalog_name: local.nome, catalog_price: localPrice,
          diff_kind: diffKind,
        })
      }
    }

    await logRows(rows)

    return res.status(200).json({
      done: offset + limit >= sitemapUrls.length,
      totalUrls: sitemapUrls.length,
      processed: offset + batch.length,
      nextOffset: offset + limit,
      foundDivergences: rows.length,
    })
  } catch (err) {
    console.error('[bagy-audit] erro:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
