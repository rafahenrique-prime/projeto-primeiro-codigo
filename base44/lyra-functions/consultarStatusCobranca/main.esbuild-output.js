import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";
function mapMPStatus(mpStatus) {
  const map = {
    approved: "pago",
    authorized: "pendente",
    in_process: "pendente",
    in_mediation: "pendente",
    rejected: "pendente",
    cancelled: "cancelado",
    refunded: "cancelado",
    charged_back: "cancelado",
    pending: "pendente"
  };
  return map[mpStatus] || "pendente";
}
function mapPixStatusLocal(orderStatus, orderStatusDetail, paymentStatus, paymentStatusDetail) {
  const os = (orderStatus || "").trim().toLowerCase();
  const osd = (orderStatusDetail || "").trim().toLowerCase();
  const ps = (paymentStatus || "").trim().toLowerCase();
  const psd = (paymentStatusDetail || "").trim().toLowerCase();
  if (ps === "approved" || os === "processed") return "pago";
  if (os === "cancelled" || os === "canceled" || ps === "cancelled" || ps === "canceled") return "cancelado";
  if (ps === "rejected" || psd === "rejected") return "rejeitado";
  if (os === "expired" || osd === "expired" || ps === "expired" || psd === "expired") return "expirado";
  return "pendente";
}
const MP_ORDERS_TIMEOUT_MS = 1e4;
async function consultarOrderMP(orderId, accessToken) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MP_ORDERS_TIMEOUT_MS);
  try {
    const resp = await fetch(`https://api.mercadopago.com/v1/orders/${orderId}`, {
      headers: { "Authorization": `Bearer ${accessToken}` },
      signal: controller.signal
    });
    let json = null;
    try {
      json = await resp.json();
    } catch (_parseErr) {
    }
    if (!resp.ok) {
      const codigo = resp.status === 400 ? "mp_bad_request" : resp.status === 401 ? "mp_unauthorized" : resp.status === 403 ? "mp_forbidden" : resp.status === 404 ? "mp_order_not_found" : resp.status === 429 ? "mp_rate_limited" : resp.status >= 500 ? "mp_server_error" : "mp_error";
      return { ok: false, erro: codigo, httpStatus: resp.status };
    }
    if (!json) return { ok: false, erro: "mp_invalid_json", httpStatus: resp.status };
    return { ok: true, json };
  } catch (err) {
    const erro = err?.name === "AbortError" ? "mp_timeout" : "mp_network_error";
    return { ok: false, erro, detail: String(err?.message || err) };
  } finally {
    clearTimeout(timeoutId);
  }
}
async function notificarPrimeLocal(payload) {
  try {
    const secret = Deno.env.get("LYRA_WEBHOOK_SECRET");
    if (!secret) return false;
    await fetch("https://ignite-webhook.vercel.app/api/system-tools?tool=lyra-webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${secret}` },
      body: JSON.stringify(payload)
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
    return new Response(JSON.stringify({ error: "cobranca_id obrigat\xF3rio" }), { status: 400 });
  }
  const accessToken = Deno.env.get("MP_ACCESS_TOKEN");
  if (!accessToken) {
    return new Response(JSON.stringify({ error: "MP_ACCESS_TOKEN n\xE3o configurado" }), { status: 500 });
  }
  const cobrancas = await base44.asServiceRole.entities.Cobranca.filter({ id: cobranca_id });
  if (!cobrancas || cobrancas.length === 0) {
    return new Response(JSON.stringify({ error: "Cobran\xE7a n\xE3o encontrada" }), { status: 404 });
  }
  const cobranca = cobrancas[0];
  if (cobranca.mp_payment_id) {
    const resp = await fetch(`https://api.mercadopago.com/v1/payments/${cobranca.mp_payment_id}`, {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });
    if (resp.ok) {
      const payment = await resp.json();
      const novoStatus = mapMPStatus(payment.status);
      if (novoStatus !== cobranca.status) {
        await base44.asServiceRole.entities.Cobranca.update(cobranca_id, { status: novoStatus });
      }
      return new Response(JSON.stringify({ cobranca_id, status: novoStatus, mp_status: payment.status, payment_method: payment.payment_type_id, pago_em: payment.date_approved }), { headers: { "Content-Type": "application/json" } });
    }
  }
  if (cobranca.mp_preference_id) {
    const resp = await fetch(`https://api.mercadopago.com/v1/payments/search?external_reference=${cobranca.cliente_id}&preference_id=${cobranca.mp_preference_id}`, {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.results && data.results.length > 0) {
        const payment = data.results[0];
        const novoStatus = mapMPStatus(payment.status);
        await base44.asServiceRole.entities.Cobranca.update(cobranca_id, { status: novoStatus, mp_payment_id: String(payment.id) });
        return new Response(JSON.stringify({ cobranca_id, status: novoStatus, mp_status: payment.status, mp_payment_id: payment.id }), { headers: { "Content-Type": "application/json" } });
      }
    }
  }
  if (cobranca.pix_order_id) {
    let cobrancasPorPixOrder;
    try {
      cobrancasPorPixOrder = await base44.asServiceRole.entities.Cobranca.filter({ pix_order_id: cobranca.pix_order_id });
    } catch (err) {
      return new Response(JSON.stringify({ error: "Falha ao verificar duplicidade por pix_order_id", detail: err.message }), { status: 502 });
    }
    if (!cobrancasPorPixOrder || cobrancasPorPixOrder.length === 0) {
      return new Response(JSON.stringify({ error: "pix_cobranca_not_found", pix_order_id: cobranca.pix_order_id }), { status: 404 });
    }
    if (cobrancasPorPixOrder.length > 1) {
      return new Response(JSON.stringify({
        error: "duplicate_pix_order_records",
        pix_order_id: cobranca.pix_order_id,
        ids_encontrados: cobrancasPorPixOrder.map((c) => c.id)
      }), { status: 409 });
    }
    const consulta = await consultarOrderMP(cobranca.pix_order_id, accessToken);
    if (!consulta.ok) {
      const httpOut = consulta.httpStatus && consulta.httpStatus >= 400 && consulta.httpStatus < 500 ? consulta.httpStatus : 502;
      return new Response(JSON.stringify({ error: consulta.erro, pix_order_id: cobranca.pix_order_id, detail: consulta.detail || null }), { status: httpOut });
    }
    const order = consulta.json;
    const orderId = order.id;
    const orderStatus = order.status;
    const orderStatusDetail = order.status_detail;
    const paymentObj = order.transactions && order.transactions.payments && order.transactions.payments[0] || {};
    const paymentId = paymentObj.id || null;
    const paymentStatus = paymentObj.status;
    const paymentStatusDetail = paymentObj.status_detail;
    const externalReference = order.external_reference || null;
    const valorPago = order.total_amount != null ? Number(order.total_amount) : paymentObj.amount != null ? Number(paymentObj.amount) : null;
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
      pix_status: pixStatus
    };
    if (pixStatus !== "pago") {
      if (pixStatus !== cobranca.pix_status) {
        await base44.asServiceRole.entities.Cobranca.update(cobranca_id, { pix_status: pixStatus });
      }
      return new Response(JSON.stringify({ ...respostaBase, action: "no_update_financeiro" }), { headers: { "Content-Type": "application/json" } });
    }
    if (!paymentId) {
      return new Response(JSON.stringify({ ...respostaBase, error: "pix_payment_id_ausente_na_order", action: "pago_sem_payment_id" }), { status: 502 });
    }
    const camposUpdate = { pix_status: "pago" };
    if (cobranca.status !== "pago") camposUpdate.status = "pago";
    if (!cobranca.pix_payment_id && paymentId) camposUpdate.pix_payment_id = paymentId;
    await base44.asServiceRole.entities.Cobranca.update(cobranca_id, camposUpdate);
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
        pago_em: (/* @__PURE__ */ new Date()).toISOString(),
        metodo_pagamento: "pix",
        mp_payment_id: String(paymentId)
      });
      recebimentoCriado = true;
    }
    const valorDivergeDaCobranca = valorPago != null && Math.abs(valorPago - Number(cobranca.valor)) > 0.01;
    const notificado = await notificarPrimeLocal({
      id: cobranca.id,
      valor: recebimento.valor_recebido,
      status: "pago",
      mp_payment_id: String(paymentId),
      mp_preference_id: cobranca.mp_preference_id || null,
      cliente_id: cobranca.cliente_id,
      prime_parcela_id: cobranca.prime_parcela_id || null
    });
    return new Response(JSON.stringify({
      ...respostaBase,
      status: "pago",
      recebimento_id: recebimento.id,
      recebimento_criado: recebimentoCriado,
      valor_recebido: recebimento.valor_recebido,
      valor_diverge_da_cobranca: valorDivergeDaCobranca,
      notificado_prime: notificado
    }), { headers: { "Content-Type": "application/json" } });
  }
  const hoje = (/* @__PURE__ */ new Date()).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  if (cobranca.vencimento < hoje && cobranca.status === "pendente") {
    await base44.asServiceRole.entities.Cobranca.update(cobranca_id, { status: "vencido" });
    return new Response(JSON.stringify({ cobranca_id, status: "vencido", message: "Cobran\xE7a vencida sem pagamento confirmado" }), { headers: { "Content-Type": "application/json" } });
  }
  return new Response(JSON.stringify({ cobranca_id, status: cobranca.status, payment_link: cobranca.payment_link }), { headers: { "Content-Type": "application/json" } });
});
