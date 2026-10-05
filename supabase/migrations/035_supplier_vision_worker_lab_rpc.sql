-- 035_supplier_vision_worker_lab_rpc.sql
--
-- LAB-only queue + narrow write gate for Supplier Vision Worker V1.
-- No direct table grants are added. The worker can only:
--   1) read a small queue of active pending/review supplier rows;
--   2) write back analysis fields for one row.
--
-- Plaintext worker token is NOT stored here; only SHA-256.

begin;

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
    and s.analysis_status in ('pending', 'review')
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
    updated_at = now()
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

revoke all on function public.lab_supplier_vision_queue(text, integer) from public;
revoke all on function public.lab_supplier_vision_apply(
  text, uuid, text, text, text, text, text, numeric, text, text
) from public;

grant execute on function public.lab_supplier_vision_queue(text, integer)
  to anon, authenticated;

grant execute on function public.lab_supplier_vision_apply(
  text, uuid, text, text, text, text, text, numeric, text, text
) to anon, authenticated;

commit;
