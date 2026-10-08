-- 044_supplier_shadow_gate_ledger.sql
--
-- LAB-only visual Gate Ledger.
-- Immutable, token-gated writes and exact-identity reads; no direct table grants.
-- It stores only the LAB homologation analysis metadata.

begin;

create table if not exists public.supplier_shadow_gate_ledger (
  id uuid primary key default gen_random_uuid(),
  gate_run_key text not null,
  scope_key text not null,
  supplier text not null,
  drive_file_id text not null,
  image_sha256 text,
  canonical_family text not null,
  brand text not null,
  model text not null,
  category text not null,
  vision_model text,
  vision_proxy_route text not null,
  prompt_version text not null,
  prompt_sha256 text not null,
  execution_identity_sha256 text,
  model_json jsonb not null default '{}'::jsonb,
  validation_result jsonb not null,
  validation_status text not null,
  validation_error_code text,
  confidence numeric,
  cost_usd numeric(12,8),
  analyzed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint chk_supplier_shadow_gate_ledger_supplier
    check (supplier in ('MIA', 'VIVIAN')),
  constraint chk_supplier_shadow_gate_ledger_status
    check (validation_status in ('READY', 'REVIEW', 'ERROR')),
  constraint chk_supplier_shadow_gate_ledger_hashes
    check (
      (image_sha256 is null or image_sha256 ~ '^[a-f0-9]{64}$') and
      prompt_sha256 ~ '^[a-f0-9]{64}$' and
      (
        execution_identity_sha256 is null or
        execution_identity_sha256 ~ '^[a-f0-9]{64}$'
      )
    ),
  constraint chk_supplier_shadow_gate_ledger_confidence
    check (confidence is null or (confidence >= 0 and confidence <= 1)),
  constraint chk_supplier_shadow_gate_ledger_cost
    check (cost_usd is null or cost_usd >= 0),
  constraint chk_supplier_shadow_gate_ledger_proxy_route
    check (
      vision_proxy_route ~
        '^http://127[.]0[.]0[.]1:[0-9]{1,5}/api/supplier-harness-ocr-proxy$'
    ),
  constraint chk_supplier_shadow_gate_ledger_ready_identity
    check (
      validation_status <> 'READY' or
      (
        image_sha256 is not null and
        vision_model is not null and
        execution_identity_sha256 is not null
      )
    ),
  constraint chk_supplier_shadow_gate_ledger_model_json
    check (jsonb_typeof(model_json) = 'object'),
  constraint chk_supplier_shadow_gate_ledger_validation_json
    check (jsonb_typeof(validation_result) = 'object'),
  constraint uq_supplier_shadow_gate_ledger_idempotency
    unique nulls not distinct
      (gate_run_key, drive_file_id, execution_identity_sha256)
);

create index if not exists idx_supplier_shadow_gate_ledger_reusable
  on public.supplier_shadow_gate_ledger (
    drive_file_id,
    image_sha256,
    canonical_family,
    prompt_version,
    vision_model,
    execution_identity_sha256,
    analyzed_at desc
  )
  where validation_status = 'READY';

comment on table public.supplier_shadow_gate_ledger is
  'LAB-only immutable audit ledger for Supplier Shadow visual gates.';

alter table public.supplier_shadow_gate_ledger enable row level security;
revoke all on table public.supplier_shadow_gate_ledger
  from public, anon, authenticated, service_role;

