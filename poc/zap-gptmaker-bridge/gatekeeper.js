// PRIME Gatekeeper — Fase 3, Etapa 3.1
//
// Função pura: mesma entrada sempre produz a mesma saída, sem I/O, sem
// fetch, sem Supabase, sem GPTMaker, sem ZAP-API, sem variável de ambiente,
// sem filesystem, sem estado global, sem mutar os argumentos recebidos.
//
// Nesta versão o Gatekeeper é 100% permissivo — toda mensagem válida (e
// também toda entrada inválida) resulta em CONTINUE. BLOCK, IGNORE e
// ANSWER_WITHOUT_GPTMAKER existem no contrato para as etapas futuras, mas
// nenhuma regra real os utiliza ainda. `observationOnly: true` em toda
// decisão desta etapa deixa explícito que nenhuma delas tem efeito prático
// — é o modo de observação descrito no plano da Fase 3.

// Vocabulário fechado de ações — mesma disciplina já usada no `event` de
// bridge_operation_logs (migration 018): nenhuma ação nova sem atualizar
// esta lista explicitamente.
export const ACTIONS = Object.freeze({
  BLOCK: 'BLOCK',
  IGNORE: 'IGNORE',
  ANSWER_WITHOUT_GPTMAKER: 'ANSWER_WITHOUT_GPTMAKER',
  CONTINUE: 'CONTINUE',
})

// Vocabulário fechado de motivos.
export const REASONS = Object.freeze({
  // Nenhuma regra real avaliou a mensagem — modo observação (Etapa 3.1).
  NO_ACTIVE_RULE: 'no_active_rule',
  // messageText não é string (null, número, objeto, etc.).
  INVALID_MESSAGE_TEXT: 'invalid_message_text',
  // messageText é string, mas vazia ou só espaço em branco.
  EMPTY_MESSAGE_TEXT: 'empty_message_text',
  // context ausente, null, ou não é um objeto simples.
  INVALID_CONTEXT: 'invalid_context',
})

/**
 * Decide o que fazer com uma mensagem recebida. Nunca lança exceção — toda
 * entrada, válida ou não, resulta numa decisão explícita e testável.
 *
 * @param {unknown} messageText
 * @param {unknown} context
 * @returns {{action: string, reason: string, observationOnly: boolean}}
 */
export function decide(messageText, context) {
  if (context === null || context === undefined || typeof context !== 'object' || Array.isArray(context)) {
    return Object.freeze({
      action: ACTIONS.CONTINUE,
      reason: REASONS.INVALID_CONTEXT,
      observationOnly: true,
    })
  }

  if (typeof messageText !== 'string') {
    return Object.freeze({
      action: ACTIONS.CONTINUE,
      reason: REASONS.INVALID_MESSAGE_TEXT,
      observationOnly: true,
    })
  }

  if (messageText.trim().length === 0) {
    return Object.freeze({
      action: ACTIONS.CONTINUE,
      reason: REASONS.EMPTY_MESSAGE_TEXT,
      observationOnly: true,
    })
  }

  // Nenhuma regra real nesta etapa — toda mensagem válida segue.
  return Object.freeze({
    action: ACTIONS.CONTINUE,
    reason: REASONS.NO_ACTIVE_RULE,
    observationOnly: true,
  })
}
