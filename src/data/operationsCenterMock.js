// Fonte única de dados mockados do Operations Center (Fase 1 — somente demonstração).
// Nenhum valor aqui vem de API real. Ver docs/CLAUDE.md sobre limitações confirmadas na auditoria:
// Supabase (storage/database/bandwidth), Vercel Hobby (bandwidth/functions/builds), Qwen (saldo),
// Claude (uso do plano) e Perplexity (saldo agregado) não têm API oficial pra essas métricas —
// por isso aparecem aqui como "mock" ou como estado operacional honesto (conectado/última verificação),
// nunca como números de billing reais.

// Forma normalizada que os componentes de apresentação consomem — nenhum componente visual
// conhece detalhes específicos de OpenRouter/Vercel/Supabase/etc, só este formato:
// { provider, status, metrics, lastUpdated, dataSource, message, trend }

export const PERIOD_OPTIONS = [
  { id: '24h', label: 'Últimas 24h' },
  { id: '7d', label: 'Últimos 7 dias' },
  { id: '30d', label: 'Últimos 30 dias' },
]

// Resumo superior (Summary Cards) — removido. Os 4 cards agora são 100% reais,
// montados em OperationsCenterPage.jsx (buildSummaryMetrics) a partir dos mesmos
// states já carregados pelos cards de serviço — nenhum valor de billing/tokens/
// requests agregado inventado.

// Estados possíveis de um card de serviço: 'online' | 'atencao' | 'offline' | 'indisponivel'
// dataSource possíveis: 'real' | 'mock' | 'manual'
export const servicesMock = [
  {
    provider: 'OpenRouter',
    status: 'online',
    dataSource: 'mock',
    message: 'Mock — aguardando integração (Fase 2)',
    metrics: [
      { label: 'Gasto', value: 'US$ 8,73', trend: 14.2 },
      { label: 'Requests', value: '1.923', trend: 10.8 },
      { label: 'Tokens', value: '3,47M', trend: null },
    ],
    lastUpdated: new Date().toISOString(),
  },
  {
    provider: 'Claude (Anthropic)',
    status: 'indisponivel',
    dataSource: 'manual',
    message: 'Plano Claude Pro não disponibiliza métricas por API.',
    metrics: [
      { label: 'Status', value: 'Indisponível via API' },
    ],
    lastUpdated: new Date().toISOString(),
  },
  {
    provider: 'Perplexity',
    status: 'atencao',
    dataSource: 'mock',
    message: 'Mock — saldo agregado exige plano Enterprise',
    metrics: [
      { label: 'Saldo', value: 'US$ 4,81', trend: null },
      { label: 'Gasto (7d)', value: 'US$ 0,19', trend: -22.1 },
      { label: 'Requests', value: '45', trend: null },
    ],
    lastUpdated: new Date().toISOString(),
  },
  {
    provider: 'QwenCloud',
    status: 'indisponivel',
    dataSource: 'mock',
    message: 'Mock — DashScope não expõe API pública de quota',
    metrics: [
      { label: 'Tokens usados', value: '72,3K', trend: null },
      { label: 'Requests', value: '5', trend: null },
      { label: 'Latência média', value: '4.6s', trend: null },
    ],
    lastUpdated: new Date().toISOString(),
  },
  {
    provider: 'Supabase',
    status: 'online',
    dataSource: 'manual',
    message: 'Estado operacional — não é métrica de billing',
    metrics: [
      { label: 'Conexão', value: 'Conectado' },
      { label: 'Realtime', value: 'Ativo' },
      { label: 'Última verificação', value: 'há 2 min' },
    ],
    lastUpdated: new Date().toISOString(),
  },
  {
    provider: 'Vercel',
    status: 'online',
    dataSource: 'manual',
    message: 'Estado operacional — plano Hobby não expõe billing via API',
    metrics: [
      { label: 'Último deploy', value: 'main · há 3h' },
      { label: 'Ambiente', value: 'Production' },
      { label: 'Status', value: 'Ready' },
    ],
    lastUpdated: new Date().toISOString(),
  },
  {
    // Substituído por dado real (Fase A) em OperationsCenterPage.jsx — só o
    // provider/ordem no grid vem daqui, o conteúdo é sempre sobrescrito por
    // buildPrimeCobrancasCard.
    provider: 'PRIME Cobranças',
    status: 'verificando',
    dataSource: 'loading',
    message: 'Verificando PRIME Cobranças...',
    metrics: [],
    lastUpdated: new Date().toISOString(),
  },
  {
    provider: 'GitHub',
    status: 'online',
    dataSource: 'manual',
    message: 'Estado operacional — repositório',
    metrics: [
      { label: 'Branch', value: 'main' },
      { label: 'Último commit', value: 'há 4h' },
      { label: 'Última atualização', value: 'hoje' },
    ],
    lastUpdated: new Date().toISOString(),
  },
]

// Evolução de gastos de IA (série temporal) — removida (ver OperationsCenterPage.jsx).
// Mesmo motivo do donut: não existe histórico de custos real e comparável
// persistido entre os provedores. Estado vazio honesto até existir.

// Distribuição de gasto por serviço — removida (ver OperationsCenterPage.jsx).
// Não existe hoje histórico de custos real e comparável entre os provedores:
// OpenRouter tem saldo/uso acumulado real, Qwen/Perplexity só têm custo de
// health check pontual, Claude não tem nenhum — misturar isso resultaria em
// gasto fictício/incomparável. O card mostra um estado vazio honesto em vez
// de reintroduzir valores simulados.

// Atividade recente e Health Check — removidos (Fase 2, ver OperationsCenterPage.jsx:
// buildRecentActivityItems/buildHealthCheckData). Ambos agora são montados só a
// partir dos states reais já carregados na página (OpenRouter/Qwen/Perplexity/
// Vercel/GitHub/Supabase) — sem nenhum evento, status ou uptime inventado.
