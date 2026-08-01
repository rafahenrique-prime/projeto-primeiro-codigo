/**
 * api/_nexClientes.js
 *
 * Helper privado para sincronização de clientes NEX com Supabase.
 * Implementa idempotência via content_hash, rastreabilidade via nex_sync_eventos,
 * e isolamento total de Base44.
 *
 * ===== ACESSO AO SUPABASE =====
 * REST direto via fetch (mesmo padrão de api/_profileLearning.js e
 * qwenHealthSupabaseHeaders() em system-tools.js) — nunca @supabase/supabase-js,
 * nunca createClient do @base44/sdk. Header usado: só `apikey` (Authorization
 * Bearer não é necessário com a Secret key, já confirmado empiricamente nesses
 * dois pontos de referência). `supabaseConfig` é um objeto simples
 * `{ baseUrl, headers }` — nunca um client de SDK.
 *
 * ===== EXPORTS (PÚBLICOS) =====
 * - processarLote(supabaseConfig, clientes, options)
 *   Processa array de clientes NEX, retorna array de resultados.
 *   Respeita limite de maxRegistros (default 500), não-bloqueante (erros por item).
 *
 * - upsertNexCliente(supabaseConfig, clienteNormalizado, metadata)
 *   Upsert atômico de um cliente (origin_loja + nex_codigo).
 *   Escreve nex_sync_eventos se tipo != 'sem_alteracao'.
 *
 * - obterClienteComEventos(supabaseConfig, origem_loja, nex_codigo)
 *   Busca um cliente + últimos 5 eventos. Retorna null se não encontrado.
 *
 * - obterAgregados(supabaseConfig)
 *   Contagens agregadas (sem PII) para o endpoint nex-health.
 *
 * ===== FUNÇÕES INTERNAS (PRIVADAS) =====
 * - validarLinha(cliente)
 * - truncarObservacao(texto, maxChars)
 * - calcularContentHash(cliente)
 * - classificarTipo(hashAnterior, hashNovo)
 * - normalizarCliente(clienteRaw)
 * - obterClienteExistente(supabaseConfig, origem_loja, nex_codigo)
 * - montarUrl / restRequest / parseContagem (helpers REST genéricos)
 *
 * Todas as funções de validação/normalização são puras (sem side-effects).
 * Usa SUPABASE_SECRET_KEY (via supabaseConfig.headers) para acesso service_role
 * (RLS zero-policy nas tabelas nex_clientes/nex_sync_eventos).
 * Nunca loga PII; apenas nex_codigo, origem_loja, tipo.
 */

import crypto from 'crypto';

/**
 * INTERNALS: Validação básica de linha (origem_loja, nex_codigo, nome obrigatórios)
 */
function validarLinha(cliente) {
  if (!cliente || typeof cliente !== 'object') {
    return { valido: false, erro: 'Cliente não é um objeto' };
  }

  if (!cliente.origem_loja || typeof cliente.origem_loja !== 'string' || cliente.origem_loja.trim() === '') {
    return { valido: false, erro: 'origem_loja obrigatório' };
  }

  if (!cliente.nex_codigo || typeof cliente.nex_codigo !== 'string' || cliente.nex_codigo.trim() === '') {
    return { valido: false, erro: 'nex_codigo obrigatório' };
  }

  if (!cliente.nome || typeof cliente.nome !== 'string' || cliente.nome.trim() === '') {
    return { valido: false, erro: 'nome obrigatório' };
  }

  return { valido: true };
}

/**
 * INTERNALS: Trunca observacao_original a maxChars (defesa em profundidade)
 */
function truncarObservacao(texto, maxChars = 500) {
  if (!texto || typeof texto !== 'string') {
    return null;
  }
  if (texto.length <= maxChars) {
    return texto;
  }
  return texto.substring(0, maxChars);
}

/**
 * INTERNALS: SHA256 hash de payload normalizado (determinístico)
 * Exclui origem_loja, nex_codigo (parte da chave natural).
 * Inclui todos os outros campos, normalizados (trim, lowercase pra strings).
 */
function calcularContentHash(cliente) {
  const payload = {
    nome: (cliente.nome || '').trim().toLowerCase(),
    cpf_cnpj: (cliente.cpf_cnpj || '').trim().toLowerCase(),
    telefone: (cliente.telefone || '').trim().toLowerCase(),
    celular: (cliente.celular || '').trim().toLowerCase(),
    email: (cliente.email || '').trim().toLowerCase(),
    endereco: (cliente.endereco || '').trim().toLowerCase(),
    saldo_debito_nex: cliente.saldo_debito_nex ?? null,
    saldo_credito_nex: cliente.saldo_credito_nex ?? null,
    valor_liquido_nex: cliente.valor_liquido_nex ?? null,
    data_snapshot: cliente.data_snapshot ?? null,
    observacao_original: (cliente.observacao_original || '').trim().toLowerCase(),
    metadados: cliente.metadados ?? {},
  };

  const jsonString = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash('sha256').update(jsonString).digest('hex');
}

