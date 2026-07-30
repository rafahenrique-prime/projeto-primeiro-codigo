/**
 * enviarConfirmacaoPagamentoWhatsapp — Backend Function dedicada e mínima (PRIME)
 *
 * Responsabilidade exclusiva: orquestrar, de forma centralizada num único isolate,
 * toda a confirmação de pagamento por WhatsApp — leitura/validação do template
 * TemplateWhatsApp (key: pagamento_confirmado), substituição de variáveis, verificação
 * de idempotência via LogNotificacao, chamada interna a whatsappProvider (mesma app,
 * WHATSAPP_INTERNAL_TOKEN) e registro do resultado. Único consumidor autorizado:
 * consultarStatusCobranca (Lyra), via WHATSAPP_LYRA_TO_PRIME_TOKEN — nunca aceita
 * WHATSAPP_INTERNAL_TOKEN como credencial externa desta function.
 *
 * A Lyra não escolhe nem interpreta template — envia só dados brutos mínimos do
 * pagamento/cliente. `template_key = "pagamento_confirmado"` é definido aqui dentro,
 * nunca confiado a quem chama.
 *
 * Acesso a entidades: TemplateWhatsApp (leitura) e LogNotificacao (leitura/escrita) —
 * nunca Cobranca, Recebimento, Cliente, Venda ou Parcela.
 *
 * Chave de idempotência sempre construída internamente (nunca aceita pronta):
 *   whatsapp_pagamento_confirmado:{cobranca_id}:{pix_payment_id}:{test|prod}
 *
 * Concorrência: a API de entidades do Base44 não tem, até onde foi possível confirmar,
 * nenhum mecanismo de constraint única/upsert atômico. Esta function usa tripla
 * checagem (antes do envio, imediatamente antes do envio, e após eventual falha ao
 * registrar o log de sucesso) como melhor defesa disponível — não alega atomicidade
 * total. Janela de corrida residual documentada, não escondida.
 *
 * Nunca registra/expõe: telefone completo, mensagem completa, tokens, pix_copia_cola,
 * resposta bruta da ZAP-API.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const WHATSAPP_PROVIDER_TIMEOUT_MS = 12000;
const CAMPOS_PERMITIDOS = ['phone', 'cobranca_id', 'pix_payment_id', 'cliente_nome', 'valor_recebido', 'data_pagamento', 'modo_teste'];
const TEMPLATE_KEY = 'pagamento_confirmado';
const TEMPLATE_VARS_PERMITIDAS = ['nome', 'valor', 'data_pagamento', 'loja'];

function erro(errorCode, extra) {
  return Response.json({ success: false, error_code: errorCode, ...(extra || {}) }, { status: 200 });
}

function maskPhone(phone) {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.length >= 6
    ? digits.substring(0, 2) + '*'.repeat(digits.length - 6) + digits.substring(digits.length - 4)
    : '***';
}

function comTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_resolve, reject) => setTimeout(() => reject({ __timeout: true }), ms)),
  ]);
}

function extrairVariaveisTemplate(mensagem) {
  const matches = mensagem.match(/\{([a-zA-Z_]+)\}/g) || [];
  return matches.map((m) => m.slice(1, -1));
}

function substituirVariaveisTemplate(mensagem, valores) {
  let resultado = mensagem;
  for (const chave of Object.keys(valores)) {
    resultado = resultado.split(`{${chave}}`).join(String(valores[chave]));
  }
  return resultado;
}

// Leitura e validação do template — TemplateWhatsApp existe só no PRIME, por isso
// esta responsabilidade nunca pode ficar do lado da Lyra. Sem fallback hardcoded:
// qualquer cenário inválido → não envia, nunca afeta o pagamento.
async function resolverTemplatePagamentoConfirmado(base44) {
  const base = { usar: false, template_id: null, template_version: null, mensagem: null };
  try {
    const registros = await base44.asServiceRole.entities.TemplateWhatsApp.filter({ key: TEMPLATE_KEY });

    if (!registros || registros.length === 0) {
      return { ...base, template_status: 'template_nao_encontrado' };
    }
    if (registros.length > 1) {
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
    const variavelNaoSuportada = variaveisUsadas.some((v) => !TEMPLATE_VARS_PERMITIDAS.includes(v));
    if (variavelNaoSuportada) {
      return { ...base, template_status: 'variavel_nao_suportada' };
    }

    return {
      usar: true,
      template_status: 'ok',
      template_id: registro.id,
      template_version: registro.updated_date || null,
      mensagem: registro.mensagem,
    };
  } catch (_err) {
    return { ...base, template_status: 'erro_leitura_template' };
  }
}

// --- Chamada interna a whatsappProvider — mesma app, WHATSAPP_INTERNAL_TOKEN.
// Nunca expõe o token, nunca repassa corpo bruto do provedor.
async function chamarWhatsappProviderInterno(base44, { phone, message, parcelaId }) {
  const internalToken = Deno.env.get('WHATSAPP_INTERNAL_TOKEN') || '';
  if (!internalToken) {
    return { ok: false, error_code: 'missing_internal_token' };
  }

  let resp;
  try {
    resp = await comTimeout(
      base44.functions.fetch('/whatsappProvider', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${internalToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          message_type: 'text',
          message,
          parcela_id: parcelaId,
          idempotency_key: `interno:${parcelaId}:${Date.now()}`, // só uso interno do whatsappProvider, não é a chave de idempotência de negócio
        }),
      }),
      WHATSAPP_PROVIDER_TIMEOUT_MS,
    );
  } catch (err) {
    if (err && err.__timeout) {
      return { ok: false, error_code: 'timeout_whatsapp_provider' };
    }
    return { ok: false, error_code: 'fetch_error_whatsapp_provider' };
  }

  let json = null;
  try {
    json = await resp.json();
  } catch (_e) {
    return { ok: false, error_code: 'invalid_response_format' };
  }

  if (json && json.success === true) {
    return { ok: true, message_id: json.message_id || null, provider_status: json.status || null };
  }

  return { ok: false, error_code: (json && json.error_code) || 'erro_whatsapp_provider' };
}

Deno.serve(async (req) => {
  try {
    // --- Autenticação isolada — exclusivamente WHATSAPP_LYRA_TO_PRIME_TOKEN.
    // Nunca aceita WHATSAPP_INTERNAL_TOKEN como credencial externa desta function. ---
    const authHeader = req.headers.get('Authorization') || '';
    const receivedToken = authHeader.replace(/^Bearer\s+/i, '');
    const lyraToken = Deno.env.get('WHATSAPP_LYRA_TO_PRIME_TOKEN') || '';

    if (!receivedToken || !lyraToken || receivedToken !== lyraToken) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));

    // --- Validação estrita de payload — allowlist explícita, dados brutos mínimos.
    // A Lyra nunca envia message/template_id/template_key — quem decide o template é
    // esta function, sempre internamente. ---
    const camposDesconhecidos = Object.keys(body || {}).filter((k) => !CAMPOS_PERMITIDOS.includes(k));
    if (camposDesconhecidos.length > 0) {
      return erro('campos_nao_permitidos', { campos: camposDesconhecidos });
    }
    if ('pix_copia_cola' in (body || {})) {
      return erro('campo_proibido_pix_copia_cola');
    }

    const { phone, cobranca_id, pix_payment_id, cliente_nome, valor_recebido, data_pagamento, modo_teste } = body;

    if (!phone || typeof phone !== 'string' || phone.trim() === '') {
      return erro('phone_ausente');
    }
    if (!cobranca_id || typeof cobranca_id !== 'string' || cobranca_id.trim() === '') {
      return erro('cobranca_id_ausente');
    }
    if (!pix_payment_id || typeof pix_payment_id !== 'string' || pix_payment_id.trim() === '') {
      return erro('pix_payment_id_ausente');
    }
    if (!cliente_nome || typeof cliente_nome !== 'string' || cliente_nome.trim() === '') {
      return erro('cliente_nome_ausente');
    }
    if (typeof valor_recebido !== 'number' || !Number.isFinite(valor_recebido) || valor_recebido <= 0) {
      return erro('valor_recebido_invalido');
    }
    if (!data_pagamento || typeof data_pagamento !== 'string' || !Number.isFinite(new Date(data_pagamento).getTime())) {
      return erro('data_pagamento_invalida');
    }
    if (typeof modo_teste !== 'boolean') {
      return erro('modo_teste_invalido');
    }

    const base44 = createClientFromRequest(req);
    const maskedPhone = maskPhone(phone);

    // --- Leitura e validação do template — internalizada, nunca confiada à Lyra ---
    const resolucaoTemplate = await resolverTemplatePagamentoConfirmado(base44);
    if (!resolucaoTemplate.usar) {
      return Response.json({
        success: true,
        status: 'not_sent',
        template_key: TEMPLATE_KEY,
        template_source: null,
        template_status: resolucaoTemplate.template_status,
        template_id: resolucaoTemplate.template_id,
        template_version: resolucaoTemplate.template_version,
      }, { status: 200 });
    }

    const primeiroNome = String(cliente_nome).split(' ')[0];
    const valorFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor_recebido);
    const dataFmt = new Date(data_pagamento).toLocaleDateString('pt-BR');
    const message = substituirVariaveisTemplate(resolucaoTemplate.mensagem, {
      nome: primeiroNome,
      valor: valorFmt,
      data_pagamento: dataFmt,
      loja: 'PRIME STORE',
    });

    // --- Chave de idempotência construída internamente — nunca aceita pronta da Lyra ---
    const sufixo = modo_teste ? 'test' : 'prod';
    const idempotencyKey = `whatsapp_pagamento_confirmado:${cobranca_id}:${pix_payment_id}:${sufixo}`;

    const metadadosBase = {
      template_key: TEMPLATE_KEY,
      template_source: 'template_whatsapp',
      template_status: resolucaoTemplate.template_status,
      template_id: resolucaoTemplate.template_id,
      template_version: resolucaoTemplate.template_version,
    };

    // --- 1ª checagem de idempotência ---
    try {
      const existentes = await base44.asServiceRole.entities.LogNotificacao.filter({
        idempotency_key: idempotencyKey,
        status: 'sucesso',
      });
      if (existentes && existentes.length > 0) {
        return Response.json({
          success: true,
          status: 'ignored_duplicate',
          already_sent: true,
          log_id: existentes[0].id,
          idempotency_key: idempotencyKey,
          ...metadadosBase,
        }, { status: 200 });
      }
    } catch (_e) {
      return erro('erro_verificar_idempotencia');
    }

    // --- 2ª checagem, imediatamente antes do envio — reduz (não elimina) a janela de
    // corrida entre duas execuções concorrentes. A API de entidades do Base44 não tem,
    // até onde foi possível confirmar, nenhuma constraint única/upsert atômico — esta
    // é a melhor defesa disponível sem essa capacidade. Uma janela residual permanece
    // entre esta checagem e a criação do LogNotificacao de sucesso (linhas abaixo);
    // documentado, não escondido. ---
    try {
      const existentes2 = await base44.asServiceRole.entities.LogNotificacao.filter({
        idempotency_key: idempotencyKey,
        status: 'sucesso',
      });
      if (existentes2 && existentes2.length > 0) {
        return Response.json({
          success: true,
          status: 'ignored_duplicate',
          already_sent: true,
          log_id: existentes2[0].id,
          idempotency_key: idempotencyKey,
          ...metadadosBase,
        }, { status: 200 });
      }
    } catch (_e) {
      return erro('erro_verificar_idempotencia');
    }

    // --- Envio — exatamente uma chamada, sem retry ---
    const resultadoEnvio = await chamarWhatsappProviderInterno(base44, {
      phone,
      message,
      parcelaId: cobranca_id,
    });

    if (resultadoEnvio.ok) {
      let logId = null;
      try {
        const log = await base44.asServiceRole.entities.LogNotificacao.create({
          status: 'sucesso',
          tipo: TEMPLATE_KEY,
          backend_function: 'whatsappProvider',
          destinatario: maskedPhone,
          quantidade_enviada: 1,
          modo_teste,
          idempotency_key: idempotencyKey,
          detalhes: JSON.stringify({
            canal: 'whatsapp',
            template_key: TEMPLATE_KEY,
            template_id: resolucaoTemplate.template_id,
            template_version: resolucaoTemplate.template_version,
            cobranca_id,
            pix_payment_id,
            message_id: resultadoEnvio.message_id,
          }),
        });
        logId = log.id;
      } catch (_e) {
        // --- 3ª checagem, após eventual falha ao registrar o log de sucesso ---
        // A mensagem já foi enviada nesta execução; se a criação do log falhar, uma
        // execução concorrente pode ter registrado sucesso entre a 2ª checagem e agora.
        // Não reenvia em nenhuma hipótese — só reflete o estado real encontrado.
        try {
          const existentes3 = await base44.asServiceRole.entities.LogNotificacao.filter({
            idempotency_key: idempotencyKey,
            status: 'sucesso',
          });
          if (existentes3 && existentes3.length > 0) {
            logId = existentes3[0].id;
          }
        } catch (_e2) {
          // segue sem log_id — envio ocorreu, registro não pôde ser confirmado
        }
      }

      return Response.json({
        success: true,
        status: 'sent',
        already_sent: false,
        log_id: logId,
        idempotency_key: idempotencyKey,
        destination_masked: maskedPhone,
        message_id: resultadoEnvio.message_id || null,
        ...metadadosBase,
      }, { status: 200 });
    }

    // --- Falha no envio — registra tentativa com status erro, nunca faz retry ---
    try {
      await base44.asServiceRole.entities.LogNotificacao.create({
        status: 'erro',
        tipo: TEMPLATE_KEY,
        backend_function: 'whatsappProvider',
        destinatario: maskedPhone,
        quantidade_enviada: 0,
        modo_teste,
        erro: resultadoEnvio.error_code,
        idempotency_key: idempotencyKey,
        detalhes: JSON.stringify({
          canal: 'whatsapp',
          template_key: TEMPLATE_KEY,
          template_id: resolucaoTemplate.template_id,
          cobranca_id,
          pix_payment_id,
          error_code: resultadoEnvio.error_code,
        }),
      });
    } catch (_e) {
      // Falha ao registrar o erro não deve mascarar o erro original de envio.
    }

    return Response.json({
      success: false,
      status: 'send_failed',
      already_sent: false,
      error_code: resultadoEnvio.error_code,
      idempotency_key: idempotencyKey,
      destination_masked: maskedPhone,
      ...metadadosBase,
    }, { status: 200 });
  } catch (_error) {
    return erro('erro_interno');
  }
});
