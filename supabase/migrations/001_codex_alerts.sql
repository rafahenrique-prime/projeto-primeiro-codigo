-- CODEX Alerts — base para o CODEX virar supervisor proativo
-- Rodar manualmente no SQL Editor do Supabase (projeto não usa CLI/migrations automatizadas)

create table if not exists codex_alerts (
  id uuid primary key default gen_random_uuid(),
  type text not null,        -- 'gap_conhecimento' | 'produto_fallback' | 'conversa_abandonada' | 'lead_quente' | 'objecao' | 'produto_problema'
  severity text not null default 'info',  -- 'info' | 'atencao' | 'critico'
  conversation_id text,
  message text not null,
  data jsonb,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_codex_alerts_resolved on codex_alerts (resolved, created_at desc);
create index if not exists idx_codex_alerts_type on codex_alerts (type, created_at desc);

-- RLS básico (ajustar conforme política do projeto — demais tabelas usam anon key direto via REST)
alter table codex_alerts enable row level security;

create policy "allow all via service/anon key"
  on codex_alerts for all
  using (true)
  with check (true);
