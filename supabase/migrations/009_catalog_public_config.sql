-- Configuração do Catálogo Público — substitui o VISIBLE_FOLDERS hardcoded em catalogo-publico/index.html
-- Rodar manualmente no SQL Editor do Supabase (projeto não usa CLI/migrations automatizadas)

create table if not exists catalog_public_config (
  id int primary key default 1,
  visible_brands jsonb not null default '[]'::jsonb, -- [] = mostra todas as marcas
  updated_at timestamptz not null default now()
);

insert into catalog_public_config (id, visible_brands)
values (1, '[]'::jsonb)
on conflict (id) do nothing;

alter table catalog_public_config enable row level security;

create policy "allow all via service/anon key"
  on catalog_public_config for all
  using (true)
  with check (true);
