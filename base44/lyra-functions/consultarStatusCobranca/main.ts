import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function mapMPStatus(mpStatus: string): string {
  const map: Record<string, string> = {
    approved: 'pago', authorized: 'pendente', in_process: 'pendente',
    in_mediation: 'pendente', rejected: 'pendente', cancelled: 'cancelado',
    refunded: 'cancelado', charged_back: 'cancelado', pending: 'pendente',
  };
  return map[mpStatus] || 'pendente';
}

// Equivalente local à mapPixStatus de criarCobranca/main.ts. Duplicado de propósito: não existe
// mecanismo de módulo compartilhado entre Backend Functions neste projeto (cada function só
// declara "entry": "main.ts" isolado, sem suporte confirmado a import de arquivo local de outra
// function) — ver Etapa 2C.2, item 5, para centralizar quando o webhook automático precisar da
// mesma regra.
function mapPixStatusLocal(orderStatus: string, orderStatusDetail: string, paymentStatus: string, paymentStatusDetail: string): string {
  const os = (orderStatus || '').trim().toLowerCase();
  const osd = (orderStatusDetail || '').trim().toLowerCase();
  const ps = (paymentStatus || '').trim().toLowerCase();
  const psd = (paymentStatusDetail || '').trim().toLowerCase();
  if (ps === 'approved' || os === 'processed') return 'pago';
  if (os === 'cancelled' || os === 'canceled' || ps === 'cancelled' || ps === 'canceled') return 'cancelado';
  if (ps === 'rejected' || psd === 'rejected') return 'rejeitado';
  if (os === 'expired' || osd === 'expired' || ps === 'expired' || psd === 'expired') return 'expirado';
  return 'pendente';
}

// --- Orquestração da confirmação de Pagamento por WhatsApp (Etapa 3, corrigida) ---
// A Lyra NUNCA lê TemplateWhatsApp (essa entidade só existe no PRIME) — envia somente
// dados brutos mínimos; toda leitura/validação de template e substituição de variáveis
// acontece dentro de enviarConfirmacaoPagamentoWhatsapp (PRIME).
const ENVIAR_CONFIRMACAO_TIMEOUT_MS = 12000;

function comTimeoutConfirmacao(promise: Promise<any>, ms: number): Promise<any> {
  return Promise.race([
    promise,
    new Promise((_resolve, reject) => setTimeout(() => reject({ __timeout: true }), ms)),
  ]);
}

// Chamada cross-app à function dedicada no PRIME — nunca chama whatsappProvider
// diretamente a partir da Lyra. Único acesso: WHATSAPP_LYRA_TO_PRIME_TOKEN.
async function chamarEnviarConfirmacaoPagamentoWhatsapp(payload: {
  phone: string; cobranca_id: string; pix_payment_id: string;
  cliente_nome: string; valor_recebido: number; data_pagamento: string; modo_teste: boolean;
}): Promise<{
  ok: boolean; status?: string; already_sent?: boolean; destination_masked?: string;
  message_id?: string | null; error_code?: string;
  template_key?: string; template_source?: string | null; template_status?: string;
  template_id?: string | null; template_version?: string | null;
}> {
  const token = Deno.env.get('WHATSAPP_LYRA_TO_PRIME_TOKEN') || '';
  if (!token) {
    return { ok: false, error_code: 'missing_lyra_to_prime_token' };
  }

  let resp;
  try {
    resp = await comTimeoutConfirmacao(
      fetch('https://prime-vip.base44.app/functions/enviarConfirmacaoPagamentoWhatsapp', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: payload.phone,
          cobranca_id: payload.cobranca_id,
          pix_payment_id: payload.pix_payment_id,
          cliente_nome: payload.cliente_nome,
          valor_recebido: payload.valor_recebido,
          data_pagamento: payload.data_pagamento,
          modo_teste: payload.modo_teste,
        }),
      }),
      ENVIAR_CONFIRMACAO_TIMEOUT_MS,
    );
  } catch (err: any) {
    if (err && err.__timeout) {
      return { ok: false, error_code: 'timeout_enviar_confirmacao' };
    }
    return { ok: false, error_code: 'fetch_error_enviar_confirmacao' };
  }

  let json: any = null;
  try {
    json = await resp.json();
  } catch (_e) {
    return { ok: false, error_code: 'invalid_response_format' };
  }

  if (!json || json.success !== true) {
    return { ok: false, error_code: (json && json.error_code) || 'erro_enviar_confirmacao' };
  }

  return {
    ok: true,
    status: json.status,
    already_sent: json.already_sent === true,
    destination_masked: json.destination_masked || null,
    message_id: json.message_id || null,
    template_key: json.template_key || 'pagamento_confirmado',
    template_source: json.template_source ?? null,
    template_status: json.template_status,
    template_id: json.template_id ?? null,
    template_version: json.template_version ?? null,
  };
}

