// PRIME Bridge — Tool Router, Fase 3, Etapa 3.2
//
// routeTools(messageText, context, tools) decide quais ferramentas do
// registry (ver tools/index.js) são relevantes para uma mensagem, resolve
// conflitos entre ferramentas do mesmo group, executa as selecionadas e
// devolve um resultado estruturado para o futuro Context Builder.
//
// Isolado: nenhuma chamada de rede própria, nenhuma leitura de env/segredo,
// nenhuma integração com server.mjs. Cada ferramenta é responsável pelo
// próprio I/O dentro de execute() — o Router só orquestra e isola erros.

import { isValidToolDefinition, isValidMatchResult, isValidToolResult, TOOL_ERROR_CODES } from './tools/contract.js'

// Limiar padrão de confiança — usado quando a ferramenta não define o
// próprio minConfidence. Mesmo valor (0.6) definido na arquitetura da
// Fase 3 (ajuste final do plano).
const DEFAULT_MIN_CONFIDENCE = 0.6

// Nome de fallback usado quando tool.name não é uma string não-vazia (após
// trim) — nunca devolve '' como identificação de observabilidade, porque
// uma string vazia se perde silenciosamente em logs/relatórios agregados.
const INVALID_TOOL_NAME = 'invalid_tool'

function safeToolName(tool) {
  if (isValidToolDefinition(tool)) return tool.name.trim()
  const name = tool?.name
  if (typeof name !== 'string') return INVALID_TOOL_NAME
  const trimmed = name.trim()
  return trimmed.length > 0 ? trimmed : INVALID_TOOL_NAME
}

function resolveGroupConflicts(candidates) {
  const byGroup = new Map()
  const ungrouped = []

  for (const candidate of candidates) {
    if (!candidate.group) {
      ungrouped.push(candidate)
      continue
    }
    if (!byGroup.has(candidate.group)) byGroup.set(candidate.group, [])
    byGroup.get(candidate.group).push(candidate)
  }

  const selected = [...ungrouped]
  const groupLosers = []

  for (const groupCandidates of byGroup.values()) {
    // Regra determinística de desempate: maior confidence vence; em caso de
    // empate exato, vence o nome em ordem alfabética (localeCompare) —
    // nunca depende de ordem de inserção/registro.
    const sorted = [...groupCandidates].sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence
      return a.name.localeCompare(b.name)
    })
    selected.push(sorted[0])
    for (const loser of sorted.slice(1)) groupLosers.push(loser)
  }

  return { selected, groupLosers }
}

async function executeTool(candidate, context) {
  let result
  try {
    result = await candidate.tool.execute(candidate.params, context)
  } catch {
    // Nunca propaga stack trace, mensagem de exceção crua, ou qualquer dado
    // do cliente/segredo — só um código estruturado e fechado.
    return { ok: false, error: { code: TOOL_ERROR_CODES.EXECUTE_THREW } }
  }

  if (!isValidToolResult(result)) {
    return { ok: false, error: { code: TOOL_ERROR_CODES.EXECUTE_INVALID_RESULT } }
  }

  return result
}

/**
 * @param {unknown} messageText
 * @param {unknown} context
 * @param {unknown[]} tools
 * @returns {Promise<{matchedTools: array, skippedTools: array, hasContext: boolean}>}
 */
export async function routeTools(messageText, context, tools) {
  const toolList = Array.isArray(tools) ? tools : []

  const skippedTools = []
  const candidates = []

  for (const tool of toolList) {
    const name = safeToolName(tool)

    if (!isValidToolDefinition(tool)) {
      skippedTools.push({ name, reason: TOOL_ERROR_CODES.TOOL_DEFINITION_INVALID })
      continue
    }

    let matchResult
    try {
      matchResult = tool.match(messageText, context)
    } catch {
      skippedTools.push({ name, reason: TOOL_ERROR_CODES.MATCH_THREW })
      continue
    }

    if (!isValidMatchResult(matchResult)) {
      skippedTools.push({ name, reason: TOOL_ERROR_CODES.MATCH_INVALID_RESULT })
      continue
    }

    if (!matchResult.matched) {
      skippedTools.push({ name, reason: 'not_matched' })
      continue
    }

    const minConfidence = typeof tool.minConfidence === 'number' ? tool.minConfidence : DEFAULT_MIN_CONFIDENCE
    if (matchResult.confidence < minConfidence) {
      skippedTools.push({ name, reason: 'below_min_confidence' })
      continue
    }

    candidates.push({
      name,
      group: tool.group,
      confidence: matchResult.confidence,
      params: matchResult.params ? { ...matchResult.params } : {},
      tool,
    })
  }

  const { selected, groupLosers } = resolveGroupConflicts(candidates)
  for (const loser of groupLosers) {
    skippedTools.push({ name: loser.name, reason: 'group_conflict_lost' })
  }

  const matchedTools = []
  for (const candidate of selected) {
    const result = await executeTool(candidate, context)
    matchedTools.push({
      name: candidate.name,
      confidence: candidate.confidence,
      params: candidate.params,
      result,
    })
  }

  const hasContext = matchedTools.some((t) => t.result && t.result.ok === true)

  return Object.freeze({
    matchedTools: Object.freeze(matchedTools),
    skippedTools: Object.freeze(skippedTools),
    hasContext,
  })
}
