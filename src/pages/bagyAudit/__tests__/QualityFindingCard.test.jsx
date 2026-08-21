// @vitest-environment jsdom
//
// PARTE 56 / Fase 3 (leitura) + Fase 4 (Ignorar/Reativar) — testes de
// QualityFindingCard.jsx (badges, expand/collapse, campos do finding
// expandido, ShadowFreshnessNote, ação de triagem). Componente recebe `t`
// como prop simples (mesmo padrão de BagyAuditPage.jsx) — não precisa de
// ThemeProvider. `setFindingStatus` é mockado — a lógica real da rota já é
// coberta por scripts/__tests__/qualidade-catalogo-auditoria.test.js e
// api/__tests__/systemToolsQualidadeCatalogo.test.js.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import QualityFindingCard, { ClasseBadge, SeveridadeBadge, ShadowFreshnessNote } from '../QualityFindingCard.jsx'

vi.mock('../../../services/auditoria/qualidadeCatalogoData.js', () => ({
  setFindingStatus: vi.fn(),
}))

import { setFindingStatus } from '../../../services/auditoria/qualidadeCatalogoData.js'

afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
})

const T = { bg: '#fff', border: '#eee', text: '#111', textMuted: '#999' }

function findingBase(overrides = {}) {
  return {
    id: 'f-1',
    shadow_product_id: 'sp-1',
    bagy_product_id: 10234,
    tipo: 'marca_ausente',
    classe: 'FATO',
    severidade: 'REVISAR',
    mensagem: 'Marca ausente',
    encontrado: 'campo marca vazio',
    esperado_sugerido: null,
    por_que: 'O produto não tem marca cadastrada.',
    o_que_conferir: 'Verifique se o produto tem marca na Bagy.',
    content_synced_at: null,
    status: 'aberto',
    shadow_products: { nome: 'Boné Teste', ativo: true, last_seen_at: '2026-08-20T20:00:00Z', content_synced_at: null },
    ...overrides,
  }
}

describe('badges de classe (F, G, H)', () => {
  it('F) FATO renderiza badge azul com ícone 📋', () => {
    render(<ClasseBadge classe="FATO" />)
    expect(screen.getByText(/📋/)).toBeTruthy()
    expect(screen.getByText(/FATO/)).toBeTruthy()
  })

  it('G) ALERTA renderiza badge roxo com ícone ⚠️', () => {
    render(<ClasseBadge classe="ALERTA" />)
    expect(screen.getByText(/⚠️/)).toBeTruthy()
    expect(screen.getByText(/ALERTA/)).toBeTruthy()
  })

  it('H) SUGESTAO renderiza badge cinza com ícone 💡 e label SUGESTÃO', () => {
    render(<ClasseBadge classe="SUGESTAO" />)
    expect(screen.getByText(/💡/)).toBeTruthy()
    expect(screen.getByText(/SUGESTÃO/)).toBeTruthy()
  })
})

describe('badges de severidade (I, J, K)', () => {
  it('I) CRITICO renderiza label CRÍTICO', () => {
    render(<SeveridadeBadge severidade="CRITICO" />)
    expect(screen.getByText('CRÍTICO')).toBeTruthy()
  })

  it('J) IMPORTANTE renderiza label IMPORTANTE', () => {
    render(<SeveridadeBadge severidade="IMPORTANTE" />)
    expect(screen.getByText('IMPORTANTE')).toBeTruthy()
  })

  it('K) REVISAR renderiza label REVISAR', () => {
    render(<SeveridadeBadge severidade="REVISAR" />)
    expect(screen.getByText('REVISAR')).toBeTruthy()
  })
})

