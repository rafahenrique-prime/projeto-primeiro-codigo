import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const LYRA_GERAR_PIX_PARCELA_URL = 'https://lyra-663dc63d.base44.app/functions/gerarPixParcela';
const LYRA_RESOLVER_CLIENTE_PIX_URL = 'https://lyra-663dc63d.base44.app/functions/resolverClientePix';
const GERAR_PIX_PARCELA_TIMEOUT_MS = 12000;
const RESOLVER_CLIENTE_TIMEOUT_MS = 10000;

function normalizePhoneDigits(raw) {
  return (raw || '').replace(/\D/g, '');
}

// Validação estrita do contexto de simulação — exclusivo de isTest=true. Qualquer
// campo ausente/malformado bloqueia a simulação (test_pix_context_invalido), nunca
// cai silenciosamente na seleção real nem chama a Lyra.
function validarTestPixContext(ctx) {
  if (!ctx.parcela_id || typeof ctx.parcela_id !== 'string' || ctx.parcela_id.trim() === '') {
    return { valido: false, motivo: 'parcela_id_invalido' };
  }
  if (!ctx.cliente_nome || typeof ctx.cliente_nome !== 'string' || ctx.cliente_nome.trim() === '') {
    return { valido: false, motivo: 'cliente_nome_invalido' };
  }
  if (typeof ctx.valor !== 'number' || !Number.isFinite(ctx.valor) || ctx.valor <= 0) {
    return { valido: false, motivo: 'valor_invalido' };
  }
  if (!ctx.vencimento || typeof ctx.vencimento !== 'string' || !Number.isFinite(new Date(ctx.vencimento).getTime())) {
    return { valido: false, motivo: 'vencimento_invalido' };
  }
  if (!ctx.cliente_telefone || typeof ctx.cliente_telefone !== 'string' || ctx.cliente_telefone.trim() === '') {
    return { valido: false, motivo: 'cliente_telefone_ausente' };
  }
  if (!Number.isInteger(ctx.numero_parcela) || ctx.numero_parcela <= 0) {
    return { valido: false, motivo: 'numero_parcela_invalido' };
  }
  if (!Number.isInteger(ctx.total_parcelas) || ctx.total_parcelas <= 0) {
    return { valido: false, motivo: 'total_parcelas_invalido' };
  }
  if (ctx.numero_parcela > ctx.total_parcelas) {
    return { valido: false, motivo: 'numero_parcela_maior_que_total' };
  }
  return { valido: true };
}

function classificarErroHttp(httpStatus) {
  if (httpStatus === 400) return 'bad_request';
  if (httpStatus === 401 || httpStatus === 403) return 'invalid_credentials';
  if (httpStatus === 404) return 'not_found';
  if (httpStatus === 429) return 'rate_limit';
  if (httpStatus >= 500) return 'provider_unavailable';
  return 'unknown';
}

