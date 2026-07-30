import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // Resolve o e-mail do administrador: usuário autenticado ou fallback para admin
    if (action === 'resolverEmail') {
      let emailDestino = null;
      try {
        const isAuthed = await base44.auth.isAuthenticated();
        if (isAuthed) {
          const user = await base44.auth.me();
          emailDestino = user?.email;
        }
      } catch (_e) {}
      if (!emailDestino) {
        const users = await base44.asServiceRole.entities.User.list();
        const admin = (users || []).find((u) => u.role === 'admin') || (users || [])[0];
        emailDestino = admin?.email;
      }
      return Response.json({ success: true, email: emailDestino });
    }

    // Registra log em LogNotificacao e atualiza ConfiguracaoNotificacao
    if (action === 'registrar') {
      const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

      await base44.asServiceRole.entities.LogNotificacao.create({
        config_id: body.config_id || null,
        tipo: body.tipo,
        status: body.status,
        destinatario: body.destinatario || '',
        modo_teste: body.modo_teste || false,
        duracao_ms: body.duracao_ms || 0,
        erro: body.erro || null,
        backend_function: body.backend_function || '',
        detalhes: body.detalhes || '',
        quantidade_enviada: body.quantidade_enviada || 0,
        idempotency_key: body.idempotency_key || null,
      });

      if (body.config_id) {
        const updateData = {
          ultimo_status: body.status,
          ultima_execucao: agora,
          ultimo_destinatario: body.destinatario || '',
          ultimo_erro: body.erro || null,
        };
        if (!body.modo_teste) {
          updateData.quantidade_enviada_hoje = body.quantidade_enviada || 0;
        }
        await base44.asServiceRole.entities.ConfiguracaoNotificacao.update(body.config_id, updateData);
      }

      return Response.json({ success: true });
    }

    return Response.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});