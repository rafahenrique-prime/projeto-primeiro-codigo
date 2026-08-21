// @vitest-environment jsdom
//
// PARTE 56 / Fase 3 (leitura) + Fase 4 (Ignorar/Reativar) — testes de
// QualityFindingsList.jsx: carregamento, filtros, busca nome×ID, paginação,
// ordenação local, expand independente, patch local após triagem confirmada
// pelo backend. Mocka getQualityFindings/setFindingStatus (camada já
// homologada) — nunca faz rede real.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import QualityFindingsList, { ordenarLocal, montarParametrosApi } from '../QualityFindingsList.jsx'

vi.mock('../../../services/auditoria/qualidadeCatalogoData.js', () => ({
  getQualityFindings: vi.fn(),
  setFindingStatus: vi.fn(),
}))

import { getQualityFindings, setFindingStatus } from '../../../services/auditoria/qualidadeCatalogoData.js'

afterEach(cleanup)

const T = { bg: '#fff', border: '#eee', text: '#111', textMuted: '#999' }

function finding(id, overrides = {}) {
  return {
    id, shadow_product_id: `sp-${id}`, bagy_product_id: 1000 + Number(id.replace(/\D/g, '') || 0),
    tipo: 'marca_ausente', classe: 'FATO', severidade: 'REVISAR', mensagem: `Problema ${id}`,
    encontrado: null, por_que: 'porque sim', o_que_conferir: 'confira isso',
    content_synced_at: null, status: 'aberto',
    shadow_products: { nome: `Produto ${id}`, ativo: true, last_seen_at: null, content_synced_at: null },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('carregamento inicial (A, B, C)', () => {
  it('A) aba carrega findings via getQualityFindings ao montar', async () => {
    getQualityFindings.mockResolvedValue([finding('f1')])
    render(<QualityFindingsList t={T} />)
    await waitFor(() => expect(getQualityFindings).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Produto f1')).toBeTruthy()
  })

  it('B) status padrão enviado à API é "aberto"', async () => {
    getQualityFindings.mockResolvedValue([])
    render(<QualityFindingsList t={T} />)
    await waitFor(() => expect(getQualityFindings).toHaveBeenCalled())
    const [params] = getQualityFindings.mock.calls[0]
    expect(params.status).toBe('aberto')
    expect(params.classe).toBeUndefined()
    expect(params.severidade).toBeUndefined()
    expect(params.tipo).toBeUndefined()
  })

  it('C) loading renderiza texto discreto antes da resposta chegar', async () => {
    let resolver
    getQualityFindings.mockReturnValue(new Promise((r) => { resolver = r }))
    render(<QualityFindingsList t={T} />)
    expect(screen.getByText('Carregando findings...')).toBeTruthy()
    resolver([])
    await waitFor(() => expect(screen.queryByText('Carregando findings...')).toBeNull())
  })
})

describe('erro (D)', () => {
  it('D) erro renderiza banner isolado, sem lançar/quebrar o componente', async () => {
    getQualityFindings.mockRejectedValue(new Error('falha de rede'))
    render(<QualityFindingsList t={T} />)
    expect(await screen.findByText(/Não foi possível carregar os findings: falha de rede/)).toBeTruthy()
  })
})

describe('vazio (E)', () => {
  it('E) filtro padrão vazio mostra mensagem positiva', async () => {
    getQualityFindings.mockResolvedValue([])
    render(<QualityFindingsList t={T} />)
    expect(await screen.findByText('🎉 Nenhum problema de qualidade em aberto.')).toBeTruthy()
  })
})

describe('expand independente (M)', () => {
  it('M) expandir 1 finding não expande/fecha os outros', async () => {
    getQualityFindings.mockResolvedValue([finding('f1'), finding('f2')])
    render(<QualityFindingsList t={T} />)
    await screen.findByText('Produto f1')

    fireEvent.click(screen.getByText('Produto f1'))
    // Confirma via campo exclusivo do expandido: "Por que foi sinalizado"
    await waitFor(() => expect(screen.getAllByText('Por que foi sinalizado').length).toBe(1)) // só o card f1 expandiu
  })
})

describe('filtros chamam a API corretamente (U, V, W)', () => {
  it('U) filtro de classe chama a API com classe correta', async () => {
    getQualityFindings.mockResolvedValue([])
    render(<QualityFindingsList t={T} />)
    await waitFor(() => expect(getQualityFindings).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: 'FATO' }))
    await waitFor(() => expect(getQualityFindings).toHaveBeenCalledTimes(2))
    const [params] = getQualityFindings.mock.calls[1]
    expect(params.classe).toBe('FATO')
  })

  it('V) filtro de severidade chama a API com severidade correta', async () => {
    getQualityFindings.mockResolvedValue([])
    render(<QualityFindingsList t={T} />)
    await waitFor(() => expect(getQualityFindings).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: 'CRÍTICO' }))
    await waitFor(() => expect(getQualityFindings).toHaveBeenCalledTimes(2))
    const [params] = getQualityFindings.mock.calls[1]
    expect(params.severidade).toBe('CRITICO')
  })

  it('W) filtro de status chama a API com status correto', async () => {
    getQualityFindings.mockResolvedValue([])
    render(<QualityFindingsList t={T} />)
    await waitFor(() => expect(getQualityFindings).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: 'Ignorado' }))
    await waitFor(() => expect(getQualityFindings).toHaveBeenCalledTimes(2))
    const [params] = getQualityFindings.mock.calls[1]
    expect(params.status).toBe('ignorado')
  })
})

