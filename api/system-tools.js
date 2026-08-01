// Endpoint combinado pra caber no limite de 12 Serverless Functions do Hobby.
// Utilitários pequenos e sem relação direta entre si, mas todos leves e de
// baixo tráfego — juntos num arquivo só, divididos por ?tool=.
//
// ?tool=vercel-status     → status do último deploy da Vercel (card do Dashboard) — SEM autenticação
// ?tool=sync-lyra         → sincroniza Cobranca da Lyra pro PRIME (Cliente/Venda/Parcela)
//                           (?dryRun=false pra escrever de verdade; default só relatório)
//                           Exige header Authorization: Bearer <CRON_SECRET> em AMBOS os modos
//                           (dryRun=true também, porque expõe nomes/valores/status financeiros)
// ?tool=stuck-check       → healthcheck de conversas do GPT Maker sem resposta há 3-30min
//                           (chamado pelo GitHub Actions .github/workflows/stuck-check.yml)
//                           Exige header Authorization: Bearer <CRON_SECRET>
// ?tool=lyra-webhook      → recebe aviso em tempo real da Lyra (processarEventoMP) quando
//                           um pagamento é confirmado — baixa a Parcela na hora, sem esperar
//                           o cron. Exige header Authorization: Bearer <LYRA_WEBHOOK_SECRET>
//                           (segredo próprio, diferente do CRON_SECRET). O cron de sync-lyra
//                           continua existindo como rede de segurança caso este webhook falhe.
// ?tool=gerar-cobranca-lyra → FASE 2.2, estritamente dry-run: recebe só parcela_id, consulta
//                           Parcela/Venda/Cliente no PRIME + Cliente na Lyra (só leitura) e
//                           devolve um relatório do que a FASE 2.3 faria — não escreve nada,
//                           não chama a Lyra nem o Mercado Pago. Exige header
//                           Authorization: Bearer <GERAR_COBRANCA_SECRET> (segredo próprio,
//                           diferente de CRON_SECRET e LYRA_WEBHOOK_SECRET) + checagem
//                           best-effort de Origin/Referer contra GERAR_COBRANCA_ALLOWED_ORIGINS.
//                           FASE 3.3.1 — aceita também Authorization: Bearer <COBRANCA_FRONTEND_TOKEN>
//                           (modoAuth='frontend'), token público temporário exclusivo desta tool,
//                           que só autoriza dryRun=false com body estritamente {parcela_id, dryRun}
//                           e Origin exato — nunca autentica nenhuma outra tool.
// ?tool=qwen-health       → health check do QwenCloud pro Operations Center (Fase 2A.1, migrado
//                           de api/qwen-health.js pra caber no limite de 12 functions do Hobby —
//                           mesma lógica, sem nenhuma mudança de comportamento). GET só lê o
//                           último estado persistido em qwen_health_state (Supabase, nunca chama
//                           o QwenCloud). POST solicita uma verificação real, mas só é efetivada
//                           se a trava atômica persistida (claim_qwen_health_check, migration 015)
//                           permitir — sem autenticação de usuário (o projeto não tem login hoje),
//                           mitigado só pela trava. Ver docs/SUPABASE.md §3.6 para detalhes.
// ?tool=openrouter-usage  → saldo real do OpenRouter pro Dashboard + Operations Center (Pacote 1
//                           da migração de segurança — VITE_OPENROUTER_API_KEY saía exposta no
//                           bundle do frontend). Só GET, sem autenticação de usuário (mesmo desenho
//                           do vercel-status — consulta pública de baixo risco, sem custo por
//                           chamada). Cache em memória best-effort de 5min (não precisa ser
//                           persistente: consultar créditos de novo não gera custo real, ao
//                           contrário de uma chamada de chat). Sem Supabase, sem trava atômica —
//                           não se aplica aqui. CODEX e OCR migrados no Pacote 2 (ver abaixo).
// ?tool=codex-openrouter  → Pacote 2: proxy fiel do fallback de modelo OpenRouter do CODEX
//                           (askCODEX() em groq.js). POST faz a chamada real (sem autenticação
//                           de usuário adicional — mesmo nível de exposição de antes da migração,
//                           só que sem a chave no bundle). GET devolve a allowlist atual (curada,
//                           até 10 modelos + o router automático "openrouter/free" no final) —
//                           usada pelo dropdown do CODEX em DealOncaPage.jsx. Allowlist vem do
//                           catálogo oficial do OpenRouter (cache 12h + último snapshot válido
//                           como fallback — ver getOpenRouterAllowlist), não mais hardcoded:
//                           auditoria de 2026-07-27 encontrou 7 dos 9 IDs antigos já removidos
//                           pelo próprio OpenRouter. A allowlist server-side é sempre a
//                           autoridade final — o POST revalida contra ela independente do que
//                           o GET tiver mostrado.
// ?tool=ocr-openrouter    → Pacote 2: proxy fiel do fallback de visão do OCR (ocrService.js).
//                           Mesmo desenho do codex-openrouter (GET lista até 3 modelos de visão
//                           curados, POST faz a chamada real).
// ?tool=perplexity-health → health check real da API do Perplexity pro Operations Center. A API
//                           do Perplexity não expõe saldo/uso/requests (só o endpoint de chat) —
//                           por isso o card mostra só o que é real: status (online/offline),
//                           modelo, latência e última verificação, nunca saldo/consumo inventado.
//                           GET só lê o cache em memória (nunca chama o Perplexity). POST chama
//                           de verdade (prompt mínimo, max_tokens:1) e atualiza o cache — mesmo
//                           padrão de cache best-effort do openrouter-usage (sem Supabase, sem
//                           trava atômica: não há custo real relevante em repetir a chamada).
// ?tool=prime-cobrancas-status → Fase A do card real "PRIME Cobranças" no Operations Center
//                           (substitui o mock estático do Base44). Consolida ping real dos 2 apps
//                           Base44 (PRIME + Lyra, mesmo BASE44_API_KEY já usado por sync-lyra/
//                           lyra-webhook) + a última atividade real (HistoricoAtividade, só
//                           timestamp — nunca o registro bruto). WhatsApp/Z-API aparece sempre como
//                           "not_checked" nesta fase — a integração de status real da Z-API fica
//                           pra uma fase futura (não inventar "conectado"/"trial vencido" sem
//                           confirmação técnica real). Só GET, cache em memória best-effort de
//                           3min (?force=true ignora o cache, usado pelo "Atualizar agora").
//                           Nunca retorna nome/telefone/CPF/PIX/valor de cliente nem segredo.
// ?tool=mensagem-manual   → liga o proxy já existente (_mensagemManualProxy.js) ao
//                           dispatcher — POST usado pelo modal "Enviar mensagem pelo
//                           WhatsApp" (EnviarMensagemManualModal.jsx/cobrancasService.js).
//                           Delega integralmente pro proxy: validação de payload, Origin
//                           exata (MENSAGEM_MANUAL_ALLOWED_ORIGINS), rate-limit best-effort
//                           por IP, dedupe de request_id em andamento na mesma instância,
//                           e a chamada real a enviarMensagemManualWhatsapp (Base44) com
//                           MENSAGEM_MANUAL_SERVICE_TOKEN. Nenhuma lógica nova aqui — só
//                           o roteamento que faltava (o proxy já existia, sem case no switch).
// ?tool=mcp               → IGNITE PRIME MCP Lite, somente leitura. Implementa só o
//                           necessário do protocolo MCP (JSON-RPC 2.0 sobre HTTP POST)
//                           pra um cliente remoto (GPT Maker/Gabriela) completar o
//                           handshake: initialize, notifications/initialized, tools/list,
//                           tools/call. Ferramentas anunciadas: verificar_conexao (sem
//                           parâmetros), consultar_cobrancas (Base44 PRIME, nunca Lyra) e
//                           consultar_cep (ViaCEP, sem segredo/autenticação externa).
//                           Nenhuma delas escreve em nada. Exige header
//                           Authorization: Bearer <MCP_LITE_SECRET> — segredo próprio,
//                           nunca compartilhado com CRON_SECRET/LYRA_WEBHOOK_SECRET/etc.

import { createClient } from '@base44/sdk'
import crypto from 'node:crypto'
import { gerarCobrancaLyraDryRun, gerarCobrancaLyraReal, checarRateLimitBestEffort, checarOrigemBestEffort } from './_gerarCobrancaLyra.js'
import { consultarCobrancas } from './_consultarCobrancas.js'
import { consultarCep } from './_consultarCep.js'
import {
  checarRateLimitMensagemManualBestEffort,
  iniciarRequestIdSeLivre,
  liberarRequestId,
  checarOrigemMensagemManual,
  validarPayloadMensagemManual,
  chamarEnviarMensagemManualWhatsapp,
  construirRespostaSeguraMensagemManual,
  validarPayloadListarTemplates,
  validarPayloadPrevisualizar,
  chamarListarTemplates,
  chamarPrevisualizarMensagem,
  construirRespostaSeguraListarTemplates,
  construirRespostaSeguraPrevisualizar,
} from './_mensagemManualProxy.js'
import { processarLote, obterClienteComEventos, obterAgregados } from './_nexClientes.js'

// Rate limit exclusivo do modo frontend (FASE 3.3.1) — Maps separados do limitador
// administrativo (checarRateLimitBestEffort, importado acima), pra não compartilhar
// orçamento entre os dois modos. Best-effort: em memória do processo, reseta a cada
// cold start, não é compartilhado entre instâncias/regiões da Vercel — não substitui
// autenticação real, só reduz abuso trivial repetido na mesma instância quente.
const tentativasFrontendPorIp = new Map()
const tentativasFrontendPorParcela = new Map()
const FRONTEND_RATE_LIMIT_JANELA_MS = 60 * 1000
const FRONTEND_RATE_LIMIT_MAX_POR_IP = 5
const FRONTEND_RATE_LIMIT_PARCELA_JANELA_MS = 5 * 60 * 1000
const FRONTEND_RATE_LIMIT_MAX_POR_PARCELA = 2

function checarRateLimitFrontendBestEffort(ip) {
  const agora = Date.now()
  const chave = ip || 'desconhecido'
  const historico = (tentativasFrontendPorIp.get(chave) || []).filter(t => agora - t < FRONTEND_RATE_LIMIT_JANELA_MS)
  historico.push(agora)
  tentativasFrontendPorIp.set(chave, historico)
  return historico.length <= FRONTEND_RATE_LIMIT_MAX_POR_IP
}

function checarRateLimitPorParcelaBestEffort(parcelaId) {
  const agora = Date.now()
  const historico = (tentativasFrontendPorParcela.get(parcelaId) || []).filter(t => agora - t < FRONTEND_RATE_LIMIT_PARCELA_JANELA_MS)
  historico.push(agora)
  tentativasFrontendPorParcela.set(parcelaId, historico)
  return historico.length <= FRONTEND_RATE_LIMIT_MAX_POR_PARCELA
}

// Hash curto do IP pra log — nunca o IP completo, nunca token/Authorization.
function ipHashCurto(ip) {
  return ip ? crypto.createHash('sha256').update(ip).digest('hex').slice(0, 8) : null
}

// Rate limit best-effort exclusivo de consultar_cobrancas (tool=mcp) — Map próprio,
// não compartilhado com nenhum outro limitador deste arquivo (mesmo motivo do bloco
// "frontend" acima: orçamentos de features diferentes não devem se misturar). Mesma
// ressalva de sempre: em memória do processo, reseta a cada cold start, não é
// compartilhado entre instâncias/regiões — não substitui autenticação real (que já é
// o Bearer MCP_LITE_SECRET), só reduz abuso trivial repetido na mesma instância quente.
// 60/min (não 10/min) porque o IP que chega aqui é o da infraestrutura do GPT Maker
// fazendo a chamada MCP, não o IP individual de cada conversa/cliente — esse orçamento
// pode ser compartilhado por várias conversas simultâneas da Gabriela; um limite baixo
// bloquearia atendimento legítimo por volume, não abuso real.
const tentativasConsultarCobrancasPorIp = new Map()
const CONSULTAR_COBRANCAS_RATE_LIMIT_JANELA_MS = 60 * 1000
const CONSULTAR_COBRANCAS_RATE_LIMIT_MAX_POR_IP = 60

function checarRateLimitConsultarCobrancasBestEffort(ip) {
  const agora = Date.now()
  const chave = ip || 'desconhecido'
  const historico = (tentativasConsultarCobrancasPorIp.get(chave) || [])
    .filter(t => agora - t < CONSULTAR_COBRANCAS_RATE_LIMIT_JANELA_MS)
  historico.push(agora)
  tentativasConsultarCobrancasPorIp.set(chave, historico)
  return historico.length <= CONSULTAR_COBRANCAS_RATE_LIMIT_MAX_POR_IP
}

// Rate limit best-effort exclusivo de consultar_cep (tool=mcp) — Map próprio, mesmo
// motivo dos outros dois acima (orçamentos de features diferentes não devem se
// misturar). ViaCEP é público e sem custo por chamada, então o limite aqui existe só
// pra conter um loop/bug descontrolado martelando o serviço externo, não por risco
// de dado sensível — por isso o mesmo teto generoso de consultar_cobrancas.
const tentativasConsultarCepPorIp = new Map()
const CONSULTAR_CEP_RATE_LIMIT_JANELA_MS = 60 * 1000
const CONSULTAR_CEP_RATE_LIMIT_MAX_POR_IP = 60

function checarRateLimitConsultarCepBestEffort(ip) {
  const agora = Date.now()
  const chave = ip || 'desconhecido'
  const historico = (tentativasConsultarCepPorIp.get(chave) || [])
    .filter(t => agora - t < CONSULTAR_CEP_RATE_LIMIT_JANELA_MS)
  historico.push(agora)
  tentativasConsultarCepPorIp.set(chave, historico)
  return historico.length <= CONSULTAR_CEP_RATE_LIMIT_MAX_POR_IP
}

const VERCEL_TOKEN = process.env.VERCEL_ACCESS_TOKEN
const PROJECT_ID = 'prj_apJGLxIL6ooCFTCuboQiHwuveOw9'
const TEAM_ID = 'team_O0lVaTLcrP62cKLeTZwclgAq'

const BASE44_API_KEY = process.env.BASE44_API_KEY
const LYRA_APP_ID = '6a518d72335f3c31663dc63d'
const PRIME_APP_ID = '6a50402b2eeb1d1114312861'

