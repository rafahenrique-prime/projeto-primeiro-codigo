import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { rodarAuditoriaQualidade, chaveIdentidade, calcularChaveExtra } from '../qualidade-catalogo-auditoria.mjs'

// O motor de qualidade (qualidadeCatalogoRules.js) é usado REAL, sem mock —
// esta suíte testa a camada de persistência (Fase 2B), nunca reimplementa
// nem recalibra as regras já congeladas.

let nextId = 1
function uuid() {
  return `uuid-${nextId++}`
}

function criarBancoFake() {
  return {
    shadowProducts: [],
    shadowVariations: [],
    runs: new Map(),
    findings: new Map(),
  }
}

function paginar(rows, url) {
  const u = new URL(url)
  const limit = Number(u.searchParams.get('limit') || rows.length)
  const offset = Number(u.searchParams.get('offset') || 0)
  return rows.slice(offset, offset + limit)
}

function instalarFetchFake(banco) {
  // Por padrão cada produto tem 1 variação (evita "sem_variacoes" poluir
  // testes que não são sobre essa regra específica) — só não preenche se o
  // teste já tiver definido shadowVariations explicitamente.
  if (banco.shadowVariations.length === 0) {
    banco.shadowVariations = banco.shadowProducts.map((p) => ({ id: `v-${p.id}`, shadow_product_id: p.id }))
  }
  global.fetch = vi.fn(async (url, opts = {}) => {
    const u = String(url)
    const method = opts.method || 'GET'

    if (u.includes('/shadow_products?') && method === 'GET') {
      return { ok: true, json: async () => paginar(banco.shadowProducts, u) }
    }
    if (u.includes('/shadow_product_variations?') && method === 'GET') {
      return { ok: true, json: async () => paginar(banco.shadowVariations, u) }
    }
    if (u.includes('/catalog_quality_audit_runs') && method === 'POST') {
      const [row] = JSON.parse(opts.body)
      const full = { id: uuid(), created_at: new Date().toISOString(), ...row }
      banco.runs.set(full.id, full)
      return { ok: true, json: async () => [full] }
    }
    if (u.match(/\/catalog_quality_audit_runs\?id=eq\.[^&]+$/) && method === 'PATCH') {
      const id = u.split('id=eq.')[1]
      const body = JSON.parse(opts.body)
      const existing = banco.runs.get(id)
      if (existing) Object.assign(existing, body)
      return { ok: true, json: async () => [] }
    }
    if (u.includes('/catalog_quality_findings?select=*') && method === 'GET') {
      return { ok: true, json: async () => paginar([...banco.findings.values()], u) }
    }
    if (u.includes('/catalog_quality_findings') && method === 'POST') {
      const [row] = JSON.parse(opts.body)
      const full = { id: uuid(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...row }
      banco.findings.set(full.id, full)
      return { ok: true, json: async () => [full] }
    }
    if (u.match(/\/catalog_quality_findings\?id=eq\.[^&]+$/) && method === 'PATCH') {
      const id = u.split('id=eq.')[1]
      const body = JSON.parse(opts.body)
      const existing = banco.findings.get(id)
      if (existing) Object.assign(existing, body)
      return { ok: true, json: async () => [] }
    }

    throw new Error('URL não mockada: ' + method + ' ' + u)
  })
}

function produto(overrides = {}) {
  return {
    id: 'sp-1',
    bagy_product_id: 1,
    nome: 'Produto Padrão',
    marca: 'Marca X',
    categoria_nome: 'Categoria X',
    preco: 100,
    preco_pix: 95,
    link: 'https://www.primestoremen.com.br/produto-padrao',
    imagem_principal: 'https://cdn.dooca.store/img.jpg',
    ativo: true,
    content_synced_at: null,
    ...overrides,
  }
}

describe('rodarAuditoriaQualidade — Fase 2B', () => {
  const originalEnv = { ...process.env }
  beforeEach(() => {
    process.env.VITE_SUPABASE_URL = 'https://fake.supabase.co'
    process.env.SUPABASE_SECRET_KEY = 'fake-key'
  })
  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  it('A) primeira ocorrência cria finding aberto', async () => {
    const banco = criarBancoFake()
    banco.shadowProducts = [produto({ id: 'sp-1', marca: null })] // marca_ausente
    instalarFetchFake(banco)

    await rodarAuditoriaQualidade()

    const findings = [...banco.findings.values()]
    expect(findings.length).toBe(1)
    expect(findings[0].tipo).toBe('marca_ausente')
    expect(findings[0].status).toBe('aberto')
    expect(findings[0].shadow_product_id).toBe('sp-1')
  })

  it('B) mesma ocorrência em segunda run NÃO duplica', async () => {
    const banco = criarBancoFake()
    banco.shadowProducts = [produto({ id: 'sp-1', marca: null })]
    instalarFetchFake(banco)

    await rodarAuditoriaQualidade()
    await rodarAuditoriaQualidade()

    expect(banco.findings.size).toBe(1)
  })

  it('C) last_seen_at/last_run_id são atualizados na 2ª run', async () => {
    const banco = criarBancoFake()
    banco.shadowProducts = [produto({ id: 'sp-1', marca: null })]
    instalarFetchFake(banco)

    const r1 = await rodarAuditoriaQualidade()
    await new Promise((r) => setTimeout(r, 5))
    const r2 = await rodarAuditoriaQualidade()

    const finding = [...banco.findings.values()][0]
    expect(finding.last_run_id).toBe(r2.run.id)
    expect(finding.last_run_id).not.toBe(r1.run.id)
    expect(finding.first_run_id).toBe(r1.run.id) // identidade original preservada
  })

  it('D) finding ignorado continua ignorado se reaparecer', async () => {
    const banco = criarBancoFake()
    banco.shadowProducts = [produto({ id: 'sp-1', marca: null })]
    instalarFetchFake(banco)

    await rodarAuditoriaQualidade()
    const finding = [...banco.findings.values()][0]
    finding.status = 'ignorado' // simula ação manual do usuário

    await rodarAuditoriaQualidade()
    const findingDepois = [...banco.findings.values()][0]
    expect(findingDepois.status).toBe('ignorado') // NUNCA reabre sozinho
  })

  it('E) finding desaparece em run COMPLETA → resolvido', async () => {
    const banco = criarBancoFake()
    banco.shadowProducts = [produto({ id: 'sp-1', marca: null })]
    instalarFetchFake(banco)

    await rodarAuditoriaQualidade()
    banco.shadowProducts[0].marca = 'Marca X' // corrigido — achado não deve mais aparecer
    const r2 = await rodarAuditoriaQualidade()

    const finding = [...banco.findings.values()][0]
    expect(finding.status).toBe('resolvido')
    expect(finding.resolved_at).toBeTruthy()
    expect(r2.resumo.resolvidosAutomaticamente).toBe(1)
  })

  it('F) finding desaparece em run INCOMPLETA/com falha → NÃO resolvido', async () => {
    const banco = criarBancoFake()
    banco.shadowProducts = [produto({ id: 'sp-1', marca: null })]
    instalarFetchFake(banco)
    await rodarAuditoriaQualidade()

    // 2ª execução: simula falha na leitura do Catálogo V2 (rede/Supabase)
    global.fetch = vi.fn(async (url, opts = {}) => {
      const u = String(url)
      if (u.includes('/shadow_products?') && (opts.method || 'GET') === 'GET') {
        throw new Error('fetch falhou: timeout')
      }
      if (u.includes('/catalog_quality_audit_runs') && opts.method === 'POST') {
        const [row] = JSON.parse(opts.body)
        const full = { id: uuid(), created_at: new Date().toISOString(), ...row }
        banco.runs.set(full.id, full)
        return { ok: true, json: async () => [full] }
      }
      throw new Error('URL não mockada nesta simulação de falha: ' + u)
    })

    const r2 = await rodarAuditoriaQualidade()
    expect(r2.ok).toBe(false)
    expect(r2.run.status).toBe('falha')

    const finding = [...banco.findings.values()][0]
    expect(finding.status).toBe('aberto') // NUNCA resolvido por uma run que falhou
  })

  it('G) finding resolvido reaparece → reabre como aberto, sem duplicar identidade', async () => {
    const banco = criarBancoFake()
    banco.shadowProducts = [produto({ id: 'sp-1', marca: null })]
    instalarFetchFake(banco)

    await rodarAuditoriaQualidade()
    banco.shadowProducts[0].marca = 'Marca X'
    await rodarAuditoriaQualidade() // resolve
    expect([...banco.findings.values()][0].status).toBe('resolvido')

    banco.shadowProducts[0].marca = null // volta a dar problema
    const r3 = await rodarAuditoriaQualidade()

    expect(banco.findings.size).toBe(1) // mesma identidade, nunca duplicou
    const finding = [...banco.findings.values()][0]
    expect(finding.status).toBe('aberto')
    expect(finding.resolved_at).toBeNull()
    expect(r3.resumo.reabertos).toBe(1)
  })

  it('H) dois tipos de problema no mesmo produto são findings independentes', async () => {
    const banco = criarBancoFake()
    banco.shadowProducts = [produto({ id: 'sp-1', marca: null, categoria_nome: null })]
    instalarFetchFake(banco)

    await rodarAuditoriaQualidade()
    const findings = [...banco.findings.values()]
    expect(findings.length).toBe(2)
    expect(findings.map((f) => f.tipo).sort()).toEqual(['categoria_ausente', 'marca_ausente'])
  })

  it('I) content_synced_at NULL é aceito e persistido como contexto, sem virar erro', async () => {
    const banco = criarBancoFake()
    banco.shadowProducts = [produto({ id: 'sp-1', marca: null, content_synced_at: null })]
    instalarFetchFake(banco)

    const r = await rodarAuditoriaQualidade()
    expect(r.ok).toBe(true)
    const finding = [...banco.findings.values()][0]
    expect(finding.content_synced_at).toBeNull()
  })

  it('J) SUGESTAO continua SUGESTAO (nunca vira FATO/ALERTA na persistência)', async () => {
    const banco = criarBancoFake()
    banco.shadowProducts = [
      produto({ id: 'sp-1', bagy_product_id: 1, nome: 'Bermuda Diesel Vermelha' }),
      produto({ id: 'sp-2', bagy_product_id: 2, nome: 'Bermudas Diesel Vermelha' }),
    ]
    instalarFetchFake(banco)

    await rodarAuditoriaQualidade()
    const findings = [...banco.findings.values()].filter((f) => f.tipo === 'quase_duplicado')
    expect(findings.length).toBe(2) // 1 por produto, pares distintos
    for (const f of findings) expect(f.classe).toBe('SUGESTAO')
  })

  it('K) produto inativo NÃO entra na auditoria (fora da fila ativa)', async () => {
    const banco = criarBancoFake()
    banco.shadowProducts = [
      produto({ id: 'sp-1', ativo: true, marca: null }),
      produto({ id: 'sp-2', ativo: false, marca: null }),
    ]
    instalarFetchFake(banco)

    const r = await rodarAuditoriaQualidade()
    expect(r.resumo.totalAtivosAnalisados).toBe(1)
    expect([...banco.findings.values()].every((f) => f.shadow_product_id === 'sp-1')).toBe(true)
  })

  it('L) produto sem nenhum achado não gera finding nenhum', async () => {
    const banco = criarBancoFake()
    banco.shadowProducts = [produto({ id: 'sp-1' })] // bem formado
    banco.shadowVariations = [{ id: 'v1', shadow_product_id: 'sp-1' }]
    instalarFetchFake(banco)

    const r = await rodarAuditoriaQualidade()
    expect(r.resumo.comAchados).toBe(0)
    expect(banco.findings.size).toBe(0)
  })

  it('chaveIdentidade nunca usa a mensagem textual como identidade', () => {
    const achado = { tipo: 'marca_ausente', mensagem: 'Marca ausente', encontrado: 'campo marca vazio' }
    const chave = chaveIdentidade('sp-1', achado)
    expect(chave).toBe('sp-1::marca_ausente::')
    expect(calcularChaveExtra(achado)).toBe('')
  })

  it('chaveIdentidade de quase_duplicado usa o bagy_product_id do parceiro como chave extra (nunca colide entre parceiros diferentes)', () => {
    const a1 = { tipo: 'quase_duplicado', encontrado: '"X" muito parecido com "Y" (bagy_product_id 5)' }
    const a2 = { tipo: 'quase_duplicado', encontrado: '"X" muito parecido com "Z" (bagy_product_id 9)' }
    expect(calcularChaveExtra(a1)).toBe('5')
    expect(calcularChaveExtra(a2)).toBe('9')
    expect(chaveIdentidade('sp-1', a1)).not.toBe(chaveIdentidade('sp-1', a2))
  })
})