const MP_ORDERS_TIMEOUT_MS = 10000;

async function consultarOrderMP(orderId: string, accessToken: string): Promise<
  | { ok: true; json: any }
  | { ok: false; erro: string; httpStatus?: number; detail?: string }
> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MP_ORDERS_TIMEOUT_MS);
  try {
    const resp = await fetch(`https://api.mercadopago.com/v1/orders/${orderId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    let json: any = null;
    try {
      json = await resp.json();
    } catch (_parseErr) {
      // resposta não é JSON — tratado abaixo
    }
    if (!resp.ok) {
      const codigo = resp.status === 400 ? 'mp_bad_request'
        : resp.status === 401 ? 'mp_unauthorized'
        : resp.status === 403 ? 'mp_forbidden'
        : resp.status === 404 ? 'mp_order_not_found'
        : resp.status === 429 ? 'mp_rate_limited'
        : resp.status >= 500 ? 'mp_server_error'
        : 'mp_error';
      return { ok: false, erro: codigo, httpStatus: resp.status };
    }
    if (!json) return { ok: false, erro: 'mp_invalid_json', httpStatus: resp.status };
    return { ok: true, json };
  } catch (err: any) {
    const erro = err?.name === 'AbortError' ? 'mp_timeout' : 'mp_network_error';
    return { ok: false, erro, detail: String(err?.message || err) };
  } finally {
    clearTimeout(timeoutId);
  }
}

// Equivalente local a notificarLyraWebhook (processarEventoMP/main.ts) — mesma justificativa
// de duplicação que mapPixStatusLocal acima (sem módulo compartilhado confirmado nesta fase).
async function notificarPrimeLocal(payload: {
  id: string;
  valor: number;
  status: string;
  mp_payment_id: string;
  mp_preference_id: string | null;
  cliente_id: string;
  prime_parcela_id: string | null;
}): Promise<boolean> {
  try {
    const secret = Deno.env.get('LYRA_WEBHOOK_SECRET');
    if (!secret) return false;
    await fetch('https://ignite-webhook.vercel.app/api/system-tools?tool=lyra-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${secret}` },
      body: JSON.stringify(payload),
    });
    return true;
  } catch (_err) {
    return false;
  }
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json();
  const { cobranca_id } = body;

  if (!cobranca_id) {
    return new Response(JSON.stringify({ error: 'cobranca_id obrigatório' }), { status: 400 });
  }

  const accessToken = Deno.env.get('MP_ACCESS_TOKEN');
  if (!accessToken) {
    return new Response(JSON.stringify({ error: 'MP_ACCESS_TOKEN não configurado' }), { status: 500 });
  }

  const cobrancas = await base44.asServiceRole.entities.Cobranca.filter({ id: cobranca_id });
  if (!cobrancas || cobrancas.length === 0) {
    return new Response(JSON.stringify({ error: 'Cobrança não encontrada' }), { status: 404 });
  }
  const cobranca = cobrancas[0];

  // --- Caminho 1 (preservado integralmente) ---
  if (cobranca.mp_payment_id) {
    const resp = await fetch(`https://api.mercadopago.com/v1/payments/${cobranca.mp_payment_id}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (resp.ok) {
      const payment = await resp.json();
      const novoStatus = mapMPStatus(payment.status);
      if (novoStatus !== cobranca.status) {
        await base44.asServiceRole.entities.Cobranca.update(cobranca_id, { status: novoStatus });
      }
      return new Response(JSON.stringify({ cobranca_id, status: novoStatus, mp_status: payment.status, payment_method: payment.payment_type_id, pago_em: payment.date_approved }), { headers: { 'Content-Type': 'application/json' } });
    }
  }

  // --- Caminho 2 (preservado integralmente) ---
  if (cobranca.mp_preference_id) {
    const resp = await fetch(`https://api.mercadopago.com/v1/payments/search?external_reference=${cobranca.cliente_id}&preference_id=${cobranca.mp_preference_id}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.results && data.results.length > 0) {
        const payment = data.results[0];
        const novoStatus = mapMPStatus(payment.status);
        await base44.asServiceRole.entities.Cobranca.update(cobranca_id, { status: novoStatus, mp_payment_id: String(payment.id) });
        return new Response(JSON.stringify({ cobranca_id, status: novoStatus, mp_status: payment.status, mp_payment_id: payment.id }), { headers: { 'Content-Type': 'application/json' } });
      }
    }
  }

  // ==========================================================================
  // Caminho 3 (NOVO — Fase 2C.1): pix_order_id / Orders API (Pix dinâmico)
  // ==========================================================================
  if (cobranca.pix_order_id) {
    // Releitura defensiva por pix_order_id — mesmo padrão de paranoia contra duplicidade já
    // usado em localizarCobrancaUnica (criarCobranca): nunca confia só no objeto já em memória.
    let cobrancasPorPixOrder;
    try {
      cobrancasPorPixOrder = await base44.asServiceRole.entities.Cobranca.filter({ pix_order_id: cobranca.pix_order_id });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: 'Falha ao verificar duplicidade por pix_order_id', detail: err.message }), { status: 502 });
    }
    if (!cobrancasPorPixOrder || cobrancasPorPixOrder.length === 0) {
      return new Response(JSON.stringify({ error: 'pix_cobranca_not_found', pix_order_id: cobranca.pix_order_id }), { status: 404 });
    }
    if (cobrancasPorPixOrder.length > 1) {
      return new Response(JSON.stringify({
        error: 'duplicate_pix_order_records',
        pix_order_id: cobranca.pix_order_id,
        ids_encontrados: cobrancasPorPixOrder.map((c: any) => c.id),
      }), { status: 409 });
    }

    const consulta = await consultarOrderMP(cobranca.pix_order_id, accessToken);
    if (!consulta.ok) {
      const httpOut = consulta.httpStatus && consulta.httpStatus >= 400 && consulta.httpStatus < 500 ? consulta.httpStatus : 502;
      return new Response(JSON.stringify({ error: consulta.erro, pix_order_id: cobranca.pix_order_id, detail: consulta.detail || null }), { status: httpOut });
    }

    // --- Mapeamento defensivo da resposta reconsultada (fonte oficial, nunca dado local) ---
    const order = consulta.json;
    const orderId = order.id;
    const orderStatus = order.status;
    const orderStatusDetail = order.status_detail;
    const paymentObj = (order.transactions && order.transactions.payments && order.transactions.payments[0]) || {};
    const paymentId = paymentObj.id || null;
    const paymentStatus = paymentObj.status;
    const paymentStatusDetail = paymentObj.status_detail;
    const externalReference = order.external_reference || null;
    const valorPago = order.total_amount != null ? Number(order.total_amount) : (paymentObj.amount != null ? Number(paymentObj.amount) : null);

    const pixStatus = mapPixStatusLocal(orderStatus, orderStatusDetail, paymentStatus, paymentStatusDetail);

    const respostaBase = {
      cobranca_id,
      pix_order_id: orderId,
      pix_payment_id: paymentId,
      order_status: orderStatus,
      order_status_detail: orderStatusDetail,
      payment_status: paymentStatus,
      payment_status_detail: paymentStatusDetail,
      external_reference: externalReference,
      pix_status: pixStatus,
    };

    if (pixStatus !== 'pago') {
      // Só reflete o status oficial reconsultado — nunca afirma pagamento sem approved/processed.
      if (pixStatus !== cobranca.pix_status) {
        await base44.asServiceRole.entities.Cobranca.update(cobranca_id, { pix_status: pixStatus });
      }
      return new Response(JSON.stringify({ ...respostaBase, action: 'no_update_financeiro' }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (!paymentId) {
      return new Response(JSON.stringify({ ...respostaBase, error: 'pix_payment_id_ausente_na_order', action: 'pago_sem_payment_id' }), { status: 502 });
    }

    // --- Pagamento aprovado: atualizar só campos pix_*/status — nunca payment_link/mp_preference_id ---
    const camposUpdate: Record<string, unknown> = { pix_status: 'pago' };
    if (cobranca.status !== 'pago') camposUpdate.status = 'pago';
    if (!cobranca.pix_payment_id && paymentId) camposUpdate.pix_payment_id = paymentId;
    await base44.asServiceRole.entities.Cobranca.update(cobranca_id, camposUpdate);

    // --- Recebimento: idempotência pelo payment ID real. Reaproveita o campo mp_payment_id
    // (não cria campo novo — não foi possível confirmar via CLI se pix_payment_id existe no
    // schema declarado de Recebimento, e mp_payment_id já é, por definição, "o payment ID do
    // Mercado Pago" independente da API de origem; o prefixo "PAY" já o distingue visualmente
    // de um id legado, que é sempre numérico). ---
    const recebimentosExistentes = await base44.asServiceRole.entities.Recebimento.filter({ mp_payment_id: String(paymentId) });
    let recebimento = recebimentosExistentes && recebimentosExistentes.length > 0 ? recebimentosExistentes[0] : null;
    let recebimentoCriado = false;

    if (!recebimento) {
      const valorRecebido = valorPago != null ? valorPago : Number(cobranca.valor);
      recebimento = await base44.asServiceRole.entities.Recebimento.create({
        cobranca_id: cobranca.id,
        cliente_id: cobranca.cliente_id,
        cliente_nome: cobranca.cliente_nome,
        valor_recebido: valorRecebido,
        pago_em: new Date().toISOString(),
        metodo_pagamento: 'pix',
        mp_payment_id: String(paymentId),
      });
      recebimentoCriado = true;
    }

    const valorDivergeDaCobranca = valorPago != null && Math.abs(valorPago - Number(cobranca.valor)) > 0.01;

    // --- Guarda de massa de teste — nunca deixar uma Cobranca de piloto/teste criar
    // Cliente/Venda/Parcela reais no PRIME (processarCobranca, api/system-tools.js, cria
    // esses registros quando não encontra Parcela correspondente). A Cobranca continua
    // sendo atualizada e o Recebimento continua sendo criado normalmente — só a notificação
    // ao PRIME é pulada. Fica aqui (não só em processarEventoMP) porque esta function também
    // pode ser chamada diretamente (ex.: botão "verificar status" na UI). ---
    const ehMassaDeTeste = typeof cobranca.prime_parcela_id === 'string' && cobranca.prime_parcela_id.startsWith('teste-');

    let notificado = false;
    if (!ehMassaDeTeste) {
      notificado = await notificarPrimeLocal({
        id: cobranca.id,
        valor: recebimento.valor_recebido,
        status: 'pago',
        mp_payment_id: String(paymentId),
        mp_preference_id: cobranca.mp_preference_id || null,
        cliente_id: cobranca.cliente_id,
        prime_parcela_id: cobranca.prime_parcela_id || null,
      });
    }

    // --- Confirmação de Pagamento por WhatsApp (Etapa 3, corrigida) — bloco isolado em
    // try/catch próprio. Nunca desfaz status pago, nunca altera pix_status, nunca remove
    // Recebimento, nunca afeta notificarPrimeLocal (já concluído acima). Só dispara quando
    // recebimentoCriado === true (primeiro processamento real) — nunca em reconsulta
    // idempotente. A Lyra só orquestra: coleta dados brutos e delega toda decisão de
    // template para enviarConfirmacaoPagamentoWhatsapp (PRIME) — nunca lê TemplateWhatsApp
    // aqui (essa entidade não existe na Lyra). Produção ainda não liberada nesta etapa:
    // só Cobrancas de teste (prime_parcela_id começando com "teste-") chamam a function
    // cross-app de verdade. ---
    let paymentConfirmationWhatsapp: Record<string, unknown>;
    try {
      if (!recebimentoCriado) {
        paymentConfirmationWhatsapp = { status: 'not_triggered_existing_receipt' };
      } else if (!ehMassaDeTeste) {
        paymentConfirmationWhatsapp = { status: 'producao_nao_liberada' };
      } else {
        let clienteLyra: any = null;
        try {
          clienteLyra = await base44.asServiceRole.entities.Cliente.get(cobranca.cliente_id);
        } catch (_e) {
          clienteLyra = null;
        }

        if (!clienteLyra || !clienteLyra.phone || String(clienteLyra.phone).trim() === '') {
          paymentConfirmationWhatsapp = { status: 'cliente_telefone_invalido' };
        } else {
          const resultadoEnvio = await chamarEnviarConfirmacaoPagamentoWhatsapp({
            phone: String(clienteLyra.phone),
            cobranca_id: cobranca.id,
            pix_payment_id: String(paymentId),
            cliente_nome: clienteLyra.name || cobranca.cliente_nome || '',
            valor_recebido: recebimento.valor_recebido,
            data_pagamento: recebimento.pago_em,
            modo_teste: true,
          });

          if (resultadoEnvio.ok) {
            paymentConfirmationWhatsapp = {
              status: resultadoEnvio.status,
              already_sent: resultadoEnvio.already_sent,
              template_key: resultadoEnvio.template_key,
              template_source: resultadoEnvio.template_source,
              template_status: resultadoEnvio.template_status,
              template_id: resultadoEnvio.template_id,
              template_version: resultadoEnvio.template_version,
              destination_masked: resultadoEnvio.destination_masked,
              message_id: resultadoEnvio.message_id,
            };
          } else {
            paymentConfirmationWhatsapp = {
              status: 'send_failed',
              error_code: resultadoEnvio.error_code,
            };
          }
        }
      }
    } catch (_waError) {
      paymentConfirmationWhatsapp = { status: 'erro_isolado', error_code: 'erro_interno' };
    }

    return new Response(JSON.stringify({
      ...respostaBase,
      status: 'pago',
      recebimento_id: recebimento.id,
      recebimento_criado: recebimentoCriado,
      valor_recebido: recebimento.valor_recebido,
      valor_diverge_da_cobranca: valorDivergeDaCobranca,
      notificado_prime: notificado,
      ...(ehMassaDeTeste ? { prime_notification_skipped: true, prime_notification_skip_reason: 'test_prime_parcela_id' } : {}),
      payment_confirmation_whatsapp: paymentConfirmationWhatsapp,
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  // --- Fallback original (preservado integralmente) ---
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  if (cobranca.vencimento < hoje && cobranca.status === 'pendente') {
    await base44.asServiceRole.entities.Cobranca.update(cobranca_id, { status: 'vencido' });
    return new Response(JSON.stringify({ cobranca_id, status: 'vencido', message: 'Cobrança vencida sem pagamento confirmado' }), { headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ cobranca_id, status: cobranca.status, payment_link: cobranca.payment_link }), { headers: { 'Content-Type': 'application/json' } });
});