// tool=prime-cobrancas-status (Fase C) — token interno já usado pra autenticar
// chamadas legítimas dentro do próprio Base44 (mesmo secret que lembreteCobrancas
// usa pra chamar whatsappProvider). Nunca exposto ao frontend, nunca logado.
const WHATSAPP_INTERNAL_TOKEN = process.env.WHATSAPP_INTERNAL_TOKEN
const WHATSAPP_PROVIDER_URL = 'https://prime-vip.base44.app/functions/whatsappProvider'
const LYRA_WEBHOOK_SECRET = process.env.LYRA_WEBHOOK_SECRET

// tool=mcp — segredo próprio, independente de todos os outros deste arquivo.
const MCP_LITE_SECRET = process.env.MCP_LITE_SECRET

// tool=nex-sync-clientes, nex-cliente — segredo dedicado para sincronização NEX,
// isolado de CRON_SECRET, LYRA_WEBHOOK_SECRET e MCP_LITE_SECRET. Nunca exposto ao frontend.
const NEX_SYNC_SECRET = process.env.NEX_SYNC_SECRET

const GPTMAKER_TOKEN = process.env.VITE_GPTMAKER_TOKEN
const GPTMAKER_WS = process.env.VITE_GPTMAKER_WORKSPACE
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID
const GPTMAKER_BASE = 'https://api.gptmaker.ai'

// tool=qwen-health — mesma Secret key (service_role) já usada em api/_profileLearning.js.
// SUPABASE_URL acima é reaproveitada (não é segredo, já lida por outras tools deste arquivo).
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY
const QWEN_HEALTH_DEFAULT_MIN_INTERVAL_SECONDS = 1800
const QWEN_HEALTH_REQUEST_TIMEOUT_MS = 15000

// tool=openrouter-usage — Pacote 1 da migração de segurança (saldo só, sem chat/OCR ainda).
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const OPENROUTER_CACHE_TTL_MS = 5 * 60 * 1000
const OPENROUTER_REQUEST_TIMEOUT_MS = 8000

// tool=perplexity-health — sem saldo/uso (API não expõe), só health check real.
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY
const PERPLEXITY_MODEL = process.env.PERPLEXITY_MODEL || 'sonar'
const PERPLEXITY_CACHE_TTL_MS = 5 * 60 * 1000
const PERPLEXITY_REQUEST_TIMEOUT_MS = 15000

const STUCK_THRESHOLD_MS = 3 * 60 * 1000   // sem resposta por mais de 3min = suspeito
const STUCK_MAX_AGE_MS = 30 * 60 * 1000    // ignora chats com última msg há mais de 30min
const STUCK_DEDUPE_WINDOW_MS = 10 * 60 * 1000 // não alerta o mesmo chat de novo por 10min

// Rate limit simples para nex-sync-clientes — best-effort em memória (reseta a cada
// cold start, não compartilhado entre instâncias). Não substitui autenticação real (que
// é NEX_SYNC_SECRET), só reduz abuso trivial de requisições repetidas.
const tentativasNexPorIp = new Map()
const NEX_RATE_LIMIT_JANELA_MS = 60 * 1000
const NEX_RATE_LIMIT_MAX_POR_IP = 20

function checarRateLimitNexBestEffort(ip) {
  const agora = Date.now()
  const chave = ip || 'desconhecido'
  const historico = (tentativasNexPorIp.get(chave) || [])
    .filter(t => agora - t < NEX_RATE_LIMIT_JANELA_MS)
  historico.push(agora)
  tentativasNexPorIp.set(chave, historico)
  return historico.length <= NEX_RATE_LIMIT_MAX_POR_IP
}

// Cache em memória para nex-health (agregados sem PII) — reseta a cada cold start
let nexHealthCache = null
let nexHealthCacheTimestamp = 0
const NEX_HEALTH_CACHE_TTL_MS = 3 * 60 * 1000

function normalizePhone(phone) {
  return (phone || '').replace(/\D/g, '')
}

function normalizeName(name) {
  return (name || '').trim().toLowerCase()
}

// Prioridade de identificação da Parcela correspondente a uma Cobranca da Lyra:
// 1. lyra_cobranca_id — chave permanente, existe desde a criação da Cobranca (antes de qualquer MP)
// 2. mp_preference_id — existe assim que o link de pagamento é gerado, antes do pagamento
// 3. mp_payment_id — só existe depois que o pagamento acontece
// 4. fallback legado (nome+valor+vencimento) — só pra Parcelas criadas antes destes 3 campos existirem
function encontrarParcelaCorrespondente(cob, nomeCliente, primeParcelas) {
  let match = primeParcelas.find(p => p.lyra_cobranca_id && p.lyra_cobranca_id === cob.id)
  if (match) return match

  if (cob.mp_preference_id) {
    match = primeParcelas.find(p => p.mp_preference_id && p.mp_preference_id === cob.mp_preference_id)
    if (match) return match
  }

  if (cob.mp_payment_id) {
    match = primeParcelas.find(p => p.mp_payment_id && p.mp_payment_id === cob.mp_payment_id)
    if (match) return match
  }

  // Fallback só se a parcela não tiver nenhum dos 3 campos novos (registro pré-migração)
  return primeParcelas.find(p =>
    !p.lyra_cobranca_id && !p.mp_preference_id && !p.mp_payment_id &&
    normalizeName(p.cliente_nome) === normalizeName(nomeCliente) &&
    Math.abs((p.valor_base || 0) - cob.valor) < 0.01 &&
    (p.data_vencimento || '') === cob.vencimento
  )
}

// Confirma se a Parcela encontrada tem um identificador que bate EXATAMENTE com a Cobranca
// atual — não basta o campo existir, precisa corresponder. Distingue 3 situações:
// confirmado (bate certinho), divergente (tem ID mas não bate com esta Cobranca) e "nenhum
// dos dois" (parcela sem nenhum dos 3 campos, achada só pelo fallback legado).
function obterVinculoDeterministico(parcela, cob) {
  const porLyraId = Boolean(parcela.lyra_cobranca_id) && parcela.lyra_cobranca_id === cob.id
  const porPreferenceId = Boolean(parcela.mp_preference_id) && Boolean(cob.mp_preference_id) && parcela.mp_preference_id === cob.mp_preference_id
  const porPaymentId = Boolean(parcela.mp_payment_id) && Boolean(cob.mp_payment_id) && parcela.mp_payment_id === cob.mp_payment_id

  return {
    confirmado: porLyraId || porPreferenceId || porPaymentId,
    porLyraId,
    porPreferenceId,
    porPaymentId,
    temAlgumIdPreenchido: Boolean(parcela.lyra_cobranca_id || parcela.mp_preference_id || parcela.mp_payment_id),
  }
}

// Garante exatamente 1 registro de HistoricoAtividade automático por Parcela — idempotente
// mesmo sob falha parcial anterior (Parcela paga sem histórico) ou reprocessamento repetido
// (webhook + cron). Existência é checada por cobranca_id + tipo:'pagamento' + marcador
// '[AUTOMÁTICO]' na descrição (não usamos texto completo nem data/hora, que variam).
async function garantirHistoricoBaixaAutomatica(prime, { parcelaId, clienteNome, valor, mpPaymentId, dryRun }) {
  const ehAutomatico = h => h.tipo === 'pagamento' && (h.descricao || '').includes('[AUTOMÁTICO]')

  const existentes = await prime.entities.HistoricoAtividade.filter({ cobranca_id: parcelaId })
  if (existentes.some(ehAutomatico)) {
    return { criado: false, faltava: false }
  }

  if (dryRun) {
    return { criado: false, faltava: true }
  }

  // Proteção best-effort de concorrência: releitura imediatamente antes de escrever.
  const releitura = await prime.entities.HistoricoAtividade.filter({ cobranca_id: parcelaId })
  if (releitura.some(ehAutomatico)) {
    return { criado: false, faltava: false, nota: 'detectado na releitura de concorrência' }
  }

  await prime.entities.HistoricoAtividade.create({
    cobranca_id: parcelaId,
    tipo: 'pagamento',
    cliente_nome: clienteNome,
    valor,
    valor_anterior: '0',
    usuario: null,
    detalhes: `[AUTOMÁTICO] Identificado via sincronização Lyra/Mercado Pago em ${new Date().toISOString()} (mp_payment_id: ${mpPaymentId || 'n/d'}). Esta é a data em que o sync detectou o pagamento, não necessariamente a data real em que ele ocorreu.`,
    descricao: `[AUTOMÁTICO] Pagamento de R$ ${Number(valor).toFixed(2)} identificado via Lyra/Mercado Pago para ${clienteNome}`,
  })

  // Confirmação pós-escrita: reporta (em vez de mascarar) se duas execuções concorrentes
  // ainda assim conseguiram criar mais de um registro automático.
  const confirmacao = await prime.entities.HistoricoAtividade.filter({ cobranca_id: parcelaId })
  const totalAutomaticos = confirmacao.filter(ehAutomatico).length

  return { criado: true, faltava: true, duplicidadeDetectada: totalAutomaticos > 1, totalAutomaticos }
}

async function vercelStatus(req, res) {
  if (!VERCEL_TOKEN) {
    return res.status(500).json({ error: 'VERCEL_ACCESS_TOKEN não configurado' })
  }
  try {
    const headers = { Authorization: `Bearer ${VERCEL_TOKEN}` }
    const deploysRes = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${PROJECT_ID}&teamId=${TEAM_ID}&limit=1`,
      { headers }
    )
    if (!deploysRes.ok) {
      return res.status(deploysRes.status).json({ error: 'Falha ao consultar deployments' })
    }
    const { deployments } = await deploysRes.json()
    const latest = deployments?.[0]
    if (!latest) return res.status(200).json({ available: false })

    return res.status(200).json({
      available: true,
      state: latest.readyState,
      createdAt: latest.created,
      branch: latest.meta?.githubCommitRef || null,
      url: latest.url,
      target: latest.target || 'production',
      usageNote: 'Uso detalhado disponível no painel da Vercel',
    })
  } catch (e) {
    console.error('[system-tools:vercel-status] Erro:', e.message)
    return res.status(500).json({ error: 'Erro interno ao consultar status da Vercel' })
  }
}

async function enviarTelegramStuck(mensagem) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('[system-tools:stuck-check] Telegram não configurado')
    return
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: mensagem, parse_mode: 'HTML' }),
    })
    if (!res.ok) console.error('[system-tools:stuck-check] Telegram respondeu:', res.status, await res.text())
  } catch (err) {
    console.error('[system-tools:stuck-check] Erro ao enviar Telegram:', err.message)
  }
}

async function jaAlertadoRecenteStuck(chatId) {
  try {
    const desde = new Date(Date.now() - STUCK_DEDUPE_WINDOW_MS).toISOString()
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/codex_alerts?type=eq.chat_travado&conversation_id=eq.${encodeURIComponent(chatId)}&created_at=gte.${desde}&select=id&limit=1`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    )
    if (!res.ok) return false
    const data = await res.json()
    return data.length > 0
  } catch (err) {
    console.error('[system-tools:stuck-check] Erro ao checar dedupe:', err.message)
    return false
  }
}

