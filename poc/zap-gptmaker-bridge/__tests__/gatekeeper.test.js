// Testes permanentes do PRIME Gatekeeter (Fase 3, Etapa 3.1).
// 100% local — sem I/O, sem rede, sem Supabase, sem GPTMaker, sem ZAP-API.
// Nesta versão o Gatekeeper é 100% permissivo: nenhum caso deve retornar
// BLOCK, IGNORE ou ANSWER_WITHOUT_GPTMAKER.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { decide, ACTIONS, REASONS } from '../gatekeeper.js'

const ALLOWED_ACTIONS = new Set(Object.values(ACTIONS))
const ALLOWED_REASONS = new Set(Object.values(REASONS))

function expectPermissiveContinue(result, expectedReason) {
  expect(result.action).toBe('CONTINUE')
  expect(result.observationOnly).toBe(true)
  if (expectedReason) expect(result.reason).toBe(expectedReason)
  expect(ALLOWED_ACTIONS.has(result.action)).toBe(true)
  expect(ALLOWED_REASONS.has(result.reason)).toBe(true)
}

describe('Gatekeeper — mensagens válidas (A-D)', () => {
  it('A. mensagem comum → CONTINUE, no_active_rule', () => {
    const result = decide('Qual o horário de funcionamento da loja?', { messageId: 'msg-1' })
    expectPermissiveContinue(result, REASONS.NO_ACTIVE_RULE)
  })

  it('B. saudação → CONTINUE, no_active_rule', () => {
    const result = decide('Oi, tudo bem?', { messageId: 'msg-2' })
    expectPermissiveContinue(result, REASONS.NO_ACTIVE_RULE)
  })

  it('C. texto parecido com propaganda → ainda CONTINUE (modo observação)', () => {
    const result = decide('Você ganhou 20GB de brinde, responda SIM para receber', { messageId: 'msg-3' })
    expectPermissiveContinue(result, REASONS.NO_ACTIVE_RULE)
  })

  it('D. pergunta de produto → CONTINUE, no_active_rule', () => {
    const result = decide('Tem Nike Dunk Cacau 41?', { messageId: 'msg-4' })
    expectPermissiveContinue(result, REASONS.NO_ACTIVE_RULE)
  })
})

describe('Gatekeeper — entradas inválidas (E-H)', () => {
  it('E. mensagem vazia → CONTINUE, empty_message_text', () => {
    expectPermissiveContinue(decide('', { messageId: 'msg-5' }), REASONS.EMPTY_MESSAGE_TEXT)
    expectPermissiveContinue(decide('   ', { messageId: 'msg-5b' }), REASONS.EMPTY_MESSAGE_TEXT)
  })

  it('F. valor null → CONTINUE, invalid_message_text', () => {
    expectPermissiveContinue(decide(null, { messageId: 'msg-6' }), REASONS.INVALID_MESSAGE_TEXT)
  })

  it('G. valor não-string (número, objeto, array, undefined) → CONTINUE, invalid_message_text', () => {
    expectPermissiveContinue(decide(42, { messageId: 'msg-7a' }), REASONS.INVALID_MESSAGE_TEXT)
    expectPermissiveContinue(decide({ texto: 'oi' }, { messageId: 'msg-7b' }), REASONS.INVALID_MESSAGE_TEXT)
    expectPermissiveContinue(decide(['oi'], { messageId: 'msg-7c' }), REASONS.INVALID_MESSAGE_TEXT)
    expectPermissiveContinue(decide(undefined, { messageId: 'msg-7d' }), REASONS.INVALID_MESSAGE_TEXT)
  })

  it('H. context ausente/inválido → CONTINUE, invalid_context', () => {
    expectPermissiveContinue(decide('Oi', undefined), REASONS.INVALID_CONTEXT)
    expectPermissiveContinue(decide('Oi', null), REASONS.INVALID_CONTEXT)
    expectPermissiveContinue(decide('Oi', 'nao-e-objeto'), REASONS.INVALID_CONTEXT)
    expectPermissiveContinue(decide('Oi', ['nao-e-objeto-simples']), REASONS.INVALID_CONTEXT)
  })
})

describe('Gatekeeper — pureza da função', () => {
  it('I. não modifica os argumentos recebidos', () => {
    const originalText = 'Tem Nike Dunk Cacau 41?'
    const originalContext = Object.freeze({ messageId: 'msg-8', phone: '55******1296' })
    // Object.freeze garante que qualquer tentativa de mutação lançaria em modo estrito de módulo ES —
    // a chamada abaixo não deve lançar, confirmando que decide() nunca escreve nos argumentos.
    expect(() => decide(originalText, originalContext)).not.toThrow()
    expect(originalText).toBe('Tem Nike Dunk Cacau 41?')
    expect(originalContext).toEqual({ messageId: 'msg-8', phone: '55******1296' })
  })

  it('J. resultado usa somente ações e motivos do vocabulário fechado', () => {
    const cases = [
      decide('Oi', {}),
      decide('', {}),
      decide(null, {}),
      decide('Oi', null),
      decide(123, []),
    ]
    for (const result of cases) {
      expect(ALLOWED_ACTIONS.has(result.action)).toBe(true)
      expect(ALLOWED_REASONS.has(result.reason)).toBe(true)
      expect(typeof result.observationOnly).toBe('boolean')
    }
  })

  it('K. nenhuma chamada de rede é feita', () => {
    const fetchSpy = vi.fn()
    const originalFetch = global.fetch
    global.fetch = fetchSpy
    try {
      decide('Tem Nike Dunk Cacau?', { messageId: 'msg-9' })
      decide('', {})
      decide(null, undefined)
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      global.fetch = originalFetch
    }
  })

  it('L. comportamento não depende de variável de ambiente/segredo', () => {
    // Stubar todo o process.env como vazio e confirmar que o resultado não muda.
    const before = decide('Tem Nike Dunk Cacau?', { messageId: 'msg-10' })
    vi.stubEnv('SUPABASE_SECRET_KEY', '')
    vi.stubEnv('WEBHOOK_PATH_SECRET', '')
    vi.stubEnv('GPT_TOKEN', '')
    const after = decide('Tem Nike Dunk Cacau?', { messageId: 'msg-10' })
    vi.unstubAllEnvs()
    expect(after).toEqual(before)
  })

  it('M. comportamento determinístico para a mesma entrada', () => {
    const text = 'Quanto custa o Nike Dunk?'
    const ctx = { messageId: 'msg-11' }
    const r1 = decide(text, ctx)
    const r2 = decide(text, ctx)
    const r3 = decide(text, ctx)
    expect(r1).toEqual(r2)
    expect(r2).toEqual(r3)
  })
})

describe('Gatekeeper — confirmação de modo 100% permissivo', () => {
  it('nenhum caso testado retorna BLOCK, IGNORE ou ANSWER_WITHOUT_GPTMAKER', () => {
    const allTexts = [
      'Qual o horário de funcionamento?',
      'Oi',
      'Você ganhou 20GB, responda SIM',
      'Tem Nike Dunk Cacau 41?',
      '',
      '   ',
    ]
    for (const text of allTexts) {
      const result = decide(text, { messageId: 'x' })
      expect(result.action).toBe('CONTINUE')
    }
    // e as entradas inválidas de tipo também
    expect(decide(null, {}).action).toBe('CONTINUE')
    expect(decide(undefined, {}).action).toBe('CONTINUE')
    expect(decide('Oi', null).action).toBe('CONTINUE')
  })
})
