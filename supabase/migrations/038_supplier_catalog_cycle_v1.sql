-- 038_supplier_catalog_cycle_v1.sql
--
-- Supplier Catalog Cycle V1
-- - retry guard for Vision review items
-- - persistent top-level cycle ledger
-- - narrow token-gated cycle start/finish RPCs
--
-- No direct public table grants are added.

begin;

alter table public.supplier_shadow_products
  add column if not exists vision_attempt_count integer not null default 0,
  add column if not exists last_vision_attempt_at timestamptz;

alter table public.supplier_shadow_products
  drop constraint if exists chk_supplier_shadow_products_vision_attempt_count;

alter table public.supplier_shadow_products
  add constraint chk_supplier_shadow_products_vision_attempt_count
  check (vision_attempt_count >= 0);

create or replace function public.reset_supplier_vision_attempt_on_pending()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.analysis_status = 'pending'
     and (
       old.analysis_status is distinct from 'pending'
       or old.content_hash is distinct from new.content_hash
     )
  then
    new.vision_attempt_count := 0;
    new.last_vision_attempt_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_supplier_vision_attempt_reset
  on public.supplier_shadow_products;

create trigger trg_supplier_vision_attempt_reset
before update on public.supplier_shadow_products
for each row
execute function public.reset_supplier_vision_attempt_on_pending();

create or replace function public.lab_supplier_vision_queue(
  p_token text,
  p_limit integer default 3
)
returns table (
  id uuid,
  supplier_key text,
  drive_file_id text,
  drive_path text,
  drive_url text,
  file_name text,
  mime_type text,
  brand text,
  canonical_family text,
  detected_model text,
  category text,
  analysis_status text
)
language sql
security definer
set search_path = public, extensions
as $$
  select
    s.id,
    s.supplier_key,
    s.drive_file_id,
    s.drive_path,
    s.drive_url,
    s.file_name,
    s.mime_type,
    s.brand,
    s.canonical_family,
    s.detected_model,
    s.category,
    s.analysis_status
  from public.supplier_shadow_products s
  where
    encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') =
      '3718b30f28081b8323e645d895ad061f351f4e5efbf36d7b1254646281a0c737'
    and s.active = true
    and (
      s.analysis_status = 'pending'
      or (
        s.analysis_status = 'review'
        and s.vision_attempt_count < 2
        and (
          s.last_vision_attempt_at is null
          or s.last_vision_attempt_at <= now() - interval '24 hours'
        )
      )
    )
  order by
    case when s.analysis_status = 'pending' then 0 else 1 end,
    s.first_seen_at asc
  limit greatest(1, least(coalesce(p_limit, 3), 10));
$$;