async function registrarAlertaStuck(chatId, mensagem) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/codex_alerts`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ type: 'chat_travado', severity: 'critico', conversation_id: chatId, message: mensagem, data: null }),
    })
  } catch (err) {
    console.error('[system-tools:stuck-check] Erro ao registrar alerta:', err.message)
  }
}

async function stuckCheck(req, res) {
  try {
    const now = Date.now()
    const listRes = await fetch(`${GPTMAKER_BASE}/v2/workspace/${GPTMAKER_WS}/chats?page=1&pageSize=20`, {
      headers: { Authorization: `Bearer ${GPTMAKER_TOKEN}` },
    })
    if (!listRes.ok) {
      console.error('[system-tools:stuck-check] Falha ao listar chats:', listRes.status)
      return res.status(200).json({ ok: true, skipped: 'failed to list chats' })
    }
    const data = await listRes.json()
    const chats = Array.isArray(data) ? data : (data.data || [])

    let travados = 0

    for (const chat of chats) {
      const chatTime = chat.time || 0
      const idadeMs = now - chatTime
      if (idadeMs > STUCK_MAX_AGE_MS || idadeMs < STUCK_THRESHOLD_MS) continue
      // O campo "role" no resumo do chat já reflete quem mandou a última mensagem —
      // se não for cliente, alguém (ou o sistema) já respondeu, não está travado.
      if (chat.role !== 'user' && chat.role !== 'client') continue

      const jaAlertou = await jaAlertadoRecenteStuck(chat.id)
      if (jaAlertou) continue

      const minutos = Math.round(idadeMs / 60000)
      const nome = chat.name || chat.whatsappPhone || 'Cliente'
      const textoCliente = (chat.conversation || '').slice(0, 150)
      const mensagem = `⚠️ <b>CLIENTE SEM RESPOSTA</b>\n\n👤 ${nome}\n💬 "${textoCliente}"\n⏱️ Há ${minutos}min sem resposta\n\nVerifique o WhatsApp/painel GPT Maker.`

      await enviarTelegramStuck(mensagem)
      await registrarAlertaStuck(chat.id, `Cliente "${nome}" sem resposta: "${textoCliente}"`)
      travados++
    }

    console.log(`[system-tools:stuck-check] Verificados ${chats.length} chats, ${travados} alertados`)
    return res.status(200).json({ ok: true, checked: chats.length, alertados: travados })
  } catch (err) {
    console.error('[system-tools:stuck-check] Erro:', err.message)
    return res.status(500).json({ error: err.message })
  }
}

// Processa 1 Cobranca da Lyra contra o estado do PRIME: acha a Parcela correspondente
// (ou decide criar) e aplica a ação necessária. Usado tanto pelo sync em lote (syncLyra)
// quanto pelo webhook em tempo real (lyraWebhook) — mesma lógica, uma só implementação.
// `ctx.clientePorTelefone` é mutado (novo Cliente criado entra no Map) de propósito, pra
// runs sucessivos dentro do mesmo lote reaproveitarem o Cliente recém-criado.
async function processarCobranca(cob, ctx) {
  const { prime, lyraClientePorId, clientePorTelefone, primeParcelas, dryRun } = ctx

  // Nome vem preferencialmente do cadastro de Cliente da Lyra — o campo
  // cliente_nome da própria Cobranca às vezes vem vazio (visto em teste real).
  const lyraCliente = lyraClientePorId.get(cob.cliente_id)
  const nomeCliente = lyraCliente?.name || cob.cliente_nome || 'Sem nome'
  const telefoneLyra = normalizePhone(lyraCliente?.phone || '')

  const parcelaExistente = encontrarParcelaCorrespondente(cob, nomeCliente, primeParcelas)

  // --- Caso 1: já existe e já está paga — classifica o vínculo antes de decidir ---
  if (parcelaExistente && parcelaExistente.status === 'pago') {
    const vinculo = obterVinculoDeterministico(parcelaExistente, cob)
    const dadosParaAuditoria = {
      lyra_cobranca_id: cob.id,
      cliente_nome: nomeCliente,
      parcela_id: parcelaExistente.id,
      valor: parcelaExistente.valor_base,
      vencimento: parcelaExistente.data_vencimento,
      parcela_lyra_cobranca_id: parcelaExistente.lyra_cobranca_id || null,
      cobranca_lyra_id: cob.id,
      parcela_mp_preference_id: parcelaExistente.mp_preference_id || null,
      cobranca_mp_preference_id: cob.mp_preference_id || null,
      parcela_mp_payment_id: parcelaExistente.mp_payment_id || null,
      cobranca_mp_payment_id: cob.mp_payment_id || null,
    }

    if (!vinculo.confirmado) {
      if (vinculo.temAlgumIdPreenchido) {
        return {
          ...dadosParaAuditoria,
          acao: 'VINCULO_DIVERGENTE',
          executado: false,
          motivo: 'Parcela possui identificador(es) preenchido(s), mas nenhum corresponde exatamente à Cobranca atual — requer auditoria manual',
        }
      }
      return {
        ...dadosParaAuditoria,
        acao: 'VINCULO_LEGADO_NAO_CONFIRMADO',
        executado: false,
        motivo: 'Parcela encontrada só pelo fallback nome+valor+vencimento — sem nenhum identificador determinístico preenchido, não é seguro atribuir histórico automático',
      }
    }

    // Vínculo confirmado — repara histórico automático ausente (idempotente)
    const resultadoHistorico = await garantirHistoricoBaixaAutomatica(prime, {
      parcelaId: parcelaExistente.id,
      clienteNome: nomeCliente,
      valor: parcelaExistente.valor_pago || cob.valor,
      mpPaymentId: cob.mp_payment_id,
      dryRun,
    })

    if (!resultadoHistorico.faltava) {
      return { lyra_cobranca_id: cob.id, cliente_nome: nomeCliente, parcela_id: parcelaExistente.id, acao: 'JA_SINCRONIZADO', executado: false }
    }

    return {
      lyra_cobranca_id: cob.id,
      cliente_nome: nomeCliente,
      parcela_id: parcelaExistente.id,
      acao: 'REPARAR_HISTORICO',
      executado: resultadoHistorico.criado,
      ...(resultadoHistorico.duplicidadeDetectada ? { duplicidadeDetectada: true, totalAutomaticos: resultadoHistorico.totalAutomaticos } : {}),
    }
  }

  // --- Caso 2: já existe, ainda não paga, e a Lyra agora diz que está paga — ATUALIZAR ---
  if (parcelaExistente && cob.status === 'pago') {
    if (dryRun) {
      return { lyra_cobranca_id: cob.id, cliente_nome: nomeCliente, valor: cob.valor, acao: 'ATUALIZAR', executado: false, parcela_id: parcelaExistente.id }
    }

    // Releitura pontual — reduz a janela de corrida caso outra execução já tenha
    // processado esta mesma parcela entre a leitura inicial e agora.
    const parcelaAtual = await prime.entities.Parcela.get(parcelaExistente.id)
    if (parcelaAtual.status === 'pago') {
      return { lyra_cobranca_id: cob.id, cliente_nome: nomeCliente, acao: 'JA_SINCRONIZADO', executado: false, nota: 'detectado na releitura de concorrência' }
    }

    await prime.entities.Parcela.update(parcelaExistente.id, {
      status: 'pago',
      valor_pago: cob.valor, // atribuição direta, nunca soma — evita duplicar valor em reprocessamento
      lyra_cobranca_id: cob.id,
      mp_preference_id: cob.mp_preference_id || parcelaAtual.mp_preference_id || null,
      mp_payment_id: cob.mp_payment_id || parcelaAtual.mp_payment_id || null,
      // data_pagamento e forma_pagamento propositalmente NÃO alterados —
      // a Lyra não fornece essa informação com confiança suficiente pra presumir.
    })

    await garantirHistoricoBaixaAutomatica(prime, {
      parcelaId: parcelaExistente.id,
      clienteNome: nomeCliente,
      valor: cob.valor,
      mpPaymentId: cob.mp_payment_id,
      dryRun: false, // já passou pelo `if (dryRun)` acima, aqui é sempre escrita real
    })

    return { lyra_cobranca_id: cob.id, cliente_nome: nomeCliente, acao: 'ATUALIZAR', executado: true, parcela_id: parcelaExistente.id }
  }

  // --- Caso 3: já existe, mas nem ela nem a Lyra estão pagas — nada muda ---
  if (parcelaExistente) {
    return { lyra_cobranca_id: cob.id, cliente_nome: nomeCliente, acao: 'SEM_MUDANCA', executado: false }
  }

  // --- Caso 4: não existe ainda — CRIAR Cliente (se preciso) + Venda + Parcela ---
  let clienteExistente = telefoneLyra ? clientePorTelefone.get(telefoneLyra) : null
  const acaoProposta = clienteExistente ? 'CRIAR_VENDA_E_PARCELA' : 'CRIAR_CLIENTE_VENDA_E_PARCELA'

  if (dryRun) {
    return { lyra_cobranca_id: cob.id, cliente_nome: nomeCliente, valor: cob.valor, vencimento: cob.vencimento, status_lyra: cob.status, acao: acaoProposta, executado: false }
  }

  // Releitura pontual por lyra_cobranca_id — reduz risco de duas execuções
  // concorrentes (ex.: webhook e cron ao mesmo tempo) criarem Venda/Parcela duplicadas.
  const jaExisteAgora = await prime.entities.Parcela.filter({ lyra_cobranca_id: cob.id })
  if (jaExisteAgora && jaExisteAgora.length > 0) {
    return { lyra_cobranca_id: cob.id, cliente_nome: nomeCliente, acao: 'JA_SINCRONIZADO', executado: false, nota: 'detectado na releitura de concorrência' }
  }

  if (!clienteExistente) {
    clienteExistente = await prime.entities.Cliente.create({
      nome: nomeCliente,
      telefone: telefoneLyra || '',
      status: 'ativo',
    })
    clientePorTelefone.set(telefoneLyra, clienteExistente)
  }

  const venda = await prime.entities.Venda.create({
    cliente_nome: nomeCliente,
    cliente_id: clienteExistente.id,
    valor_total: cob.valor,
    numero_parcelas: 1,
    data_venda: cob.vencimento,
    descricao_itens: cob.descricao || 'Importado da Lyra',
    valor_parcela: cob.valor,
    valor_entrada: 0,
    taxa_juros: 0,
    status: cob.status === 'pago' ? 'quitada' : 'aberta',
  })

  const parcela = await prime.entities.Parcela.create({
    venda_id: venda.id,
    cliente_id: clienteExistente.id,
    cliente_nome: nomeCliente,
    numero: 1,
    valor_base: cob.valor,
    valor_atualizado: cob.valor,
    valor_pago: cob.status === 'pago' ? cob.valor : 0,
    data_vencimento: cob.vencimento,
    // data_pagamento e forma_pagamento NÃO presumidos — a Lyra não fornece a data real
    // do pagamento nem a forma com confiança suficiente; ficam vazios até haver evidência.
    data_pagamento: null,
    status: cob.status === 'pago' ? 'pago' : 'pendente',
    forma_pagamento: null,
    cobranca_enviada: true,
    lyra_cobranca_id: cob.id,
    mp_preference_id: cob.mp_preference_id || null,
    mp_payment_id: cob.mp_payment_id || null,
  })

  if (cob.status === 'pago') {
    await garantirHistoricoBaixaAutomatica(prime, {
      parcelaId: parcela.id,
      clienteNome: nomeCliente,
      valor: cob.valor,
      mpPaymentId: cob.mp_payment_id,
      dryRun: false, // já passou pelo `if (dryRun)` acima, aqui é sempre escrita real
    })
  }

  return { lyra_cobranca_id: cob.id, cliente_nome: nomeCliente, acao: acaoProposta, executado: true, novo_cliente_id: clienteExistente.id, nova_venda_id: venda.id, nova_parcela_id: parcela.id }
}

async function syncLyra(req, res) {
  if (!BASE44_API_KEY) {
    return res.status(500).json({ error: 'BASE44_API_KEY não configurado' })
  }
  const dryRun = req.query.dryRun !== 'false'

  try {
    const lyra = createClient({ appId: LYRA_APP_ID, headers: { api_key: BASE44_API_KEY } })
    const prime = createClient({ appId: PRIME_APP_ID, headers: { api_key: BASE44_API_KEY } })

    const [lyraCobrancas, lyraClientes, primeClientes, primeParcelas] = await Promise.all([
      lyra.entities.Cobranca.list(),
      lyra.entities.Cliente.list(),
      prime.entities.Cliente.list(),
      prime.entities.Parcela.list(),
    ])

    const lyraClientePorId = new Map(lyraClientes.map(c => [c.id, c]))
    const clientePorTelefone = new Map(primeClientes.filter(c => c.telefone).map(c => [normalizePhone(c.telefone), c]))

    const acoes = []
    const erros = []
    const ctx = { prime, lyraClientePorId, clientePorTelefone, primeParcelas, dryRun }

    for (const cob of lyraCobrancas) {
      try {
        acoes.push(await processarCobranca(cob, ctx))
      } catch (errItem) {
        console.error('[system-tools:sync-lyra] Erro na cobrança', cob.id, errItem.message)
        erros.push({ lyra_cobranca_id: cob.id, mensagem: errItem.message })
        acoes.push({ lyra_cobranca_id: cob.id, acao: 'ERRO', executado: false, erro: errItem.message })
      }
    }

    const resumo = {
      totalProcessado: lyraCobrancas.length,
      criados: acoes.filter(a => (a.acao === 'CRIAR_VENDA_E_PARCELA' || a.acao === 'CRIAR_CLIENTE_VENDA_E_PARCELA') && a.executado).length,
      atualizados: acoes.filter(a => a.acao === 'ATUALIZAR' && a.executado).length,
      semMudanca: acoes.filter(a => a.acao === 'SEM_MUDANCA').length,
      jaSincronizados: acoes.filter(a => a.acao === 'JA_SINCRONIZADO').length,
      historicosReparados: acoes.filter(a => a.acao === 'REPARAR_HISTORICO' && a.executado).length,
      vinculosLegadosNaoConfirmados: acoes.filter(a => a.acao === 'VINCULO_LEGADO_NAO_CONFIRMADO').length,
      vinculosDivergentes: acoes.filter(a => a.acao === 'VINCULO_DIVERGENTE').length,
      erros: erros.length,
    }

    return res.status(200).json({
      dryRun,
      success: erros.length === 0,
      resumo,
      acoes,
      erros,
      aviso: dryRun ? 'Nenhuma escrita foi feita — isso é só um relatório do que aconteceria.' : 'Escrita real executada para as ações marcadas com executado:true.',
    })
  } catch (e) {
    console.error('[system-tools:sync-lyra] Erro geral:', e.message)
    return res.status(500).json({ error: 'Erro ao sincronizar', detail: e.message, success: false })
  }
}

// Webhook em tempo real: a Lyra chama isso logo depois que processarEventoMP confirma
// um pagamento. Só o `id` do body é confiável — o resto (valor/status/mp_payment_id/etc)
// é sempre relido direto da Lyra via API antes de qualquer escrita, nunca confiamos no
// que veio no POST (mesmo padrão de cautela do sync em lote).
async function lyraWebhook(req, res) {
  if (!BASE44_API_KEY) {
    return res.status(500).json({ error: 'BASE44_API_KEY não configurado' })
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' })
  }

  const cobrancaId = req.body?.id
  if (!cobrancaId) {
    return res.status(400).json({ error: 'Campo "id" (id da Cobranca na Lyra) é obrigatório no body' })
  }

  try {
    const lyra = createClient({ appId: LYRA_APP_ID, headers: { api_key: BASE44_API_KEY } })
    const prime = createClient({ appId: PRIME_APP_ID, headers: { api_key: BASE44_API_KEY } })

    const cob = await lyra.entities.Cobranca.get(cobrancaId)

    if (cob.status !== 'pago') {
      // Webhook disparou mas a Lyra ainda não marcou como pago (corrida improvável, mas
      // possível) — não faz nada agora; o cron pega isso depois com segurança.
      return res.status(200).json({ ok: true, skipped: 'cobranca ainda não está pago na Lyra', lyra_cobranca_id: cobrancaId })
    }

    let lyraCliente = null
    if (cob.cliente_id) {
      try {
        lyraCliente = await lyra.entities.Cliente.get(cob.cliente_id)
      } catch (err) {
        console.error('[system-tools:lyra-webhook] Cliente da Lyra não encontrado:', cob.cliente_id, err.message)
      }
    }

    const [primeClientes, primeParcelas] = await Promise.all([
      prime.entities.Cliente.list(),
      prime.entities.Parcela.list(),
    ])

    const ctx = {
      prime,
      lyraClientePorId: new Map(lyraCliente ? [[cob.cliente_id, lyraCliente]] : []),
      clientePorTelefone: new Map(primeClientes.filter(c => c.telefone).map(c => [normalizePhone(c.telefone), c])),
      primeParcelas,
      dryRun: false, // webhook só é chamado depois que o pagamento já foi confirmado de verdade
    }

    const acao = await processarCobranca(cob, ctx)
    console.log('[system-tools:lyra-webhook] Processado:', JSON.stringify(acao))
    return res.status(200).json({ ok: true, acao })
  } catch (e) {
    console.error('[system-tools:lyra-webhook] Erro:', cobrancaId, e.message)
    return res.status(500).json({ error: 'Erro ao processar webhook', detail: e.message })
  }
}

// ============================================================================
// tool=qwen-health — migrado de api/qwen-health.js (Fase 2A.1), lógica idêntica,
// só o local do código mudou (pra caber no limite de 12 functions do Hobby).
// GET nunca chama o QwenCloud, só lê qwen_health_state. POST só chama de fato se
// claim_qwen_health_check (migration 015) autorizar — trava atômica no Postgres,
// não em memória do processo. Ver docs/SUPABASE.md §3.6.
// ============================================================================

function qwenHealthMinIntervalSeconds() {
  const raw = Number(process.env.QWEN_HEALTH_MIN_INTERVAL_SECONDS)
  return Number.isFinite(raw) && raw > 0 ? raw : QWEN_HEALTH_DEFAULT_MIN_INTERVAL_SECONDS
}

function qwenHealthSupabaseHeaders() {
  return { 'apikey': SUPABASE_SECRET_KEY, 'Content-Type': 'application/json' }
}

function qwenHealthRowToPayload(row) {
  if (!row) return null
  const hasUsage = row.input_tokens != null || row.output_tokens != null || row.total_tokens != null
  return {
    available: row.available ?? false,
    model: row.model ?? null,
    latencyMs: row.latency_ms ?? null,
    lastChecked: row.last_checked_at ?? null,
    errorCode: row.error_code || undefined,
    usage: hasUsage ? {
      inputTokens: row.input_tokens ?? 0,
      outputTokens: row.output_tokens ?? 0,
      totalTokens: row.total_tokens ?? 0,
    } : undefined,
    nextAllowedAt: row.next_allowed_at ?? null,
  }
}

const QWEN_HEALTH_NOT_CHECKED_YET = {
  available: false, model: null, latencyMs: null, lastChecked: null,
  errorCode: 'QWEN_NOT_CHECKED_YET', nextAllowedAt: null,
}

async function qwenHealthReadState() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/qwen_health_state?id=eq.1&select=*`, {
    headers: qwenHealthSupabaseHeaders(),
  })
  if (!res.ok) throw new Error(`supabase_read_${res.status}`)
  const rows = await res.json()
  return rows?.[0] || null
}

