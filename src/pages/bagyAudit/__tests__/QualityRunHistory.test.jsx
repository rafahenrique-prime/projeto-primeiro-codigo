// @vitest-environment jsdom
//
// PARTE 56 / Fase 5 — testes de QualityRunHistory.jsx: carregamento,
// loading/erro/vazio isolados, "Ver todas"/"Carregar mais", dedup, refresh
// via prop, e confirmação de que nenhuma linha sugere leitura ao vivo da
// Bagy. Mocka getQualityRunHistory (camada já homologada).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import QualityRunHistory from '../QualityRunHistory.jsx'

vi.mock('../../../services/auditoria/qualidadeCatalogoData.js', () => ({
  getQualityRunHistory: vi.fn(),
}))

import { getQualityRunHistory } from '../../../services/auditoria/qualidadeCatalogoData.js'

afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
})

const T = { bg: '#fff', border: '#eee', text: '#111', textMuted: '#999' }

function run(id, overrides = {}) {
  return {
    id, created_at: '2026-08-21T10:00:00Z', finished_at: '2026-08-21T10:05:00Z', status: 'completa',
    total_active_products: 541, products_without_findings: 504, products_with_findings: 37,
    total_findings: 56, critico_count: 16, resolvidos_automaticamente: 0,
    ...overrides,
  }
}

describe('carregamento (T, U)', () => {
  it('T) carrega via getQualityRunHistory no mount', async () => {
    getQualityRunHistory.mockResolvedValue([run('r1')])
    render(<QualityRunHistory t={T} />)
    await waitFor(() => expect(getQualityRunHistory).toHaveBeenCalledTimes(1))
    expect(getQualityRunHistory).toHaveBeenCalledWith({ limit: 20, offset: 0 })
  })

  it('U) loading renderiza texto discreto antes da resposta', async () => {
    let resolver
    getQualityRunHistory.mockReturnValue(new Promise((r) => { resolver = r }))
    render(<QualityRunHistory t={T} />)
    expect(screen.getByText('Carregando histórico de qualidade...')).toBeTruthy()
    resolver([])
    await waitFor(() => expect(screen.queryByText('Carregando histórico de qualidade...')).toBeNull())
  })
})

describe('V) erro isolado', () => {
  it('erro não quebra o componente, aparece isolado', async () => {
    getQualityRunHistory.mockRejectedValue(new Error('falha de rede'))
    render(<QualityRunHistory t={T} />)
    expect(await screen.findByText(/Não foi possível carregar o histórico de qualidade: falha de rede/)).toBeTruthy()
  })
})

describe('W) vazio', () => {
  it('mostra mensagem de vazio quando não há runs', async () => {
    getQualityRunHistory.mockResolvedValue([])
    render(<QualityRunHistory t={T} />)
    expect(await screen.findByText('Nenhuma auditoria de qualidade registrada ainda.')).toBeTruthy()
  })
})

describe('X, Y) preview de 5 + Ver todas', () => {
  it('X) mostra inicialmente só 5 registros quando há mais', async () => {
    getQualityRunHistory.mockResolvedValue(Array.from({ length: 7 }, (_, i) => run(`r${i}`, { created_at: `2026-08-2${i}T10:00:00Z` })))
    render(<QualityRunHistory t={T} />)
    await waitFor(() => expect(getQualityRunHistory).toHaveBeenCalled())
    expect(await screen.findByText('Ver todas (7)')).toBeTruthy()
  })

  it('Y) "Ver todas" mostra os 7 registros já carregados', async () => {
    getQualityRunHistory.mockResolvedValue(Array.from({ length: 7 }, (_, i) => run(`r${i}`)))
    render(<QualityRunHistory t={T} />)
    fireEvent.click(await screen.findByText('Ver todas (7)'))
    expect(screen.getByText('Mostrar menos')).toBeTruthy()
  })

  it('não mostra "Ver todas" quando há 5 ou menos registros', async () => {
    getQualityRunHistory.mockResolvedValue([run('r1'), run('r2')])
    render(<QualityRunHistory t={T} />)
    await waitFor(() => expect(getQualityRunHistory).toHaveBeenCalled())
    expect(await screen.findAllByText('completa')).toHaveLength(2)
    expect(screen.queryByText(/Ver todas/)).toBeNull()
  })
})

