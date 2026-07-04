-- Inteligência Operacional → Aprendizagem: histórico de achados da auditoria de agent_learnings
-- Rodar manualmente no SQL Editor do Supabase (projeto não usa CLI/migrations automatizadas)

create table if not exists learnings_audit_findings (
  id uuid primary key default gen_random_uuid(),
  run_id text not null,
  type text not null,        -- 'duplicada' | 'conflitante' | 'muito_curta'
  entry_id_a uuid not null,
  entry_id_b uuid,
  content_a text,
  content_b text,
  score numeric,
  detail text,
  ignored boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_learnings_audit_run on learnings_audit_findings (run_id);
create index if not exists idx_learnings_audit_type on learnings_audit_findings (type, created_at desc);

alter table learnings_audit_findings enable row level security;

create policy "allow all via service/anon key"
  on learnings_audit_findings for all
  using (true)
  with check (true);
