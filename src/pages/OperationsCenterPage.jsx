import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../theme.jsx'
import SummaryCard from '../components/operations/SummaryCard.jsx'
import ServiceStatusCard from '../components/operations/ServiceStatusCard.jsx'
import HealthCheckPanel from '../components/operations/HealthCheckPanel.jsx'
import RecentActivityPanel from '../components/operations/RecentActivityPanel.jsx'
import { DataSourceBadge } from '../components/operations/StatusBadge.jsx'
import { getQwenHealthState, requestQwenHealthRefresh } from '../services/ia/qwenHealthService.js'
import { getOpenRouterUsage } from '../services/ia/openrouterBalanceService.js'
import { getPerplexityHealthState, requestPerplexityHealthRefresh } from '../services/ia/perplexityHealthService.js'
import { getVercelStatus } from '../services/plataforma/vercelStatusService.js'
import { getGithubStatus } from '../services/plataforma/githubStatusService.js'
import { getSupabaseHealth } from '../services/plataforma/supabaseHealthService.js'
import { getPrimeCobrancasStatus } from '../services/crm/primeCobrancasStatusService.js'
import {
  PERIOD_OPTIONS,
  servicesMock,
} from '../data/operationsCenterMock.js'

function fmtTime(iso) {
  const d = new Date(iso)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// Formato relativo ("há 2 min") pro Summary Card "Última verificação real" —
// o horário absoluto continua disponível como texto secundário no próprio card.
function fmtRelative(iso) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'agora mesmo'
  if (diffMin < 60) return `há ${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `há ${diffH}h`
  const diffD = Math.floor(diffH / 24)
  return `há ${diffD}d`
}

// QwenCloud é o único card com dado real nesta fase (Fase 2A.1) — os demais seguem mockados.
// Mensagens de erro nunca expõem status HTTP bruto nem detalhe técnico do provedor.
// O intervalo mínimo entre verificações reais é decidido só pelo servidor
// (QWEN_HEALTH_MIN_INTERVAL_SECONDS + trava atômica no Supabase) — esta página
// nunca decide isso, só exibe o resultado (inclusive quando `throttled: true`).
const QWEN_ERROR_MESSAGES = {
  QWEN_NOT_CONFIGURED: 'Variáveis QWEN_* não configuradas no servidor',
  QWEN_AUTH_ERROR: 'Falha de autenticação com o QwenCloud',
  QWEN_TIMEOUT: 'QwenCloud não respondeu a tempo',
  QWEN_UNAVAILABLE: 'QwenCloud indisponível no momento',
  QWEN_NOT_CHECKED_YET: 'Ainda não verificado — clique em "Atualizar agora"',
  QWEN_CLIENT_ERROR: 'Não foi possível verificar o QwenCloud agora',
  QWEN_HEALTH_STORAGE_NOT_CONFIGURED: 'Persistência não configurada no servidor',
  QWEN_HEALTH_READ_ERROR: 'Não foi possível ler o último resultado',
  QWEN_HEALTH_INTERNAL_ERROR: 'Erro interno ao processar a verificação',
}

function throttleSuffix(qwenHealth) {
  if (!qwenHealth.throttled) return ''
  const nextLabel = qwenHealth.nextAllowedAt ? fmtTime(qwenHealth.nextAllowedAt) : null
  return ` — nova checagem bloqueada pelo intervalo mínimo${nextLabel ? ` (libera às ${nextLabel})` : ''}`
}

function buildQwenCard(qwenHealth, qwenLoading) {
  if (qwenLoading || !qwenHealth) {
    return {
      provider: 'QwenCloud',
      status: 'verificando',
      dataSource: 'loading',
      message: 'Carregando último resultado...',
      metrics: [
        { label: 'Disponibilidade', value: '—' },
        { label: 'Modelo', value: '—' },
        { label: 'Latência', value: '—' },
      ],
    }
  }

  if (!qwenHealth.available) {
    const baseMessage = QWEN_ERROR_MESSAGES[qwenHealth.errorCode] || 'QwenCloud indisponível'
    return {
      provider: 'QwenCloud',
      status: qwenHealth.errorCode === 'QWEN_NOT_CHECKED_YET' ? 'indisponivel' : 'offline',
      dataSource: 'real',
      message: `${baseMessage}${throttleSuffix(qwenHealth)}`,
      metrics: [
        { label: 'Disponibilidade', value: qwenHealth.errorCode === 'QWEN_NOT_CHECKED_YET' ? 'Ainda não verificado' : 'Indisponível' },
        { label: 'Modelo', value: qwenHealth.model || '—' },
        ...(qwenHealth.lastChecked ? [{ label: 'Última verificação', value: fmtTime(qwenHealth.lastChecked) }] : []),
      ],
    }
  }

  const metrics = [
    { label: 'Disponibilidade', value: 'Online' },
    { label: 'Modelo', value: qwenHealth.model },
    { label: 'Latência', value: `${qwenHealth.latencyMs}ms` },
    { label: 'Última verificação', value: fmtTime(qwenHealth.lastChecked) },
  ]
  if (qwenHealth.usage?.totalTokens > 0) {
    metrics.push({ label: 'Tokens (health check)', value: qwenHealth.usage.totalTokens })
  }

  return {
    provider: 'QwenCloud',
    status: 'online',
    dataSource: 'real',
    message: `Verificação real confirmada${throttleSuffix(qwenHealth)}`,
    metrics,
  }
}

// Perplexity — health check real, sem saldo/uso/requests (a API não expõe isso).
const PERPLEXITY_ERROR_MESSAGES = {
  PERPLEXITY_NOT_CONFIGURED: 'PERPLEXITY_API_KEY não configurada no servidor',
  PERPLEXITY_AUTH_ERROR: 'Falha de autenticação com o Perplexity',
  PERPLEXITY_TIMEOUT: 'Perplexity não respondeu a tempo',
  PERPLEXITY_UNAVAILABLE: 'Perplexity indisponível no momento',
  PERPLEXITY_NOT_CHECKED_YET: 'Ainda não verificado — clique em "Atualizar agora"',
  PERPLEXITY_CLIENT_ERROR: 'Não foi possível verificar o Perplexity agora',
}

function buildPerplexityCard(perplexityHealth, perplexityLoading) {
  if (perplexityLoading || !perplexityHealth) {
    return {
      provider: 'Perplexity',
      status: 'verificando',
      dataSource: 'loading',
      message: 'Carregando último resultado...',
      metrics: [
        { label: 'Status', value: '—' },
        { label: 'Modelo', value: '—' },
        { label: 'Latência', value: '—' },
      ],
    }
  }

  if (!perplexityHealth.available) {
    const baseMessage = PERPLEXITY_ERROR_MESSAGES[perplexityHealth.errorCode] || 'Perplexity indisponível'
    return {
      provider: 'Perplexity',
      status: perplexityHealth.errorCode === 'PERPLEXITY_NOT_CHECKED_YET' ? 'indisponivel' : 'offline',
      dataSource: 'real',
      message: baseMessage,
      metrics: [
        { label: 'Status', value: perplexityHealth.errorCode === 'PERPLEXITY_NOT_CHECKED_YET' ? 'Ainda não verificado' : 'Offline' },
        { label: 'Modelo', value: perplexityHealth.model || '—' },
        ...(perplexityHealth.lastChecked ? [{ label: 'Última verificação', value: fmtTime(perplexityHealth.lastChecked) }] : []),
      ],
    }
  }

  // Só exibe tokens/custo se a API realmente devolveu esses campos na última
  // chamada — nunca inventa, nunca acumula (é só o custo/uso do health check
  // em si, não um saldo/consumo agregado, que a API do Perplexity não expõe).
  const metrics = [
    { label: 'Status', value: 'Online' },
    { label: 'Modelo', value: perplexityHealth.model },
  ]
  if (perplexityHealth.usage?.inputTokens != null && perplexityHealth.usage?.outputTokens != null) {
    metrics.push({ label: 'Tokens (entrada/saída)', value: `${perplexityHealth.usage.inputTokens} / ${perplexityHealth.usage.outputTokens}` })
  } else if (perplexityHealth.usage?.totalTokens != null) {
    metrics.push({ label: 'Tokens (última verificação)', value: perplexityHealth.usage.totalTokens })
  }
  if (typeof perplexityHealth.lastCheckCost === 'number') {
    metrics.push({ label: 'Custo (última verificação)', value: `US$ ${perplexityHealth.lastCheckCost.toFixed(5)}` })
  }
  metrics.push({ label: 'Latência', value: `${perplexityHealth.latencyMs}ms` })
  metrics.push({ label: 'Última verificação', value: fmtTime(perplexityHealth.lastChecked) })

  return {
    provider: 'Perplexity',
    status: 'online',
    dataSource: 'real',
    message: perplexityHealth.cached
      ? 'Cache válido (até 5 min) — "Atualizar agora" força nova consulta'
      : 'Verificação real confirmada',
    metrics,
  }
}

// OpenRouter (Pacote 1) — só saldo real, sem requests/tokens/modelos (sem fonte confirmada).
const OPENROUTER_ERROR_MESSAGES = {
  OPENROUTER_NOT_CONFIGURED: 'OPENROUTER_API_KEY não configurada no servidor',
  OPENROUTER_AUTH_ERROR: 'Falha de autenticação com o OpenRouter',
  OPENROUTER_TIMEOUT: 'OpenRouter não respondeu a tempo',
  OPENROUTER_UNAVAILABLE: 'OpenRouter indisponível no momento',
  OPENROUTER_CLIENT_ERROR: 'Não foi possível verificar o OpenRouter agora',
}

function buildOpenRouterCard(openrouterUsage, openrouterLoading) {
  if (openrouterLoading || !openrouterUsage) {
    return {
      provider: 'OpenRouter',
      status: 'verificando',
      dataSource: 'loading',
      message: 'Carregando saldo...',
      metrics: [
        { label: 'Saldo restante', value: '—' },
        { label: 'Gasto acumulado', value: '—' },
        { label: 'Créditos totais', value: '—' },
      ],
    }
  }

  if (!openrouterUsage.available) {
    return {
      provider: 'OpenRouter',
      status: 'offline',
      dataSource: 'real',
      message: OPENROUTER_ERROR_MESSAGES[openrouterUsage.errorCode] || 'OpenRouter indisponível',
      metrics: [
        { label: 'Saldo restante', value: 'Indisponível' },
        ...(openrouterUsage.lastChecked ? [{ label: 'Última verificação', value: fmtTime(openrouterUsage.lastChecked) }] : []),
      ],
    }
  }

  return {
    provider: 'OpenRouter',
    status: 'online',
    dataSource: 'real',
    message: openrouterUsage.cached
      ? 'Cache válido (até 5 min) — "Atualizar agora" força nova consulta'
      : 'Consulta real agora',
    metrics: [
      { label: 'Saldo restante', value: `US$ ${openrouterUsage.remainingCredits.toFixed(2)}` },
      { label: 'Gasto acumulado', value: `US$ ${openrouterUsage.totalUsage.toFixed(2)}` },
      { label: 'Créditos totais', value: `US$ ${openrouterUsage.totalCredits.toFixed(2)}` },
      { label: 'Última verificação', value: fmtTime(openrouterUsage.lastChecked) },
    ],
  }
}

// Vercel — reaproveita vercelStatusService.js já existente (mesmo serviço usado
// pelo Dashboard). Sem billing/uso (plano Hobby não expõe isso via API).
function buildVercelCard(vercelStatus, vercelLoading) {
  if (vercelLoading || !vercelStatus) {
    return {
      provider: 'Vercel',
      status: 'verificando',
      dataSource: 'loading',
      message: 'Carregando último deploy...',
      metrics: [
        { label: 'Último deploy', value: '—' },
        { label: 'Ambiente', value: '—' },
        { label: 'Status', value: '—' },
      ],
    }
  }

  if (!vercelStatus.available) {
    return {
      provider: 'Vercel',
      status: 'indisponivel',
      dataSource: 'real',
      message: 'Não foi possível confirmar o último deploy agora',
      metrics: [{ label: 'Status', value: 'Indisponível' }],
    }
  }

  return {
    provider: 'Vercel',
    status: 'online',
    dataSource: 'real',
    message: 'Estado operacional — plano Hobby não expõe billing via API',
    metrics: [
      { label: 'Último deploy', value: `${vercelStatus.branch || '—'} · ${fmtTime(vercelStatus.createdAt)}` },
      { label: 'Ambiente', value: vercelStatus.target === 'production' ? 'Production' : (vercelStatus.target || '—') },
      { label: 'Status', value: vercelStatus.state || '—' },
    ],
  }
}

// GitHub — API pública (repositório público, sem autenticação, sem segredo).
function buildGithubCard(githubStatus, githubLoading) {
  if (githubLoading || !githubStatus) {
    return {
      provider: 'GitHub',
      status: 'verificando',
      dataSource: 'loading',
      message: 'Carregando repositório...',
      metrics: [
        { label: 'Branch', value: '—' },
        { label: 'Último commit', value: '—' },
      ],
    }
  }

  if (!githubStatus.available) {
    return {
      provider: 'GitHub',
      status: 'indisponivel',
      dataSource: 'real',
      message: 'Não foi possível consultar o repositório agora',
      metrics: [{ label: 'Status', value: 'Indisponível' }],
    }
  }

  return {
    provider: 'GitHub',
    status: 'online',
    dataSource: 'real',
    message: 'Repositório público — consulta direta à API do GitHub',
    metrics: [
      { label: 'Branch', value: githubStatus.branch || '—' },
      ...(githubStatus.lastCommit ? [
        { label: 'Último commit', value: `${githubStatus.lastCommit.sha || '—'} · ${fmtTime(githubStatus.lastCommit.date)}` },
      ] : []),
    ],
  }
}

// Supabase — checagem real de conectividade (REST API), sem inventar métrica de
// billing/storage (não exposta via anon key).
function buildSupabaseCard(supabaseHealth, supabaseLoading) {
  if (supabaseLoading || !supabaseHealth) {
    return {
      provider: 'Supabase',
      status: 'verificando',
      dataSource: 'loading',
      message: 'Verificando conexão...',
      metrics: [
        { label: 'Conexão', value: '—' },
        { label: 'Última verificação', value: '—' },
      ],
    }
  }

  if (!supabaseHealth.available) {
    return {
      provider: 'Supabase',
      status: 'offline',
      dataSource: 'real',
      message: 'Não foi possível conectar ao Supabase agora',
      metrics: [
        { label: 'Conexão', value: 'Falhou' },
        { label: 'Última verificação', value: fmtTime(supabaseHealth.lastChecked) },
      ],
    }
  }

  return {
    provider: 'Supabase',
    status: 'online',
    dataSource: 'real',
    message: 'Verificação real confirmada — não é métrica de billing',
    metrics: [
      { label: 'Conexão', value: 'Conectado' },
      { label: 'Latência', value: `${supabaseHealth.latencyMs}ms` },
      { label: 'Última verificação', value: fmtTime(supabaseHealth.lastChecked) },
    ],
  }
}

// PRIME Cobranças (Fase A) — consolida ping real de 2 apps Base44 (PRIME + Lyra)
// e a última atividade real (HistoricoAtividade). WhatsApp/Z-API sempre aparece
// como "Não verificado" nesta fase — nunca "Online"/"Trial vencido" inventado.
// Enquanto o Z-API não for verificado de verdade, o status geral nunca é
// "online" mesmo com os 2 apps respondendo — é "atencao" (parcialmente monitorado).
function buildPrimeCobrancasCard(primeCobrancasStatus, primeCobrancasLoading) {
  if (primeCobrancasLoading || !primeCobrancasStatus) {
    return {
      provider: 'PRIME Cobranças',
      status: 'verificando',
      dataSource: 'loading',
      message: 'Verificando PRIME Cobranças...',
      metrics: [
        { label: 'Base44 PRIME', value: '—' },
        { label: 'Base44 Lyra', value: '—' },
        { label: 'WhatsApp Z-API', value: '—' },
      ],
    }
  }

  if (primeCobrancasStatus.errorCode === 'BASE44_NOT_CONFIGURED') {
    return {
      provider: 'PRIME Cobranças',
      status: 'indisponivel',
      dataSource: 'real',
      message: 'BASE44_API_KEY não configurada no servidor',
      metrics: [{ label: 'Status', value: 'Não configurado' }],
    }
  }

  const {
    primeAvailable, lyraAvailable, lastActivityAt, lastChecked,
    notificationsToday, lastAttemptAt, lastErrorCode, avgDurationMs,
    whatsappStatus, smartphoneConnected, whatsappProvider: waProviderName,
  } = primeCobrancasStatus
  const bothOnline = primeAvailable && lyraAvailable
  const whatsappConnected = whatsappStatus === 'connected'
  const status = !bothOnline ? 'offline' : (whatsappConnected ? 'online' : 'atencao')

  // Fase C — rótulo real do WhatsApp/Z-API. Nunca "unknown" vira algo mais
  // otimista que "Estado desconhecido" — só os 6 estados que a Function
  // realmente devolve, nada inventado além disso.
  const WHATSAPP_STATUS_LABELS = {
    connected: 'Conectado',
    disconnected: 'Desconectado',
    not_configured: 'Não configurado',
    auth_error: 'Erro de autenticação',
    provider_unavailable: 'Indisponível',
    unknown: 'Estado desconhecido',
  }
  const whatsappLabel = WHATSAPP_STATUS_LABELS[whatsappStatus] || 'Estado desconhecido'
  const waProviderLabel = waProviderName === 'zapapi' ? 'ZAP-API' : (waProviderName === 'zapi' ? 'Z-API' : 'Z-API')

  const metrics = [
    { label: 'Base44 PRIME', value: primeAvailable ? 'Online' : 'Indisponível' },
    { label: 'Base44 Lyra', value: lyraAvailable ? 'Online' : 'Indisponível' },
    { label: `WhatsApp ${waProviderLabel}`, value: whatsappLabel },
  ]
  // smartphoneConnected === null é esperado na ZAP-API (não expõe esse campo) —
  // omitido nesse caso, nunca mostrado como "desconectado" nem inventado.
  if (typeof smartphoneConnected === 'boolean') {
    metrics.push({ label: 'Smartphone conectado', value: smartphoneConnected ? 'Sim' : 'Não' })
  }

  // Fase B — só entram se a leitura de LogNotificacao tiver funcionado (nunca
  // "0" fingido quando a fonte real falhou — nesse caso, notificationsToday vem
  // null e a linha simplesmente não aparece, ausência honesta).
  if (notificationsToday) {
    metrics.push({ label: 'Envios hoje', value: String(notificationsToday.success) })
    metrics.push({ label: 'Falhas hoje', value: String(notificationsToday.failed) })
  }
  if (lastAttemptAt) {
    metrics.push({ label: 'Última tentativa', value: fmtTime(lastAttemptAt) })
  }
  if (lastErrorCode) {
    metrics.push({ label: 'Último erro', value: lastErrorCode })
  }
  if (typeof avgDurationMs === 'number') {
    metrics.push({ label: 'Duração média', value: `${avgDurationMs}ms` })
  }

  metrics.push({ label: 'Última atividade', value: lastActivityAt ? fmtTime(lastActivityAt) : '—' })
  metrics.push({ label: 'Última verificação', value: fmtTime(lastChecked) })

  const message = !bothOnline
    ? 'Um dos apps Base44 não respondeu'
    : (whatsappConnected
      ? 'Todos os sistemas operacionais'
      : `WhatsApp (${waProviderLabel}) — ${whatsappLabel.toLowerCase()}`)

  return {
    provider: 'PRIME Cobranças',
    status,
    dataSource: 'real',
    message,
    metrics,
  }
}

// ============================================================================
// Fase 2 — Health Check e Atividade Recente reais, montados só a partir dos
// states já carregados na página (nenhuma chamada nova, nenhuma function nova).
// Nunca inventa uptime histórico nem disponibilidade — cada linha reflete
// exatamente o último resultado real já exibido nos cards de serviço.
// ============================================================================

// "API endpoints" = health checks reais de OpenRouter/Qwen/Perplexity/Vercel.
// "Banco de dados" = Supabase. "Webhooks" não tem nenhum monitoramento real
// exposto ao frontend hoje (stuck-check roda via cron, mas não persiste
// estado consultável aqui) — mostrado honestamente como não monitorado.
// "Edge/Serverless functions" reaproveita o mesmo sinal real do Vercel.
function buildHealthCheckData({
  qwenHealth, openrouterUsage, perplexityHealth, vercelStatus, supabaseHealth,
}) {
  const signals = [
    { key: 'openrouter', data: openrouterUsage },
    { key: 'qwen', data: qwenHealth },
    { key: 'perplexity', data: perplexityHealth },
    { key: 'vercel', data: vercelStatus },
  ]

  const checked = signals.filter(s => s.data != null)
  const onlineCount = checked.filter(s => s.data.available).length

  const apiEndpointsStatus = checked.length === 0 ? 'verificando' : (onlineCount === checked.length ? 'online' : 'atencao')
  const apiEndpointsDetail = checked.length === 0
    ? 'Aguardando primeira verificação'
    : `${onlineCount}/${checked.length} respondendo (OpenRouter, Qwen, Perplexity, Vercel)`

  const dbStatus = !supabaseHealth ? 'verificando' : (supabaseHealth.available ? 'online' : 'offline')
  const dbDetail = !supabaseHealth
    ? 'Aguardando primeira verificação'
    : (supabaseHealth.available ? `Conectado — ${supabaseHealth.latencyMs}ms` : 'Falha na conexão')

  const edgeStatus = !vercelStatus ? 'verificando' : (vercelStatus.available ? 'online' : 'indisponivel')
  const edgeDetail = !vercelStatus
    ? 'Aguardando primeira verificação'
    : (vercelStatus.available ? `Último deploy: ${vercelStatus.state || '—'}` : 'Não foi possível confirmar')

  const monitoredCount = checked.length + (supabaseHealth ? 1 : 0) + (vercelStatus ? 1 : 0)
  const monitoredOnline = onlineCount + (supabaseHealth?.available ? 1 : 0) + (vercelStatus?.available ? 1 : 0)

  return {
    summaryLabel: monitoredCount === 0 ? 'Aguardando primeira verificação' : `${monitoredOnline}/${monitoredCount} monitorados online agora`,
    checks: [
      { label: 'API endpoints', status: apiEndpointsStatus, detail: apiEndpointsDetail },
      { label: 'Banco de dados', status: dbStatus, detail: dbDetail },
      { label: 'Webhooks', status: 'indisponivel', detail: 'Sem monitoramento configurado' },
      { label: 'Edge / Serverless functions', status: edgeStatus, detail: edgeDetail },
    ],
  }
}

// Feed real: um item por fonte, só se ela já tiver um timestamp real — nunca
// preenche data/hora fictícia. Ordenado do mais recente pro mais antigo.
function buildRecentActivityItems({
  qwenHealth, openrouterUsage, perplexityHealth, vercelStatus, githubStatus, supabaseHealth,
}) {
  const items = []

  if (vercelStatus?.available && vercelStatus.createdAt) {
    items.push({ id: 'vercel', kind: 'deploy', time: vercelStatus.createdAt, label: `Deploy Vercel (${vercelStatus.branch || '—'}) — ${vercelStatus.state || '—'}` })
  }
  if (githubStatus?.available && githubStatus.lastCommit?.date) {
    items.push({ id: 'github', kind: 'sync', time: githubStatus.lastCommit.date, label: `Último commit no GitHub — ${githubStatus.lastCommit.sha || '—'}` })
  }
  if (openrouterUsage?.lastChecked) {
    items.push({ id: 'openrouter', kind: 'ia', time: openrouterUsage.lastChecked, label: 'Verificação de saldo OpenRouter' })
  }
  if (qwenHealth?.lastChecked) {
    items.push({ id: 'qwen', kind: 'ia', time: qwenHealth.lastChecked, label: `Health check QwenCloud — ${qwenHealth.available ? 'disponível' : 'indisponível'}` })
  }
  if (perplexityHealth?.lastChecked) {
    items.push({ id: 'perplexity', kind: 'ia', time: perplexityHealth.lastChecked, label: `Health check Perplexity — ${perplexityHealth.available ? 'disponível' : 'indisponível'}` })
  }
  if (supabaseHealth?.lastChecked) {
    items.push({ id: 'supabase', kind: 'sync', time: supabaseHealth.lastChecked, label: `Verificação de conexão Supabase — ${supabaseHealth.available ? 'conectado' : 'falhou'}` })
  }

  return items
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .map(item => ({ ...item, time: fmtTime(item.time) }))
}

// ============================================================================
// Última etapa — os 4 SummaryCards do topo, montados só com dados reais já
// carregados. Claude (sem API) e Base44 (sem monitoramento real) ficam de fora
// de propósito, pra não diluir a contagem com integrações não-reais.
// ============================================================================
function buildSummaryMetrics({
  qwenHealth, openrouterUsage, perplexityHealth, vercelStatus, githubStatus, supabaseHealth,
}) {
  const monitored = [
    { data: openrouterUsage },
    { data: qwenHealth },
    { data: perplexityHealth },
    { data: vercelStatus },
    { data: githubStatus },
    { data: supabaseHealth },
  ]

  const checked = monitored.filter(m => m.data != null)
  const onlineCount = checked.filter(m => m.data.available).length
  const totalMonitored = monitored.length // 6 integrações reais hoje — denominador fixo,
  // não varia enquanto os states ainda estão carregando (evita "X/2" piscando pra "X/6")

  const lastCheckedTimes = [
    openrouterUsage?.lastChecked,
    qwenHealth?.lastChecked,
    perplexityHealth?.lastChecked,
    vercelStatus?.lastChecked,
    githubStatus?.lastChecked,
    supabaseHealth?.lastChecked,
  ].filter(Boolean)
  const mostRecent = lastCheckedTimes.length
    ? lastCheckedTimes.reduce((a, b) => (new Date(a) > new Date(b) ? a : b))
    : null

  const latencies = [qwenHealth?.latencyMs, perplexityHealth?.latencyMs, supabaseHealth?.latencyMs]
    .filter(v => typeof v === 'number')
  const avgLatency = latencies.length
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : null

  return {
    servicesOnline: { online: onlineCount, total: totalMonitored },
    servicesMonitored: totalMonitored,
    lastCheck: mostRecent,
    avgLatencyMs: avgLatency,
  }
}

export default function OperationsCenterPage() {
  const { theme: t } = useTheme()
  const [period, setPeriod] = useState('7d')
  const [lastUpdated, setLastUpdated] = useState(new Date().toISOString())
  const [refreshing, setRefreshing] = useState(false)
  const [qwenHealth, setQwenHealth] = useState(null)
  const [qwenLoading, setQwenLoading] = useState(true)
  const [openrouterUsage, setOpenrouterUsage] = useState(null)
  const [openrouterLoading, setOpenrouterLoading] = useState(true)
  const [perplexityHealth, setPerplexityHealth] = useState(null)
  const [perplexityLoading, setPerplexityLoading] = useState(true)
  const [vercelStatus, setVercelStatus] = useState(null)
  const [vercelLoading, setVercelLoading] = useState(true)
  const [githubStatus, setGithubStatus] = useState(null)
  const [githubLoading, setGithubLoading] = useState(true)
  const [supabaseHealth, setSupabaseHealth] = useState(null)
  const [supabaseLoading, setSupabaseLoading] = useState(true)
  const [primeCobrancasStatus, setPrimeCobrancasStatus] = useState(null)
  const [primeCobrancasLoading, setPrimeCobrancasLoading] = useState(true)

  // GET — só lê o último estado persistido, nunca chama o QwenCloud. Seguro pra
  // rodar ao montar a página; abrir/recarregar o Operations Center nunca gera
  // uma chamada real (a decisão de chamar ou não fica inteiramente no POST).
  const loadQwenState = useCallback(async () => {
    setQwenLoading(true)
    const data = await getQwenHealthState()
    setQwenHealth(data)
    setQwenLoading(false)
  }, [])

  // Saldo do OpenRouter — sem custo real em consultar de novo, só respeita o
  // cache de 5min do próprio endpoint (força só quando explicitamente pedido).
  const loadOpenRouter = useCallback(async (force = false) => {
    setOpenrouterLoading(true)
    const data = await getOpenRouterUsage(force)
    setOpenrouterUsage(data)
    setOpenrouterLoading(false)
  }, [])

  // GET — só lê o cache em memória do servidor, nunca chama o Perplexity.
  const loadPerplexityState = useCallback(async () => {
    setPerplexityLoading(true)
    const data = await getPerplexityHealthState()
    setPerplexityHealth(data)
    setPerplexityLoading(false)
  }, [])

  const loadVercelStatus = useCallback(async (force = false) => {
    setVercelLoading(true)
    const data = await getVercelStatus(force)
    setVercelStatus(data)
    setVercelLoading(false)
  }, [])

  const loadGithubStatus = useCallback(async (force = false) => {
    setGithubLoading(true)
    const data = await getGithubStatus(force)
    setGithubStatus(data)
    setGithubLoading(false)
  }, [])

  const loadSupabaseHealth = useCallback(async (force = false) => {
    setSupabaseLoading(true)
    const data = await getSupabaseHealth(force)
    setSupabaseHealth(data)
    setSupabaseLoading(false)
  }, [])

  const loadPrimeCobrancasStatus = useCallback(async (force = false) => {
    setPrimeCobrancasLoading(true)
    const data = await getPrimeCobrancasStatus(force)
    setPrimeCobrancasStatus(data)
    setPrimeCobrancasLoading(false)
  }, [])

  useEffect(() => { loadQwenState() }, [loadQwenState])
  useEffect(() => { loadOpenRouter(false) }, [loadOpenRouter])
  useEffect(() => { loadPerplexityState() }, [loadPerplexityState])
  useEffect(() => { loadVercelStatus(false) }, [loadVercelStatus])
  useEffect(() => { loadGithubStatus(false) }, [loadGithubStatus])
  useEffect(() => { loadSupabaseHealth(false) }, [loadSupabaseHealth])
  useEffect(() => { loadPrimeCobrancasStatus(false) }, [loadPrimeCobrancasStatus])

  // POST — solicita uma verificação real; o servidor decide se ela de fato
  // acontece (trava atômica persistida). Em erro de rede, mantém o último
  // resultado exibido em vez de apagar o card.
  async function requestQwenRefresh() {
    const data = await requestQwenHealthRefresh()
    setQwenHealth(prev => data || prev)
  }

  // POST forçado — sempre chama o Perplexity de verdade (ignora o cache de 5min
  // do servidor), igual ao botão "Atualizar agora" faz com o saldo do OpenRouter.
  async function requestPerplexityRefresh() {
    const data = await requestPerplexityHealthRefresh(true)
    setPerplexityHealth(prev => data || prev)
  }

  // Fase 1: resumo/demais cards continuam mockados. "Atualizar agora" também solicita
  // uma verificação real do QwenCloud (POST), do saldo OpenRouter (força ignorar o
  // cache de 5min) e do health check do Perplexity (POST forçado) — QwenCloud pode ou
  // não resultar em chamada real, dependendo só do intervalo mínimo configurado no
  // servidor; OpenRouter e Perplexity sempre consultam de novo, pois não têm custo
  // real relevante por chamada.
  async function handleRefresh() {
    if (refreshing) return
    setRefreshing(true)
    try {
      await Promise.all([
        requestQwenRefresh(),
        loadOpenRouter(true),
        requestPerplexityRefresh(),
        loadVercelStatus(true),
        loadGithubStatus(true),
        loadSupabaseHealth(true),
        loadPrimeCobrancasStatus(true),
      ])
    } finally {
      setLastUpdated(new Date().toISOString())
      setRefreshing(false)
    }
  }

  const summaryMetrics = buildSummaryMetrics({ qwenHealth, openrouterUsage, perplexityHealth, vercelStatus, githubStatus, supabaseHealth })

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', paddingRight: 4 }}>

      {/* A. Cabeçalho */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
        flexWrap: 'wrap', background: t.bg, border: `1px solid ${t.border}`, borderRadius: 14, padding: '16px 20px',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>🛰️</span>
            <h1 style={{ fontSize: 19, fontWeight: 700, color: t.text, margin: 0 }}>Operations Center</h1>
          </div>
          <p style={{ fontSize: 12.5, color: t.textMuted, margin: '4px 0 0' }}>
            Centro de operações da sua infraestrutura e IA
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <select
            value={period}
            onChange={e => setPeriod(e.target.value)}
            style={{
              fontSize: 12.5, padding: '8px 10px', borderRadius: 8, border: `1px solid ${t.border}`,
              background: t.bgSecondary, color: t.text, cursor: 'pointer',
            }}
          >
            {PERIOD_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              fontSize: 12.5, fontWeight: 600, padding: '8px 14px', borderRadius: 8, border: 'none',
              background: t.primary || '#E8192C', color: '#fff', cursor: refreshing ? 'default' : 'pointer',
              opacity: refreshing ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {refreshing ? '⏳ Atualizando...' : '🔄 Atualizar agora'}
          </button>

          <span style={{ fontSize: 11, color: t.textMuted }}>
            Última atualização: {fmtTime(lastUpdated)}
          </span>
        </div>
      </div>

      {/* B. Resumo superior — 100% real, montado a partir dos mesmos states já
          carregados pelos cards de serviço (nenhuma chamada nova). */}
      <div style={{ border: `1px solid ${t.border}`, borderRadius: 16, padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: t.textMuted, fontWeight: 600 }}>Resumo operacional</span>
          <DataSourceBadge dataSource="real" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <SummaryCard
            icon="🟢"
            label="Serviços online"
            value={`${summaryMetrics.servicesOnline.online}/${summaryMetrics.servicesOnline.total}`}
            accent="#10B981"
          />
          <SummaryCard
            icon="🛰️"
            label="Serviços monitorados"
            value={String(summaryMetrics.servicesMonitored)}
            accent="#3B82F6"
          />
          <SummaryCard
            icon="🕒"
            label="Última verificação real"
            value={summaryMetrics.lastCheck ? fmtRelative(summaryMetrics.lastCheck) : '—'}
            accent="#7C3AED"
          />
          <SummaryCard
            icon="⚡"
            label="Latência média (health checks reais)"
            value={summaryMetrics.avgLatencyMs != null ? `${summaryMetrics.avgLatencyMs}ms` : '—'}
            accent="#F59E0B"
          />
        </div>
        {summaryMetrics.lastCheck && (
          <div style={{ fontSize: 10.5, color: t.textMuted, marginTop: 8 }}>
            Última verificação real às {fmtTime(summaryMetrics.lastCheck)}
          </div>
        )}
      </div>

      {/* C. Status dos serviços */}
      <div>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 10px' }}>
          Serviços e Integrações
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
          {servicesMock.map(s => {
            let service = s
            if (s.provider === 'QwenCloud') service = buildQwenCard(qwenHealth, qwenLoading)
            else if (s.provider === 'OpenRouter') service = buildOpenRouterCard(openrouterUsage, openrouterLoading)
            else if (s.provider === 'Perplexity') service = buildPerplexityCard(perplexityHealth, perplexityLoading)
            else if (s.provider === 'Vercel') service = buildVercelCard(vercelStatus, vercelLoading)
            else if (s.provider === 'GitHub') service = buildGithubCard(githubStatus, githubLoading)
            else if (s.provider === 'Supabase') service = buildSupabaseCard(supabaseHealth, supabaseLoading)
            else if (s.provider === 'PRIME Cobranças') service = buildPrimeCobrancasCard(primeCobrancasStatus, primeCobrancasLoading)
            return <ServiceStatusCard key={s.provider} service={service} />
          })}
        </div>
      </div>

      {/* D. Área analítica */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        <div style={{
          background: t.bg, border: `1px solid ${t.border}`, borderRadius: 14, padding: '16px 18px',
          boxShadow: '0 1px 2px rgba(16,24,40,0.03)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: t.text }}>Evolução de gastos de IA</span>
          </div>
          {/* Sem histórico real e comparável entre provedores persistido ainda (mesmo
              motivo já aplicado ao donut) — estado vazio honesto em vez de série temporal fictícia. */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 6, padding: '32px 16px', textAlign: 'center',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: t.textMuted }}>Evolução de gastos indisponível</span>
            <span style={{ fontSize: 11.5, color: t.textMuted, maxWidth: 260 }}>
              Será exibida quando houver histórico de custos real e comparável entre os provedores.
            </span>
          </div>
        </div>

        <div style={{
          background: t.bg, border: `1px solid ${t.border}`, borderRadius: 14, padding: '16px 18px',
          boxShadow: '0 1px 2px rgba(16,24,40,0.03)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: t.text }}>Distribuição por serviço</span>
          </div>
          {/* Sem histórico real e comparável entre provedores ainda (OpenRouter tem saldo/uso
              acumulado real; Qwen/Perplexity só têm custo de health check pontual; Claude não
              tem nenhum) — misturar isso resultaria em gasto fictício/incomparável. Estado vazio
              honesto até existir uma fonte comparável de verdade entre os provedores. */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 6, padding: '32px 16px', textAlign: 'center',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: t.textMuted }}>Distribuição de gastos indisponível</span>
            <span style={{ fontSize: 11.5, color: t.textMuted, maxWidth: 260 }}>
              Será exibida quando houver histórico de custos comparável entre os provedores.
            </span>
          </div>
        </div>
      </div>

      <RecentActivityPanel items={buildRecentActivityItems({ qwenHealth, openrouterUsage, perplexityHealth, vercelStatus, githubStatus, supabaseHealth })} />

      {/* E. Health Check */}
      <HealthCheckPanel {...buildHealthCheckData({ qwenHealth, openrouterUsage, perplexityHealth, vercelStatus, supabaseHealth })} />

      <div style={{ height: 4 }} />
    </div>
  )
}
