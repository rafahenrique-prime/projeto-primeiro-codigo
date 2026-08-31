// api/__tests__/visionHealthAggregate.test.js
//
// Testes puros (sem I/O, sem mock de rede) de api/_visionHealthAggregate.js
// — cobre os cenários A-K pedidos na revisão do Passo 3.

import { describe, it, expect } from 'vitest'
import {
  computeTodayStartUtc,
  computeMonthStartUtc,
  aggregateEvents,
  aggregateMonth,
  aggregateLifetime,
  aggregateMedia,
  aggregateFailures,
  shapeRecent,
  buildAlerts,
  buildStatus,
  buildVisionHealthContract,
} from '../_visionHealthAggregate.js'

function evento(overrides = {}) {
  return {
    source: 'story',
    media_type: 'image',
    ffmpeg_used: false,
    model: 'google/gemini-2.5-flash-lite',
    success: true,
    latency_ms: 1000,
    input_tokens: 100,
    output_tokens: 20,
    total_tokens: 120,
    cost_usd: 0.0001,
    cost_source: 'real',
    error_code: null,
    created_at: '2026-08-31T12:00:00.000Z',
    ...overrides,
  }
}

describe('_visionHealthAggregate — fuso horário (regra 3)', () => {
  it('computeTodayStartUtc: meio-dia UTC vira 03:00 UTC do mesmo dia local (America/Sao_Paulo = UTC-3, sem DST)', () => {
    const now = new Date('2026-08-31T15:30:00.000Z') // 12:30 em São Paulo
    const start = computeTodayStartUtc(now)
    expect(start.toISOString()).toBe('2026-08-31T03:00:00.000Z')
  })

  it('computeTodayStartUtc: madrugada UTC (ainda dia anterior em São Paulo) usa a data local correta', () => {
    const now = new Date('2026-09-01T02:00:00.000Z') // 30/08 23:00 em São Paulo
    const start = computeTodayStartUtc(now)
    expect(start.toISOString()).toBe('2026-08-31T03:00:00.000Z')
  })

  it('computeMonthStartUtc: primeiro dia do mês corrente em São Paulo, 00:00 local', () => {
    const now = new Date('2026-08-31T15:30:00.000Z')
    const start = computeMonthStartUtc(now)
    expect(start.toISOString()).toBe('2026-08-01T03:00:00.000Z')
  })
})

describe('[A] tabela vazia', () => {
  it('aggregateEvents/aggregateMonth/aggregateMedia/aggregateFailures com array vazio nunca lançam e retornam zeros', () => {
    expect(aggregateEvents([])).toEqual({
      calls: 0, success: 0, failures: 0, success_rate: 0,
      avg_latency_ms: 0, p95_latency_ms: 0,
      input_tokens: 0, output_tokens: 0, total_tokens: 0, cost_usd: 0,
    })
    expect(aggregateMonth([])).toEqual({ calls: 0, success: 0, failures: 0, success_rate: 0, total_tokens: 0, cost_usd: 0 })
    expect(aggregateLifetime([])).toEqual({ cost_usd: 0 })
    expect(aggregateMedia([])).toEqual({ images: 0, videos: 0, unknown: 0, ffmpeg_used: 0, ffmpeg_failures: 0 })
    const failures = aggregateFailures([])
    expect(Object.values(failures).every((v) => v === 0)).toBe(true)
  })

  it('buildVisionHealthContract com tudo vazio → status=no_data, alerts com info no_data', () => {
    const contract = buildVisionHealthContract({
      todayRows: [], monthRows: [], recentRows: [],
      providerHealth: { status: 'unknown', model_available: true, balance_usd: null, consumption_24h_usd: null },
      model: 'google/gemini-2.5-flash-lite',
      checkedAt: '2026-08-31T12:00:00.000Z',
    })
    expect(contract.status).toBe('no_data')
    expect(contract.today.calls).toBe(0)
    expect(contract.month.calls).toBe(0)
    expect(contract.lifetime).toEqual({ cost_usd: 0 })
    expect(contract.recent).toEqual([])
    expect(contract.alerts).toEqual([{ level: 'info', code: 'no_data', message: expect.any(String) }])
  })
})

