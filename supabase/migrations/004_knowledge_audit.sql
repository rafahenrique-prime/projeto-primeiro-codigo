-- Inteligência Operacional → Conhecimento: histórico de achados da auditoria da base CODEX
-- Rodar manualmente no SQL Editor do Supabase (projeto não usa CLI/migrations automatizadas)

create table if not exists knowledge_audit_findings (
  id uuid primary key default gen_random_uuid(),
  run_id text not null,
  type text not null,        -- 'duplicado' | 'semelhante' | 'obsoleto' | 'muito_curto' | 'contraditorio'
  entry_id_a bigint not null,
  entry_id_b bigint,
  title_a text,
  title_b text,
  score numeric,
  detail text,
  ignored boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_knowledge_audit_run on knowledge_audit_findings (run_id);
create index if not exists idx_knowledge_audit_type on knowledge_audit_findings (type, created_at desc);

alter table knowledge_audit_findings enable row level security;

create policy "allow all via service/anon key"
  on knowledge_audit_findings for all
  using (true)
  with check (true);