// --- Resolução do Cliente na Lyra — exclusivamente via HTTP autenticado à Backend
// Function dedicada resolverClientePix (Lyra), com RESOLVER_CLIENTE_PIX_TOKEN próprio.
// Não usa createClient cross-app, não usa BASE44_API_KEY, não acessa entities.Cliente
// diretamente — todo o acesso à entidade Cliente da Lyra é responsabilidade exclusiva
// de resolverClientePix, já auditada e testada isoladamente.
async function resolverClientePixNaLyra({ nome, telefone, prime_cliente_id }) {
  const token = Deno.env.get('RESOLVER_CLIENTE_PIX_TOKEN') || '';
  if (!token) {
    return { ok: false, error_code: 'missing_resolver_token' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RESOLVER_CLIENTE_TIMEOUT_MS);

  let resp;
  try {
    resp = await fetch(LYRA_RESOLVER_CLIENTE_PIX_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, telefone, prime_cliente_id }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const error_code = err.name === 'AbortError' ? 'timeout_resolver_cliente' : 'fetch_error_resolver_cliente';
    return { ok: false, error_code };
  }
  clearTimeout(timeoutId);

  let json = null;
  try {
    json = await resp.json();
  } catch (_parseErr) {
    return { ok: false, error_code: 'invalid_response_format', http_status: resp.status };
  }

  if (!resp.ok) {
    return { ok: false, error_code: classificarErroHttp(resp.status), http_status: resp.status };
  }
  if (!json || json.success !== true || !json.cliente_id || typeof json.cliente_id !== 'string') {
    return { ok: false, error_code: 'invalid_resolver_response', http_status: resp.status };
  }

  return { ok: true, clienteLyraId: json.cliente_id, created: json.created === true };
}

// --- Geração/reuso do Pix dinâmico — exclusivamente via HTTP autenticado à Backend
// Function dedicada gerarPixParcela (Lyra), com GERAR_PIX_PARCELA_TOKEN próprio.
// Não usa api_key, não usa BASE44_API_KEY, nunca chama criarCobranca diretamente —
// toda a lógica financeira (pix_version, expiração, reuso, concorrência, parsing
// da Orders API, persistência) é responsabilidade exclusiva de gerarPixParcela/
// criarCobranca, já auditadas e testadas isoladamente.
async function gerarPixParcelaNaLyra(payload) {
  const token = Deno.env.get('GERAR_PIX_PARCELA_TOKEN') || '';
  if (!token) {
    return { ok: false, error_code: 'missing_gerar_pix_token' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GERAR_PIX_PARCELA_TIMEOUT_MS);

  let resp;
  try {
    resp = await fetch(LYRA_GERAR_PIX_PARCELA_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const error_code = err.name === 'AbortError' ? 'timeout_gerar_pix' : 'fetch_error_gerar_pix';
    return { ok: false, error_code };
  }
  clearTimeout(timeoutId);

  let json = null;
  try {
    json = await resp.json();
  } catch (_parseErr) {
    return { ok: false, error_code: 'invalid_response_format', http_status: resp.status };
  }

  // Caso especial: trava estrutural de PIX_PILOTO_HABILITADO (HTTP 200, success=false) —
  // não é erro interno, é o gate de segurança da Lyra ainda desligado.
  if (json && json.success === false && json.error_code === 'pix_piloto_desabilitado') {
    return { ok: false, error_code: 'pix_piloto_desabilitado', pilotoDesabilitado: true };
  }

  if (!resp.ok) {
    return { ok: false, error_code: (json && json.error_code) || classificarErroHttp(resp.status), http_status: resp.status };
  }
  if (!json || json.success !== true) {
    return { ok: false, error_code: (json && json.error_code) || 'invalid_gerar_pix_response', http_status: resp.status };
  }

  return { ok: true, json };
}

// Validação defensiva da resposta de gerarPixParcela — nunca confia cegamente no JSON
// recebido, mesmo já vindo filtrado/validado por ela (defesa em profundidade).
function validarRespostaPix(json) {
  if (!json || json.success !== true) return { valido: false, motivo: 'success !== true' };
  if (!json.cobranca_id || typeof json.cobranca_id !== 'string') return { valido: false, motivo: 'cobranca_id ausente' };
  if (!json.pix_order_id || typeof json.pix_order_id !== 'string') return { valido: false, motivo: 'pix_order_id ausente' };
  if (!json.pix_copia_cola || typeof json.pix_copia_cola !== 'string') return { valido: false, motivo: 'pix_copia_cola ausente' };
  if (!Number.isInteger(json.pix_version) || json.pix_version <= 0) return { valido: false, motivo: 'pix_version inválido' };
  if (json.pix_status !== 'pendente') return { valido: false, motivo: 'pix_status não é pendente' };
  if (!json.pix_expires_at) return { valido: false, motivo: 'pix_expires_at ausente' };
  const expira = new Date(json.pix_expires_at).getTime();
  if (!Number.isFinite(expira) || expira <= Date.now()) return { valido: false, motivo: 'pix_expires_at não está no futuro' };
  return { valido: true };
}

function maskPhoneDigits(digits) {
  return digits.length >= 6
    ? digits.substring(0, 2) + '*'.repeat(digits.length - 6) + digits.substring(digits.length - 4)
    : '***';
}

// --- Conexão do Template Lembrete Automático (Fase 1) ---
// Única fonte de variáveis suportadas — qualquer outra (incluindo total_parcelas, que
// não existe de forma confiável no caminho real hoje) torna o template incompatível
// e força o fallback, nunca bloqueando o envio financeiro por causa disso.
const TEMPLATE_LEMBRETE_VARS_PERMITIDAS = ['nome', 'valor', 'vencimento', 'pix', 'loja', 'parcela'];

function extrairVariaveisTemplate(mensagem) {
  const matches = mensagem.match(/\{([a-zA-Z_]+)\}/g) || [];
  return matches.map((m) => m.slice(1, -1));
}

// Substituição global de todas as ocorrências — nunca insere pix_copia_cola aqui
// (quem chama já resolve {pix} para uma frase curta, nunca para o BR Code).
function substituirVariaveisTemplate(mensagem, valores) {
  let resultado = mensagem;
  for (const chave of Object.keys(valores)) {
    resultado = resultado.split(`{${chave}}`).join(String(valores[chave]));
  }
  return resultado;
}

// Consulta TemplateWhatsApp (key: lembrete_automatico) com fallback integral para a
// mensagem hardcoded em qualquer cenário que não seja exatamente "1 registro, ativo,
// conectado, mensagem válida, só variáveis suportadas". Nunca lança — falha de leitura
// de template nunca é tratada como falha financeira nem falha do Pix.
async function resolverMensagemLembreteAutomatico(base44, { mensagemFallback, valores }) {
  const base = {
    mensagem: mensagemFallback,
    template_source: 'fallback_hardcoded',
    template_status: 'fallback',
    template_id: null,
    template_version: null,
  };
  try {
    const registros = await base44.asServiceRole.entities.TemplateWhatsApp.filter({ key: 'lembrete_automatico' });

    if (!registros || registros.length === 0) {
      return { ...base, template_status: 'template_nao_encontrado' };
    }
    if (registros.length > 1) {
      // Nunca escolhe o primeiro — sem alterar/apagar nenhum registro.
      return { ...base, template_status: 'duplicate_template_records' };
    }

    const registro = registros[0];
    if (registro.ativo !== true) {
      return { ...base, template_status: 'template_inativo' };
    }
    if (registro.conectado !== true) {
      return { ...base, template_status: 'template_desconectado' };
    }
    if (typeof registro.mensagem !== 'string' || registro.mensagem.trim() === '') {
      return { ...base, template_status: 'template_mensagem_vazia' };
    }

    const variaveisUsadas = extrairVariaveisTemplate(registro.mensagem);
    const variavelNaoSuportada = variaveisUsadas.some((v) => !TEMPLATE_LEMBRETE_VARS_PERMITIDAS.includes(v));
    if (variavelNaoSuportada) {
      return { ...base, template_status: 'variavel_nao_suportada' };
    }

    return {
      mensagem: substituirVariaveisTemplate(registro.mensagem, valores),
      template_source: 'template_whatsapp',
      template_status: 'ok',
      template_id: registro.id,
      template_version: registro.updated_date || null,
    };
  } catch (_err) {
    // Entidade indisponível/erro de leitura — nunca propaga, sempre cai no fallback.
    return { ...base, template_status: 'erro_leitura_template' };
  }
}

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

    // =====================================================================
    // FASE 1 PROTEGIDA — Pix dinâmico via WhatsApp (pix_text)
    // Bloco isolado em try/catch próprio — nenhum erro aqui afeta o e-mail já enviado acima.
    // Gate novo (PIX_AUTOMATICO_ENABLED) é independente de PIX_PILOTO_HABILITADO (trava
    // interna de criarCobranca, na Lyra) — os dois precisam estar "true" pra geração real
    // ocorrer; nesta fase ambos permanecem false.
    // =====================================================================
    let whatsappResultado = null;

    try {
      const waEnabled = parseBooleanSecret(Deno.env.get('WHATSAPP_ENABLED'));
      const waTestMode = parseBooleanSecret(Deno.env.get('WHATSAPP_TEST_MODE'));
      const waTestPhone = Deno.env.get('WHATSAPP_TEST_PHONE') || '';
      const waInternalToken = Deno.env.get('WHATSAPP_INTERNAL_TOKEN') || '';
      const pixAutomaticoEnabled = parseBooleanSecret(Deno.env.get('PIX_AUTOMATICO_ENABLED'));

      // --- Tokens das Backend Functions dedicadas — checados aqui (gates 6 e 7),
      // antes de qualquer parcela elegível ser processada, para nunca chegar perto
      // de chamar a Lyra sem eles. ---
      const resolverClienteToken = Deno.env.get('RESOLVER_CLIENTE_PIX_TOKEN') || '';
      const gerarPixToken = Deno.env.get('GERAR_PIX_PARCELA_TOKEN') || '';

      if (!(waEnabled && waTestMode && waTestPhone && waInternalToken)) {
        whatsappResultado = { status: 'pulado_controles_desativados' };
      } else if (!pixAutomaticoEnabled) {
        // Gate específico desta automação — sem tocar Lyra, gerarPixParcela ou whatsappProvider.
        whatsappResultado = { status: 'pulado_pix_automatico_desativado' };
      } else if (!resolverClienteToken) {
        whatsappResultado = { status: 'erro_config_resolver_cliente_token_ausente' };
      } else if (!gerarPixToken) {
        whatsappResultado = { status: 'erro_config_gerar_pix_token_ausente' };
      } else {
        // =====================================================================
        // Modo de simulação controlada — exclusivo de chamada manual isTest=true.
        // Existe só em memória, nunca persiste nada em entities.Parcela/Cliente/
        // Venda/Cobranca. Todas as 4 condições precisam ser verdadeiras, senão o
        // contexto é ignorado silenciosamente e o caminho real de produção segue
        // normalmente (mesmo comportamento de antes desta mudança).
        // =====================================================================
        const testPixContext = body.test_pix_context;
        const waTestPhoneNormalizado = normalizePhoneDigits(waTestPhone);
        const telefoneSimuladoNormalizado = testPixContext ? normalizePhoneDigits(testPixContext.cliente_telefone) : '';

        // Tentativa de simulação: todos os gates externos batem (isTest, enabled,
        // testMode, pixAutomaticoEnabled, telefone == WHATSAPP_TEST_PHONE). Se algum
        // desses falhar, a simulação é ignorada silenciosamente e o caminho real segue
        // normalmente — só entra na validação de conteúdo abaixo se a tentativa for real.
        const tentativaSimulacao = Boolean(
          isTest === true &&
          testPixContext &&
          testPixContext.enabled === true &&
          waTestMode &&
          pixAutomaticoEnabled &&
          telefoneSimuladoNormalizado &&
          telefoneSimuladoNormalizado === waTestPhoneNormalizado,
        );

        let parcelaElegivel = null;
        let simulacaoValida = false;
        let pixRealAutorizadoNaSimulacao = false;

        if (tentativaSimulacao) {
          const validacaoContexto = validarTestPixContext(testPixContext);
          if (!validacaoContexto.valido) {
            // Contexto incompleto/inválido — bloqueia aqui mesmo, nunca cai na seleção
            // real nem chama a Lyra.
            whatsappResultado = { status: 'test_pix_context_invalido', motivo: validacaoContexto.motivo };
          } else {
            simulacaoValida = true;
            parcelaElegivel = {
              parcela_id: String(testPixContext.parcela_id),
              cliente: testPixContext.cliente_nome,
              parcela: `${testPixContext.numero_parcela}ª`,
              valor: Number(testPixContext.valor),
              vencimento: testPixContext.vencimento,
              telefone: testPixContext.cliente_telefone,
            };

            // --- Autorização explícita para permitir Pix real dentro da simulação ---
            // TODAS as condições abaixo precisam ser verdadeiras — qualquer uma falhando
            // mantém o bloqueio padrão (simulacao_bloqueada_pix_real_inesperado). Nunca
            // acionável pelo scheduler (exige isTest===true) nem com isTest=false.
            pixRealAutorizadoNaSimulacao = Boolean(
              isTest === true &&
              body.allow_real_pix_in_simulation === true &&
              waTestMode &&
              waEnabled &&
              pixAutomaticoEnabled &&
              telefoneSimuladoNormalizado === waTestPhoneNormalizado &&
              typeof testPixContext.parcela_id === 'string' &&
              testPixContext.parcela_id.startsWith('teste-') &&
              typeof testPixContext.valor === 'number' &&
              testPixContext.valor > 0 &&
              testPixContext.valor <= 1.00,
            );
          }
        } else {
          // --- Parcela elegível pelas regras atuais de lembrete (payment_link não é mais critério) ---
          parcelaElegivel = listaFormatada.find((p) => p.telefone && p.telefone.trim() !== '' && p.parcela_id);
        }

        if (whatsappResultado) {
          // test_pix_context_invalido já setado acima — não avança mais nada.
        } else if (!parcelaElegivel) {
          whatsappResultado = { status: 'sem_parcela_elegivel_pix' };
        } else {
          const parcelaId = parcelaElegivel.parcela_id;

          // --- 1. Resolver Cliente na Lyra — exclusivamente via resolverClientePix (HTTP) ---
          const resolucaoCliente = await resolverClientePixNaLyra({
            nome: parcelaElegivel.cliente,
            telefone: parcelaElegivel.telefone,
            prime_cliente_id: parcelaId,
          });

          if (!resolucaoCliente.ok) {
            whatsappResultado = { status: 'erro_resolver_cliente_lyra', error_code: resolucaoCliente.error_code };
          } else {
            // --- 2. Chamar gerarPixParcela (metodo_pagamento: pix_dinamico) — nunca criarCobranca diretamente ---
            const descricaoDeterministica = `Parcela ${parcelaElegivel.parcela} - Lembrete automático${simulacaoValida ? ' (SIMULAÇÃO)' : ''}`;
            const resultadoGerarPix = await gerarPixParcelaNaLyra({
              cliente_id: resolucaoCliente.clienteLyraId,
              cliente_nome: parcelaElegivel.cliente,
              valor: parcelaElegivel.valor,
              vencimento: parcelaElegivel.vencimento,
              descricao: descricaoDeterministica,
              prime_parcela_id: parcelaId,
              metodo_pagamento: 'pix_dinamico',
            });

            if (simulacaoValida && resultadoGerarPix.ok && !pixRealAutorizadoNaSimulacao) {
              // Defesa em profundidade: se por qualquer motivo (ex.: PIX_PILOTO_HABILITADO
              // ligado sem querer) a Lyra chegasse a gerar um Pix de verdade durante uma
              // simulação SEM autorização explícita, bloqueia aqui mesmo — nunca chama
              // whatsappProvider nem registra LogNotificacao de sucesso a partir de um
              // contexto simulado não autorizado. A trava só é contornada quando
              // pixRealAutorizadoNaSimulacao já validou todas as condições (ver acima).
              whatsappResultado = { status: 'simulacao_bloqueada_pix_real_inesperado' };
            } else if (resultadoGerarPix.pilotoDesabilitado) {
              // Trava estrutural da Lyra (PIX_PILOTO_HABILITADO) ainda desligada — não é
              // erro, não chama whatsappProvider, não cria LogNotificacao de sucesso.
              whatsappResultado = { status: 'pulado_pix_piloto_desabilitado' };
            } else if (!resultadoGerarPix.ok) {
              whatsappResultado = { status: 'erro_gerar_pix_parcela', error_code: resultadoGerarPix.error_code };
            } else {
              const validacaoPix = validarRespostaPix(resultadoGerarPix.json);
              if (!validacaoPix.valido) {
                whatsappResultado = { status: 'pix_invalido', error_code: validacaoPix.motivo };
              } else {
                const pixOrderId = resultadoGerarPix.json.pix_order_id;
                const pixVersion = resultadoGerarPix.json.pix_version;
                const pixCopiaCola = resultadoGerarPix.json.pix_copia_cola;

                // --- 3. Idempotência — antes de qualquer chamada ao whatsappProvider ---
                const idempotencyKey = `whatsapp_pix:${parcelaId}:${pixOrderId}:v${pixVersion}:test`;

                let jaEnviado = false;
                try {
                  const logsExistentes = await base44.asServiceRole.entities.LogNotificacao.filter({
                    idempotency_key: idempotencyKey,
                    status: 'sucesso',
                  });
                  if (logsExistentes && logsExistentes.length > 0) jaEnviado = true;
                } catch (_e) {}

                if (jaEnviado) {
                  whatsappResultado = { status: 'ignorado_duplicidade_pix', idempotency_key: idempotencyKey };
                } else {
                  // --- 4. Montar texto premium e chamar whatsappProvider ---
                  const primeiroNome = (parcelaElegivel.cliente || '').split(' ')[0];
                  const valorFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parcelaElegivel.valor);
                  const vencFmt = new Date(parcelaElegivel.vencimento + 'T00:00:00').toLocaleDateString('pt-BR');
                  // Mensagem hardcoded preservada byte a byte como fallback — nunca removida nesta fase.
                  const mensagemFallbackHardcoded = `👋 Olá, ${primeiroNome}!\n\nSua parcela está disponível para pagamento.\n\n💰 Valor: ${valorFmt}\n📅 Vencimento: ${vencFmt}\n⚡ Pagamento via Pix\n\nNa próxima mensagem está o código Pix Copia e Cola.\nToque e segure o código para copiar.`;

                  const resolucaoTemplate = await resolverMensagemLembreteAutomatico(base44, {
                    mensagemFallback: mensagemFallbackHardcoded,
                    valores: {
                      nome: primeiroNome,
                      valor: valorFmt,
                      vencimento: vencFmt,
                      // {pix} nunca recebe o BR Code aqui — o fluxo pix_text já envia o código
                      // completo na segunda mensagem, separadamente.
                      pix: 'O Pix Copia e Cola será enviado na próxima mensagem.',
                      loja: nomeLoja,
                      parcela: parcelaElegivel.parcela,
                    },
                  });
                  const mensagemApresentacao = resolucaoTemplate.mensagem;

                  const testPhoneDigits = normalizePhoneDigits(waTestPhone);
                  const maskedPhone = maskPhoneDigits(testPhoneDigits);

                  const providerResponse = await base44.functions.fetch('/whatsappProvider', {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${waInternalToken}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      phone: waTestPhone, // destino continua o telefone de teste durante o piloto
                      message_type: 'pix_text',
                      message: mensagemApresentacao,
                      pix_copia_cola: pixCopiaCola,
                      parcela_id: parcelaId,
                      pix_order_id: pixOrderId,
                      pix_version: pixVersion,
                    }),
                  });

                  const providerResult = await providerResponse.json().catch(() => ({}));

                  if (providerResult.success === true) {
                    const detalhes = JSON.stringify({
                      provider: 'zapapi',
                      canal: 'whatsapp',
                      message_type: 'pix_text',
                      parcela_id: parcelaId,
                      pix_order_id: pixOrderId,
                      pix_version: pixVersion,
                      calls_made: providerResult.calls_made || 0,
                      presentation_message_id: providerResult.presentation_message_id || '',
                      pix_message_id: providerResult.pix_message_id || '',
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
                    whatsappResultado = {
                      status: 'sent',
                      idempotency_key: idempotencyKey,
                      destination_masked: maskedPhone,
                      calls_made: providerResult.calls_made,
                      template_key: 'lembrete_automatico',
                      template_source: resolucaoTemplate.template_source,
                      template_status: resolucaoTemplate.template_status,
                      template_id: resolucaoTemplate.template_id,
                      template_version: resolucaoTemplate.template_version,
                    };
                  } else {
                    // Falha (parcial ou total) — nunca faz retry, apenas registra.
                    const detalhes = JSON.stringify({
                      provider: 'zapapi',
                      canal: 'whatsapp',
                      message_type: 'pix_text',
                      provider_status: providerResult.status || 'erro',
                      presentation_sent: providerResult.presentation_sent ?? null,
                      pix_sent: providerResult.pix_sent ?? null,
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
                        erro: providerResult.error_code || 'erro_pix_text',
                        backend_function: 'whatsappProvider',
                        detalhes: detalhes,
                        quantidade_enviada: 0,
                        idempotency_key: idempotencyKey,
                      });
                    } catch (_e) {}
                    whatsappResultado = {
                      status: providerResult.status || 'erro_pix_text',
                      error_code: providerResult.error_code || 'unknown',
                      idempotency_key: idempotencyKey,
                      template_key: 'lembrete_automatico',
                      template_source: resolucaoTemplate.template_source,
                      template_status: resolucaoTemplate.template_status,
                      template_id: resolucaoTemplate.template_id,
                      template_version: resolucaoTemplate.template_version,
                    };
                  }
                }
              }
            }
          }
        }
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
