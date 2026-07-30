import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  const inicio = Date.now();
  const body = await req.json().catch(() => ({}));
  const isTest = body.isTest === true;
  const configId = body.config_id || null;
  const FUNCTION_NAME = 'lembreteCobrancas';
  const TIPO = 'lembrete_preventivo';
  const base44 = createClientFromRequest(req);

  // --- Normalização de secrets booleanas ---
  // Secrets podem conter espaços, maiúsculas ou quebras de linha.
  // Aplica trim + toLowerCase e retorna true somente quando o resultado for exatamente "true".
  function parseBooleanSecret(raw) {
    if (!raw || typeof raw !== 'string') return false;
    return raw.trim().toLowerCase() === 'true';
  }

  try {
    // Calculate date 2 days from now
    const doisDiasDepois = new Date();
    doisDiasDepois.setDate(doisDiasDepois.getDate() + 2);
    const doisDiasStr = doisDiasDepois.toISOString().split('T')[0];

    // Load config
    const configs = await base44.asServiceRole.entities.ConfiguracaoLoja.list();
    const config = configs && configs.length > 0 ? configs[0] : null;

    // Load cobranca templates (use "lembrete_3_dias" as the pre-due reminder)
    const templates = await base44.asServiceRole.entities.TemplateCobranca.list('-created_date', 50);
    const template = (templates || []).find((t) => t.tipo === 'lembrete_3_dias');

    // Get all pending parcels due in 2 days
    const allParcelas = await base44.asServiceRole.entities.Parcela.list('-data_vencimento', 500);
    const parcelasLembrete = (allParcelas || []).filter((p) => {
      return p.status !== 'pago' && p.data_vencimento === doisDiasStr;
    });

    // Get clients for phone info
    const clientes = await base44.asServiceRole.entities.Cliente.list('-created_date', 500);
    const clienteMap = {};
    for (const c of (clientes || [])) {
      clienteMap[c.id] = c;
    }

    const nomeLoja = config?.nome_loja || 'CrediLoja';
    const chavePix = config?.chave_pix || '';

    // Build parcel list with WhatsApp message + link
    const listaFormatada = parcelasLembrete.map((p) => {
      const cliente = clienteMap[p.cliente_id];
      const telefone = cliente?.telefone || '';
      const valorFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.valor_base);
      const vencFmt = new Date(p.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR');

      let mensagem = `Olá ${p.cliente_nome}! Lembrete amigável: sua parcela de ${valorFmt} vence em 2 dias (${vencFmt}). Estamos à disposição!`;
      if (template) {
        mensagem = template.mensagem
          .replace(/\{cliente\}/g, p.cliente_nome)
          .replace(/\{valor\}/g, valorFmt)
          .replace(/\{vencimento\}/g, vencFmt)
          .replace(/\{pix\}/g, chavePix)
          .replace(/\{loja\}/g, nomeLoja);
      }

      const telefoneLimpo = telefone.replace(/\D/g, '');
      const linkWhatsApp = telefoneLimpo
        ? `https://wa.me/55${telefoneLimpo}?text=${encodeURIComponent(mensagem)}`
        : '';

      return {
        parcela_id: p.id,
        cliente: p.cliente_nome,
        parcela: `${p.numero}ª`,
        valor: p.valor_base,
        vencimento: p.data_vencimento,
        telefone,
        mensagem,
        link_whatsapp: linkWhatsApp,
        payment_link: p.payment_link || '',
      };
    });

    // Resolve admin email via shared helper (works for cron and authenticated test)
    let emailDestino = null;
    try {
      const emailRes = await base44.functions.invoke('notificacaoCore', { action: 'resolverEmail' });
      const d = (emailRes && (emailRes.data || emailRes)) || {};
      emailDestino = d.email || null;
    } catch (_e) {}

    const hasData = listaFormatada.length > 0;
    let emailEnviado = false;
    const sufixoTeste = isTest ? ' [TESTE]' : '';

    if (emailDestino) {
      const dataFmt = new Date().toLocaleDateString('pt-BR');
      let html = '';
      let subject = '';

      if (hasData) {
        const valorTotal = listaFormatada.reduce((s, p) => s + p.valor, 0);
        const fmtBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

        const rows = listaFormatada.map((p) => {
          const botao = p.link_whatsapp
            ? `<a href="${p.link_whatsapp}" style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;padding:6px 16px;border-radius:6px;font-size:12px;font-weight:600;">💬 Enviar WhatsApp</a>`
            : '<span style="color:#9ca3af;font-size:12px;">Sem telefone</span>';
          return `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;">${p.cliente}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${p.parcela}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${fmtBRL(p.valor)}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${botao}</td>
          </tr>`;
        }).join('');

        html = `
          <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#16A34A;padding:20px 24px;border-radius:12px 12px 0 0;">
              <h1 style="color:#fff;margin:0;font-size:20px;">📅 Lembrete de Vencimento — Em 2 dias</h1>
              <p style="color:#d1fae5;margin:4px 0 0;font-size:14px;">${nomeLoja}</p>
            </div>
            <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 12px 12px;">
              <p style="font-size:15px;color:#374151;margin:0 0 16px;">
                Você tem <strong style="color:#16A34A;">${listaFormatada.length} parcela(s)</strong>
                vencendo em 2 dias (${doisDiasDepois.toLocaleDateString('pt-BR')}), totalizando
                <strong>${fmtBRL(valorTotal)}</strong>.
              </p>
              <p style="font-size:13px;color:#6b7280;margin:0 0 12px;">Clique no botão para enviar o lembrete via WhatsApp com a mensagem do seu template.</p>
              <table style="width:100%;border-collapse:collapse;font-size:14px;">
                <thead>
                  <tr style="background:#f9fafb;">
                    <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb;font-size:12px;color:#6b7280;text-transform:uppercase;">Cliente</th>
                    <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e5e7eb;font-size:12px;color:#6b7280;text-transform:uppercase;">Parcela</th>
                    <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e5e7eb;font-size:12px;color:#6b7280;text-transform:uppercase;">Valor</th>
                    <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e5e7eb;font-size:12px;color:#6b7280;text-transform:uppercase;">Ação</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
              <div style="margin-top:24px;padding:16px;background:#f0fdf4;border-radius:8px;text-align:center;">
                <p style="margin:0;font-size:13px;color:#15803d;">
                  💬 Os links abrem o WhatsApp com a mensagem pronta usando seu template de cobrança
                </p>
              </div>
            </div>
            <p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:16px;">
              Este é um lembrete automático do ${nomeLoja}
            </p>
          </div>
        `;
        subject = `📅 ${listaFormatada.length} parcela(s) vencendo em 2 dias — ${nomeLoja}`;
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
        detalhes: listaFormatada.length + ' parcela(s) com lembrete, ' + (template?.titulo || 'padrão'),
        quantidade_enviada: emailEnviado ? 1 : 0,
      });
    } catch (_e) {}

    // =====================================================
    // PILOTO WHATSAPP — Bloco isolado, máximo 1 envio por execução
    // Não interfere no e-mail já enviado acima.
    // =====================================================
    let whatsappResultado = null;

    try {
      const waEnabled = parseBooleanSecret(Deno.env.get('WHATSAPP_ENABLED'));
      const waTestMode = parseBooleanSecret(Deno.env.get('WHATSAPP_TEST_MODE'));
      const waTestPhone = Deno.env.get('WHATSAPP_TEST_PHONE') || '';
      const waInternalToken = Deno.env.get('WHATSAPP_INTERNAL_TOKEN') || '';

      if (waEnabled && waTestMode && waTestPhone && waInternalToken && listaFormatada.length > 0) {
        // Pega a primeira parcela elegível (com payment_link)
        const parcelaElegivel = listaFormatada.find((p) => p.payment_link && p.payment_link.trim() !== '' && p.parcela_id);

        if (parcelaElegivel) {
          const parcelaId = parcelaElegivel.parcela_id;
          const dataReferencia = new Date().toISOString().split('T')[0];
            const idempotencyKey = `lembrete_cobranca:${parcelaId}:${dataReferencia}:whatsapp:test`;

            // --- Consulta de idempotência: verificar se já existe log de sucesso com esta chave ---
            let jaEnviado = false;
            try {
              const logsExistentes = await base44.asServiceRole.entities.LogNotificacao.filter({
                idempotency_key: idempotencyKey,
                status: 'sucesso',
              });
              if (logsExistentes && logsExistentes.length > 0) {
                jaEnviado = true;
              }
            } catch (_e) {}

            if (jaEnviado) {
              whatsappResultado = { status: 'ignorado_duplicidade', idempotency_key: idempotencyKey };
            } else {
              // Montar mensagem de teste
              const valorFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parcelaElegivel.valor);
              const vencFmt = new Date(parcelaElegivel.vencimento + 'T00:00:00').toLocaleDateString('pt-BR');
              const mensagem = `Olá, ${parcelaElegivel.cliente}! 😊\n\nEste é um lembrete de teste da PRIME STORE.\n\nParcela: ${valorFmt}\nVencimento: ${vencFmt}\n\nLink para pagamento:\n${parcelaElegivel.payment_link}\n\nMensagem automática de teste.`;

              // Mascarar telefone de teste
              const testPhoneDigits = waTestPhone.replace(/\D/g, '');
              const maskedPhone = testPhoneDigits.length >= 6
                ? testPhoneDigits.substring(0, 2) + '*'.repeat(testPhoneDigits.length - 6) + testPhoneDigits.substring(testPhoneDigits.length - 4)
                : '***';

              // Chamar whatsappProvider via SDK com headers customizados (Bearer token)
              const providerResponse = await base44.functions.fetch('/whatsappProvider', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${waInternalToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  phone: waTestPhone,
                  message: mensagem,
                  parcela_id: parcelaId,
                  data_referencia: dataReferencia,
                  test_mode: true,
                  idempotency_key: idempotencyKey,
                }),
              });

              const providerResult = await providerResponse.json().catch(() => ({}));

              if (providerResult.success === true) {
                // Sucesso — registrar log
                const detalhes = JSON.stringify({
                  provider: 'zapi',
                  canal: 'whatsapp',
                  test_mode: true,
                  provider_status: 'aceito_pela_zapi',
                  http_status: providerResult.http_status || 200,
                  message_id: providerResult.message_id || '',
                  destination_masked: maskedPhone,
                  idempotency_key: idempotencyKey,
                });
                try {
                  await base44.functions.invoke('notificacaoCore', {
                    action: 'registrar',
                    config_id: configId,
                    tipo: TIPO,
                    status: 'sucesso',
                    destinatario: maskedPhone,
                    modo_teste: true,
                    duracao_ms: 0,
                    erro: null,
                    backend_function: 'whatsappProvider',
                    detalhes: detalhes,
                    quantidade_enviada: 1,
                    idempotency_key: idempotencyKey,
                  });
                } catch (_e) {}
                whatsappResultado = { status: 'aceito_pela_zapi', idempotency_key: idempotencyKey, destination_masked: maskedPhone };
              } else {
                // Erro — registrar log
                const detalhes = JSON.stringify({
                  provider: 'zapi',
                  canal: 'whatsapp',
                  test_mode: true,
                  provider_status: 'erro',
                  http_status: providerResult.http_status || 0,
                  error_code: providerResult.error_code || 'unknown',
                  destination_masked: maskedPhone,
                  idempotency_key: idempotencyKey,
                });
                try {
                  await base44.functions.invoke('notificacaoCore', {
                    action: 'registrar',
                    config_id: configId,
                    tipo: TIPO,
                    status: 'erro',
                    destinatario: maskedPhone,
                    modo_teste: true,
                    duracao_ms: 0,
                    erro: providerResult.error_code || 'erro_zapi',
                    backend_function: 'whatsappProvider',
                    detalhes: detalhes,
                    quantidade_enviada: 0,
                    idempotency_key: idempotencyKey,
                  });
                } catch (_e) {}
                whatsappResultado = { status: 'erro_zapi', error_code: providerResult.error_code || 'unknown', idempotency_key: idempotencyKey };
              }
            }
        }
      } else {
        whatsappResultado = { status: 'pulado_controles_desativados' };
      }
    } catch (waError) {
      whatsappResultado = { status: 'erro_isolado', error: waError.message };
    }

    return Response.json({
      success: true,
      data_vencimento: doisDiasStr,
      total_parcelas: listaFormatada.length,
      valor_total: listaFormatada.reduce((s, p) => s + p.valor, 0),
      template_usado: template?.titulo || 'Padrão (sem template)',
      parcelas: listaFormatada,
      email_destino: emailDestino,
      email_enviado: emailEnviado,
      modo_teste: isTest,
      status: status,
      whatsapp_piloto: whatsappResultado,
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