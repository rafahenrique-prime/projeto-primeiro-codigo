import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function mapMPStatus(mpStatus: string): string {
  const map: Record<string, string> = {
    approved: 'pago', authorized: 'pendente', in_process: 'pendente',
    in_mediation: 'pendente', rejected: 'pendente', cancelled: 'cancelado',
    refunded: 'cancelado', charged_back: 'cancelado', pending: 'pendente',
  };
  return map[mpStatus] || 'pendente';
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

  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  if (cobranca.vencimento < hoje && cobranca.status === 'pendente') {
    await base44.asServiceRole.entities.Cobranca.update(cobranca_id, { status: 'vencido' });
    return new Response(JSON.stringify({ cobranca_id, status: 'vencido', message: 'Cobrança vencida sem pagamento confirmado' }), { headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ cobranca_id, status: cobranca.status, payment_link: cobranca.payment_link }), { headers: { 'Content-Type': 'application/json' } });
});
