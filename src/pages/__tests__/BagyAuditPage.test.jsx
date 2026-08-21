// @vitest-environment jsdom
//
// Testes do shell de abas da PARTE 56 / Fase 2 — cobre só roteamento visual
// (aba padrão, troca de aba, presença dos botões/blocos preservados),
// mockando as duas camadas de dados (auditoriaV2Data.js e
// qualidadeCatalogoData.js — nenhuma delas é tocada nesta fase, só
// consumida). Primeiro teste de componente React deste projeto — usa
// @testing-library/react + jsdom, escopado só a este arquivo via o comentário
// `@vitest-environment jsdom` acima (não altera o ambiente node padrão do
// resto da suíte).

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import BagyAuditPage from '../BagyAuditPage.jsx'

// Sem `globals: true` no vitest deste projeto, a limpeza automática entre
// testes do @testing-library/react não se registra sozinha — precisa deste
// afterEach explícito (senão o 2º teste em diante encontra elementos
// duplicados do render anterior ainda no DOM).
afterEach(cleanup)

vi.mock('../../services/auditoria/auditoriaV2Data.js', () => ({
  loadAuditoriaV2Dashboard: vi.fn(),
  getAuditRuns: vi.fn(),
  getExceptions: vi.fn(),
  getProductsIndex: vi.fn(),
  ignoreException: vi.fn(),
  reactivateException: vi.fn(),
  derivarStatusGeral: vi.fn(() => ({ status: 'operacional', label: 'Operacional' })),
  runBagySyncViaUI: vi.fn(),
}))

vi.mock('../../services/auditoria/qualidadeCatalogoData.js', () => ({
  getQualitySummary: vi.fn(),
  getQualityFindings: vi.fn(),
  setFindingStatus: vi.fn(),
  runQualityAudit: vi.fn(),
  getQualityRunHistory: vi.fn(),
}))

import {
  loadAuditoriaV2Dashboard,
  getAuditRuns,
  getExceptions,
  getProductsIndex,
} from '../../services/auditoria/auditoriaV2Data.js'
import { getQualitySummary, getQualityFindings, setFindingStatus, runQualityAudit, getQualityRunHistory } from '../../services/auditoria/qualidadeCatalogoData.js'

const DASHBOARD_FAKE = {
  productCounts: { total: 541, sincronizados: 500, manuais: 41 },
  exceptionCounts: { total: 3, porStatus: { aberto: 2, ignorado: 1, resolvido: 0 }, porTipo: { '404': 2, duplicate_conflict: 0, pagina_invalida: 1 } },
  latestRun: { run_id: 'run-1', mode: 'dry_run', trigger: 'manual', started_at: '2026-08-20T10:00:00Z', finished_at: '2026-08-20T10:05:00Z', status_final: 'sucesso', total_analisado: 541 },
  statusGeral: { status: 'operacional', label: 'Operacional' },
}

const RUNS_FAKE = [
  { run_id: 'run-1', mode: 'dry_run', trigger: 'manual', started_at: '2026-08-20T10:00:00Z', finished_at: '2026-08-20T10:05:00Z', status_final: 'sucesso', total_analisado: 541, duration_ms: 5000 },
]

const EXCEPTIONS_FAKE = [
  { id: 'exc-1', link: 'https://loja/produto-x', tipo: '404', detalhe: null, primeira_deteccao: '2026-08-19T10:00:00Z', ultima_deteccao: '2026-08-20T10:00:00Z', status: 'aberto', run_id_ultima_deteccao: 'run-1' },
]

function mockDadosPadrao() {
  loadAuditoriaV2Dashboard.mockResolvedValue(DASHBOARD_FAKE)
  getAuditRuns.mockResolvedValue(RUNS_FAKE)
  getExceptions.mockResolvedValue(EXCEPTIONS_FAKE)
  getProductsIndex.mockResolvedValue({ byLink: new Map(), byId: new Map() })
  getQualitySummary.mockResolvedValue({
    id: 'quality-run-1', status: 'completa', finished_at: '2026-08-20T11:00:00Z',
    total_active_products: 541, products_without_findings: 504, products_with_findings: 37, critico_count: 16,
  })
  getQualityFindings.mockResolvedValue([])
  getQualityRunHistory.mockResolvedValue([])
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDadosPadrao()
})

