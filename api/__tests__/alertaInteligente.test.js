import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  normalizePhoneDigits,
  phonesEquivalent,
  findChatByPhone,
  parseSummaryJson,
  buildEnrichedMessage,
  buildDedupKey,
  FALLBACK_MESSAGE,
  processarAlertaInteligente,
} from '../alerta-inteligente.js'

/**
 * api/__tests__/alertaInteligente.test.js
 *
 * Testes 100% locais — fetch é sempre injetado via deps.fetchImpl, NUNCA a
 * rede real do GPT Maker/Groq/Telegram/Supabase é tocada. Mesmo padrão de
 * toolConsultarProduto.test.js.
 */

const SECRET = 'segredo-de-teste-32-caracteres!!'

function baseDeps(overrides = {}) {
  return {
    expectedSecret: SECRET,
    gptmakerToken: 'gptmaker-token-fake',
    workspace: 'ws-fake',
    groqApiKey: 'groq-key-fake',
    telegramBotToken: 'telegram-token-fake',
    telegramChatId: 'telegram-chat-fake',
    supabaseUrl: 'https://mock-project.supabase.co',
    supabaseKey: 'supabase-key-fake',
    ...overrides,
  }
}

const SECRET_VALUES = [
  'segredo-de-teste-32-caracteres!!',
  'gptmaker-token-fake',
  'groq-key-fake',
  'telegram-token-fake',
  'supabase-key-fake',
]

// Fábrica de fetchImpl que roteia por URL — cada teste passa só os handlers
// que precisa; o resto responde com "não configurado para este teste".
function makeFetchRouter({
  chatsPages = [[]],
  messagesByChatId = {},
  groqResponse = null,
  groqOk = true,
  telegramOk = true,
  telegramStatus = 200,
  dedupExists = false,
} = {}) {
  return vi.fn(async (url, opts) => {
    if (url.includes('/v2/workspace/')) {
      const pageMatch = /page=(\d+)/.exec(url)
      const page = pageMatch ? parseInt(pageMatch[1], 10) : 1
      const data = chatsPages[page - 1] || []
      return { ok: true, json: async () => data }
    }
    if (url.includes('/v2/chat/') && url.includes('/messages')) {
      const idMatch = /\/v2\/chat\/([^/]+)\/messages/.exec(url)
      const chatId = idMatch ? idMatch[1] : null
      return { ok: true, json: async () => messagesByChatId[chatId] || [] }
    }
    if (url.includes('api.groq.com')) {
      if (!groqOk) return { ok: false, status: 500, json: async () => ({}) }
      return { ok: true, json: async () => (groqResponse ?? { choices: [] }) }
    }
    if (url.includes('api.telegram.org')) {
      if (!telegramOk) return { ok: false, status: telegramStatus, text: async () => 'erro telegram' }
      return { ok: true, json: async () => ({ ok: true }) }
    }
    if (url.includes('codex_alerts') && (!opts || opts.method === undefined || opts.method === 'GET')) {
      return { ok: true, json: async () => (dedupExists ? [{ id: 1 }] : []) }
    }
    if (url.includes('codex_alerts') && opts?.method === 'POST') {
      return { ok: true, json: async () => ({}) }
    }
    throw new Error(`URL não mapeada no teste: ${url}`)
  })
}

const CHAT_FIXTURE = { id: 'chat-real-123', whatsappPhone: '5534999998888', name: 'Cliente Teste' }

const MESSAGES_FIXTURE = [
  { role: 'client', text: 'Oi, o tênis Nike Dunk tem no 39?', id: 'm1' },
  { role: 'assistant', text: 'Deixa eu verificar', id: 'm2' },
  { role: 'client', text: 'Quero falar com um atendente, é urgente', id: 'm3' },
]

describe('normalizePhoneDigits', () => {
  it('remove tudo que não é dígito, sem inventar DDI', () => {
    expect(normalizePhoneDigits('(34) 99999-8888')).toBe('34999998888')
    expect(normalizePhoneDigits('+55 34 99999-8888')).toBe('5534999998888')
    expect(normalizePhoneDigits('')).toBe('')
    expect(normalizePhoneDigits(null)).toBe('')
    expect(normalizePhoneDigits(undefined)).toBe('')
  })
})

