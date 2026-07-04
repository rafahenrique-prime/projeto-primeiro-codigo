-- Inteligência Operacional → Instagram: histórico de achados da auditoria de conversas
-- Rodar manualmente no SQL Editor do Supabase (projeto não usa CLI/migrations automatizadas)

create table if not exists instagram_audit_findings (
  id uuid primary key default gen_random_uuid(),
  run_id text not null,
  type text not null,        -- 'sem_resposta' | 'contato_duplicado' | 'sem_nome' | 'abandonada' | 'sem_interacao_recente'
  chat_id text,
  contact_name text,
  username text,
  detail text,
  ignored boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_instagram_audit_run on instagram_audit_findings (run_id);
create index if not exists idx_instagram_audit_type on instagram_audit_findings (type, created_at desc);

alter table instagram_audit_findings enable row level security;

create policy "allow all via service/anon key"
  on instagram_audit_findings for all
  using (true)
  with check (true);