describe('BagyAuditPage — shell de abas (PARTE 56 / Fase 2)', () => {
  it('A) aba padrão é Visão Geral', async () => {
    render(<BagyAuditPage />)
    await waitFor(() => expect(getQualitySummary).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Visão Geral' })).toBeTruthy()
    // Card de qualidade (Visão Geral) visível por padrão
    await waitFor(() => expect(screen.getByText('Qualidade do catálogo')).toBeTruthy())
  })

  it('B) troca para a aba Qualidade do Catálogo mostra a fila real de findings (PARTE 56 / Fase 3)', async () => {
    render(<BagyAuditPage />)
    await waitFor(() => expect(getQualitySummary).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: 'Qualidade do Catálogo' }))
    await waitFor(() => expect(getQualityFindings).toHaveBeenCalled())
    expect(await screen.findByText('🎉 Nenhum problema de qualidade em aberto.')).toBeTruthy()
    // Filtros de classe/severidade da nova fila estão presentes
    expect(screen.getByRole('button', { name: 'CRÍTICO' })).toBeTruthy()
  })

  it('C) troca para a aba Exceções de Sincronização mostra a fila preservada', async () => {
    render(<BagyAuditPage />)
    await waitFor(() => expect(getExceptions).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: 'Exceções de Sincronização' }))
    expect(await screen.findByText('Pendências de sincronização')).toBeTruthy()
    expect(await screen.findByText('https://loja/produto-x')).toBeTruthy()
  })

  it('D) troca para a aba Histórico mostra o histórico de sync preservado', async () => {
    render(<BagyAuditPage />)
    await waitFor(() => expect(getAuditRuns).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: 'Histórico' }))
    expect(await screen.findByText('Execuções de sincronização')).toBeTruthy()
  })

  it('E) botão "Verificar agora" continua presente em todas as abas', async () => {
    render(<BagyAuditPage />)
    expect(screen.getByRole('button', { name: 'Verificar agora' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Qualidade do Catálogo' }))
    expect(screen.getByRole('button', { name: 'Verificar agora' })).toBeTruthy()
  })

  it('F) botão "Sincronizar agora" continua presente em todas as abas', async () => {
    render(<BagyAuditPage />)
    expect(screen.getByRole('button', { name: 'Sincronizar agora' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Histórico' }))
    expect(screen.getByRole('button', { name: 'Sincronizar agora' })).toBeTruthy()
  })

  it('G) fluxo antigo de exceções (Ignorar) continua renderizando na nova aba', async () => {
    render(<BagyAuditPage />)
    await waitFor(() => expect(getExceptions).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Exceções de Sincronização' }))
    expect(await screen.findByRole('button', { name: 'Ignorar' })).toBeTruthy()
  })

  it('H) histórico de sync continua renderizando com os dados reais da run', async () => {
    render(<BagyAuditPage />)
    await waitFor(() => expect(getAuditRuns).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Histórico' }))
    expect(await screen.findByText('sucesso')).toBeTruthy()
  })

  it('I) botão "Auditar Qualidade" abre o modal de senha, mas não executa nada até confirmar (Fase 5)', async () => {
    render(<BagyAuditPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Auditar Qualidade' }))
    expect(await screen.findByText('Executa o motor de qualidade sobre o Shadow/Catálogo V2 atual (nunca lê a Bagy ao vivo) e grava o resultado no histórico.')).toBeTruthy()
    expect(runQualityAudit).not.toHaveBeenCalled()
    const { runBagySyncViaUI } = await import('../../services/auditoria/auditoriaV2Data.js')
    expect(runBagySyncViaUI).not.toHaveBeenCalled()
  })

  it('J) getQualitySummary (Visão Geral) é chamado só 1x no mount, independente da navegação nas outras abas', async () => {
    render(<BagyAuditPage />)
    await waitFor(() => expect(getQualitySummary).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Exceções de Sincronização' }))
    fireEvent.click(screen.getByRole('button', { name: 'Histórico' }))
    fireEvent.click(screen.getByRole('button', { name: 'Visão Geral' }))
    expect(getQualitySummary).toHaveBeenCalledTimes(1)
  })

  it('AD) abas antigas (Visão Geral/Exceções/Histórico) continuam funcionando depois de abrir a aba Qualidade', async () => {
    render(<BagyAuditPage />)
    await waitFor(() => expect(getExceptions).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: 'Qualidade do Catálogo' }))
    await waitFor(() => expect(getQualityFindings).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: 'Exceções de Sincronização' }))
    expect(await screen.findByText('https://loja/produto-x')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Histórico' }))
    expect(await screen.findByText('Execuções de sincronização')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Visão Geral' }))
    expect(await screen.findByText('Qualidade do catálogo')).toBeTruthy()
  })

  it('U-Z) Ignorar um finding na aba Qualidade não afeta sync/exceções/histórico (Fase 4)', async () => {
    getQualityFindings.mockResolvedValue([{
      id: 'find-1', bagy_product_id: 555, tipo: 'marca_ausente', classe: 'FATO', severidade: 'REVISAR',
      mensagem: 'Marca ausente', encontrado: null, por_que: 'x', o_que_conferir: 'y',
      content_synced_at: null, status: 'aberto',
      shadow_products: { nome: 'Produto Findable', ativo: true, last_seen_at: null, content_synced_at: null },
    }])
    setFindingStatus.mockResolvedValue({ id: 'find-1', status: 'ignorado' })

    render(<BagyAuditPage />)
    await waitFor(() => expect(getExceptions).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: 'Qualidade do Catálogo' }))
    await screen.findByText('Produto Findable')

    fireEvent.click(screen.getByRole('button', { name: 'Ignorar' }))
    fireEvent.change(screen.getByPlaceholderText('Senha de ação'), { target: { value: 'senha123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(setFindingStatus).toHaveBeenCalledWith('find-1', 'ignorado', 'senha123'))
    await waitFor(() => expect(screen.queryByText('Produto Findable')).toBeNull())

    // V) Exceções de Sincronização continuam intactas
    fireEvent.click(screen.getByRole('button', { name: 'Exceções de Sincronização' }))
    expect(await screen.findByText('https://loja/produto-x')).toBeTruthy()

    // W) Histórico de sync continua intacto
    fireEvent.click(screen.getByRole('button', { name: 'Histórico' }))
    expect(await screen.findByText('Execuções de sincronização')).toBeTruthy()

    // X, Y) Verificar agora / Sincronizar agora continuam intactos
    expect(screen.getByRole('button', { name: 'Verificar agora' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sincronizar agora' })).toBeTruthy()

    // Z) nenhuma chamada real à Bagy — runBagySyncViaUI nunca foi acionado por isso
    const { runBagySyncViaUI } = await import('../../services/auditoria/auditoriaV2Data.js')
    expect(runBagySyncViaUI).not.toHaveBeenCalled()
  })

  it('regressão: nenhum erro de resumo quebra a página (v2Error isolado)', async () => {
    loadAuditoriaV2Dashboard.mockRejectedValue(new Error('falha de rede'))
    render(<BagyAuditPage />)
    expect(await screen.findByText(/Não foi possível carregar o resumo:/)).toBeTruthy()
    // O resto da página (botões) continua funcional
    expect(screen.getByRole('button', { name: 'Verificar agora' })).toBeTruthy()
  })
})

describe('PARTE 56 / Fase 5 — Auditar Qualidade real + histórico de auditorias', () => {
  function abrirEConfirmarAuditoria(senha = 'senha123') {
    fireEvent.click(screen.getByRole('button', { name: 'Auditar Qualidade' }))
    fireEvent.change(screen.getByPlaceholderText('Senha de ação'), { target: { value: senha } })
    fireEvent.click(screen.getByRole('button', { name: 'Auditar' }))
  }

  it('A) botão "Auditar Qualidade" existe', async () => {
    render(<BagyAuditPage />)
    expect(screen.getByRole('button', { name: 'Auditar Qualidade' })).toBeTruthy()
  })

  it('B, C) clicar abre solicitação de senha, type=password', async () => {
    render(<BagyAuditPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Auditar Qualidade' }))
    const input = screen.getByPlaceholderText('Senha de ação')
    expect(input).toBeTruthy()
    expect(input.type).toBe('password')
  })

  it('D) cancelar não executa a auditoria', async () => {
    render(<BagyAuditPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Auditar Qualidade' }))
    fireEvent.change(screen.getByPlaceholderText('Senha de ação'), { target: { value: 'senha' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(runQualityAudit).not.toHaveBeenCalled()
    expect(screen.queryByPlaceholderText('Senha de ação')).toBeNull()
  })

  it('E) confirmar chama runQualityAudit(secret)', async () => {
    runQualityAudit.mockResolvedValue({ ok: true, run: { id: 'run-1' }, resumo: { totalFindings: 5 } })
    render(<BagyAuditPage />)
    abrirEConfirmarAuditoria('minha-senha')
    await waitFor(() => expect(runQualityAudit).toHaveBeenCalledWith('minha-senha'))
  })

  it('F, G) secret não é persistido — input limpo e não sobra no DOM', async () => {
    runQualityAudit.mockResolvedValue({ ok: true, run: { id: 'run-1' }, resumo: {} })
    render(<BagyAuditPage />)
    abrirEConfirmarAuditoria('senha-secreta-xyz')
    await waitFor(() => expect(runQualityAudit).toHaveBeenCalled())
    expect(screen.queryByPlaceholderText('Senha de ação')).toBeNull()
    expect(document.body.innerHTML).not.toContain('senha-secreta-xyz')
  })

  it('H, I) mostra "Auditando..." e desabilita o botão, protegendo contra clique duplo', async () => {
    let resolver
    runQualityAudit.mockReturnValue(new Promise((r) => { resolver = r }))
    render(<BagyAuditPage />)
    abrirEConfirmarAuditoria()
    expect(await screen.findByRole('button', { name: 'Auditando...' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Auditando...' }).disabled).toBe(true)
    resolver({ ok: true, run: { id: 'run-1' }, resumo: {} })
    await waitFor(() => expect(runQualityAudit).toHaveBeenCalledTimes(1))
  })

  it('J, K) Verificar agora continua disponível durante a auditoria de qualidade', async () => {
    let resolver
    runQualityAudit.mockReturnValue(new Promise((r) => { resolver = r }))
    render(<BagyAuditPage />)
    abrirEConfirmarAuditoria()
    await screen.findByRole('button', { name: 'Auditando...' })
    expect(screen.getByRole('button', { name: 'Verificar agora' }).disabled).toBeFalsy()
    expect(screen.getByRole('button', { name: 'Sincronizar agora' }).disabled).toBeFalsy()
    resolver({ ok: true, run: { id: 'run-1' }, resumo: {} })
  })

  it('L) sucesso mostra feedback', async () => {
    runQualityAudit.mockResolvedValue({ ok: true, run: { id: 'run-1' }, resumo: { totalAtivosAnalisados: 541, totalFindings: 56, comAchados: 37 } })
    render(<BagyAuditPage />)
    abrirEConfirmarAuditoria()
    expect(await screen.findByText('Auditoria de qualidade concluída')).toBeTruthy()
    expect(screen.getByText('541 ativos analisados')).toBeTruthy()
    expect(screen.getByText('56 findings totais')).toBeTruthy()
    // Nunca sugere leitura ao vivo da Bagy
    expect(screen.getByText(/Shadow\/Catálogo V2 atual/)).toBeTruthy()
  })

  it('M) erro (exceção de transporte) mostra feedback sem quebrar a página', async () => {
    runQualityAudit.mockRejectedValue(new Error('senha incorreta'))
    render(<BagyAuditPage />)
    abrirEConfirmarAuditoria('errada')
    expect(await screen.findByText(/senha incorreta/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Auditar Qualidade' })).toBeTruthy()
  })

  it('M) run persistida como falha (ok:false, sem exceção) também mostra erro', async () => {
    runQualityAudit.mockResolvedValue({ ok: false, run: { status: 'falha' }, motivo: 'Falha ao carregar dados do Catálogo V2' })
    render(<BagyAuditPage />)
    abrirEConfirmarAuditoria()
    expect(await screen.findByText(/Falha ao carregar dados do Catálogo V2/)).toBeTruthy()
  })

  it('N) erro não dispara refresh de sucesso (getQualitySummary não é chamado de novo)', async () => {
    runQualityAudit.mockRejectedValue(new Error('falhou'))
    render(<BagyAuditPage />)
    await waitFor(() => expect(getQualitySummary).toHaveBeenCalledTimes(1))
    abrirEConfirmarAuditoria()
    await screen.findByText(/falhou/)
    expect(getQualitySummary).toHaveBeenCalledTimes(1)
  })

  it('O) sucesso atualiza QualitySummary (getQualitySummary chamado de novo)', async () => {
    runQualityAudit.mockResolvedValue({ ok: true, run: { id: 'run-1' }, resumo: {} })
    render(<BagyAuditPage />)
    await waitFor(() => expect(getQualitySummary).toHaveBeenCalledTimes(1))
    abrirEConfirmarAuditoria()
    await waitFor(() => expect(getQualitySummary).toHaveBeenCalledTimes(2))
  })

  it('P) sucesso atualiza findings SOMENTE se a aba Qualidade já foi aberta', async () => {
    runQualityAudit.mockResolvedValue({ ok: true, run: { id: 'run-1' }, resumo: {} })
    render(<BagyAuditPage />)
    await waitFor(() => expect(getQualitySummary).toHaveBeenCalledTimes(1))
    // Nunca abriu a aba Qualidade — getQualityFindings nunca deveria ter sido chamado
    expect(getQualityFindings).not.toHaveBeenCalled()
    abrirEConfirmarAuditoria()
    await waitFor(() => expect(getQualitySummary).toHaveBeenCalledTimes(2))
    expect(getQualityFindings).not.toHaveBeenCalled()
  })

  it('P) sucesso ATUALIZA findings quando a aba Qualidade já tinha sido aberta antes', async () => {
    runQualityAudit.mockResolvedValue({ ok: true, run: { id: 'run-1' }, resumo: {} })
    render(<BagyAuditPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Qualidade do Catálogo' }))
    await waitFor(() => expect(getQualityFindings).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Visão Geral' })) // sai da aba, mas ela já foi aberta 1x
    abrirEConfirmarAuditoria()
    await waitFor(() => expect(getQualityFindings).toHaveBeenCalledTimes(2))
  })

  it('Q) sucesso atualiza histórico de qualidade SOMENTE se a aba Histórico já foi aberta', async () => {
    runQualityAudit.mockResolvedValue({ ok: true, run: { id: 'run-1' }, resumo: {} })
    render(<BagyAuditPage />)
    await waitFor(() => expect(getQualitySummary).toHaveBeenCalledTimes(1))
    expect(getQualityRunHistory).not.toHaveBeenCalled()
    abrirEConfirmarAuditoria()
    await waitFor(() => expect(getQualitySummary).toHaveBeenCalledTimes(2))
    expect(getQualityRunHistory).not.toHaveBeenCalled()
  })

  it('Q) sucesso ATUALIZA histórico de qualidade quando a aba Histórico já tinha sido aberta', async () => {
    runQualityAudit.mockResolvedValue({ ok: true, run: { id: 'run-1' }, resumo: {} })
    render(<BagyAuditPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Histórico' }))
    await waitFor(() => expect(getQualityRunHistory).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Visão Geral' }))
    abrirEConfirmarAuditoria()
    await waitFor(() => expect(getQualityRunHistory).toHaveBeenCalledTimes(2))
  })

  it('R, S) sucesso NÃO recarrega histórico de sync nem chama refreshV2AfterRun (getAuditRuns/getExceptions não repetem)', async () => {
    runQualityAudit.mockResolvedValue({ ok: true, run: { id: 'run-1' }, resumo: {} })
    render(<BagyAuditPage />)
    await waitFor(() => expect(getAuditRuns).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(getExceptions).toHaveBeenCalledTimes(1))
    abrirEConfirmarAuditoria()
    await waitFor(() => expect(getQualitySummary).toHaveBeenCalledTimes(2))
    expect(getAuditRuns).toHaveBeenCalledTimes(1)
    expect(getExceptions).toHaveBeenCalledTimes(1)
  })
})
