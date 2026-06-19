import { getAllProducts } from './catalog'

// ─── Catálogo local ───

function loadCatalog() {
  try {
    const stored = localStorage.getItem('products_catalog')
    if (stored) return JSON.parse(stored)
  } catch { /* fallback */ }
  return getAllProducts()
}

function hostnameOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

function trainingHasProduct(name, trainings = []) {
  const n = (name || '').toLowerCase().trim()
  if (!n) return false
  return trainings.some(t => (t.text || t.website || '').toLowerCase().includes(n))
}

// ─── Gera conteúdo markdown formatado ───

function buildFileContent(products) {
  const lines = [
    `# Base de Conhecimento — Prime Store`,
    `> Gerado em ${new Date().toLocaleString('pt-BR')}`,
    `> Total: ${products.length} produtos`,
    ``,
  ]

  for (const p of products) {
    lines.push(`---`)
    lines.push(``)
    lines.push(`## [PRODUTO] ${p.nome}`)
    lines.push(``)
    lines.push(`**Nome:** ${p.nome}`)
    if (p.link)   lines.push(`**Link:** ${p.link}`)
    if (p.imagem) lines.push(`**Imagem:** ${p.imagem}`)
    lines.push(`**Disponível:** Sim`)
    lines.push(``)
    lines.push(`### [PREÇO] ${p.nome}`)
    lines.push(``)
    lines.push(`**Produto:** ${p.nome}`)
    lines.push(`**Preço:** ${p.preco || 'Consultar'}`)
    lines.push(``)
  }

  return lines.join('\n')
}

// ─── Orquestrador principal ───

export async function extractAndSaveKnowledge(url, onProgress, existingTrainings = []) {
  const log = msg => onProgress?.({ msg })

  log('Buscando produtos no catálogo...')
  const host = hostnameOf(url)
  const catalog = loadCatalog()

  const matching = host
    ? catalog.filter(p => (p.link || '').includes(host))
    : catalog

  if (matching.length === 0) {
    throw new Error('Nenhum produto no catálogo para este site. Use o menu "Extrator" primeiro para importar os produtos.')
  }

  const novos = matching.filter(p => !trainingHasProduct(p.nome, existingTrainings))
  const todos = novos.length > 0 ? novos : matching

  if (novos.length === 0) {
    log(`Todos os ${matching.length} produtos já estão no conhecimento. Gerando arquivo com todos mesmo assim...`)
  } else {
    log(`${novos.length} produtos encontrados. Gerando arquivo .md...`)
  }

  const fileContent = buildFileContent(todos)
  log(`Arquivo gerado com ${todos.length} produtos (${fileContent.length} caracteres).`)

  return {
    produtos_encontrados: todos.length,
    blocos_salvos: 0,
    blocos_erro: 0,
    fonte: 'catálogo',
    saved: todos.map(p => ({ nome: p.nome, cat: 'PRODUTO' })),
    errors: [],
    url,
    fileContent,
  }
}
