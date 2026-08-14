// Helper privado (prefixo "_" — não vira Function pública, mesmo padrão já usado por
// _codexAlerts.js / _profileIdentity.js / _profileMemory.js / _profileLearning.js /
// _gerarCobrancaLyra.js). Exporta só funções nomeadas, importadas por api/system-tools.js.
// Nenhum `export default`.
//
// Responsabilidade: ponte segura entre o CRM (navegador) e a Backend Function do
// PRIME Cobranças. O navegador nunca recebe nem conhece nenhum dos tokens de
// serviço — eles só existem aqui, lidos de process.env, nunca logados, nunca
// devolvidos.
//
// O proxy NÃO decide template, NÃO decide vendedor — isso continua responsabilidade
// exclusiva do backend Base44. Este arquivo valida o contrato mínimo aceito do
// navegador e repassa apenas os campos seguros da resposta de volta ao navegador.
//
// migração Free→Builder (envio real): o envio passou a usar a function
// enviarMensagemGeralWhatsApp do PRIME Cobranças Builder ({cliente_id, message,
// idempotency_key}, autenticada por WHATSAPP_INTERNAL_TOKEN) — telefone resolvido
// internamente pelo próprio Builder a partir de cliente_id, nunca tratado aqui.
// As ações só-leitura (listar_templates/previsualizar) continuam no Free
// (MENSAGEM_MANUAL_URL/MENSAGEM_MANUAL_SERVICE_TOKEN) — sem equivalente no
// Builder ainda.

const MENSAGEM_MANUAL_URL = 'https://prime-vip.base44.app/functions/enviarMensagemManualWhatsapp'
const ENVIAR_MENSAGEM_GERAL_URL = 'https://6a728f9b46a0aea20081a11f.base44.app/functions/enviarMensagemGeralWhatsApp'
const MENSAGEM_MANUAL_TIMEOUT_MS = 12000
// 'acao' aceito aqui só pra permitir o valor explícito 'enviar' (compatibilidade com
// quem passar a mandar `acao` sempre) — listar_templates/previsualizar são
// interceptados antes desta validação (ver validarPayloadListarTemplates/
// validarPayloadPrevisualizar), nunca chegam a chamar esta função.
const CAMPOS_PERMITIDOS_BROWSER = ['cliente_id', 'texto_mensagem', 'request_id', 'acao']
const TEXTO_MENSAGEM_MIN = 2
const TEXTO_MENSAGEM_MAX = 2000
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

// --- Rate-limit best-effort — em memória do processo, mesmo padrão já usado em
// checarRateLimitFrontendBestEffort/checarRateLimitPorParcelaBestEffort (system-tools.js).
// Documentado honestamente: reseta a cada cold start, não é compartilhado entre
// instâncias/regiões da Vercel — não substitui autenticação real nem trava distribuída.
// A idempotência definitiva continua inteiramente do lado de enviarMensagemManualWhatsapp
// (Base44), por request_id — este rate-limit só reduz abuso trivial na mesma instância quente.
const tentativasMensagemManualPorIp = new Map()
const MENSAGEM_MANUAL_RATE_LIMIT_JANELA_MS = 60 * 1000
const MENSAGEM_MANUAL_RATE_LIMIT_MAX_POR_IP = 5

// Guarda apenas "está em andamento nesta instância agora" — nunca substitui a idempotência
// real (feita por request_id dentro de enviarMensagemManualWhatsapp via LogNotificacao).
// Serve só para rejeitar rapidamente, sem round-trip ao Base44, duas submissões
// simultâneas do mesmo clique/duplo-clique dentro da MESMA instância serverless.
const requestIdsEmAndamento = new Set()

export function checarRateLimitMensagemManualBestEffort(ip) {
  const agora = Date.now()
  const chave = ip || 'desconhecido'
  const historico = (tentativasMensagemManualPorIp.get(chave) || []).filter(
    t => agora - t < MENSAGEM_MANUAL_RATE_LIMIT_JANELA_MS,
  )
  historico.push(agora)
  tentativasMensagemManualPorIp.set(chave, historico)
  return historico.length <= MENSAGEM_MANUAL_RATE_LIMIT_MAX_POR_IP
}

export function iniciarRequestIdSeLivre(requestId) {
  if (requestIdsEmAndamento.has(requestId)) return false
  requestIdsEmAndamento.add(requestId)
  return true
}

export function liberarRequestId(requestId) {
  requestIdsEmAndamento.delete(requestId)
}

// Origin por igualdade exata (nunca startsWith/includes) — mesmo padrão já usado em
// gerar-cobranca-lyra contra GERAR_COBRANCA_ALLOWED_ORIGINS. Defesa complementar, nunca
// autenticação principal — o CRM hoje não tem sessão de usuário real (auditado nesta
// mesma etapa: cobrancasService.js só usa uma api_key de aplicação Base44, não uma
// sessão), então Origin é o único controle de camada de rede disponível nesta fase.
function normalizarOrigin(valor) {
  return String(valor || '').trim().replace(/\/+$/, '')
}

