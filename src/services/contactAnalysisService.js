// Análise de IA por contato — módulo experimental /contatos-new
// Tabela nova: contact_ai_analysis (ver SQL no final do arquivo)
import { askDeepSeek } from './deepseek'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY
const TABLE = 'contact_ai_analysis'

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation,resolution=merge-duplicates',
}

function base() {
  return `${SUPABASE_URL}/rest/v1/${TABLE}`
}

export async function getAnalysis(contactId) {
  try {
    const res = await fetch(`${base()}?contact_id=eq.${encodeURIComponent(contactId)}&limit=1`, { headers })
    if (!res.ok) return null
    const data = await res.json()
    return data[0] || null
  } catch {
    return null
  }
}

export async function analyzeConversation(contactId, contactName, messages) {
  const conv = messages.map(m => `${m.role === 'user' ? 'Cliente' : 'Agente'}: ${m.text || m.content || ''}`).join('\n')

  const systemPrompt = `Você é um analista de conversas de vendas da PRIME STORE. Analise o histórico e responda APENAS em JSON válido, sem texto extra, nesse formato exato:
{
  "resumo": "<resumo da conversa em 2-3 frases>",
  "objetivo": "<o que o cliente quer, em 1 frase>",
  "produtos_citados": ["<produto1>", "<produto2>"],
  "interesse_compra": "<alto|medio|baixo>",
  "objecoes": ["<objeção1>", "<objeção2>"],
  "duvidas_frequentes": ["<dúvida1>"],
  "proxima_acao": "<sugestão curta e prática>",
  "score_conversao": <número 0-100>
}`

  const text = await askDeepSeek(systemPrompt, [{ role: 'user', content: conv }], 700, 'deepseek-reasoner')
  let parsed
  try {
    parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}')
  } catch {
    parsed = { resumo: text, objetivo: '', produtos_citados: [], interesse_compra: 'medio', objecoes: [], duvidas_frequentes: [], proxima_acao: '', score_conversao: 50 }
  }

  const row = {
    contact_id: contactId,
    contact_name: contactName,
    resumo: parsed.resumo || '',
    objetivo: parsed.objetivo || '',
    produtos_citados: parsed.produtos_citados || [],
    interesse_compra: parsed.interesse_compra || 'medio',
    objecoes: parsed.objecoes || [],
    duvidas_frequentes: parsed.duvidas_frequentes || [],
    proxima_acao: parsed.proxima_acao || '',
    score_conversao: parsed.score_conversao ?? 50,
    analyzed_at: new Date().toISOString(),
  }

  const saveRes = await fetch(base(), { method: 'POST', headers, body: JSON.stringify(row) })
  row._persisted = saveRes.ok
  if (!saveRes.ok) {
    console.warn('[ContactAnalysis] Não foi possível salvar (tabela contact_ai_analysis pode não existir ainda):', await saveRes.text())
  }
  return row
}

/* SQL para rodar uma vez no Supabase (SQL Editor) antes de usar a Aba "Análise IA":

create table if not exists contact_ai_analysis (
  id bigint generated always as identity primary key,
  contact_id text not null,
  contact_name text,
  resumo text,
  objetivo text,
  produtos_citados jsonb default '[]',
  interesse_compra text,
  objecoes jsonb default '[]',
  duvidas_frequentes jsonb default '[]',
  proxima_acao text,
  score_conversao int,
  analyzed_at timestamptz default now(),
  created_at timestamptz default now()
);
create unique index if not exists contact_ai_analysis_contact_id_key on contact_ai_analysis(contact_id);
alter table contact_ai_analysis enable row level security;
create policy "allow anon all" on contact_ai_analysis for all using (true) with check (true);

*/