/**
 * INTERNALS: Classifica tipo de evento (criado, atualizado, sem_alteracao)
 */
function classificarTipo(hashAnterior, hashNovo) {
  if (!hashAnterior) {
    return 'criado';
  }
  if (hashAnterior === hashNovo) {
    return 'sem_alteracao';
  }
  return 'atualizado';
}

/**
 * INTERNALS: Normaliza cliente (whitelist de campos, trim, truncação)
 */
function normalizarCliente(clienteRaw) {
  const cliente = {
    origem_loja: (clienteRaw.origem_loja || '').trim(),
    nex_codigo: (clienteRaw.nex_codigo || '').trim(),
    nome: (clienteRaw.nome || '').trim(),
    cpf_cnpj: clienteRaw.cpf_cnpj ? (clienteRaw.cpf_cnpj || '').trim() : null,
    telefone: clienteRaw.telefone ? (clienteRaw.telefone || '').trim() : null,
    celular: clienteRaw.celular ? (clienteRaw.celular || '').trim() : null,
    email: clienteRaw.email ? (clienteRaw.email || '').trim() : null,
    endereco: clienteRaw.endereco ? (clienteRaw.endereco || '').trim() : null,
    saldo_debito_nex: clienteRaw.saldo_debito_nex ?? null,
    saldo_credito_nex: clienteRaw.saldo_credito_nex ?? null,
    valor_liquido_nex: clienteRaw.valor_liquido_nex ?? null,
    data_snapshot: clienteRaw.data_snapshot ?? null,
    observacao_original: truncarObservacao(clienteRaw.observacao_original),
    metadados: clienteRaw.metadados && typeof clienteRaw.metadados === 'object' ? clienteRaw.metadados : {},
  };

  return cliente;
}

/**
 * INTERNALS: monta URL do REST do Supabase com query params
 */
function montarUrl(supabaseConfig, tabela, queryParams = {}) {
  const url = new URL(`${supabaseConfig.baseUrl}/rest/v1/${tabela}`);
  for (const [key, val] of Object.entries(queryParams)) {
    if (val !== undefined && val !== null) {
      url.searchParams.set(key, val);
    }
  }
  return url.toString();
}

/**
 * INTERNALS: executa fetch contra o REST do Supabase, com tratamento de erro
 * uniforme (rede + resposta não-ok), igual ao restante do projeto.
 */
async function restRequest(supabaseConfig, url, options = {}) {
  let res;
  try {
    res = await fetch(url, {
      ...options,
      headers: { ...supabaseConfig.headers, ...(options.headers || {}) },
    });
  } catch (err) {
    throw new Error(`Falha de rede ao acessar Supabase: ${err.message}`);
  }

  if (!res.ok) {
    let detalhe = '';
    try {
      detalhe = await res.text();
    } catch {
      // ignora — segue só com o status
    }
    throw new Error(`Supabase REST retornou ${res.status}${detalhe ? `: ${detalhe}` : ''}`);
  }

  return res;
}

/**
 * INTERNALS: extrai contagem total do header Content-Range (Prefer: count=exact)
 */
function parseContagem(res) {
  const contentRange = res.headers.get('content-range');
  const total = parseInt(contentRange?.split('/')[1] || '0', 10);
  return Number.isFinite(total) ? total : 0;
}

/**
 * INTERNALS: Busca cliente existente no Supabase via REST (GET com filtros)
 */
async function obterClienteExistente(supabaseConfig, origem_loja, nex_codigo) {
  const url = montarUrl(supabaseConfig, 'nex_clientes', {
    origem_loja: `eq.${origem_loja}`,
    nex_codigo: `eq.${nex_codigo}`,
    select: 'id,content_hash',
    limit: '1',
  });

  try {
    const res = await restRequest(supabaseConfig, url, { method: 'GET' });
    const data = await res.json();
    return data[0] || null;
  } catch (err) {
    console.error('[obterClienteExistente] Erro ao buscar cliente', {
      nex_codigo,
      origem_loja,
      message: err.message,
    });
    throw err;
  }
}

/**
 * PUBLIC EXPORT: Upsert atômico de cliente + evento, via REST
 * Escreve nex_sync_eventos se tipo != 'sem_alteracao'
 */
