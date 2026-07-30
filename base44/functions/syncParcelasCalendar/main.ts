import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlecalendar');

    const body = await req.json().catch(() => ({}));
    const parcelaId = body?.parcela_id;

    let parcelas;
    if (parcelaId) {
      const p = await base44.asServiceRole.entities.Parcela.get(parcelaId);
      parcelas = [p];
    } else {
      parcelas = await base44.asServiceRole.entities.Parcela.filter(
        { status: 'pendente' },
        '-data_vencimento',
        500
      );
    }

    const configs = await base44.asServiceRole.entities.ConfiguracaoLoja.list();
    const config = configs[0] || { nome_loja: 'PRIME STORE' };

    const results = { created: 0, updated: 0, skipped: 0, errors: 0, total: parcelas.length };

    for (const p of parcelas) {
      if (!p.data_vencimento) { results.skipped++; continue; }

      // All-day event: end date = due date + 1 day (Google uses exclusive end)
      const due = new Date(p.data_vencimento + 'T00:00:00');
      const endDate = new Date(due);
      endDate.setDate(endDate.getDate() + 1);
      const endStr = endDate.toISOString().slice(0, 10);

      const valorBase = p.valor_base || 0;
      const pago = p.valor_pago || 0;
      const saldo = (p.valor_atualizado ?? p.valor_base ?? 0) - pago;

      const summary = `Vencimento - ${p.cliente_nome} - Parcela ${p.numero}ª`;
      const description = [
        `Loja: ${config.nome_loja}`,
        `Cliente: ${p.cliente_nome}`,
        `Parcela: ${p.numero}ª`,
        `Valor: R$ ${valorBase.toFixed(2)}`,
        pago > 0 ? `Pago: R$ ${pago.toFixed(2)}` : null,
        pago > 0 ? `Saldo: R$ ${saldo.toFixed(2)}` : null,
        `Vencimento: ${p.data_vencimento}`,
      ].filter(Boolean).join('\n');

      const eventBody = {
        summary,
        description,
        start: { date: p.data_vencimento },
        end: { date: endStr },
        colorId: '11',
        reminders: {
          useDefault: false,
          overrides: [{ method: 'popup', minutes: 1440 }],
        },
      };

      try {
        if (p.gcal_event_id) {
          const updateRes = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${p.gcal_event_id}`,
            {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(eventBody),
            }
          );

          if (updateRes.ok) {
            results.updated++;
            continue;
          }

          if (updateRes.status !== 404) {
            results.errors++;
            continue;
          }
          // Event deleted on calendar — fall through to create
        }

        const createRes = await fetch(
          'https://www.googleapis.com/calendar/v3/calendars/primary/events',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(eventBody),
          }
        );

        if (createRes.ok) {
          const data = await createRes.json();
          await base44.asServiceRole.entities.Parcela.update(p.id, {
            gcal_event_id: data.id,
          });
          results.created++;
        } else {
          results.errors++;
        }
      } catch {
        results.errors++;
      }
    }

    return Response.json({ success: true, ...results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});