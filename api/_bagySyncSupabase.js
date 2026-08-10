/**
 * api/_bagySyncSupabase.js
 *
 * Único ponto de acesso ao Supabase do sincronizador — leitura e escrita
 * pontual (nunca upsert em massa, nunca delete-all). Mesmo padrão REST cru
 * (apikey/Authorization + fetch) já usado em api/bagy-audit.js e
 * catalogSyncService.js, sem SDK novo.
 */

// Lidos em cada chamada (não em const de topo de módulo) — em ambiente
// serverless o env já está pronto no import, mas isso evita depender da
// ordem entre "carregar env" e "importar este módulo" em qualquer contexto
// (scripts, testes) que rode fora do runtime do Vercel.
function headers() {
  const key = process.env.VITE_SUPABASE_KEY
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
}

function rest(path) {
  return `${process.env.VITE_SUPABASE_URL}/rest/v1/${path}`
}

/**
 * Todas as linhas com esse link (nunca assume unicidade — link não tem
 * constraint UNIQUE em products, e duplicatas reais já foram encontradas no
 * catálogo). O caller decide como desambiguar (ver resolveProductRow em
 * _bagySyncService.js); nunca usar rows[0] direto aqui — a ordem de retorno
 * do Postgres sem ORDER BY não é estável entre chamadas.
 */
