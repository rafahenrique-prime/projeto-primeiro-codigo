-- 036_supplier_drive_scanner_lab_rpc.sql
--
-- LAB-only Drive Scanner gates.
-- Reads/writes only Supplier Shadow metadata through narrow SECURITY DEFINER
-- functions. No direct table grant is introduced.
--
-- Scanner token plaintext is never stored here; only SHA-256.

begin;

create or replace function public.lab_supplier_drive_state(
  p_token text,
  p_supplier_key text,
  p_canonical_family text
)
returns table (
  id uuid,
  drive_file_id text,
  content_hash text,
  active boolean,
  analysis_status text,
  visual_color text,
  vision_confidence numeric
)
language sql
security definer
set search_path = public, extensions
as $$
  select
    s.id,
    s.drive_file_id,
    s.content_hash,
    s.active,
    s.analysis_status,
    s.visual_color,
    s.vision_confidence
  from public.supplier_shadow_products s
  where
    encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') =
      '1f5806d7b369090858b27a42ee91ba669248f1147fc3494369b3db4cbb33a002'
    and s.supplier_key = p_supplier_key
    and s.canonical_family = p_canonical_family;
$$;

create or replace function public.lab_supplier_drive_upsert(
  p_token text,
  p_supplier_key text,
  p_drive_file_id text,
  p_drive_parent_id text,
  p_drive_path text,
  p_drive_url text,
  p_file_name text,
  p_mime_type text,
  p_content_hash text,
  p_brand text,
  p_canonical_family text,
  p_detected_model text,
  p_category text,
  p_run_id text
)
returns table (
  id uuid,
  change_type text,
  analysis_status text,
  active boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_existing public.supplier_shadow_products%rowtype;
  v_id uuid;
  v_change text;
  v_status text;
begin
  if encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <>
     '1f5806d7b369090858b27a42ee91ba669248f1147fc3494369b3db4cbb33a002'
  then
    return;
  end if;

  if p_supplier_key not in ('VIVIAN', 'MIA') then
    raise exception 'invalid supplier';
  end if;

  select *
  into v_existing
  from public.supplier_shadow_products s
  where s.supplier_key = p_supplier_key
    and s.drive_file_id = p_drive_file_id
  limit 1;

  if not found then
    insert into public.supplier_shadow_products (
      supplier_key,
      drive_file_id,
      drive_parent_id,
      drive_path,
      drive_url,
      file_name,
      mime_type,
      content_hash,
      brand,
      canonical_family,
      detected_model,
      category,
      search_text,
      vision_confidence,
      analysis_status,
      analysis_error_code,
      active,
      first_seen_at,
      last_seen_at,
      indexed_at,
      removed_at,
      last_seen_run_id,
      schema_version
    ) values (
      p_supplier_key,
      p_drive_file_id,
      p_drive_parent_id,
      p_drive_path,
      p_drive_url,
      coalesce(nullif(trim(p_file_name), ''), 'supplier-image'),
      p_mime_type,
      p_content_hash,
      nullif(trim(p_brand), ''),
      nullif(trim(p_canonical_family), ''),
      nullif(trim(p_detected_model), ''),
      nullif(trim(p_category), ''),
      lower(trim(concat_ws(
        ' ',
        p_brand,
        p_detected_model,
        p_canonical_family,
        p_category
      ))),
      null,
      'pending',
      null,
      true,
      now(),
      now(),
      null,
      null,
      p_run_id,
      1
    )
    returning supplier_shadow_products.id into v_id;

    v_change := 'new';
    v_status := 'pending';
  else
    -- First scanner baseline for already-curated rows: attach fingerprint
    -- without forcing a needless re-analysis.
    if v_existing.content_hash is null
       and v_existing.analysis_status = 'ready'
       and v_existing.visual_color is not null
    then
      update public.supplier_shadow_products s
      set
        drive_parent_id = p_drive_parent_id,
        drive_path = p_drive_path,
        drive_url = p_drive_url,
        file_name = coalesce(nullif(trim(p_file_name), ''), s.file_name),
        mime_type = coalesce(nullif(trim(p_mime_type), ''), s.mime_type),
        content_hash = p_content_hash,
        brand = coalesce(nullif(trim(p_brand), ''), s.brand),
        canonical_family = coalesce(nullif(trim(p_canonical_family), ''), s.canonical_family),
        detected_model = coalesce(nullif(trim(p_detected_model), ''), s.detected_model),
        category = coalesce(nullif(trim(p_category), ''), s.category),
        active = true,
        last_seen_at = now(),
        removed_at = null,
        last_seen_run_id = p_run_id
      where s.id = v_existing.id;

      v_id := v_existing.id;
      v_change := 'baseline';
      v_status := v_existing.analysis_status;

    elsif coalesce(v_existing.content_hash, '') <> coalesce(p_content_hash, '') then
      update public.supplier_shadow_products s
      set
        drive_parent_id = p_drive_parent_id,
        drive_path = p_drive_path,
        drive_url = p_drive_url,
        file_name = coalesce(nullif(trim(p_file_name), ''), s.file_name),
        mime_type = coalesce(nullif(trim(p_mime_type), ''), s.mime_type),
        content_hash = p_content_hash,
        brand = coalesce(nullif(trim(p_brand), ''), s.brand),
        canonical_family = coalesce(nullif(trim(p_canonical_family), ''), s.canonical_family),
        detected_model = coalesce(nullif(trim(p_detected_model), ''), s.detected_model),
        category = coalesce(nullif(trim(p_category), ''), s.category),
        visual_color = null,
        vision_confidence = null,
        analysis_status = 'pending',
        analysis_error_code = null,
        active = true,
        last_seen_at = now(),
        indexed_at = null,
        removed_at = null,
        last_seen_run_id = p_run_id
      where s.id = v_existing.id;

      v_id := v_existing.id;
      v_change := 'changed';
      v_status := 'pending';

    else
      update public.supplier_shadow_products s
      set
        active = true,
        last_seen_at = now(),
        removed_at = null,
        last_seen_run_id = p_run_id
      where s.id = v_existing.id;

      v_id := v_existing.id;
      v_change := case
        when v_existing.active = false then 'reactivated'
        else 'unchanged'
      end;
      v_status := v_existing.analysis_status;
    end if;
  end if;

  id := v_id;
  change_type := v_change;
  analysis_status := v_status;
  active := true;
  return next;
end;
$$;

create or replace function public.lab_supplier_drive_finalize(
  p_token text,
  p_supplier_key text,
  p_canonical_family text,
  p_seen_file_ids text[],
  p_run_id text
)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_count integer := 0;
begin
  if encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <>
     '1f5806d7b369090858b27a42ee91ba669248f1147fc3494369b3db4cbb33a002'
  then
    return 0;
  end if;

  update public.supplier_shadow_products s
  set
    active = false,
    removed_at = now(),
    last_seen_run_id = p_run_id
  where
    s.supplier_key = p_supplier_key
    and s.canonical_family = p_canonical_family
    and s.active = true
    and not (s.drive_file_id = any(coalesce(p_seen_file_ids, array[]::text[])));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.lab_supplier_drive_log_run(
  p_token text,
  p_run_id text,
  p_supplier_key text,
  p_status text,
  p_scanned integer,
  p_new integer,
  p_changed integer,
  p_unchanged integer,
  p_deactivated integer,
  p_summary jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <>
     '1f5806d7b369090858b27a42ee91ba669248f1147fc3494369b3db4cbb33a002'
  then
    return false;
  end if;

  if p_status not in ('completed', 'partial', 'failed') then
    raise exception 'invalid run status';
  end if;

  insert into public.supplier_shadow_sync_runs (
    run_id,
    supplier_key,
    trigger,
    status,
    started_at,
    finished_at,
    scanned_files,
    new_files,
    changed_files,
    unchanged_files,
    deactivated_files,
    analyzed_files,
    review_files,
    error_files,
    summary
  ) values (
    p_run_id,
    p_supplier_key,
    'drive_scanner_v1',
    p_status,
    now(),
    now(),
    greatest(coalesce(p_scanned, 0), 0),
    greatest(coalesce(p_new, 0), 0),
    greatest(coalesce(p_changed, 0), 0),
    greatest(coalesce(p_unchanged, 0), 0),
    greatest(coalesce(p_deactivated, 0), 0),
    0,
    0,
    0,
    p_summary
  )
  on conflict (run_id) do update set
    status = excluded.status,
    finished_at = excluded.finished_at,
    scanned_files = excluded.scanned_files,
    new_files = excluded.new_files,
    changed_files = excluded.changed_files,
    unchanged_files = excluded.unchanged_files,
    deactivated_files = excluded.deactivated_files,
    summary = excluded.summary;

  return true;
end;
$$;

revoke all on function public.lab_supplier_drive_state(text, text, text) from public;
revoke all on function public.lab_supplier_drive_upsert(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text
) from public;
revoke all on function public.lab_supplier_drive_finalize(
  text, text, text, text[], text
) from public;
revoke all on function public.lab_supplier_drive_log_run(
  text, text, text, text, integer, integer, integer, integer, integer, jsonb
) from public;

grant execute on function public.lab_supplier_drive_state(text, text, text)
  to anon, authenticated;
grant execute on function public.lab_supplier_drive_upsert(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text
) to anon, authenticated;
grant execute on function public.lab_supplier_drive_finalize(
  text, text, text, text[], text
) to anon, authenticated;
grant execute on function public.lab_supplier_drive_log_run(
  text, text, text, text, integer, integer, integer, integer, integer, jsonb
) to anon, authenticated;

commit;
