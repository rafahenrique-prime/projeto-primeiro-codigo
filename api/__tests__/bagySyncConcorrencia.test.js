import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * api/__tests__/bagySyncConcorrencia.test.js
 *
 * Correção do timeout do "Verificar agora" (Auditoria Bagy V2) — ver plano
 * de 2026-09-02. Cobre:
 *   - processWithConcurrency isolado (helper puro, sem Bagy/Supabase real).
 *   - syncBatch: dry_run usa concorrência controlada (nunca excede o limite),
 *     write permanece estritamente sequencial (concorrência máxima = 1),
 *     ordem de `results` preservada nos dois modes, erro de 1 item nunca
 *     derruba os demais, dry_run nunca chama syncProductTransactional, e o
 *     resumo final continua correto.
 *
 * _bagySyncClient.js e _bagySyncSupabase.js são mockados de propósito — o
 * objetivo aqui é provar orquestração/concorrência, não regra de negócio
 * (essa já tem suíte própria em bagySyncMapper.test.js /
 * bagySyncClientRobustez.test.js).
 */

function baseBagyProduct(id) {
  return { id, name: `Produto ${id}`, url: `/produto-${id}`, price: 100 + id }
}

describe('processWithConcurrency — helper puro', () => {
  let processWithConcurrency

  beforeEach(async () => {
    vi.resetModules()
    ;({ processWithConcurrency } = await import('../_bagySyncService.js'))
  })

  it('TESTE B — nunca excede o limite de workers simultâneos', async () => {
    const items = Array.from({ length: 10 }, (_, i) => i)
    let emVoo = 0
    let maxEmVoo = 0

    const worker = async (item) => {
      emVoo++
      maxEmVoo = Math.max(maxEmVoo, emVoo)
      await new Promise((r) => setTimeout(r, 5))
      emVoo--
      return item * 2
    }

    const results = await processWithConcurrency(items, 3, worker)
    expect(maxEmVoo).toBeLessThanOrEqual(3)
    expect(results).toEqual(items.map((i) => i * 2))
  })

  it('TESTE D — ordem final de results é previsível (índice, não ordem de chegada)', async () => {
    const items = [50, 10, 30, 5, 40]
    // item com valor maior "demora mais" — se a ordem dependesse de chegada,
    // o resultado ficaria embaralhado.
    const worker = async (item) => {
      await new Promise((r) => setTimeout(r, item))
      return item
    }
    const results = await processWithConcurrency(items, 3, worker)
    expect(results).toEqual(items)
  })

  it('limit maior que items.length não quebra (usa no máximo items.length workers)', async () => {
    const items = [1, 2]
    const results = await processWithConcurrency(items, 10, async (i) => i)
    expect(results).toEqual([1, 2])
  })
})

