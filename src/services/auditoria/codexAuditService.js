// Inteligência Operacional → CODEX: audita o código-fonte do projeto.
// Diferente das outras auditorias, essa não roda dentro do navegador — o browser não
// tem acesso ao filesystem do repositório. Os achados são gerados pelo Claude Code
// analisando o código e gravados aqui; esta camada só lê e exibe.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY

const sbHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

export async function getAuditRuns(limit = 20) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/codex_audit_findings?select=run_id,created_at,type,ignored&order=created_at.desc&limit=2000`,
      { headers: sbHeaders }
    )
    if (!res.ok) return []
    const rows = await res.json()
    const byRun = new Map()
    for (const r of rows) {
      if (!byRun.has(r.run_id)) byRun.set(r.run_id, { run_id: r.run_id, created_at: r.created_at, findings: 0 })
      if (!r.ignored) byRun.get(r.run_id).findings++
    }
    return [...byRun.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limit)
  } catch {
    return []
  }
}

export async function getAuditResults(runId) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/codex_audit_findings?run_id=eq.${runId}&order=type.asc`,
      { headers: sbHeaders }
    )
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export async function setFindingIgnored(id, ignored) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/codex_audit_findings?id=eq.${id}`, {
      method: 'PATCH',
      headers: sbHeaders,
      body: JSON.stringify({ ignored }),
    })
    return res.ok
  } catch {
    return false
  }
}