async function upsertNexCliente(supabaseConfig, clienteNormalizado, metadata = {}) {
  const { loteId, correlationId } = metadata;

  try {
    // 1. Obter cliente existente
    const existente = await obterClienteExistente(
      supabaseConfig,
      clienteNormalizado.origem_loja,
      clienteNormalizado.nex_codigo
    );

    // 2. Calcular hash novo
    const hashNovo = calcularContentHash(clienteNormalizado);
    const hashAnterior = existente ? existente.content_hash : null;

    // 3. Classificar tipo
    const tipo = classificarTipo(hashAnterior, hashNovo);

    // 4. Upsert cliente (POST + Prefer: resolution=merge-duplicates, on_conflict
    //    na chave natural — a PK é `id` uuid, não origem_loja+nex_codigo)
    const payloadCliente = {
      origem_loja: clienteNormalizado.origem_loja,
      nex_codigo: clienteNormalizado.nex_codigo,
      nome: clienteNormalizado.nome,
      cpf_cnpj: clienteNormalizado.cpf_cnpj,
      telefone: clienteNormalizado.telefone,
      celular: clienteNormalizado.celular,
      email: clienteNormalizado.email,
      endereco: clienteNormalizado.endereco,
      saldo_debito_nex: clienteNormalizado.saldo_debito_nex,
      saldo_credito_nex: clienteNormalizado.saldo_credito_nex,
      valor_liquido_nex: clienteNormalizado.valor_liquido_nex,
      data_snapshot: clienteNormalizado.data_snapshot,
      observacao_original: clienteNormalizado.observacao_original,
      metadados: clienteNormalizado.metadados,
      content_hash: hashNovo,
    };

    const urlUpsert = montarUrl(supabaseConfig, 'nex_clientes', {
      on_conflict: 'origem_loja,nex_codigo',
    });

    const resUpsert = await restRequest(supabaseConfig, urlUpsert, {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(payloadCliente),
    });

    const linhasUpsert = await resUpsert.json();
    if (!Array.isArray(linhasUpsert) || linhasUpsert.length === 0) {
      throw new Error('Upsert não retornou nenhuma linha (Prefer: return=representation esperado)');
    }
    const clienteData = linhasUpsert[0];

    // 5. Escrever evento (apenas se mudança)
    if (tipo !== 'sem_alteracao') {
      const eventoData = {
        lote_id: loteId || 'sem-lote',
        correlation_id: correlationId || null,
        origem_loja: clienteNormalizado.origem_loja,
        nex_codigo: clienteNormalizado.nex_codigo,
        tipo,
        valor_anterior: hashAnterior ? { content_hash: hashAnterior } : null,
        valor_novo: { content_hash: hashNovo },
      };

      const urlEvento = montarUrl(supabaseConfig, 'nex_sync_eventos');
      await restRequest(supabaseConfig, urlEvento, {
        method: 'POST',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify(eventoData),
      });
    }

    return {
      sucesso: true,
      id: clienteData.id,
      tipo,
      nex_codigo: clienteNormalizado.nex_codigo,
      origem_loja: clienteNormalizado.origem_loja,
    };
  } catch (err) {
    console.error('[upsertNexCliente] Erro ao upsert', {
      nex_codigo: clienteNormalizado.nex_codigo,
      origem_loja: clienteNormalizado.origem_loja,
      message: err.message,
    });
    throw err;
  }
}

/**
 * PUBLIC EXPORT: Processa lote de clientes
 * Respeita maxRegistros, não-bloqueante (erros por item)
 */
async function processarLote(supabaseConfig, clientes, options = {}) {
  const { loteId, correlationId, maxRegistros = 500 } = options;

  // Validar limite
  if (clientes.length > maxRegistros) {
    return {
      sucesso: false,
      erro: `Lote excede limite de ${maxRegistros} registros (enviado: ${clientes.length})`,
      resultados: [],
    };
  }

  const resultados = [];

  for (const clienteRaw of clientes) {
    try {
      // 1. Validar linha
      const validacao = validarLinha(clienteRaw);
      if (!validacao.valido) {
        resultados.push({
          sucesso: false,
          erro: validacao.erro,
          nex_codigo: clienteRaw.nex_codigo || 'desconhecido',
          origem_loja: clienteRaw.origem_loja || 'desconhecida',
        });
        continue;
      }

      // 2. Normalizar
      const clienteNormalizado = normalizarCliente(clienteRaw);

      // 3. Upsert
      const resultado = await upsertNexCliente(supabaseConfig, clienteNormalizado, {
        loteId,
        correlationId,
      });

      resultados.push(resultado);
    } catch (err) {
      resultados.push({
        sucesso: false,
        erro: err.message,
        nex_codigo: clienteRaw.nex_codigo || 'desconhecido',
        origem_loja: clienteRaw.origem_loja || 'desconhecida',
      });
    }
  }

  return {
    sucesso: true,
    totalProcessados: resultados.length,
    totalSucesso: resultados.filter((r) => r.sucesso).length,
    totalErro: resultados.filter((r) => !r.sucesso).length,
    resultados,
  };
}