describe('syncBatch — dry_run concorrente vs write sequencial', () => {
  let syncBatch
  let syncProductTransactionalMock
  let fetchBagyProductByLinkMock

  beforeEach(async () => {
    vi.resetModules()
    vi.restoreAllMocks()

    fetchBagyProductByLinkMock = vi.fn()
    syncProductTransactionalMock = vi.fn(async () => ({ product_id: 'uuid-fake', variations_processed: 0 }))

    vi.doMock('../_bagySyncClient.js', () => ({
      fetchBagyProductByLink: fetchBagyProductByLinkMock,
    }))

    vi.doMock('../_bagySyncSupabase.js', () => ({
      getProductRowsByLink: vi.fn(async () => []), // NOT_FOUND — sem produto existente, sem tocar em variações
      getProductByBagyId: vi.fn(async () => null),
      getVariationsByProductId: vi.fn(async () => []),
      syncProductTransactional: syncProductTransactionalMock,
      insertSyncRun: vi.fn(async () => ({ id: 'run-fake' })),
      getExceptionByLinkTipo: vi.fn(async () => null),
      insertException: vi.fn(async () => ({})),
      touchException: vi.fn(async () => ({})),
    }))
    ;({ syncBatch } = await import('../_bagySyncService.js'))
  })

  afterEach(() => {
    vi.doUnmock('../_bagySyncClient.js')
    vi.doUnmock('../_bagySyncSupabase.js')
  })

  function instrumentarFetchComConcorrencia({ delayMs = 15 } = {}) {
    let emVoo = 0
    let maxEmVoo = 0
    fetchBagyProductByLinkMock.mockImplementation(async (link) => {
      emVoo++
      maxEmVoo = Math.max(maxEmVoo, emVoo)
      await new Promise((r) => setTimeout(r, delayMs))
      emVoo--
      const id = Number(link.match(/\d+/)?.[0] ?? 0)
      return { ok: true, url: link, httpStatus: 200, httpMs: delayMs, product: baseBagyProduct(id) }
    })
    return () => maxEmVoo
  }

  it('TESTE A — dry_run usa concorrência controlada (mais de 1 em voo ao mesmo tempo)', async () => {
    const getMax = instrumentarFetchComConcorrencia()
    const items = Array.from({ length: 8 }, (_, i) => ({ link: `/produto-${i}` }))

    await syncBatch(items, { mode: 'dry_run', runId: 'teste-dry-a' })

    expect(getMax()).toBeGreaterThan(1)
    expect(getMax()).toBeLessThanOrEqual(4) // DRY_RUN_CONCURRENCY aprovado nesta etapa
  })

  it('TESTE C — write permanece estritamente sequencial (nunca mais de 1 em voo)', async () => {
    const getMax = instrumentarFetchComConcorrencia()
    const items = Array.from({ length: 6 }, (_, i) => ({ link: `/produto-${i}` }))

    await syncBatch(items, { mode: 'write', runId: 'teste-write-c' })

    expect(getMax()).toBe(1)
  })

  it('TESTE D — ordem de results é a ordem de items, em dry_run (concorrente) e em write', async () => {
    // delay decrescente por índice — se a ordem dependesse de chegada em
    // dry_run, o item mais rápido (índice maior) apareceria primeiro.
    fetchBagyProductByLinkMock.mockImplementation(async (link) => {
      const id = Number(link.match(/\d+/)?.[0] ?? 0)
      await new Promise((r) => setTimeout(r, (5 - id) * 5))
      return { ok: true, url: link, httpStatus: 200, httpMs: 1, product: baseBagyProduct(id) }
    })
    const items = [0, 1, 2, 3, 4].map((i) => ({ link: `/produto-${i}` }))

    const dry = await syncBatch(items, { mode: 'dry_run', runId: 'teste-dry-d' })
    expect(dry.results.map((r) => r.bagyProductId)).toEqual([0, 1, 2, 3, 4])

    fetchBagyProductByLinkMock.mockClear()
    const write = await syncBatch(items, { mode: 'write', runId: 'teste-write-d' })
    expect(write.results.map((r) => r.bagyProductId)).toEqual([0, 1, 2, 3, 4])
  })

  it('TESTE E — erro inesperado em 1 item não cancela os demais (isolamento por item)', async () => {
    fetchBagyProductByLinkMock.mockImplementation(async (link) => {
      if (link.includes('produto-2')) throw new Error('erro totalmente inesperado')
      const id = Number(link.match(/\d+/)?.[0] ?? 0)
      return { ok: true, url: link, httpStatus: 200, httpMs: 1, product: baseBagyProduct(id) }
    })
    const items = [0, 1, 2, 3, 4].map((i) => ({ link: `/produto-${i}` }))

    const { results, resumo } = await syncBatch(items, { mode: 'dry_run', runId: 'teste-dry-e' })

    expect(results.length).toBe(5)
    expect(results[2].ok).toBe(false)
    expect(results[2].erro).toMatch(/erro totalmente inesperado/)
    expect(resumo.ok).toBe(4)
    expect(resumo.comErro).toBe(1)
  })

  it('TESTE K — dry_run nunca chama syncProductTransactional', async () => {
    instrumentarFetchComConcorrencia({ delayMs: 1 })
    const items = Array.from({ length: 5 }, (_, i) => ({ link: `/produto-${i}` }))

    await syncBatch(items, { mode: 'dry_run', runId: 'teste-dry-k' })

    expect(syncProductTransactionalMock).not.toHaveBeenCalled()
  })

  it('TESTE F — erro_rede (httpStatus:null) é retentado, mesmo sob concorrência', async () => {
    let chamadas = 0
    fetchBagyProductByLinkMock.mockImplementation(async (link) => {
      chamadas++
      if (chamadas <= 2) {
        return { ok: false, url: link, httpStatus: null, httpMs: 1, reason: 'fetch falhou: timeout' }
      }
      return { ok: true, url: link, httpStatus: 200, httpMs: 1, product: baseBagyProduct(1) }
    })

    const { results, resumo } = await syncBatch([{ link: '/produto-1' }], {
      mode: 'dry_run',
      runId: 'teste-dry-f',
    })

    expect(chamadas).toBe(3) // tentativa original + 2 retries (RETRY_DELAYS_MS)
    expect(resumo.retriesExecutados).toBe(2)
    expect(results[0].ok).toBe(true)
  }, 15000)

  it('TESTE H — 404 nunca é retentado', async () => {
    fetchBagyProductByLinkMock.mockImplementation(async (link) => ({
      ok: false,
      url: link,
      httpStatus: 404,
      httpMs: 1,
      reason: 'HTTP 404',
    }))

    const { resumo } = await syncBatch([{ link: '/produto-sumiu' }], { mode: 'dry_run', runId: 'teste-dry-h' })

    expect(fetchBagyProductByLinkMock).toHaveBeenCalledTimes(1)
    expect(resumo.retriesExecutados).toBe(0)
    expect(resumo.naoEncontradosNaBagy).toBe(1)
  })

  it('TESTE I — pagina_invalida (200 sem product) nunca é retentada', async () => {
    fetchBagyProductByLinkMock.mockImplementation(async (link) => ({
      ok: false,
      url: link,
      httpStatus: 200,
      httpMs: 1,
      reason: 'marker "product: {" não encontrado',
    }))

    const { resumo } = await syncBatch([{ link: '/produto-quebrado' }], { mode: 'dry_run', runId: 'teste-dry-i' })

    expect(fetchBagyProductByLinkMock).toHaveBeenCalledTimes(1)
    expect(resumo.retriesExecutados).toBe(0)
    expect(resumo.paginaInvalida).toBe(1)
  })

  it('TESTE J — duplicate_conflict nunca é retentado', async () => {
    fetchBagyProductByLinkMock.mockImplementation(async (link) => ({
      ok: true,
      url: link,
      httpStatus: 200,
      httpMs: 1,
      product: baseBagyProduct(1),
    }))
    const { getProductRowsByLink } = await import('../_bagySyncSupabase.js')
    getProductRowsByLink.mockResolvedValueOnce([
      { id: 'row-a', bagy_product_id: 999, source: 'manual' },
      { id: 'row-b', bagy_product_id: 998, source: 'manual' },
    ])

    const { resumo } = await syncBatch([{ link: '/produto-duplicado' }], { mode: 'dry_run', runId: 'teste-dry-j' })

    expect(fetchBagyProductByLinkMock).toHaveBeenCalledTimes(1)
    expect(resumo.retriesExecutados).toBe(0)
    expect(resumo.duplicateConflicts).toBe(1)
  })

  it('TESTE L — resumo final continua correto após concorrência (bate com sequencial write)', async () => {
    fetchBagyProductByLinkMock.mockImplementation(async (link) => {
      const id = Number(link.match(/\d+/)?.[0] ?? 0)
      return { ok: true, url: link, httpStatus: 200, httpMs: 1, product: baseBagyProduct(id) }
    })
    const items = Array.from({ length: 7 }, (_, i) => ({ link: `/produto-${i}` }))

    const dry = await syncBatch(items, { mode: 'dry_run', runId: 'teste-dry-l' })
    fetchBagyProductByLinkMock.mockClear()
    const write = await syncBatch(items, { mode: 'write', runId: 'teste-write-l' })

    expect(dry.resumo.total).toBe(7)
    expect(dry.resumo.comErro).toBe(0)
    expect(dry.resumo.total).toBe(write.resumo.total)
    expect(dry.resumo.ok).toBe(write.resumo.ok)
    expect(dry.resumo.comErro).toBe(write.resumo.comErro)
  })
})
