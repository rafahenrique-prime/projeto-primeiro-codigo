/**
 * api/_catalogoContratoPrime.js
 *
 * CONTRATO CATÁLOGO PRIME — Etapa 1 (LAB/preview). Funções PURAS (sem I/O,
 * sem fetch, sem Supabase) das regras aprovadas na Etapa 0:
 *
 * - Disponibilidade: DISPONIVEL / ESGOTADO / A_CONFIRMAR / INDISPONIVEL
 *   (nunca mais 'SIM' fixo; active=null NUNCA confirma disponibilidade;
 *   sell_without_stock=true NUNCA vira "sob encomenda" automático — vira
 *   A_CONFIRMAR até existir regra comercial definitiva).
 *   (regra adicional de 2026-09-21: em produto comprovadamente SEM GRADE,
 *   active=null significa "não se aplica" e a disponibilidade se decide
 *   pelo estoque efetivo — ver resolveDisponibilidade).
 *
 * - Elegibilidade de oferta automática: produto sem preço NÃO é elegível.
 *   Produto sem imagem continua elegível, mas marcado (sem_imagem) para que
 *   nenhuma camada prometa/envie foto inexistente.
 * - Deduplicação por linha canônica: NUNCA apaga registros — só escolhe,
 *   de forma determinística e auditável, qual linha de um grupo de
 *   duplicidade a Gaby enxerga (1 por grupo).
 *
 * Tudo aqui é testado isoladamente em api/__tests__/catalogoContratoPrime.test.js.
 */

