// PRIME Bridge — Tool Router, Fase 3, Etapa 3.2
//
// Contrato comum de "ferramenta" (ToolDefinition) e validadores puros para
// os formatos que atravessam o Tool Router: MatchResult e ToolResult.
// Nenhuma ferramenta real é definida aqui — só o vocabulário e as funções
// de validação, sem I/O, sem dependência externa.

// Vocabulário fechado de códigos de erro estruturados que uma ferramenta
// pode devolver em ToolResult.error.code. Mantido pequeno nesta etapa —
// cresce só quando uma ferramenta real precisar de um código novo.
export const TOOL_ERROR_CODES = Object.freeze({
  MATCH_THREW: 'match_threw',
  MATCH_INVALID_RESULT: 'match_invalid_result',
  EXECUTE_THREW: 'execute_threw',
  EXECUTE_INVALID_RESULT: 'execute_invalid_result',
  TOOL_DEFINITION_INVALID: 'tool_definition_invalid',
})

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSimpleParamsObject(value) {
  if (!isPlainObject(value)) return false
  return Object.values(value).every((v) => typeof v === 'string')
}

/**
 * Valida o formato de um MatchResult devolvido por tool.match(...).
 * Não lança — sempre devolve um boolean.
 *
 * Formato esperado:
 *   { matched: boolean, confidence: number, params?: {[k:string]: string}, reason?: string }
 */
export function isValidMatchResult(value) {
  if (!isPlainObject(value)) return false
  if (typeof value.matched !== 'boolean') return false
  if (typeof value.confidence !== 'number') return false
  if (Number.isNaN(value.confidence)) return false
  if (value.confidence < 0 || value.confidence > 1) return false
  if ('params' in value && value.params !== undefined && !isSimpleParamsObject(value.params)) return false
  if ('reason' in value && value.reason !== undefined && typeof value.reason !== 'string') return false
  return true
}

/**
 * Valida o formato de um ToolResult devolvido por tool.execute(...).
 * Não lança — sempre devolve um boolean.
 *
 * Formato esperado:
 *   {
 *     ok: boolean,
 *     found?: boolean,
 *     results?: array,
 *     truncated?: boolean,
 *     error?: { code: string },
 *     reason?: string,
 *     durationMs?: number,
 *   }
 */
export function isValidToolResult(value) {
  if (!isPlainObject(value)) return false
  if (typeof value.ok !== 'boolean') return false
  if ('found' in value && value.found !== undefined && typeof value.found !== 'boolean') return false
  if ('results' in value && value.results !== undefined && !Array.isArray(value.results)) return false
  if ('truncated' in value && value.truncated !== undefined && typeof value.truncated !== 'boolean') return false
  if ('reason' in value && value.reason !== undefined && typeof value.reason !== 'string') return false
  if ('durationMs' in value && value.durationMs !== undefined && typeof value.durationMs !== 'number') return false
  if ('error' in value && value.error !== undefined) {
    if (!isPlainObject(value.error)) return false
    if (typeof value.error.code !== 'string' || value.error.code.trim().length === 0) return false
  }
  return true
}

/**
 * Valida o formato de uma ToolDefinition — usado pelo Tool Router antes de
 * chamar match()/execute() de qualquer ferramenta do registry.
 * Não lança — sempre devolve um boolean.
 *
 * Formato esperado:
 *   {
 *     name: string (não vazio),
 *     group?: string,
 *     minConfidence?: number (0-1),
 *     timeoutMs?: number (> 0),
 *     match: function,
 *     execute: function,
 *   }
 */
export function isValidToolDefinition(value) {
  if (!isPlainObject(value)) return false
  if (typeof value.name !== 'string' || value.name.trim().length === 0) return false
  if ('group' in value && value.group !== undefined && typeof value.group !== 'string') return false
  if ('minConfidence' in value && value.minConfidence !== undefined) {
    if (typeof value.minConfidence !== 'number' || Number.isNaN(value.minConfidence)) return false
    if (value.minConfidence < 0 || value.minConfidence > 1) return false
  }
  if ('timeoutMs' in value && value.timeoutMs !== undefined) {
    if (typeof value.timeoutMs !== 'number' || Number.isNaN(value.timeoutMs) || value.timeoutMs <= 0) return false
  }
  if (typeof value.match !== 'function') return false
  if (typeof value.execute !== 'function') return false
  return true
}
