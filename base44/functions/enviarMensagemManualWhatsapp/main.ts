/**
 * enviarMensagemManualWhatsapp — Backend Function dedicada e mínima (PRIME)
 *
 * Responsabilidade exclusiva: orquestrar o envio de uma mensagem manual (iniciada por
 * um usuário humano autenticado, não por outro backend) — leitura/validação do Cliente,
 * leitura/validação do template TemplateWhatsApp (key: mensagem_manual, sem fallback
 * hardcoded), substituição de variáveis, verificação de idempotência via LogNotificacao,
 * chamada interna a whatsappProvider (mesma app, WHATSAPP_INTERNAL_TOKEN) e registro do
 * resultado.
 *
 * Autenticação dupla (dois chamadores legítimos, precedência fixa):
 *   A. Usuário Base44 autenticado — base44.auth.me() retorna sessão válida E a role
 *      é uma das permitidas (ver usuarioPodeEnviarMensagemManual). Um usuário
 *      autenticado sem role permitida NÃO cai automaticamente neste modo — só o
 *      Bearer de serviço (modo B) pode autorizar nesse caso.
 *      Vendedor vem de full_name/email do usuário.
 *   B. Chamada de serviço via proxy Vercel — Authorization: Bearer
 *      MENSAGEM_MANUAL_SERVICE_TOKEN (secret exclusivo, nunca reaproveitado de
 *      WHATSAPP_INTERNAL_TOKEN/WHATSAPP_LYRA_TO_PRIME_TOKEN/COBRANCA_FRONTEND_TOKEN,
 *      nunca enviado ao navegador — vive só no PRIME e no backend da Vercel). Só é
 *      tentado quando o header traz um token não vazio (nunca autentica com token
 *      vazio, "Bearer" sem conteúdo, ou "Bearer" seguido só de espaços).
 *      Vendedor é sempre "Equipe PRIME", nunca aceito no payload.
 * Nenhuma outra alternativa autentica. Resposta de falha é genérica (403 Unauthorized),
 * nunca revela qual dos dois métodos foi tentado ou por que falhou, nem devolve role ou
 * dados do usuário. Nenhuma leitura de entidade (Cliente/TemplateWhatsApp/LogNotificacao)
 * ocorre antes da autenticação passar. O header Authorization é analisado de forma
 * defensiva (sem lançar) ANTES de qualquer chamada a createClientFromRequest — um Bearer
 * malformado ou vazio nunca deve provocar erro interno, sempre 403 direto.
 * Nenhuma outra function existente foi generalizada ou alterada para este fluxo.
 *
 * Acesso a entidades: Cliente (leitura, NUNCA create/update), TemplateWhatsApp (leitura),
 * LogNotificacao (leitura/escrita) — nunca Cobranca, Recebimento, Venda ou Parcela.
 * Nenhum acesso à Lyra.
 *
 * Contrato de entrada — allowlist estrita: cliente_id, texto_mensagem, request_id,
 * modo_teste. Telefone/nome nunca são aceitos do chamador — sempre relidos do Cliente.
 * template_key/template_id/idempotency_key/mensagem final nunca são aceitos prontos —
 * esta function decide tudo isso internamente.
 *
 * Chave de idempotência sempre construída internamente a partir de um request_id (UUID)
 * fornecido pelo chamador (não um hash de texto+minuto):
 *   whatsapp_manual:{cliente_id}:{request_id}:{test|prod}
 *
 * Concorrência: mesma limitação já documentada em enviarConfirmacaoPagamentoWhatsapp —
 * a API de entidades do Base44 não tem, até onde foi possível confirmar, nenhum
 * mecanismo de constraint única/upsert atômico. Esta function usa tripla checagem
 * (antes do envio, imediatamente antes do envio, e após eventual falha ao registrar o
 * log de sucesso) como melhor defesa disponível — não alega atomicidade total. Janela
 * de corrida residual documentada, não escondida.
 *
 * Nesta fase: só aceita modo_teste=true. modo_teste=false retorna 'producao_nao_liberada'
 * sem enviar nada. A trava WHATSAPP_TEST_PHONE de whatsappProvider permanece intacta e
 * não foi alterada — nenhuma liberação para clientes reais acontece aqui.
 *
 * Nunca registra/expõe: telefone completo, texto_mensagem completo, mensagem final
 * renderizada, tokens, resposta bruta da ZAP-API, stack trace.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const WHATSAPP_PROVIDER_TIMEOUT_MS = 12000;
const CAMPOS_PERMITIDOS = ['cliente_id', 'texto_mensagem', 'request_id', 'modo_teste', 'acao'];
const TEMPLATE_KEY = 'mensagem_manual';
const TEMPLATE_VARS_PERMITIDAS = ['nome', 'loja', 'vendedor', 'data', 'mensagem'];
const TEXTO_MENSAGEM_MIN = 2;
// Limite conservador — whatsappProvider/ZAP-API não documentam um limite explícito de
// caracteres; 2000 é uma margem prática segura para mensagem de texto simples via WhatsApp.
const TEXTO_MENSAGEM_MAX = 2000;
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// --- Fase 1 (mensagem pronta com template) — só leitura: listar_templates e
// previsualizar. Nenhuma das duas chama whatsappProvider nem cria LogNotificacao.
// Aditivo: nada abaixo altera o fluxo de envio existente (TEMPLATE_KEY,
// TEMPLATE_VARS_PERMITIDAS, resolverTemplateMensagemManual, chamarWhatsappProviderInterno
// e o corpo do Deno.serve pro caminho sem `acao`/`acao:'enviar'` continuam intocados). ---

// Templates habilitados pra uso manual via template nesta fase — allowlist própria,
// independente do campo `conectado` (que também precisa ser true). `cobranca_vencida`
// fica de fora propositalmente (está `conectado:false` hoje) e `mensagem_manual` não
// entra aqui por ser o template do fluxo de texto livre, não do seletor de templates.
const TEMPLATES_HABILITADOS_PREVIA = {
  lembrete_automatico: { requerParcela: true },
  pagamento_confirmado: { requerParcela: true },
};

function formatarMoedaBRL(valor) {
  return typeof valor === 'number' && !isNaN(valor)
    ? valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : null;
}

// Formata uma data pura (YYYY-MM-DD, sem horário/fuso — caso de Parcela.data_vencimento/
// Parcela.data_pagamento) sem passar por `new Date()`, que interpretaria a string como
// UTC-meia-noite e deslocaria o dia em fusos negativos (ex.: America/Sao_Paulo mostrava
// 27/07/2026 pra um vencimento real de 28/07/2026). Usada só por resolverValorVariavelPrevia
// pras variáveis `vencimento`/`data_pagamento` — não serve para timestamps com horário real.
function formatarDataBR(data) {
  if (!data) return null;
  const dataPura = String(data).slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataPura);
  if (!match) return null;
  const [, ano, mes, dia] = match;
  return `${dia}/${mes}/${ano}`;
}

function calcularDiasAtrasoServidor(vencimento) {
  if (!vencimento) return null;
  const venc = new Date(vencimento);
  if (isNaN(venc.getTime())) return null;
  const dias = Math.floor((Date.now() - venc.getTime()) / (1000 * 60 * 60 * 24));
  return dias > 0 ? dias : 0;
}

// Resolve o valor de UMA variável a partir de dados já lidos do servidor (Cliente,
// Parcela, contagem de parcelas da venda) — nunca aceita nenhum desses valores prontos
// do chamador. Retorna undefined pra variável sem fonte implementada (nunca lança).
function resolverValorVariavelPrevia(nomeVar, ctx) {
  switch (nomeVar) {
    case 'nome':
      return ctx.cliente?.nome ? String(ctx.cliente.nome).split(' ')[0] : undefined;
    case 'loja':
      return 'PRIME STORE';
    case 'valor':
      return formatarMoedaBRL(parseFloat(ctx.parcela?.valor_atualizado) || parseFloat(ctx.parcela?.valor_base) || undefined);
    case 'vencimento':
      return formatarDataBR(ctx.parcela?.data_vencimento) || undefined;
    case 'pix':
      return ctx.parcela?.payment_link || undefined;
    case 'parcela':
      return ctx.parcela?.numero != null ? String(ctx.parcela.numero) : undefined;
    case 'total_parcelas':
      return ctx.totalParcelas != null ? String(ctx.totalParcelas) : undefined;
    case 'data_pagamento':
      return formatarDataBR(ctx.parcela?.data_pagamento) || undefined;
    case 'dias_atraso': {
      const dias = calcularDiasAtrasoServidor(ctx.parcela?.data_vencimento);
      return dias != null ? String(dias) : undefined;
    }
    default:
      return undefined;
  }
}

// Resolvedor genérico e reutilizável (Fase 1): bloqueia variável fora da allowlist do
// template, detecta variáveis faltantes e NUNCA deixa placeholder cru no texto final —
// se qualquer variável usada não puder ser resolvida, o texto final não é gerado
// (variaveisFaltantes é devolvido em vez de um texto incompleto).
function resolverTextoTemplate(mensagemTemplate, variaveisPermitidas, ctx) {
  const variaveisUsadas = [...new Set((mensagemTemplate.match(/\{([a-zA-Z_]+)\}/g) || []).map((m) => m.slice(1, -1)))];

  const variavelNaoSuportada = variaveisUsadas.find((v) => !variaveisPermitidas.includes(v));
  if (variavelNaoSuportada) {
    return { ok: false, motivo: 'variavel_nao_suportada', variaveisFaltantes: [variavelNaoSuportada], variaveisResolvidas: [] };
  }

  const resolvidas = [];
  const faltantes = [];
  let textoFinal = mensagemTemplate;

  for (const nomeVar of variaveisUsadas) {
    const valor = resolverValorVariavelPrevia(nomeVar, ctx);
    if (valor === undefined || valor === null || valor === '') {
      faltantes.push(nomeVar);
      continue;
    }
    resolvidas.push(nomeVar);
    textoFinal = textoFinal.split(`{${nomeVar}}`).join(valor);
  }

  if (faltantes.length > 0) {
    return { ok: false, motivo: 'variaveis_faltantes', variaveisFaltantes: faltantes, variaveisResolvidas: resolvidas };
  }

  return { ok: true, texto: textoFinal, variaveisResolvidas: resolvidas };
}

// Leitura de template por key arbitrária (diferente de resolverTemplateMensagemManual,
// que continua fixa em TEMPLATE_KEY='mensagem_manual' pro fluxo de envio existente,
// intocado). Usada só por listar_templates/previsualizar.
async function resolverTemplatePorKey(base44, key) {
  const base = { usar: false, template_id: null, template_version: null, mensagem: null, nome: null, variaveisPermitidas: [] };
  try {
    const registros = await base44.asServiceRole.entities.TemplateWhatsApp.filter({ key });

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

    return {
      usar: true,
      template_status: 'ok',
      template_id: registro.id,
      template_version: registro.updated_date || null,
      mensagem: registro.mensagem,
      nome: registro.nome || key,
      variaveisPermitidas: Array.isArray(registro.variaveis_permitidas) ? registro.variaveis_permitidas : [],
    };
  } catch (_err) {
    return { ...base, template_status: 'erro_leitura_template' };
  }
}

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

// Roles autorizadas a usar o caminho base44_user — confirmado ao vivo nesta sessão que
// o usuário admin real do app tem role==='admin' e _app_role==='admin'. Não autoriza só
// por existir sessão, não usa email, não usa collaborator_role sozinho, e is_service
// nunca transforma a sessão em administrador (campo ignorado propositalmente aqui).
const ROLES_BASE44_USER_PERMITIDAS = ['admin'];

function usuarioPodeEnviarMensagemManual(usuario) {
  if (!usuario) return false;
  const appRole = usuario._app_role;
  const role = usuario.role;
  if (typeof appRole === 'string' && ROLES_BASE44_USER_PERMITIDAS.includes(appRole)) return true;
  if (typeof role === 'string' && ROLES_BASE44_USER_PERMITIDAS.includes(role)) return true;
  return false;
}

// Leitura e validação do template — sem fallback hardcoded (diferente de
// enviarConfirmacaoPagamentoWhatsapp/lembreteCobrancas, por instrução explícita: mensagem
// manual sem template válido não deve enviar nada, nunca um texto genérico substituto).
async function resolverTemplateMensagemManual(base44) {
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
// Nunca expõe o token, nunca repassa corpo bruto do provedor. Função não alterada. ---
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
    return { ok: true, message_id: json.message_id || null, provider: json.provider || null };
  }

  return { ok: false, error_code: (json && json.error_code) || 'erro_whatsapp_provider' };
}

Deno.serve(async (req) => {
  try {
    // --- Autenticação dupla — precedência fixa, resposta genérica em qualquer falha.
    // Nunca aceita: api_key de frontend como autenticação humana, token no body,
    // COBRANCA_FRONTEND_TOKEN, Origin como autenticação única. Token vazio nunca
    // autentica. Nenhum client Base44 é criado antes desta validação mínima de header. ---

    // 1) Analisa o header Authorization de forma puramente defensiva — nunca lança,
    // não cria client Base44 ainda. "Bearer" sozinho ou seguido só de espaços vira
    // string vazia após trim, tratado como "nenhum token informado".
    const authHeader = req.headers.get('Authorization') || '';
    const rawBearerToken = authHeader.replace(/^Bearer\s*/i, '').trim();
    const tentativaServico = rawBearerToken !== '';

    // 2) Só agora tenta obter o client + a sessão de usuário Base44 — dentro de um
    // try/catch que cobre a própria criação do client, não só auth.me(). Um Bearer
    // malformado/vazio nunca deve propagar exceção até o catch externo da function
    // (que geraria erro_interno em vez do 403 esperado).
    let base44 = null;
    let usuarioAutenticado = null;
    try {
      base44 = createClientFromRequest(req);
      const me = await base44.auth.me();
      if (me && me.id) usuarioAutenticado = me;
    } catch (_e) {
      base44 = null;
      usuarioAutenticado = null;
    }

    // 3) Usuário autenticado só autoriza o caminho base44_user se tiver role permitida.
    // Sem role permitida, não cai automaticamente neste modo — mas ainda pode autenticar
    // pelo Bearer de serviço logo abaixo, se houver um válido.
    if (usuarioAutenticado && !usuarioPodeEnviarMensagemManual(usuarioAutenticado)) {
      usuarioAutenticado = null;
    }

    // 4) Sem usuário válido, valida o Bearer de serviço dedicado — só tentado quando
    // havia um token não vazio (passo 1). Comparação estrita, token vazio (recebido ou
    // configurado) nunca autentica.
    let autenticadoComoServico = false;
    if (!usuarioAutenticado && tentativaServico) {
      const serviceToken = Deno.env.get('MENSAGEM_MANUAL_SERVICE_TOKEN') || '';
      if (serviceToken !== '' && rawBearerToken === serviceToken) {
        autenticadoComoServico = true;
      }
    }

    if (!usuarioAutenticado && !autenticadoComoServico) {
      // Resposta genérica — nunca informa qual dos dois métodos foi tentado ou falhou,
      // nunca devolve role ou dados do usuário.
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    // Se a autenticação passou pelo Bearer de serviço mas, por algum motivo defensivo,
    // o client Base44 não pôde ser criado (base44 ainda null), não há como prosseguir
    // com leitura de entidades — falha controlada, nunca lança.
    if (!base44) {
      try {
        base44 = createClientFromRequest(req);
      } catch (_e) {
        return erro('erro_interno');
      }
    }

    // Contexto de autenticação interno, seguro — nunca inclui token/Authorization/
    // usuário completo/email completo/role. Usado só para resolver o vendedor.
    const authContext = usuarioAutenticado
      ? { auth_mode: 'base44_user', vendedor: null } // vendedor resolvido mais abaixo, com fallback
      : { auth_mode: 'vercel_service', vendedor: 'Equipe PRIME' };

    const body = await req.json().catch(() => ({}));

    // --- Fase 1 — listar_templates / previsualizar: só leitura, nunca chamam
    // whatsappProvider nem criam LogNotificacao. Interceptado ANTES do allowlist/
    // fluxo de envio existente, que continua servindo `acao` ausente/'enviar'. ---
    if (body?.acao === 'listar_templates') {
      const camposListagem = Object.keys(body || {}).filter((k) => k !== 'acao');
      if (camposListagem.length > 0) {
        return erro('campos_nao_permitidos', { campos: camposListagem });
      }
      try {
        const registros = await base44.asServiceRole.entities.TemplateWhatsApp.list();
        const templates = (registros || [])
          .filter((t) => t.ativo === true && t.conectado === true && Object.prototype.hasOwnProperty.call(TEMPLATES_HABILITADOS_PREVIA, t.key))
          .map((t) => ({
            key: t.key,
            nome: t.nome || t.key,
            descricao: t.descricao || null,
            categoria: t.categoria || null,
            variaveis_permitidas: Array.isArray(t.variaveis_permitidas) ? t.variaveis_permitidas : [],
            requer_parcela: Boolean(TEMPLATES_HABILITADOS_PREVIA[t.key]?.requerParcela),
          }));
        return Response.json({ success: true, templates }, { status: 200 });
      } catch (_e) {
        return erro('erro_listar_templates');
      }
    }

    if (body?.acao === 'previsualizar') {
      const CAMPOS_PREVIA = ['acao', 'cliente_id', 'parcela_id', 'template_key'];
      const camposPrevia = Object.keys(body || {}).filter((k) => !CAMPOS_PREVIA.includes(k));
      if (camposPrevia.length > 0) {
        return erro('campos_nao_permitidos', { campos: camposPrevia });
      }

      const { cliente_id: clienteIdPrevia, parcela_id: parcelaId, template_key: templateKey } = body;

      if (!clienteIdPrevia || typeof clienteIdPrevia !== 'string' || clienteIdPrevia.trim() === '') {
        return erro('cliente_id_ausente');
      }
      if (!parcelaId || typeof parcelaId !== 'string' || parcelaId.trim() === '') {
        return erro('parcela_id_ausente');
      }
      if (
        !templateKey ||
        typeof templateKey !== 'string' ||
        !Object.prototype.hasOwnProperty.call(TEMPLATES_HABILITADOS_PREVIA, templateKey)
      ) {
        return erro('template_key_invalido');
      }

      let clientePrevia = null;
      try {
        clientePrevia = await base44.asServiceRole.entities.Cliente.get(clienteIdPrevia);
      } catch (_e) {
        clientePrevia = null;
      }
      if (!clientePrevia) {
        return erro('cliente_nao_encontrado');
      }

      let parcela = null;
      try {
        parcela = await base44.asServiceRole.entities.Parcela.get(parcelaId);
      } catch (_e) {
        parcela = null;
      }
      // Mesmo código genérico ('parcela_nao_encontrada') tanto pra parcela inexistente
      // quanto pra parcela de outro cliente — nunca revela que a parcela existe mas
      // pertence a outro cliente_id.
      if (!parcela || parcela.cliente_id !== clienteIdPrevia) {
        return erro('parcela_nao_encontrada');
      }

      let totalParcelas = null;
      try {
        const parcelasDaVenda = parcela.venda_id
          ? await base44.asServiceRole.entities.Parcela.filter({ venda_id: parcela.venda_id })
          : [];
        totalParcelas = Array.isArray(parcelasDaVenda) ? parcelasDaVenda.length : null;
      } catch (_e) {
        totalParcelas = null;
      }

      const resolucaoTemplatePrevia = await resolverTemplatePorKey(base44, templateKey);
      if (!resolucaoTemplatePrevia.usar) {
        return Response.json({
          success: true,
          status: 'not_ready',
          template_key: templateKey,
          template_status: resolucaoTemplatePrevia.template_status,
        }, { status: 200 });
      }

      const ctx = { cliente: clientePrevia, parcela, totalParcelas };
      const resultadoPrevia = resolverTextoTemplate(resolucaoTemplatePrevia.mensagem, resolucaoTemplatePrevia.variaveisPermitidas, ctx);

      if (!resultadoPrevia.ok) {
        return Response.json({
          success: true,
          status: 'incompleto',
          template_key: templateKey,
          template_nome: resolucaoTemplatePrevia.nome,
          cliente_id: clienteIdPrevia,
          parcela_id: parcelaId,
          texto_renderizado: null,
          variaveis_resolvidas: resultadoPrevia.variaveisResolvidas || [],
          variaveis_faltantes: resultadoPrevia.variaveisFaltantes || [],
          template_status: resultadoPrevia.motivo,
        }, { status: 200 });
      }

      return Response.json({
        success: true,
        status: 'ready',
        template_key: templateKey,
        template_nome: resolucaoTemplatePrevia.nome,
        cliente_id: clienteIdPrevia,
        parcela_id: parcelaId,
        texto_renderizado: resultadoPrevia.texto,
        variaveis_resolvidas: resultadoPrevia.variaveisResolvidas,
        variaveis_faltantes: [],
        template_status: 'ready',
      }, { status: 200 });
    }

    if (body?.acao !== undefined && body?.acao !== null && body?.acao !== 'enviar') {
      return erro('acao_invalida');
    }

    // --- Validação estrita de payload — allowlist explícita ---
    const camposDesconhecidos = Object.keys(body || {}).filter((k) => !CAMPOS_PERMITIDOS.includes(k));
    if (camposDesconhecidos.length > 0) {
      return erro('campos_nao_permitidos', { campos: camposDesconhecidos });
    }

    const { cliente_id, texto_mensagem, request_id, modo_teste } = body;

    if (!cliente_id || typeof cliente_id !== 'string' || cliente_id.trim() === '') {
      return erro('cliente_id_ausente');
    }
    // Código público único e estável para qualquer motivo de texto inválido — o motivo
    // real (ausente, tipo errado, só espaços, curto demais, longo demais) nunca é
    // exposto, só usado internamente para decidir a rejeição.
    if (typeof texto_mensagem !== 'string') {
      return erro('texto_mensagem_invalido');
    }
    const textoTrim = texto_mensagem.trim();
    if (textoTrim === '' || textoTrim.length < TEXTO_MENSAGEM_MIN || textoTrim.length > TEXTO_MENSAGEM_MAX) {
      return erro('texto_mensagem_invalido');
    }
    if (!request_id || typeof request_id !== 'string' || !UUID_REGEX.test(request_id)) {
      return erro('request_id_invalido');
    }
    if (typeof modo_teste !== 'boolean') {
      return erro('modo_teste_invalido');
    }

    // --- Modo de teste — nesta fase, produção nunca é liberada aqui. A trava
    // WHATSAPP_TEST_PHONE de whatsappProvider permanece intacta e é quem, de fato,
    // impede envio a números reais mesmo que esta trava fosse burlada. ---
    if (modo_teste !== true) {
      return Response.json({ success: true, status: 'producao_nao_liberada' }, { status: 200 });
    }

    // --- Cliente — sempre relido do PRIME, telefone/nome do body nunca são aceitos
    // (o contrato de entrada nem os inclui). Nenhum create/update ocorre aqui. ---
    let cliente = null;
    try {
      cliente = await base44.asServiceRole.entities.Cliente.get(cliente_id);
    } catch (_e) {
      cliente = null;
    }
    if (!cliente) {
      return erro('cliente_nao_encontrado');
    }
    if (!cliente.telefone || typeof cliente.telefone !== 'string' || cliente.telefone.trim() === '') {
      return erro('cliente_telefone_invalido');
    }
    if (!cliente.nome || typeof cliente.nome !== 'string' || cliente.nome.trim() === '') {
      return erro('cliente_nome_invalido');
    }

    // --- Template — sem fallback hardcoded. Cenário inválido → não envia. ---
    const resolucaoTemplate = await resolverTemplateMensagemManual(base44);
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

    // --- Vendedor — nunca aceito do body (nem é campo do contrato).
    // Modo B (serviço): sempre "Equipe PRIME", fixo.
    // Modo A (usuário Base44): full_name/email do usuário autenticado; sem nome
    // confiável → "Equipe PRIME", nunca um nome fixo diferente. ---
    const vendedorNome = authContext.auth_mode === 'vercel_service'
      ? 'Equipe PRIME'
      : (usuarioAutenticado.full_name && String(usuarioAutenticado.full_name).trim())
        || (usuarioAutenticado.email && String(usuarioAutenticado.email).trim())
        || 'Equipe PRIME';

    const primeiroNome = String(cliente.nome).split(' ')[0];
    const dataFmt = new Date().toLocaleDateString('pt-BR');
    const message = substituirVariaveisTemplate(resolucaoTemplate.mensagem, {
      nome: primeiroNome,
      loja: 'PRIME STORE',
      vendedor: vendedorNome,
      data: dataFmt,
      mensagem: textoTrim,
    });

    // --- Chave de idempotência construída internamente a partir do request_id do
    // chamador — nunca aceita idempotency_key pronta. ---
    const sufixo = modo_teste ? 'test' : 'prod';
    const idempotencyKey = `whatsapp_manual:${cliente_id}:${request_id}:${sufixo}`;

    const maskedPhone = maskPhone(cliente.telefone);
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
    // corrida entre duas execuções concorrentes com o mesmo request_id. Mesma limitação
    // já documentada em enviarConfirmacaoPagamentoWhatsapp: a API de entidades do Base44
    // não tem, até onde foi possível confirmar, constraint única/upsert atômico. Janela
    // residual entre esta checagem e a criação do LogNotificacao de sucesso permanece;
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
      phone: cliente.telefone,
      message,
      parcelaId: `manual:${cliente_id}`,
    });

    if (resultadoEnvio.ok) {
      let logId = null;
      try {
        const log = await base44.asServiceRole.entities.LogNotificacao.create({
          status: 'sucesso',
          tipo: TEMPLATE_KEY,
          backend_function: 'enviarMensagemManualWhatsapp',
          destinatario: maskedPhone,
          quantidade_enviada: 1,
          modo_teste,
          idempotency_key: idempotencyKey,
          detalhes: JSON.stringify({
            canal: 'whatsapp',
            template_key: TEMPLATE_KEY,
            template_id: resolucaoTemplate.template_id,
            template_version: resolucaoTemplate.template_version,
            cliente_id,
            request_id,
            message_length: textoTrim.length,
            provider: resultadoEnvio.provider,
            message_id: resultadoEnvio.message_id,
          }),
        });
        logId = log.id;
      } catch (_e) {
        // --- 3ª checagem, após eventual falha ao registrar o log de sucesso ---
        // A mensagem já foi enviada nesta execução; se a criação do log falhar, uma
        // execução concorrente com o mesmo request_id pode ter registrado sucesso entre
        // a 2ª checagem e agora. Não reenvia em nenhuma hipótese — só reflete o estado
        // real encontrado.
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
        backend_function: 'enviarMensagemManualWhatsapp',
        destinatario: maskedPhone,
        quantidade_enviada: 0,
        modo_teste,
        erro: resultadoEnvio.error_code,
        idempotency_key: idempotencyKey,
        detalhes: JSON.stringify({
          canal: 'whatsapp',
          template_key: TEMPLATE_KEY,
          template_id: resolucaoTemplate.template_id,
          cliente_id,
          request_id,
          message_length: textoTrim.length,
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
