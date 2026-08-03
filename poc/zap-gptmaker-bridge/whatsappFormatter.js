// PRIME Bridge — whatsappFormatter.js (UX-2, v1 conservador)
//
// Função pura: recebe o texto já pronto da Conversation API e devolve o
// mesmo texto com espaçamento mais legível no WhatsApp — nunca decide
// conteúdo, nunca reordena, nunca resume, nunca altera uma palavra sequer.
// Mesmo espírito de contextBuilder.js/continuationDetector.js: síncrono,
// sem I/O, sem env, sem chamada externa, testável isoladamente.
//
// Só duas transformações, ambas sobre a fronteira ENTRE linhas (nunca
// dentro de uma linha): normalizar excesso de linhas vazias e inserir uma
// linha em branco nas transições explicitamente autorizadas abaixo.

const LIST_ITEM_RE = /^\s*(\d+[.)]|[-•])\s+/
// Aceita URL isolada, com emoji, com rótulo "Link:" (com ou sem emoji) —
// só classifica a linha, nunca edita o conteúdo (a URL/rótulo permanecem
// byte a byte na saída).
const LINK_LINE_RE = /^\s*(🔗\s*)?(link\s*:\s*)?https?:\/\/\S+\s*$/i
// Linha inteira (já trimada) no formato *texto* — nunca adiciona/remove
// asterisco, só reconhece o padrão já presente na linha.
const PRODUCT_TITLE_RE = /^\*[^*]+\*$/

function isBlankLine(line) {
  return line.trim() === ''
}

// Checada depois de LIST_ITEM: um item de lista com preço embutido
// (ex.: "1. Avelã — R$ 499,00") continua LIST_ITEM, nunca vira PRICE_LINE.
function isPriceLine(line) {
  if (line.includes('💳') || line.includes('💰')) return true
  const inicioMinusculo = line.replace(/^\s+/, '').toLowerCase()
  return inicioMinusculo.startsWith('cartão') || inicioMinusculo.startsWith('pix')
}

function classifyLine(line) {
  if (LIST_ITEM_RE.test(line)) return 'LIST_ITEM'
  if (isPriceLine(line)) return 'PRICE_LINE'
  if (LINK_LINE_RE.test(line)) return 'LINK_LINE'
  if (PRODUCT_TITLE_RE.test(line.trim())) return 'PRODUCT_TITLE'
  return 'TEXT'
}

// Único conjunto de transições que insere linha em branco — desenho
// aprovado explicitamente (v1 conservador): TEXT→TEXT nunca insere, mesmo
// que pareça "feio" em alguns casos — evita separar frases do mesmo bloco
// lógico, que era o risco identificado na auditoria.
const TRANSICOES_AUTORIZADAS = new Set([
  'TEXT>LIST_ITEM',
  'LIST_ITEM>TEXT',
  'TEXT>LINK_LINE',
  'PRICE_LINE>LINK_LINE',
  'LINK_LINE>TEXT',
  'PRICE_LINE>PRICE_LINE',
  'TEXT>PRODUCT_TITLE',
  'PRODUCT_TITLE>PRICE_LINE',
])

// Só sequências de 3+ linhas vazias viram 1 — 1 ou 2 linhas vazias já
// existentes são preservadas exatamente como vieram (nunca removidas,
// nunca colapsadas para 1 se já eram 2).
function colapsarLinhasVaziasEmExcesso(linhas) {
  const resultado = []
  let i = 0
  while (i < linhas.length) {
    if (isBlankLine(linhas[i])) {
      let j = i
      while (j < linhas.length && isBlankLine(linhas[j])) j++
      const tamanhoDoRun = j - i
      if (tamanhoDoRun >= 3) {
        resultado.push('')
      } else {
        for (let k = i; k < j; k++) resultado.push(linhas[k])
      }
      i = j
    } else {
      resultado.push(linhas[i])
      i++
    }
  }
  return resultado
}

// Só decide inserir quando as duas linhas estão diretamente adjacentes
// (zero linha vazia entre elas) — se já existe separação, nunca duplica.
function inserirLinhasEmBrancoAutorizadas(linhas) {
  const resultado = []
  for (let i = 0; i < linhas.length; i++) {
    resultado.push(linhas[i])
    const atual = linhas[i]
    const proxima = linhas[i + 1]
    if (proxima === undefined) continue
    if (isBlankLine(atual) || isBlankLine(proxima)) continue

    const chave = `${classifyLine(atual)}>${classifyLine(proxima)}`
    if (TRANSICOES_AUTORIZADAS.has(chave)) {
      resultado.push('')
    }
  }
  return resultado
}

/**
 * @param {unknown} texto — texto já produzido pela Conversation API
 * @returns {unknown} mesmo texto, com espaçamento entre linhas normalizado
 *   — entrada não-string é devolvida sem alteração (nunca lança, nunca
 *   inventa conteúdo, mesmo padrão defensivo de contextBuilder.js).
 */
export function formatarParaWhatsApp(texto) {
  if (typeof texto !== 'string') return texto

  const linhas = texto.split('\n')
  const semExcesso = colapsarLinhasVaziasEmExcesso(linhas)
  const comEspacamento = inserirLinhasEmBrancoAutorizadas(semExcesso)

  return comEspacamento.join('\n')
}