describe('Z, AA) Carregar mais', () => {
  it('Z) "Carregar mais" aparece só depois de "Ver todas" quando a página veio cheia (20)', async () => {
    getQualityRunHistory.mockResolvedValue(Array.from({ length: 20 }, (_, i) => run(`r${i}`)))
    render(<QualityRunHistory t={T} />)
    fireEvent.click(await screen.findByText('Ver todas (20)'))
    expect(await screen.findByRole('button', { name: 'Carregar mais' })).toBeTruthy()
  })

  it('AA) "Carregar mais" concatena a próxima página sem duplicar por id', async () => {
    getQualityRunHistory.mockResolvedValueOnce(Array.from({ length: 20 }, (_, i) => run(`p${i}`)))
    render(<QualityRunHistory t={T} />)
    fireEvent.click(await screen.findByText('Ver todas (20)'))

    // 2ª página reintroduz "p0" (cenário defensivo) + 1 item novo
    getQualityRunHistory.mockResolvedValueOnce([run('p0'), run('novoUnico')])
    fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }))
    await waitFor(() => expect(getQualityRunHistory).toHaveBeenCalledWith({ limit: 20, offset: 20 }))

    // já em "mostrar todos" (clicado antes) — confirma 21 linhas únicas (20 + 1 novo, p0 não duplicou)
    await waitFor(() => expect(screen.getAllByText('completa').length).toBe(21))
  })

  it('não mostra "Carregar mais" quando a última página veio incompleta', async () => {
    getQualityRunHistory.mockResolvedValue(Array.from({ length: 3 }, (_, i) => run(`r${i}`)))
    render(<QualityRunHistory t={T} />)
    await waitFor(() => expect(screen.getAllByText('completa').length).toBe(3))
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull()
  })
})

describe('AB, AC) separação do histórico de sync', () => {
  it('AB, AC) o componente só renderiza a seção "Auditorias de qualidade" — nunca menciona execuções de sync', async () => {
    getQualityRunHistory.mockResolvedValue([run('r1')])
    render(<QualityRunHistory t={T} />)
    expect(await screen.findByText('Auditorias de qualidade')).toBeTruthy()
    expect(screen.queryByText(/Execuções de sincronização/)).toBeNull()
    expect(screen.queryByText(/DRY RUN|WRITE/)).toBeNull()
  })
})

describe('AD) campos exibidos batem com o contrato real', () => {
  it('mostra data, status, analisados, com achados, findings, críticos e resolvidos quando presentes', async () => {
    getQualityRunHistory.mockResolvedValue([run('r1', {
      total_active_products: 541, products_with_findings: 37, total_findings: 56, critico_count: 16, resolvidos_automaticamente: 3,
    })])
    render(<QualityRunHistory t={T} />)
    expect(await screen.findByText('completa')).toBeTruthy()
    expect(screen.getByText('541 analisados')).toBeTruthy()
    expect(screen.getByText('37 com achados')).toBeTruthy()
    expect(screen.getByText('56 findings')).toBeTruthy()
    expect(screen.getByText('16 críticos')).toBeTruthy()
    expect(screen.getByText('3 resolvidos')).toBeTruthy()
  })

  it('não inventa campo ausente — omite silenciosamente em vez de mostrar 0/—', async () => {
    getQualityRunHistory.mockResolvedValue([run('r1', { critico_count: null, resolvidos_automaticamente: null })])
    render(<QualityRunHistory t={T} />)
    await screen.findByText('completa')
    expect(screen.queryByText(/críticos/)).toBeNull()
    expect(screen.queryByText(/resolvidos/)).toBeNull()
  })
})

describe('AE) nenhuma linha sugere leitura ao vivo da Bagy', () => {
  it('texto renderizado nunca menciona "Bagy" (só Shadow/Catálogo V2, via contrato real)', async () => {
    getQualityRunHistory.mockResolvedValue([run('r1')])
    render(<QualityRunHistory t={T} />)
    await screen.findByText('completa')
    expect(document.body.textContent).not.toMatch(/Bagy/i)
  })
})

describe('refresh via refreshSignal (Fase 5)', () => {
  it('não recarrega no mount por causa do refreshSignal inicial (só 1 chamada)', async () => {
    getQualityRunHistory.mockResolvedValue([run('r1')])
    render(<QualityRunHistory t={T} refreshSignal={0} />)
    await waitFor(() => expect(getQualityRunHistory).toHaveBeenCalledTimes(1))
  })

  it('recarrega do zero quando refreshSignal muda', async () => {
    getQualityRunHistory.mockResolvedValue([run('r1')])
    const { rerender } = render(<QualityRunHistory t={T} refreshSignal={0} />)
    await waitFor(() => expect(getQualityRunHistory).toHaveBeenCalledTimes(1))

    getQualityRunHistory.mockResolvedValue([run('r-nova'), run('r1')])
    rerender(<QualityRunHistory t={T} refreshSignal={1} />)
    await waitFor(() => expect(getQualityRunHistory).toHaveBeenCalledTimes(2))
    expect(getQualityRunHistory).toHaveBeenLastCalledWith({ limit: 20, offset: 0 })
  })
})
