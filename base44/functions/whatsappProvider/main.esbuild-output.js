const ZAPAPI_BASE_URL = "https://api.zap-api.tech/v1";
const VALID_PROVIDERS = ["zapi", "zapapi"];
const VALID_MESSAGE_TYPES = ["text", "pix_text"];
const HTTP_TIMEOUT_MS = 1e4;
function parseBooleanSecret(raw) {
  if (!raw || typeof raw !== "string") return false;
  return raw.trim().toLowerCase() === "true";
}
function normalizePhone(raw) {
  if (!raw || typeof raw !== "string") return null;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("55")) {
  } else {
    digits = "55" + digits;
  }
  if (digits.length !== 12 && digits.length !== 13) return null;
  const ddd = digits.substring(2, 4);
  const validDDDs = ["11", "12", "13", "14", "15", "16", "17", "18", "19", "21", "22", "24", "27", "28", "31", "32", "33", "34", "35", "37", "38", "41", "42", "43", "44", "45", "46", "47", "48", "49", "51", "53", "54", "55", "61", "62", "63", "64", "65", "66", "67", "68", "69", "71", "73", "74", "75", "77", "79", "81", "82", "83", "84", "85", "86", "87", "88", "89", "91", "92", "93", "94", "95", "96", "97", "98", "99"];
  if (!validDDDs.includes(ddd)) return null;
  return digits;
}
function maskPhone(phone) {
  if (!phone || phone.length < 6) return "***";
  return phone.substring(0, 2) + "*".repeat(phone.length - 6) + phone.substring(phone.length - 4);
}
function erroControlado(status, errorCode, httpStatus, extra) {
  return Response.json({
    success: false,
    status,
    http_status: httpStatus || 0,
    error_code: errorCode,
    ...extra || {}
  }, { status: 200 });
}
function classificarErroHttp(httpStatus) {
  if (httpStatus === 400) return "bad_request";
  if (httpStatus === 401 || httpStatus === 403) return "invalid_credentials";
  if (httpStatus === 402) return "trial_or_plan_expired";
  if (httpStatus === 404) return "not_found";
  if (httpStatus === 429) return "rate_limit";
  if (httpStatus >= 500) return "provider_unavailable";
  return "unknown";
}
async function enviarTextoZapi(phone, message) {
  const instanceId = Deno.env.get("ZAPI_INSTANCE_ID") || "";
  const instanceToken = Deno.env.get("ZAPI_INSTANCE_TOKEN") || "";
  const clientToken = Deno.env.get("ZAPI_CLIENT_TOKEN") || "";
  if (!instanceId || !instanceToken || !clientToken) {
    return { ok: false, http_status: 0, error_code: "missing_zapi_credentials" };
  }
  const url = `https://api.z-api.io/instances/${instanceId}/token/${instanceToken}/send-text`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  let resp, body = null;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Client-Token": clientToken, "Content-Type": "application/json" },
      body: JSON.stringify({ phone, message }),
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const errorCode = err.name === "AbortError" ? "timeout_provider" : "fetch_error";
    return { ok: false, http_status: 0, error_code: errorCode };
  }
  clearTimeout(timeoutId);
  try {
    body = await resp.json();
  } catch (_parseErr) {
    if (resp.ok) return { ok: false, http_status: resp.status, error_code: "invalid_response_format" };
  }
  if (!resp.ok) {
    return { ok: false, http_status: resp.status, error_code: classificarErroHttp(resp.status) };
  }
  const messageId = body?.messageId || body?.id || null;
  return { ok: true, http_status: resp.status, message_id: messageId };
}
async function enviarTextoZapapi(phone, message) {
  const instanceId = Deno.env.get("ZAPAPI_INSTANCE_ID") || "";
  const token = Deno.env.get("ZAPAPI_TOKEN") || "";
  if (!instanceId || !token) {
    return { ok: false, http_status: 0, error_code: "missing_zapapi_credentials" };
  }
  const url = `${ZAPAPI_BASE_URL}/instances/${instanceId}/send`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  let resp, body = null;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ phone, type: "text", body: message }),
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const errorCode = err.name === "AbortError" ? "timeout_provider" : "fetch_error";
    return { ok: false, http_status: 0, error_code: errorCode };
  }
  clearTimeout(timeoutId);
  try {
    body = await resp.json();
  } catch (_parseErr) {
    if (resp.ok) return { ok: false, http_status: resp.status, error_code: "invalid_response_format" };
  }
  if (!resp.ok) {
    return { ok: false, http_status: resp.status, error_code: classificarErroHttp(resp.status) };
  }
  const messageId = body?.messageId || null;
  return { ok: true, http_status: resp.status, message_id: messageId };
}
async function enviarTexto(provider, phone, message) {
  if (provider === "zapapi") return enviarTextoZapapi(phone, message);
  return enviarTextoZapi(phone, message);
}
Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const expectedToken = Deno.env.get("WHATSAPP_INTERNAL_TOKEN") || "";
    const receivedToken = authHeader.replace(/^Bearer\s+/i, "");
    if (!expectedToken || receivedToken !== expectedToken) {
      return Response.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }
    const providerRaw = (Deno.env.get("WHATSAPP_PROVIDER") || "").trim().toLowerCase();
    if (!VALID_PROVIDERS.includes(providerRaw)) {
      return erroControlado("erro_controle", "provider_not_configured", 0);
    }
    const provider = providerRaw;
    const enabled = parseBooleanSecret(Deno.env.get("WHATSAPP_ENABLED"));
    const testMode = parseBooleanSecret(Deno.env.get("WHATSAPP_TEST_MODE"));
    const testPhoneRaw = Deno.env.get("WHATSAPP_TEST_PHONE") || "";
    if (!enabled) {
      return erroControlado("erro_controle", "whatsapp_disabled", 0);
    }
    if (!testMode) {
      return erroControlado("erro_controle", "test_mode_off", 0);
    }
    const normalizedTestPhone = normalizePhone(testPhoneRaw);
    if (!normalizedTestPhone) {
      return erroControlado("erro_controle", "invalid_test_phone", 0);
    }
    const body = await req.json().catch(() => ({}));
    const {
      phone,
      message,
      parcela_id,
      data_referencia,
      test_mode,
      idempotency_key,
      message_type,
      pix_copia_cola,
      pix_order_id,
      pix_version
    } = body;
    const messageType = message_type || "text";
    if (!VALID_MESSAGE_TYPES.includes(messageType)) {
      return erroControlado("erro_validacao", "invalid_message_type", 0);
    }
    if (!parcela_id || typeof parcela_id !== "string") {
      return erroControlado("erro_validacao", "empty_parcela_id", 0);
    }
    const normalizedReceived = normalizePhone(phone || "");
    if (normalizedReceived !== normalizedTestPhone) {
      return erroControlado("erro_validacao", "phone_not_test_phone", 0);
    }
    const destinationMasked = maskPhone(normalizedTestPhone);
    if (messageType === "text") {
      if (!message || typeof message !== "string" || message.trim() === "") {
        return erroControlado("erro_validacao", "empty_message", 0);
      }
      if (!idempotency_key || typeof idempotency_key !== "string") {
        return erroControlado("erro_validacao", "empty_idempotency_key", 0);
      }
      const resultado = await enviarTexto(provider, normalizedTestPhone, message);
      if (resultado.ok) {
        return Response.json({
          success: true,
          provider,
          message_type: "text",
          status: "aceito_pelo_provedor",
          http_status: resultado.http_status,
          message_id: resultado.message_id,
          destination_masked: destinationMasked,
          idempotency_key
        }, { status: 200 });
      }
      return Response.json({
        success: false,
        provider,
        message_type: "text",
        status: "erro_provedor",
        http_status: resultado.http_status,
        error_code: resultado.error_code,
        destination_masked: destinationMasked,
        idempotency_key
      }, { status: 200 });
    }
    if (!message || typeof message !== "string" || message.trim() === "") {
      return erroControlado("erro_validacao", "empty_message", 0);
    }
    if (!pix_copia_cola || typeof pix_copia_cola !== "string" || pix_copia_cola.trim() === "") {
      return erroControlado("erro_validacao", "empty_pix_copia_cola", 0);
    }
    if (!pix_order_id || typeof pix_order_id !== "string") {
      return erroControlado("erro_validacao", "empty_pix_order_id", 0);
    }
    if (!Number.isInteger(pix_version) || pix_version <= 0) {
      return erroControlado("erro_validacao", "invalid_pix_version", 0);
    }
    const chamada1 = await enviarTexto(provider, normalizedTestPhone, message);
    if (!chamada1.ok) {
      return Response.json({
        success: false,
        provider,
        message_type: "pix_text",
        status: "presentation_failed",
        calls_made: 1,
        presentation_sent: false,
        pix_sent: false,
        error_code: chamada1.error_code,
        destination_masked: destinationMasked,
        parcela_id,
        pix_order_id,
        pix_version
      }, { status: 200 });
    }
    const chamada2 = await enviarTexto(provider, normalizedTestPhone, pix_copia_cola);
    if (!chamada2.ok) {
      return Response.json({
        success: false,
        provider,
        message_type: "pix_text",
        status: "partial_failure",
        calls_made: 2,
        presentation_sent: true,
        pix_sent: false,
        error_code: "pix_text_send_failed",
        pix_error_code: chamada2.error_code,
        presentation_message_id: chamada1.message_id,
        destination_masked: destinationMasked,
        parcela_id,
        pix_order_id,
        pix_version
      }, { status: 200 });
    }
    return Response.json({
      success: true,
      provider,
      message_type: "pix_text",
      status: "sent",
      calls_made: 2,
      presentation_message_id: chamada1.message_id,
      pix_message_id: chamada2.message_id,
      destination_masked: destinationMasked,
      parcela_id,
      pix_order_id,
      pix_version
    }, { status: 200 });
  } catch (error) {
    return Response.json({ success: false, status: "erro_interno", error_code: "internal_error" }, { status: 500 });
  }
});