describe('[lifetime] custo total desde o primeiro evento', () => {
  it('soma cost_usd de todos os eventos passados, ignora null, sem inventar custo', () => {
    const rows = [
      evento({ cost_usd: 0.001, cost_source: 'real' }),
      evento({ cost_usd: 0.002, cost_source: 'real' }),
      evento({ cost_usd: null, cost_source: 'unavailable' }),
    ]
    expect(aggregateLifetime(rows)).toEqual({ cost_usd: expect.closeTo(0.003, 6) })
  })

  it('tabela vazia → cost_usd 0, nunca null/erro', () => {
    expect(aggregateLifetime([])).toEqual({ cost_usd: 0 })
  })

  it('todos os eventos sem custo real (unavailable) → 0, nunca inventado', () => {
    const rows = [
      evento({ cost_usd: null, cost_source: 'unavailable' }),
      evento({ cost_usd: null, cost_source: 'unavailable' }),
    ]
    expect(aggregateLifetime(rows)).toEqual({ cost_usd: 0 })
  })

  it('buildVisionHealthContract: lifetime presente e correto, today/month não afetados por lifetimeRows diferente', () => {
    const todayRows = [evento({ cost_usd: 0.0001 })]
    const lifetimeRows = [evento({ cost_usd: 0.001 }), evento({ cost_usd: 0.002 })]
    const contract = buildVisionHealthContract({
      todayRows, monthRows: todayRows, recentRows: todayRows, lifetimeRows,
      providerHealth: { status: 'healthy', model_available: true, balance_usd: null, consumption_24h_usd: null },
      model: 'google/gemini-2.5-flash-lite',
      checkedAt: '2026-08-31T12:00:00.000Z',
    })
    expect(contract.lifetime.cost_usd).toBeCloseTo(0.003, 6)
    expect(contract.today.cost_usd).toBeCloseTo(0.0001, 6)
    // campos existentes continuam todos presentes — nada foi removido/renomeado
    expect(Object.keys(contract).sort()).toEqual(
      ['alerts', 'checked_at', 'failures', 'lifetime', 'media', 'model', 'month', 'provider', 'provider_health', 'recent', 'status', 'today'].sort(),
    )
  })

  it('buildVisionHealthContract sem lifetimeRows (compat retroativa) → lifetime.cost_usd = 0, não quebra', () => {
    const contract = buildVisionHealthContract({
      todayRows: [], monthRows: [], recentRows: [],
      providerHealth: { status: 'unknown', model_available: true, balance_usd: null, consumption_24h_usd: null },
      model: 'google/gemini-2.5-flash-lite',
      checkedAt: '2026-08-31T12:00:00.000Z',
    })
    expect(contract.lifetime).toEqual({ cost_usd: 0 })
  })
})

describe('[B] todos successes', () => {
  it('success_rate=100, failures=0, nenhum alerta de erro', () => {
    const rows = [evento(), evento(), evento()]
    const agg = aggregateEvents(rows)
    expect(agg.calls).toBe(3)
    expect(agg.success).toBe(3)
    expect(agg.failures).toBe(0)
    expect(agg.success_rate).toBe(100)
  })
})

describe('[C] mistura success/failure', () => {
  it('success_rate calculado corretamente e failures > 0', () => {
    const rows = [evento(), evento(), evento({ success: false, error_code: 'vision_error' })]
    const agg = aggregateEvents(rows)
    expect(agg.calls).toBe(3)
    expect(agg.success).toBe(2)
    expect(agg.failures).toBe(1)
    expect(agg.success_rate).toBe(66.67)
  })
})

describe('[D] p95', () => {
  it('p95 sobre 20 latências conhecidas usa nearest-rank estável', () => {
    const latencias = Array.from({ length: 20 }, (_, i) => (i + 1) * 100) // 100..2000
    const rows = latencias.map((latency_ms) => evento({ latency_ms }))
    const agg = aggregateEvents(rows)
    // ceil(0.95*20)-1 = 18 (índice 0-based) → 19º valor = 1900
    expect(agg.p95_latency_ms).toBe(1900)
  })

  it('p95 com 1 único evento é o próprio valor', () => {
    const agg = aggregateEvents([evento({ latency_ms: 777 })])
    expect(agg.p95_latency_ms).toBe(777)
  })

  it('p95 sem eventos é 0 (regra documentada — nunca null neste campo)', () => {
    expect(aggregateEvents([]).p95_latency_ms).toBe(0)
  })
})

