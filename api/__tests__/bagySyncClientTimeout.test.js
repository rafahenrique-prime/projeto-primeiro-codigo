import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchBagyProductByLink } from '../_bagySyncClient.js'

/**
 * api/__tests__/bagySyncClientTimeout.test.js
 *
 * Correção do timeout do "Verificar agora" (Auditoria Bagy V2) — timeout
 * individual em fetchBagyProductByLink (AbortController, 12s). Arquivo
 * dedicado (em vez de estender bagySyncClientRobustez.test.js) porque essa
 * suíte de robustez de listagem não existe nesta base (origin/main) — só no
 * worktree de trabalho, como parte de mudanças não relacionadas a esta
 * correção. Escopo aqui é só fetchBagyProductByLink.
 */

describe('fetchBagyProductByLink — timeout individual (TESTE G)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('TESTE G — request que nunca responde é abortada após o timeout e vira erro de rede (httpStatus:null)', async () => {
    vi.useFakeTimers()
    global.fetch = vi.fn((url, { signal } = {}) => {
      return new Promise((resolve, reject) => {
        signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted')
          err.name = 'AbortError'
          reject(err)
        })
        // nunca resolve por conta própria — só via abort
      })
    })

    const promise = fetchBagyProductByLink('/produto-lento')
    await vi.advanceTimersByTimeAsync(12000)
    const r = await promise

    expect(r.ok).toBe(false)
    expect(r.httpStatus).toBeNull()
    expect(r.reason).toMatch(/timeout/)
  })

  it('clearTimeout roda no caminho de sucesso — timer não segue pendente após resposta rápida', async () => {
    vi.useFakeTimers()
    global.fetch = vi.fn(() =>
      Promise.resolve({
        status: 200,
        text: () => Promise.resolve('sem marcador dooca aqui'),
      })
    )
    const r = await fetchBagyProductByLink('/produto-rapido')
    expect(r.ok).toBe(false) // sem marker "product: {" — falha de conteúdo, não de rede
    expect(r.httpStatus).toBe(200)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('clearTimeout roda quando res.text() rejeita (erro de leitura do body)', async () => {
    vi.useFakeTimers()
    global.fetch = vi.fn(() =>
      Promise.resolve({
        status: 200,
        text: () => Promise.reject(new Error('body stream error')),
      })
    )
    const r = await fetchBagyProductByLink('/produto-body-quebrado')
    expect(r.ok).toBe(false)
    expect(r.httpStatus).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })
})
