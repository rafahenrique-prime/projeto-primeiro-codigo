// Testes permanentes de regressão da ferramenta MCP consultar_cobrancas
// (api/_consultarCobrancas.js). 100% mockado: nenhuma chamada real ao Base44/Lyra,
// nenhum dado real de cliente, nenhuma escrita.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

vi.mock('@base44/sdk', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@base44/sdk'

let consultarCobrancas

beforeAll(async () => {
  process.env.BASE44_API_KEY = 'test-base44-key-nao-real'
  const mod = await import('../_consultarCobrancas.js')
  consultarCobrancas = mod.consultarCobrancas
})

function fakePrimeClient({ clientes = [], parcelas = [] } = {}) {
  return {
    entities: {
      Cliente: { filter: vi.fn(async () => clientes) },
      Parcela: { filter: vi.fn(async () => parcelas) },
    },
  }
}

beforeEach(() => {
  process.env.BASE44_API_KEY = 'test-base44-key-nao-real'
  createClient.mockReset()
})

describe('consultarCobrancas — busca por nome (nunca retorna financeiro)', () => {
  it('1 único resultado -> confirmacao_necessaria, sem financeiro, telefone mascarado', async () => {
    createClient.mockReturnValue(fakePrimeClient({
      clientes: [{ id: 'c1', nome: 'Rafael Teste', telefone: '34999997499' }],
    }))
    const r = await consultarCobrancas({ nome_cliente: 'Rafael Teste' })
    expect(r.httpStatus).toBe(200)
    expect(r.body.status).toBe('confirmacao_necessaria')
    expect(r.body.candidatos).toEqual([{ nome: 'Rafael Teste', telefone_mascarado: '******7499' }])
    expect(r.body).not.toHaveProperty('parcelas')
    expect(r.body).not.toHaveProperty('resumo')
    expect(JSON.stringify(r.body)).not.toContain('34999997499')
  })

  it('vários resultados (homônimos) -> até 3 candidatos, todos mascarados, sem financeiro', async () => {
    createClient.mockReturnValue(fakePrimeClient({
      clientes: [
        { id: 'c1', nome: 'Rafael Teste', telefone: '34999997499' },
        { id: 'c2', nome: 'Rafael Teste', telefone: '34988886666' },
        { id: 'c3', nome: 'Rafael Teste', telefone: '34977775555' },
        { id: 'c4', nome: 'Rafael Teste', telefone: '34966664444' },
      ],
    }))
    const r = await consultarCobrancas({ nome_cliente: 'Rafael Teste' })
    expect(r.body.status).toBe('confirmacao_necessaria')
    expect(r.body.candidatos).toHaveLength(3)
    r.body.candidatos.forEach(c => expect(c.telefone_mascarado).toMatch(/^\*{6}\d{4}$/))
    expect(JSON.stringify(r.body)).not.toMatch(/\d{8,}/)
  })

  it('nenhum resultado -> nao_encontrado', async () => {
    createClient.mockReturnValue(fakePrimeClient({ clientes: [] }))
    const r = await consultarCobrancas({ nome_cliente: 'Ninguem Aqui' })
    expect(r.body.status).toBe('nao_encontrado')
  })

  it('nome com espaços externos casa após normalização', async () => {
    createClient.mockReturnValue(fakePrimeClient({
      clientes: [{ id: 'c1', nome: 'Rafael Teste', telefone: '34999997499' }],
    }))
    const r = await consultarCobrancas({ nome_cliente: '  Rafael Teste  ' })
    expect(r.body.status).toBe('confirmacao_necessaria')
    expect(r.body.candidatos).toHaveLength(1)
  })

  it('nome com diferença de caixa casa na reconfirmação local', async () => {
    createClient.mockReturnValue(fakePrimeClient({
      clientes: [{ id: 'c1', nome: '  Rafael Teste  ', telefone: '34999997499' }],
    }))
    const r = await consultarCobrancas({ nome_cliente: 'rafael teste' })
    expect(r.body.status).toBe('confirmacao_necessaria')
    expect(r.body.candidatos).toHaveLength(1)
    expect(r.body.candidatos[0].telefone_mascarado).toBe('******7499')
  })

  it('resultado apenas semelhante (não idêntico) não passa na reconfirmação exata', async () => {
    createClient.mockReturnValue(fakePrimeClient({
      clientes: [{ id: 'c2', nome: 'Rafael Testeiro', telefone: '34988886666' }],
    }))
    const r = await consultarCobrancas({ nome_cliente: 'Rafael Teste' })
    expect(r.body.status).toBe('nao_encontrado')
  })
})

describe('consultarCobrancas — busca por telefone (única via com financeiro)', () => {
  it('telefone válido, 1 cliente -> status ok, consulta parcelas', async () => {
    createClient.mockReturnValue(fakePrimeClient({
      clientes: [{ id: 'c1', nome: 'Rafael Teste', telefone: '34999997499' }],
      parcelas: [
        { id: 'p1', cliente_id: 'c1', numero: 1, valor_base: 150, status: 'pendente', data_vencimento: '2020-01-01' },
      ],
    }))
    const r = await consultarCobrancas({ telefone: '34999997499' })
    expect(r.httpStatus).toBe(200)
    expect(r.body.status).toBe('ok')
    expect(r.body.cliente).toEqual({ nome: 'Rafael Teste', telefone_mascarado: '******7499' })
    expect(r.body.parcelas).toHaveLength(1)
  })

  it('telefone incompleto (<10 dígitos) -> rejeitado antes de chamar Base44', async () => {
    const client = fakePrimeClient()
    createClient.mockReturnValue(client)
    const r = await consultarCobrancas({ telefone: '3499' })
    expect(r.httpStatus).toBe(400)
    expect(client.entities.Cliente.filter).not.toHaveBeenCalled()
  })

  it('telefone maior que o limite aceito (>15 dígitos) -> rejeitado antes de chamar Base44', async () => {
    const client = fakePrimeClient()
    createClient.mockReturnValue(client)
    const r = await consultarCobrancas({ telefone: '1234567890123456' })
    expect(r.httpStatus).toBe(400)
    expect(client.entities.Cliente.filter).not.toHaveBeenCalled()
  })

  it('telefone sem resultado -> nao_encontrado', async () => {
    createClient.mockReturnValue(fakePrimeClient({ clientes: [] }))
    const r = await consultarCobrancas({ telefone: '34999997499' })
    expect(r.body.status).toBe('nao_encontrado')
  })

  it('telefone associado a mais de 1 cliente (anomalia) -> nao_encontrado, nunca escolhe', async () => {
    createClient.mockReturnValue(fakePrimeClient({
      clientes: [
        { id: 'c1', nome: 'Fulano', telefone: '34999997499' },
        { id: 'c2', nome: 'Ciclano', telefone: '34999997499' },
      ],
    }))
    const r = await consultarCobrancas({ telefone: '34999997499' })
    expect(r.body.status).toBe('nao_encontrado')
  })

  it('cliente sem nenhuma parcela -> status ok, parcelas vazias, resumo zerado (não é erro)', async () => {
    createClient.mockReturnValue(fakePrimeClient({
      clientes: [{ id: 'c1', nome: 'Rafael Teste', telefone: '34999997499' }],
      parcelas: [],
    }))
    const r = await consultarCobrancas({ telefone: '34999997499' })
    expect(r.body.status).toBe('ok')
    expect(r.body.parcelas).toEqual([])
    expect(r.body.resumo).toEqual({ total_parcelas_abertas: 0, total_em_aberto: 0, total_vencido: 0 })
  })

  it('telefone financeiro mascarado — telefone completo não aparece no JSON serializado', async () => {
    createClient.mockReturnValue(fakePrimeClient({
      clientes: [{ id: 'c1', nome: 'Rafael Teste', telefone: '34999997499' }],
      parcelas: [{ id: 'p1', cliente_id: 'c1', numero: 1, valor_base: 100, status: 'pendente', data_vencimento: '2099-01-01' }],
    }))
    const r = await consultarCobrancas({ telefone: '34999997499' })
    expect(r.body.cliente).toHaveProperty('telefone_mascarado')
    expect(r.body.cliente).not.toHaveProperty('telefone')
    expect(JSON.stringify(r.body)).not.toContain('34999997499')
  })
})

describe('consultarCobrancas — classificação de parcelas', () => {
  const hoje = new Date()
  const passado = new Date(hoje.getTime() - 20 * 86400000).toISOString().slice(0, 10)
  const futuro = new Date(hoje.getTime() + 20 * 86400000).toISOString().slice(0, 10)

  function clientComParcelas(parcelas) {
    return fakePrimeClient({ clientes: [{ id: 'c1', nome: 'Rafael Teste', telefone: '34999997499' }], parcelas })
  }

  it('parcela aberta: pendente, vencimento futuro', async () => {
    createClient.mockReturnValue(clientComParcelas([
      { id: 'p1', cliente_id: 'c1', numero: 1, valor_base: 100, status: 'pendente', data_vencimento: futuro },
    ]))
    const r = await consultarCobrancas({ telefone: '34999997499' })
    expect(r.body.parcelas[0].status).toBe('aberta')
    expect(r.body.parcelas[0].dias_atraso).toBe(0)
  })

  it('parcela vencida: pendente, vencimento passado', async () => {
    createClient.mockReturnValue(clientComParcelas([
      { id: 'p1', cliente_id: 'c1', numero: 1, valor_base: 100, status: 'pendente', data_vencimento: passado },
    ]))
    const r = await consultarCobrancas({ telefone: '34999997499' })
    expect(r.body.parcelas[0].status).toBe('vencida')
    expect(r.body.parcelas[0].dias_atraso).toBeGreaterThan(0)
  })

  it('parcela paga: status pago, dias_atraso sempre 0 mesmo se venceu no passado', async () => {
    createClient.mockReturnValue(clientComParcelas([
      { id: 'p1', cliente_id: 'c1', numero: 1, valor_base: 100, valor_pago: 100, status: 'pago', data_vencimento: passado },
    ]))
    const r = await consultarCobrancas({ telefone: '34999997499' })
    expect(r.body.parcelas[0].status).toBe('paga')
    expect(r.body.parcelas[0].dias_atraso).toBe(0)
  })

  it('filtro status=aberta/vencida/paga/todas', async () => {
    const parcelas = [
      { id: 'p1', cliente_id: 'c1', numero: 1, valor_base: 100, status: 'pendente', data_vencimento: futuro },
      { id: 'p2', cliente_id: 'c1', numero: 2, valor_base: 100, status: 'pendente', data_vencimento: passado },
      { id: 'p3', cliente_id: 'c1', numero: 3, valor_base: 100, valor_pago: 100, status: 'pago', data_vencimento: passado },
    ]

    createClient.mockReturnValue(clientComParcelas(parcelas))
    const aberta = await consultarCobrancas({ telefone: '34999997499', status: 'aberta' })
    expect(aberta.body.parcelas).toHaveLength(1)
    expect(aberta.body.parcelas[0].status).toBe('aberta')

    createClient.mockReturnValue(clientComParcelas(parcelas))
    const vencida = await consultarCobrancas({ telefone: '34999997499', status: 'vencida' })
    expect(vencida.body.parcelas).toHaveLength(1)
    expect(vencida.body.parcelas[0].status).toBe('vencida')

    createClient.mockReturnValue(clientComParcelas(parcelas))
    const paga = await consultarCobrancas({ telefone: '34999997499', status: 'paga' })
    expect(paga.body.parcelas).toHaveLength(1)
    expect(paga.body.parcelas[0].status).toBe('paga')

    createClient.mockReturnValue(clientComParcelas(parcelas))
    const todas = await consultarCobrancas({ telefone: '34999997499', status: 'todas' })
    expect(todas.body.parcelas).toHaveLength(3)
  })

  it('resumo acompanha o filtro de status (regra revisada) — status=vencida só soma as vencidas', async () => {
    const parcelas = [
      { id: 'p1', cliente_id: 'c1', numero: 1, valor_base: 100, status: 'pendente', data_vencimento: passado }, // vencida
      { id: 'p2', cliente_id: 'c1', numero: 2, valor_base: 300, status: 'pendente', data_vencimento: futuro }, // aberta, não deve entrar no resumo filtrado
      { id: 'p3', cliente_id: 'c1', numero: 3, valor_base: 50, valor_pago: 50, status: 'pago', data_vencimento: passado },
    ]
    createClient.mockReturnValue(clientComParcelas(parcelas))
    const r = await consultarCobrancas({ telefone: '34999997499', status: 'vencida' })
    expect(r.body.parcelas).toHaveLength(1)
    // Resumo reflete só o conjunto filtrado (1 vencida de R$100) — não os R$300 da aberta.
    expect(r.body.resumo).toEqual({ total_parcelas_abertas: 1, total_em_aberto: 100, total_vencido: 100 })
  })

  it('resumo para status=todas continua representando todas as parcelas (comportamento inalterado)', async () => {
    const parcelas = [
      { id: 'p1', cliente_id: 'c1', numero: 1, valor_base: 100, status: 'pendente', data_vencimento: passado },
      { id: 'p2', cliente_id: 'c1', numero: 2, valor_base: 300, status: 'pendente', data_vencimento: futuro },
      { id: 'p3', cliente_id: 'c1', numero: 3, valor_base: 50, valor_pago: 50, status: 'pago', data_vencimento: passado },
    ]
    createClient.mockReturnValue(clientComParcelas(parcelas))
    const r = await consultarCobrancas({ telefone: '34999997499', status: 'todas' })
    expect(r.body.resumo).toEqual({ total_parcelas_abertas: 2, total_em_aberto: 400, total_vencido: 100 })
  })

  it('limite não altera o resumo do conjunto filtrado — 8 vencidas com limite=5: resumo reflete as 8, lista mostra 5', async () => {
    const vencidas = Array.from({ length: 8 }, (_, i) => ({
      id: `v${i}`, cliente_id: 'c1', numero: i + 1, valor_base: 10, status: 'pendente', data_vencimento: passado,
    }))
    createClient.mockReturnValue(clientComParcelas(vencidas))
    const r = await consultarCobrancas({ telefone: '34999997499', status: 'vencida', limite: 5 })
    expect(r.body.parcelas).toHaveLength(5)
    expect(r.body.resumo.total_parcelas_abertas).toBe(8)
    expect(r.body.resumo.total_em_aberto).toBe(80)
    expect(r.body.resumo.total_vencido).toBe(80)
  })

  it('ordenação determinística: vencida (mais atrasada primeiro) -> aberta (vencimento crescente) -> paga (mais recente primeiro)', async () => {
    const parcelas = [
      { id: 'a1', cliente_id: 'c1', numero: 1, valor_base: 10, status: 'pendente', data_vencimento: '2099-06-01' }, // aberta, mais distante
      { id: 'a2', cliente_id: 'c1', numero: 2, valor_base: 10, status: 'pendente', data_vencimento: '2099-01-01' }, // aberta, mais próxima
      { id: 'v1', cliente_id: 'c1', numero: 3, valor_base: 10, status: 'pendente', data_vencimento: '2020-01-01' }, // vencida há mais tempo
      { id: 'v2', cliente_id: 'c1', numero: 4, valor_base: 10, status: 'pendente', data_vencimento: '2024-01-01' }, // vencida há menos tempo
      { id: 'p1', cliente_id: 'c1', numero: 5, valor_base: 10, valor_pago: 10, status: 'pago', data_vencimento: '2023-01-01' },
      { id: 'p2', cliente_id: 'c1', numero: 6, valor_base: 10, valor_pago: 10, status: 'pago', data_vencimento: '2024-06-01' }, // paga mais recente
    ]
    createClient.mockReturnValue(clientComParcelas(parcelas))
    const r = await consultarCobrancas({ telefone: '34999997499', limite: 10 })
    const ids = r.body.parcelas.map(p => p.numero)
    expect(ids).toEqual([3, 4, 2, 1, 6, 5])
  })
})

describe('consultarCobrancas — limite e prioridade de parâmetros', () => {
  it('limite padrão (não informado) é 5', async () => {
    const parcelas = Array.from({ length: 8 }, (_, i) => ({
      id: `p${i}`, cliente_id: 'c1', numero: i + 1, valor_base: 10, status: 'pendente', data_vencimento: '2099-01-01',
    }))
    createClient.mockReturnValue(fakePrimeClient({ clientes: [{ id: 'c1', nome: 'X', telefone: '34999997499' }], parcelas }))
    const r = await consultarCobrancas({ telefone: '34999997499' })
    expect(r.body.parcelas).toHaveLength(5)
  })

  it('limite mínimo (1) -> aceito', async () => {
    createClient.mockReturnValue(fakePrimeClient({
      clientes: [{ id: 'c1', nome: 'X', telefone: '34999997499' }],
      parcelas: [{ id: 'p1', cliente_id: 'c1', numero: 1, valor_base: 10, status: 'pendente', data_vencimento: '2099-01-01' }],
    }))
    const r = await consultarCobrancas({ telefone: '34999997499', limite: 1 })
    expect(r.httpStatus).toBe(200)
    expect(r.body.parcelas).toHaveLength(1)
  })

  it('limite no teto (10) -> aceito', async () => {
    const parcelas = Array.from({ length: 15 }, (_, i) => ({
      id: `p${i}`, cliente_id: 'c1', numero: i + 1, valor_base: 10, status: 'pendente', data_vencimento: '2099-01-01',
    }))
    createClient.mockReturnValue(fakePrimeClient({ clientes: [{ id: 'c1', nome: 'X', telefone: '34999997499' }], parcelas }))
    const r = await consultarCobrancas({ telefone: '34999997499', limite: 10 })
    expect(r.httpStatus).toBe(200)
    expect(r.body.parcelas).toHaveLength(10)
  })

  it('limite excedido (>10) -> rejeitado', async () => {
    const r = await consultarCobrancas({ telefone: '34999997499', limite: 11 })
    expect(r.httpStatus).toBe(400)
  })

  it('telefone e nome_cliente juntos -> telefone prevalece, nome ignorado', async () => {
    const client = fakePrimeClient({ clientes: [{ id: 'c1', nome: 'Rafael Teste', telefone: '34999997499' }], parcelas: [] })
    createClient.mockReturnValue(client)
    const r = await consultarCobrancas({ nome_cliente: 'Nome Qualquer', telefone: '34999997499' })
    expect(r.body.status).toBe('ok')
    expect(client.entities.Cliente.filter).toHaveBeenCalledWith({ telefone: '34999997499' })
    expect(client.entities.Cliente.filter).not.toHaveBeenCalledWith({ nome: 'Nome Qualquer' })
  })
})

describe('consultarCobrancas — erros e validação', () => {
  it('nem nome nem telefone -> rejeitado, nenhuma busca executada', async () => {
    const client = fakePrimeClient()
    createClient.mockReturnValue(client)
    const r = await consultarCobrancas({})
    expect(r.httpStatus).toBe(400)
    expect(client.entities.Cliente.filter).not.toHaveBeenCalled()
  })

  it('status inválido -> rejeitado', async () => {
    const r = await consultarCobrancas({ telefone: '34999997499', status: 'cancelada' })
    expect(r.httpStatus).toBe(400)
  })

  it('propriedade adicional não quebra a função (validação de schema real é no MCP_TOOLS/inputSchema)', async () => {
    createClient.mockReturnValue(fakePrimeClient({ clientes: [] }))
    const r = await consultarCobrancas({ nome_cliente: 'Alguem', campo_extra: 'x' })
    expect(r.httpStatus).toBe(200)
  })

  it('erro do Base44 (rejeita a Promise) -> erro controlado, sem stack trace ou mensagem interna do SDK', async () => {
    createClient.mockReturnValue({
      entities: {
        Cliente: { filter: vi.fn(async () => { throw new Error('timeout interno do SDK, detalhe sensível') }) },
        Parcela: { filter: vi.fn(async () => []) },
      },
    })
    const r = await consultarCobrancas({ telefone: '34999997499' })
    expect(r.body.status).toBe('erro')
    expect(JSON.stringify(r.body)).not.toContain('timeout interno do SDK')
  })

  it('BASE44_API_KEY ausente -> erro de configuração, nenhuma busca tentada', async () => {
    // BASE44_API_KEY é uma const de módulo capturada no import — pra simular a
    // variável realmente ausente, limpa o registro de módulos e reimporta a fresco.
    const original = process.env.BASE44_API_KEY
    delete process.env.BASE44_API_KEY
    vi.resetModules()
    const client = fakePrimeClient()
    createClient.mockReturnValue(client)
    const { consultarCobrancas: consultarSemChave } = await import('../_consultarCobrancas.js')
    const r = await consultarSemChave({ telefone: '34999997499' })
    expect(r.httpStatus).toBe(500)
    expect(client.entities.Cliente.filter).not.toHaveBeenCalled()
    process.env.BASE44_API_KEY = original
    vi.resetModules()
  })
})

describe('consultarCobrancas — verificação estática de somente leitura', () => {
  it('o código-fonte do helper não contém nenhuma chamada de escrita nem dependência da Lyra/WhatsApp', async () => {
    const fs = await import('node:fs')
    const codigo = fs.readFileSync(new URL('../_consultarCobrancas.js', import.meta.url), 'utf-8')
    expect(codigo).not.toMatch(/\.create\(/)
    expect(codigo).not.toMatch(/\.update\(/)
    expect(codigo).not.toMatch(/\.delete\(/)
    expect(codigo).not.toMatch(/gerarCobrancaLyra\(/)
    expect(codigo).not.toMatch(/enviarMensagemManualWhatsapp\(/)
    expect(codigo).not.toMatch(/whatsappProvider\(/)
    expect(codigo).not.toContain("'6a518d72335f3c31663dc63d'") // LYRA_APP_ID — nunca instanciado aqui
  })
})
