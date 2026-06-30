-- Motor de Objeções — Sprint 4
-- Rodar manualmente no SQL Editor do Supabase (mesma rotina do 001_codex_alerts.sql)

create table if not exists objections (
  id uuid primary key default gen_random_uuid(),
  category text not null,    -- 'preco' | 'frete' | 'confianca' | 'estoque_tamanho' | 'pagamento' | 'concorrencia'
  conversation_id text,
  channel text,
  raw_excerpt text,
  created_at timestamptz not null default now()
);

create index if not exists idx_objections_category on objections (category, created_at desc);
create index if not exists idx_objections_created on objections (created_at desc);

alter table objections enable row level security;

create policy "allow all via service/anon key"
  on objections for all
  using (true)
  with check (true);
