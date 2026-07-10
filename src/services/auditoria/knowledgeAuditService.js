// Inteligência Operacional → Conhecimento: audita a base CODEX.
// Prioriza regras + embeddings (já existem na tabela knowledge, gerados na gravação).
// IA (DeepSeek R1) só entra pra julgar contradição semântica — os pares
// candidatos já vêm filtrados por similaridade de embedding, então o volume de
// chamadas de IA é pequeno e limitado por run.
import { getAllEntries } from '../knowledgeDB'
import { askDeepSeek } from '../ia/deepseek'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY

const sbHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

const DUPLICATE_THRESHOLD = 0.95
const SIMILAR_THRESHOLD = 0.85
const CONTRADICTION_BAND = [0.80, 0.95] // pares no mesmo assunto, mas não duplicados — candidatos a contradição
const SHORT_CONTENT_CHARS = 80
const STALE_DAYS = 180
const MAX_CONTRADICTION_CHECKS = 15 // limite de chamadas de IA por rodada

function cosineSimilarity(a, b) {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

function parseEmbedding(raw) {
  if (!raw) return null
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw) } catch { return null }
}

function daysSince(dateStr) {
  return (Date.now() - new Date(dateStr).getTime()) / 86400000
}

async function judgeContradiction(a, b) {
  const prompt = `Compare os dois trechos da base de conhecimento de uma loja abaixo. Diga se eles se CONTRADIZEM de verdade (uma instrução conflita com a outra sobre o mesmo assunto) — não marque como contradição se forem só assuntos parecidos ou complementares.

TRECHO A (id ${a.id}, "${a.title}"):
${a.content.slice(0, 1200)}

TRECHO B (id ${b.id}, "${b.title}"):
${b.content.slice(0, 1200)}

Responda APENAS com JSON: {"contradiz": true|false, "trecho_a": "cite a frase exata de A que conflita (ou vazio)", "trecho_b": "cite a frase exata de B que conflita (ou vazio)"}`

  try {
    const text = await askDeepSeek(
      'Responda APENAS com o JSON pedido, sem texto antes ou depois.',
      [{ role: 'user', content: prompt }],
      500,
      'deepseek-reasoner'
    )
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}')
    // Exige evidência literal — sem citação de ambos os lados, não confia no veredito.
    if (json.contradiz && json.trecho_a && json.trecho_b) {
      return { contradiz: true, evidenciaA: json.trecho_a, evidenciaB: json.trecho_b }
    }
    return { contradiz: false }
  } catch (e) {
    console.error('[knowledgeAudit] Falha ao julgar contradição:', e.message)
    return { contradiz: false, erro: e.message }
  }
}

export async function runKnowledgeAudit(onProgress) {
  const runId = String(Date.now())
  const entries = await getAllEntries()
  const withEmbedding = entries
    .map(e => ({ ...e, _vec: parseEmbedding(e.embedding) }))
    .filter(e => e._vec)

  const findings = []

  // Muito curto e obsoleto — regra pura, sem comparação entre pares.
  for (const e of entries) {
    if ((e.content || '').trim().length < SHORT_CONTENT_CHARS) {
      findings.push({ type: 'muito_curto', entry_id_a: e.id, title_a: e.title, detail: `${e.content?.length || 0} caracteres` })
    }
    if (daysSince(e.created_at) > STALE_DAYS) {
      findings.push({ type: 'obsoleto', entry_id_a: e.id, title_a: e.title, detail: `Criado há ${Math.round(daysSince(e.created_at))} dias, sem revisão registrada` })
    }
  }

  // Duplicado/semelhante — cosine similarity sobre embeddings já existentes (sem custo de IA).
  const contradictionCandidates = []
  for (let i = 0; i < withEmbedding.length; i++) {
    for (let j = i + 1; j < withEmbedding.length; j++) {
      const a = withEmbedding[i], b = withEmbedding[j]
      const sim = cosineSimilarity(a._vec, b._vec)
      if (sim >= DUPLICATE_THRESHOLD) {
        findings.push({ type: 'duplicado', entry_id_a: a.id, entry_id_b: b.id, title_a: a.title, title_b: b.title, score: sim })
      } else if (sim >= SIMILAR_THRESHOLD) {
        findings.push({ type: 'semelhante', entry_id_a: a.id, entry_id_b: b.id, title_a: a.title, title_b: b.title, score: sim })
      }
      if (sim >= CONTRADICTION_BAND[0] && sim < CONTRADICTION_BAND[1]) {
        contradictionCandidates.push({ a, b, sim })
      }
    }
  }

  // Contradição — só nos pares mais parecidos (mesmo assunto), limitado por rodada.
  contradictionCandidates.sort((x, y) => y.sim - x.sim)
  const toCheck = contradictionCandidates.slice(0, MAX_CONTRADICTION_CHECKS)
  for (let i = 0; i < toCheck.length; i++) {
    const { a, b } = toCheck[i]
    if (onProgress) onProgress(i + 1, toCheck.length)
    const result = await judgeContradiction(a, b)
    if (result.contradiz) {
      findings.push({
        type: 'contraditorio', entry_id_a: a.id, entry_id_b: b.id, title_a: a.title, title_b: b.title,
        detail: `A: "${result.evidenciaA}" ⟷ B: "${result.evidenciaB}"`,
      })
    }
  }

  // Mesmo sem achados, registra que a rodada aconteceu (senão o histórico e o
  // painel de saúde geral não têm como saber que essa auditoria já rodou).
  // Importante: o insert em lote do Supabase exige que todos os objetos do array
  // tenham exatamente as mesmas colunas — por isso preenchemos null nos campos
  // que um tipo de achado não usa, em vez de deixar a chave ausente.
  const rows = findings.length > 0
    ? findings.map(f => ({
        run_id: runId, ignored: false,
        entry_id_b: null, title_a: null, title_b: null, score: null, detail: null,
        ...f,
      }))
    : entries.length > 0
      ? [{ run_id: runId, type: 'ok', entry_id_a: entries[0].id, entry_id_b: null, title_a: null, title_b: null, score: null, ignored: true, detail: 'Nenhum problema encontrado' }]
      : []

  if (rows.length > 0) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/knowledge_audit_findings`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify(rows),
      })
    } catch (e) {
      console.error('[knowledgeAudit] Falha ao salvar achados:', e.message)
    }
  }

  return { runId, totalEntries: entries.length, findings: rows }
}

export async function getAuditRuns(limit = 20) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/knowledge_audit_findings?select=run_id,created_at,type,ignored&order=created_at.desc&limit=2000`,
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
      `${SUPABASE_URL}/rest/v1/knowledge_audit_findings?run_id=eq.${runId}&order=type.asc`,
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
    const res = await fetch(`${SUPABASE_URL}/rest/v1/knowledge_audit_findings?id=eq.${id}`, {
      method: 'PATCH',
      headers: sbHeaders,
      body: JSON.stringify({ ignored }),
    })
    return res.ok
  } catch {
    return false
  }
}
