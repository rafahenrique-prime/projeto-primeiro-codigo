import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  normalizePhoneDigits,
  phonesEquivalent,
  findChatByPhone,
  parseSummaryJson,
  buildEnrichedMessage,
  buildDedupKey,
  buildSummaryPrompt,
  FALLBACK_MESSAGE,
  processarAlertaInteligente,
} from '../_alertaInteligente.js'

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

// Fixtures da correção de desambiguação por agentId — mesmo telefone,
// agentes (GABY LAB vs Gabriela produção) diferentes, reproduzindo o caso
// real encontrado no teste da Gaby Lab (telefone do Rafael em 2 chats).
const AGENT_GABY_LAB = 'agent-gaby-lab-123'
const AGENT_GABRIELA = 'agent-gabriela-456'
const CHAT_GABY_LAB_FIXTURE = { id: 'chat-gaby-lab-1', whatsappPhone: '5534999998888', agentId: AGENT_GABY_LAB, name: 'Rafael' }
const CHAT_GABRIELA_FIXTURE = { id: 'chat-gabriela-1', whatsappPhone: '5534999998888', agentId: AGENT_GABRIELA, name: 'Rafael' }

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

  it('reporta candidatosTelefone/candidatosAposAgentId corretamente em cada caso', () => {
    expect(findChatByPhone([], '5534999998888').candidatosTelefone).toBe(0)
    expect(findChatByPhone([CHAT_FIXTURE], '5534999998888').candidatosTelefone).toBe(1)
    expect(findChatByPhone([CHAT_GABY_LAB_FIXTURE, CHAT_GABRIELA_FIXTURE], '5534999998888').candidatosTelefone).toBe(2)
    // sem agentId, candidatosAposAgentId é sempre null (não se aplica)
    expect(findChatByPhone([CHAT_FIXTURE], '5534999998888').candidatosAposAgentId).toBeNull()
  })
})

