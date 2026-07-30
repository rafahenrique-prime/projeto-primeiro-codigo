import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  const inicio = Date.now();
  const body = await req.json().catch(() => ({}));
  const isTest = body.isTest === true;
  const configId = body.config_id || null;
  const FUNCTION_NAME = 'resumoCobrancasAtrasadas';
  const TIPO = 'cobrancas_atraso';
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
    const diasTolerancia = config?.dias_tolerancia || 0;

    // Load all parcels
    const allParcelas = await base44.asServiceRole.entities.Parcela.list('-data_vencimento', 500);

    const fmtBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
    const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');

    function daysBetween(dateStr1, dateStr2) {
      const d1 = new Date(dateStr1 + 'T00:00:00');
      const d2 = new Date(dateStr2 + 'T00:00:00');
      return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
    }

    // Filter overdue parcels: not paid, saldo > 0, past tolerance
    const vencidas = (allParcelas || []).filter((p) => {
      if (p.status === 'pago') return false;
      const saldo = (p.valor_base || 0) - (p.valor_pago || 0);
      if (saldo <= 0) return false;
      const diasAtraso = daysBetween(p.data_vencimento, hoje);
      return diasAtraso > diasTolerancia;
    });

    // Group overdue by client
    const porCliente = {};
    for (const p of vencidas) {
      const key = p.cliente_id || p.cliente_nome;
      if (!porCliente[key]) {
        porCliente[key] = { nome: p.cliente_nome || 'Cliente', parcelas: [], total: 0 };
      }
      const saldo = (p.valor_base || 0) - (p.valor_pago || 0);
      const dias = daysBetween(p.data_vencimento, hoje);
      porCliente[key].parcelas.push({ numero: p.numero, valor: saldo, vencimento: p.data_vencimento, dias_atraso: dias });
      porCliente[key].total += saldo;
    }

    const listaClientes = Object.values(porCliente).sort((a, b) => b.total - a.total);
    const totalGeral = listaClientes.reduce((s, c) => s + c.total, 0);

    // --- Partial payments ---
    const parciais = (allParcelas || []).filter((p) => {
      if (p.status === 'pago') return false;
      return (p.valor_pago || 0) > 0;
    });

    const parciaisPorCliente = {};
    for (const p of parciais) {
      const key = p.cliente_id || p.cliente_nome;
      if (!parciaisPorCliente[key]) {
        parciaisPorCliente[key] = { nome: p.cliente_nome || 'Cliente', parcelas: [], totalPago: 0, totalRestante: 0 };
      }
      const pago = p.valor_pago || 0;
      const saldo = (p.valor_base || 0) - pago;
      parciaisPorCliente[key].parcelas.push({ numero: p.numero, valorBase: p.valor_base || 0, valorPago: pago, valorRestante: saldo, vencimento: p.data_vencimento });
      parciaisPorCliente[key].totalPago += pago;
      parciaisPorCliente[key].totalRestante += saldo;
    }

    const listaParciais = Object.values(parciaisPorCliente).sort((a, b) => b.totalRestante - a.totalRestante);
    const totalParcialPago = listaParciais.reduce((s, c) => s + c.totalPago, 0);
    const totalParcialRestante = listaParciais.reduce((s, c) => s + c.totalRestante, 0);

    // Build partial payments HTML section
    let parciaisHtmlSection = '';
    if (listaParciais.length > 0) {
      const parciaisRows = listaParciais.map((c) => {
        const parcelasHtml = c.parcelas.map((p) => {
          return '<tr>' +
            '<td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280;">' + p.numero + '\u00aa parcela</td>' +
            '<td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280;text-align:center;">' + fmtDate(p.vencimento) + '</td>' +
            '<td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#374151;text-align:right;">' + fmtBRL(p.valorBase) + '</td>' +
            '<td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#16a34a;text-align:right;">' + fmtBRL(p.valorPago) + '</td>' +
            '<td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#2563eb;text-align:right;font-weight:600;">' + fmtBRL(p.valorRestante) + '</td>' +
            '</tr>';
        }).join('');

        return '<tr>' +
          '<td colspan="5" style="padding:10px 12px;background:#eff6ff;border-bottom:2px solid #bfdbfe;">' +
          '<span style="font-weight:700;color:#1e40af;font-size:14px;">' + c.nome + '</span>' +
          '<span style="float:right;font-weight:700;color:#1e40af;font-size:14px;">Restam: ' + fmtBRL(c.totalRestante) + '</span>' +
          '</td>' +
          '</tr>' + parcelasHtml;
      }).join('');

      parciaisHtmlSection =
        '<div style="margin-top:24px;">' +
          '<h2 style="font-size:16px;color:#1e40af;margin:0 0 12px;">\uD83D\uDCB0 Pagamentos Parciais em Aberto</h2>' +
          '<p style="font-size:14px;color:#374151;margin:0 0 12px;">' +
            listaParciais.length + ' cliente(s) com pagamento parcial — ' +
            'j\u00e1 pago: <strong style="color:#16a34a;">' + fmtBRL(totalParcialPago) + '</strong> | ' +
            'restante: <strong style="color:#2563eb;">' + fmtBRL(totalParcialRestante) + '</strong>' +
          '</p>' +
          '<table style="width:100%;border-collapse:collapse;font-size:14px;">' +
            '<thead>' +
              '<tr style="background:#f9fafb;">' +
                '<th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb;font-size:11px;color:#6b7280;text-transform:uppercase;">Parcela</th>' +
                '<th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e5e7eb;font-size:11px;color:#6b7280;text-transform:uppercase;">Vencimento</th>' +
                '<th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e5e7eb;font-size:11px;color:#6b7280;text-transform:uppercase;">Valor Total</th>' +
                '<th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e5e7eb;font-size:11px;color:#6b7280;text-transform:uppercase;">J\u00e1 Pago</th>' +
                '<th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e5e7eb;font-size:11px;color:#6b7280;text-transform:uppercase;">Restante</th>' +
              '</tr>' +
            '</thead>' +
            '<tbody>' + parciaisRows + '</tbody>' +
          '</table>' +
          '<div style="margin-top:12px;padding:10px 16px;background:#eff6ff;border-radius:8px;text-align:center;">' +
            '<p style="margin:0;font-size:13px;color:#1e40af;font-weight:600;">Total restante em parciais: ' + fmtBRL(totalParcialRestante) + '</p>' +
          '</div>' +
        '</div>';
    }

    const hasData = listaClientes.length > 0 || listaParciais.length > 0;
    let emailEnviado = false;
    const sufixoTeste = isTest ? ' [TESTE]' : '';

    if (emailDestino) {
      const dataFmt = new Date().toLocaleDateString('pt-BR');
      const temVencidas = listaClientes.length > 0;
      const temParciais = listaParciais.length > 0;
      let html = '';
      let subject = '';

      if (hasData) {
        let headerBg, headerColor, subtitleColor, titulo;
        if (temVencidas) {
          headerBg = '#dc2626'; headerColor = '#fff'; subtitleColor = '#fee2e2'; titulo = 'Resumo Financeiro Diário';
        } else if (temParciais) {
          headerBg = '#2563eb'; headerColor = '#fff'; subtitleColor = '#dbeafe'; titulo = 'Resumo Financeiro Diário';
        } else {
          headerBg = '#16a34a'; headerColor = '#fff'; subtitleColor = '#dcfce7'; titulo = 'Tudo em dia!';
        }

        if (temVencidas) {
          const rows = listaClientes.map((c) => {
            const parcelasHtml = c.parcelas.map((p) => {
              return '<tr>' +
                '<td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280;">' + p.numero + '\u00aa parcela</td>' +
                '<td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280;text-align:center;">' + fmtDate(p.vencimento) + '</td>' +
                '<td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#dc2626;text-align:center;font-weight:600;">' + p.dias_atraso + ' dia(s)</td>' +
                '<td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#374151;text-align:right;font-weight:600;">' + fmtBRL(p.valor) + '</td>' +
                '</tr>';
            }).join('');

            return '<tr>' +
              '<td colspan="4" style="padding:10px 12px;background:#fef2f2;border-bottom:2px solid #fecaca;">' +
              '<span style="font-weight:700;color:#991b1b;font-size:14px;">' + c.nome + '</span>' +
              '<span style="float:right;font-weight:700;color:#991b1b;font-size:14px;">' + fmtBRL(c.total) + '</span>' +
              '</td>' +
              '</tr>' + parcelasHtml;
          }).join('');

          html =
            '<div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;">' +
              '<div style="background:' + headerBg + ';padding:20px 24px;border-radius:12px 12px 0 0;">' +
                '<h1 style="color:' + headerColor + ';margin:0;font-size:20px;">' + titulo + '</h1>' +
                '<p style="color:' + subtitleColor + ';margin:4px 0 0;font-size:14px;">' + nomeLoja + ' - ' + dataFmt + '</p>' +
              '</div>' +
              '<div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 12px 12px;">' +
                '<p style="font-size:15px;color:#374151;margin:0 0 16px;">' +
                  'Voc\u00ea tem <strong style="color:#dc2626;">' + vencidas.length + ' parcela(s) atrasada(s)</strong>' +
                  ' de <strong>' + listaClientes.length + ' cliente(s)</strong>, totalizando ' +
                  '<strong style="color:#dc2626;">' + fmtBRL(totalGeral) + '</strong> em aberto.' +
                '</p>' +
                '<table style="width:100%;border-collapse:collapse;font-size:14px;">' +
                  '<thead>' +
                    '<tr style="background:#f9fafb;">' +
                      '<th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb;font-size:11px;color:#6b7280;text-transform:uppercase;">Parcela</th>' +
                      '<th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e5e7eb;font-size:11px;color:#6b7280;text-transform:uppercase;">Vencimento</th>' +
                      '<th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e5e7eb;font-size:11px;color:#6b7280;text-transform:uppercase;">Atraso</th>' +
                      '<th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e5e7eb;font-size:11px;color:#6b7280;text-transform:uppercase;">Valor</th>' +
                    '</tr>' +
                  '</thead>' +
                  '<tbody>' + rows + '</tbody>' +
                '</table>' +
                '<div style="margin-top:20px;padding:12px 16px;background:#fef2f2;border-radius:8px;text-align:center;">' +
                  '<p style="margin:0;font-size:14px;color:#991b1b;font-weight:600;">Total em atraso: ' + fmtBRL(totalGeral) + '</p>' +
                '</div>' +
                parciaisHtmlSection +
              '</div>' +
              '<p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:16px;">Resumo gerado pelo ' + nomeLoja + '</p>' +
            '</div>';
        } else if (temParciais) {
          html =
            '<div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;">' +
              '<div style="background:' + headerBg + ';padding:20px 24px;border-radius:12px 12px 0 0;">' +
                '<h1 style="color:' + headerColor + ';margin:0;font-size:20px;">' + titulo + '</h1>' +
                '<p style="color:' + subtitleColor + ';margin:4px 0 0;font-size:14px;">' + nomeLoja + ' - ' + dataFmt + '</p>' +
              '</div>' +
              '<div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 12px 12px;">' +
                '<p style="font-size:15px;color:#374151;margin:0 0 12px;">N\u00e3o h\u00e1 parcelas atrasadas, mas voc\u00ea tem pagamentos parciais em aberto.</p>' +
                parciaisHtmlSection +
              '</div>' +
              '<p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:16px;">Resumo gerado pelo ' + nomeLoja + '</p>' +
            '</div>';
        }

        let subjectParts = [];
        if (temVencidas) subjectParts.push(vencidas.length + ' atrasada(s) - ' + fmtBRL(totalGeral));
        if (temParciais) subjectParts.push(listaParciais.length + ' parcial(is) - ' + fmtBRL(totalParcialRestante) + ' restante');
        subject = (subjectParts.length > 0 ? subjectParts.join(' | ') : 'Tudo em dia') + ' - ' + nomeLoja;
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
        detalhes: vencidas.length + ' vencida(s), ' + listaParciais.length + ' parcial(is), ' + fmtBRL(totalGeral) + ' em atraso',
        quantidade_enviada: emailEnviado ? 1 : 0,
      });
    } catch (_e) {}

    return Response.json({
      success: true,
      data_referencia: hoje,
      total_parcelas_vencidas: vencidas.length,
      total_clientes_vencidos: listaClientes.length,
      valor_total_vencido: totalGeral,
      total_parciais: parciais.length,
      total_clientes_parciais: listaParciais.length,
      valor_parcial_pago: totalParcialPago,
      valor_parcial_restante: totalParcialRestante,
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