create or replace function public.lab_supplier_gate_ledger_record(
  p_token text,
  p_gate_run_key text,
  p_scope_key text,
  p_supplier text,
  p_drive_file_id text,
  p_image_sha256 text,
  p_canonical_family text,
  p_brand text,
  p_model text,
  p_category text,
  p_vision_model text,
  p_vision_proxy_route text,
  p_prompt_version text,
  p_prompt_sha256 text,
  p_execution_identity_sha256 text,
  p_model_json jsonb,
  p_validation_result jsonb,
  p_validation_status text,
  p_validation_error_code text,
  p_confidence numeric,
  p_cost_usd numeric,
  p_analyzed_at timestamptz
)
returns table (
  gate_ledger_id uuid,
  inserted boolean,
  validation_status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
  v_inserted boolean := false;
  v_status text;
  v_created_at timestamptz;
  v_sensitive_scan text;
begin
  if encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <>
     'bd10d0ac064687a589531591e114671fdb37c1a37aa7fa64a506a1af05a8cd13'
  then
    return;
  end if;

  if p_gate_run_key is null or length(trim(p_gate_run_key)) = 0
     or length(p_gate_run_key) > 120
     or p_scope_key is null or p_scope_key !~ '^[A-Z0-9_]{1,120}$'
     or p_drive_file_id is null or length(p_drive_file_id) > 512
     or p_canonical_family is null or length(p_canonical_family) > 160
     or p_brand is null or length(p_brand) > 200
     or p_model is null or length(p_model) > 300
     or p_category is null or length(p_category) > 200
     or p_vision_proxy_route is null
     or p_prompt_version is null or length(p_prompt_version) > 200
     or p_prompt_sha256 is null or p_prompt_sha256 !~ '^[a-f0-9]{64}$'
  then
    raise exception 'invalid gate ledger context';
  end if;

  if p_image_sha256 is not null
     and p_image_sha256 !~ '^[a-f0-9]{64}$'
  then
    raise exception 'invalid image hash';
  end if;

  if p_execution_identity_sha256 is not null
     and p_execution_identity_sha256 !~ '^[a-f0-9]{64}$'
  then
    raise exception 'invalid execution identity hash';
  end if;

  if p_validation_status is null or p_validation_status not in ('READY', 'REVIEW', 'ERROR') then
    raise exception 'invalid gate validation status';
  end if;

  if p_validation_status = 'READY'
     and (
       p_image_sha256 is null or
       p_vision_model is null or length(p_vision_model) > 200 or
       p_execution_identity_sha256 is null
     )
  then
    raise exception 'ready gate identity is incomplete';
  end if;

  if p_vision_proxy_route !~
     '^http://127[.]0[.]0[.]1:[0-9]{1,5}/api/supplier-harness-ocr-proxy$'
  then
    raise exception 'invalid vision proxy route';
  end if;

  if p_confidence is not null and (p_confidence < 0 or p_confidence > 1) then
    raise exception 'invalid confidence';
  end if;

  if p_cost_usd is not null and p_cost_usd < 0 then
    raise exception 'invalid cost';
  end if;

  if jsonb_typeof(coalesce(p_model_json, '{}'::jsonb)) <> 'object'
     or (coalesce(p_model_json, '{}'::jsonb) -
       array['brand', 'canonical_family', 'model', 'category', 'color', 'confidence', 'family_match']
     ) <> '{}'::jsonb
  then
    raise exception 'model json contains unsupported fields';
  end if;

  if exists (
    select 1
    from jsonb_each(coalesce(p_model_json, '{}'::jsonb)) as item(key, value)
    where jsonb_typeof(item.value) not in ('string', 'number', 'boolean', 'null')
  ) then
    raise exception 'model json values must be scalar';
  end if;

  if p_validation_result is null
     or jsonb_typeof(p_validation_result) <> 'object'
     or (p_validation_result - array['status', 'error_code', 'values']) <> '{}'::jsonb
     or p_validation_result->>'status' <> p_validation_status
     or jsonb_typeof(p_validation_result->'values') <> 'object'
  then
    raise exception 'invalid validation result';
  end if;

  if exists (
    select 1
    from jsonb_each(p_validation_result->'values') as item(key, value)
    where
      item.key not in (
        'brand', 'canonical_family', 'detected_model',
        'category', 'visual_color', 'vision_confidence'
      )
      or jsonb_typeof(item.value) not in ('string', 'number', 'boolean', 'null')
  ) then
    raise exception 'validation result contains unsupported values';
  end if;

  v_sensitive_scan := concat_ws(
    ' ',
    p_gate_run_key,
    p_scope_key,
    p_supplier,
    p_drive_file_id,
    p_canonical_family,
    p_brand,
    p_model,
    p_category,
    p_vision_model,
    p_prompt_version,
    p_validation_error_code,
    p_model_json::text,
    p_validation_result::text
  );

  if v_sensitive_scan ~*
     '(bearer[[:space:]]+[A-Za-z0-9._~+/-]+=*|AIza[0-9A-Za-z_-]{30,}|(sk|gh[pousr]|xox[baprs]|github_pat)[_-][A-Za-z0-9._-]{16,}|eyJ[A-Za-z0-9_-]{10,}[.][A-Za-z0-9_-]{10,}[.][A-Za-z0-9_-]{10,}|-----BEGIN[[:space:]].*PRIVATE[[:space:]]+KEY-----)'
  then
    raise exception 'sensitive-looking gate data is not allowed';
  end if;

  insert into public.supplier_shadow_gate_ledger (
    gate_run_key,
    scope_key,
    supplier,
    drive_file_id,
    image_sha256,
    canonical_family,
    brand,
    model,
    category,
    vision_model,
    vision_proxy_route,
    prompt_version,
    prompt_sha256,
    execution_identity_sha256,
    model_json,
    validation_result,
    validation_status,
    validation_error_code,
    confidence,
    cost_usd,
    analyzed_at
  ) values (
    p_gate_run_key,
    p_scope_key,
    p_supplier,
    p_drive_file_id,
    p_image_sha256,
    p_canonical_family,
    p_brand,
    p_model,
    p_category,
    nullif(trim(p_vision_model), ''),
    p_vision_proxy_route,
    p_prompt_version,
    p_prompt_sha256,
    p_execution_identity_sha256,
    coalesce(p_model_json, '{}'::jsonb),
    p_validation_result,
    p_validation_status,
    nullif(trim(p_validation_error_code), ''),
    p_confidence,
    p_cost_usd,
    coalesce(p_analyzed_at, now())
  )
  on conflict (gate_run_key, drive_file_id, execution_identity_sha256)
  do nothing
  returning id, supplier_shadow_gate_ledger.validation_status,
            supplier_shadow_gate_ledger.created_at
  into v_id, v_status, v_created_at;

  if found then
    v_inserted := true;
  else
    select l.id, l.validation_status, l.created_at
    into v_id, v_status, v_created_at
    from public.supplier_shadow_gate_ledger l
    where l.gate_run_key = p_gate_run_key
      and l.drive_file_id = p_drive_file_id
      and l.execution_identity_sha256 is not distinct from p_execution_identity_sha256
    limit 1;
  end if;

  return query select v_id, v_inserted, v_status, v_created_at;
end;
$$;

create or replace function public.lab_supplier_gate_ledger_find_reusable(
  p_token text,
  p_supplier text,
  p_scope_key text,
  p_drive_file_id text,
  p_image_sha256 text,
  p_canonical_family text,
  p_brand text,
  p_model text,
  p_category text,
  p_vision_model text,
  p_vision_proxy_route text,
  p_prompt_version text,
  p_prompt_sha256 text,
  p_execution_identity_sha256 text
)
returns table (
  gate_ledger_id uuid,
  gate_run_key text,
  scope_key text,
  supplier text,
  drive_file_id text,
  image_sha256 text,
  canonical_family text,
  brand text,
  model text,
  category text,
  vision_model text,
  vision_proxy_route text,
  prompt_version text,
  prompt_sha256 text,
  execution_identity_sha256 text,
  model_json jsonb,
  validation_result jsonb,
  validation_status text,
  validation_error_code text,
  confidence numeric,
  cost_usd numeric,
  analyzed_at timestamptz,
  created_at timestamptz
)
language sql
security definer
set search_path = public, extensions
as $$
  select
    l.id,
    l.gate_run_key,
    l.scope_key,
    l.supplier,
    l.drive_file_id,
    l.image_sha256,
    l.canonical_family,
    l.brand,
    l.model,
    l.category,
    l.vision_model,
    l.vision_proxy_route,
    l.prompt_version,
    l.prompt_sha256,
    l.execution_identity_sha256,
    l.model_json,
    l.validation_result,
    l.validation_status,
    l.validation_error_code,
    l.confidence,
    l.cost_usd,
    l.analyzed_at,
    l.created_at
  from public.supplier_shadow_gate_ledger l
  where
    encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') =
      'bd10d0ac064687a589531591e114671fdb37c1a37aa7fa64a506a1af05a8cd13'
    and p_supplier is not null and l.supplier = p_supplier
    and p_scope_key is not null and l.scope_key = p_scope_key
    and p_drive_file_id is not null and l.drive_file_id = p_drive_file_id
    and p_image_sha256 is not null and l.image_sha256 = p_image_sha256
    and p_canonical_family is not null and l.canonical_family = p_canonical_family
    and p_brand is not null and l.brand = p_brand
    and p_model is not null and l.model = p_model
    and p_category is not null and l.category = p_category
    and p_vision_model is not null and l.vision_model = p_vision_model
    and p_vision_proxy_route is not null
    and l.vision_proxy_route = p_vision_proxy_route
    and p_prompt_version is not null and l.prompt_version = p_prompt_version
    and p_prompt_sha256 is not null and l.prompt_sha256 = p_prompt_sha256
    and p_execution_identity_sha256 is not null
    and l.execution_identity_sha256 = p_execution_identity_sha256
    and l.validation_status = 'READY'
  order by l.analyzed_at desc, l.created_at desc
  limit 1;
$$;

revoke all on function public.lab_supplier_gate_ledger_record(
  text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, jsonb, jsonb, text, text, numeric, numeric, timestamptz
) from public, anon, authenticated, service_role;

revoke all on function public.lab_supplier_gate_ledger_find_reusable(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated, service_role;

grant execute on function public.lab_supplier_gate_ledger_record(
  text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, jsonb, jsonb, text, text, numeric, numeric, timestamptz
) to anon;

grant execute on function public.lab_supplier_gate_ledger_find_reusable(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text
) to anon;

commit;
