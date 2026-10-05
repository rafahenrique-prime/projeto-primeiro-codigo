-- 033_supplier_shadow_v1.sql
--
-- Supplier Shadow V1 — catálogo interno de fornecedores da PRIME.
--
-- Objetivo:
--   manter VIVIAN e MIA pesquisáveis sem misturar fornecedor com o Mirror
--   oficial da PRIME (shadow_products/shadow_product_variations).
--
-- Segurança:
--   RLS habilitada e ZERO policy pública. anon/authenticated/public sem
--   qualquer privilégio. Leitura/escrita futura somente server-side com
--   SUPABASE_SECRET_KEY / service_role.
--
-- Operação:
--   PRIME BOOT fará upsert por (supplier_key, drive_file_id), usando
--   content_hash + file_modified_at para evitar reanalisar arquivos iguais.
--   Remoção é soft-delete via active=false / removed_at.
--
-- IMPORTANTE:
--   esta migration é ADITIVA. Não altera shadow_products, products,
--   GABY OFICIAL, Story atual, GPTMaker ou qualquer tabela de produção
--   existente.
--
-- Nesta etapa o arquivo é criado e testado, mas NÃO aplicado permanentemente
-- sem gate separado.

begin;

create table public.supplier_catalog_sources (
  supplier_key        text primary key,
  display_name        text not null,
  search_priority     smallint not null,
  central_folder_name text not null,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint chk_supplier_catalog_sources_key
    check (supplier_key in ('VIVIAN', 'MIA')),

  constraint chk_supplier_catalog_sources_priority
    check (search_priority in (2, 3))
);

comment on table public.supplier_catalog_sources is
  'Fontes internas do Supplier Shadow. Ordem comercial: PRIME=1 fora desta tabela; VIVIAN=2; MIA=3.';

comment on column public.supplier_catalog_sources.central_folder_name is
  'Nome da pasta central mantida pelo PRIME BOOT dentro de IGNITE PRIME V2; não é URL pública.';

insert into public.supplier_catalog_sources
  (supplier_key, display_name, search_priority, central_folder_name)
values
  ('VIVIAN', '001-FORNECEDOR VIVIAN', 2, '001-FORNECEDOR VIVIAN'),
  ('MIA',    '002-FORNECEDOR MIA',    3, '002-FORNECEDOR MIA');

create table public.supplier_shadow_sync_runs (
  run_id              text primary key,
  supplier_key        text not null references public.supplier_catalog_sources(supplier_key),
  trigger             text not null default 'prime_boot',
  status              text not null default 'running',
  started_at          timestamptz not null default now(),
  finished_at         timestamptz,
  scanned_files       integer not null default 0,
  new_files           integer not null default 0,
  changed_files       integer not null default 0,
  unchanged_files     integer not null default 0,
  deactivated_files   integer not null default 0,
  analyzed_files      integer not null default 0,
  review_files        integer not null default 0,
  error_files         integer not null default 0,
  summary             jsonb,

  constraint chk_supplier_shadow_sync_runs_status
    check (status in ('running', 'completed', 'partial', 'failed')),

  constraint chk_supplier_shadow_sync_runs_counts
    check (
      scanned_files >= 0 and
      new_files >= 0 and
      changed_files >= 0 and
      unchanged_files >= 0 and
      deactivated_files >= 0 and
      analyzed_files >= 0 and
      review_files >= 0 and
      error_files >= 0
    )
);

comment on table public.supplier_shadow_sync_runs is
  'Ledger de sincronização VIVIAN/MIA. Não contém conversa de cliente; só contadores e resumo operacional.';

create table public.supplier_shadow_products (
  id                   uuid primary key default gen_random_uuid(),
  supplier_key         text not null references public.supplier_catalog_sources(supplier_key),

  drive_file_id        text not null,
  drive_parent_id      text,
  drive_path           text,
  drive_url            text,
  file_name            text not null,
  mime_type            text,
  content_hash         text,
  file_modified_at     timestamptz,

  brand                text,
  canonical_family     text,
  detected_model       text,
  category             text,
  visual_color         text,
  gender_hint          text,
  search_text          text not null default '',

  vision_confidence    numeric(5,4),
  analysis_status      text not null default 'pending',
  analysis_error_code  text,

  active               boolean not null default true,
  first_seen_at        timestamptz not null default now(),
  last_seen_at         timestamptz not null default now(),
  indexed_at           timestamptz,
  removed_at           timestamptz,
  last_seen_run_id     text references public.supplier_shadow_sync_runs(run_id),
  schema_version       smallint not null default 1,

  constraint supplier_shadow_products_file_key
    unique (supplier_key, drive_file_id),

  constraint chk_supplier_shadow_products_analysis_status
    check (analysis_status in ('pending', 'ready', 'review', 'error')),

  constraint chk_supplier_shadow_products_confidence
    check (
      vision_confidence is null or
      (vision_confidence >= 0 and vision_confidence <= 1)
    ),

  constraint chk_supplier_shadow_products_schema_version
    check (schema_version >= 1)
);

comment on table public.supplier_shadow_products is
  'Shadow interno dos catálogos VIVIAN/MIA. Uma linha representa um arquivo do Drive. Nunca vira estoque oficial PRIME.';

comment on column public.supplier_shadow_products.canonical_family is
  'Família comercial normalizada, ex.: NIKE_AIR_FORCE_1. Pode ser null enquanto pending/review.';

comment on column public.supplier_shadow_products.analysis_status is
  'pending=aguarda visão; ready=apto para busca; review=precisa revisão; error=falha técnica. Runtime V1 só usa ready.';

comment on column public.supplier_shadow_products.active is
  'Presença atual na pasta central. active=true significa candidato comercial, não estoque em tempo real.';

create index supplier_shadow_products_source_active_idx
  on public.supplier_shadow_products (supplier_key, active, last_seen_at desc);

create index supplier_shadow_products_family_active_idx
  on public.supplier_shadow_products (canonical_family, supplier_key)
  where active = true and analysis_status = 'ready';

create index supplier_shadow_products_content_hash_idx
  on public.supplier_shadow_products (supplier_key, content_hash)
  where content_hash is not null;

create index supplier_shadow_sync_runs_source_started_idx
  on public.supplier_shadow_sync_runs (supplier_key, started_at desc);

alter table public.supplier_catalog_sources enable row level security;
alter table public.supplier_shadow_sync_runs enable row level security;
alter table public.supplier_shadow_products enable row level security;

-- Defesa em profundidade: mesmo que alguém adicione policy pública por engano,
-- anon/authenticated continuam sem privilégio de tabela.
revoke all on table public.supplier_catalog_sources from public, anon, authenticated;
revoke all on table public.supplier_shadow_sync_runs from public, anon, authenticated;
revoke all on table public.supplier_shadow_products from public, anon, authenticated;

commit;
