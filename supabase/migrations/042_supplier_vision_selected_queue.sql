-- 042_supplier_vision_selected_queue.sql
--
-- LAB-only exact-selection queue for manual supplier homologation.
-- Keeps the existing global queue untouched.
-- No direct table grants are added.

begin;

create or replace function public.lab_supplier_vision_queue_selected(
  p_token text,
  p_limit integer default 3,
  p_drive_file_ids text[] default '{}'::text[]
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
    and s.drive_file_id = any(coalesce(p_drive_file_ids, '{}'::text[]))
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
  order by array_position(p_drive_file_ids, s.drive_file_id)
  limit greatest(1, least(coalesce(p_limit, 3), 5));
$$;

revoke all on function public.lab_supplier_vision_queue_selected(
  text, integer, text[]
) from public;

grant execute on function public.lab_supplier_vision_queue_selected(
  text, integer, text[]
) to anon, authenticated;

commit;