export function checarOrigemMensagemManual(origemRecebida) {
  const origensPermitidas = String(process.env.MENSAGEM_MANUAL_ALLOWED_ORIGINS || '')
    .split(',')
    .map(normalizarOrigin)
    .filter(Boolean)
  const origem = normalizarOrigin(origemRecebida)
  return Boolean(origem) && origensPermitidas.includes(origem)
}

// Validação estrita do contrato aceito do navegador — allowlist explícita. telefone,
// nome, vendedor, template_key, template_id, idempotency_key, modo_teste e qualquer
// campo financeiro NUNCA são aceitos aqui (nem fariam sentido: quem decide tudo isso é
// enviarMensagemManualWhatsapp, do lado do PRIME).
export function validarPayloadMensagemManual(body) {
  const camposDesconhecidos = Object.keys(body || {}).filter(k => !CAMPOS_PERMITIDOS_BROWSER.includes(k))
  if (camposDesconhecidos.length > 0) {
    return { valido: false, error_code: 'campos_nao_permitidos', campos: camposDesconhecidos }
  }

  const { cliente_id, texto_mensagem, request_id } = body || {}

  if (!cliente_id || typeof cliente_id !== 'string' || cliente_id.trim() === '') {
    return { valido: false, error_code: 'cliente_id_invalido' }
  }

  if (typeof texto_mensagem !== 'string') {
    return { valido: false, error_code: 'texto_mensagem_invalido' }
  }
  const textoTrim = texto_mensagem.trim()
  if (textoTrim === '' || textoTrim.length < TEXTO_MENSAGEM_MIN || textoTrim.length > TEXTO_MENSAGEM_MAX) {
    return { valido: false, error_code: 'texto_mensagem_invalido' }
  }

  if (!request_id || typeof request_id !== 'string' || !UUID_REGEX.test(request_id)) {
    return { valido: false, error_code: 'request_id_invalido' }
  }

  return { valido: true, cliente_id, texto_mensagem: textoTrim, request_id }
}

// Chamada HTTP direta à function enviarMensagemGeralWhatsApp (PRIME Cobranças
// Builder) — timeout via AbortController, uma única chamada, sem retry, resposta
// sempre parseada defensivamente. `request_id` do IGNITE é reaproveitado como
// `idempotency_key` sem transformação (já é estável entre retries de rede, mesma
// semântica que o Builder espera). `phone` NÃO faz parte do contrato — o Builder
// resolve Cliente.telefone internamente a partir de cliente_id.
export async function chamarEnviarMensagemManualWhatsapp({ cliente_id, texto_mensagem, request_id }) {
  const internalToken = process.env.WHATSAPP_INTERNAL_TOKEN
  if (!internalToken) {
    return { ok: false, error_code: 'missing_internal_token' }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), MENSAGEM_MANUAL_TIMEOUT_MS)
  try {
    const resp = await fetch(ENVIAR_MENSAGEM_GERAL_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${internalToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cliente_id,
        message: texto_mensagem,
        idempotency_key: request_id,
      }),
      signal: controller.signal,
    })

    let json = null
    try {
      json = await resp.json()
    } catch (_parseErr) {
      return { ok: false, error_code: 'resposta_invalida_base44', httpStatusRecebido: resp.status }
    }

    if (!resp.ok) {
      console.error('[system-tools:mensagem-manual] Base44 respondeu não-2xx', {
        httpStatus: resp.status,
        error_code: json?.error_code,
        status: json?.status,
      })
      return { ok: false, error_code: 'erro_http_base44', httpStatusRecebido: resp.status, json }
    }

    return { ok: true, json }
  } catch (err) {
    const motivo = err.name === 'AbortError' ? 'timeout_base44' : 'erro_rede_base44'
    return { ok: false, error_code: motivo }
  } finally {
    clearTimeout(timeoutId)
  }
}

// Filtra a resposta bruta do Base44 para só os campos seguros — nunca token, telefone
// completo, mensagem completa, stack trace, corpo bruto desconhecido, detalhes internos
// de autenticação.
export function construirRespostaSeguraMensagemManual(json, requestId) {
  const base = {
    success: Boolean(json?.success),
    status: json?.status ?? null,
    request_id: requestId,
  }
  if (json?.error_code) base.error_code = json.error_code
  if (json?.template_status) base.template_status = json.template_status
  if (typeof json?.already_sent === 'boolean') base.already_sent = json.already_sent
  if (json?.destination_masked) base.destination_masked = json.destination_masked
  if (json?.message_id) base.message_id = json.message_id
  return base
}

