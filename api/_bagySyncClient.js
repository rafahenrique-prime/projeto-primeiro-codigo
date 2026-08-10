/**
 * api/_bagySyncClient.js
 *
 * Camada de LEITURA da Bagy/Dooca — só isso. Não conhece Supabase, não mapeia
 * campos, não decide nada. Recebe um link (ou monta um a partir de um slug) e
 * devolve o objeto window.dooca.product já parseado, exatamente como a auditoria
 * e a POC validaram (mesma técnica de poc/bagy-dooca-catalog-poc/snapshot-one.mjs):
 * HTTP GET simples + casamento de chaves no texto, sem navegador, sem JS.
 *
 * Prefixo "_" — helper privado, mesmo padrão de _consultarCep.js etc.
 */

const STORE_URL = process.env.BAGY_STORE_URL || 'https://www.primestoremen.com.br'

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9',
}

function extractDoocaProduct(html) {
  const marker = 'product: {'
  const idx = html.indexOf(marker)
  if (idx === -1) return { ok: false, reason: 'marker "product: {" não encontrado' }

  const start = idx + marker.length - 1
  let depth = 0
  let inString = false
  let stringChar = null
  let escaped = false
  let end = -1

  for (let i = start; i < html.length; i++) {
    const ch = html[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === stringChar) inString = false
      continue
    }
    if (ch === '"' || ch === "'") { inString = true; stringChar = ch; continue }
    if (ch === '{') depth++
    else if (ch === '}') { depth--; if (depth === 0) { end = i + 1; break } }
  }

  if (end === -1) return { ok: false, reason: 'chaves não fecharam' }

  try {
    return { ok: true, product: JSON.parse(html.slice(start, end)) }
  } catch (e) {
    return { ok: false, reason: 'JSON.parse falhou: ' + e.message }
  }
}

/**
 * Busca um produto na Bagy por URL completa OU por slug (relativo).
 * Não aceita bagy_product_id diretamente — a Dooca não expõe um endpoint
 * público de "GET produto por id", só por URL. Quem tem só o id precisa
 * resolver o link antes (ex.: via a própria tabela products, que já
 * guarda o link do produto).
 */
export async function fetchBagyProductByLink(link) {
  const url = link.startsWith('http') ? link : `${STORE_URL}/${link.replace(/^\//, '')}`
  const t0 = Date.now()
  let res, html
  try {
    res = await fetch(url, { headers: BROWSER_HEADERS })
    html = await res.text()
  } catch (e) {
    return { ok: false, url, httpStatus: null, httpMs: Date.now() - t0, reason: 'fetch falhou: ' + e.message }
  }
  const httpMs = Date.now() - t0
  if (res.status !== 200) {
    return { ok: false, url, httpStatus: res.status, httpMs, reason: `HTTP ${res.status}` }
  }
  const vendaIlimitadaNoTexto = /venda ilimitada/i.test(html)
  const extraction = extractDoocaProduct(html)
  if (!extraction.ok) {
    return { ok: false, url, httpStatus: res.status, httpMs, reason: extraction.reason }
  }
  return {
    ok: true,
    url,
    httpStatus: res.status,
    httpMs,
    vendaIlimitadaNoTexto,
    product: extraction.product,
  }
}

/**
 * Normaliza um link pra comparação estável entre fontes (listagem da Bagy e
 * `products.link` do Supabase): domínio absoluto consistente (usa STORE_URL
 * quando o link vem relativo), sem trailing slash, sem query string/hash,
 * minúsculo. Sem isso, uma mesma URL escrita de formas diferentes nas duas
 * fontes geraria um falso "produto novo" na comparação de Set.
 */
export function normalizeLink(url) {
  if (!url) return ''
  const full = url.startsWith('http') ? url : `${STORE_URL}/${url.replace(/^\//, '')}`
  try {
    const u = new URL(full)
    const path = u.pathname.replace(/\/$/, '')
    return (u.origin + path).toLowerCase()
  } catch {
    return full.replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase()
  }
}

/**
 * Descobre o catálogo atual da Bagy paginando `/produtos?page=N` até uma
 * página sem cards (fim natural) ou até `maxPages` (rede de segurança contra
 * loop infinito caso a Bagy mude o comportamento de paginação — nunca deve
 * ser atingido no uso normal, ~23 páginas hoje). Reaproveita
 * `fetchProdutosPaginaListagem` (já existente) — só adiciona o loop que
 * faltava. Cada card é 1 variação de produto (mesmo link repetido várias
 * vezes) — devolve só links ÚNICOS, já normalizados.
 */
export async function descobrirCatalogoBagy({ maxPages = 60, delayMs = 150 } = {}) {
  const linksSet = new Set()
  let paginasLidas = 0
  for (let page = 1; page <= maxPages; page++) {
    const { ok, cards } = await fetchProdutosPaginaListagem(page)
    paginasLidas++
    if (!ok || cards.length === 0) break
    for (const c of cards) {
      if (c.url) linksSet.add(normalizeLink(c.url))
    }
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))
  }
  return { links: [...linksSet], paginasLidas }
}

export async function fetchProdutosPaginaListagem(page) {
  const url = `${STORE_URL}/produtos?page=${page}`
  const t0 = Date.now()
  const res = await fetch(url, { headers: BROWSER_HEADERS })
  const html = await res.text()
  const httpMs = Date.now() - t0
  const cards = []
  const blocks = html.split('class="product-card')
  for (let i = 1; i < blocks.length; i++) {
    const chunk = blocks[i].slice(0, 1200)
    const url2 = /data-product-url="([^"]*)"/.exec(chunk)?.[1] ?? null
    const variationId = /data-product-variation-id="([^"]*)"/.exec(chunk)?.[1] ?? null
    if (url2 && !url2.includes('${') && (url2.startsWith('/') || url2.startsWith('http'))) {
      cards.push({ url: url2, variationId })
    }
  }
  return { ok: res.status === 200, httpStatus: res.status, httpMs, cards }
}