export async function getProductRowsByLink(link) {
  const res = await fetch(rest(`products?select=*&link=eq.${encodeURIComponent(link)}&order=id.asc`), { headers: headers() })
  if (!res.ok) throw new Error(`getProductRowsByLink ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function getProductByBagyId(bagyProductId) {
  const res = await fetch(rest(`products?select=*&bagy_product_id=eq.${bagyProductId}`), { headers: headers() })
  if (!res.ok) throw new Error(`getProductByBagyId ${res.status}: ${await res.text()}`)
  const rows = await res.json()
  return rows[0] || null
}

export async function getVariationsByProductId(productUuid) {
  const res = await fetch(rest(`product_variations?select=*&product_id=eq.${productUuid}`), { headers: headers() })
  if (!res.ok) throw new Error(`getVariationsByProductId ${res.status}: ${await res.text()}`)
  return res.json()
}

/** UPDATE pontual por id — nunca upsert em massa, nunca delete-all. */
export async function updateProductFields(productUuid, fields) {
  const res = await fetch(rest(`products?id=eq.${productUuid}`), {
    method: 'PATCH',
    headers: { ...headers(), Prefer: 'return=representation' },
    body: JSON.stringify(fields),
  })
  if (!res.ok) throw new Error(`updateProductFields ${res.status}: ${await res.text()}`)
  return res.json()
}

/** INSERT de variações novas (nunca upsert — chamador decide o que já existe). */
export async function insertVariationRows(rows) {
  if (rows.length === 0) return []
  const res = await fetch(rest('product_variations'), {
    method: 'POST',
    headers: { ...headers(), Prefer: 'return=representation' },
    body: JSON.stringify(rows),
  })
  if (!res.ok) throw new Error(`insertVariationRows ${res.status}: ${await res.text()}`)
  return res.json()
}

/**
 * UPDATE pontual de uma variação existente por id.
 * @deprecated não é mais chamado pelo orquestrador de escrita (ver
 * syncProductTransactional) — o UPDATE de produto e o INSERT de variação
 * feitos em duas chamadas REST separadas foi a causa do bug de escrita
 * parcial encontrado na primeira tentativa de write real. Mantido só porque
 * pode ser útil pra um ajuste manual pontual fora do fluxo do sincronizador;
 * não usar dentro de syncProduct/syncBatch.
 */
export async function updateVariationFields(variationUuid, fields) {
  const res = await fetch(rest(`product_variations?id=eq.${variationUuid}`), {
    method: 'PATCH',
    headers: { ...headers(), Prefer: 'return=representation' },
    body: JSON.stringify(fields),
  })
  if (!res.ok) throw new Error(`updateVariationFields ${res.status}: ${await res.text()}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// Escrita transacional (RPC) — único caminho usado pelo orquestrador em modo
// write. Usa SUPABASE_SECRET_KEY (a secret/service_role key deste projeto,
// nunca VITE_-prefixada, nunca lida fora daqui) porque a function do banco
// (public.bagy_sync_product_transaction,
// ver supabase/migrations/020_bagy_sync_product_transaction.sql) tem EXECUTE
// revogado de anon/authenticated de propósito — só service_role pode chamá-la.
// ---------------------------------------------------------------------------

function serviceHeaders() {
  // SUPABASE_SECRET_KEY = a "secret key" (antiga service_role) deste projeto,
  // já configurada no Vercel (Preview/Production). Nunca cair para a chave
  // anon — se a secret não estiver presente, é erro explícito, não um
  // fallback silencioso que reintroduziria o bug de permissão original.
  const key = process.env.SUPABASE_SECRET_KEY
  if (!key) {
    throw new Error(
      'SUPABASE_SECRET_KEY não configurada — escrita transacional em product_variations exige essa env var (sem prefixo VITE_). Sem fallback para a chave anon: a RPC exige service_role/secret key.'
    )
  }
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
}

/**
 * Único caminho de escrita real do sincronizador. Uma única chamada RPC que
 * roda public.bagy_sync_product_transaction — UPDATE de products + upsert de
 * todas as variações numa transação real do Postgres. Se qualquer variação
 * falhar (ex.: bagy_variation_id de outro produto), a function inteira levanta
 * exceção e o Postgres desfaz tudo, incluindo o UPDATE de products — nunca
 * fica escrita parcial.
 *
 * @param {{ productId: string, productFields: object, variations: object[] }} payload
 */
export async function syncProductTransactional({ productId, productFields, variations }) {
  const res = await fetch(rest('rpc/bagy_sync_product_transaction'), {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify({
      p_product_id: productId,
      p_product_fields: productFields,
      p_variations: variations,
    }),
  })
  if (!res.ok) {
    // A resposta de erro do PostgREST/Postgres nunca inclui o header
    // Authorization da requisição — só o corpo da mensagem de erro do banco,
    // que não contém a service_role key.
    throw new Error(`syncProductTransactional ${res.status}: ${await res.text()}`)
  }
  return res.json()
}

// ---------------------------------------------------------------------------
// Camada operacional (supabase/migrations/021_bagy_sync_operational_tables.sql)
// — logs persistentes (bagy_sync_runs) e fila de exceções (bagy_sync_exceptions).
// Escrita sempre via service_role (mesma razão da RPC: RLS revoga INSERT/UPDATE
// de anon/authenticated nessas duas tabelas de propósito). Falha aqui nunca deve
// esconder o resultado real do sync — quem chama decide como reportar o erro.
// ---------------------------------------------------------------------------

/** Grava 1 linha em bagy_sync_runs ao final de uma execução (dry_run ou write). */
export async function insertSyncRun(row) {
  const res = await fetch(rest('bagy_sync_runs'), {
    method: 'POST',
    headers: { ...serviceHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify(row),
  })
  if (!res.ok) throw new Error(`insertSyncRun ${res.status}: ${await res.text()}`)
  const rows = await res.json()
  return rows[0] || null
}

/** Busca a exceção já registrada para este link+tipo, se existir (chave UNIQUE). */
export async function getExceptionByLinkTipo(link, tipo) {
  const res = await fetch(
    rest(`bagy_sync_exceptions?select=*&link=eq.${encodeURIComponent(link)}&tipo=eq.${encodeURIComponent(tipo)}`),
    { headers: serviceHeaders() }
  )
  if (!res.ok) throw new Error(`getExceptionByLinkTipo ${res.status}: ${await res.text()}`)
  const rows = await res.json()
  return rows[0] || null
}

/** Cria uma exceção nova (status inicial sempre 'aberto' — nunca decidido pelo sincronizador). */
export async function insertException({ link, tipo, detalhe, runId }) {
  const res = await fetch(rest('bagy_sync_exceptions'), {
    method: 'POST',
    headers: { ...serviceHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({
      link,
      tipo,
      detalhe,
      run_id_ultima_deteccao: runId,
      status: 'aberto',
    }),
  })
  if (!res.ok) throw new Error(`insertException ${res.status}: ${await res.text()}`)
  const rows = await res.json()
  return rows[0] || null
}

/**
 * Atualiza só a "última vez que foi visto" de uma exceção já existente — nunca
 * toca em status/resolvido_em (essa transição é sempre manual, feita fora do
 * sincronizador).
 */
export async function touchException(id, { detalhe, runId }) {
  const res = await fetch(rest(`bagy_sync_exceptions?id=eq.${id}`), {
    method: 'PATCH',
    headers: { ...serviceHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({
      detalhe,
      run_id_ultima_deteccao: runId,
      ultima_deteccao: new Date().toISOString(),
    }),
  })
  if (!res.ok) throw new Error(`touchException ${res.status}: ${await res.text()}`)
  const rows = await res.json()
  return rows[0] || null
}