// --- Fase 1 (mensagem pronta com template) — listar_templates / previsualizar.
// Mesma URL/token/timeout do envio já validado (chamarEnviarMensagemManualWhatsapp,
// intocada acima) — só o corpo do POST muda (`acao`). Nenhuma nova Function/endpoint
// criado. Ambas as ações são só leitura: a Function do lado do Base44 garante que
// nenhuma delas cria LogNotificacao nem chama whatsappProvider. ---

const TEMPLATE_KEY_REGEX = /^[a-z_]+$/

async function postMensagemManualBase44(body) {
  const serviceToken = process.env.MENSAGEM_MANUAL_SERVICE_TOKEN
  if (!serviceToken) {
    return { ok: false, error_code: 'missing_service_token' }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), MENSAGEM_MANUAL_TIMEOUT_MS)
  try {
    const resp = await fetch(MENSAGEM_MANUAL_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    let json = null
    try {
      json = await resp.json()
    } catch (_parseErr) {
      return { ok: false, error_code: 'resposta_invalida_base44', httpStatusRecebido: resp.status }
    }

    if (!resp.ok) {
      return { ok: false, error_code: 'erro_http_base44', httpStatusRecebido: resp.status, json }
    }

    return { ok: true, json }
  } catch (err) {
    const motivo = err.name === 'AbortError' ? 'timeout_base44' : 'erro_rede_base44'
    return { ok: false, error_code: motivo }
  } finally {
    clearTimeout(timeoutId)
  }
}

export function validarPayloadListarTemplates(body) {
  const camposDesconhecidos = Object.keys(body || {}).filter(k => k !== 'acao')
  if (camposDesconhecidos.length > 0) {
    return { valido: false, error_code: 'campos_nao_permitidos', campos: camposDesconhecidos }
  }
  return { valido: true }
}

// Validação estrita do contrato de previsualizar — allowlist explícita. cliente_id/
// parcela_id são strings opacas (nunca interpretadas aqui); template_key é validado só
// contra um formato conservador (snake_case minúsculo) — a allowlist real de templates
// habilitados vive inteiramente do lado do Base44 (TEMPLATES_HABILITADOS_PREVIA).
export function validarPayloadPrevisualizar(body) {
  const CAMPOS_PREVIA = ['acao', 'cliente_id', 'parcela_id', 'template_key']
  const camposDesconhecidos = Object.keys(body || {}).filter(k => !CAMPOS_PREVIA.includes(k))
  if (camposDesconhecidos.length > 0) {
    return { valido: false, error_code: 'campos_nao_permitidos', campos: camposDesconhecidos }
  }

  const { cliente_id, parcela_id, template_key } = body || {}

  if (!cliente_id || typeof cliente_id !== 'string' || cliente_id.trim() === '') {
    return { valido: false, error_code: 'cliente_id_invalido' }
  }
  if (!parcela_id || typeof parcela_id !== 'string' || parcela_id.trim() === '') {
    return { valido: false, error_code: 'parcela_id_invalido' }
  }
  if (!template_key || typeof template_key !== 'string' || !TEMPLATE_KEY_REGEX.test(template_key)) {
    return { valido: false, error_code: 'template_key_invalido' }
  }

  return { valido: true, cliente_id, parcela_id, template_key }
}

export async function chamarListarTemplates() {
  return postMensagemManualBase44({ acao: 'listar_templates' })
}

export async function chamarPrevisualizarMensagem({ cliente_id, parcela_id, template_key }) {
  return postMensagemManualBase44({ acao: 'previsualizar', cliente_id, parcela_id, template_key })
}

// Filtra a resposta bruta do Base44 — nunca telefone/token/payload bruto/stack trace.
export function construirRespostaSeguraListarTemplates(json) {
  const templates = Array.isArray(json?.templates) ? json.templates : []
  return {
    success: Boolean(json?.success),
    templates: templates.map(t => ({
      key: t?.key,
      nome: t?.nome,
      descricao: t?.descricao ?? null,
      categoria: t?.categoria ?? null,
      variaveis_permitidas: Array.isArray(t?.variaveis_permitidas) ? t.variaveis_permitidas : [],
      requer_parcela: Boolean(t?.requer_parcela),
    })),
  }
}

export function construirRespostaSeguraPrevisualizar(json) {
  const base = {
    success: Boolean(json?.success),
    status: json?.status ?? null,
    template_key: json?.template_key ?? null,
    template_nome: json?.template_nome ?? null,
    cliente_id: json?.cliente_id ?? null,
    parcela_id: json?.parcela_id ?? null,
    texto_renderizado: json?.texto_renderizado ?? null,
    variaveis_resolvidas: Array.isArray(json?.variaveis_resolvidas) ? json.variaveis_resolvidas : [],
    variaveis_faltantes: Array.isArray(json?.variaveis_faltantes) ? json.variaveis_faltantes : [],
    template_status: json?.template_status ?? null,
  }
  if (json?.error_code) base.error_code = json.error_code
  return base
}
