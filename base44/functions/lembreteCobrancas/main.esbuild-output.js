import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";
const LYRA_GERAR_PIX_PARCELA_URL = "https://lyra-663dc63d.base44.app/functions/gerarPixParcela";
const LYRA_RESOLVER_CLIENTE_PIX_URL = "https://lyra-663dc63d.base44.app/functions/resolverClientePix";
const GERAR_PIX_PARCELA_TIMEOUT_MS = 12e3;
const RESOLVER_CLIENTE_TIMEOUT_MS = 1e4;
function normalizePhoneDigits(raw) {
  return (raw || "").replace(/\D/g, "");
}
function validarTestPixContext(ctx) {
  if (!ctx.parcela_id || typeof ctx.parcela_id !== "string" || ctx.parcela_id.trim() === "") {
    return { valido: false, motivo: "parcela_id_invalido" };
  }
  if (!ctx.cliente_nome || typeof ctx.cliente_nome !== "string" || ctx.cliente_nome.trim() === "") {
    return { valido: false, motivo: "cliente_nome_invalido" };
  }
  if (typeof ctx.valor !== "number" || !Number.isFinite(ctx.valor) || ctx.valor <= 0) {
    return { valido: false, motivo: "valor_invalido" };
  }
  if (!ctx.vencimento || typeof ctx.vencimento !== "string" || !Number.isFinite(new Date(ctx.vencimento).getTime())) {
    return { valido: false, motivo: "vencimento_invalido" };
  }
  if (!ctx.cliente_telefone || typeof ctx.cliente_telefone !== "string" || ctx.cliente_telefone.trim() === "") {
    return { valido: false, motivo: "cliente_telefone_ausente" };
  }
  if (!Number.isInteger(ctx.numero_parcela) || ctx.numero_parcela <= 0) {
    return { valido: false, motivo: "numero_parcela_invalido" };
  }
  if (!Number.isInteger(ctx.total_parcelas) || ctx.total_parcelas <= 0) {
    return { valido: false, motivo: "total_parcelas_invalido" };
  }
  if (ctx.numero_parcela > ctx.total_parcelas) {
    return { valido: false, motivo: "numero_parcela_maior_que_total" };
  }
  return { valido: true };
}
function classificarErroHttp(httpStatus) {
  if (httpStatus === 400) return "bad_request";
  if (httpStatus === 401 || httpStatus === 403) return "invalid_credentials";
  if (httpStatus === 404) return "not_found";
  if (httpStatus === 429) return "rate_limit";
  if (httpStatus >= 500) return "provider_unavailable";
  return "unknown";
}
async function resolverClientePixNaLyra({ nome, telefone, prime_cliente_id }) {
  const token = Deno.env.get("RESOLVER_CLIENTE_PIX_TOKEN") || "";
  if (!token) {
    return { ok: false, error_code: "missing_resolver_token" };
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RESOLVER_CLIENTE_TIMEOUT_MS);
  let resp;
  try {
    resp = await fetch(LYRA_RESOLVER_CLIENTE_PIX_URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ nome, telefone, prime_cliente_id }),
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const error_code = err.name === "AbortError" ? "timeout_resolver_cliente" : "fetch_error_resolver_cliente";
    return { ok: false, error_code };
  }
  clearTimeout(timeoutId);
  let json = null;
  try {
    json = await resp.json();
  } catch (_parseErr) {
    return { ok: false, error_code: "invalid_response_format", http_status: resp.status };
  }
  if (!resp.ok) {
    return { ok: false, error_code: classificarErroHttp(resp.status), http_status: resp.status };
  }
  if (!json || json.success !== true || !json.cliente_id || typeof json.cliente_id !== "string") {
    return { ok: false, error_code: "invalid_resolver_response", http_status: resp.status };
  }
  return { ok: true, clienteLyraId: json.cliente_id, created: json.created === true };
}
async function gerarPixParcelaNaLyra(payload) {
  const token = Deno.env.get("GERAR_PIX_PARCELA_TOKEN") || "";
  if (!token) {
    return { ok: false, error_code: "missing_gerar_pix_token" };
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GERAR_PIX_PARCELA_TIMEOUT_MS);
  let resp;
  try {
    resp = await fetch(LYRA_GERAR_PIX_PARCELA_URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const error_code = err.name === "AbortError" ? "timeout_gerar_pix" : "fetch_error_gerar_pix";
    return { ok: false, error_code };
  }
  clearTimeout(timeoutId);
  let json = null;
  try {
    json = await resp.json();
  } catch (_parseErr) {
    return { ok: false, error_code: "invalid_response_format", http_status: resp.status };
  }
  if (json && json.success === false && json.error_code === "pix_piloto_desabilitado") {
    return { ok: false, error_code: "pix_piloto_desabilitado", pilotoDesabilitado: true };
  }
  if (!resp.ok) {
    return { ok: false, error_code: json && json.error_code || classificarErroHttp(resp.status), http_status: resp.status };
  }
  if (!json || json.success !== true) {
    return { ok: false, error_code: json && json.error_code || "invalid_gerar_pix_response", http_status: resp.status };
  }
  return { ok: true, json };
}
function validarRespostaPix(json) {
  if (!json || json.success !== true) return { valido: false, motivo: "success !== true" };
  if (!json.cobranca_id || typeof json.cobranca_id !== "string") return { valido: false, motivo: "cobranca_id ausente" };
  if (!json.pix_order_id || typeof json.pix_order_id !== "string") return { valido: false, motivo: "pix_order_id ausente" };
  if (!json.pix_copia_cola || typeof json.pix_copia_cola !== "string") return { valido: false, motivo: "pix_copia_cola ausente" };
  if (!Number.isInteger(json.pix_version) || json.pix_version <= 0) return { valido: false, motivo: "pix_version inv\xE1lido" };
  if (json.pix_status !== "pendente") return { valido: false, motivo: "pix_status n\xE3o \xE9 pendente" };
  if (!json.pix_expires_at) return { valido: false, motivo: "pix_expires_at ausente" };
  const expira = new Date(json.pix_expires_at).getTime();
  if (!Number.isFinite(expira) || expira <= Date.now()) return { valido: false, motivo: "pix_expires_at n\xE3o est\xE1 no futuro" };
  return { valido: true };
}
function maskPhoneDigits(digits) {
  return digits.length >= 6 ? digits.substring(0, 2) + "*".repeat(digits.length - 6) + digits.substring(digits.length - 4) : "***";
}
Deno.serve(async (req) => {
  const inicio = Date.now();
  const body = await req.json().catch(() => ({}));
  const isTest = body.isTest === true;
  const configId = body.config_id || null;
  const FUNCTION_NAME = "lembreteCobrancas";
  const TIPO = "lembrete_preventivo";
  const base44 = createClientFromRequest(req);
  function parseBooleanSecret(raw) {
    if (!raw || typeof raw !== "string") return false;
    return raw.trim().toLowerCase() === "true";
  }
  try {
    const doisDiasDepois = /* @__PURE__ */ new Date();
    doisDiasDepois.setDate(doisDiasDepois.getDate() + 2);
    const doisDiasStr = doisDiasDepois.toISOString().split("T")[0];
    const configs = await base44.asServiceRole.entities.ConfiguracaoLoja.list();
    const config = configs && configs.length > 0 ? configs[0] : null;
    const templates = await base44.asServiceRole.entities.TemplateCobranca.list("-created_date", 50);
    const template = (templates || []).find((t) => t.tipo === "lembrete_3_dias");
    const allParcelas = await base44.asServiceRole.entities.Parcela.list("-data_vencimento", 500);
    const parcelasLembrete = (allParcelas || []).filter((p) => {
      return p.status !== "pago" && p.data_vencimento === doisDiasStr;
    });
    const clientes = await base44.asServiceRole.entities.Cliente.list("-created_date", 500);
    const clienteMap = {};
    for (const c of clientes || []) {
      clienteMap[c.id] = c;
    }
    const nomeLoja = config?.nome_loja || "CrediLoja";
    const chavePix = config?.chave_pix || "";
    const listaFormatada = parcelasLembrete.map((p) => {
      const cliente = clienteMap[p.cliente_id];
      const telefone = cliente?.telefone || "";
      const valorFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(p.valor_base);
      const vencFmt = (/* @__PURE__ */ new Date(p.data_vencimento + "T00:00:00")).toLocaleDateString("pt-BR");
      let mensagem = `Ol\xE1 ${p.cliente_nome}! Lembrete amig\xE1vel: sua parcela de ${valorFmt} vence em 2 dias (${vencFmt}). Estamos \xE0 disposi\xE7\xE3o!`;
      if (template) {
        mensagem = template.mensagem.replace(/\{cliente\}/g, p.cliente_nome).replace(/\{valor\}/g, valorFmt).replace(/\{vencimento\}/g, vencFmt).replace(/\{pix\}/g, chavePix).replace(/\{loja\}/g, nomeLoja);
      }
      const telefoneLimpo = telefone.replace(/\D/g, "");
      const linkWhatsApp = telefoneLimpo ? `https://wa.me/55${telefoneLimpo}?text=${encodeURIComponent(mensagem)}` : "";
      return {
        parcela_id: p.id,
        cliente: p.cliente_nome,
        parcela: `${p.numero}\xAA`,
        valor: p.valor_base,
        vencimento: p.data_vencimento,
        telefone,
        mensagem,
        link_whatsapp: linkWhatsApp,
        payment_link: p.payment_link || ""
      };
    });
    let emailDestino = null;
    try {
      const emailRes = await base44.functions.invoke("notificacaoCore", { action: "resolverEmail" });
      const d = emailRes && (emailRes.data || emailRes) || {};
      emailDestino = d.email || null;
    } catch (_e) {
    }
    const hasData = listaFormatada.length > 0;
    let emailEnviado = false;
    const sufixoTeste = isTest ? " [TESTE]" : "";
    if (emailDestino) {
      const dataFmt = (/* @__PURE__ */ new Date()).toLocaleDateString("pt-BR");
      let html = "";
      let subject = "";
      if (hasData) {
        const valorTotal = listaFormatada.reduce((s, p) => s + p.valor, 0);
        const fmtBRL = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
        const rows = listaFormatada.map((p) => {
          const botao = p.link_whatsapp ? `<a href="${p.link_whatsapp}" style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;padding:6px 16px;border-radius:6px;font-size:12px;font-weight:600;">\u{1F4AC} Enviar WhatsApp</a>` : '<span style="color:#9ca3af;font-size:12px;">Sem telefone</span>';
          return `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;">${p.cliente}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${p.parcela}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${fmtBRL(p.valor)}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${botao}</td>
          </tr>`;
        }).join("");
        html = `
          <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#16A34A;padding:20px 24px;border-radius:12px 12px 0 0;">
              <h1 style="color:#fff;margin:0;font-size:20px;">\u{1F4C5} Lembrete de Vencimento \u2014 Em 2 dias</h1>
              <p style="color:#d1fae5;margin:4px 0 0;font-size:14px;">${nomeLoja}</p>
            </div>
            <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 12px 12px;">
              <p style="font-size:15px;color:#374151;margin:0 0 16px;">
                Voc\xEA tem <strong style="color:#16A34A;">${listaFormatada.length} parcela(s)</strong>
                vencendo em 2 dias (${doisDiasDepois.toLocaleDateString("pt-BR")}), totalizando
                <strong>${fmtBRL(valorTotal)}</strong>.
              </p>
              <p style="font-size:13px;color:#6b7280;margin:0 0 12px;">Clique no bot\xE3o para enviar o lembrete via WhatsApp com a mensagem do seu template.</p>
              <table style="width:100%;border-collapse:collapse;font-size:14px;">
                <thead>
                  <tr style="background:#f9fafb;">
                    <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb;font-size:12px;color:#6b7280;text-transform:uppercase;">Cliente</th>
                    <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e5e7eb;font-size:12px;color:#6b7280;text-transform:uppercase;">Parcela</th>
                    <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e5e7eb;font-size:12px;color:#6b7280;text-transform:uppercase;">Valor</th>
                    <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e5e7eb;font-size:12px;color:#6b7280;text-transform:uppercase;">A\xE7\xE3o</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
              <div style="margin-top:24px;padding:16px;background:#f0fdf4;border-radius:8px;text-align:center;">
                <p style="margin:0;font-size:13px;color:#15803d;">
                  \u{1F4AC} Os links abrem o WhatsApp com a mensagem pronta usando seu template de cobran\xE7a
                </p>
              </div>
            </div>
            <p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:16px;">
              Este \xE9 um lembrete autom\xE1tico do ${nomeLoja}
            </p>
          </div>
        `;
        subject = `\u{1F4C5} ${listaFormatada.length} parcela(s) vencendo em 2 dias \u2014 ${nomeLoja}`;
      } else if (isTest) {
        html = '<div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;"><div style="background:#6b7280;padding:20px 24px;border-radius:12px 12px 0 0;"><h1 style="color:#fff;margin:0;font-size:20px;">Nenhuma parcela encontrada</h1><p style="color:#e5e7eb;margin:4px 0 0;font-size:14px;">' + nomeLoja + " - " + dataFmt + '</p></div><div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 12px 12px;text-align:center;"><p style="font-size:15px;color:#374151;margin:0;">Nenhuma parcela encontrada para este relat\xF3rio.</p></div><p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:16px;">Resumo gerado pelo ' + nomeLoja + "</p></div>";
        subject = "Nenhuma parcela encontrada - " + nomeLoja;
      }
      if (html) {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: emailDestino,
          subject: subject + sufixoTeste,
          body: html
        });
        emailEnviado = true;
      }
    }
    const status = !hasData && !isTest ? "sem_dados" : "sucesso";
    try {
      await base44.functions.invoke("notificacaoCore", {
        action: "registrar",
        config_id: configId,
        tipo: TIPO,
        status,
        destinatario: emailDestino || "",
        modo_teste: isTest,
        duracao_ms: Date.now() - inicio,
        erro: null,
        backend_function: FUNCTION_NAME,
        detalhes: listaFormatada.length + " parcela(s) com lembrete, " + (template?.titulo || "padr\xE3o"),
        quantidade_enviada: emailEnviado ? 1 : 0
      });
    } catch (_e) {
    }
    let whatsappResultado = null;
    try {
      const waEnabled = parseBooleanSecret(Deno.env.get("WHATSAPP_ENABLED"));
      const waTestMode = parseBooleanSecret(Deno.env.get("WHATSAPP_TEST_MODE"));
      const waTestPhone = Deno.env.get("WHATSAPP_TEST_PHONE") || "";
      const waInternalToken = Deno.env.get("WHATSAPP_INTERNAL_TOKEN") || "";
      const pixAutomaticoEnabled = parseBooleanSecret(Deno.env.get("PIX_AUTOMATICO_ENABLED"));
      const resolverClienteToken = Deno.env.get("RESOLVER_CLIENTE_PIX_TOKEN") || "";
      const gerarPixToken = Deno.env.get("GERAR_PIX_PARCELA_TOKEN") || "";
      if (!(waEnabled && waTestMode && waTestPhone && waInternalToken)) {
        whatsappResultado = { status: "pulado_controles_desativados" };
      } else if (!pixAutomaticoEnabled) {
        whatsappResultado = { status: "pulado_pix_automatico_desativado" };
      } else if (!resolverClienteToken) {
        whatsappResultado = { status: "erro_config_resolver_cliente_token_ausente" };
      } else if (!gerarPixToken) {
        whatsappResultado = { status: "erro_config_gerar_pix_token_ausente" };
      } else {
        const testPixContext = body.test_pix_context;
        const waTestPhoneNormalizado = normalizePhoneDigits(waTestPhone);
        const telefoneSimuladoNormalizado = testPixContext ? normalizePhoneDigits(testPixContext.cliente_telefone) : "";
        const tentativaSimulacao = Boolean(
          isTest === true && testPixContext && testPixContext.enabled === true && waTestMode && pixAutomaticoEnabled && telefoneSimuladoNormalizado && telefoneSimuladoNormalizado === waTestPhoneNormalizado
        );
        let parcelaElegivel = null;
        let simulacaoValida = false;
        let pixRealAutorizadoNaSimulacao = false;
        if (tentativaSimulacao) {
          const validacaoContexto = validarTestPixContext(testPixContext);
          if (!validacaoContexto.valido) {
            whatsappResultado = { status: "test_pix_context_invalido", motivo: validacaoContexto.motivo };
          } else {
            simulacaoValida = true;
            parcelaElegivel = {
              parcela_id: String(testPixContext.parcela_id),
              cliente: testPixContext.cliente_nome,
              parcela: `${testPixContext.numero_parcela}\xAA`,
              valor: Number(testPixContext.valor),
              vencimento: testPixContext.vencimento,
              telefone: testPixContext.cliente_telefone
            };
            pixRealAutorizadoNaSimulacao = Boolean(
              isTest === true && body.allow_real_pix_in_simulation === true && waTestMode && waEnabled && pixAutomaticoEnabled && telefoneSimuladoNormalizado === waTestPhoneNormalizado && typeof testPixContext.parcela_id === "string" && testPixContext.parcela_id.startsWith("teste-") && typeof testPixContext.valor === "number" && testPixContext.valor > 0 && testPixContext.valor <= 1
            );
          }
        } else {
          parcelaElegivel = listaFormatada.find((p) => p.telefone && p.telefone.trim() !== "" && p.parcela_id);
        }
        if (whatsappResultado) {
        } else if (!parcelaElegivel) {
          whatsappResultado = { status: "sem_parcela_elegivel_pix" };
        } else {
          const parcelaId = parcelaElegivel.parcela_id;
          const resolucaoCliente = await resolverClientePixNaLyra({
            nome: parcelaElegivel.cliente,
            telefone: parcelaElegivel.telefone,
            prime_cliente_id: parcelaId
          });
          if (!resolucaoCliente.ok) {
            whatsappResultado = { status: "erro_resolver_cliente_lyra", error_code: resolucaoCliente.error_code };
          } else {
            const descricaoDeterministica = `Parcela ${parcelaElegivel.parcela} - Lembrete autom\xE1tico${simulacaoValida ? " (SIMULA\xC7\xC3O)" : ""}`;
            const resultadoGerarPix = await gerarPixParcelaNaLyra({
              cliente_id: resolucaoCliente.clienteLyraId,
              cliente_nome: parcelaElegivel.cliente,
              valor: parcelaElegivel.valor,
              vencimento: parcelaElegivel.vencimento,
              descricao: descricaoDeterministica,
              prime_parcela_id: parcelaId,
              metodo_pagamento: "pix_dinamico"
            });
            if (simulacaoValida && resultadoGerarPix.ok && !pixRealAutorizadoNaSimulacao) {
              whatsappResultado = { status: "simulacao_bloqueada_pix_real_inesperado" };
            } else if (resultadoGerarPix.pilotoDesabilitado) {
              whatsappResultado = { status: "pulado_pix_piloto_desabilitado" };
            } else if (!resultadoGerarPix.ok) {
              whatsappResultado = { status: "erro_gerar_pix_parcela", error_code: resultadoGerarPix.error_code };
            } else {
              const validacaoPix = validarRespostaPix(resultadoGerarPix.json);
              if (!validacaoPix.valido) {
                whatsappResultado = { status: "pix_invalido", error_code: validacaoPix.motivo };
              } else {
                const pixOrderId = resultadoGerarPix.json.pix_order_id;
                const pixVersion = resultadoGerarPix.json.pix_version;
                const pixCopiaCola = resultadoGerarPix.json.pix_copia_cola;
                const idempotencyKey = `whatsapp_pix:${parcelaId}:${pixOrderId}:v${pixVersion}:test`;
                let jaEnviado = false;
                try {
                  const logsExistentes = await base44.asServiceRole.entities.LogNotificacao.filter({
                    idempotency_key: idempotencyKey,
                    status: "sucesso"
                  });
                  if (logsExistentes && logsExistentes.length > 0) jaEnviado = true;
                } catch (_e) {
                }
                if (jaEnviado) {
                  whatsappResultado = { status: "ignorado_duplicidade_pix", idempotency_key: idempotencyKey };
                } else {
                  const primeiroNome = (parcelaElegivel.cliente || "").split(" ")[0];
                  const valorFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parcelaElegivel.valor);
                  const vencFmt = (/* @__PURE__ */ new Date(parcelaElegivel.vencimento + "T00:00:00")).toLocaleDateString("pt-BR");
                  const mensagemApresentacao = `\u{1F44B} Ol\xE1, ${primeiroNome}!

Sua parcela est\xE1 dispon\xEDvel para pagamento.

\u{1F4B0} Valor: ${valorFmt}
\u{1F4C5} Vencimento: ${vencFmt}
\u26A1 Pagamento via Pix

Na pr\xF3xima mensagem est\xE1 o c\xF3digo Pix Copia e Cola.
Toque e segure o c\xF3digo para copiar.`;
                  const testPhoneDigits = normalizePhoneDigits(waTestPhone);
                  const maskedPhone = maskPhoneDigits(testPhoneDigits);
                  const providerResponse = await base44.functions.fetch("/whatsappProvider", {
                    method: "POST",
                    headers: {
                      "Authorization": `Bearer ${waInternalToken}`,
                      "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                      phone: waTestPhone,
                      // destino continua o telefone de teste durante o piloto
                      message_type: "pix_text",
                      message: mensagemApresentacao,
                      pix_copia_cola: pixCopiaCola,
                      parcela_id: parcelaId,
                      pix_order_id: pixOrderId,
                      pix_version: pixVersion
                    })
                  });
                  const providerResult = await providerResponse.json().catch(() => ({}));
                  if (providerResult.success === true) {
                    const detalhes = JSON.stringify({
                      provider: "zapapi",
                      canal: "whatsapp",
                      message_type: "pix_text",
                      parcela_id: parcelaId,
                      pix_order_id: pixOrderId,
                      pix_version: pixVersion,
                      calls_made: providerResult.calls_made || 0,
                      presentation_message_id: providerResult.presentation_message_id || "",
                      pix_message_id: providerResult.pix_message_id || "",
                      destination_masked: maskedPhone,
                      idempotency_key: idempotencyKey
                    });
                    try {
                      await base44.functions.invoke("notificacaoCore", {
                        action: "registrar",
                        config_id: configId,
                        tipo: TIPO,
                        status: "sucesso",
                        destinatario: maskedPhone,
                        modo_teste: true,
                        duracao_ms: 0,
                        erro: null,
                        backend_function: "whatsappProvider",
                        detalhes,
                        quantidade_enviada: 1,
                        idempotency_key: idempotencyKey
                      });
                    } catch (_e) {
                    }
                    whatsappResultado = {
                      status: "sent",
                      idempotency_key: idempotencyKey,
                      destination_masked: maskedPhone,
                      calls_made: providerResult.calls_made
                    };
                  } else {
                    const detalhes = JSON.stringify({
                      provider: "zapapi",
                      canal: "whatsapp",
                      message_type: "pix_text",
                      provider_status: providerResult.status || "erro",
                      presentation_sent: providerResult.presentation_sent ?? null,
                      pix_sent: providerResult.pix_sent ?? null,
                      error_code: providerResult.error_code || "unknown",
                      destination_masked: maskedPhone,
                      idempotency_key: idempotencyKey
                    });
                    try {
                      await base44.functions.invoke("notificacaoCore", {
                        action: "registrar",
                        config_id: configId,
                        tipo: TIPO,
                        status: "erro",
                        destinatario: maskedPhone,
                        modo_teste: true,
                        duracao_ms: 0,
                        erro: providerResult.error_code || "erro_pix_text",
                        backend_function: "whatsappProvider",
                        detalhes,
                        quantidade_enviada: 0,
                        idempotency_key: idempotencyKey
                      });
                    } catch (_e) {
                    }
                    whatsappResultado = {
                      status: providerResult.status || "erro_pix_text",
                      error_code: providerResult.error_code || "unknown",
                      idempotency_key: idempotencyKey
                    };
                  }
                }
              }
            }
          }
        }
      }
    } catch (waError) {
      whatsappResultado = { status: "erro_isolado", error: waError.message };
    }
    return Response.json({
      success: true,
      data_vencimento: doisDiasStr,
      total_parcelas: listaFormatada.length,
      valor_total: listaFormatada.reduce((s, p) => s + p.valor, 0),
      template_usado: template?.titulo || "Padr\xE3o (sem template)",
      parcelas: listaFormatada,
      email_destino: emailDestino,
      email_enviado: emailEnviado,
      modo_teste: isTest,
      status,
      whatsapp_piloto: whatsappResultado
    });
  } catch (error) {
    try {
      await base44.functions.invoke("notificacaoCore", {
        action: "registrar",
        config_id: configId,
        tipo: TIPO,
        status: "erro",
        destinatario: "",
        modo_teste: isTest,
        duracao_ms: Date.now() - inicio,
        erro: error.message,
        backend_function: FUNCTION_NAME,
        detalhes: "Erro durante execu\xE7\xE3o",
        quantidade_enviada: 0
      });
    } catch (_e) {
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});