describe('phonesEquivalent', () => {
  it('aceita match exato', () => {
    expect(phonesEquivalent('34999998888', '34999998888')).toBe(true)
  })
  it('aceita variante com/sem prefixo 55 quando inequívoco', () => {
    expect(phonesEquivalent('5534999998888', '34999998888')).toBe(true)
    expect(phonesEquivalent('34999998888', '5534999998888')).toBe(true)
  })
  it('rejeita números diferentes', () => {
    expect(phonesEquivalent('34999998888', '34999997777')).toBe(false)
  })
  it('rejeita comparação com string vazia', () => {
    expect(phonesEquivalent('', '34999998888')).toBe(false)
    expect(phonesEquivalent('34999998888', '')).toBe(false)
  })
})

describe('findChatByPhone', () => {
  it('encontra o chat único correspondente', () => {
    const chats = [CHAT_FIXTURE, { id: 'outro', whatsappPhone: '34988887777' }]
    const r = findChatByPhone(chats, '5534999998888')
    expect(r.chat?.id).toBe('chat-real-123')
    expect(r.ambiguous).toBe(false)
  })

  it('não encontra e não é ambíguo quando nenhum bate', () => {
    const r = findChatByPhone([{ id: 'x', whatsappPhone: '34911112222' }], '5534999998888')
    expect(r.chat).toBeNull()
    expect(r.ambiguous).toBe(false)
  })

  it('correspondência ambígua nunca escolhe arbitrariamente', () => {
    // dois chats diferentes cujo número, por alguma inconsistência de cadastro,
    // batem de forma equivalente com o mesmo telefone normalizado buscado
    const chats = [
      { id: 'chat-A', whatsappPhone: '34999998888' },
      { id: 'chat-B', whatsappPhone: '5534999998888' },
    ]
    const r = findChatByPhone(chats, '34999998888')
    expect(r.chat).toBeNull()
    expect(r.ambiguous).toBe(true)
  })
})

describe('parseSummaryJson', () => {
  it('parseia JSON válido com todos os campos', () => {
    const raw = JSON.stringify({
      motivo_transferencia: 'quer falar com atendente',
      produto_mencionado: 'Tênis Nike Dunk',
      tamanho_mencionado: '39',
      ultima_pergunta_cliente: 'tem no 39?',
      resumo_breve: 'Cliente perguntou sobre tamanho e pediu atendente.',
    })
    const r = parseSummaryJson(raw)
    expect(r.produto_mencionado).toBe('Tênis Nike Dunk')
    expect(r.tamanho_mencionado).toBe('39')
    expect(r.resumo_breve).toContain('atendente')
  })

  it('campos ausentes/vazios viram null (nunca inventa)', () => {
    const raw = JSON.stringify({ resumo_breve: 'só isso' })
    const r = parseSummaryJson(raw)
    expect(r.motivo_transferencia).toBeNull()
    expect(r.produto_mencionado).toBeNull()
    expect(r.tamanho_mencionado).toBeNull()
    expect(r.ultima_pergunta_cliente).toBeNull()
  })

  it('JSON inválido retorna null (não quebra, cai no fallback)', () => {
    expect(parseSummaryJson('isso não é json')).toBeNull()
    expect(parseSummaryJson('{"quebrado": ')).toBeNull()
  })

  it('array ou não-objeto retorna null', () => {
    expect(parseSummaryJson('[1,2,3]')).toBeNull()
    expect(parseSummaryJson('"string solta"')).toBeNull()
    expect(parseSummaryJson(null)).toBeNull()
    expect(parseSummaryJson(undefined)).toBeNull()
  })

  it('tolera bloco ```json ... ``` que alguns modelos retornam', () => {
    const raw = '```json\n{"resumo_breve": "ok"}\n```'
    expect(parseSummaryJson(raw).resumo_breve).toBe('ok')
  })
})

describe('buildEnrichedMessage', () => {
  it('omite campos null/vazios sem inventar', () => {
    const summary = { motivo_transferencia: null, produto_mencionado: null, tamanho_mencionado: null, ultima_pergunta_cliente: null, resumo_breve: '' }
    const msg = buildEnrichedMessage(summary, '5534999998888')
    expect(msg).toContain('CLIENTE PRECISA DE ATENDIMENTO')
    expect(msg).toContain('5534999998888')
    expect(msg).not.toContain('Interesse')
    expect(msg).not.toContain('Tamanho')
    expect(msg).not.toContain('Resumo')
  })

  it('inclui só os campos preenchidos', () => {
    const summary = { motivo_transferencia: 'quer atendente', produto_mencionado: 'Tênis X', tamanho_mencionado: null, ultima_pergunta_cliente: null, resumo_breve: 'resumo aqui' }
    const msg = buildEnrichedMessage(summary, '5534999998888')
    expect(msg).toContain('Tênis X')
    expect(msg).toContain('quer atendente')
    expect(msg).toContain('resumo aqui')
    expect(msg).not.toContain('Tamanho')
  })
})

