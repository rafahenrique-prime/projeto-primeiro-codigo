-- Inteligência Operacional → Sistema: histórico de checagens de saúde técnica
-- Rodar manualmente no SQL Editor do Supabase (projeto não usa CLI/migrations automatizadas)

create table if not exists system_health_runs (
  id uuid primary key default gen_random_uuid(),
  run_id text not null,
  check_id text not null,   -- 'supabase' | 'whatsapp' | 'instagram' | 'groq' | 'webhook' | 'filas'
  label text not null,
  status text not null,     -- 'ok' | 'error' | 'warn' | 'n/a'
  detail text,
  latency_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_system_health_run on system_health_runs (run_id);
create index if not exists idx_system_health_check on system_health_runs (check_id, created_at desc);

alter table system_health_runs enable row level security;

create policy "allow all via service/anon key"
  on system_health_runs for all
  using (true)
  with check (true);