/**
 * PUBLIC EXPORT: Busca cliente + últimos 5 eventos via REST.
 * Retorna null se o cliente não existir (sem distinguir erro de "não encontrado",
 * já que uma consulta REST filtrada simplesmente devolve array vazio).
 */
async function obterClienteComEventos(supabaseConfig, origem_loja, nex_codigo) {
  try {
    const urlCliente = montarUrl(supabaseConfig, 'nex_clientes', {
      origem_loja: `eq.${origem_loja}`,
      nex_codigo: `eq.${nex_codigo}`,
      select: 'id,origem_loja,nex_codigo,nome,created_at,updated_at,ausente_desde',
      limit: '1',
    });

    const resCliente = await restRequest(supabaseConfig, urlCliente, { method: 'GET' });
    const clientesEncontrados = await resCliente.json();
    const cliente = Array.isArray(clientesEncontrados) ? clientesEncontrados[0] || null : null;

    if (!cliente) {
      return null;
    }

    const urlEventos = montarUrl(supabaseConfig, 'nex_sync_eventos', {
      origem_loja: `eq.${origem_loja}`,
      nex_codigo: `eq.${nex_codigo}`,
      select: 'tipo,created_at,lote_id',
      order: 'created_at.desc',
      limit: '5',
    });

    const resEventos = await restRequest(supabaseConfig, urlEventos, { method: 'GET' });
    const eventos = await resEventos.json();

    return { cliente, eventos: Array.isArray(eventos) ? eventos : [] };
  } catch (err) {
    console.error('[obterClienteComEventos] Erro ao buscar cliente com eventos', {
      nex_codigo,
      origem_loja,
      message: err.message,
    });
    throw err;
  }
}

/**
 * PUBLIC EXPORT: Agregados (contagens, sem PII) para o endpoint nex-health.
 * 5 consultas REST paralelas com Prefer: count=exact, mesmo padrão já usado em
 * cron-diagnosis.js/imageReviewService.js/messageHistoryService.js.
 */
async function obterAgregados(supabaseConfig) {
  try {
    const agora = Date.now();
    const desde24h = new Date(agora - 24 * 60 * 60 * 1000).toISOString();
    const desde1h = new Date(agora - 60 * 60 * 1000).toISOString();

    const countHeaders = { 'Prefer': 'count=exact' };

    const [resClientes, resEventos, resHoje, resHora, resAusentes] = await Promise.all([
      restRequest(supabaseConfig, montarUrl(supabaseConfig, 'nex_clientes', { select: 'id' }), {
        method: 'GET',
        headers: countHeaders,
      }),
      restRequest(supabaseConfig, montarUrl(supabaseConfig, 'nex_sync_eventos', { select: 'id' }), {
        method: 'GET',
        headers: countHeaders,
      }),
      restRequest(
        supabaseConfig,
        montarUrl(supabaseConfig, 'nex_sync_eventos', { select: 'id', created_at: `gte.${desde24h}` }),
        { method: 'GET', headers: countHeaders }
      ),
      restRequest(
        supabaseConfig,
        montarUrl(supabaseConfig, 'nex_sync_eventos', { select: 'id', created_at: `gte.${desde1h}` }),
        { method: 'GET', headers: countHeaders }
      ),
      restRequest(
        supabaseConfig,
        montarUrl(supabaseConfig, 'nex_clientes', { select: 'id', ausente_desde: 'not.is.null' }),
        { method: 'GET', headers: countHeaders }
      ),
    ]);

    return {
      total_clientes: parseContagem(resClientes),
      total_eventos: parseContagem(resEventos),
      eventos_hoje: parseContagem(resHoje),
      eventos_ultima_hora: parseContagem(resHora),
      clientes_ausentes: parseContagem(resAusentes),
    };
  } catch (err) {
    console.error('[obterAgregados] Erro ao consultar agregados NEX', { message: err.message });
    throw err;
  }
}

// Exports: apenas funções públicas
export {
  processarLote,
  upsertNexCliente,
  obterClienteComEventos,
  obterAgregados,
};