async function qwenHealthClaim() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/claim_qwen_health_check`, {
    method: 'POST',
    headers: qwenHealthSupabaseHeaders(),
    body: JSON.stringify({ p_min_interval_seconds: qwenHealthMinIntervalSeconds() }),
  })
  if (!res.ok) throw new Error(`supabase_claim_${res.status}`)
  return res.json() // { claimed: boolean, state: {...} | null }
}

async function qwenHealthPersist(patch) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/qwen_health_state?id=eq.1`, {
    method: 'PATCH',
    headers: { ...qwenHealthSupabaseHeaders(), 'Prefer': 'return=representation' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(`supabase_persist_${res.status}`)
  const rows = await res.json()
  return rows?.[0] || null
}

// Chamada mínima e controlada ao QwenCloud — enable_thinking:false evita gastar
// tokens de raciocínio num modelo híbrido (max_tokens não limita a fase de
// "thinking"). Nunca devolve o texto gerado.
async function qwenHealthCallOnce() {
  const { QWEN_API_KEY, QWEN_BASE_URL, QWEN_MODEL } = process.env

  if (!QWEN_API_KEY || !QWEN_BASE_URL || !QWEN_MODEL) {
    console.error('[system-tools:qwen-health] Configuração ausente: verifique QWEN_API_KEY/QWEN_BASE_URL/QWEN_MODEL')
    return { available: false, model: QWEN_MODEL || null, latency_ms: null, error_code: 'QWEN_NOT_CONFIGURED', input_tokens: null, output_tokens: null, total_tokens: null }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), QWEN_HEALTH_REQUEST_TIMEOUT_MS)
  const startedAt = Date.now()

  try {
    const url = `${QWEN_BASE_URL.replace(/\/$/, '')}/chat/completions`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${QWEN_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: QWEN_MODEL,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        enable_thinking: false,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)
    const latencyMs = Date.now() - startedAt

    if (!response.ok) {
      console.warn(`[system-tools:qwen-health] QwenCloud respondeu com status ${response.status}`)
      const code = (response.status === 401 || response.status === 403) ? 'QWEN_AUTH_ERROR' : 'QWEN_UNAVAILABLE'
      return { available: false, model: QWEN_MODEL, latency_ms: null, error_code: code, input_tokens: null, output_tokens: null, total_tokens: null }
    }

    const data = await response.json()
    return {
      available: true,
      model: QWEN_MODEL,
      latency_ms: latencyMs,
      error_code: null,
      input_tokens: data.usage?.prompt_tokens ?? 0,
      output_tokens: data.usage?.completion_tokens ?? 0,
      total_tokens: data.usage?.total_tokens ?? 0,
    }
  } catch (e) {
    clearTimeout(timeout)
    const code = e.name === 'AbortError' ? 'QWEN_TIMEOUT' : 'QWEN_UNAVAILABLE'
    console.error(`[system-tools:qwen-health] Falha na chamada de teste: ${code}`)
    return { available: false, model: QWEN_MODEL || null, latency_ms: null, error_code: code, input_tokens: null, output_tokens: null, total_tokens: null }
  }
}

