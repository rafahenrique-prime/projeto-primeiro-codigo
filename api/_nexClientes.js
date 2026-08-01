/**
 * api/_nexClientes.js
 *
 * Helper privado para sincronização de clientes NEX com Supabase.
 * Implementa idempotência via content_hash, rastreabilidade via nex_sync_eventos,
 * e isolamento total de Base44.
 *
 * ===== EXPORTS (PÚBLICOS) =====
 * - processarLote(supabase, clientes, options)
 *   Processa array de clientes NEX, retorna array de resultados.
 *   Respeita limite de maxRegistros (default 500), não-bloqueante (erros por item).
 *
 * - upsertNexCliente(supabase, clienteNormalizado, metadata)
 *   Upsert atômico de um cliente (origin_loja + nex_codigo).
 *   Escreve nex_sync_eventos se tipo != 'sem_alteracao'.
 *
 * ===== FUNÇÕES INTERNAS (PRIVADAS) =====
 * - validarLinha(cliente)
 * - truncarObservacao(texto, maxChars)
 * - calcularContentHash(cliente)
 * - classificarTipo(hashAnterior, hashNovo)
 * - normalizarCliente(clienteRaw)
 * - obterClienteExistente(supabase, origem_loja, nex_codigo)
 *
 * Todas as funções são puras (sem side-effects além de DB em upsertNexCliente).
 * Usa SUPABASE_SECRET_KEY para acesso service_role (RLS zero-policy).
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
  // Payload a hashear: tudo menos chave natural
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
 * INTERNALS: Busca cliente existente no Supabase
 */
async function obterClienteExistente(supabase, origem_loja, nex_codigo) {
  try {
    const { data, error } = await supabase
      .from('nex_clientes')
      .select('id, content_hash')
      .eq('origem_loja', origem_loja)
      .eq('nex_codigo', nex_codigo)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = "not found" (esperado)
      throw error;
    }

    return data || null;
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
 * PUBLIC EXPORT: Upsert atômico de cliente + evento
 * Escreve nex_sync_eventos se tipo != 'sem_alteracao'
 */
async function upsertNexCliente(supabase, clienteNormalizado, metadata = {}) {
  const { loteId, correlationId } = metadata;

  try {
    // 1. Obter cliente existente
    const existente = await obterClienteExistente(
      supabase,
      clienteNormalizado.origem_loja,
      clienteNormalizado.nex_codigo
    );

    // 2. Calcular hash novo
    const hashNovo = calcularContentHash(clienteNormalizado);
    const hashAnterior = existente ? existente.content_hash : null;

    // 3. Classificar tipo
    const tipo = classificarTipo(hashAnterior, hashNovo);

    // 4. Upsert cliente
    const { data: clienteData, error: upsertError } = await supabase
      .from('nex_clientes')
      .upsert(
        {
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
        },
        { onConflict: 'origem_loja,nex_codigo' }
      )
      .select('id')
      .single();

    if (upsertError) {
      throw upsertError;
    }

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

      const resultado = await supabase.from('nex_sync_eventos').insert(eventoData);

      // Handle both real Supabase response and mocked response
      const { error: eventoError } = resultado || {};
      if (eventoError) {
        throw eventoError;
      }
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
async function processarLote(supabase, clientes, options = {}) {
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
      const resultado = await upsertNexCliente(supabase, clienteNormalizado, {
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

// Exports: apenas funções públicas
export {
  processarLote,
  upsertNexCliente,
};