create or replace function public.lab_supplier_vision_apply(
  p_token text,
  p_id uuid,
  p_brand text,
  p_canonical_family text,
  p_detected_model text,
  p_category text,
  p_visual_color text,
  p_vision_confidence numeric,
  p_analysis_status text,
  p_error_code text default null
)
returns table (
  id uuid,
  supplier_key text,
  canonical_family text,
  detected_model text,
  visual_color text,
  vision_confidence numeric,
  analysis_status text,
  analysis_error_code text,
  indexed_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <>
     '3718b30f28081b8323e645d895ad061f351f4e5efbf36d7b1254646281a0c737'
  then
    return;
  end if;

  if p_analysis_status not in ('ready', 'review', 'error') then
    raise exception 'invalid analysis status';
  end if;

  if p_vision_confidence is not null
     and (p_vision_confidence < 0 or p_vision_confidence > 1)
  then
    raise exception 'invalid vision confidence';
  end if;

  update public.supplier_shadow_products s
  set
    brand = nullif(trim(p_brand), ''),
    canonical_family = nullif(trim(p_canonical_family), ''),
    detected_model = nullif(trim(p_detected_model), ''),
    category = nullif(trim(p_category), ''),
    visual_color = nullif(trim(p_visual_color), ''),
    vision_confidence = p_vision_confidence,
    analysis_status = p_analysis_status,
    analysis_error_code = nullif(trim(coalesce(p_error_code, '')), ''),
    indexed_at = case
      when p_analysis_status = 'ready' then now()
      else s.indexed_at
    end,
    vision_attempt_count = s.vision_attempt_count + 1,
    last_vision_attempt_at = now()
  where s.id = p_id
  returning
    s.id,
    s.supplier_key,
    s.canonical_family,
    s.detected_model,
    s.visual_color,
    s.vision_confidence,
    s.analysis_status,
    s.analysis_error_code,
    s.indexed_at
  into
    id,
    supplier_key,
    canonical_family,
    detected_model,
    visual_color,
    vision_confidence,
    analysis_status,
    analysis_error_code,
    indexed_at;

  return next;
end;
$$;

create table if not exists public.supplier_catalog_cycle_runs (
  run_id uuid primary key default gen_random_uuid(),
  cycle_key text not null unique,
  trigger text not null,
  status text not null default 'running',
  max_changes smallint not null,
  scope_order jsonb not null default '[]'::jsonb,
  scanner_summary jsonb,
  vision_summary jsonb,
  vision_ready_count integer not null default 0,
  vision_review_count integer not null default 0,
  vision_error_count integer not null default 0,
  vision_cost_usd numeric(12,8),
  error_code text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,

  constraint chk_supplier_catalog_cycle_runs_status
    check (status in ('running', 'completed', 'partial', 'failed')),

  constraint chk_supplier_catalog_cycle_runs_max_changes
    check (max_changes between 1 and 3),

  constraint chk_supplier_catalog_cycle_runs_counts
    check (
      vision_ready_count >= 0 and
      vision_review_count >= 0 and
      vision_error_count >= 0
    )
);

comment on table public.supplier_catalog_cycle_runs is
  'Ledger do ciclo automático LAB: Drive Scanner -> Vision Worker. Não contém conversa de cliente.';

alter table public.supplier_catalog_cycle_runs enable row level security;
revoke all on table public.supplier_catalog_cycle_runs
  from public, anon, authenticated;

create or replace function public.lab_supplier_cycle_start(
  p_token text,
  p_cycle_key text,
  p_trigger text,
  p_max_changes integer,
  p_scope_order jsonb
)
returns table (
  run_id uuid,
  accepted boolean,
  status text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_run_id uuid;
  v_status text;
begin
  if encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <>
     'bd10d0ac064687a589531591e114671fdb37c1a37aa7fa64a506a1af05a8cd13'
  then
    return;
  end if;

  if p_max_changes < 1 or p_max_changes > 3 then
    raise exception 'invalid max_changes';
  end if;

  insert into public.supplier_catalog_cycle_runs (
    cycle_key,
    trigger,
    status,
    max_changes,
    scope_order
  ) values (
    p_cycle_key,
    coalesce(nullif(trim(p_trigger), ''), 'unknown'),
    'running',
    p_max_changes,
    coalesce(p_scope_order, '[]'::jsonb)
  )
  on conflict (cycle_key) do nothing
  returning supplier_catalog_cycle_runs.run_id,
            supplier_catalog_cycle_runs.status
  into v_run_id, v_status;

  if found then
    run_id := v_run_id;
    accepted := true;
    status := v_status;
    return next;
    return;
  end if;

  select c.run_id, c.status
  into v_run_id, v_status
  from public.supplier_catalog_cycle_runs c
  where c.cycle_key = p_cycle_key
  limit 1;

  run_id := v_run_id;
  accepted := false;
  status := v_status;
  return next;
end;
$$;

create or replace function public.lab_supplier_cycle_finish(
  p_token text,
  p_run_id uuid,
  p_status text,
  p_scanner_summary jsonb,
  p_vision_summary jsonb,
  p_vision_ready_count integer,
  p_vision_review_count integer,
  p_vision_error_count integer,
  p_vision_cost_usd numeric,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <>
     'bd10d0ac064687a589531591e114671fdb37c1a37aa7fa64a506a1af05a8cd13'
  then
    return false;
  end if;

  if p_status not in ('completed', 'partial', 'failed') then
    raise exception 'invalid cycle status';
  end if;

  update public.supplier_catalog_cycle_runs c
  set
    status = p_status,
    scanner_summary = p_scanner_summary,
    vision_summary = p_vision_summary,
    vision_ready_count = greatest(coalesce(p_vision_ready_count, 0), 0),
    vision_review_count = greatest(coalesce(p_vision_review_count, 0), 0),
    vision_error_count = greatest(coalesce(p_vision_error_count, 0), 0),
    vision_cost_usd = p_vision_cost_usd,
    error_code = nullif(trim(coalesce(p_error_code, '')), ''),
    finished_at = now()
  where c.run_id = p_run_id;

  return found;
end;
$$;

revoke all on function public.lab_supplier_cycle_start(
  text, text, text, integer, jsonb
) from public;
revoke all on function public.lab_supplier_cycle_finish(
  text, uuid, text, jsonb, jsonb, integer, integer, integer, numeric, text
) from public;

grant execute on function public.lab_supplier_cycle_start(
  text, text, text, integer, jsonb
) to anon, authenticated;
grant execute on function public.lab_supplier_cycle_finish(
  text, uuid, text, jsonb, jsonb, integer, integer, integer, numeric, text
) to anon, authenticated;

commit;
