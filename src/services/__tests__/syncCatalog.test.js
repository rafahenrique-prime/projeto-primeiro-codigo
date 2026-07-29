/**
 * Teste de sincronização de catálogo — 100% isolado, nunca toca o Supabase real.
 *
 * Reescrito em 2026-07-29 depois de uma auditoria confirmar que a versão anterior deste
 * arquivo escrevia de verdade no Supabase de Produção (fazia `fetch` real usando
 * VITE_SUPABASE_URL/VITE_SUPABASE_KEY de `.env.local`, as mesmas credenciais do app em
 * produção). Isso criou uma 4ª duplicata do produto "Tênis New Balance 530 Marrom Claro"
 * (id ab156538-47d7-4496-bac3-ce7d3d189ee9, removido manualmente após confirmação de que
 * era um registro isolado, sem referência em `catalog_history` nem qualquer outra tabela).
 *
 * Duas proteções implementadas:
 *   A. Mock completo — VITE_SUPABASE_URL/KEY são sobrescritas para valores falsos
 *      (vi.stubEnv) ANTES do serviço ser importado, e `global.fetch` é substituído por
 *      um banco de dados falso em memória (nunca sai para a rede).
 *   B. Trava explícita — o próprio mock de fetch lança erro imediatamente se alguma
 *      chamada tentar atingir um host real do Supabase (`supabase.co`/`supabase.com`),
 *      mesmo que a proteção A falhe por algum motivo futuro. Nenhuma escrita chega a
 *      acontecer antes dessa checagem.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

const HOSTS_PROIBIDOS = ['supabase.co', 'supabase.com']

// Banco de dados falso em memória — sempre reiniciado a cada teste (beforeEach).
let bancoFalso = []
let proximoId = 1

function resetBancoFalso(produtosIniciais = []) {
  bancoFalso = produtosIniciais.map(p => ({ ...p }))
  proximoId = produtosIniciais.length + 1
}

// Simula o subconjunto da REST API do PostgREST usado por catalogSyncService.js —
// GET (select, com ?nome=eq./?id=eq.), POST (insert), PATCH (update por ?id=eq.).
// Trava explícita (Proteção B): qualquer URL de host real do Supabase lança erro ANTES
// de qualquer outra lógica — nunca cai silenciosamente pra rede de verdade.
function criarFetchMock() {
  return vi.fn(async (url, opts = {}) => {
    const urlStr = String(url)

    if (HOSTS_PROIBIDOS.some(h => urlStr.includes(h))) {
      throw new Error(
        `BLOQUEADO: teste tentou acessar um host real do Supabase (${urlStr}). ` +
        `Isso nunca deveria acontecer — a Proteção A (vi.stubEnv) deveria ter garantido ` +
        `que a URL usada pelo serviço fosse sempre a URL falsa de teste.`
      )
    }

    const method = opts.method || 'GET'
    const u = new URL(urlStr, 'http://mock-supabase.test')
    const params = u.searchParams

    const jsonResponse = (body, status = 200) => ({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name) => (name === 'content-range' ? `0-0/${bancoFalso.length}` : null) },
      json: async () => body,
    })

    // /api/log-history (logAction) — endpoint interno da Vercel, não é Supabase, e não é
    // a tabela `products`. Checado ANTES dos handlers genéricos de método pra não ser
    // capturado por engano pelo handler de POST de produtos.
    if (urlStr.includes('/api/log-history')) {
      return jsonResponse({ ok: true })
    }

    if (method === 'GET') {
      let resultado = bancoFalso
      const idEq = params.get('id')?.match(/^eq\.(.+)$/)?.[1]
      const nomeEq = params.get('nome')?.match(/^eq\.(.+)$/)?.[1]
      if (idEq) resultado = bancoFalso.filter(p => p.id === decodeURIComponent(idEq))
      if (nomeEq) resultado = bancoFalso.filter(p => p.nome === decodeURIComponent(nomeEq))
      return jsonResponse(resultado)
    }

    if (method === 'POST') {
      const dados = JSON.parse(opts.body)
      const novo = { id: `mock-${proximoId++}`, ...dados }
      bancoFalso.push(novo)
      return jsonResponse([novo], 201)
    }

    if (method === 'PATCH') {
      const idEq = params.get('id')?.match(/^eq\.(.+)$/)?.[1]
      const dados = JSON.parse(opts.body)
      const alvo = bancoFalso.find(p => p.id === decodeURIComponent(idEq || ''))
      if (alvo) Object.assign(alvo, dados)
      return jsonResponse(alvo ? [alvo] : [])
    }

    // /api/log-history (logAction) — endpoint interno da Vercel, não é Supabase, mas
    // também não deve gerar tráfego real num teste. Responde OK sem fazer nada.
    if (urlStr.includes('/api/log-history')) {
      return jsonResponse({ ok: true })
    }

    throw new Error(`Mock de fetch não implementa: ${method} ${urlStr}`)
  })
}

// --- Proteção A: env falso ANTES de importar o serviço (import dinâmico) ---
vi.stubEnv('VITE_SUPABASE_URL', 'https://mock-supabase.test')
vi.stubEnv('VITE_SUPABASE_KEY', 'mock-key-nunca-real')

let upsertProducts

beforeAll(async () => {
  // Import dinâmico DEPOIS do stubEnv — garante que o módulo capture a URL falsa,
  // nunca lê .env.local real.
  const mod = await import('../catalogo/catalogSyncService')
  upsertProducts = mod.upsertProducts
})

describe('🔒 Sincronização de Catálogo — isolada, sem tocar Supabase real', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', criarFetchMock())
  })

  it('nunca chama um host real do Supabase', async () => {
    resetBancoFalso([{ id: 'existente-1', nome: 'Produto Qualquer' }])
    await upsertProducts([{ nome: 'Produto Qualquer', price_original: 100, price_discount: 80, status: 'Ativo' }])

    for (const chamada of global.fetch.mock.calls) {
      const urlChamada = String(chamada[0])
      expect(HOSTS_PROIBIDOS.some(h => urlChamada.includes(h))).toBe(false)
    }
    expect(global.fetch.mock.calls.length).toBeGreaterThan(0) // confirma que o mock foi de fato usado
  })

  it('reconhece grafia divergente como o MESMO produto e não cria duplicata (regressão do bug de 2026-07-29)', async () => {
    resetBancoFalso([
      { id: 'existente-1', nome: 'Tênis New Balance 530 Marrom Claro', price_original: null, price_discount: null },
    ])

    const resultado = await upsertProducts([
      { nome: 'Tenis New Balance 530 Marron Claro', price_original: 499, price_discount: 449, status: 'Ativo' },
    ])

    expect(resultado.success).toBe(true)
    expect(resultado.inserted).toBe(0)
    expect(resultado.updated).toBe(1)

    const comEsseNome = bancoFalso.filter(p =>
      p.nome === 'Tênis New Balance 530 Marrom Claro' || p.nome === 'Tenis New Balance 530 Marron Claro'
    )
    expect(comEsseNome.length).toBe(1) // continua 1 — não duplicou
    expect(comEsseNome[0].price_discount).toBe(449) // valor foi atualizado no registro existente
  })

  it('produto genuinamente novo (nome sem correspondência) é inserido normalmente', async () => {
    resetBancoFalso([
      { id: 'existente-1', nome: 'Tênis New Balance 530 Marrom Claro' },
    ])

    const resultado = await upsertProducts([
      { nome: 'Produto Totalmente Novo XPTO 2026', price_original: 199, price_discount: 149, status: 'Ativo' },
    ])

    expect(resultado.success).toBe(true)
    expect(resultado.inserted).toBe(1)
    expect(resultado.updated).toBe(0)
    expect(bancoFalso.length).toBe(2)
  })
})
