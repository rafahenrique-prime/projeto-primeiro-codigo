// Normalização canônica de nome de produto — fonte única usada tanto para SALVAR
// (grafia corrigida) quanto para BUSCAR/COMPARAR/VALIDAR DUPLICATA em todo o domínio de
// catálogo. Antes deste arquivo existiam duas normalizações incompatíveis — uma corrigia
// grafia (usada só ao salvar), a outra só removia acento/caixa (usada só ao comparar) —
// isso fazia a checagem de duplicata falhar sempre que o nome de origem (ex.: painel
// Bagy) tinha uma grafia que o sistema corrige ao salvar (ex.: "Marron" → "Marrom"),
// criando duplicatas silenciosas a cada sincronização. Ver auditoria de 2026-07-29.

// Corrige grafia/acentuação — é o texto que efetivamente fica salvo no banco.
export function normalizarNomeProduto(nome) {
  if (!nome) return nome
  return nome
    .replace(/^Bone\b/i, 'Boné')
    .replace(/\bBone\b(?=\s+(New Era|Armani|Gucci|Dior|Boss|Burberry|Balenciaga|Philipp|Louis|Diesel|Versace|Armaf|Itals))/gi, 'Boné')
    .replace(/^Tenis\b/i, 'Tênis')
    .replace(/^Oculos\b/i, 'Óculos')
    .replace(/^Calcado\b/i, 'Calçado')
    .replace(/\bMarron\b/gi, 'Marrom')
    .replace(/\bImportada\b/gi, 'Importado')
    .trim()
}

// Chave de comparação — aplica a correção de grafia acima e ADICIONALMENTE remove
// acento/caixa/espaços extras, para comparação robusta. Usada só para decidir "é o mesmo
// produto?" (busca, validação de duplicata) — nunca para decidir o texto final salvo.
export function chaveComparacaoProduto(nome) {
  return normalizarNomeProduto(nome || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}
