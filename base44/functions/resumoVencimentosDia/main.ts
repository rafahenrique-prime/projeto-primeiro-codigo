import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  const inicio = Date.now();
  const body = await req.json().catch(() => ({}));
  const isTest = body.isTest === true;
  const configId = body.config_id || null;
  const FUNCTION_NAME = 'resumoVencimentosDia';
  const TIPO = 'agenda_financeira';
  const base44 = createClientFromRequest(req);

  try {
    // Resolve admin email via shared helper
    let emailDestino = null;
    try {
      const emailRes = await base44.functions.invoke('notificacaoCore', { action: 'resolverEmail' });
      const d = (emailRes && (emailRes.data || emailRes)) || {};
      emailDestino = d.email || null;
    } catch (_e) {}

    // Today in SP timezone (YYYY-MM-DD)
    const hoje = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    // Load config
    const configs = await base44.asServiceRole.entities.ConfiguracaoLoja.list();
    const config = configs && configs.length > 0 ? configs[0] : null;
    const nomeLoja = config?.nome_loja || 'PRIME STORE';

    // Load all parcels
    const allParcelas = await base44.asServiceRole.entities.Parcela.list('-data_vencimento', 500);

    const fmtBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

    // Filter parcels due today: not paid, vencimento === today
    const vencemHoje = (allParcelas || []).filter((p) => {
      if (p.status === 'pago') return false;
      return p.data_vencimento === hoje;
    });

    // Group by client
    const porCliente = {};
    for (const p of vencemHoje) {
      const key = p.cliente_id || p.cliente_nome;
      if (!porCliente[key]) {
        porCliente[key] = { nome: p.cliente_nome || 'Cliente', parcelas: [], total: 0 };
      }
      const saldo = (p.valor_base || 0) - (p.valor_pago || 0);
      porCliente[key].parcelas.push({ numero: p.numero, valor: saldo, vencimento: p.data_vencimento });
      porCliente[key].total += saldo;
    }

    const listaClientes = Object.values(porCliente).sort((a, b) => b.total - a.total);
    const totalGeral = listaClientes.reduce((s, c) => s + c.total, 0);

    const hasData = listaClientes.length > 0;
    let emailEnviado = false;
    const sufixoTeste = isTest ? ' [TESTE]' : '';

    if (emailDestino) {
      const dataFmt = new Date().toLocaleDateString('pt-BR');
      let html = '';
      let subject = '';

      if (hasData) {
        const rows = listaClientes.map((c) => {
          const parcelasHtml = c.parcelas.map((p) => {
            return '<tr>' +
              '<td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280;">' + p.numero + '\u00aa parcela</td>' +
              '<td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#374151;text-align:right;font-weight:600;">' + fmtBRL(p.valor) + '</td>' +
              '</tr>';
          }).join('');

          return '<tr>' +
            '<td colspan="2" style="padding:10px 12px;background:#fffbeb;border-bottom:2px solid #fde68a;">' +
            '<span style="font-weight:700;color:#92400e;font-size:14px;">' + c.nome + '</span>' +
            '<span style="float:right;font-weight:700;color:#92400e;font-size:14px;">' + fmtBRL(c.total) + '</span>' +
            '</td>' +
            '</tr>' + parcelasHtml;
        }).join('');

        html =
          '<div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;">' +
            '<div style="background:#f59e0b;padding:20px 24px;border-radius:12px 12px 0 0;">' +
              '<h1 style="color:#fff;margin:0;font-size:20px;">Parcelas que Vencem Hoje</h1>' +
              '<p style="color:#fef3c7;margin:4px 0 0;font-size:14px;">' + nomeLoja + ' - ' + dataFmt + '</p>' +
            '</div>' +
            '<div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 12px 12px;">' +
              '<p style="font-size:15px;color:#374151;margin:0 0 16px;">' +
                'Voc\u00ea tem <strong style="color:#f59e0b;">' + vencemHoje.length + ' parcela(s)</strong>' +
                ' vencendo hoje, de <strong>' + listaClientes.length + ' cliente(s)</strong>, totalizando ' +
                '<strong style="color:#f59e0b;">' + fmtBRL(totalGeral) + '</strong> a receber.' +
              '</p>' +
              '<table style="width:100%;border-collapse:collapse;font-size:14px;">' +
                '<thead>' +
                  '<tr style="background:#f9fafb;">' +
                    '<th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb;font-size:11px;color:#6b7280;text-transform:uppercase;">Parcela</th>' +
                    '<th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e5e7eb;font-size:11px;color:#6b7280;text-transform:uppercase;">Valor</th>' +
                  '</tr>' +
                '</thead>' +
                '<tbody>' + rows + '</tbody>' +
              '</table>' +
              '<div style="margin-top:20px;padding:12px 16px;background:#fffbeb;border-radius:8px;text-align:center;">' +
                '<p style="margin:0;font-size:14px;color:#92400e;font-weight:600;">Total a receber hoje: ' + fmtBRL(totalGeral) + '</p>' +
              '</div>' +
            '</div>' +
            '<p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:16px;">' +
              'Resumo gerado pelo ' + nomeLoja +
            '</p>' +
          '</div>';
        subject = vencemHoje.length + ' parcela(s) vencendo hoje - ' + fmtBRL(totalGeral) + ' a receber - ' + nomeLoja;
      } else if (isTest) {
        html =
          '<div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;">' +
            '<div style="background:#6b7280;padding:20px 24px;border-radius:12px 12px 0 0;">' +
              '<h1 style="color:#fff;margin:0;font-size:20px;">Nenhuma parcela encontrada</h1>' +
              '<p style="color:#e5e7eb;margin:4px 0 0;font-size:14px;">' + nomeLoja + ' - ' + dataFmt + '</p>' +
            '</div>' +
            '<div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 12px 12px;text-align:center;">' +
              '<p style="font-size:15px;color:#374151;margin:0;">Nenhuma parcela encontrada para este relatório.</p>' +
            '</div>' +
            '<p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:16px;">Resumo gerado pelo ' + nomeLoja + '</p>' +
          '</div>';
        subject = 'Nenhuma parcela encontrada - ' + nomeLoja;
      }

      if (html) {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: emailDestino,
          subject: subject + sufixoTeste,
          body: html,
        });
        emailEnviado = true;
      }
    }

    const status = (!hasData && !isTest) ? 'sem_dados' : 'sucesso';

    // Register execution log + update config
    try {
      await base44.functions.invoke('notificacaoCore', {
        action: 'registrar',
        config_id: configId,
        tipo: TIPO,
        status: status,
        destinatario: emailDestino || '',
        modo_teste: isTest,
        duracao_ms: Date.now() - inicio,
        erro: null,
        backend_function: FUNCTION_NAME,
        detalhes: vencemHoje.length + ' parcela(s), ' + listaClientes.length + ' cliente(s), ' + fmtBRL(totalGeral),
        quantidade_enviada: emailEnviado ? 1 : 0,
      });
    } catch (_e) {}

    return Response.json({
      success: true,
      data_referencia: hoje,
      total_parcelas: vencemHoje.length,
      total_clientes: listaClientes.length,
      valor_total: totalGeral,
      email_destino: emailDestino,
      email_enviado: emailEnviado,
      modo_teste: isTest,
      status: status,
    });
  } catch (error) {
    try {
      await base44.functions.invoke('notificacaoCore', {
        action: 'registrar',
        config_id: configId,
        tipo: TIPO,
        status: 'erro',
        destinatario: '',
        modo_teste: isTest,
        duracao_ms: Date.now() - inicio,
        erro: error.message,
        backend_function: FUNCTION_NAME,
        detalhes: 'Erro durante execução',
        quantidade_enviada: 0,
      });
    } catch (_e) {}
    return Response.json({ error: error.message }, { status: 500 });
  }
});