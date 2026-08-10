/**
 * api/_bagySyncLogger.js
 *
 * Logger estruturado do sincronizador Bagy → Supabase. Não persiste nada —
 * só produz um objeto de log em memória (steps com timing) que o caller
 * decide o que fazer com ele (console.log, devolver na resposta HTTP, etc).
 * Prefixo "_" — mesmo padrão dos demais helpers privados de api/.
 */

export function createRunLogger(runId) {
  const startedAt = Date.now()
  const steps = []

  function step(name, data = {}) {
    steps.push({ name, at: Date.now() - startedAt, data })
  }

  function error(name, err) {
    steps.push({ name, at: Date.now() - startedAt, error: err?.message || String(err) })
  }

  function summary(extra = {}) {
    return {
      runId,
      totalMs: Date.now() - startedAt,
      steps,
      ...extra,
    }
  }

  return { step, error, summary }
}
