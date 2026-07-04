-- Inteligência Operacional → CODEX: achados de auditoria de código do projeto
-- Rodar manualmente no SQL Editor do Supabase (projeto não usa CLI/migrations automatizadas)
--
-- Diferente das outras auditorias, o CODEX não roda dentro do app (o browser não tem
-- acesso ao filesystem do repositório) — os achados são gerados pelo Claude Code
-- analisando o código-fonte e gravados aqui manualmente. Esta aba só exibe o resultado.

create table if not exists codex_audit_findings (
  id uuid primary key default gen_random_uuid(),
  run_id text not null,
  type text not null,        -- 'arquivo_orfao' | 'funcao_sem_uso' | 'componente_duplicado' | 'rota_morta' | 'tabela_sem_uso'
  path text,
  detail text,
  ignored boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_codex_audit_run on codex_audit_findings (run_id);
create index if not exists idx_codex_audit_type on codex_audit_findings (type, created_at desc);

alter table codex_audit_findings enable row level security;

create policy "allow all via service/anon key"
  on codex_audit_findings for all
  using (true)
  with check (true);