describe('findChatByPhone com agentId (desambiguação)', () => {
  it('1) telefone → 0 chats → sem chat, ambiguous false', () => {
    const r = findChatByPhone([], '5534999998888', AGENT_GABY_LAB)
    expect(r.chat).toBeNull()
    expect(r.ambiguous).toBe(false)
    expect(r.candidatosTelefone).toBe(0)
  })

  it('2) telefone → 1 chat, sem agentId → aceita (V1 preservado)', () => {
    const r = findChatByPhone([CHAT_GABY_LAB_FIXTURE], '5534999998888')
    expect(r.chat?.id).toBe('chat-gaby-lab-1')
    expect(r.ambiguous).toBe(false)
  })

  it('3) telefone → 2 chats, sem agentId → ambíguo (V1 preservado)', () => {
    const r = findChatByPhone([CHAT_GABY_LAB_FIXTURE, CHAT_GABRIELA_FIXTURE], '5534999998888')
    expect(r.chat).toBeNull()
    expect(r.ambiguous).toBe(true)
  })

  it('4) telefone → 1 chat + agentId correto → aceita', () => {
    const r = findChatByPhone([CHAT_GABY_LAB_FIXTURE], '5534999998888', AGENT_GABY_LAB)
    expect(r.chat?.id).toBe('chat-gaby-lab-1')
    expect(r.candidatosAposAgentId).toBe(1)
  })

  it('5) telefone → 1 chat + agentId ERRADO → fallback (não aceita mesmo com 1 candidato por telefone)', () => {
    const r = findChatByPhone([CHAT_GABY_LAB_FIXTURE], '5534999998888', AGENT_GABRIELA)
    expect(r.chat).toBeNull()
    expect(r.candidatosTelefone).toBe(1)
    expect(r.candidatosAposAgentId).toBe(0)
  })

  it('6) telefone → 2 chats + agentId isola exatamente 1 → aceita', () => {
    const r = findChatByPhone([CHAT_GABY_LAB_FIXTURE, CHAT_GABRIELA_FIXTURE], '5534999998888', AGENT_GABY_LAB)
    expect(r.chat?.id).toBe('chat-gaby-lab-1')
    expect(r.candidatosTelefone).toBe(2)
    expect(r.candidatosAposAgentId).toBe(1)
  })

  it('7) telefone → 2 chats + agentId isola 0 → fallback', () => {
    const r = findChatByPhone([CHAT_GABY_LAB_FIXTURE, CHAT_GABRIELA_FIXTURE], '5534999998888', 'agent-nenhum-desses')
    expect(r.chat).toBeNull()
    expect(r.candidatosAposAgentId).toBe(0)
  })

  it('8) telefone → 2+ chats + agentId ainda deixa 2+ → fallback, nunca escolhe candidates[0]', () => {
    const chatDuplicadoMesmoAgente = { id: 'chat-gaby-lab-2', whatsappPhone: '5534999998888', agentId: AGENT_GABY_LAB, name: 'Rafael (duplicado)' }
    const r = findChatByPhone([CHAT_GABY_LAB_FIXTURE, chatDuplicadoMesmoAgente, CHAT_GABRIELA_FIXTURE], '5534999998888', AGENT_GABY_LAB)
    expect(r.chat).toBeNull()
    expect(r.ambiguous).toBe(true)
    expect(r.candidatosAposAgentId).toBe(2)
  })

  it('9) agentId vazio/string em branco → comportamento idêntico a agentId ausente (V1)', () => {
    const rVazio = findChatByPhone([CHAT_GABY_LAB_FIXTURE], '5534999998888', '')
    const rAusente = findChatByPhone([CHAT_GABY_LAB_FIXTURE], '5534999998888')
    expect(rVazio).toEqual(rAusente)
  })

  it('nunca escolhe por agentName, só por agentId', () => {
    const chatComAgentNameIgual = { id: 'chat-x', whatsappPhone: '5534999998888', agentId: 'outro-id-qualquer', agentName: 'GABY LAB' }
    const r = findChatByPhone([chatComAgentNameIgual], '5534999998888', AGENT_GABY_LAB)
    expect(r.chat).toBeNull() // agentId não bate, mesmo com agentName igual
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

describe('buildSummaryPrompt — priorização temporal', () => {
  // O Groq é sempre mockado nesta suíte — estes testes provam que a
  // instrução de recência está corretamente embutida no prompt enviado
  // (o código está certo). Não provam que o Groq de fato vai obedecer —
  // isso só é validado no teste real (fora desta suíte automatizada).

  it('1) preserva integralmente a regra anti-alucinação já existente', () => {
    const prompt = buildSummaryPrompt('Cliente: oi\nAtendente: oi')
    expect(prompt).toContain('Use SOMENTE fatos que estão literalmente presentes na conversa abaixo.')
    expect(prompt).toContain('NUNCA invente ou infira produto, estoque, preço, tamanho, cor, disponibilidade, motivo ou pedido do cliente.')
    expect(prompt).toContain('Se um campo não estiver claramente presente na conversa, retorne null para ele.')
  })

  it('2) instrui que as mensagens estão em ordem cronológica', () => {
    const prompt = buildSummaryPrompt('Cliente: oi')
    expect(prompt).toMatch(/ordem cronológica/i)
  })

  it('3) instrui "motivo_transferencia" a priorizar o motivo MAIS RECENTE quando há múltiplos assuntos', () => {
    const prompt = buildSummaryPrompt('Cliente: oi')
    expect(prompt).toMatch(/motivo_transferencia.*MAIS RECENTE/s)
    expect(prompt).toContain('nunca um assunto antigo já tratado anteriormente na mesma conversa')
  })

  it('4) instrui "ultima_pergunta_cliente" a priorizar a mensagem mais recente relevante', () => {
    const prompt = buildSummaryPrompt('Cliente: oi')
    expect(prompt).toMatch(/ultima_pergunta_cliente.*MAIS RECENTE/s)
  })

  it('5) permite contexto antigo em "resumo_breve", mas sem que ele substitua a pendência atual', () => {
    const prompt = buildSummaryPrompt('Cliente: oi')
    expect(prompt).toMatch(/resumo_breve.*pode mencionar contexto anterior/s)
    expect(prompt).toContain('sem deixar que esse contexto antigo substitua ou ofusque a pendência atual')
  })

  it('inclui as mensagens recebidas no corpo do prompt, sem alterá-las', () => {
    const texto = 'Cliente: pedido não chegou\nAtendente: vou verificar\nCliente: quero trocar outro produto'
    const prompt = buildSummaryPrompt(texto)
    expect(prompt).toContain(texto)
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

describe('processarAlertaInteligente — desambiguação por agentId (caso real Gaby Lab)', () => {
  it('5) telefone acha 1 chat, mas agentId não confere → fallback (motivo agente_nao_confere)', async () => {
    const fetchImpl = makeFetchRouter({ chatsPages: [[CHAT_GABY_LAB_FIXTURE]] })
    const r = await processarAlertaInteligente(
      { secret: SECRET, telefone: '5534999998888', agentId: AGENT_GABRIELA },
      baseDeps({ fetchImpl })
    )
    expect(r.status).toBe('sent')
    expect(r.modo).toBe('fallback_simples')
    expect(r.motivo).toBe('agente_nao_confere')
  })

  it('6) telefone acha 2 chats, agentId isola exatamente 1 → aceita e segue o fluxo normalmente', async () => {
    const fetchImpl = makeFetchRouter({
      chatsPages: [[CHAT_GABY_LAB_FIXTURE, CHAT_GABRIELA_FIXTURE]],
      messagesByChatId: { 'chat-gaby-lab-1': MESSAGES_FIXTURE },
      groqOk: false,
    })
    const r = await processarAlertaInteligente(
      { secret: SECRET, telefone: '5534999998888', agentId: AGENT_GABY_LAB },
      baseDeps({ fetchImpl })
    )
    expect(r.chatId).toBe('chat-gaby-lab-1')
    expect(r.modo).toBe('fallback_resumo') // Groq desligado neste teste, mas o chat certo foi usado
  })

  it('7) telefone acha 2 chats, agentId isola 0 → fallback (motivo agente_nao_confere)', async () => {
    const fetchImpl = makeFetchRouter({ chatsPages: [[CHAT_GABY_LAB_FIXTURE, CHAT_GABRIELA_FIXTURE]] })
    const r = await processarAlertaInteligente(
      { secret: SECRET, telefone: '5534999998888', agentId: 'agent-nenhum-desses' },
      baseDeps({ fetchImpl })
    )
    expect(r.modo).toBe('fallback_simples')
    expect(r.motivo).toBe('agente_nao_confere')
  })

  it('8) telefone + agentId ainda deixam 2+ candidatos → fallback (motivo telefone_ambiguo), nunca escolhe o primeiro', async () => {
    const chatDuplicadoMesmoAgente = { id: 'chat-gaby-lab-2', whatsappPhone: '5534999998888', agentId: AGENT_GABY_LAB }
    const fetchImpl = makeFetchRouter({ chatsPages: [[CHAT_GABY_LAB_FIXTURE, chatDuplicadoMesmoAgente, CHAT_GABRIELA_FIXTURE]] })
    const r = await processarAlertaInteligente(
      { secret: SECRET, telefone: '5534999998888', agentId: AGENT_GABY_LAB },
      baseDeps({ fetchImpl })
    )
    expect(r.modo).toBe('fallback_simples')
    expect(r.motivo).toBe('telefone_ambiguo')
  })

  it('9) agentId ausente → comportamento idêntico à V1 (telefone_ambiguo puro, sem agente envolvido)', async () => {
    const fetchImpl = makeFetchRouter({ chatsPages: [[CHAT_GABY_LAB_FIXTURE, CHAT_GABRIELA_FIXTURE]] })
    const r = await processarAlertaInteligente({ secret: SECRET, telefone: '5534999998888' }, baseDeps({ fetchImpl }))
    expect(r.modo).toBe('fallback_simples')
    expect(r.motivo).toBe('telefone_ambiguo')
  })

  it('10) contextId nunca é usado como chatId, mesmo quando enviado junto com agentId', async () => {
    const fetchImpl = makeFetchRouter({
      chatsPages: [[CHAT_GABY_LAB_FIXTURE]],
      messagesByChatId: { 'chat-gaby-lab-1': MESSAGES_FIXTURE },
      groqOk: false,
    })
    const r = await processarAlertaInteligente(
      { secret: SECRET, telefone: '5534999998888', agentId: AGENT_GABY_LAB, contextId: 'chat-gaby-lab-1-nao-deveria-ser-usado-diretamente' },
      baseDeps({ fetchImpl })
    )
    // O chatId resolvido vem exclusivamente de findChatByPhone (telefone+agentId),
    // nunca do contextId — mesmo aqui, coincidentemente igual, a prova é que a
    // chamada de getChatMessages usa o chat.id retornado pela busca, não o
    // contextId bruto (confirmado pela URL batida no fetchImpl mockado abaixo).
    const chamadaMensagens = fetchImpl.mock.calls.find(([url]) => url.includes('/messages'))
    expect(chamadaMensagens[0]).toContain('/v2/chat/chat-gaby-lab-1/messages')
    expect(r.chatId).toBe('chat-gaby-lab-1')
  })

  it('11) caminho feliz completo: telefone + agentId → chat correto → mensagens → Groq → Telegram → dedup só após sucesso', async () => {
    const fetchImpl = makeFetchRouter({
      chatsPages: [[CHAT_GABY_LAB_FIXTURE, CHAT_GABRIELA_FIXTURE]],
      messagesByChatId: { 'chat-gaby-lab-1': MESSAGES_FIXTURE },
      groqResponse: {
        choices: [{
          message: {
            content: JSON.stringify({
              resumo_breve: 'Cliente perguntou tamanho e pediu atendente.',
              motivo_transferencia: 'pediu atendente',
              produto_mencionado: 'Tênis Nike Dunk',
              tamanho_mencionado: '39',
              ultima_pergunta_cliente: 'tem no 39?',
            }),
          },
        }],
      },
      telegramOk: true,
    })

    const r = await processarAlertaInteligente(
      { secret: SECRET, telefone: '5534999998888', agentId: AGENT_GABY_LAB, contextId: 'ctx-aux' },
      baseDeps({ fetchImpl })
    )

    expect(r.status).toBe('sent')
    expect(r.modo).toBe('inteligente')
    expect(r.chatId).toBe('chat-gaby-lab-1')

    const dedupPost = fetchImpl.mock.calls.find(([url, opts]) => url.includes('codex_alerts') && opts?.method === 'POST')
    expect(dedupPost).toBeTruthy() // dedup só registrado depois do Telegram confirmar sucesso
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

describe('processarAlertaInteligente — regressão pós-priorização temporal + observabilidade do log de sucesso', () => {
  // Prova que a mudança de prompt (só texto) e o novo log de sucesso não
  // afetam identificação de chat (telefone+agentId), fallback, Telegram ou
  // dedup — nada dessas 4 áreas foi tocado por esta correção.

  it('6) telefone + agentId continua funcionando exatamente igual', async () => {
    const fetchImpl = makeFetchRouter({
      chatsPages: [[CHAT_GABY_LAB_FIXTURE, CHAT_GABRIELA_FIXTURE]],
      messagesByChatId: { 'chat-gaby-lab-1': MESSAGES_FIXTURE },
      groqOk: false,
    })
    const r = await processarAlertaInteligente(
      { secret: SECRET, telefone: '5534999998888', agentId: AGENT_GABY_LAB },
      baseDeps({ fetchImpl })
    )
    expect(r.chatId).toBe('chat-gaby-lab-1')
  })

  it('7) fallback simples continua funcionando igual', async () => {
    const fetchImpl = makeFetchRouter({ chatsPages: [[]] })
    const r = await processarAlertaInteligente({ secret: SECRET, telefone: '34999998888' }, baseDeps({ fetchImpl }))
    expect(r.status).toBe('sent')
    expect(r.modo).toBe('fallback_simples')
  })

  it('8) Telegram sucesso/dedup continuam iguais (registra só após confirmação)', async () => {
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

  it('10) log de sucesso agora inclui agentIdPresente/candidatosTelefone/candidatosAposAgentId sanitizados', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const fetchImpl = makeFetchRouter({
      chatsPages: [[CHAT_GABY_LAB_FIXTURE, CHAT_GABRIELA_FIXTURE]],
      messagesByChatId: { 'chat-gaby-lab-1': MESSAGES_FIXTURE },
      groqOk: false,
    })
    await processarAlertaInteligente(
      { secret: SECRET, telefone: '5534999998888', agentId: AGENT_GABY_LAB },
      baseDeps({ fetchImpl })
    )

    const chamada = logSpy.mock.calls.find(([msg]) => msg === '[alerta-inteligente] Alerta enviado')
    expect(chamada).toBeTruthy()
    const [, meta] = chamada
    expect(meta.agentIdPresente).toBe(true)
    expect(meta.candidatosTelefone).toBe(2)
    expect(meta.candidatosAposAgentId).toBe(1)
    // nunca o valor bruto de agentId/telefone/contextId nesse log
    expect(meta.agentId).toBeUndefined()
    expect(meta.telefone).toBeUndefined()
    expect(meta.contextId).toBeUndefined()

    logSpy.mockRestore()
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

  function assertNoSecretsLeaked(valoresProibidosExtras = []) {
    const todasChamadas = [...logSpy.mock.calls, ...errorSpy.mock.calls, ...warnSpy.mock.calls]
    const textoCompleto = todasChamadas.map((args) => args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')).join('\n')
    for (const segredo of SECRET_VALUES) {
      expect(textoCompleto).not.toContain(segredo)
    }
    for (const valor of valoresProibidosExtras) {
      expect(textoCompleto).not.toContain(valor)
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

  it('15) com agentId presente (inclusive no caso agente_nao_confere), nenhum secret/telefone/agentId bruto aparece nos logs — só motivo e contadores sanitizados', async () => {
    const fetchImpl = makeFetchRouter({ chatsPages: [[CHAT_GABY_LAB_FIXTURE, CHAT_GABRIELA_FIXTURE]] })
    await processarAlertaInteligente(
      { secret: SECRET, telefone: '5534999998888', agentId: 'agent-nenhum-desses-valor-de-teste', contextId: 'contexto-que-nunca-deve-vazar' },
      baseDeps({ fetchImpl })
    )
    assertNoSecretsLeaked(['agent-nenhum-desses-valor-de-teste', 'contexto-que-nunca-deve-vazar', '5534999998888'])

    // Confirma positivamente que o log sanitizado (motivo/contadores/booleano) aconteceu
    const logadoComMotivo = logSpy.mock.calls.some(([, meta]) => meta?.motivo === 'agente_nao_confere')
    expect(logadoComMotivo).toBe(true)
  })
})

describe('fallback continua idêntico ao alerta simples atual', () => {
  it('FALLBACK_MESSAGE é exatamente o texto já usado hoje pela intention', () => {
    expect(FALLBACK_MESSAGE).toBe('⚠️ RAFAEL, CLIENTE AGUARDANDO SEM RESPOSTA!')
  })
})