describe('buildDedupKey', () => {
  it('usa chat.id + identificador da última mensagem do cliente', () => {
    const key = buildDedupKey(CHAT_FIXTURE, MESSAGES_FIXTURE)
    expect(key).toBe('chat-real-123:m3')
  })

  it('muda quando o cliente manda uma nova mensagem (novo handoff legítimo)', () => {
    const novaMensagem = [...MESSAGES_FIXTURE, { role: 'client', text: 'Alô?', id: 'm4' }]
    const key1 = buildDedupKey(CHAT_FIXTURE, MESSAGES_FIXTURE)
    const key2 = buildDedupKey(CHAT_FIXTURE, novaMensagem)
    expect(key1).not.toBe(key2)
  })
})

describe('processarAlertaInteligente — secret', () => {
  it('secret correto prossegue (chat não encontrado → fallback, mas não 401)', async () => {
    const fetchImpl = makeFetchRouter({ chatsPages: [[]] })
    const r = await processarAlertaInteligente({ secret: SECRET, telefone: '34999998888' }, baseDeps({ fetchImpl }))
    expect(r.status).not.toBe('unauthorized')
  })

  it('secret ausente → unauthorized', async () => {
    const fetchImpl = makeFetchRouter()
    const r = await processarAlertaInteligente({ telefone: '34999998888' }, baseDeps({ fetchImpl }))
    expect(r.status).toBe('unauthorized')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('secret inválido → unauthorized', async () => {
    const fetchImpl = makeFetchRouter()
    const r = await processarAlertaInteligente({ secret: 'errado', telefone: '34999998888' }, baseDeps({ fetchImpl }))
    expect(r.status).toBe('unauthorized')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('processarAlertaInteligente — telefone e localização de chat', () => {
  it('telefone com e sem 55 localizam o mesmo chat', async () => {
    for (const telefone of ['34999998888', '5534999998888']) {
      const fetchImpl = makeFetchRouter({
        chatsPages: [[CHAT_FIXTURE]],
        messagesByChatId: { 'chat-real-123': MESSAGES_FIXTURE },
        groqOk: false, // força fallback_resumo, mas ainda precisa ter localizado o chat certo
      })
      const r = await processarAlertaInteligente({ secret: SECRET, telefone }, baseDeps({ fetchImpl }))
      expect(r.chatId).toBe('chat-real-123')
    }
  })

  it('correspondência ambígua cai no fallback simples, nunca escolhe arbitrariamente', async () => {
    const chats = [
      { id: 'chat-A', whatsappPhone: '34999998888' },
      { id: 'chat-B', whatsappPhone: '5534999998888' },
    ]
    const fetchImpl = makeFetchRouter({ chatsPages: [chats] })
    const r = await processarAlertaInteligente({ secret: SECRET, telefone: '34999998888' }, baseDeps({ fetchImpl }))
    expect(r.status).toBe('sent')
    expect(r.modo).toBe('fallback_simples')
    expect(r.motivo).toBe('telefone_ambiguo')
  })

  it('chat não encontrado cai no fallback simples', async () => {
    const fetchImpl = makeFetchRouter({ chatsPages: [[{ id: 'outro', whatsappPhone: '34911112222' }]] })
    const r = await processarAlertaInteligente({ secret: SECRET, telefone: '34999998888' }, baseDeps({ fetchImpl }))
    expect(r.status).toBe('sent')
    expect(r.modo).toBe('fallback_simples')
    expect(r.motivo).toBe('chat_nao_encontrado')
  })

  it('pagina a listagem de chats até encontrar o telefone', async () => {
    const page1 = Array.from({ length: 50 }, (_, i) => ({ id: `chat-${i}`, whatsappPhone: `3491100${String(i).padStart(4, '0')}` }))
    const fetchImpl = makeFetchRouter({
      chatsPages: [page1, [CHAT_FIXTURE]],
      messagesByChatId: { 'chat-real-123': MESSAGES_FIXTURE },
      groqOk: false,
    })
    const r = await processarAlertaInteligente({ secret: SECRET, telefone: '34999998888' }, baseDeps({ fetchImpl }))
    expect(r.chatId).toBe('chat-real-123')
  })
})

describe('processarAlertaInteligente — mensagens e resumo', () => {
  it('mensagens vazias caem no fallback simples', async () => {
    const fetchImpl = makeFetchRouter({ chatsPages: [[CHAT_FIXTURE]], messagesByChatId: {} })
    const r = await processarAlertaInteligente({ secret: SECRET, telefone: '34999998888' }, baseDeps({ fetchImpl }))
    expect(r.status).toBe('sent')
    expect(r.modo).toBe('fallback_simples')
    expect(r.motivo).toBe('sem_mensagens')
  })

  it('Groq funcionando gera alerta inteligente enriquecido', async () => {
    const fetchImpl = makeFetchRouter({
      chatsPages: [[CHAT_FIXTURE]],
      messagesByChatId: { 'chat-real-123': MESSAGES_FIXTURE },
      groqResponse: { choices: [{ message: { content: JSON.stringify({ resumo_breve: 'Cliente pediu atendente.', motivo_transferencia: 'pediu atendente', produto_mencionado: null, tamanho_mencionado: null, ultima_pergunta_cliente: null }) } }] },
    })
    const r = await processarAlertaInteligente({ secret: SECRET, telefone: '34999998888' }, baseDeps({ fetchImpl }))
    expect(r.status).toBe('sent')
    expect(r.modo).toBe('inteligente')
  })

  it('Groq falhando cai no alerta simples, mas ainda tenta entregar via Telegram', async () => {
    const fetchImpl = makeFetchRouter({
      chatsPages: [[CHAT_FIXTURE]],
      messagesByChatId: { 'chat-real-123': MESSAGES_FIXTURE },
      groqOk: false,
    })
    const r = await processarAlertaInteligente({ secret: SECRET, telefone: '34999998888' }, baseDeps({ fetchImpl }))
    expect(r.status).toBe('sent')
    expect(r.modo).toBe('fallback_resumo')
  })

  it('JSON inválido do LLM cai no alerta simples', async () => {
    const fetchImpl = makeFetchRouter({
      chatsPages: [[CHAT_FIXTURE]],
      messagesByChatId: { 'chat-real-123': MESSAGES_FIXTURE },
      groqResponse: { choices: [{ message: { content: 'não é json' } }] },
    })
    const r = await processarAlertaInteligente({ secret: SECRET, telefone: '34999998888' }, baseDeps({ fetchImpl }))
    expect(r.modo).toBe('fallback_resumo')
  })

  it('resumo com todos os campos null ainda é modo inteligente (sem inventar dado)', async () => {
    const fetchImpl = makeFetchRouter({
      chatsPages: [[CHAT_FIXTURE]],
      messagesByChatId: { 'chat-real-123': MESSAGES_FIXTURE },
      groqResponse: { choices: [{ message: { content: JSON.stringify({ resumo_breve: '' }) } }] },
    })
    const r = await processarAlertaInteligente({ secret: SECRET, telefone: '34999998888' }, baseDeps({ fetchImpl }))
    expect(r.modo).toBe('inteligente')
  })
})

describe('processarAlertaInteligente — Telegram', () => {
  it('Telegram sucesso registra dedup', async () => {
    const fetchImpl = makeFetchRouter({
      chatsPages: [[CHAT_FIXTURE]],
      messagesByChatId: { 'chat-real-123': MESSAGES_FIXTURE },
      groqOk: false,
      telegramOk: true,
    })
    const r = await processarAlertaInteligente({ secret: SECRET, telefone: '34999998888' }, baseDeps({ fetchImpl }))
    expect(r.status).toBe('sent')

    const dedupPost = fetchImpl.mock.calls.find(([url, opts]) => url.includes('codex_alerts') && opts?.method === 'POST')
    expect(dedupPost).toBeTruthy()
  })

  it('Telegram falha → status telegram_failed, NUNCA registra dedup', async () => {
    const fetchImpl = makeFetchRouter({
      chatsPages: [[CHAT_FIXTURE]],
      messagesByChatId: { 'chat-real-123': MESSAGES_FIXTURE },
      groqOk: false,
      telegramOk: false,
      telegramStatus: 429,
    })
    const r = await processarAlertaInteligente({ secret: SECRET, telefone: '34999998888' }, baseDeps({ fetchImpl }))
    expect(r.status).toBe('telegram_failed')

    const dedupPost = fetchImpl.mock.calls.find(([url, opts]) => url.includes('codex_alerts') && opts?.method === 'POST')
    expect(dedupPost).toBeFalsy()
  })
})

describe('processarAlertaInteligente — deduplicação', () => {
  it('mesma situação (mesma última mensagem do cliente) não reenvia', async () => {
    const fetchImpl = makeFetchRouter({
      chatsPages: [[CHAT_FIXTURE]],
      messagesByChatId: { 'chat-real-123': MESSAGES_FIXTURE },
      groqOk: false,
      dedupExists: true,
    })
    const r = await processarAlertaInteligente({ secret: SECRET, telefone: '34999998888' }, baseDeps({ fetchImpl }))
    expect(r.status).toBe('dedup_skip')

    const telegramCall = fetchImpl.mock.calls.find(([url]) => url.includes('api.telegram.org'))
    expect(telegramCall).toBeFalsy()
  })

  it('nova mensagem do mesmo cliente é um novo handoff legítimo (não bloqueado pelo dedup anterior)', async () => {
    // dedupExists=false simula que a NOVA chave (com a mensagem mais recente) ainda não foi registrada,
    // mesmo que uma situação anterior do mesmo chat já tenha sido alertada antes.
    const novaMensagem = [...MESSAGES_FIXTURE, { role: 'client', text: 'Ainda estou esperando', id: 'm4' }]
    const fetchImpl = makeFetchRouter({
      chatsPages: [[CHAT_FIXTURE]],
      messagesByChatId: { 'chat-real-123': novaMensagem },
      groqOk: false,
      dedupExists: false,
    })
    const r = await processarAlertaInteligente({ secret: SECRET, telefone: '34999998888' }, baseDeps({ fetchImpl }))
    expect(r.status).toBe('sent')
    expect(r.dedupKey).toBe('chat-real-123:m4')
  })
})

describe('processarAlertaInteligente — nenhum log expõe secrets', () => {
  let logSpy, errorSpy, warnSpy

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
    errorSpy.mockRestore()
    warnSpy.mockRestore()
  })

  function assertNoSecretsLeaked() {
    const todasChamadas = [...logSpy.mock.calls, ...errorSpy.mock.calls, ...warnSpy.mock.calls]
    const textoCompleto = todasChamadas.map((args) => args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')).join('\n')
    for (const segredo of SECRET_VALUES) {
      expect(textoCompleto).not.toContain(segredo)
    }
    expect(textoCompleto).not.toMatch(/https:\/\/api\.telegram\.org\/bot/)
    expect(textoCompleto).not.toMatch(/[?&]secret=/)
  }

  it('caminho de sucesso não vaza secrets nos logs', async () => {
    const fetchImpl = makeFetchRouter({
      chatsPages: [[CHAT_FIXTURE]],
      messagesByChatId: { 'chat-real-123': MESSAGES_FIXTURE },
      groqOk: false,
    })
    await processarAlertaInteligente({ secret: SECRET, telefone: '34999998888' }, baseDeps({ fetchImpl }))
    assertNoSecretsLeaked()
  })

  it('caminho de falha no Telegram não vaza secrets nos logs', async () => {
    const fetchImpl = makeFetchRouter({
      chatsPages: [[CHAT_FIXTURE]],
      messagesByChatId: { 'chat-real-123': MESSAGES_FIXTURE },
      groqOk: false,
      telegramOk: false,
    })
    await processarAlertaInteligente({ secret: SECRET, telefone: '34999998888' }, baseDeps({ fetchImpl }))
    assertNoSecretsLeaked()
  })

  it('caminho de fallback (chat não encontrado) não vaza secrets nos logs', async () => {
    const fetchImpl = makeFetchRouter({ chatsPages: [[]] })
    await processarAlertaInteligente({ secret: SECRET, telefone: '34999998888' }, baseDeps({ fetchImpl }))
    assertNoSecretsLeaked()
  })
})

describe('fallback continua idêntico ao alerta simples atual', () => {
  it('FALLBACK_MESSAGE é exatamente o texto já usado hoje pela intention', () => {
    expect(FALLBACK_MESSAGE).toBe('⚠️ RAFAEL, CLIENTE AGUARDANDO SEM RESPOSTA!')
  })
})