async function qwenHealth(req, res) {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    console.error('[system-tools:qwen-health] Configuração ausente: verifique VITE_SUPABASE_URL/SUPABASE_SECRET_KEY')
    return res.status(200).json({ ...QWEN_HEALTH_NOT_CHECKED_YET, errorCode: 'QWEN_HEALTH_STORAGE_NOT_CONFIGURED', cached: true })
  }

  if (req.method === 'GET') {
    try {
      const row = await qwenHealthReadState()
      return res.status(200).json({ ...(qwenHealthRowToPayload(row) || QWEN_HEALTH_NOT_CHECKED_YET), cached: true })
    } catch (e) {
      console.error('[system-tools:qwen-health] Falha ao ler estado persistido:', e.message)
      return res.status(200).json({ ...QWEN_HEALTH_NOT_CHECKED_YET, errorCode: 'QWEN_HEALTH_READ_ERROR', cached: true })
    }
  }

  if (req.method === 'POST') {
    try {
      const { claimed, state } = await qwenHealthClaim()

      if (!claimed) {
        return res.status(200).json({ ...(qwenHealthRowToPayload(state) || QWEN_HEALTH_NOT_CHECKED_YET), cached: true, throttled: true })
      }

      const result = await qwenHealthCallOnce()
      const savedRow = await qwenHealthPersist({
        provider: 'qwen',
        available: result.available,
        model: result.model,
        latency_ms: result.latency_ms,
        input_tokens: result.input_tokens,
        output_tokens: result.output_tokens,
        total_tokens: result.total_tokens,
        error_code: result.error_code,
        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      return res.status(200).json({ ...(qwenHealthRowToPayload(savedRow) || qwenHealthRowToPayload(state)), cached: false, throttled: false })
    } catch (e) {
      // e.message aqui é sempre uma string curta que o próprio código construiu
      // (ex.: "supabase_claim_401", "supabase_persist_404") — nunca contém
      // segredo, header ou payload; só o passo que falhou + status HTTP.
      console.error('[system-tools:qwen-health] Falha no fluxo de POST (claim/persist):', e.message)
      return res.status(200).json({ ...QWEN_HEALTH_NOT_CHECKED_YET, errorCode: 'QWEN_HEALTH_INTERNAL_ERROR', cached: true })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

// ============================================================================
// tool=openrouter-usage — Pacote 1: saldo do OpenRouter migrado pro server-side.
// Só GET (consulta pública de baixo risco, sem custo por chamada — diferente de
// uma chamada de chat). Cache em memória best-effort de 5min: reseta a cada cold
// start e não é compartilhado entre instâncias/regiões — best-effort é aceitável
// aqui porque não há custo real em consultar de novo, só reduz tráfego trivial.
// Sem Supabase, sem trava atômica — não se aplica a este tipo de consulta.
// ============================================================================

let openrouterCache = null
let openrouterCachedAt = 0

function openrouterErrorPayload(code) {
  return { available: false, errorCode: code, lastChecked: new Date().toISOString() }
}

async function openrouterUsage(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!OPENROUTER_API_KEY) {
    console.error('[system-tools:openrouter-usage] Configuração ausente: verifique OPENROUTER_API_KEY')
    return res.status(200).json({ ...openrouterErrorPayload('OPENROUTER_NOT_CONFIGURED'), cached: false })
  }

  const force = req.query?.force === 'true'
  const now = Date.now()

  if (!force && openrouterCache && (now - openrouterCachedAt) < OPENROUTER_CACHE_TTL_MS) {
    return res.status(200).json({ ...openrouterCache, cached: true })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), OPENROUTER_REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch('https://openrouter.ai/api/v1/credits', {
      headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}` },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!response.ok) {
      console.warn(`[system-tools:openrouter-usage] OpenRouter respondeu com status ${response.status}`)
      const code = (response.status === 401 || response.status === 403) ? 'OPENROUTER_AUTH_ERROR' : 'OPENROUTER_UNAVAILABLE'
      return res.status(200).json({ ...openrouterErrorPayload(code), cached: false })
    }

    const { data } = await response.json()
    const totalCredits = data?.total_credits ?? 0
    const totalUsage = data?.total_usage ?? 0

    const payload = {
      available: true,
      totalCredits,
      totalUsage,
      remainingCredits: totalCredits - totalUsage,
      lastChecked: new Date().toISOString(),
    }

    openrouterCache = payload
    openrouterCachedAt = now
    return res.status(200).json({ ...payload, cached: false })
  } catch (e) {
    clearTimeout(timeout)
    const code = e.name === 'AbortError' ? 'OPENROUTER_TIMEOUT' : 'OPENROUTER_UNAVAILABLE'
    console.error(`[system-tools:openrouter-usage] Falha na consulta: ${code}`)
    return res.status(200).json({ ...openrouterErrorPayload(code), cached: false })
  }
}

// ============================================================================
// tool=perplexity-health — health check real da API do Perplexity. Sem saldo/uso/
// requests (a API não expõe isso, só o endpoint de chat) — o card mostra apenas o
// que é real: disponibilidade, modelo, latência e última verificação. Cache em
// memória best-effort (mesmo padrão do openrouter-usage): GET nunca chama o
// Perplexity, só lê o último resultado; POST faz a chamada real (respeitando o
// cache de 5min, a menos que force=true) — usado pelo botão "Atualizar agora".
// ============================================================================

let perplexityCache = null
let perplexityCachedAt = 0

const PERPLEXITY_NOT_CHECKED_YET = {
  available: false, model: null, latencyMs: null, lastChecked: null,
  errorCode: 'PERPLEXITY_NOT_CHECKED_YET',
}

function perplexityErrorPayload(code) {
  return { available: false, model: PERPLEXITY_MODEL, latencyMs: null, errorCode: code, lastChecked: new Date().toISOString() }
}

async function perplexityCallOnce() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PERPLEXITY_REQUEST_TIMEOUT_MS)
  const startedAt = Date.now()

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${PERPLEXITY_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: PERPLEXITY_MODEL,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 16, // mínimo aceito pela API do Perplexity (diferente de Groq/Qwen/OpenRouter, que aceitam 1)
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    const latencyMs = Date.now() - startedAt

    if (!response.ok) {
      console.warn(`[system-tools:perplexity-health] Perplexity respondeu com status ${response.status}`)
      const code = (response.status === 401 || response.status === 403) ? 'PERPLEXITY_AUTH_ERROR' : 'PERPLEXITY_UNAVAILABLE'
      return { ...perplexityErrorPayload(code) }
    }

    const data = await response.json().catch(() => null) // nunca repassa o conteúdo gerado, só usage/cost
    const usage = data?.usage
    const hasTokens = usage?.prompt_tokens != null || usage?.completion_tokens != null || usage?.total_tokens != null
    const totalCost = usage?.cost?.total_cost

    return {
      available: true,
      model: PERPLEXITY_MODEL,
      latencyMs,
      errorCode: null,
      lastChecked: new Date().toISOString(),
      ...(hasTokens ? {
        usage: {
          inputTokens: usage.prompt_tokens ?? null,
          outputTokens: usage.completion_tokens ?? null,
          totalTokens: usage.total_tokens ?? null,
        },
      } : {}),
      ...(typeof totalCost === 'number' ? { lastCheckCost: totalCost } : {}),
    }
  } catch (e) {
    clearTimeout(timeout)
    const code = e.name === 'AbortError' ? 'PERPLEXITY_TIMEOUT' : 'PERPLEXITY_UNAVAILABLE'
    console.error(`[system-tools:perplexity-health] Falha na chamada de teste: ${code}`)
    return { ...perplexityErrorPayload(code) }
  }
}

async function perplexityHealth(req, res) {
  if (!PERPLEXITY_API_KEY) {
    console.error('[system-tools:perplexity-health] Configuração ausente: verifique PERPLEXITY_API_KEY')
    return res.status(200).json({ ...PERPLEXITY_NOT_CHECKED_YET, errorCode: 'PERPLEXITY_NOT_CONFIGURED', cached: false })
  }

  if (req.method === 'GET') {
    if (!perplexityCache) {
      return res.status(200).json({ ...PERPLEXITY_NOT_CHECKED_YET, cached: false })
    }
    return res.status(200).json({ ...perplexityCache, cached: true })
  }

  if (req.method === 'POST') {
    const force = req.query?.force === 'true'
    const now = Date.now()
    if (!force && perplexityCache && (now - perplexityCachedAt) < PERPLEXITY_CACHE_TTL_MS) {
      return res.status(200).json({ ...perplexityCache, cached: true })
    }

    const result = await perplexityCallOnce()
    perplexityCache = result
    perplexityCachedAt = Date.now()
    return res.status(200).json({ ...result, cached: false })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

// ============================================================================
// tool=prime-cobrancas-status — Fase A: card real "PRIME Cobranças". Ping real
// dos 2 apps Base44 (PRIME + Lyra) + última atividade real via HistoricoAtividade
// (só timestamp, nunca o registro bruto). WhatsApp/Z-API sempre "not_checked"
// nesta fase — nunca inventa "conectado"/"trial vencido" sem checagem real.
// ============================================================================

const PRIME_COBRANCAS_CACHE_TTL_MS = 3 * 60 * 1000
const PRIME_COBRANCAS_TIMEOUT_MS = 10000

let primeCobrancasCache = null
let primeCobrancasCachedAt = 0
let primeCobrancasInFlight = null

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

// Ping do app PRIME — reaproveita a MESMA chamada pra confirmar disponibilidade
// E extrair a última atividade real (created_date mais recente), sem duplicar
// requisição. Nunca devolve o registro (nome/valor/etc.), só o timestamp.
async function pingPrimeEHistorico() {
  try {
    const prime = createClient({ appId: PRIME_APP_ID, headers: { api_key: BASE44_API_KEY } })
    const historico = await withTimeout(prime.entities.HistoricoAtividade.list(), PRIME_COBRANCAS_TIMEOUT_MS)

    let lastActivityAt = null
    for (const h of historico || []) {
      const ts = h?.created_date || h?.created_at
      if (ts && (!lastActivityAt || new Date(ts) > new Date(lastActivityAt))) lastActivityAt = ts
    }
    return { available: true, lastActivityAt }
  } catch (e) {
    console.error('[system-tools:prime-cobrancas-status] Falha no ping PRIME:', e.message)
    return { available: false, errorCode: 'PRIME_UNAVAILABLE', lastActivityAt: null }
  }
}

// Ping do app Lyra — só confirma conectividade (mesma entity já usada por sync-lyra).
async function pingLyra() {
  try {
    const lyra = createClient({ appId: LYRA_APP_ID, headers: { api_key: BASE44_API_KEY } })
    await withTimeout(lyra.entities.Cliente.list(), PRIME_COBRANCAS_TIMEOUT_MS)
    return { available: true }
  } catch (e) {
    console.error('[system-tools:prime-cobrancas-status] Falha no ping Lyra:', e.message)
    return { available: false, errorCode: 'LYRA_UNAVAILABLE' }
  }
}

// Status real do WhatsApp/Z-API (Fase C) — chama a Base44 Function whatsappProvider
// (action:'status', somente leitura, nunca envia mensagem). Nunca recebe nem
// conhece credenciais da Z-API/ZAP-API — só o token interno já usado internamente
// no Base44. Repassa ao frontend só os 4 campos sanitizados que a Function já
// devolve — nunca payload bruto.
async function pingWhatsappStatus() {
  if (!WHATSAPP_INTERNAL_TOKEN) {
    return { whatsappStatus: 'not_configured', smartphoneConnected: null, provider: null, checkedAt: new Date().toISOString() }
  }
  try {
    const res = await withTimeout(fetch(WHATSAPP_PROVIDER_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${WHATSAPP_INTERNAL_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'status' }),
    }), PRIME_COBRANCAS_TIMEOUT_MS)

    if (!res.ok) {
      console.error(`[system-tools:prime-cobrancas-status] whatsappProvider (status) respondeu ${res.status}`)
      return { whatsappStatus: 'provider_unavailable', smartphoneConnected: null, provider: null, checkedAt: new Date().toISOString() }
    }

    const data = await res.json()
    // Repassa só os 4 campos esperados — nunca qualquer outro campo que a
    // Function eventualmente devolva (defesa em profundidade, mesmo ela já
    // sendo sanitizada na origem).
    return {
      whatsappStatus: data?.whatsappStatus ?? 'unknown',
      smartphoneConnected: typeof data?.smartphoneConnected === 'boolean' ? data.smartphoneConnected : null,
      provider: data?.provider ?? null,
      checkedAt: data?.checkedAt || new Date().toISOString(),
    }
  } catch (e) {
    console.error('[system-tools:prime-cobrancas-status] Falha ao consultar status do WhatsApp:', e.message)
    return { whatsappStatus: 'provider_unavailable', smartphoneConnected: null, provider: null, checkedAt: new Date().toISOString() }
  }
}

// "Hoje" = dia civil em horário de Brasília (BRT, UTC-3 fixo — mesmo critério já
// usado em cron-diagnosis.js/isBusinessHoursBRT), não UTC. Documentado aqui de
// propósito pra nunca misturar os dois sem perceber.
function brtDateString(iso) {
  const d = new Date(iso)
  const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000)
  return brt.toISOString().slice(0, 10)
}

// Allowlist de error_code curtos já confirmados no código real das Base44
// Functions (classificarErroHttp + erros de provider em whatsappProvider/main.ts).
// Qualquer valor fora disso vira "unknown" — nunca repassa texto livre/stack trace.
const LOG_NOTIFICACAO_ERROR_ALLOWLIST = new Set([
  'bad_request', 'invalid_credentials', 'trial_or_plan_expired', 'not_found',
  'rate_limit', 'provider_unavailable', 'unknown',
  'missing_zapi_credentials', 'missing_zapapi_credentials',
  'timeout_provider', 'fetch_error', 'invalid_response_format',
])

function sanitizeErrorCode(code) {
  if (typeof code === 'string' && LOG_NOTIFICACAO_ERROR_ALLOWLIST.has(code)) return code
  return 'unknown'
}

// Fase B — leitura agregada de LogNotificacao. Nunca devolve registro bruto:
// só contagens de hoje (sucesso/erro), timestamp da tentativa mais recente,
// código de erro sanitizado (allowlist) e duração média (só se o campo
// duracao_ms existir de verdade nos registros — nunca inventado).
async function pingLogNotificacaoAgregado() {
  try {
    const prime = createClient({ appId: PRIME_APP_ID, headers: { api_key: BASE44_API_KEY } })
    const registros = await withTimeout(prime.entities.LogNotificacao.list(), PRIME_COBRANCAS_TIMEOUT_MS)
    const lista = registros || []

    // Log só de NOMES de campo (nunca valores) — apoio de diagnóstico único,
    // visível só nos logs do servidor (Vercel), nunca na resposta HTTP.
    if (lista.length > 0) {
      console.log('[system-tools:prime-cobrancas-status] LogNotificacao — campos encontrados:', Object.keys(lista[0]))
    }

    const hojeBrt = brtDateString(new Date().toISOString())

    let successToday = 0
    let failedToday = 0
    let lastAttemptAt = null
    let lastErrorRecord = null
    const duracoes = []

    for (const r of lista) {
      const ts = r?.created_date
      if (!ts) continue

      if (brtDateString(ts) === hojeBrt) {
        if (r.status === 'sucesso') successToday++
        else if (r.status === 'erro') failedToday++
      }

      if (!lastAttemptAt || new Date(ts) > new Date(lastAttemptAt)) lastAttemptAt = ts

      if (r.status === 'erro' && (!lastErrorRecord || new Date(ts) > new Date(lastErrorRecord.created_date))) {
        lastErrorRecord = r
      }

      if (typeof r.duracao_ms === 'number') duracoes.push(r.duracao_ms)
    }

    const avgDurationMs = duracoes.length > 0
      ? Math.round(duracoes.reduce((a, b) => a + b, 0) / duracoes.length)
      : null

    return {
      available: true,
      notificationsToday: { success: successToday, failed: failedToday },
      lastAttemptAt,
      lastErrorCode: lastErrorRecord ? sanitizeErrorCode(lastErrorRecord.erro) : null,
      avgDurationMs,
    }
  } catch (e) {
    console.error('[system-tools:prime-cobrancas-status] Falha ao ler LogNotificacao:', e.message)
    return { available: false, notificationsToday: null, lastAttemptAt: null, lastErrorCode: null, avgDurationMs: null }
  }
}

async function primeCobrancasStatus(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!BASE44_API_KEY) {
    console.error('[system-tools:prime-cobrancas-status] Configuração ausente: verifique BASE44_API_KEY')
    return res.status(200).json({
      primeAvailable: false, lyraAvailable: false, whatsappStatus: 'not_checked',
      lastActivityAt: null, lastChecked: new Date().toISOString(),
      errorCode: 'BASE44_NOT_CONFIGURED', cached: false,
    })
  }

  const force = req.query?.force === 'true'
  const now = Date.now()

  if (!force && primeCobrancasCache && (now - primeCobrancasCachedAt) < PRIME_COBRANCAS_CACHE_TTL_MS) {
    return res.status(200).json({ ...primeCobrancasCache, cached: true })
  }

  // Dedup — evita duas chamadas reais simultâneas à mesma instância quando o
  // GET dispara mais de uma vez antes da primeira resposta voltar.
  if (primeCobrancasInFlight) {
    const result = await primeCobrancasInFlight
    return res.status(200).json({ ...result, cached: true })
  }

  primeCobrancasInFlight = (async () => {
    const [primeResult, lyraResult, logResult, whatsappResult] = await Promise.all([
      pingPrimeEHistorico(), pingLyra(), pingLogNotificacaoAgregado(), pingWhatsappStatus(),
    ])
    const payload = {
      primeAvailable: primeResult.available,
      lyraAvailable: lyraResult.available,
      // Fase C — status real do WhatsApp/Z-API (antes sempre "not_checked").
      whatsappStatus: whatsappResult.whatsappStatus,
      smartphoneConnected: whatsappResult.smartphoneConnected,
      whatsappProvider: whatsappResult.provider,
      whatsappCheckedAt: whatsappResult.checkedAt,
      lastActivityAt: primeResult.lastActivityAt || null,
      lastChecked: new Date().toISOString(),
      ...(primeResult.errorCode ? { primeErrorCode: primeResult.errorCode } : {}),
      ...(lyraResult.errorCode ? { lyraErrorCode: lyraResult.errorCode } : {}),
      // Fase B — só agregados de LogNotificacao (nunca registro bruto). Se a
      // leitura falhar, os 4 campos ficam null/indisponíveis, nunca inventados.
      notificationsToday: logResult.notificationsToday,
      lastAttemptAt: logResult.lastAttemptAt,
      lastErrorCode: logResult.lastErrorCode,
      avgDurationMs: logResult.avgDurationMs,
    }
    primeCobrancasCache = payload
    primeCobrancasCachedAt = Date.now()
    return payload
  })()

  try {
    const result = await primeCobrancasInFlight
    return res.status(200).json({ ...result, cached: false })
  } finally {
    primeCobrancasInFlight = null
  }
}

// ============================================================================
// tool=codex-openrouter / tool=ocr-openrouter — Pacote 2: migra as chamadas de
// chat/visão via OpenRouter (fallback de modelo do CODEX e fallback de OCR) pro
// server-side. Proxy fiel: o servidor não decide prompt, modelo ou regra de
// negócio — só repassa exatamente o que o frontend já montava antes, trocando
// só quem segura a chave. Único acréscimo de segurança (não é funcionalidade
// nova): valida `model` contra a mesma lista fixa que a UI já oferece — sem
// isso, o endpoint viraria um relay aberto pra qualquer chamada à API do
// OpenRouter cobrada na nossa conta, sem nem precisar da chave (pior do que a
// exposição anterior, que ao menos exigia extrair a chave do bundle).
const OPENROUTER_CHAT_TIMEOUT_MS = 30000

// Allowlist dinâmica — modelos gratuitos hardcoded ficam obsoletos com frequência
// (o OpenRouter renomeia/descontinua variantes ":free" regularmente, confirmado
// numa auditoria real: 7 dos 9 IDs antigos já não existiam mais). Em vez de uma
// lista fixa no código, consultamos o catálogo oficial (endpoint público, não
// precisa de OPENROUTER_API_KEY), cacheamos por 12h, e mantemos o último
// snapshot válido mesmo depois do TTL expirar — nunca ficamos sem nenhuma opção
// só porque o catálogo ficou temporariamente inacessível.
const OPENROUTER_MODELS_CACHE_TTL_MS = 12 * 60 * 60 * 1000
const OPENROUTER_CATALOG_TIMEOUT_MS = 5000
const OPENROUTER_CATALOG_URL = 'https://openrouter.ai/api/v1/models'
const OPENROUTER_FREE_ROUTER_ID = 'openrouter/free' // router oficial do OpenRouter — escolhe um modelo grátis sozinho
const CODEX_CURATED_MAX = 10 // dentro do range 8-12 pedido
const OCR_CURATED_MAX = 3

// Rede de segurança — só usada se NUNCA houve um fetch bem-sucedido do catálogo
// (cold start + catálogo inacessível). Confirmados manualmente com endpoint ativo
// na auditoria de 2026-07-27 — podem ficar obsoletos com o tempo, é só um último recurso.
const OPENROUTER_EMERGENCY_TEXT_MODELS = [
  { id: 'openai/gpt-oss-20b:free', name: 'OpenAI: gpt-oss-20b (free)', contextLength: 131072 },
  { id: 'google/gemma-4-31b-it:free', name: 'Google: Gemma 4 31B (free)', contextLength: 262144 },
]
const OPENROUTER_EMERGENCY_VISION_MODELS = [
  { id: 'nvidia/nemotron-nano-12b-v2-vl:free', name: 'NVIDIA: Nemotron Nano 12B 2 VL (free)', contextLength: 128000 },
  { id: 'google/gemma-4-31b-it:free', name: 'Google: Gemma 4 31B (free)', contextLength: 262144 },
]

let openrouterModelsCache = null // { text, vision, fetchedAt }
let openrouterModelsLastGood = null // sobrevive além do TTL — só substituído por outro fetch bem-sucedido

function openrouterIsFree(m) {
  return parseFloat(m.pricing?.prompt) === 0 && parseFloat(m.pricing?.completion) === 0
}
function openrouterIsTextChat(m) {
  return !!m.architecture?.input_modalities?.includes('text') && !!m.architecture?.output_modalities?.includes('text')
}
function openrouterIsVisionChat(m) {
  return openrouterIsTextChat(m) && !!m.architecture?.input_modalities?.includes('image')
}

async function fetchOpenRouterCatalog() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), OPENROUTER_CATALOG_TIMEOUT_MS)
  try {
    // Endpoint público do catálogo — não usa OPENROUTER_API_KEY, não é uma chamada de chat.
    const res = await fetch(OPENROUTER_CATALOG_URL, { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) throw new Error(`catalog_${res.status}`)
    const { data } = await res.json()

    // Modelos especializados (moderação, áudio/música) não servem pra chat/OCR de texto — excluídos.
    const EXCLUDE_SUBSTR = ['content-safety', 'clip', 'lyria', 'moderation']
    const notSpecialty = m => !EXCLUDE_SUBSTR.some(s => m.id.includes(s))

    const text = data.filter(m => openrouterIsFree(m) && openrouterIsTextChat(m) && notSpecialty(m))
      .map(m => ({ id: m.id, name: m.name, contextLength: m.context_length || null }))
    const vision = data.filter(m => openrouterIsFree(m) && openrouterIsVisionChat(m) && notSpecialty(m))
      .map(m => ({ id: m.id, name: m.name, contextLength: m.context_length || null }))

    return { text, vision }
  } catch (e) {
    clearTimeout(timeout)
    throw e
  }
}

async function getOpenRouterAllowlist() {
  const now = Date.now()
  if (openrouterModelsCache && (now - openrouterModelsCache.fetchedAt) < OPENROUTER_MODELS_CACHE_TTL_MS) {
    return { text: openrouterModelsCache.text, vision: openrouterModelsCache.vision, cached: true }
  }

  try {
    const fresh = await fetchOpenRouterCatalog()
    openrouterModelsCache = { ...fresh, fetchedAt: now }
    openrouterModelsLastGood = openrouterModelsCache
    return { text: fresh.text, vision: fresh.vision, cached: false }
  } catch (e) {
    console.warn('[system-tools:openrouter-models] Falha ao atualizar catálogo, usando fallback:', e.message)
    if (openrouterModelsLastGood) {
      return { text: openrouterModelsLastGood.text, vision: openrouterModelsLastGood.vision, cached: true }
    }
    return { text: OPENROUTER_EMERGENCY_TEXT_MODELS, vision: OPENROUTER_EMERGENCY_VISION_MODELS, cached: true }
  }
}

// Não exibe/permite todos os modelos gratuitos do catálogo (podem ser dezenas) — cura pra um
// número pequeno e prevísivel, priorizando contexto maior (proxy simples de "mais capaz/geral"),
// e sempre acrescenta o router automático do OpenRouter como opção extra no final (nunca padrão).
function curateCodexModels(textModels) {
  const sorted = [...textModels].sort((a, b) => (b.contextLength || 0) - (a.contextLength || 0))
  const top = sorted.slice(0, CODEX_CURATED_MAX).filter(m => m.id !== OPENROUTER_FREE_ROUTER_ID)
  const hasFreeRouter = textModels.some(m => m.id === OPENROUTER_FREE_ROUTER_ID)
  if (hasFreeRouter) {
    top.push({ id: OPENROUTER_FREE_ROUTER_ID, name: 'Automático (OpenRouter escolhe)', contextLength: null })
  }
  return top
}

function curateOcrModels(visionModels) {
  return [...visionModels].sort((a, b) => (b.contextLength || 0) - (a.contextLength || 0)).slice(0, OCR_CURATED_MAX)
}

async function openrouterChatProxy(req, res, allowedModels, toolLabel) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!OPENROUTER_API_KEY) {
    console.error(`[system-tools:${toolLabel}] Configuração ausente: verifique OPENROUTER_API_KEY`)
    return res.status(503).json({ error: 'OpenRouter não configurado no servidor' })
  }

  const { model, messages, temperature, max_tokens } = req.body || {}

  if (!model || !allowedModels.has(model)) {
    return res.status(400).json({ error: 'Modelo não permitido' })
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages é obrigatório' })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), OPENROUTER_CHAT_TIMEOUT_MS)

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://ignite-prime.app',
        'X-Title': 'IGNITE PRIME CRM',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: typeof temperature === 'number' ? temperature : 0.4,
        max_tokens: typeof max_tokens === 'number' ? max_tokens : 800,
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    const data = await response.json()

    if (!response.ok) {
      console.warn(`[system-tools:${toolLabel}] OpenRouter respondeu com status ${response.status}`)
      return res.status(response.status).json(data)
    }

    // Repassa o payload exatamente como o OpenRouter devolve — o frontend já espera
    // esse formato (data.choices[0].message.content), nenhuma normalização aqui.
    return res.status(200).json(data)
  } catch (e) {
    clearTimeout(timeout)
    const code = e.name === 'AbortError' ? 'OPENROUTER_TIMEOUT' : 'OPENROUTER_UNAVAILABLE'
    console.error(`[system-tools:${toolLabel}] Falha na chamada: ${code}`)
    return res.status(502).json({ error: { message: code } })
  }
}

async function codexOpenRouter(req, res) {
  const { text, cached } = await getOpenRouterAllowlist()
  const curated = curateCodexModels(text)

  if (req.method === 'GET') {
    return res.status(200).json({ models: curated.map(({ id, name }) => ({ id, name })), cached })
  }

  return openrouterChatProxy(req, res, new Set(curated.map(m => m.id)), 'codex-openrouter')
}

async function ocrOpenRouter(req, res) {
  const { vision, cached } = await getOpenRouterAllowlist()
  const curated = curateOcrModels(vision)

  if (req.method === 'GET') {
    return res.status(200).json({ models: curated.map(({ id, name }) => ({ id, name })), cached })
  }

  return openrouterChatProxy(req, res, new Set(curated.map(m => m.id)), 'ocr-openrouter')
}

// ============================================================================
// tool=mcp — IGNITE PRIME MCP Lite, somente leitura. Implementa o necessário do
// protocolo MCP (JSON-RPC 2.0 sobre HTTP) pro handshake completo com um cliente
// remoto (GPT Maker/Gabriela): initialize, notifications/initialized, tools/list,
// tools/call. Ferramentas anunciadas: verificar_conexao, consultar_cobrancas
// (Base44 PRIME) e consultar_cep (ViaCEP) — nenhuma escreve em nada. Autenticação
// própria via MCP_LITE_SECRET, comparada só aqui — nunca aceita nem concede acesso
// a nenhum outro `case` deste arquivo.
// ============================================================================

const MCP_PROTOCOL_VERSION = '2024-11-05'
const MCP_SERVER_NAME = 'ignite-prime-mcp-lite'
const MCP_SERVER_VERSION = '0.1.0-poc'

const MCP_TOOLS = [
  {
    name: 'verificar_conexao',
    description: 'Verifica se o IGNITE PRIME MCP Lite está conectado e respondendo corretamente.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'consultar_cobrancas',
    description: 'Consulta cobranças e parcelas do PRIME Cobranças, sempre somente leitura. A busca por nome localiza candidatos sem revelar dados financeiros. Somente uma busca por telefone completo pode retornar cobranças e parcelas.',
    inputSchema: {
      type: 'object',
      properties: {
        nome_cliente: {
          type: 'string',
          description: 'Nome completo do cliente. Usado somente para localizar candidatos, por comparação normalizada e exata. Nunca retorna dados financeiros.',
          minLength: 3,
          maxLength: 120,
        },
        telefone: {
          type: 'string',
          description: 'Telefone completo do cliente, com ou sem formatação. Será normalizado para dígitos. É o único parâmetro que pode liberar dados de cobranças e parcelas.',
          minLength: 10,
          maxLength: 20,
        },
        status: {
          type: 'string',
          enum: ['aberta', 'vencida', 'paga', 'todas'],
          default: 'todas',
          description: 'Filtro calculado das parcelas. Só é aplicado quando telefone é informado.',
        },
        limite: {
          type: 'integer',
          minimum: 1,
          maximum: 10,
          default: 5,
          description: 'Quantidade máxima de parcelas retornadas.',
        },
      },
      additionalProperties: false,
      anyOf: [
        { required: ['nome_cliente'] },
        { required: ['telefone'] },
      ],
    },
  },
  {
    name: 'consultar_cep',
    description: 'Consulta um CEP brasileiro e retorna os dados públicos correspondentes de endereço. Use quando o cliente informar um CEP e precisar confirmar cidade, estado, bairro ou logradouro. A ferramenta não retorna número residencial e não deve ser usada para calcular frete.',
    inputSchema: {
      type: 'object',
      properties: {
        cep: {
          type: 'string',
          description: 'CEP brasileiro com 8 dígitos, com ou sem hífen.',
        },
      },
      required: ['cep'],
      additionalProperties: false,
    },
  },
]

function mcpJsonRpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }
}

function mcpJsonRpcResult(id, result) {
  // `?? null` pelo mesmo motivo de mcpJsonRpcError: sem isso, um `id` undefined
  // faria o JSON.stringify omitir a chave `id` inteira da resposta.
  return { jsonrpc: '2.0', id: id ?? null, result }
}

function mcpToolCallVerificarConexao(args) {
  // Ferramenta não aceita parâmetros — qualquer argumento extra é rejeitado
  // (defesa em profundidade, além do additionalProperties:false do schema).
  if (args && typeof args === 'object' && Object.keys(args).length > 0) {
    return { isError: true, content: [{ type: 'text', text: 'Esta ferramenta não aceita parâmetros.' }] }
  }
  const mensagem = 'IGNITE PRIME MCP Lite conectado com sucesso.'
  return {
    isError: false,
    content: [{ type: 'text', text: mensagem }],
    structuredContent: {
      status: 'ok',
      sistema: 'IGNITE PRIME MCP Lite',
      modo: 'somente leitura',
      mensagem,
    },
  }
}

// Monta o content/structuredContent de tools/call a partir do resultado de
// consultarCobrancas({httpStatus, body}). isError:true pra qualquer status !== 200
// ou body.status === 'erro' — nunca vaza detalhe interno, `body.mensagem` já é
// texto curado dentro de _consultarCobrancas.js, nunca erro bruto do SDK/Base44.
function mcpToolCallConsultarCobrancas(resultado) {
  const { httpStatus, body } = resultado
  const isError = httpStatus >= 400 || body.status === 'erro'
  const textoResumo = body.mensagem
    || (body.status === 'ok' ? `Consulta realizada — ${body.parcelas.length} parcela(s) retornada(s).` : 'Consulta processada.')

  return {
    isError,
    content: [{ type: 'text', text: textoResumo }],
    structuredContent: body,
  }
}

// Constrói texto descritivo completo do endereço, omitindo campos vazios.
function formatarTextoEnderecoCompleto(endereco) {
  const partes = [`CEP ${endereco.cep} encontrado.`]
  if (endereco.logradouro) partes.push(`Logradouro: ${endereco.logradouro}`)
  if (endereco.bairro) partes.push(`Bairro: ${endereco.bairro}`)
  partes.push(`Cidade: ${endereco.cidade}`)
  partes.push(`Estado: ${endereco.estado}`)
  if (endereco.complemento) partes.push(`Complemento: ${endereco.complemento}`)
  return partes.join('. ')
}

// Monta o content/structuredContent de tools/call a partir do resultado de
// consultarCep({httpStatus, body}) — mesmo desenho de mcpToolCallConsultarCobrancas.
function mcpToolCallConsultarCep(resultado) {
  const { httpStatus, body } = resultado
  const isError = httpStatus >= 400 || body.status === 'erro'
  const textoResumo = body.mensagem
    || (body.status === 'encontrado' ? formatarTextoEnderecoCompleto(body.endereco) : 'Consulta processada.')

  return {
    isError,
    content: [{ type: 'text', text: textoResumo }],
    structuredContent: body,
  }
}

// Despacha tools/call pra ferramenta correta. Retorna `null` se o nome não bater
// com nenhuma ferramenta conhecida — quem chama decide o formato de "desconhecida".
async function mcpToolCallDispatch(toolName, args, req) {
  if (toolName === 'verificar_conexao') {
    return mcpToolCallVerificarConexao(args)
  }

  if (toolName === 'consultar_cobrancas') {
    const ip = req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || null
    if (!checarRateLimitConsultarCobrancasBestEffort(ip)) {
      console.error('[system-tools:mcp] consultar_cobrancas rate limit excedido', { ip: ipHashCurto(ip) })
      return { isError: true, content: [{ type: 'text', text: 'Muitas consultas em pouco tempo — aguarde e tente novamente.' }] }
    }
    // Log só de metadado técnico — nunca nome/telefone/valor completo (regra do
    // arquivo inteiro, reforçada aqui de propósito por lidar com dado financeiro).
    console.log('[system-tools:mcp] consultar_cobrancas chamada', { ip: ipHashCurto(ip) })
    const resultado = await consultarCobrancas(args || {})
    return mcpToolCallConsultarCobrancas(resultado)
  }

  if (toolName === 'consultar_cep') {
    const ip = req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || null
    if (!checarRateLimitConsultarCepBestEffort(ip)) {
      console.error('[system-tools:mcp] consultar_cep rate limit excedido', { ip: ipHashCurto(ip) })
      return { isError: true, content: [{ type: 'text', text: 'Muitas consultas em pouco tempo — aguarde e tente novamente.' }] }
    }
    console.log('[system-tools:mcp] consultar_cep chamada', { ip: ipHashCurto(ip) })
    const resultado = await consultarCep(args || {})
    return mcpToolCallConsultarCep(resultado)
  }

  return null
}

// Processa 1 mensagem JSON-RPC já parseada. Retorna `null` pra notificações
// (não devem gerar corpo de resposta) e um objeto JSON-RPC pra requests.
async function mcpHandleMessage(msg, req) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
    return mcpJsonRpcError(null, -32600, 'Invalid Request')
  }
  const { id, method, params } = msg

  // Notificação = Request object sem o campo "id" (JSON-RPC 2.0 §4.1, herdado
  // pelo MCP) — não é definido pelo nome do método. O servidor nunca deve
  // responder a uma notificação, seja ela notifications/initialized ou
  // qualquer outra (ex.: notifications/cancelled, notifications/progress).
  if (!('id' in msg)) {
    return null
  }

  if (method === 'initialize') {
    return mcpJsonRpcResult(id, {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    })
  }

  if (method === 'tools/list') {
    return mcpJsonRpcResult(id, { tools: MCP_TOOLS })
  }

  if (method === 'tools/call') {
    const toolName = params?.name
    const resultado = await mcpToolCallDispatch(toolName, params?.arguments, req)
    if (resultado) {
      return mcpJsonRpcResult(id, resultado)
    }
    // Ferramenta desconhecida — request válido, execução falhou. Padrão MCP:
    // isError:true no result, não erro de protocolo JSON-RPC (não confundir
    // "ferramenta não existe" com "chamada malformada").
    return mcpJsonRpcResult(id, {
      isError: true,
      content: [{ type: 'text', text: `Ferramenta desconhecida: ${String(toolName || '')}` }],
    })
  }

  if (method === 'ping') {
    return mcpJsonRpcResult(id, {})
  }

  return mcpJsonRpcError(id, -32601, `Method not found: ${String(method || '')}`)
}

async function mcpTool(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      return res.status(200).json(mcpJsonRpcError(null, -32700, 'Parse error'))
    }
  }
  if (!body || typeof body !== 'object') {
    return res.status(200).json(mcpJsonRpcError(null, -32700, 'Parse error'))
  }

  try {
    // Batch JSON-RPC (array) suportado pelo protocolo, ainda que raramente usado
    // por clientes MCP reais.
    if (Array.isArray(body)) {
      const respostas = (await Promise.all(body.map(msg => mcpHandleMessage(msg, req)))).filter(Boolean)
      if (respostas.length === 0) return res.status(202).end()
      return res.status(200).json(respostas)
    }

    const resposta = await mcpHandleMessage(body, req)
    if (resposta === null) return res.status(202).end() // notification, sem corpo
    return res.status(200).json(resposta)
  } catch (e) {
    // Nunca stack trace nem detalhe interno pro cliente — só log seguro (sem
    // Authorization, sem body bruto).
    console.error('[system-tools:mcp] Erro interno:', e.message)
    return res.status(200).json(mcpJsonRpcError(body?.id ?? null, -32603, 'Internal error'))
  }
}

// ============================================================================
// HANDLERS PARA NEX (Fase 6C.4)
// ============================================================================

async function nexSyncClientes(req, res) {
  // Validação de método
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' })
  }

  // Validação de Content-Type
  const contentType = req.headers['content-type'] || ''
  if (!contentType.includes('application/json')) {
    return res.status(400).json({ error: 'Content-Type deve ser application/json' })
  }

  // Validação de rate limit
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'desconhecido'
  if (!checarRateLimitNexBestEffort(ip)) {
    console.error('[system-tools:nex-sync-clientes] Rate limit excedido', { ip: ipHashCurto(ip) })
    return res.status(429).json({ error: 'Muitas tentativas — aguarde' })
  }

  // Validação de body
  let body
  try {
    body = req.body
  } catch (e) {
    return res.status(400).json({ error: 'Body inválido' })
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Body inválido' })
  }

  // Validação de clientes
  if (!Array.isArray(body.clientes)) {
    return res.status(400).json({ error: 'clientes deve ser array' })
  }

  if (body.clientes.length === 0) {
    return res.status(400).json({ error: 'clientes não pode estar vazio' })
  }

  if (body.clientes.length > 500) {
    return res.status(400).json({ error: `Lote excede limite de 500 registros (enviado: ${body.clientes.length})` })
  }

  // Validação de loteId
  if (typeof body.loteId !== 'string' || !body.loteId.trim()) {
    return res.status(400).json({ error: 'loteId obrigatório e deve ser string não-vazia' })
  }

  // Validação de correlationId (opcional)
  const correlationId = body.correlationId ? String(body.correlationId).trim() : null

  // Log de entrada (sem payload completo, sem PII)
  console.log('[system-tools:nex-sync-clientes] Requisição recebida', {
    ip: ipHashCurto(ip),
    loteId: body.loteId,
    correlationId,
    totalClientes: body.clientes.length,
  })

  // Config REST do Supabase (service_role, RLS zero-policy) — nunca client de
  // SDK; mesmo padrão de _profileLearning.js/qwenHealthSupabaseHeaders()
  const supabaseConfig = {
    baseUrl: SUPABASE_URL,
    headers: { 'apikey': SUPABASE_SECRET_KEY, 'Content-Type': 'application/json' },
  }

  // Delegar totalmente para _nexClientes.js
  try {
    const resultado = await processarLote(supabaseConfig, body.clientes, {
      loteId: body.loteId,
      correlationId,
      maxRegistros: 500,
    })

    console.log('[system-tools:nex-sync-clientes] Lote processado com sucesso', {
      ip: ipHashCurto(ip),
      loteId: body.loteId,
      totalProcessados: resultado.totalProcessados,
      totalSucesso: resultado.totalSucesso,
      totalErro: resultado.totalErro,
    })

    return res.status(200).json(resultado)
  } catch (err) {
    console.error('[system-tools:nex-sync-clientes] Erro ao processar lote', {
      ip: ipHashCurto(ip),
      loteId: body.loteId,
      erro: err.message,
    })
    return res.status(500).json({ error: 'Erro ao sincronizar clientes' })
  }
}

async function nexCliente(req, res) {
  // Validação de método
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Use GET' })
  }

  // Extrair parâmetros de query
  const origem = req.query.origem ? String(req.query.origem).trim() : ''
  const codigo = req.query.codigo ? String(req.query.codigo).trim() : ''

  // Validação de parâmetros
  if (!origem || !codigo) {
    return res.status(400).json({ error: 'Parâmetros ?origem= e ?codigo= obrigatórios' })
  }

  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'desconhecido'
  console.log('[system-tools:nex-cliente] Consulta recebida', {
    ip: ipHashCurto(ip),
    origem,
    codigo,
  })

  // Config REST do Supabase (service_role, RLS zero-policy) — nunca client de
  // SDK; mesmo padrão de _profileLearning.js/qwenHealthSupabaseHeaders()
  const supabaseConfig = {
    baseUrl: SUPABASE_URL,
    headers: { 'apikey': SUPABASE_SECRET_KEY, 'Content-Type': 'application/json' },
  }

  try {
    const resultado = await obterClienteComEventos(supabaseConfig, origem, codigo)

    if (!resultado) {
      // Não encontrado — sem detalhes
      return res.status(404).json({ sucesso: false, erro: 'Cliente não encontrado' })
    }

    const { cliente, eventos } = resultado

    return res.status(200).json({
      sucesso: true,
      cliente: {
        id: cliente.id,
        origem_loja: cliente.origem_loja,
        nex_codigo: cliente.nex_codigo,
        nome: cliente.nome,
        created_at: cliente.created_at,
        updated_at: cliente.updated_at,
        ausente_desde: cliente.ausente_desde,
        ultimos_eventos: eventos || [],
      },
    })
  } catch (err) {
    console.error('[system-tools:nex-cliente] Erro ao consultar', {
      ip: ipHashCurto(ip),
      origem,
      codigo,
      erro: err.message,
    })
    return res.status(500).json({ error: 'Erro ao consultar cliente' })
  }
}

async function nexHealth(req, res) {
  // Validação de método
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Use GET' })
  }

  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'desconhecido'
  const force = req.query.force === 'true'

  // ?force=true requer autenticação
  if (force) {
    if (!NEX_SYNC_SECRET) {
      return res.status(500).json({ error: 'NEX_SYNC_SECRET não configurada' })
    }
    const authHeader = req.headers.authorization
    if (authHeader !== `Bearer ${NEX_SYNC_SECRET}`) {
      console.warn('[system-tools:nex-health] Tentativa de ?force=true sem auth', { ip: ipHashCurto(ip) })
      return res.status(401).json({ error: 'Não autorizado' })
    }
  }

  // Verificar cache (público, sem force)
  if (!force && nexHealthCache && Date.now() - nexHealthCacheTimestamp < NEX_HEALTH_CACHE_TTL_MS) {
    return res.status(200).json({
      sucesso: true,
      ...nexHealthCache,
      cache_segundos: Math.round((Date.now() - nexHealthCacheTimestamp) / 1000),
    })
  }

  console.log('[system-tools:nex-health] Consultando agregados do NEX', { ip: ipHashCurto(ip), force })

  // Config REST do Supabase (service_role, RLS zero-policy) — nunca client de
  // SDK; mesmo padrão de _profileLearning.js/qwenHealthSupabaseHeaders()
  const supabaseConfig = {
    baseUrl: SUPABASE_URL,
    headers: { 'apikey': SUPABASE_SECRET_KEY, 'Content-Type': 'application/json' },
  }

  try {
    // Contagens agregadas (SEM PII), delegadas 100% ao helper
    const agregados = await obterAgregados(supabaseConfig)

    const stats = {
      timestamp: new Date().toISOString(),
      stats: {
        total_clientes: agregados.total_clientes,
        total_eventos: agregados.total_eventos,
        eventos_hoje: agregados.eventos_hoje,
        eventos_ultima_hora: agregados.eventos_ultima_hora,
        clientes_ausentes: agregados.clientes_ausentes,
        sync_status: 'ok',
      },
      ultima_atualizacao: new Date().toISOString(),
    }

    // Armazenar no cache
    nexHealthCache = stats
    nexHealthCacheTimestamp = Date.now()

    return res.status(200).json({
      sucesso: true,
      ...stats,
      cache_segundos: 0,
    })
  } catch (err) {
    console.error('[system-tools:nex-health] Erro ao consultar agregados', {
      ip: ipHashCurto(ip),
      erro: err.message,
    })
    return res.status(500).json({
      sucesso: false,
      erro: 'Falha ao consultar Supabase',
      timestamp: new Date().toISOString(),
    })
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  switch (req.query.tool) {
    case 'vercel-status':
      // Sem autenticação — consumido diretamente pelo Dashboard no navegador.
      return vercelStatus(req, res)

    case 'qwen-health':
      // Sem autenticação de usuário (risco residual aceito e documentado — ver
      // docs/SUPABASE.md §3.6) — GET é público e não custa nada (só leitura),
      // POST é público mas protegido pela trava atômica persistida no Supabase.
      return qwenHealth(req, res)

    case 'openrouter-usage':
      // Sem autenticação — mesmo desenho do vercel-status, consulta pública
      // de baixo risco e sem custo por chamada.
      return openrouterUsage(req, res)

    case 'codex-openrouter':
      // Proxy fiel do fallback de modelo do CODEX (Pacote 2) — model validado
      // contra allowlist fixa, sem autenticação de usuário adicional (mesmo
      // nível de exposição de antes, só que sem a chave no bundle).
      return codexOpenRouter(req, res)

    case 'ocr-openrouter':
      // Proxy fiel do fallback de visão do OCR (Pacote 2) — mesmo desenho do
      // codex-openrouter, allowlist própria de modelos de visão.
      return ocrOpenRouter(req, res)

    case 'perplexity-health':
      // Sem autenticação de usuário — mesmo desenho do qwen-health/openrouter-usage.
      // GET só lê cache em memória (nunca chama o Perplexity), POST faz a chamada
      // real respeitando o cache de 5min (a menos que force=true).
      return perplexityHealth(req, res)

    case 'prime-cobrancas-status':
      // Sem autenticação de usuário adicional — mesmo desenho do vercel-status
      // (consulta pública de baixo risco, só métricas agregadas, nunca dado de
      // cliente). Só GET, cache em memória de 3min (?force=true ignora).
      return primeCobrancasStatus(req, res)

    case 'sync-lyra': {
      // Autenticação obrigatória pra AMBOS dryRun=true e dryRun=false: mesmo em
      // modo relatório, a resposta expõe nomes, valores, vencimentos e status
      // financeiros reais — não é seguro deixar público.
      const cronSecret = process.env.CRON_SECRET
      const authHeader = req.headers.authorization
      if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'Não autorizado' })
      }
      return syncLyra(req, res)
    }

    case 'stuck-check': {
      // Autenticação obrigatória — chamado pelo GitHub Actions via CRON_SECRET.
      const cronSecret = process.env.CRON_SECRET
      const authHeader = req.headers.authorization
      if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'Não autorizado' })
      }
      return stuckCheck(req, res)
    }

    case 'lyra-webhook': {
      // Segredo próprio (LYRA_WEBHOOK_SECRET), diferente do CRON_SECRET — configurado
      // manualmente dentro da Lyra, não é injetado automaticamente por nada da Vercel.
      const webhookSecret = LYRA_WEBHOOK_SECRET
      const authHeader = req.headers.authorization
      if (!webhookSecret || authHeader !== `Bearer ${webhookSecret}`) {
        return res.status(401).json({ error: 'Não autorizado' })
      }
      return lyraWebhook(req, res)
    }

    case 'gerar-cobranca-lyra': {
      // CORS específico desta tool (FASE 3.2.0) — remove o "*" global (linha do topo do
      // handler) só pra este case, pra permitir chamada direta do navegador com header
      // Authorization/Content-Type. Comparação de Origin é por IGUALDADE EXATA (nunca
      // startsWith/includes) — evita aceitar subdomínios ou paths forjados como
      // "https://prime-vip.base44.app.evil.com". Reutiliza GERAR_COBRANCA_ALLOWED_ORIGINS,
      // mesma env já usada pela checagem de Origin best-effort mais abaixo.
      const normalizarOrigin = (valor) => String(valor || '').trim().replace(/\/+$/, '')
      const origemRecebida = normalizarOrigin(req.headers.origin)
      const origensPermitidas = String(process.env.GERAR_COBRANCA_ALLOWED_ORIGINS || '')
        .split(',')
        .map(normalizarOrigin)
        .filter(Boolean)
      const origemPermitida = Boolean(origemRecebida) && origensPermitidas.includes(origemRecebida)

      res.removeHeader('Access-Control-Allow-Origin')
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
      res.setHeader('Vary', 'Origin')
      if (origemPermitida) {
        res.setHeader('Access-Control-Allow-Origin', origemRecebida)
      }

      if (req.method === 'OPTIONS') {
        if (!origemPermitida) {
          return res.status(403).json({ success: false, error: 'Origem não permitida' })
        }
        return res.status(204).end()
      }

      const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null

      // --- 1. Autenticação dupla isolada (FASE 3.3.1) ---
      // Dois segredos completamente independentes, nunca comparados entre si, nunca
      // aceitos como equivalentes. COBRANCA_FRONTEND_TOKEN só existe dentro deste case —
      // nenhum outro `case` do switch abaixo lê essa variável, então ele nunca autentica
      // sync-lyra/lyra-webhook/stuck-check, mesmo se alguém tentar usá-lo lá.
      const gerarCobrancaSecret = process.env.GERAR_COBRANCA_SECRET
      const frontendToken = process.env.COBRANCA_FRONTEND_TOKEN
      const authHeader = req.headers.authorization

      let modoAuth = null
      if (gerarCobrancaSecret && authHeader === `Bearer ${gerarCobrancaSecret}`) {
        modoAuth = 'admin'
      } else if (frontendToken && authHeader === `Bearer ${frontendToken}`) {
        modoAuth = 'frontend'
      }

      if (!modoAuth) {
        console.error('[system-tools:gerar-cobranca-lyra] Tentativa não autorizada', { ip: ipHashCurto(ip) })
        return res.status(401).json({ error: 'Não autorizado' })
      }

      // ============================================================================
      // MODO FRONTEND (FASE 3.3.1) — token público temporário, exclusivo desta tool.
      // Só aceita dryRun=false, body estritamente {parcela_id, dryRun}, Origin exato
      // (não best-effort). Nunca lê valor/telefone/nome/cliente/vencimento/IDs do
      // request — a lógica financeira (gerarCobrancaLyraReal) sempre relê tudo
      // oficialmente do PRIME, igual ao modo admin.
      // ============================================================================
      if (modoAuth === 'frontend') {
        // 2. Origin exato — reaproveita `origemPermitida` já calculado no bloco de CORS
        // acima (igualdade exata contra GERAR_COBRANCA_ALLOWED_ORIGINS), não o
        // checarOrigemBestEffort (que é best-effort e usado só pelo modo admin).
        if (!origemPermitida) {
          console.error('[system-tools:gerar-cobranca-lyra] frontend: Origin não permitida', { modoAuth, ip: ipHashCurto(ip), status: 403, resultado: 'origin_invalida' })
          return res.status(403).json({ error: 'Origem não permitida' })
        }

        // FASE 3.3.1B — rate limit por IP aplicado JÁ AQUI, logo após auth+Origin válidos,
        // ANTES de validar método/body/campos/parcela_id. Objetivo: qualquer tentativa
        // autenticada pelo token frontend consome o limite por IP, mesmo que o resto do
        // request seja malformado (GET, body vazio, JSON malformado, campo extra,
        // dryRun inválido, parcela_id inválido) — evita que alguém spamme tentativas
        // inválidas pra sempre sem nunca esbarrar no rate limit.
        if (!checarRateLimitFrontendBestEffort(ip)) {
          console.error('[system-tools:gerar-cobranca-lyra] frontend: rate limit por IP excedido', { modoAuth, ip: ipHashCurto(ip), status: 429, resultado: 'rate_limit_ip' })
          return res.status(429).json({ error: 'Muitas tentativas — aguarde e tente novamente' })
        }

        // 3. Método
        if (req.method !== 'POST') {
          console.error('[system-tools:gerar-cobranca-lyra] frontend: método inválido', { modoAuth, ip: ipHashCurto(ip), metodo: req.method, status: 405, resultado: 'metodo_invalido' })
          return res.status(405).json({ error: 'Use POST' })
        }

        // 4. Body estritamente {parcela_id, dryRun} — rejeita qualquer campo extra
        // (valor, telefone, nome, cliente, vencimento, link, IDs externos) mesmo que
        // a lógica financeira já os ignore — defesa em profundidade, não só confiança.
        const body = req.body
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          console.error('[system-tools:gerar-cobranca-lyra] frontend: body inválido', { modoAuth, ip: ipHashCurto(ip), status: 400, resultado: 'body_invalido' })
          return res.status(400).json({ error: 'Body inválido' })
        }
        const chaves = Object.keys(body).sort()
        const permitidas = ['dryRun', 'parcela_id'].sort()
        const estruturaValida = chaves.length === permitidas.length && chaves.every((chave, index) => chave === permitidas[index])
        if (!estruturaValida) {
          console.error('[system-tools:gerar-cobranca-lyra] frontend: campos não permitidos no body', { modoAuth, ip: ipHashCurto(ip), status: 400, resultado: 'campos_invalidos' })
          return res.status(400).json({ error: 'Campos não permitidos no request' })
        }

        // 5. Extração e validação de parcela_id (só depois da validação de estrutura) —
        // parcela_id NUNCA é usado antes deste ponto, inclusive pro rate limit por parcela.
        if (typeof body.parcela_id !== 'string' || !body.parcela_id.trim()) {
          console.error('[system-tools:gerar-cobranca-lyra] frontend: parcela_id inválido', { modoAuth, ip: ipHashCurto(ip), status: 400, resultado: 'parcela_id_invalido' })
          return res.status(400).json({ error: 'parcela_id inválido' })
        }
        if (body.dryRun !== false) {
          console.error('[system-tools:gerar-cobranca-lyra] frontend: dryRun deve ser false', { modoAuth, ip: ipHashCurto(ip), status: 400, resultado: 'dryrun_invalido' })
          return res.status(400).json({ error: 'dryRun deve ser false no modo frontend' })
        }
        const parcelaIdFrontend = body.parcela_id

        // 6. Rate limit por parcela — só depois de parcela_id validado como string não
        // vazia (nunca antes). Mapa separado do rate limit por IP (item anterior) e do
        // modo admin — ambos best-effort, em memória do processo (ver declaração no topo
        // do arquivo): resetam a cada cold start, não são compartilhados entre instâncias/
        // regiões da Vercel, não substituem autenticação real.
        if (!checarRateLimitPorParcelaBestEffort(parcelaIdFrontend)) {
          console.error('[system-tools:gerar-cobranca-lyra] frontend: rate limit por parcela excedido', { modoAuth, ip: ipHashCurto(ip), status: 429, resultado: 'rate_limit_parcela' })
          return res.status(429).json({ error: 'Muitas tentativas para esta parcela — aguarde' })
        }

        // 7. Execução do helper já existente — mesma lógica financeira do modo admin,
        // sem nenhuma alteração (Parcela/Venda/Cliente relidos oficialmente, saldo,
        // vínculo divergente, idempotência, recuperação por prime_parcela_id).
        console.log('[system-tools:gerar-cobranca-lyra] Requisição frontend', { modoAuth, parcela_id: parcelaIdFrontend, ip: ipHashCurto(ip) })
        const resultado = await gerarCobrancaLyraReal({ parcelaId: parcelaIdFrontend })
        return res.status(resultado.httpStatus).json(resultado.body)
      }

      // ============================================================================
      // MODO ADMIN — comportamento idêntico ao já existente desde a FASE 2, sem
      // nenhuma alteração de lógica (só o log ganhou o campo modoAuth).
      // ============================================================================
      const origemCheck = checarOrigemBestEffort(req)
      if (!origemCheck.ok) {
        console.error('[system-tools:gerar-cobranca-lyra] Origin/Referer bloqueado', { modoAuth, motivo: origemCheck.motivo })
        return res.status(403).json({ error: 'Origem não permitida' })
      }

      if (!checarRateLimitBestEffort(ip)) {
        console.error('[system-tools:gerar-cobranca-lyra] Rate limit best-effort excedido', { modoAuth, ip: ipHashCurto(ip) })
        return res.status(429).json({ error: 'Muitas tentativas — aguarde e tente novamente' })
      }

      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Use POST' })
      }

      const parcelaId = req.body?.parcela_id
      // Default seguro: qualquer coisa diferente do booleano `false` literal mantém dryRun=true.
      const dryRun = req.body?.dryRun !== false

      if (!dryRun) {
        // Modo real exige Origin efetivamente checada (allowlist configurada), não só
        // "pulada por falta de configuração" — dry-run tolera a checagem best-effort,
        // escrita real não.
        if (!origemCheck.checado) {
          console.error('[system-tools:gerar-cobranca-lyra] dryRun=false recusado — GERAR_COBRANCA_ALLOWED_ORIGINS não configurada')
          return res.status(403).json({ error: 'dryRun=false exige GERAR_COBRANCA_ALLOWED_ORIGINS configurada e Origin/Referer validado' })
        }
        console.log('[system-tools:gerar-cobranca-lyra] Requisição REAL (dryRun=false)', { modoAuth, parcela_id: parcelaId, ip: ipHashCurto(ip) })
        const resultado = await gerarCobrancaLyraReal({ parcelaId })
        return res.status(resultado.httpStatus).json(resultado.body)
      }

      console.log('[system-tools:gerar-cobranca-lyra] Requisição dry-run', { modoAuth, parcela_id: parcelaId, ip: ipHashCurto(ip), origemChecada: origemCheck.checado })
      const resultado = await gerarCobrancaLyraDryRun({ parcelaId, ip, req })
      return res.status(resultado.httpStatus).json(resultado.body)
    }

    case 'mensagem-manual': {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' })
      }

      const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null
      const origemRecebida = req.headers.origin || req.headers.referer || ''

      if (!checarOrigemMensagemManual(origemRecebida)) {
        console.error('[system-tools:mensagem-manual] Origin não permitida', { ip: ipHashCurto(ip) })
        return res.status(403).json({ error: 'Origem não permitida', error_code: 'origin_not_allowed' })
      }

      if (!checarRateLimitMensagemManualBestEffort(ip)) {
        console.error('[system-tools:mensagem-manual] Rate limit por IP excedido', { ip: ipHashCurto(ip) })
        return res.status(429).json({ error: 'Muitas tentativas em pouco tempo', error_code: 'rate_limit_excedido' })
      }

      // --- Fase 1 (mensagem pronta com template) — listar_templates/previsualizar,
      // interceptados ANTES do envio existente. Mesma proteção de Origin/rate-limit
      // acima já se aplica às duas. Ambas são só leitura (garantido do lado do Base44:
      // nenhuma chama whatsappProvider nem cria LogNotificacao). ---
      const acao = req.body?.acao

      if (acao === 'listar_templates') {
        const validacaoTemplates = validarPayloadListarTemplates(req.body)
        if (!validacaoTemplates.valido) {
          return res.status(400).json({ error: 'Payload inválido', error_code: validacaoTemplates.error_code, campos: validacaoTemplates.campos })
        }
        const resultadoTemplates = await chamarListarTemplates()
        if (!resultadoTemplates.ok) {
          console.error('[system-tools:mensagem-manual] Falha ao listar templates', { error_code: resultadoTemplates.error_code, ip: ipHashCurto(ip) })
          return res.status(200).json({ success: false, error_code: resultadoTemplates.error_code })
        }
        return res.status(200).json(construirRespostaSeguraListarTemplates(resultadoTemplates.json))
      }

      if (acao === 'previsualizar') {
        const validacaoPrevia = validarPayloadPrevisualizar(req.body)
        if (!validacaoPrevia.valido) {
          return res.status(400).json({ error: 'Payload inválido', error_code: validacaoPrevia.error_code, campos: validacaoPrevia.campos })
        }
        const resultadoPrevia = await chamarPrevisualizarMensagem(validacaoPrevia)
        if (!resultadoPrevia.ok) {
          console.error('[system-tools:mensagem-manual] Falha ao pré-visualizar', { error_code: resultadoPrevia.error_code, ip: ipHashCurto(ip) })
          return res.status(200).json({ success: false, error_code: resultadoPrevia.error_code })
        }
        return res.status(200).json(construirRespostaSeguraPrevisualizar(resultadoPrevia.json))
      }

      if (acao !== undefined && acao !== null && acao !== 'enviar') {
        return res.status(400).json({ error: 'Ação inválida', error_code: 'acao_invalida' })
      }

      // --- Envio (compatibilidade retroativa total — payload sem `acao` continua
      // funcionando exatamente como antes desta fase) ---
      const validacao = validarPayloadMensagemManual(req.body)
      if (!validacao.valido) {
        return res.status(400).json({ error: 'Payload inválido', error_code: validacao.error_code, campos: validacao.campos })
      }

      const { cliente_id, texto_mensagem, request_id } = validacao

      if (!iniciarRequestIdSeLivre(request_id)) {
        return res.status(429).json({ error: 'Requisição em andamento', error_code: 'requisicao_em_andamento' })
      }

      try {
        const resultado = await chamarEnviarMensagemManualWhatsapp({ cliente_id, texto_mensagem, request_id })

        if (!resultado.ok) {
          console.error('[system-tools:mensagem-manual] Falha ao chamar Base44', { error_code: resultado.error_code, ip: ipHashCurto(ip) })
          return res.status(200).json({ success: false, error_code: resultado.error_code, request_id })
        }

        console.log('[system-tools:mensagem-manual] Concluído', { status: resultado.json?.status, ip: ipHashCurto(ip) })
        return res.status(200).json(construirRespostaSeguraMensagemManual(resultado.json, request_id))
      } finally {
        liberarRequestId(request_id)
      }
    }

    case 'mcp': {
      // Preflight de CORS não carrega Authorization — liberado sem checar segredo,
      // igual ao padrão já usado em gerar-cobranca-lyra.
      if (req.method === 'OPTIONS') {
        return mcpTool(req, res)
      }
      if (!MCP_LITE_SECRET) {
        console.error('[system-tools:mcp] Configuração ausente: MCP_LITE_SECRET não definida')
        return res.status(500).json({ error: 'MCP_LITE_SECRET não configurado' })
      }
      const authHeader = req.headers.authorization
      if (authHeader !== `Bearer ${MCP_LITE_SECRET}`) {
        return res.status(401).json({ error: 'Não autorizado' })
      }
      return mcpTool(req, res)
    }

    case 'nex-sync-clientes': {
      // Sincronização de clientes NEX (Fase 6C.4) — autenticação obrigatória,
      // rate limit best-effort, delegação completa pra _nexClientes.js.
      if (!NEX_SYNC_SECRET) {
        console.error('[system-tools:nex-sync-clientes] Configuração ausente: NEX_SYNC_SECRET não definida')
        return res.status(500).json({ error: 'NEX_SYNC_SECRET não configurada' })
      }
      const authHeader = req.headers.authorization
      if (authHeader !== `Bearer ${NEX_SYNC_SECRET}`) {
        return res.status(401).json({ error: 'Não autorizado' })
      }
      return nexSyncClientes(req, res)
    }

    case 'nex-cliente': {
      // Consulta de cliente NEX específico (Fase 6C.4) — autenticação obrigatória,
      // retorna agregados sem PII sensível (sem content_hash, sem metadados internos).
      if (!NEX_SYNC_SECRET) {
        console.error('[system-tools:nex-cliente] Configuração ausente: NEX_SYNC_SECRET não definida')
        return res.status(500).json({ error: 'NEX_SYNC_SECRET não configurada' })
      }
      const authHeader = req.headers.authorization
      if (authHeader !== `Bearer ${NEX_SYNC_SECRET}`) {
        return res.status(401).json({ error: 'Não autorizado' })
      }
      return nexCliente(req, res)
    }

    case 'nex-health': {
      // Health check agregado do NEX (Fase 6C.4) — público, mas com cache riguroso.
      // ?force=true exige autenticação (NEX_SYNC_SECRET) pra forçar refresh do cache.
      return nexHealth(req, res)
    }

    default:
      return res.status(400).json({ error: 'Parâmetro ?tool= inválido ou ausente (use vercel-status, sync-lyra, stuck-check, lyra-webhook, gerar-cobranca-lyra, qwen-health, openrouter-usage, codex-openrouter, ocr-openrouter, perplexity-health, prime-cobrancas-status, mensagem-manual, mcp, nex-sync-clientes, nex-cliente ou nex-health)' })
  }
}
