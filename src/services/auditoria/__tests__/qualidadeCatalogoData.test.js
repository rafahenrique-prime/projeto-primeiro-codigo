// Testes de src/services/auditoria/qualidadeCatalogoData.js — 100% isolado,
// nunca faz rede real. global.fetch é substituído por um mock que só
// inspeciona a URL/método/body chamados e devolve uma resposta fabricada —
// mesmo padrão de teste de camada de dados já usado no projeto (mock de
// fetch + asserts sobre a chamada, ver src/services/__tests__/syncCatalog.test.js).
//
// Cobre só a cola HTTP desta camada (monta a URL/params certos, repassa só
// filtros definidos, rejeita 'resolvido' antes da rede, propaga erro) — a
// lógica de negócio das rotas já tem sua própria suíte completa em
// api/__tests__/systemToolsQualidadeCatalogo.test.js e
// scripts/__tests__/qualidade-catalogo-auditoria.test.js.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getQualitySummary,
  getQualityRunHistory,
  getQualityFindings,
  runQualityAudit,
  setFindingStatus,
} from '../qualidadeCatalogoData.js'

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

beforeEach(() => {
  global.fetch = vi.fn()
})

describe('getQualitySummary', () => {
  it('A) monta a chamada correta (GET, sem ?historico) e devolve ultimaRun', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ ultimaRun: { id: 'run-1', status: 'completa' } }))
    const resultado = await getQualitySummary()

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/system-tools?tool=catalog-quality-audit-summary')
    expect(opts).toBeUndefined()
    expect(resultado).toEqual({ id: 'run-1', status: 'completa' })
  })

  it('devolve null quando ultimaRun vem ausente/null (nenhuma auditoria ainda)', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ ultimaRun: null }))
    expect(await getQualitySummary()).toBeNull()
  })
})

describe('getQualityRunHistory', () => {
  it('B) preserva limit/offset e liga ?historico=1', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ runs: [{ id: 'run-2' }, { id: 'run-1' }] }))
    const resultado = await getQualityRunHistory({ limit: 5, offset: 10 })

    const [url] = global.fetch.mock.calls[0]
    const parsed = new URL(url, 'http://localhost')
    expect(parsed.pathname).toBe('/api/system-tools')
    expect(parsed.searchParams.get('tool')).toBe('catalog-quality-audit-summary')
    expect(parsed.searchParams.get('historico')).toBe('1')
    expect(parsed.searchParams.get('limit')).toBe('5')
    expect(parsed.searchParams.get('offset')).toBe('10')
    expect(resultado).toEqual([{ id: 'run-2' }, { id: 'run-1' }])
  })

  it('usa limit=20/offset=0 como padrão quando chamado sem argumentos', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ runs: [] }))
    await getQualityRunHistory()
    const [url] = global.fetch.mock.calls[0]
    const parsed = new URL(url, 'http://localhost')
    expect(parsed.searchParams.get('limit')).toBe('20')
    expect(parsed.searchParams.get('offset')).toBe('0')
  })
})

describe('getQualityFindings', () => {
  it('C) envia somente os filtros definidos (nenhum outro filtro presente na URL)', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ findings: [] }))
    await getQualityFindings({ status: 'aberto' })

    const [url] = global.fetch.mock.calls[0]
    const parsed = new URL(url, 'http://localhost')
    expect(parsed.searchParams.get('status')).toBe('aberto')
    expect(parsed.searchParams.has('severidade')).toBe(false)
    expect(parsed.searchParams.has('classe')).toBe(false)
    expect(parsed.searchParams.has('tipo')).toBe(false)
    expect(parsed.searchParams.has('bagyProductId')).toBe(false)
    expect(parsed.searchParams.has('nome')).toBe(false)
    // limit/offset sempre presentes (têm default)
    expect(parsed.searchParams.get('limit')).toBe('50')
    expect(parsed.searchParams.get('offset')).toBe('0')
  })

  it('D) busca por nome é corretamente codificada na URL', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ findings: [] }))
    await getQualityFindings({ nome: 'Bermuda Diesel & Cia' })

    const [url] = global.fetch.mock.calls[0]
    const parsed = new URL(url, 'http://localhost')
    expect(parsed.searchParams.get('nome')).toBe('Bermuda Diesel & Cia')
  })

  it('E) bagyProductId é corretamente enviado (convertido pra string)', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ findings: [] }))
    await getQualityFindings({ bagyProductId: 10234 })

    const [url] = global.fetch.mock.calls[0]
    const parsed = new URL(url, 'http://localhost')
    expect(parsed.searchParams.get('bagyProductId')).toBe('10234')
  })

  it('repassa todos os filtros quando todos são informados', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ findings: [{ id: 'f-1' }] }))
    const resultado = await getQualityFindings({
      status: 'aberto', severidade: 'CRITICO', classe: 'FATO', tipo: 'marca_ausente',
      bagyProductId: '999', nome: 'Boné', limit: 10, offset: 20,
    })

    const [url] = global.fetch.mock.calls[0]
    const parsed = new URL(url, 'http://localhost')
    expect(parsed.searchParams.get('status')).toBe('aberto')
    expect(parsed.searchParams.get('severidade')).toBe('CRITICO')
    expect(parsed.searchParams.get('classe')).toBe('FATO')
    expect(parsed.searchParams.get('tipo')).toBe('marca_ausente')
    expect(parsed.searchParams.get('bagyProductId')).toBe('999')
    expect(parsed.searchParams.get('nome')).toBe('Boné')
    expect(parsed.searchParams.get('limit')).toBe('10')
    expect(parsed.searchParams.get('offset')).toBe('20')
    expect(resultado).toEqual([{ id: 'f-1' }])
  })

  it('devolve array vazio quando findings vem ausente', async () => {
    global.fetch.mockResolvedValue(jsonResponse({}))
    expect(await getQualityFindings()).toEqual([])
  })
})