// Mesma normalização de api/webhook.js (normalizarBusca), duplicada de
// propósito pra manter este módulo sem dependência do handler HTTP. Se a
// normalização do webhook mudar, mudar aqui também (a chave de duplicidade
// precisa bater com a chave de busca).
export function normalizarChave(texto) {
  if (!texto) return ''
  return texto
    .toLowerCase()
    .trim()
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[ç]/g, 'c')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Estoque efetivo de uma variação: stock_real (sempre que existir — novo
// contrato) com fallback pro legado stock_quantity. null/undefined em ambos
// significa "desconhecido", NUNCA zero e NUNCA "tem estoque".
export function estoqueEfetivo(variation) {
  if (!variation) return null
  if (typeof variation.stock_real === 'number') return variation.stock_real
  if (typeof variation.stock_quantity === 'number') return variation.stock_quantity
  return null
}

/**
 * Contrato interno de disponibilidade (Etapa 0 aprovada):
 * - DISPONIVEL:   existe variação com active===true E estoque efetivo > 0.
 * - ESGOTADO:     sell_without_stock!==true, nenhuma variação confirmadamente
 *                 ativa com estoque, e existe evidência numérica de estoque
 *                 zerado (pelo menos 1 variação com estoque efetivo === 0 e
 *                 nenhuma com estoque > 0 / desconhecido com active=true).
 * - A_CONFIRMAR:  todo o resto — inclui sell_without_stock=true sem estoque
 *                 confirmado ("disponibilidade/prazo a confirmar", NUNCA
 *                 "sob encomenda" automático), active=null, estoque
 *                 desconhecido, produto sem variações.
 * - INDISPONIVEL: produto inativo ou sem dados mínimos de oferta (preço
 *                 ausente).
 */
export function resolveDisponibilidade(product, variations = []) {
  const p = product || {}
  const status = (p.status || '').toString().toLowerCase()
  if (status === 'inactive' || status === 'inativo') return 'INDISPONIVEL'
  if (p.preco == null || String(p.preco).trim() === '') return 'INDISPONIVEL'

  const vars = Array.isArray(variations) ? variations : []
  const sellOos = p.sell_without_stock === true

  // REGRA ADICIONAL APROVADA por Rafael em 2026-09-21 (Etapa 1): quando o
  // produto é COMPROVADAMENTE sem grade/sem atributo (todas as variações sem
  // nenhum atributo — shape real dos óculos/bonés/perfumes, onde a Dooca
  // entrega variation.attribute vazio), active=null significa "não se
  // aplica", NÃO "status desconhecido". Nesse caso a disponibilidade se
  // decide pelo estoque efetivo + sell_without_stock. Produtos COM grade
  // seguem a regra original: active=null nunca confirma disponibilidade.
  const semGrade = vars.length > 0 && vars.every(
    (v) => v.active == null && Object.keys(v.attributes || {}).length === 0
  )
  if (semGrade) {
    const estoques = vars.map((v) => estoqueEfetivo(v))
    if (estoques.some((e) => (e ?? 0) > 0)) return 'DISPONIVEL'
    if (sellOos) return 'A_CONFIRMAR'
    if (!estoques.some((e) => e === null)) return 'ESGOTADO'
    return 'A_CONFIRMAR'
  }

  const ativaComEstoque = vars.some((v) => v.active === true && (estoqueEfetivo(v) ?? 0) > 0)
  if (ativaComEstoque) return 'DISPONIVEL'

  if (sellOos) return 'A_CONFIRMAR'

  // Sem venda sem estoque: ESGOTADO exige evidência — todas as variações com
  // estoque conhecido estão zeradas E nenhuma variação fica em dúvida
  // (active=true sem número de estoque também é dúvida, não confirmação).
  if (vars.length > 0) {
    const algumEstoqueMaiorQueZero = vars.some((v) => (estoqueEfetivo(v) ?? 0) > 0)
    const algumDesconhecido = vars.some((v) => estoqueEfetivo(v) === null)
    if (!algumEstoqueMaiorQueZero && !algumDesconhecido) return 'ESGOTADO'
  }

  return 'A_CONFIRMAR'
}

/**
 * Elegibilidade pra oferta automática da Gaby (Etapa 0 aprovada):
 * - sem preço → NÃO elegível (nunca entra em oferta automática);
 * - sem imagem → elegível, mas marcada com sem_imagem=true pra nenhuma
 *   camada prometer/enviar foto inexistente.
 */
export function avaliarElegibilidadeOferta(product) {
  const p = product || {}
  const semPreco = p.preco == null || String(p.preco).trim() === ''
  const semImagem = p.imagem == null || String(p.imagem).trim() === ''
  return {
    elegivel: !semPreco,
    motivo: semPreco ? 'sem_preco' : null,
    sem_imagem: semImagem,
  }
}

/**
 * Escolhe a linha canônica de um grupo de duplicidades (mesmo nome
 * normalizado). Determinística e auditável — NUNCA apaga nada. Ordem de
 * critérios (do mais forte pro mais fraco):
 *  1) tem bagy_product_id (vínculo validado com a Bagy);
 *  2) source === 'bagy_sync' (linha gerida pelo sincronizador);
 *  3) tem preço;
 *  4) tem imagem;
 *  5) menor id (desempate estável).
 */
export function escolherLinhaCanonica(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null
  const score = (r) => [
    r.bagy_product_id != null ? 1 : 0,
    r.source === 'bagy_sync' ? 1 : 0,
    r.preco != null && String(r.preco).trim() !== '' ? 1 : 0,
    r.imagem != null && String(r.imagem).trim() !== '' ? 1 : 0,
  ]
  return [...rows].sort((a, b) => {
    const sa = score(a)
    const sb = score(b)
    for (let i = 0; i < sa.length; i++) {
      if (sb[i] !== sa[i]) return sb[i] - sa[i]
    }
    return String(a.id).localeCompare(String(b.id))
  })[0]
}

/**
 * GRUPOS DE DUPLICIDADE CONHECIDOS — tabela DECLARADA e auditável (Etapa 1,
 * ajuste final aprovado por Rafael em 2026-09-21). Agrupa duplicidades cujos
 * nomes NÃO são idênticos ("Cinza Claro / Cinza", "Preto / Preto II"), que a
 * igualdade exata de nome normalizado não captura.
 *
 * Regras da tabela:
 * - Cada entrada é um grupo com `grupo` (id estável), `motivo` (evidência da
 *   auditoria) e `nomes` (grafias humanas — normalizadas com normalizarChave
 *   na montagem do índice, então acento/caso/pontuação não importam).
 * - Adicionar/remover um par = editar ESTA tabela, com motivo. Nenhum
 *   registro é excluído nem mesclado em hipótese alguma — a tabela só muda
 *   QUAL linha a Gaby enxerga como canônica (1 por grupo).
 * - Pares sem evidência suficiente NÃO entram aqui por inferência — a
 *   auditoria do Rafael (2026-09) confirmou 7 pares; os 5 abaixo foram
 *   identificados sem ambiguidade nos dados atuais. "Boné New Era" tem a
 *   duplicidade LEG/B de mesmo nome (já coberta pela igualdade exata) e "CH
 *   Carolina Herrera" não tem par identificável no catálogo atual — ambos
 *   ficam para confirmação do Rafael antes de entrar na tabela.
 */
export const GRUPOS_DUPLICIDADE_CONHECIDOS = [
  {
    grupo: 'camisetas-on-running-treino-cinza',
    motivo: 'Auditoria Rafael 2026-09: "Cinza / Cinza Claro" é o mesmo produto (Bagy 10084131 e 10084148).',
    nomes: ['Camisetas On Runing Treino - Cinza', 'Camisetas On Runing Treino - Cinza Claro'],
  },
  {
    grupo: 'tenis-nike-dunk-tnf-preto',
    motivo: 'Auditoria Rafael 2026-09: "Preto / Preto II" é o mesmo produto (Bagy 8642057 e 8642056).',
    nomes: ['Tênis Nike Dunk Tnf Preto', 'Tênis Nike Dunk Tnf Preto Ii'],
  },
  {
    grupo: 'oculos-sol-retangular-fume',
    motivo: 'Auditoria Rafael 2026-09 (óculos fumê): "Fumê / Fumê II" é o mesmo produto (Bagy 7973316 e 7973313).',
    nomes: ['Óculos de Sol Retangular Fumê', 'Óculos de Sol Retangular Fumê Ii'],
  },
  {
    grupo: 'oculos-sol-flat-top-ambar',
    motivo: 'Auditoria Rafael 2026-09 (óculos âmbar): "Âmbar / Âmbar II" é o mesmo produto (Bagy 7973304 e 7973299).',
    nomes: ['Óculos de Sol Flat Top Âmbar', 'Óculos de Sol Flat Top Âmbar Ii'],
  },
  {
    grupo: 'bermuda-diesel-verde',
    motivo: 'Auditoria Rafael 2026-09 (Diesel verde): únicos dois produtos "Bermuda Diesel Verde*" do catálogo (Bagy 7618674 e 8895538).',
    nomes: ['Bermuda Diesel Verde', 'Bermuda Diesel Verde Musgo'],
  },
]

/**
 * Monta o índice chave-normalizada → grupo declarado. Determinístico: se a
 * mesma chave for declarada em dois grupos, o PRIMEIRO grupo declarado vence
 * e o conflito de declaração é reportado (nunca silenciado).
 */
export function montarIndiceGruposConhecidos(gruposConhecidos = GRUPOS_DUPLICIDADE_CONHECIDOS) {
  const indice = new Map()
  const conflitos = []
  for (const g of gruposConhecidos || []) {
    for (const nome of g.nomes || []) {
      const chave = normalizarChave(nome)
      if (!chave) continue
      const existente = indice.get(chave)
      if (existente && existente !== g.grupo) {
        conflitos.push({ chave, grupos: [existente, g.grupo] })
        continue
      }
      indice.set(chave, g.grupo)
    }
  }
  return { indice, conflitos }
}

/**
 * Agrupa um catálogo em grupos de duplicidade e devolve
 * { canonicas, grupos, conflitosDeclaracao }. `canonicas` é a lista que a
 * Gaby pode ver (1 linha por grupo); `grupos` registra TODOS os grupos com
 * mais de 1 linha pra auditoria/relatório — nenhum registro é apagado em
 * nenhuma hipótese.
 *
 * Chave de agrupamento (determinística):
 * - se o nome normalizado está num grupo declarado (duplicate_group
 *   conhecido, ex.: "Cinza Claro / Cinza"), a chave é `declarado:<grupo>`;
 * - senão, é `nome:<nome normalizado>` (igualdade exata normalizada).
 *
 * Cada grupo com >1 linha sai em `grupos` com: duplicate_group (a chave),
 * origem ('grupo_declarado' | 'nome_exato'), chaves (nomes normalizados,
 * ordenados), total, canonicaId e ids completos (ordenados). Canônica, ids
 * e chaves são independentes da ORDEM de entrada; a ordem dos grupos segue
 * a primeira aparição no catálogo. A canônica de um grupo com >1 linha é
 * anotada com o campo `duplicate_group`.
 */
export function deduplicarPorLinhaCanonica(products, opcoes = {}) {
  const { indice, conflitos } = montarIndiceGruposConhecidos(
    opcoes.gruposConhecidos ?? GRUPOS_DUPLICIDADE_CONHECIDOS
  )
  const gruposPorChave = new Map()
  for (const p of products || []) {
    const chave = normalizarChave(p.nome)
    if (!chave) continue
    const grupoDeclarado = indice.get(chave)
    const groupKey = grupoDeclarado ? `declarado:${grupoDeclarado}` : `nome:${chave}`
    if (!gruposPorChave.has(groupKey)) {
      gruposPorChave.set(groupKey, {
        origem: grupoDeclarado ? 'grupo_declarado' : 'nome_exato',
        chaves: new Set(),
        rows: [],
      })
    }
    const g = gruposPorChave.get(groupKey)
    g.chaves.add(chave)
    g.rows.push(p)
  }
  const canonicas = []
  const grupos = []
  for (const [groupKey, g] of gruposPorChave) {
    const canonica = escolherLinhaCanonica(g.rows)
    if (canonica) {
      canonicas.push(g.rows.length > 1 ? { ...canonica, duplicate_group: groupKey } : canonica)
    }
    if (g.rows.length > 1) {
      grupos.push({
        duplicate_group: groupKey,
        origem: g.origem,
        chaves: [...g.chaves].sort(),
        total: g.rows.length,
        canonicaId: canonica?.id ?? null,
        ids: g.rows.map((r) => r.id).sort(),
      })
    }
  }
  return { canonicas, grupos, conflitosDeclaracao: conflitos }
}