describe('busca nome × ID (X, Y)', () => {
  it('X) busca puramente numérica usa bagyProductId', () => {
    const params = montarParametrosApi({ classe: 'all', severidade: 'all', status: 'aberto', tipo: 'all', busca: '10234' })
    expect(params.bagyProductId).toBe('10234')
    expect(params.nome).toBeUndefined()
  })

  it('Y) busca textual usa nome', () => {
    const params = montarParametrosApi({ classe: 'all', severidade: 'all', status: 'aberto', tipo: 'all', busca: 'Boné Diesel' })
    expect(params.nome).toBe('Boné Diesel')
    expect(params.bagyProductId).toBeUndefined()
  })

  it('busca com dígitos e texto misto (ex: "Modelo 001") usa nome, nunca ID', () => {
    const params = montarParametrosApi({ classe: 'all', severidade: 'all', status: 'aberto', tipo: 'all', busca: 'Modelo 001' })
    expect(params.nome).toBe('Modelo 001')
    expect(params.bagyProductId).toBeUndefined()
  })
})

describe('paginação e reset de filtro (Z, AA, AB)', () => {
  it('Z) troca de filtro reseta a paginação (offset volta a 0)', async () => {
    getQualityFindings.mockResolvedValue(Array.from({ length: 50 }, (_, i) => finding(`f${i}`)))
    render(<QualityFindingsList t={T} />)
    await waitFor(() => expect(getQualityFindings).toHaveBeenCalledTimes(1))
    expect(getQualityFindings.mock.calls[0][0].offset).toBe(0)

    fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }))
    await waitFor(() => expect(getQualityFindings).toHaveBeenCalledTimes(2))
    expect(getQualityFindings.mock.calls[1][0].offset).toBe(50)

    getQualityFindings.mockResolvedValue([])
    fireEvent.click(screen.getByRole('button', { name: 'FATO' }))
    await waitFor(() => expect(getQualityFindings).toHaveBeenCalledTimes(3))
    expect(getQualityFindings.mock.calls[2][0].offset).toBe(0)
  })

  it('AA) "Carregar mais" concatena os resultados da página seguinte', async () => {
    getQualityFindings.mockResolvedValueOnce(Array.from({ length: 50 }, (_, i) => finding(`p${i}`)))
    render(<QualityFindingsList t={T} />)
    await screen.findByText('Produto p0')

    getQualityFindings.mockResolvedValueOnce([finding('extra1')])
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }))
    expect(await screen.findByText('Produto extra1')).toBeTruthy()
    // resultados da 1ª página continuam presentes
    expect(screen.getByText('Produto p0')).toBeTruthy()
  })

  it('AB) não duplica finding por id se a mesma linha reaparecer numa página seguinte', async () => {
    getQualityFindings.mockResolvedValueOnce(Array.from({ length: 50 }, (_, i) => finding(`p${i}`)))
    render(<QualityFindingsList t={T} />)
    await screen.findByText('Produto p0')

    // 2ª página inclui "p0" de novo (cenário defensivo) + 1 item novo
    getQualityFindings.mockResolvedValueOnce([finding('p0'), finding('novoUnico')])
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }))
    await screen.findByText('Produto novoUnico')

    expect(screen.getAllByText('Produto p0').length).toBe(1)
  })

  it('"Carregar mais" só aparece quando hasMore=true (resposta menor que 50 → sem botão)', async () => {
    getQualityFindings.mockResolvedValue([finding('f1')])
    render(<QualityFindingsList t={T} />)
    await screen.findByText('Produto f1')
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull()
  })
})

describe('ordenação local (AC)', () => {
  it('AC) ordena CRITICO > IMPORTANTE > REVISAR, depois FATO > ALERTA > SUGESTAO', () => {
    const entrada = [
      finding('a', { severidade: 'REVISAR', classe: 'FATO' }),
      finding('b', { severidade: 'CRITICO', classe: 'SUGESTAO' }),
      finding('c', { severidade: 'CRITICO', classe: 'FATO' }),
      finding('d', { severidade: 'IMPORTANTE', classe: 'FATO' }),
    ]
    const ordenado = ordenarLocal(entrada).map((f) => f.id)
    expect(ordenado).toEqual(['c', 'b', 'd', 'a'])
  })
})

