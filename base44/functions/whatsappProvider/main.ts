/**
 * whatsappProvider — Fase Piloto ZAP-API
 *
 * Responsabilidade exclusiva: validar, montar e enviar requisição para a ZAP-API.
 * Não consulta parcelas, clientes ou regras financeiras.
 *
 * Segurança:
 * - WHATSAPP_ENABLED deve ser true
 * - WHATSAPP_TEST_MODE deve ser true (piloto)
 * - phone deve ser exatamente WHATSAPP_TEST_PHONE normalizado
 * - Nunca registra tokens, URL completa ou telefone completo nos logs
 */

// --- Normalização de secrets booleanas ---
// Secrets podem conter espaços, maiúsculas ou quebras de linha.
// Aplica trim + toLowerCase e retorna true somente quando o resultado for exatamente "true".
function parseBooleanSecret(raw) {
  if (!raw || typeof raw !== 'string') return false;
  return raw.trim().toLowerCase() === 'true';
}

// --- Normalização de telefone (centralizada) ---
function normalizePhone(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  // Remove zeros à esquerda de DDI (00) e sinal +
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('55')) {
    // DDI já presente — valida
  } else {
    digits = '55' + digits;
  }

  // Validação: 12 dígitos (55 + DDD + 8) ou 13 dígitos (55 + DDD + 9)
  if (digits.length !== 12 && digits.length !== 13) return null;

  // Valida DDD (posição 2-3): não pode ser 00 nem inexistente
  const ddd = digits.substring(2, 4);
  const validDDDs = ['11','12','13','14','15','16','17','18','19','21','22','24','27','28','31','32','33','34','35','37','38','41','42','43','44','45','46','47','48','49','51','53','54','55','61','62','63','64','65','66','67','68','69','71','73','74','75','77','79','81','82','83','84','85','86','87','88','89','91','92','93','94','95','96','97','98','99'];
  if (!validDDDs.includes(ddd)) return null;

  return digits;
}

// Mascarar telefone: 55*******1234
function maskPhone(phone) {
  if (!phone || phone.length < 6) return '***';
  return phone.substring(0, 2) + '*'.repeat(phone.length - 6) + phone.substring(phone.length - 4);
}

// Erro controlado padronizado
function erroControlado(status, errorCode, httpStatus) {
  return Response.json({
    success: false,
    status: status,
    http_status: httpStatus || 0,
    error_code: errorCode,
  }, { status: 200 });
}

Deno.serve(async (req) => {
  try {
    // --- Autenticação interna ---
    const authHeader = req.headers.get('Authorization') || '';
    const expectedToken = Deno.env.get('WHATSAPP_INTERNAL_TOKEN') || '';
    const receivedToken = authHeader.replace(/^Bearer\s+/i, '');

    if (!expectedToken || receivedToken !== expectedToken) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    // --- Controles de segurança ---
    const enabled = parseBooleanSecret(Deno.env.get('WHATSAPP_ENABLED'));
    const testMode = parseBooleanSecret(Deno.env.get('WHATSAPP_TEST_MODE'));
    const testPhoneRaw = Deno.env.get('WHATSAPP_TEST_PHONE') || '';

    if (!enabled) {
      return erroControlado('erro_controle', 'whatsapp_disabled', 0);
    }
    if (!testMode) {
      return erroControlado('erro_controle', 'test_mode_off', 0);
    }

    // --- Validação do telefone de teste ---
    const normalizedTestPhone = normalizePhone(testPhoneRaw);
    if (!normalizedTestPhone) {
      return erroControlado('erro_controle', 'invalid_test_phone', 0);
    }

    // --- Parse do body ---
    const body = await req.json().catch(() => ({}));
    const {
      phone,
      message,
      parcela_id,
      data_referencia,
      test_mode,
      idempotency_key,
    } = body;

    // --- Validações de campos obrigatórios ---
    if (!message || typeof message !== 'string' || message.trim() === '') {
      return erroControlado('erro_validacao', 'empty_message', 0);
    }
    if (!parcela_id || typeof parcela_id !== 'string') {
      return erroControlado('erro_validacao', 'empty_parcela_id', 0);
    }
    if (!idempotency_key || typeof idempotency_key !== 'string') {
      return erroControlado('erro_validacao', 'empty_idempotency_key', 0);
    }

    // --- O telefone recebido deve ser exatamente o WHATSAPP_TEST_PHONE normalizado ---
    const normalizedReceived = normalizePhone(phone || '');
    if (normalizedReceived !== normalizedTestPhone) {
      // Não envia para telefone real do cliente — rejeita
      return erroControlado('erro_validacao', 'phone_not_test_phone', 0);
    }

    // --- Montar requisição ZAP-API ---
    const instanceId = Deno.env.get('ZAPAPI_INSTANCE_ID') || '';
    const zapapiToken = Deno.env.get('ZAPAPI_TOKEN') || '';

    if (!instanceId || !zapapiToken) {
      return erroControlado('erro_controle', 'missing_zapi_credentials', 0);
    }

    const zapiUrl = `https://api.zap-api.tech/v1/instances/${instanceId}/send`;
    const destinationMasked = maskPhone(normalizedTestPhone);

    // --- Timeout de 10s com AbortController ---
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    let zapiResponse;
    let httpStatus = 0;
    let responseBody = null;

    try {
      zapiResponse = await fetch(zapiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${zapapiToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          phone: normalizedTestPhone,
          type: 'text',
          body: message,
        }),
        signal: controller.signal,
      });
      httpStatus = zapiResponse.status;
      responseBody = await zapiResponse.json().catch(() => null);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        return Response.json({
          success: false,
          status: 'erro_zapi',
          http_status: 0,
          error_code: 'timeout_zapi',
          destination_masked: destinationMasked,
          idempotency_key: idempotency_key,
        }, { status: 200 });
      }
      return Response.json({
        success: false,
        status: 'erro_zapi',
        http_status: 0,
        error_code: 'fetch_error',
        destination_masked: destinationMasked,
        idempotency_key: idempotency_key,
      }, { status: 200 });
    }
    clearTimeout(timeoutId);

    // --- Tratamento de respostas ---
    if (zapiResponse.ok) {
      // HTTP 2xx — aceito na fila da ZAP-API
      const messageId = responseBody?.messageId || responseBody?.id || null;
      return Response.json({
        success: true,
        status: 'aceito_pela_zapi',
        http_status: httpStatus,
        message_id: messageId,
        destination_masked: destinationMasked,
        idempotency_key: idempotency_key,
      }, { status: 200 });
    }

    // Erros da ZAP-API
    let errorCode = 'unknown';
    if (httpStatus === 400) errorCode = 'bad_request';
    else if (httpStatus === 401 || httpStatus === 403) errorCode = 'invalid_credentials';
    else if (httpStatus === 429) errorCode = 'rate_limit';
    else if (httpStatus >= 500) errorCode = 'provider_unavailable';

    return Response.json({
      success: false,
      status: 'erro_zapi',
      http_status: httpStatus,
      error_code: errorCode,
      destination_masked: destinationMasked,
      idempotency_key: idempotency_key,
    }, { status: 200 });

  } catch (error) {
    return Response.json({ success: false, status: 'erro_interno', error_code: 'internal_error' }, { status: 500 });
  }
});