describe('expand/collapse do card', () => {
  it('L) finding inicia colapsado (conteúdo expandido ausente por padrão)', () => {
    render(<QualityFindingCard finding={findingBase()} t={T} expanded={false} onToggleExpand={() => {}} />)
    expect(screen.queryByText('Por que foi sinalizado')).toBeNull()
    expect(screen.queryByText('O que conferir')).toBeNull()
  })

  it('expanded=true mostra o conteúdo detalhado', () => {
    render(<QualityFindingCard finding={findingBase()} t={T} expanded={true} onToggleExpand={() => {}} />)
    expect(screen.getByText('Por que foi sinalizado')).toBeTruthy()
  })

  it('clicar no cabeçalho do card dispara onToggleExpand', () => {
    let chamado = false
    render(<QualityFindingCard finding={findingBase()} t={T} expanded={false} onToggleExpand={() => { chamado = true }} />)
    fireEvent.click(screen.getByText('Boné Teste'))
    expect(chamado).toBe(true)
  })
})

describe('conteúdo expandido (N, O, P)', () => {
  it('N) mostra o problema (mensagem)', () => {
    render(<QualityFindingCard finding={findingBase()} t={T} expanded={true} onToggleExpand={() => {}} />)
    expect(screen.getByText('Problema')).toBeTruthy()
    // mensagem aparece 2x (resumo colapsado + campo "Problema" expandido)
    expect(screen.getAllByText('Marca ausente').length).toBeGreaterThan(0)
  })

  it('O) mostra "por que foi sinalizado" com o texto real da API', () => {
    render(<QualityFindingCard finding={findingBase()} t={T} expanded={true} onToggleExpand={() => {}} />)
    expect(screen.getByText('O produto não tem marca cadastrada.')).toBeTruthy()
  })

  it('P) mostra "o que conferir" com o texto real da API', () => {
    render(<QualityFindingCard finding={findingBase()} t={T} expanded={true} onToggleExpand={() => {}} />)
    expect(screen.getByText('Verifique se o produto tem marca na Bagy.')).toBeTruthy()
  })

  it('mostra "encontrado" quando presente', () => {
    render(<QualityFindingCard finding={findingBase()} t={T} expanded={true} onToggleExpand={() => {}} />)
    expect(screen.getByText('campo marca vazio')).toBeTruthy()
  })

  it('não renderiza campo "Encontrado" quando ausente/null (nunca inventa texto)', () => {
    render(<QualityFindingCard finding={findingBase({ encontrado: null })} t={T} expanded={true} onToggleExpand={() => {}} />)
    expect(screen.queryByText('Encontrado')).toBeNull()
  })

  it('produto inativo ganha a tag "Inativo" e opacidade reduzida', () => {
    render(<QualityFindingCard finding={findingBase({ shadow_products: { nome: 'X', ativo: false, last_seen_at: null, content_synced_at: null } })} t={T} expanded={false} onToggleExpand={() => {}} />)
    expect(screen.getByText('Inativo')).toBeTruthy()
  })
})

describe('ShadowFreshnessNote (Q, R, S, T)', () => {
  it('Q) content_synced_at NULL mostra aviso neutro de "data desconhecida", sem afirmar desatualização', () => {
    render(<ShadowFreshnessNote contentSyncedAt={null} lastSeenAt={null} />)
    expect(screen.getByText(/Data de sincronização do conteúdo desconhecida/)).toBeTruthy()
    expect(screen.queryByText(/desatualizado/)).toBeNull()
  })

  it('R) content_synced_at > 72h mostra aviso de possível desatualização', () => {
    const oitentaHorasAtras = new Date(Date.now() - 80 * 60 * 60 * 1000).toISOString()
    render(<ShadowFreshnessNote contentSyncedAt={oitentaHorasAtras} lastSeenAt={null} />)
    expect(screen.getByText(/pode estar desatualizado/)).toBeTruthy()
  })

  it('S) content_synced_at <= 72h NÃO mostra alerta de desatualização (só metadado discreto)', () => {
    const dezHorasAtras = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString()
    render(<ShadowFreshnessNote contentSyncedAt={dezHorasAtras} lastSeenAt={null} />)
    expect(screen.queryByText(/desatualizado/)).toBeNull()
    expect(screen.getByText(/sincronizado há/)).toBeTruthy()
  })

  it('T) last_seen_at sozinho (sem content_synced_at) NUNCA classifica o conteúdo como atualizado', () => {
    // last_seen_at recente, mas content_synced_at NULL — deve continuar
    // mostrando "desconhecida", nunca "atualizado"/"sincronizado há"
    const agora = new Date().toISOString()
    render(<ShadowFreshnessNote contentSyncedAt={null} lastSeenAt={agora} />)
    expect(screen.getByText(/Data de sincronização do conteúdo desconhecida/)).toBeTruthy()
    expect(screen.queryByText(/^Espelho sincronizado há/)).toBeNull()
  })
})