describe('runQualityAudit', () => {
  it('F) usa POST e envia actionSecret corretamente, nunca em querystring', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ ok: true, run: { id: 'run-1' }, resumo: { totalFindings: 5 } }))
    const resultado = await runQualityAudit('senha-secreta-123')

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/system-tools?tool=catalog-quality-audit-run')
    expect(url).not.toContain('senha-secreta-123')
    expect(opts.method).toBe('POST')
    expect(opts.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(opts.body)).toEqual({ actionSecret: 'senha-secreta-123' })
    expect(resultado).toEqual({ ok: true, run: { id: 'run-1' }, resumo: { totalFindings: 5 } })
  })

  it('devolve o corpo completo mesmo quando ok:false (run falhou, ainda HTTP 200)', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ ok: false, run: { status: 'falha' }, motivo: 'boom' }))
    const resultado = await runQualityAudit('senha')
    expect(resultado).toEqual({ ok: false, run: { status: 'falha' }, motivo: 'boom' })
  })
})

describe('setFindingStatus', () => {
  it('G) aceita "aberto" e chama a rota corretamente', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ success: true, finding: { id: 'f-1', status: 'aberto' } }))
    const resultado = await setFindingStatus('f-1', 'aberto', 'senha')

    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/system-tools?tool=catalog-quality-finding-status')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({ id: 'f-1', status: 'aberto', actionSecret: 'senha' })
    expect(resultado).toEqual({ id: 'f-1', status: 'aberto' })
  })

  it('H) aceita "ignorado" e chama a rota corretamente', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ success: true, finding: { id: 'f-1', status: 'ignorado' } }))
    const resultado = await setFindingStatus('f-1', 'ignorado', 'senha')

    const [, opts] = global.fetch.mock.calls[0]
    expect(JSON.parse(opts.body)).toEqual({ id: 'f-1', status: 'ignorado', actionSecret: 'senha' })
    expect(resultado).toEqual({ id: 'f-1', status: 'ignorado' })
  })

  it('I) rejeita "resolvido" ANTES da chamada HTTP (zero fetch)', async () => {
    await expect(setFindingStatus('f-1', 'resolvido', 'senha')).rejects.toThrow(/aberto, ignorado/)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('I) rejeita qualquer outro valor não previsto, também sem chamar fetch', async () => {
    await expect(setFindingStatus('f-1', 'qualquer-coisa', 'senha')).rejects.toThrow(/status inválido/)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe('J) propagação de erro HTTP', () => {
  it('getQualityFindings: HTTP não-ok com body.error → lança body.error', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ error: 'status_invalido' }, 400))
    await expect(getQualityFindings({ status: 'xyz' })).rejects.toThrow('status_invalido')
  })

  it('runQualityAudit: HTTP não-ok (401, sem actionSecret válido) → lança erro', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ error: 'não autorizado' }, 401))
    await expect(runQualityAudit('senha-errada')).rejects.toThrow('não autorizado')
  })

  it('setFindingStatus: HTTP 404 (finding não encontrado) → lança erro', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ error: 'finding não encontrado' }, 404))
    await expect(setFindingStatus('f-inexistente', 'ignorado', 'senha')).rejects.toThrow('finding não encontrado')
  })
})

describe('K) ausência/erro de JSON no corpo da resposta não quebra o tratamento de erro', () => {
  it('HTTP não-ok e corpo não é JSON válido → usa fallback "HTTP <status>"', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => { throw new Error('corpo não é JSON') },
    })
    await expect(getQualitySummary()).rejects.toThrow('HTTP 500')
  })

  it('HTTP ok mas corpo vazio/sem campo esperado → devolve fallback vazio, não lança', async () => {
    global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    expect(await getQualityRunHistory()).toEqual([])
    expect(await getQualityFindings()).toEqual([])
  })
})