describe('[E] media image/video/unknown', () => {
  it('conta corretamente os 3 buckets de media_type', () => {
    const rows = [
      evento({ media_type: 'image' }),
      evento({ media_type: 'image' }),
      evento({ media_type: 'video' }),
      evento({ media_type: 'unknown', success: false, error_code: 'download_error' }),
    ]
    const media = aggregateMedia(rows)
    expect(media.images).toBe(2)
    expect(media.videos).toBe(1)
    expect(media.unknown).toBe(1)
  })
})

describe('[F] ffmpeg_used / ffmpeg_error', () => {
  it('ffmpeg_used conta true, ffmpeg_failures conta error_code=ffmpeg_error', () => {
    const rows = [
      evento({ media_type: 'video', ffmpeg_used: true }),
      evento({ media_type: 'video', ffmpeg_used: true, success: false, error_code: 'ffmpeg_error' }),
      evento({ media_type: 'image', ffmpeg_used: false }),
    ]
    const media = aggregateMedia(rows)
    expect(media.ffmpeg_used).toBe(2)
    expect(media.ffmpeg_failures).toBe(1)
  })
})

describe('[G] agregação de tokens/custo', () => {
  it('soma tokens e cost_usd corretamente, ignora nulls sem quebrar', () => {
    const rows = [
      evento({ total_tokens: 100, cost_usd: 0.001, cost_source: 'real' }),
      evento({ total_tokens: 50, cost_usd: null, cost_source: 'unavailable' }),
      evento({ total_tokens: null, cost_usd: 0.002, cost_source: 'real' }),
    ]
    const agg = aggregateEvents(rows)
    expect(agg.total_tokens).toBe(150) // 100 + 50 + 0(null)
    expect(agg.cost_usd).toBeCloseTo(0.003, 6) // nunca inventa custo pro evento 'unavailable'
  })
})

describe('[H] recent limitado e ordenado', () => {
  it('shapeRecent trunca em 20 e preserva a ordem recebida (a query já ordena DESC)', () => {
    const rows = Array.from({ length: 25 }, (_, i) => evento({ created_at: `2026-08-${String(i + 1).padStart(2, '0')}T00:00:00Z` }))
    const recent = shapeRecent(rows)
    expect(recent).toHaveLength(20)
    expect(recent[0].created_at).toBe(rows[0].created_at)
  })

  it('shapeRecent nunca inclui campos fora do contrato (sem id, sem storyMediaUrl, sem descrição)', () => {
    const rows = [evento({ id: 'uuid-interno-nao-deveria-vazar', descricao_visual: 'nunca deveria existir' })]
    const recent = shapeRecent(rows)
    expect(Object.keys(recent[0]).sort()).toEqual(
      ['cost_source', 'cost_usd', 'created_at', 'error_code', 'ffmpeg_used', 'latency_ms', 'media_type', 'model', 'source', 'success', 'total_tokens'].sort(),
    )
  })
})

describe('[I] alerts', () => {
  const providerOk = { status: 'healthy', model_available: true, balance_usd: 10, consumption_24h_usd: null }

  it('provider down/model indisponível → alerta critical', () => {
    const alerts = buildAlerts({
      today: aggregateEvents([evento()]), media: aggregateMedia([evento()]), recent: [evento()],
      providerHealth: { status: 'down', model_available: false }, hasAnyData: true,
    })
    expect(alerts.some((a) => a.level === 'critical' && a.code === 'provider_unavailable')).toBe(true)
  })

  it('success_rate < 95% com >=5 chamadas → warning low_success_rate; com <5 chamadas não dispara', () => {
    const rowsPoucos = [evento(), evento({ success: false })] // 50%, só 2 chamadas
    const todayPoucos = aggregateEvents(rowsPoucos)
    const alertsPoucos = buildAlerts({ today: todayPoucos, media: aggregateMedia(rowsPoucos), recent: rowsPoucos, providerHealth: providerOk, hasAnyData: true })
    expect(alertsPoucos.some((a) => a.code === 'low_success_rate')).toBe(false)

    const rowsMuitos = [evento(), evento(), evento(), evento(), evento({ success: false })] // 80%, 5 chamadas
    const todayMuitos = aggregateEvents(rowsMuitos)
    const alertsMuitos = buildAlerts({ today: todayMuitos, media: aggregateMedia(rowsMuitos), recent: rowsMuitos, providerHealth: providerOk, hasAnyData: true })
    expect(alertsMuitos.some((a) => a.code === 'low_success_rate')).toBe(true)
  })

  it('3 falhas consecutivas recentes → warning consecutive_failures', () => {
    const recent = [evento({ success: false }), evento({ success: false }), evento({ success: false }), evento()]
    const alerts = buildAlerts({ today: aggregateEvents(recent), media: aggregateMedia(recent), recent, providerHealth: providerOk, hasAnyData: true })
    expect(alerts.some((a) => a.code === 'consecutive_failures')).toBe(true)
  })

  it('qualquer ffmpeg_error hoje → warning ffmpeg_error', () => {
    const rows = [evento({ media_type: 'video', ffmpeg_used: true, success: false, error_code: 'ffmpeg_error' })]
    const alerts = buildAlerts({ today: aggregateEvents(rows), media: aggregateMedia(rows), recent: rows, providerHealth: providerOk, hasAnyData: true })
    expect(alerts.some((a) => a.code === 'ffmpeg_error')).toBe(true)
  })

  it('sem nenhuma condição de alerta → array vazio', () => {
    const rows = [evento(), evento(), evento()]
    const alerts = buildAlerts({ today: aggregateEvents(rows), media: aggregateMedia(rows), recent: rows, providerHealth: providerOk, hasAnyData: true })
    expect(alerts).toEqual([])
  })
})

