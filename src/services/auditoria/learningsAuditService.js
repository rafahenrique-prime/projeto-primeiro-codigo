// Inteligência Operacional → Aprendizagem: audita a biblioteca de aprendizados (agent_learnings).
// Sem embeddings salvos nessa tabela (diferente de knowledge) — usa Jaccard de palavras como
// regra pra achar candidatos, e IA (DeepSeek R1) só pra julgar conflito real,
// limitado por rodada e sempre exigindo citação literal como evidência.
import { getAllLearnings } from './agentLearningsService'
import { askDeepSeek } from '../deepseek'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY

const sbHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

const DUPLICATE_THRESHOLD = 0.8
const CONFLICT_BAND = [0.35, 0.8] // mesmo assunto (algumas palavras em comum), mas não duplicado
const SHORT_CONTENT_CHARS = 40
const MAX_CONFLICT_CHECKS = 15

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
}

function wordSet(str) {
  return new Set(normalize(str).split(/\s+/).filter(w => w.length > 2))
}

function jaccard(a, b) {
  const setA = wordSet(a), setB = wordSet(b)
  if (setA.size === 0 || setB.size === 0) return 0
  let inter = 0
  for (const w of setA) if (setB.has(w)) inter++
  const union = setA.size + setB.size - inter
  return union === 0 ? 0 : inter / union
}

async function judgeConflict(a, b) {
  const prompt = `Compare os dois aprendizados abaixo, registrados por auditorias automáticas de um agente de vendas. Diga se eles se CONFLITAM de verdade (uma instrução manda fazer algo que a outra manda não fazer, sobre a mesma situação) — não marque como conflito se forem complementares ou sobre situações diferentes.

APRENDIZADO A:
${a.content}

APRENDIZADO B:
${b.content}

Responda APENAS com JSON: {"conflita": true|false, "trecho_a": "cite a frase exata de A que conflita (ou vazio)", "trecho_b": "cite a frase exata de B que conflita (ou vazio)"}`

  try {
    const text = await askDeepSeek(
      'Responda APENAS com o JSON pedido, sem texto antes ou depois.',
      [{ role: 'user', content: prompt }],
      500,
      'deepseek-reasoner'
    )
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}')
    if (json.conflita && json.trecho_a && json.trecho_b) {
      return { conflita: true, evidenciaA: json.trecho_a, evidenciaB: json.trecho_b }
    }
    return { conflita: false }
  } catch (e) {
    console.error('[learningsAudit] Falha ao julgar conflito:', e.message)
    return { conflita: false, erro: e.message }
  }
}

export async function runLearningsAudit(onProgress) {
  const runId = String(Date.now())
  const entries = await getAllLearnings()
  const findings = []

  for (const e of entries) {
    if ((e.content || '').trim().length < SHORT_CONTENT_CHARS) {
      findings.push({ type: 'muito_curta', entry_id_a: e.id, content_a: e.content, detail: `${e.content?.length || 0} caracteres` })
    }
  }

  const conflictCandidates = []
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i], b = entries[j]
      const sim = jaccard(a.content, b.content)
      if (sim >= DUPLICATE_THRESHOLD) {
        findings.push({ type: 'duplicada', entry_id_a: a.id, entry_id_b: b.id, content_a: a.content, content_b: b.content, score: sim })
      } else if (sim >= CONFLICT_BAND[0] && sim < CONFLICT_BAND[1]) {
        conflictCandidates.push({ a, b, sim })
      }
    }
  }

  conflictCandidates.sort((x, y) => y.sim - x.sim)
  const toCheck = conflictCandidates.slice(0, MAX_CONFLICT_CHECKS)
  for (let i = 0; i < toCheck.length; i++) {
    const { a, b } = toCheck[i]
    if (onProgress) onProgress(i + 1, toCheck.length)
    const result = await judgeConflict(a, b)
    if (result.conflita) {
      findings.push({
        type: 'conflitante', entry_id_a: a.id, entry_id_b: b.id, content_a: a.content, content_b: b.content,
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
        entry_id_b: null, content_a: null, content_b: null, score: null, detail: null,
        ...f,
      }))
    : entries.length > 0
      ? [{ run_id: runId, type: 'ok', entry_id_a: entries[0].id, entry_id_b: null, content_a: null, content_b: null, score: null, ignored: true, detail: 'Nenhum problema encontrado' }]
      : []

  if (rows.length > 0) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/learnings_audit_findings`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify(rows),
      })
    } catch (e) {
      console.error('[learningsAudit] Falha ao salvar achados:', e.message)
    }
  }

  return { runId, totalEntries: entries.length, findings: rows }
}

export async function getAuditRuns(limit = 20) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/learnings_audit_findings?select=run_id,created_at,type,ignored&order=created_at.desc&limit=2000`,
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
      `${SUPABASE_URL}/rest/v1/learnings_audit_findings?run_id=eq.${runId}&order=type.asc`,
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
    const res = await fetch(`${SUPABASE_URL}/rest/v1/learnings_audit_findings?id=eq.${id}`, {
      method: 'PATCH',
      headers: sbHeaders,
      body: JSON.stringify({ ignored }),
    })
    return res.ok
  } catch {
    return false
  }
}
