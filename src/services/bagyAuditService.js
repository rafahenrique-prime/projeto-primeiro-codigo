// Cliente do módulo de Auditoria Bagy (Beta) — só leitura/gatilho, isolado do catálogo.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
}

// Roda a auditoria completa chamando /api/bagy-audit em lotes até esgotar o sitemap.
// onProgress(processed, total) é chamado a cada lote pra UI mostrar barra de progresso.
export async function runBagyAudit(onProgress) {
  const runId = String(Date.now())
  let offset = 0
  const limit = 25
  let done = false
  let totalUrls = null
  let divergences = 0

  while (!done) {
    const res = await fetch(`/api/bagy-audit?runId=${runId}&offset=${offset}&limit=${limit}`)
    if (!res.ok) throw new Error(`Falha no lote (offset ${offset}): HTTP ${res.status}`)
    const data = await res.json()
    if (data.error) throw new Error(data.error)

    totalUrls = data.totalUrls
    divergences += data.foundDivergences || 0
    offset = data.nextOffset
    done = data.done
    if (onProgress) onProgress(data.processed, totalUrls)
  }

  // Passo final: descobre produtos do catálogo que sumiram da Bagy
  const finalRes = await fetch(`/api/bagy-audit?runId=${runId}&finalize=1`)
  const finalData = await finalRes.json().catch(() => ({}))

  return { runId, totalUrls, divergences: divergences + (finalData.missingInBagy || 0) }
}

export async function getAuditRuns(limit = 20) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/bagy_audit_log?select=run_id,created_at&order=created_at.desc&limit=500`,
      { headers }
    )
    if (!res.ok) return []
    const rows = await res.json()
    const seen = new Map()
    for (const r of rows) {
      if (!seen.has(r.run_id)) seen.set(r.run_id, r.created_at)
    }
    return [...seen.entries()].slice(0, limit).map(([run_id, created_at]) => ({ run_id, created_at }))
  } catch {
    return []
  }
}

export async function getAuditResults(runId) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/bagy_audit_log?run_id=eq.${runId}&order=status.asc`,
      { headers }
    )
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}