describe('status geral — precedência documentada', () => {
  it('no_data tem precedência sobre tudo', () => {
    expect(buildStatus({ hasAnyData: false, providerHealth: { status: 'down' }, alerts: [{ level: 'critical' }], today: { calls: 0, success_rate: 0 } })).toBe('no_data')
  })
  it('down tem precedência sobre degraded/healthy', () => {
    expect(buildStatus({ hasAnyData: true, providerHealth: { status: 'down' }, alerts: [], today: { calls: 10, success_rate: 100 } })).toBe('down')
  })
  it('degraded quando há alerta relevante', () => {
    expect(buildStatus({ hasAnyData: true, providerHealth: { status: 'healthy' }, alerts: [{ level: 'warning' }], today: { calls: 10, success_rate: 100 } })).toBe('degraded')
  })
  it('healthy quando nada disparou', () => {
    expect(buildStatus({ hasAnyData: true, providerHealth: { status: 'healthy' }, alerts: [], today: { calls: 10, success_rate: 100 } })).toBe('healthy')
  })
})

describe('[J] provider health indisponível', () => {
  it('contrato aceita providerHealth down/indisponível sem quebrar e reflete no status final', () => {
    const contract = buildVisionHealthContract({
      todayRows: [evento()], monthRows: [evento()], recentRows: [evento()],
      providerHealth: { status: 'down', model_available: false, balance_usd: null, consumption_24h_usd: null },
      model: 'google/gemini-2.5-flash-lite',
      checkedAt: '2026-08-31T12:00:00.000Z',
    })
    expect(contract.status).toBe('down')
    expect(contract.provider_health.model_available).toBe(false)
    expect(contract.provider_health.balance_usd).toBeNull()
  })
})

describe('[K] nenhum PII no payload', () => {
  it('mesmo se linhas brutas tivessem campos sensíveis, o contrato final nunca os inclui', () => {
    const linhaComVazamentoPotencial = evento({
      // campos que NUNCA existem de verdade na tabela, mas simulam o pior
      // cenário (defesa em profundidade do shapeRecent/agregações)
      chat_id: '5511999999999',
      telefone: '5511999999999',
      pergunta: 'quanto custa o tenis?',
      resposta: 'custa R$199',
      storyMediaUrl: 'https://gpt-files.com/segredo.jpg',
      descricao_visual: 'tênis branco nike',
    })
    const contract = buildVisionHealthContract({
      todayRows: [linhaComVazamentoPotencial],
      monthRows: [linhaComVazamentoPotencial],
      recentRows: [linhaComVazamentoPotencial],
      providerHealth: { status: 'healthy', model_available: true, balance_usd: null, consumption_24h_usd: null },
      model: 'google/gemini-2.5-flash-lite',
      checkedAt: '2026-08-31T12:00:00.000Z',
    })
    const serialized = JSON.stringify(contract)
    for (const termo of ['5511999999999', 'quanto custa', 'custa R$', 'segredo.jpg', 'tênis branco', 'chat_id', 'telefone', 'pergunta', 'resposta', 'storyMediaUrl', 'descricao_visual']) {
      expect(serialized).not.toContain(termo)
    }
  })
})