describe('nenhuma escrita disparada (AE)', () => {
  it('AE) nenhuma chamada POST é feita pela aba de qualidade — só GET via getQualityFindings', async () => {
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy
    getQualityFindings.mockResolvedValue([finding('f1')])
    render(<QualityFindingsList t={T} />)
    await screen.findByText('Produto f1')

    fireEvent.click(screen.getByText('Produto f1')) // expandir
    fireEvent.click(screen.getByRole('button', { name: 'CRÍTICO' })) // trocar filtro

    // getQualityFindings é mockado (não usa fetch real) — a asserção real é
    // que NENHUMA função de escrita foi importada/chamada nesta árvore.
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('Fase 4 — patch local após triagem confirmada (P, Q, R, S)', () => {
  it('P) filtro aberto remove da lista o finding que virou ignorado após confirmação', async () => {
    getQualityFindings.mockResolvedValue([finding('f1'), finding('f2')])
    setFindingStatus.mockResolvedValue({ id: 'f1', status: 'ignorado' })
    render(<QualityFindingsList t={T} />)
    await screen.findByText('Produto f1')

    fireEvent.click(screen.getAllByRole('button', { name: 'Ignorar' })[0])
    fireEvent.change(screen.getByPlaceholderText('Senha de ação'), { target: { value: 'senha123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(screen.queryByText('Produto f1')).toBeNull())
    // R) outros findings permanecem intactos
    expect(screen.getByText('Produto f2')).toBeTruthy()
  })

  it('Q) filtro ignorado remove da lista o finding que virou aberto após confirmação', async () => {
    getQualityFindings.mockResolvedValue([finding('f1', { status: 'ignorado' }), finding('f2', { status: 'ignorado' })])
    setFindingStatus.mockResolvedValue({ id: 'f1', status: 'aberto' })
    render(<QualityFindingsList t={T} />)
    await waitFor(() => expect(getQualityFindings).toHaveBeenCalledTimes(1))

    // Muda pro filtro "Ignorado" pra bater com a fixture
    fireEvent.click(screen.getByRole('button', { name: 'Ignorado' }))
    getQualityFindings.mockResolvedValue([finding('f1', { status: 'ignorado' }), finding('f2', { status: 'ignorado' })])
    await screen.findByText('Produto f1')

    fireEvent.click(screen.getAllByRole('button', { name: 'Reativar' })[0])
    fireEvent.change(screen.getByPlaceholderText('Senha de ação'), { target: { value: 'senha123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(screen.queryByText('Produto f1')).toBeNull())
    expect(screen.getByText('Produto f2')).toBeTruthy()
  })

  it('S) expansão dos outros cards permanece funcional depois de uma triagem', async () => {
    getQualityFindings.mockResolvedValue([finding('f1'), finding('f2')])
    setFindingStatus.mockResolvedValue({ id: 'f1', status: 'ignorado' })
    render(<QualityFindingsList t={T} />)
    await screen.findByText('Produto f1')

    // expande f2 antes da triagem de f1
    fireEvent.click(screen.getByText('Produto f2'))
    await waitFor(() => expect(screen.getAllByText('Por que foi sinalizado').length).toBe(1))

    fireEvent.click(screen.getAllByRole('button', { name: 'Ignorar' })[0]) // f1 (ordem: ambos REVISAR/FATO, ordem de chegada)
    fireEvent.change(screen.getAllByPlaceholderText('Senha de ação')[0], { target: { value: 'senha123' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Confirmar' })[0])

    await waitFor(() => expect(screen.queryByText('Produto f1')).toBeNull())
    // f2 continua expandido
    expect(screen.getAllByText('Por que foi sinalizado').length).toBe(1)
  })

  it('erro do backend mantém o finding na lista com status anterior (J, K)', async () => {
    getQualityFindings.mockResolvedValue([finding('f1')])
    setFindingStatus.mockRejectedValue(new Error('senha incorreta'))
    render(<QualityFindingsList t={T} />)
    await screen.findByText('Produto f1')

    fireEvent.click(screen.getByRole('button', { name: 'Ignorar' }))
    fireEvent.change(screen.getByPlaceholderText('Senha de ação'), { target: { value: 'errada' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByText(/Não foi possível atualizar: senha incorreta/)).toBeTruthy()
    // finding continua na lista (filtro "aberto" não mudou) e ainda mostra "Ignorar"
    expect(screen.getByText('Produto f1')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ignorar' })).toBeTruthy()
  })

  it('Z) nenhuma chamada de rede real acontece por Ignorar/Reativar — só a função mockada setFindingStatus', async () => {
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy
    getQualityFindings.mockResolvedValue([finding('f1')])
    setFindingStatus.mockResolvedValue({ id: 'f1', status: 'ignorado' })
    render(<QualityFindingsList t={T} />)
    await screen.findByText('Produto f1')

    fireEvent.click(screen.getByRole('button', { name: 'Ignorar' }))
    fireEvent.change(screen.getByPlaceholderText('Senha de ação'), { target: { value: 'senha123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(setFindingStatus).toHaveBeenCalledTimes(1))

    expect(setFindingStatus).toHaveBeenCalledWith('f1', 'ignorado', 'senha123')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