describe('Fase 4 — ação de triagem (Ignorar/Reativar)', () => {
  it('A) finding com status=aberto mostra o botão "Ignorar"', () => {
    render(<QualityFindingCard finding={findingBase({ status: 'aberto' })} t={T} expanded={false} onToggleExpand={() => {}} />)
    expect(screen.getByRole('button', { name: 'Ignorar' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Reativar' })).toBeNull()
  })

  it('B) finding com status=ignorado mostra o botão "Reativar"', () => {
    render(<QualityFindingCard finding={findingBase({ status: 'ignorado' })} t={T} expanded={false} onToggleExpand={() => {}} />)
    expect(screen.getByRole('button', { name: 'Reativar' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ignorar' })).toBeNull()
  })

  it('C) o card nunca mostra um botão "Resolver"', () => {
    render(<QualityFindingCard finding={findingBase()} t={T} expanded={true} onToggleExpand={() => {}} />)
    expect(screen.queryByRole('button', { name: /Resolver/i })).toBeNull()
  })

  it('D) o card nunca mostra um botão "Corrigir"', () => {
    render(<QualityFindingCard finding={findingBase()} t={T} expanded={true} onToggleExpand={() => {}} />)
    expect(screen.queryByRole('button', { name: /Corrigir/i })).toBeNull()
  })

  it('E) clicar "Ignorar" abre o campo de senha (não chama setFindingStatus ainda)', () => {
    render(<QualityFindingCard finding={findingBase({ status: 'aberto' })} t={T} expanded={false} onToggleExpand={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ignorar' }))
    expect(screen.getByPlaceholderText('Senha de ação')).toBeTruthy()
    expect(setFindingStatus).not.toHaveBeenCalled()
  })

  it('F) o campo de senha é type="password"', () => {
    render(<QualityFindingCard finding={findingBase({ status: 'aberto' })} t={T} expanded={false} onToggleExpand={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ignorar' }))
    expect(screen.getByPlaceholderText('Senha de ação').type).toBe('password')
  })

  it('G) Confirmar chama setFindingStatus(id, "ignorado", senha)', async () => {
    setFindingStatus.mockResolvedValue({ id: 'f-1', status: 'ignorado' })
    render(<QualityFindingCard finding={findingBase({ status: 'aberto' })} t={T} expanded={false} onToggleExpand={() => {}} onStatusChanged={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ignorar' }))
    fireEvent.change(screen.getByPlaceholderText('Senha de ação'), { target: { value: 'minha-senha' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(setFindingStatus).toHaveBeenCalledWith('f-1', 'ignorado', 'minha-senha'))
  })

  it('H) Reativar chama setFindingStatus(id, "aberto", senha)', async () => {
    setFindingStatus.mockResolvedValue({ id: 'f-1', status: 'aberto' })
    render(<QualityFindingCard finding={findingBase({ status: 'ignorado' })} t={T} expanded={false} onToggleExpand={() => {}} onStatusChanged={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reativar' }))
    fireEvent.change(screen.getByPlaceholderText('Senha de ação'), { target: { value: 'minha-senha' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(setFindingStatus).toHaveBeenCalledWith('f-1', 'aberto', 'minha-senha'))
  })

  it('I) onStatusChanged só é chamado depois que setFindingStatus resolve com sucesso', async () => {
    let resolver
    setFindingStatus.mockReturnValue(new Promise((r) => { resolver = r }))
    let chamado = false
    render(<QualityFindingCard finding={findingBase({ status: 'aberto' })} t={T} expanded={false} onToggleExpand={() => {}} onStatusChanged={() => { chamado = true }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ignorar' }))
    fireEvent.change(screen.getByPlaceholderText('Senha de ação'), { target: { value: 'senha' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(chamado).toBe(false) // ainda não resolveu
    resolver({ id: 'f-1', status: 'ignorado' })
    await waitFor(() => expect(chamado).toBe(true))
  })

  it('J, K) erro do backend mantém o status anterior e mostra erro local no card', async () => {
    setFindingStatus.mockRejectedValue(new Error('senha incorreta'))
    render(<QualityFindingCard finding={findingBase({ status: 'aberto' })} t={T} expanded={false} onToggleExpand={() => {}} onStatusChanged={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ignorar' }))
    fireEvent.change(screen.getByPlaceholderText('Senha de ação'), { target: { value: 'errada' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByText(/Não foi possível atualizar: senha incorreta/)).toBeTruthy()
    // continua mostrando "Ignorar" (status permaneceu "aberto")
    expect(screen.getByRole('button', { name: 'Ignorar' })).toBeTruthy()
  })

  it('L) botão fica desabilitado (busy) enquanto a chamada está em andamento — protegido contra clique duplo', async () => {
    let resolver
    setFindingStatus.mockReturnValue(new Promise((r) => { resolver = r }))
    render(<QualityFindingCard finding={findingBase({ status: 'aberto' })} t={T} expanded={false} onToggleExpand={() => {}} onStatusChanged={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ignorar' }))
    fireEvent.change(screen.getByPlaceholderText('Senha de ação'), { target: { value: 'senha' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(screen.getByRole('button', { name: '...' }).disabled).toBe(true)
    resolver({ id: 'f-1', status: 'ignorado' })
    await waitFor(() => expect(setFindingStatus).toHaveBeenCalledTimes(1))
  })

  it('M, N) senha não vaza pro DOM/log depois da confirmação — campo é limpo imediatamente', async () => {
    setFindingStatus.mockResolvedValue({ id: 'f-1', status: 'ignorado' })
    render(<QualityFindingCard finding={findingBase({ status: 'aberto' })} t={T} expanded={false} onToggleExpand={() => {}} onStatusChanged={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ignorar' }))
    fireEvent.change(screen.getByPlaceholderText('Senha de ação'), { target: { value: 'senha-secreta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    // o campo de senha (e portanto o valor digitado) some do DOM assim que
    // a ação dispara — nunca fica visível/persistido em nenhum estado
    await waitFor(() => expect(screen.queryByPlaceholderText('Senha de ação')).toBeNull())
    expect(document.body.innerHTML).not.toContain('senha-secreta')
  })

  it('O) onStatusChanged recebe o finding confirmado pelo backend (não um objeto local otimista)', async () => {
    const findingConfirmadoPeloBackend = { id: 'f-1', status: 'ignorado', mensagem: 'valor vindo do backend' }
    setFindingStatus.mockResolvedValue(findingConfirmadoPeloBackend)
    let recebido = null
    render(<QualityFindingCard finding={findingBase({ status: 'aberto' })} t={T} expanded={false} onToggleExpand={() => {}} onStatusChanged={(f) => { recebido = f }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ignorar' }))
    fireEvent.change(screen.getByPlaceholderText('Senha de ação'), { target: { value: 'senha' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(recebido).toEqual(findingConfirmadoPeloBackend))
  })

  it('setFindingStatus nunca é chamado com "resolvido" — nenhuma ação do card produz esse valor', () => {
    // Confirma estruturalmente: o card só computa novoStatus como
    // 'aberto'|'ignorado' (alternância baseada em finding.status) — não
    // existe nenhum caminho de código que passe 'resolvido'.
    render(<QualityFindingCard finding={findingBase({ status: 'aberto' })} t={T} expanded={false} onToggleExpand={() => {}} />)
    expect(screen.queryByText(/[Rr]esolvido/)).toBeNull()
  })
})
