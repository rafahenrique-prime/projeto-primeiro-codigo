import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const forceTipo = body.force_tipo || null;
    const simularHora = body.simular_hora || null;

    // Auth guard: block non-admins; allow cron (no auth) and admins
    try {
      const isAuthed = await base44.auth.isAuthenticated();
      if (isAuthed) {
        const user = await base44.auth.me();
        if (user && user.role !== 'admin') {
          return Response.json({ error: 'Forbidden' }, { status: 403 });
        }
      }
    } catch (_e) {}

    // Current SP time
    const now = new Date();
    const spParts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
    let spHour = 0, spMinute = 0;
    for (const p of spParts) {
      if (p.type === 'hour') spHour = parseInt(p.value, 10) || 0;
      if (p.type === 'minute') spMinute = parseInt(p.value, 10) || 0;
    }
    if (simularHora) {
      const [sh, sm] = simularHora.split(':').map((x) => parseInt(x, 10) || 0);
      spHour = sh; spMinute = sm;
    }
    const spMinutes = spHour * 60 + spMinute;
    const spHHMM = String(spHour).padStart(2, '0') + ':' + String(spMinute).padStart(2, '0');
    const spDateStr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const startOfTodaySP = new Date(spDateStr + 'T00:00:00-03:00').getTime();

    // Load active configs
    const configs = await base44.asServiceRole.entities.ConfiguracaoNotificacao.filter({ ativo: true }, 'tipo', 50);
    const resultados = [];

    for (const config of (configs || [])) {
      try {
        if (forceTipo && config.tipo !== forceTipo) continue;

        const horario = config.horario || '00:00';
        const [h, m] = horario.split(':').map((x) => parseInt(x, 10) || 0);
        const scheduledMinutes = h * 60 + m;

        // Check if scheduled time has passed today (bypassed in force mode)
        if (!forceTipo && spMinutes < scheduledMinutes) {
          resultados.push({ tipo: config.tipo, acao: 'pulado', motivo: 'horario_nao_chegou', horario, agora: spHHMM });
          continue;
        }

        // Idempotency: check if already executed today (real sucesso/sem_dados, not test)
        const logs = await base44.asServiceRole.entities.LogNotificacao.filter({ config_id: config.id }, '-created_date', 5);
        const jaExecutou = (logs || []).some((l) => {
          if (l.modo_teste) return false;
          if (l.status !== 'sucesso' && l.status !== 'sem_dados') return false;
          return new Date(l.created_date).getTime() >= startOfTodaySP;
        });

        if (!forceTipo && jaExecutou) {
          resultados.push({ tipo: config.tipo, acao: 'pulado', motivo: 'ja_executado_hoje', horario, agora: spHHMM });
          continue;
        }

        // Invoke the backend function (real execution)
        await base44.functions.invoke(config.backend_function, { isTest: false, config_id: config.id });

        // Update proxima_execucao (tomorrow at scheduled time)
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(tomorrow);
        try {
          await base44.asServiceRole.entities.ConfiguracaoNotificacao.update(config.id, {
            proxima_execucao: tomorrowStr + ' às ' + horario,
          });
        } catch (_e) {}

        resultados.push({ tipo: config.tipo, acao: 'executado', horario, agora: spHHMM });
      } catch (e) {
        try {
          await base44.functions.invoke('notificacaoCore', {
            action: 'registrar',
            config_id: config.id,
            tipo: config.tipo,
            status: 'erro',
            destinatario: '',
            modo_teste: false,
            duracao_ms: 0,
            erro: e.message,
            backend_function: config.backend_function || '',
            detalhes: 'Erro capturado pelo scheduler automatico',
            quantidade_enviada: 0,
          });
        } catch (_e2) {}
        resultados.push({ tipo: config.tipo, acao: 'erro', erro: e.message });
      }
    }

    return Response.json({ success: true, sp_agora: spHHMM, data: spDateStr, timezone: 'America/Sao_Paulo', resultados });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});