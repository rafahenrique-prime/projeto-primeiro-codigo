-- 034_supplier_shadow_lab_read_rpc.sql
--
-- LAB-only read gate for Supplier Shadow.
-- Exposes ONLY active+ready supplier rows through a SECURITY DEFINER RPC.
-- Authentication is a high-entropy token whose SHA-256 hash is embedded here;
-- plaintext token is never stored in Git or Supabase.
--
-- This does not grant SELECT on supplier_shadow_products to anon/authenticated.

begin;

create or replace function public.lab_supplier_shadow_ready(p_token text)
returns table (
  id uuid,
  supplier_key text,
  drive_file_id text,
  drive_path text,
  drive_url text,
  file_name text,
  brand text,
  canonical_family text,
  detected_model text,
  category text,
  visual_color text,
  gender_hint text,
  vision_confidence numeric,
  analysis_status text,
  active boolean
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
    s.brand,
    s.canonical_family,
    s.detected_model,
    s.category,
    s.visual_color,
    s.gender_hint,
    s.vision_confidence,
    s.analysis_status,
    s.active
  from public.supplier_shadow_products s
  where
    encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') =
      'c0dd71a627cab8e08c1710ac5b7228aaafc07674ea73c934fdaf6073d42ff035'
    and s.active = true
    and s.analysis_status = 'ready'
  order by s.supplier_key, s.canonical_family, s.last_seen_at desc
  limit 2500;
$$;

revoke all on function public.lab_supplier_shadow_ready(text) from public;
grant execute on function public.lab_supplier_shadow_ready(text) to anon, authenticated;

commit;
